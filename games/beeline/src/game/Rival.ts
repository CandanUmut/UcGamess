import { Field } from '../sim/Field.ts';
import { Patch } from '../sim/Patch.ts';
import { TUNING } from '../config/tuning.ts';
import { deriveStats } from './Upgrades.ts';
import { noModifiers } from './Items.ts';
import { Forager, type ForagerSkill } from './Forager.ts';

/**
 * A rival wasp colony on the player's meadow.
 *
 * It plays the player's own game by the player's own rules: lays lines from
 * its nest, bends them round the same hedges, scouts its own mist, and fills
 * its own jar from the same flowers — one shared pool of honey, so every trip
 * it makes is honey the player will never have. Its raiders (on boards with
 * a wave) set out from its nest and carry what they steal home to its jar.
 *
 * The player wins by filling their jar first. That is the whole pressure: not
 * a clock, but someone else who wants the same flowers.
 */
export interface RivalSpec {
  x: number;
  y: number;
  bees: number;
  lines: number;
  skill: keyof typeof RIVAL_SKILL;
  /** Whether the wasps raid the player's hive. Off until raiding is taught. */
  raids?: boolean;
}

/**
 * How well the wasps play. Plain human-factors numbers, the same kind the
 * playtest personas use; harder rivals think faster and waste less, they are
 * never given bees out of nowhere.
 */
export const RIVAL_SKILL = {
  dozy: { reaction: 0.7, reactionSd: 0.15, aimSd: 30, thinkRate: 0.45, sloppiness: 0.55 },
  steady: { reaction: 0.5, reactionSd: 0.1, aimSd: 22, thinkRate: 0.8, sloppiness: 0.3 },
  sharp: {
    reaction: 0.35,
    reactionSd: 0.08,
    aimSd: 14,
    thinkRate: 1.2,
    sloppiness: 0.12,
  },
} as const satisfies Record<string, ForagerSkill>;

export class Rivalry {
  readonly field: Field;
  readonly spec: RivalSpec;
  private readonly ai: Forager;

  private board: Field | null = null;
  /** The wasps' nest as a raid target: its honey is their jar. */
  private waspNest: Patch | null = null;
  /** The player's hive as a raid target: its honey is the player's jar. */
  private playerNest: Patch | null = null;
  /** Honey raided this step, each way, for the floating numbers. */
  raided = { fromWasps: 0, fromPlayer: 0 };

  constructor(spec: RivalSpec) {
    this.spec = spec;
    this.field = new Field({ x: spec.x, y: spec.y });
    this.ai = new Forager(RIVAL_SKILL[spec.skill], {
      glints: false,
      raids: spec.raids ?? false,
      contested: () => {
        const worked = new Set<Patch>();
        for (const r of this.board?.routes ?? []) if (r.target) worked.add(r.target);
        return worked;
      },
    });
  }

  /** Sets the rival up on `board`, which must have begun its day. */
  begin(board: Field, opts: { fog: boolean; beeSpeedBonus: number }): void {
    const m = noModifiers();
    m.extraLines = this.spec.lines - TUNING.route.maxCount;
    m.extraBees = this.spec.bees - TUNING.bee.baseCount;
    m.beeSpeedBonus = opts.beeSpeedBonus;
    if (!opts.fog) m.scoutRadius = 2000;
    this.field.setStats(deriveStats(m));
    // A flower pays the same per trip to either side. Generated boards pay
    // more for flowers far from the player's hive, which put the richest ones
    // on the wasps' doorstep.
    for (const patch of board.patches) patch.distanceMultiplier = 1;
    this.field.beginRivalDay(board, m);
    this.board = board;
    // Each hive is a target on the shared board: a line to the other side's
    // hive is a raid on its jar.
    this.waspNest = new Patch(this.spec.x, this.spec.y, 0, 'nest');
    this.playerNest = new Patch(board.hiveX, board.hiveY, 0, 'nest');
    for (const nest of [this.waspNest, this.playerNest]) {
      nest.discovered = true;
      nest.bloomT = 1;
      board.patches.push(nest);
      this.field.remember(nest);
    }
    this.syncNests();
    this.ai.beginDay();
    board.raidFrom = { x: this.spec.x, y: this.spec.y };
    board.onStolen = (honey) => {
      this.field.honey += honey;
    };
  }

  /** True while any wasp is still flying honey home. */
  get carrying(): boolean {
    return this.field.bees.some((b) => b.carrying > 0);
  }

  /**
   * How the race ends, or null while it is on: a jar filled, or the meadow
   * ran dry with neither full — then the fuller jar wins.
   */
  verdict(board: Field, goal: number): 'won' | 'beaten' | null {
    if (board.honey >= goal) return 'won';
    if (this.field.honey >= goal) return 'beaten';
    // The meadow is dry once every flower is: raids alone could pass the
    // same honey back and forth for ever, so the fuller jar wins then.
    const golden = board.patches.some((p) => p.kind === 'night' && p.alive);
    if (board.cleared && !golden) {
      return board.honey >= this.field.honey ? 'won' : 'beaten';
    }
    return null;
  }

  /**
   * Settles raids into the jars, then sets each nest's honey to its jar. A
   * nest's honey is drained by the other side's raiders during their step;
   * whatever left it, left the jar.
   */
  private syncNests(): void {
    const board = this.board;
    if (!board || !this.waspNest || !this.playerNest) return;
    const fromWasps = Math.max(0, this.waspNestPool - this.waspNest.pool);
    const fromPlayer = Math.max(0, this.playerNestPool - this.playerNest.pool);
    this.field.honey = Math.max(0, this.field.honey - fromWasps);
    board.honey = Math.max(0, board.honey - fromPlayer);
    this.raided = { fromWasps, fromPlayer };
    for (const [nest, honey] of [
      [this.waspNest, this.field.honey],
      [this.playerNest, board.honey],
    ] as const) {
      nest.pool = honey;
      nest.maxPool = Math.max(nest.maxPool, honey);
      nest.alive = true;
    }
    this.waspNestPool = this.waspNest.pool;
    this.playerNestPool = this.playerNest.pool;
  }

  private waspNestPool = 0;
  private playerNestPool = 0;

  step(dt: number): void {
    this.ai.step(this.field, dt);
    this.field.step(dt);
    this.syncNests();
    // Nothing on screen reads a rival's events; drop them so they never pile up.
    this.field.drainEvents();
  }
}

/** Unhooks a board from any rival it had. */
export function clearRival(board: Field): void {
  board.raidFrom = null;
  board.onStolen = null;
}
