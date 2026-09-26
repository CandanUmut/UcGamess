import { COLORS, TUNING } from '../config/tuning.ts';
import { Bee } from './Bee.ts';
import { Patch, type PatchKind } from './Patch.ts';
import { Route } from './Route.ts';
import { Wasp, type WaspKind } from './Wasp.ts';
import { RaidClock } from './Raid.ts';
import { Maze } from './Maze.ts';
import { slideAlongWalls, type WallSlide } from './deflect.ts';
import { Fog } from './Fog.ts';
import { coordsLength, type Polyline, type SamplePoint } from './polyline.ts';
import { deriveStats, type DerivedStats } from '../game/Upgrades.ts';
import { dayQuota, type DayFeatures, type TreasurePlan } from '../game/DayCycle.ts';
import { noModifiers, type RunModifiers } from '../game/Items.ts';

const scratch: SamplePoint = { x: 0, y: 0, tx: 0, ty: 0 };

/**
 * The playable board, in design units.
 *
 * Same as the canvas: the map got bigger by moving the hive into a corner
 * rather than by growing the world and zooming out. Zooming would have shrunk a
 * flower's reach ring below what a thumb can reliably hit, which the design
 * rules treat as a rejection cause, and fog makes an unlit 1280x720 board feel
 * far larger than a lit one ever did.
 */
export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 720;
/** Top strip reserved for the HUD; nothing spawns under it. */
const HUD_MARGIN = 110;
/**
 * Gap between the maze and the edge of the board.
 *
 * Sized so a cell centre always has room for a flower's whole reach ring. The
 * ring is what the player aims at, and one running off the edge is unaimable at
 * exactly the moment it matters — with the maze flush to the board, the
 * outermost cell centres sat 80px in and the ring needed 85.
 */
const MAZE_INSET = 30;

/**
 * How far a flower is nudged off its cell centre, as a fraction of the cell.
 *
 * Purely so a board does not read as a grid of dots. Named rather than inlined
 * because the day-one light rule has to subtract this same envelope: checking a
 * cell *centre* for light and then jittering the flower out of it is how a
 * teaching day ends up with an invisible flower, which is exactly what
 * happened.
 */
const PATCH_JITTER = 0.14;

/**
 * The swarm a raid can never take you below.
 *
 * Without a floor a long raid on a bad day leaves the hive with nothing to fly
 * any route at all, and the player is left watching an empty board until dusk.
 * A hive that is badly hurt still has to be a hive that can be played.
 */
const MIN_SWARM = 4;

/**
 * How far from the hive its own dawn light actually *discovers*, not merely
 * brightens.
 *
 * Reveal falls off linearly to `fog.edgeReveal` at the rim while discovery
 * needs `fog.discoverAt`, so the useful radius is meaningfully smaller than the
 * sight radius — 330 against 420 at the current tuning. Getting these two
 * confused is what once shipped a completely dark day one.
 */
function hiveDiscoveryRadius(): number {
  const { discoverAt, edgeReveal } = TUNING.fog;
  return TUNING.hive.sightRadius * ((1 - discoverAt) / (1 - edgeReveal));
}

export type TreasureKind = 'honey' | 'bees';

/** Something hidden in the mist, collected the moment a bee's light reaches it. */
export interface Treasure {
  x: number;
  y: number;
  kind: TreasureKind;
  amount: number;
  found: boolean;
}

export interface FieldStats {
  honey: number;
  bees: number;
  routes: number;
  laden: number;
  collecting: number;
}

/** Things worth reacting to visually or audibly. Drained once per frame. */
export interface FieldEvents {
  /** Positions where nectar was picked up this step. */
  collected: Array<{ x: number; y: number; amount: number }>;
  /** Honey banked at the hive this step. The score, arriving. */
  deposited: number;
  /** Positions where bees were scattered by a wasp. */
  scattered: Array<{ x: number; y: number }>;
  /** Where a new line was pressed into a wall and turned along it. */
  deflected: Array<{ x: number; y: number }>;
  /** Flowers found this step. Discovery is the reward for exploring. */
  found: Array<{ x: number; y: number; honey: number; bonus: number; royal: boolean }>;
  /** Treasure picked up in the mist: a honey pot or a lost swarm. */
  treasure: Array<{ x: number; y: number; kind: TreasureKind; amount: number }>;
  /** A raid was announced this step, at the edge it will come from. */
  raidWarning: { x: number; y: number; size: number } | null;
  /** A tap landed on a wasp here. */
  struck: Array<{ x: number; y: number }>;
  /** A wasp was beaten off here, and paid this bounty. */
  waspDown: Array<{ x: number; y: number; bounty: number }>;
  /** Honey taken by raiders this step. */
  stolen: number;
  /** Wasps that arrived on the board this step. */
  raidLanded: number;
  /** A line was laid, ending here. */
  lineLaid: Array<{ x: number; y: number; connected: boolean }>;
  /** A line was dropped to make room for a new one. */
  replaced: Array<{ x: number; y: number }>;
  /** A flower worked dry: its line retires and the slot comes free. */
  drained: Array<{ x: number; y: number }>;
  /** A line that reached nothing gave up and retired. */
  fizzled: Array<{ x: number; y: number }>;
  /** Golden blooms that closed before anyone reached them. */
  wilted: Array<{ x: number; y: number; honey: number }>;
  /** Golden blooms that opened this step. */
  bloomed: Array<{ x: number; y: number }>;
  /** Bees driven out of the swarm for the day. */
  beesLost: Array<{ x: number; y: number }>;
  /** Every ordinary flower on the board is dry. The day can end early. */
  cleared: boolean;
  /** The Busy Hive multiplier reached a new whole tier (2..max). */
  comboUp: number;
  /** The multiplier slipped below a whole tier. */
  comboDown: number;
}

function emptyEvents(): FieldEvents {
  return {
    collected: [],
    deposited: 0,
    scattered: [],
    deflected: [],
    found: [],
    treasure: [],
    raidWarning: null,
    struck: [],
    waspDown: [],
    stolen: 0,
    raidLanded: 0,
    lineLaid: [],
    replaced: [],
    drained: [],
    fizzled: [],
    wilted: [],
    bloomed: [],
    beesLost: [],
    cleared: false,
    comboUp: 0,
    comboDown: 0,
  };
}

/** Where a line would start, if the press at a point began one. */
export interface LineStart {
  x: number;
  y: number;
  /** The line being carried on, or null for a fresh one from the hive. */
  route: Route | null;
}

/** A line as it would be laid, for the preview and for committing. */
export interface LinePlan {
  start: LineStart;
  /** The path, after aim assist and sliding along walls. */
  coords: number[];
  /** The flower it ends on, if it ends on one. */
  target: Patch | null;
  /** Where it first ran into a wall, if it did. */
  contact: { x: number; y: number } | null;
  /** Long enough to be worth laying. */
  valid: boolean;
}

const NO_FEATURES: DayFeatures = {
  raidSize: 0,
  wave: [],
  mazeOpenness: 1,
  richPatches: false,
  nightBloom: false,
};

/**
 * The whole simulation: hive, routes, patches, swarm, hazards.
 *
 * Deliberately free of any Phaser reference. Everything here is plain numbers
 * advanced by a fixed `dt`, which makes it unit-testable and — more importantly
 * for this game — identical at 60Hz and 144Hz. Physics breaking on high-refresh
 * displays is a documented portal rejection cause, so the split is structural,
 * not stylistic.
 */
export class Field {
  readonly hiveX = TUNING.hive.x;
  readonly hiveY = TUNING.hive.y;

  routes: Route[] = [];
  patches: Patch[] = [];
  bees: Bee[] = [];
  wasps: Wasp[] = [];
  /**
   * The bramble maze the board is carved into.
   *
   * Replaces the scattered thorn circles. See sim/Maze.ts — the short version
   * is that a few obstacles on an open board leave the straight line correct
   * almost every time, so the shape the player draws almost never matters, and
   * that is fatal for a game whose only verb is drawing a shape.
   */
  readonly maze = new Maze(
    MAZE_INSET,
    HUD_MARGIN,
    WORLD_WIDTH - MAZE_INSET * 2,
    WORLD_HEIGHT - HUD_MARGIN - MAZE_INSET,
    TUNING.maze.cols,
    TUNING.maze.rows,
  );

  /** Steps through the maze from the hive's cell to every other. */
  private cellSteps: Int32Array = new Int32Array(0);
  /** What the player has seen of the board today. */
  readonly fog = new Fog(WORLD_WIDTH, WORLD_HEIGHT);

  /**
   * Honey banked today. The score, and the thing a day is judged on.
   *
   * Honey used to be stock that had to be carried to a shop and sold before it
   * counted, which put two trips and a price chart between the player's action
   * and its reward. Measured, the first point of score landed 15-25 seconds
   * into day one. Now a bee landing at the hive *is* the reward.
   */
  honey = 0;
  /** Hidden pickups on today's board. */
  treasures: Treasure[] = [];
  /** Honey earned today by exploring: discovery bonuses and honey pots. */
  foundHoney = 0;

  stats: DerivedStats = deriveStats();
  features: DayFeatures = NO_FEATURES;
  /** What the run's items change about today. Neutral on a run with none. */
  modifiers: RunModifiers = noModifiers();

  /** Multiplier on effective swarm size, for the rewarded swarm boost. */
  swarmBoost = 1;

  events: FieldEvents = emptyEvents();

  /**
   * Seconds since each line last had a job, by route id.
   *
   * A line whose flower has run dry, or that never reached one, is retired
   * after a short grace so its slot comes back without the player having to
   * find it and erase it. Erasing by hand was the one chore left in the loop.
   */
  private readonly jobless = new Map<number, number>();
  /** Field time the next golden bloom opens. */
  private nextGoldenAt = Number.POSITIVE_INFINITY;
  /** Set once the cleared event has fired today, so it fires once. */
  private clearedAnnounced = false;
  /**
   * The Busy Hive multiplier, 1..max, continuous. Honey banked is multiplied
   * by its whole part. See `TUNING.combo`.
   */
  combo = 1;
  /** Highest whole tier reached today, for the day's report. */
  bestCombo = 1;
  /** Seconds bees have been waiting with a line free for them. */
  private waiting = 0;

  /** Decides when the next raid lands. See sim/Raid.ts. */
  readonly raid = new RaidClock();
  /**
   * Bees driven out of the swarm by raiders, for today only.
   *
   * Held as a count rather than by removing them permanently: a raid that
   * shrank the hive for the rest of the run would compound one bad day into an
   * unrecoverable one, which is the failure mode the original wasp rules were
   * written to avoid. Losing a third of your workers *this afternoon* is
   * already a real blow.
   */
  beesLost = 0;
  /** Wasps brought down today, for the HUD and the end-of-day report. */
  waspsDowned = 0;
  /** Where the next raid will come in, so the warning can point at it. */
  private raidEntry: { x: number; y: number } | null = null;
  /** Bees this wave has taken, against the budget below. */
  private lostThisRaid = 0;
  /** The most this wave may take, fixed when it is announced. */
  private raidLossBudget = 999;
  /** Counts down to the next blow the hive's guards land. */
  private guardTimer = TUNING.wasp.guardInterval;

  private elapsed = 0;
  private patchPool = TUNING.patch.basePool;
  /** Current day, used to widen the field and size flower pools. */
  private day = 1;

  constructor() {
    this.applyStats();
  }

  get time(): number {
    return this.elapsed;
  }

  // ---------------------------------------------------------------- setup

  setStats(stats: DerivedStats): void {
    this.stats = stats;
    this.applyStats();
  }

  private applyStats(): void {
    const full = this.fullSwarm;
    this.setBeeCount(Math.max(MIN_SWARM, full - this.beesLost));
  }

  /** The swarm the hive would have today if no raid had landed. */
  get fullSwarm(): number {
    return Math.round(this.stats.beeCount * this.swarmBoost) + this.modifiers.extraBees;
  }

  /**
   * Rebuilds the field for a day: fresh patches, no routes, hazards per the
   * escalation schedule.
   *
   * Routes are cleared deliberately. Starting each day with an empty field
   * gives the drawing gesture a reason to happen at the top of every day, which
   * is what makes the loop feel like a series of fresh attempts rather than one
   * long session with interruptions.
   */
  beginDay(
    day: number,
    features: DayFeatures,
    patchCount: number,
    boost: number,
    modifiers: RunModifiers = noModifiers(),
  ): void {
    this.features = features;
    this.modifiers = modifiers;
    this.swarmBoost = boost;
    this.honey = 0;
    this.elapsed = 0;
    this.jobless.clear();
    this.clearedAnnounced = false;
    this.combo = 1;
    this.bestCombo = 1;
    this.waiting = 0;
    this.nextGoldenAt = features.nightBloom
      ? TUNING.golden.firstAt
      : Number.POSITIVE_INFINITY;
    this.day = day;

    this.clearRoutes();
    this.patches = [];
    this.treasures = [];
    this.foundHoney = 0;
    this.wasps = [];
    this.beesLost = 0;
    this.waspsDowned = 0;
    this.raidEntry = null;
    this.raid.begin(features.raidSize, modifiers.extraWarningSeconds);

    this.patchPool = Math.round(
      (TUNING.patch.basePool + (day - 1) * TUNING.patch.poolPerDay) * modifiers.patchPool,
    );

    // The maze is carved *before* the flowers, because a flower's position is
    // chosen by how many corridors away it is, and its yield is derived from
    // that. This is the reverse of the old thorn field, where obstacles were
    // placed relative to flowers that already existed.
    this.maze.generate(Math.min(1, features.mazeOpenness + modifiers.mazeOpennessBonus));
    // The hive's front yard, flattened after generation so the spanning tree
    // has already made every cell reachable and this can only add routes. See
    // `TUNING.maze.yard`.
    const yard = TUNING.maze.yard;
    this.maze.clearRegion(yard.col0, yard.row0, yard.col1, yard.row1);

    this.cellSteps = this.maze.distancesFrom(
      this.maze.colAt(this.hiveX),
      this.maze.rowAt(this.hiveY),
    );

    // Today's clock, and how much board the player is being asked to hold.

    // The whole board opens at dawn.
    //
    // Blooms used to arrive one at a time across the day, and it read as the
    // game changing its mind: you planned around what was there, and then a
    // flower appeared somewhere you had already decided not to go. A day is a
    // board you are given, not a board that keeps being rewritten.
    for (let i = 0; i < patchCount; i += 1) {
      const kind: PatchKind =
        features.richPatches && i === patchCount - 1 ? 'rich' : 'normal';
      this.spawnPatch(kind);
    }

    this.fog.clear();
    // The hive lights its own doorstep, and Scout Bees light a great deal
    // more. Treasures are placed after this, so they only ever sit in the dark.
    this.fog.reveal(
      this.hiveX,
      this.hiveY,
      TUNING.hive.sightRadius + modifiers.hiveSightBonus,
    );
    if (modifiers.scoutRadius > 0) {
      this.fog.reveal(this.hiveX, this.hiveY, modifiers.scoutRadius);
    }
    this.placeTreasures(features.treasures);
    this.updateDiscoveries(false);
    // The hive always knows where its nearest flower is, so a day never opens
    // on nothing to do. Everything past that is for the swarm to find.
    if (!this.patches.some((p) => p.discovered)) {
      const nearest = [...this.patches].sort(
        (a, b) =>
          Math.hypot(a.x - this.hiveX, a.y - this.hiveY) -
          Math.hypot(b.x - this.hiveX, b.y - this.hiveY),
      )[0];
      if (nearest) {
        this.fog.reveal(nearest.x, nearest.y, TUNING.bee.sightRadius);
        this.updateDiscoveries(false);
      }
    }

    this.applyStats();
    for (const bee of this.bees) {
      bee.reset(
        this.hiveX,
        this.hiveY,
        TUNING.bee.lateralSpread,
        TUNING.bee.speedJitter,
        TUNING.bee.weaveLength,
        TUNING.bee.weaveLengthJitter,
      );
    }
  }

  // ---------------------------------------------------------------- fog

  /**
   * Promotes anything now standing in lit ground to "found".
   *
   * Discovery is one-way. A flower seen once is remembered for the rest of the
   * day even if nothing goes near it again — re-finding ground you already paid
   * to explore is busywork wearing a mechanic's clothes.
   */
  private updateDiscoveries(pays = true): void {
    for (const patch of this.patches) {
      if (patch.discovered || !patch.alive) continue;
      if (!this.fog.isDiscovered(patch.x, patch.y)) continue;
      patch.discovered = true;
      // Finding a flower pays on the spot: a share of what it holds. Flowers
      // seen from the hive at dawn were not found by anyone, so they do not.
      const royal = patch.kind === 'royal';
      const share = royal
        ? TUNING.treasure.royalDiscoveryShare
        : TUNING.treasure.discoveryShare;
      const bonus = pays ? Math.round(patch.honeyLeft * share) : 0;
      if (bonus > 0) {
        this.honey += bonus;
        this.foundHoney += bonus;
      }
      this.events.found.push({
        x: patch.x,
        y: patch.y,
        honey: Math.round(patch.honeyLeft),
        bonus,
        royal,
      });
    }
    for (const t of this.treasures) {
      if (t.found || !this.fog.isDiscovered(t.x, t.y)) continue;
      t.found = true;
      if (t.kind === 'honey') {
        this.honey += t.amount;
        this.foundHoney += t.amount;
      } else {
        this.setBeeCount(this.bees.length + t.amount);
      }
      this.events.treasure.push({ x: t.x, y: t.y, kind: t.kind, amount: t.amount });
    }
  }

  /**
   * Lights the board around every bee that is actually out in the field.
   *
   * Idle bees drifting at the hive are skipped: they are already inside the
   * hive's own light, and sweeping them would be a few hundred wasted disc
   * fills a second for ground that is permanently lit anyway.
   */
  private revealFromSwarm(): void {
    const radius = TUNING.bee.sightRadius * (1 + this.modifiers.beeSightBonus);
    for (const bee of this.bees) {
      if (bee.state === 'idle' || bee.state === 'queued') continue;
      this.fog.reveal(bee.x, bee.y, radius);
    }
  }

  // ---------------------------------------------------------------- swarm

  setBeeCount(count: number): void {
    const target = Math.max(0, Math.floor(count));

    while (this.bees.length > target) {
      const bee = this.bees.pop();
      if (bee && bee.routeId !== 0) {
        const route = this.routeById(bee.routeId);
        if (route) route.beeCount -= 1;
      }
    }

    while (this.bees.length < target) {
      const bee = new Bee();
      bee.reset(
        this.hiveX,
        this.hiveY,
        TUNING.bee.lateralSpread,
        TUNING.bee.speedJitter,
        TUNING.bee.weaveLength,
        TUNING.bee.weaveLengthJitter,
      );
      this.bees.push(bee);
    }
  }

  // ---------------------------------------------------------------- patches

  /**
   * A spot for a flower, chosen by how far it is **through the maze**.
   *
   * On a maze board the straight-line distance and the flown distance are very
   * different numbers, and the one that matters is the one the bees actually
   * have to cover. Placing by BFS steps means a flower two corridors away is
   * genuinely two corridors away, whatever the crow-flies distance says.
   *
   * Flowers sit near the centre of a cell, jittered slightly so a board does
   * not read as a grid of dots. Never in the hive's own cell, and never twice
   * in the same cell.
   */
  private randomPatchPosition(kind: PatchKind): { x: number; y: number } {
    const { maze } = this;
    const hiveCol = maze.colAt(this.hiveX);
    const hiveRow = maze.rowAt(this.hiveY);

    // The band of maze-steps a flower may sit in. Only the outer edge moves
    // with the day, so a near flower is always available to fall back on and
    // the near-versus-far decision is live on every day of a run.
    const reach = this.stepsBandForDay(kind);

    // Block out the cells around each existing flower, not just the cell it
    // sits in. Two flowers in neighbouring cells put their reach rings on top
    // of each other, which reads as one confusing blob and makes aiming
    // ambiguous — the old field rejected spots within 170px for exactly this
    // reason and the rule was lost in the move to cells.
    const taken = new Set<number>();
    const block = (into: Set<number>, col: number, row: number, spread: number): void => {
      for (let dr = -spread; dr <= spread; dr += 1) {
        for (let dc = -spread; dc <= spread; dc += 1) {
          const c = col + dc;
          const r = row + dr;
          if (maze.inside(c, r)) into.add(r * maze.cols + c);
        }
      }
    };

    for (const patch of this.patches) {
      if (!patch.alive) continue;
      block(taken, maze.colAt(patch.x), maze.rowAt(patch.y), 1);
    }

    // Only the hive's own cell, not its neighbours. Day one's flowers are
    // deliberately one corridor out so they sit inside the hive's light, and
    // blocking the ring around the hive would push them straight back out of
    // it and leave the tutorial with nothing to point at.
    taken.add(hiveRow * maze.cols + hiveCol);

    // Spaced and in band; then spaced at any distance; then merely not on top
    // of something. Giving up entirely is never an option — a day short of a
    // flower is recoverable, a flower in the hive is not.
    // The light rule is checked against the cell centre, but the flower ends up
    // `PATCH_JITTER` of a cell away from it, so the usable radius is that much
    // smaller. Without this margin a cell that only just clears the threshold
    // can put its flower just outside.
    const jitterReach = Math.hypot(
      maze.cellWidth * PATCH_JITTER,
      maze.cellHeight * PATCH_JITTER,
    );
    const lightRadius = hiveDiscoveryRadius() - jitterReach;
    const inBand: number[] = [];
    const spaced: number[] = [];
    const anywhere: number[] = [];

    for (let index = 0; index < this.cellSteps.length; index += 1) {
      const steps = this.cellSteps[index] ?? -1;
      if (steps < 1) continue;

      const col = index % maze.cols;
      const row = Math.floor(index / maze.cols);
      // Never, at any fallback tier: a flower sharing a cell with the hive is
      // unaimable, and one on top of another flower is unreadable. `anywhere`
      // exists to stop a day being short of a flower, not to put one somewhere
      // it cannot be used.
      const onTop =
        this.patches.some(
          (p) => p.alive && maze.colAt(p.x) === col && maze.rowAt(p.y) === row,
        ) ||
        (col === hiveCol && row === hiveRow);
      if (onTop) continue;

      // On the teaching days every flower must start lit, or the hint line has
      // nothing to point at and a first-time player opens to a board with
      // nothing on it.
      //
      // This is a hard filter rather than a condition on the in-band tier,
      // which is where it used to live. As a tier condition it only held while
      // that tier had something in it: the moment the board got tight enough to
      // fall through to `spaced`, the light rule silently stopped applying and
      // day one could spawn in the dark. Tightening the board is exactly what
      // opening the yard did, and a test caught it. A guarantee that lapses
      // under pressure is not a guarantee.
      if (this.day <= 1) {
        const centre = maze.centreOf(col, row);
        if (Math.hypot(centre.x - this.hiveX, centre.y - this.hiveY) > lightRadius) {
          continue;
        }
      }

      anywhere.push(index);
      if (taken.has(index)) continue;
      spaced.push(index);
      if (steps < reach.min || steps > reach.max) continue;

      inBand.push(index);
    }

    const pool = inBand.length > 0 ? inBand : spaced.length > 0 ? spaced : anywhere;
    if (pool.length === 0) return { x: this.hiveX, y: this.hiveY };

    const index = pool[Math.floor(Math.random() * pool.length)] ?? 0;
    const col = index % maze.cols;
    const row = Math.floor(index / maze.cols);
    const centre = maze.centreOf(col, row);

    const jitterX = (Math.random() * 2 - 1) * maze.cellWidth * PATCH_JITTER;
    const jitterY = (Math.random() * 2 - 1) * maze.cellHeight * PATCH_JITTER;

    // The maze is inset far enough that a cell centre always has room for the
    // whole reach ring, so this only has to catch the jitter.
    const margin = TUNING.patch.reachRadius;
    return {
      x: clamp(centre.x + jitterX, margin, WORLD_WIDTH - margin),
      y: clamp(centre.y + jitterY, HUD_MARGIN + margin, WORLD_HEIGHT - margin),
    };
  }

  /** How many maze-steps out a flower of this kind may be placed, for the day. */
  private stepsBandForDay(kind: PatchKind): { min: number; max: number } {
    // Expressed in steps rather than pixels because the maze is what a bee has
    // to fly. Grows slowly: the outer edge of the field is what opens up over a
    // run, and the inner edge never moves.
    const outward = Math.min(6, 1 + Math.floor((this.day - 1) / 2));
    if (kind === 'rich') return { min: Math.max(3, outward), max: 99 };

    // The band *widens* rather than marching outward.
    //
    // The report was that flowers are usually too close, and the cause was the
    // ceiling rather than the floor: with `max` at outward+1 the band topped
    // out around six steps on a board whose far corner is eleven, so the outer
    // half was decoration and every flower was drawn from the near half.
    //
    // Pushing the *floor* out was the obvious fix and the wrong one — a play
    // simulation showed it cost enough travel time to drop the mid-game clear
    // rate by half, because every flower got further away rather than the
    // choice of flowers getting wider. Raising the ceiling instead keeps a near
    // flower on offer and puts genuinely distant ones next to it, which is the
    // near-versus-far decision the distance multiplier exists to price.
    //
    // The widening itself comes in over the first few days rather than landing
    // at once. Day one's flowers have to spawn inside the hive's own light or
    // the first-time player opens to a dark board with nothing for the hint
    // line to point at — the whole onboarding budget spent on nothing. A wide
    // band on day one put them out past it, which a test caught.
    const spread = Math.min(4, Math.max(1, this.day - 1));
    // Never all in the hive's lap. A board where every flower is one corridor
    // out uses a third of the screen and leaves the rest as empty mist; from
    // day two the nearest flowers are two corridors out.
    return { min: this.day >= 2 ? 2 : 1, max: outward + spread + 1 };
  }

  /**
   * Hides today's treasures in the mist: cells the hive cannot see at dawn,
   * preferring the far ones. A Royal Bloom goes to the furthest free cell —
   * finding it is the reward for pushing all the way out.
   */
  private placeTreasures(plan: TreasurePlan | undefined): void {
    if (!plan) return;
    const { maze } = this;
    const dark: Array<{ x: number; y: number; steps: number }> = [];
    for (let index = 0; index < this.cellSteps.length; index += 1) {
      const steps = this.cellSteps[index] ?? -1;
      if (steps < 2) continue;
      const c = maze.centreOf(index % maze.cols, Math.floor(index / maze.cols));
      if (c.y < HUD_MARGIN + 40) continue;
      if (this.fog.isDiscovered(c.x, c.y)) continue;
      const crowded = this.patches.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 110);
      if (crowded) continue;
      dark.push({ x: c.x, y: c.y, steps });
    }
    if (dark.length === 0) return;
    dark.sort((a, b) => b.steps - a.steps);

    const take = (far: boolean): { x: number; y: number } | null => {
      if (dark.length === 0) return null;
      const pool = far ? dark.slice(0, Math.max(1, Math.ceil(dark.length / 3))) : dark;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (!pick) return null;
      dark.splice(dark.indexOf(pick), 1);
      return pick;
    };

    if (plan.royalBloom) {
      const spot = take(true);
      if (spot) {
        const patch = new Patch(
          spot.x,
          spot.y,
          Math.round(this.patchPool * TUNING.treasure.royalPoolMultiplier),
          'royal',
        );
        patch.species = 1;
        this.patches.push(patch);
      }
    }
    for (let i = 0; i < plan.honeyPots; i += 1) {
      const spot = take(false);
      if (!spot) break;
      this.treasures.push({
        ...spot,
        kind: 'honey',
        amount: Math.round(this.patchPool * TUNING.treasure.potHoneyPerPool),
        found: false,
      });
    }
    for (let i = 0; i < plan.lostBees; i += 1) {
      const spot = take(false);
      if (!spot) break;
      this.treasures.push({
        ...spot,
        kind: 'bees',
        amount: TUNING.treasure.lostBees,
        found: false,
      });
    }
  }

  spawnPatch(kind: PatchKind = 'normal'): Patch {
    const spot = this.randomPatchPosition(kind);
    const patch = new Patch(spot.x, spot.y, this.patchPool, kind);
    patch.distanceMultiplier = this.distanceMultiplierAt(spot.x, spot.y);
    patch.species = this.nextSpecies();
    this.patches.push(patch);
    return patch;
  }

  /**
   * A flower colour not already on the board, where one is available.
   *
   * Rolling independently per flower would put two of the same colour on screen
   * often enough to notice — with six species and five flowers that is better
   * than even odds on any given day. Picking from what is currently unused
   * makes the board legible by colour, which is the entire point of having
   * colours. Falls back to a plain roll once every species is in use.
   */
  private nextSpecies(): number {
    const taken = new Set(this.patches.filter((p) => p.alive).map((p) => p.species));
    const free: number[] = [];
    for (let i = 0; i < COLORS.species.length; i += 1) {
      if (!taken.has(i)) free.push(i);
    }
    if (free.length === 0) return Math.floor(Math.random() * COLORS.species.length);
    return free[Math.floor(Math.random() * free.length)] ?? 0;
  }

  /**
   * How much more a flower here pays for being far out. 1 near, up to 3 far.
   *
   * Linear rather than anything curvier, because the player has to be able to
   * read it off the board at a glance: twice as far out, roughly twice the
   * honey in it.
   */
  distanceMultiplierAt(x: number, y: number): number {
    const { distanceYieldNear, distanceYieldFar, distanceYieldMax } = TUNING.patch;
    // Through the maze, not across it. A flower behind three hedges is a long
    // trip however close it looks, and paying by crow-flies distance would make
    // the most awkward flowers on the board also the worst value.
    const distance = Math.max(
      this.pathDistanceTo(x, y),
      Math.hypot(x - this.hiveX, y - this.hiveY),
    );
    const span = Math.max(1, distanceYieldFar - distanceYieldNear);
    const t = (distance - distanceYieldNear) / span;
    return 1 + Math.min(1, Math.max(0, t)) * (distanceYieldMax - 1);
  }

  removePatch(): void {
    const patch = this.patches.pop();
    if (!patch) return;
    for (const route of this.routes) {
      if (route.target === patch) route.target = null;
    }
  }

  /**
   * Nearest living patch to a point, within `limit` if given.
   *
   * `requireDiscovered` is the whole point of the fog. Aim assist and route
   * targeting must only ever consider flowers the player has actually found —
   * snapping a drag onto something invisible would hand back the information
   * the dark was there to take away, and would read as the game aiming for you.
   *
   * The simulation still resolves undiscovered flowers when it needs to: a bee
   * that arrives at a route's tip and finds an unseen flower there collects
   * from it, which is exactly how exploring pays off. That exception lives in
   * `retarget`, bounded to the tip's own reach — see the note there.
   */
  nearestPatchTo(
    x: number,
    y: number,
    limit = Number.POSITIVE_INFINITY,
    requireDiscovered = false,
  ): Patch | null {
    let best: Patch | null = null;
    let bestDist = limit;

    for (const patch of this.patches) {
      if (!patch.alive) continue;
      if (requireDiscovered && !patch.discovered) continue;
      const dist = Math.hypot(patch.x - x, patch.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = patch;
      }
    }
    return best;
  }

  /** Living flowers the player has actually seen. */
  get knownPatches(): Patch[] {
    return this.patches.filter((p) => p.alive && p.discovered);
  }

  // ---------------------------------------------------------------- maze

  /**
   * Where a path first meets a wall, measured from the start of the path.
   *
   * `Infinity` when it is clear. Everything that needs to know "can bees get
   * along this line" — committing a drag, aim assist, and the per-step recheck
   * that catches wind bending a route into a hedge — goes through here.
   */
  blockedDistance(poly: Polyline, limit: number): number {
    return this.maze.blockedDistanceAlong(poly, limit);
  }

  /** Whether a straight hop from a to b crosses a wall. */
  pathBlocked(ax: number, ay: number, bx: number, by: number): boolean {
    return this.maze.segmentBlocked(ax, ay, bx, by);
  }

  /**
   * Whether a flower can be reached at all.
   *
   * Always true by construction — the maze is carved from a spanning tree, so
   * every cell reaches every other. Kept as a named check because the guarantee
   * is the load-bearing one and a test that asserts it should have something to
   * ask.
   */
  hasClearApproach(px: number, py: number): boolean {
    const col = this.maze.colAt(px);
    const row = this.maze.rowAt(py);
    if (!this.maze.inside(col, row)) return false;
    return (this.cellSteps[row * this.maze.cols + col] ?? -1) >= 0;
  }

  /** How far a point is from the hive *through the maze*, in design units. */
  pathDistanceTo(x: number, y: number): number {
    const col = this.maze.colAt(x);
    const row = this.maze.rowAt(y);
    if (!this.maze.inside(col, row)) return 0;

    const steps = this.cellSteps[row * this.maze.cols + col] ?? 0;
    const cell = (this.maze.cellWidth + this.maze.cellHeight) / 2;
    return Math.max(0, steps) * cell;
  }

  // ---------------------------------------------------------------- routes

  routeById(id: number): Route | undefined {
    return this.routes.find((r) => r.id === id);
  }

  /**
   * The route whose live tip is nearest to (x, y), within the snap radius.
   *
   * Used to decide whether a drag is a cheap extension or a fresh draw. The
   * radius is generous on purpose: the first playtest found the tip-only
   * gesture undiscoverable, so the rule is now "if you started anywhere near
   * the end of a route, you probably meant to continue it".
   */
  routeToExtendAt(
    x: number,
    y: number,
    radius = TUNING.route.refreshSnapRadius,
  ): Route | null {
    let best: Route | null = null;
    let bestDist = radius;

    for (const route of this.routes) {
      if (route.dead) continue;
      const dist = Math.hypot(route.tipX - x, route.tipY - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = route;
      }
    }
    return best;
  }

  /**
   * The live route passing nearest to (x, y), for press-and-hold erase.
   *
   * Tests the whole path rather than just the tip: the player is pointing at a
   * line they can see, and asking them to find one specific end of it is the
   * mistake that made the old refresh gesture undiscoverable.
   */
  routeNear(x: number, y: number, tolerance = 34): Route | null {
    let best: Route | null = null;
    let bestDist = tolerance;

    for (const route of this.routes) {
      if (route.dead) continue;
      // Sampling every 14px is finer than the tolerance, so no gap is missed.
      for (let s = 0; s <= route.liveLength; s += 14) {
        route.sample(s, scratch);
        const dist = Math.hypot(scratch.x - x, scratch.y - y);
        if (dist < bestDist) {
          bestDist = dist;
          best = route;
        }
      }
    }
    return best;
  }

  /** The live route already serving `patch`, if any. */
  routeTargeting(patch: Patch): Route | null {
    return this.routes.find((r) => !r.dead && r.target === patch) ?? null;
  }

  isNearHive(x: number, y: number): boolean {
    return Math.hypot(x - this.hiveX, y - this.hiveY) <= TUNING.hive.drawRadius;
  }

  /**
   * Commits a freshly drawn path as a new route.
   *
   * At the route cap the *most decayed* route is evicted rather than the
   * oldest. A gesture is never refused mid-motion — being told "no" at the end
   * of a drag on a touchscreen reads as a bug, not a rule — and evicting the
   * weakest is the choice the player would have made anyway.
   */
  createRoute(coords: readonly number[]): Route | null {
    if (coordsLength(coords) < TUNING.route.minLength) return null;

    if (this.routes.length >= this.stats.routeSlots) {
      // At the cap, the *least worked* line is the one that goes.
      //
      // Refusing the drag was the alternative and it is worse: a gesture that
      // does nothing on a touchscreen is indistinguishable from a broken game.
      // Strength is traffic the road has actually carried, so the line the
      // swarm has used least is the one the player would have picked anyway.
      let weakest = this.routes[0];
      for (const route of this.routes) {
        if (weakest && route.strength < weakest.strength) weakest = route;
      }
      if (weakest) {
        this.events.replaced.push({ x: weakest.tipX, y: weakest.tipY });
        this.killRoute(weakest);
      }
    }

    const route = new Route(coords);
    route.updateTip();
    this.retarget(route);
    this.routes.push(route);
    return route;
  }

  /**
   * Decides what a route is for, from where its tip is.
   *
   * Only a flower the tip is actually standing on — seen or not, which is how
   * a line pushed into the mist pays off. There used to be a fallback to the
   * nearest known flower *anywhere*, and it made every line that missed look
   * busy: the bees flew to the end, found nothing, milled about and came home,
   * and the player could not tell a working line from a dead one. A line with
   * no flower under its tip now says so by retiring itself.
   */
  retarget(route: Route): void {
    route.target = this.nearestPatchTo(route.tipX, route.tipY, TUNING.patch.reachRadius);
    if (route.target) route.hadTarget = true;
  }

  /**
   * Bees that fly a new line's first trip.
   *
   * Kept as the harness's hook into the swarm, but no longer a price: the line
   * slots are the budget now, and charging a trip of workers on top of that put
   * a second, invisible delay between laying a line and seeing it pay. Idle
   * bees pick the line up on their own on the next step.
   */
  countBuilders(): number {
    let building = 0;
    for (const bee of this.bees) if (bee.state === 'building') building += 1;
    return building;
  }

  killRoute(route: Route): void {
    route.dead = true;
    const index = this.routes.indexOf(route);
    if (index >= 0) this.routes.splice(index, 1);
    this.jobless.delete(route.id);

    for (const bee of this.bees) {
      if (bee.routeId === route.id) {
        bee.routeId = 0;
        bee.state = bee.state === 'idle' || bee.state === 'queued' ? 'idle' : 'homing';
      }
    }
    route.beeCount = 0;
  }

  clearRoutes(): void {
    for (const route of [...this.routes]) this.killRoute(route);
  }

  // ---------------------------------------------------------------- stepping

  step(dt: number): void {
    this.elapsed += dt;

    for (const patch of this.patches) {
      const wasAlive = patch.alive;
      patch.step(dt);
      // A golden bloom whose clock ran out before anyone reached it.
      if (wasAlive && !patch.alive && patch.kind === 'night') {
        this.events.wilted.push({ x: patch.x, y: patch.y, honey: patch.honeyLeft });
      }
    }

    this.stepRaid(dt);
    this.stepGolden();

    for (const route of [...this.routes]) {
      route.step(dt);
      if (route.dead) {
        this.killRoute(route);
        continue;
      }
      if (route.target && !route.target.alive) route.target = null;
      if (!route.target) this.retarget(route);
      this.retireIfJobless(route, dt);
    }

    for (const bee of this.bees) this.stepBee(bee, dt);
    this.stepCombo(dt);

    this.revealFromSwarm();
    this.updateDiscoveries();

    if (!this.clearedAnnounced && this.cleared) {
      this.clearedAnnounced = true;
      this.events.cleared = true;
    }
  }

  /**
   * Retires a line that has nothing left to do.
   *
   * Two cases. Its flower ran dry — the ordinary end of a line's life, and
   * the moment the slot should come back. Or it never reached a flower at all
   * and the bees have had time to fly it and light what is out there, which
   * is how a line pushed into the mist scouts rather than sits there.
   *
   * A line whose tip is being carried on — the player is building a longer
   * route leg by leg — gets a longer grace, since the next leg is usually a
   * second away.
   */
  private retireIfJobless(route: Route, dt: number): void {
    if (route.target) {
      this.jobless.delete(route.id);
      return;
    }

    const idle = (this.jobless.get(route.id) ?? 0) + dt;
    this.jobless.set(route.id, idle);

    const hadFlower = route.hadTarget;
    const grace = hadFlower
      ? TUNING.line.retireSeconds
      : Math.max(4, route.liveLength / (this.stats.beeSpeed * 0.8));
    if (idle < grace) return;

    if (hadFlower) this.events.drained.push({ x: route.tipX, y: route.tipY });
    else this.events.fizzled.push({ x: route.tipX, y: route.tipY });
    this.killRoute(route);
  }

  /** The whole tier of the Busy Hive multiplier: what honey is paid at. */
  get comboTier(): number {
    return Math.floor(this.combo);
  }

  /**
   * Climbs the multiplier while the hive is busy, lets it slip when it is not.
   *
   * "Not busy" is deliberately narrow: bees waiting at the hive *and* a line
   * free for them. Bees idle because every line is already full are not the
   * player's fault, and neither is an empty board before the first line.
   */
  private stepCombo(dt: number): void {
    const { max, risePerSecond, fallPerSecond, graceSeconds, idleTolerance } =
      TUNING.combo;
    const before = this.comboTier;
    const slotFree = this.routes.length < this.stats.routeSlots;
    const waitingBees = this.idleBees >= idleTolerance && slotFree;

    if (waitingBees) {
      this.waiting += dt;
      if (this.waiting > graceSeconds) {
        this.combo = Math.max(1, this.combo - fallPerSecond * dt);
      }
    } else {
      this.waiting = 0;
      const working = this.routes.some((r) => r.target !== null);
      if (working) this.combo = Math.min(max, this.combo + risePerSecond * dt);
    }

    const after = this.comboTier;
    if (after > before) {
      this.events.comboUp = after;
      this.bestCombo = Math.max(this.bestCombo, after);
    } else if (after < before) {
      this.events.comboDown = after;
    }
  }

  /** 0..1, how far the multiplier is toward its next tier. */
  get comboProgress(): number {
    return this.combo >= TUNING.combo.max ? 1 : this.combo - Math.floor(this.combo);
  }

  /** True while bees are waiting long enough to be costing the multiplier. */
  get comboSlipping(): boolean {
    return this.waiting > TUNING.combo.graceSeconds && this.combo > 1;
  }

  /**
   * True once every ordinary flower on the board has been worked dry.
   *
   * Golden blooms are left out: they are a bonus that comes and goes, and a
   * day that could not end until the next one had opened and closed would be
   * a day spent waiting.
   */
  get cleared(): boolean {
    return (
      this.patches.length > 0 && this.patches.every((p) => p.kind === 'night' || !p.alive)
    );
  }

  /** Opens a golden bloom when its time comes. */
  private stepGolden(): void {
    if (this.elapsed < this.nextGoldenAt) return;
    const { minGap, maxGap, poolShare } = TUNING.golden;
    this.nextGoldenAt = this.elapsed + minGap + Math.random() * (maxGap - minGap);

    // One at a time. Two countdowns on the board at once is a panic, not an
    // opportunity.
    if (this.patches.some((p) => p.kind === 'night' && p.alive)) return;

    const pool = this.patchPool;
    this.patchPool = Math.max(4, Math.round(pool * poolShare));
    const patch = this.spawnPatch('night');
    this.patchPool = pool;

    // Always seen: a bonus the player cannot see is not a bonus.
    patch.discovered = true;
    this.fog.reveal(patch.x, patch.y, TUNING.bee.sightRadius);
    this.events.bloomed.push({ x: patch.x, y: patch.y });
  }

  // ---------------------------------------------------------------- lines

  /**
   * Where a line pressed at (x, y) would start from, or null for nowhere.
   *
   * The hive, or the end of a line the player already owns — whichever the
   * press is nearer. A line's end wins only inside its own grab radius, so a
   * press on the hive with a short line's end nearby still starts a new line.
   */
  lineStartAt(x: number, y: number): LineStart | null {
    const toHive = Math.hypot(x - this.hiveX, y - this.hiveY);
    let best: Route | null = null;
    let bestDist = TUNING.line.tipGrabRadius;
    for (const route of this.routes) {
      if (route.dead) continue;
      const dist = Math.hypot(route.tipX - x, route.tipY - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = route;
      }
    }
    if (best && bestDist < toHive) return { x: best.tipX, y: best.tipY, route: best };
    if (toHive <= TUNING.line.startRadius)
      return { x: this.hiveX, y: this.hiveY, route: null };
    return null;
  }

  /**
   * The line a drag from `start` to (toX, toY) would lay.
   *
   * Straight — a beeline — clamped to the longest leg, snapped onto a found
   * flower the finger is near, and slid along any hedge it presses into. The
   * preview draws exactly this, so what the player sees while dragging is
   * what they get when they let go.
   */
  planLine(start: LineStart, toX: number, toY: number): LinePlan {
    let endX = toX;
    let endY = toY;
    const dx = endX - start.x;
    const dy = endY - start.y;
    const len = Math.hypot(dx, dy);
    const max = TUNING.line.maxLegLength;
    if (len > max) {
      endX = start.x + (dx / len) * max;
      endY = start.y + (dy / len) * max;
    }
    endX = clamp(endX, 6, WORLD_WIDTH - 6);
    endY = clamp(endY, 6, WORLD_HEIGHT - 6);

    // Aim assist: a release near a found flower means that flower.
    const near = this.nearestPatchTo(endX, endY, TUNING.patch.aimAssistRadius, true);
    if (near) {
      endX = near.x;
      endY = near.y;
    }

    const raw = straight(start.x, start.y, endX, endY);
    const slid = this.slidePath(raw);
    const coords = slid.coords;
    const tipX = coords[coords.length - 2] ?? start.x;
    const tipY = coords[coords.length - 1] ?? start.y;
    const target = this.nearestPatchTo(tipX, tipY, TUNING.patch.reachRadius, true);

    return {
      start,
      coords,
      target,
      contact: slid.contact,
      valid: coordsLength(coords) >= TUNING.route.minLength,
    };
  }

  /** Lays a planned line. Returns the route it created or carried on. */
  commitLine(plan: LinePlan): Route | null {
    if (!plan.valid) return null;
    if (plan.contact) this.events.deflected.push(plan.contact);

    const tipX = plan.coords[plan.coords.length - 2] ?? plan.start.x;
    const tipY = plan.coords[plan.coords.length - 1] ?? plan.start.y;

    const carried = plan.start.route;
    if (carried && !carried.dead) {
      carried.extendWith(plan.coords);
      this.retarget(carried);
      this.jobless.delete(carried.id);
      this.events.lineLaid.push({ x: tipX, y: tipY, connected: !!carried.target });
      return carried;
    }

    // A second line to a flower that already has one is a second crew on it,
    // not a replacement. Replacing it used to reset every bee already working
    // the first line — a drag that slid along a hedge onto the wrong flower
    // could quietly undo a line that was paying.
    const route = this.createRoute(plan.coords);
    if (!route) return null;
    this.events.lineLaid.push({ x: tipX, y: tipY, connected: !!route.target });
    return route;
  }

  /**
   * A tap on a wasp. Returns true if it landed.
   *
   * Direct and instant, because a wasp is the one thing on the board that
   * wants a reaction rather than a plan. The throw it replaces went through the
   * dial and a shot in flight, and by the time it arrived the wasp was usually
   * somewhere else.
   */
  swatAt(x: number, y: number): boolean {
    const wasp = this.nearestWaspTo(x, y, TUNING.swat.radius);
    if (!wasp) return false;
    const downed = wasp.hit(1 + this.modifiers.beeDamageBonus);
    this.events.struck.push({ x: wasp.x, y: wasp.y });
    if (downed) {
      const bounty = Math.round(dayQuota(this.day) * TUNING.swat.bountyShare);
      this.honey += bounty;
      this.events.deposited += bounty;
      this.events.waspDown.push({ x: wasp.x, y: wasp.y, bounty });
      this.waspsDowned += 1;
    }
    return true;
  }

  // ---------------------------------------------------------------- raids

  /**
   * Advances the raid clock and everything already on the board.
   *
   * The order matters: the clock can spawn wasps this step, and a wasp that
   * spawned this step should not also move this step — it should appear at the
   * edge, be seen, and start crossing next step.
   */
  private stepRaid(dt: number): void {
    const signal = this.raid.step(dt);

    if (signal === 'warning') {
      this.raidEntry = this.pickRaidEntry();
      this.lostThisRaid = 0;
      this.raidLossBudget = Math.max(
        1,
        Math.floor(this.fullSwarm * TUNING.wasp.maxSwarmLossPerRaid),
      );
      this.events.raidWarning = {
        x: this.raidEntry.x,
        y: this.raidEntry.y,
        size: this.raid.size,
      };
    } else if (signal === 'arrive') {
      this.spawnRaid();
    }

    for (const wasp of this.wasps) this.stepWasp(wasp, dt);
    this.stepGuards(dt);

    // Wasps are swept after stepping rather than during, so a wasp beaten off
    // on the same step another one arrives is not skipped by the loop.
    if (this.wasps.some((w) => !w.alive)) {
      this.wasps = this.wasps.filter((w) => w.alive);
    }
  }

  /**
   * The hive's own defence: Guard Bees fighting whatever is at the door.
   *
   * The one part of the raid answer that does not need the player's attention,
   * and that is the point of it. Every other defence costs a drag at the exact
   * moment they were doing something else; guards are what you buy so that a
   * raid arriving mid-gesture is survivable rather than a disaster.
   */
  private stepGuards(dt: number): void {
    const guards = this.modifiers.hiveGuards;
    if (guards <= 0) return;

    const target = this.wasps.find((w) => w.isRaiding);
    if (!target) {
      // Reset rather than bank the timer. Otherwise the guards store up a
      // whole day of idleness and delete the first wasp that lands.
      this.guardTimer = TUNING.wasp.guardInterval;
      return;
    }

    this.guardTimer -= dt * guards;
    while (this.guardTimer <= 0) {
      this.guardTimer += TUNING.wasp.guardInterval;
      const downed = target.hit(1);
      this.events.struck.push({ x: target.x, y: target.y });
      if (downed) {
        // Guards earn no bounty: the bounty is for the player's own swat.
        this.events.waspDown.push({ x: target.x, y: target.y, bounty: 0 });
        this.waspsDowned += 1;
        break;
      }
    }
  }

  /**
   * Where a raid comes in from.
   *
   * The far rim of the maze, measured in corridors rather than pixels: the
   * point of walking the wasps in through the labyrinth is that the maze is
   * suddenly working *for* the player as well as against them, and a wasp that
   * entered next door would never touch a wall.
   */
  private pickRaidEntry(): { x: number; y: number } {
    const hiveCol = this.maze.colAt(this.hiveX);
    const hiveRow = this.maze.rowAt(this.hiveY);

    let best = { col: this.maze.cols - 1, row: 0 };
    let bestSteps = -1;

    for (let col = 0; col < this.maze.cols; col += 1) {
      for (let row = 0; row < this.maze.rows; row += 1) {
        const rim =
          col === 0 ||
          row === 0 ||
          col === this.maze.cols - 1 ||
          row === this.maze.rows - 1;
        if (!rim) continue;
        if (col === hiveCol && row === hiveRow) continue;

        const steps = this.cellSteps[row * this.maze.cols + col] ?? -1;
        // A rim cell the maze has walled off from the hive entirely is no
        // entrance at all — a wasp starting there would never arrive.
        if (steps < 0) continue;
        // Ties broken at random so the raids do not all come from the same
        // corner of a given maze.
        if (steps > bestSteps || (steps === bestSteps && Math.random() < 0.4)) {
          bestSteps = steps;
          best = { col, row };
        }
      }
    }

    return this.maze.centreOf(best.col, best.row);
  }

  /**
   * Lands a raid immediately, and reports what arrived.
   *
   * Exists so a test can exercise the crossing without waiting out a random
   * clock — the alternative is a test that samples the same randomness the
   * feature is built on and is therefore flaky by construction.
   */
  spawnRaidNow(): Wasp[] {
    const before = this.wasps.length;
    this.spawnRaid();
    return this.wasps.slice(before);
  }

  private spawnRaid(): void {
    const entry = this.raidEntry ?? this.pickRaidEntry();
    this.raidEntry = null;

    const wave: WaspKind[] =
      this.features.wave.length > 0 ? this.features.wave : ['raider'];

    for (const kind of wave) {
      // Spread inside the entry corridor, never outside it: a wasp nudged
      // through a wall would start on the wrong side of the maze it is
      // supposed to have to cross.
      const spreadX = (Math.random() - 0.5) * this.maze.cellWidth * 0.6;
      const spreadY = (Math.random() - 0.5) * this.maze.cellHeight * 0.6;
      this.wasps.push(new Wasp(entry.x + spreadX, entry.y + spreadY, kind));
    }
    this.events.raidLanded += wave.length;
  }

  private stepWasp(wasp: Wasp, dt: number): void {
    wasp.beginStep();

    switch (wasp.state) {
      case 'approaching': {
        const next = this.waspWaypoint(wasp);
        wasp.moveToward(next.x, next.y, dt);
        if (
          Math.hypot(wasp.x - this.hiveX, wasp.y - this.hiveY) <= TUNING.wasp.arriveRadius
        ) {
          wasp.beginRaid();
        }
        return;
      }

      case 'raiding': {
        wasp.hover(this.hiveX, this.hiveY, dt);

        // Against the day's quota, not a flat rate. A fixed number of honey a
        // second was six percent of a day-ten quota and literal noise by day
        // fifteen, which is why letting one in felt like nothing happened.
        const take = Math.min(
          this.honey,
          wasp.stealRate(dayQuota(this.day)) * this.modifiers.stealResist * dt,
        );
        this.honey -= take;
        this.events.stolen += take;

        const driven = wasp.tickRaid(dt);
        for (let i = 0; i < driven; i += 1) this.loseBee();
        return;
      }

      case 'fleeing': {
        wasp.moveToward(wasp.homeX, wasp.homeY, dt);
        if (Math.hypot(wasp.x - wasp.homeX, wasp.y - wasp.homeY) < 24) {
          wasp.state = 'gone';
        }
        return;
      }

      default:
        return;
    }
  }

  /**
   * The next point an approaching wasp should fly to.
   *
   * Gradient descent over the same BFS distance field the flower placement
   * uses, so wasps respect the walls without a pathfinder of their own. Once
   * they are in the hive's own cell they make straight for it.
   */
  private waspWaypoint(wasp: Wasp): { x: number; y: number } {
    const col = this.maze.colAt(wasp.x);
    const row = this.maze.rowAt(wasp.y);
    const here = this.cellSteps[row * this.maze.cols + col] ?? 0;
    if (here <= 0) return { x: this.hiveX, y: this.hiveY };

    const steps: Array<[number, number]> = [
      [col - 1, row],
      [col + 1, row],
      [col, row - 1],
      [col, row + 1],
    ];

    for (const [nc, nr] of steps) {
      if (!this.maze.inside(nc, nr)) continue;
      if (!this.maze.canStep(col, row, nc, nr)) continue;
      const there = this.cellSteps[nr * this.maze.cols + nc] ?? -1;
      if (there >= 0 && there < here) return this.maze.centreOf(nc, nr);
    }

    // Walled in — which the generator's spanning tree makes impossible, but a
    // wasp frozen mid-board is a worse bug than one that cuts the corner.
    return { x: this.hiveX, y: this.hiveY };
  }

  /**
   * Drives one bee out of the day's swarm.
   *
   * Takes an idle bee where it can find one, so a raid does not preferentially
   * strip the routes the player is actively working — the honey it steals is
   * already the punishment for ignoring it, and losing the line you were
   * halfway through drawing on top of that reads as spite.
   */
  private loseBee(): void {
    if (this.bees.length <= MIN_SWARM) return;
    // A wave is a bite, not a wipe. Without this ceiling the per-wasp numbers
    // multiply by the wave size and a day-twelve raid takes the whole hive —
    // which is exactly what the measured run showed, and why the later days
    // earned no more than the early ones.
    if (this.lostThisRaid >= this.raidLossBudget) return;
    this.lostThisRaid += 1;

    let index = this.bees.findIndex((b) => b.state === 'idle' || b.state === 'queued');
    if (index < 0) index = this.bees.length - 1;

    const bee = this.bees[index];
    if (!bee) return;

    this.dropBee(bee);
    this.events.beesLost.push({ x: bee.x, y: bee.y });
  }

  /**
   * Removes one specific bee from the day's swarm.
   *
   * Split out from `loseBee` because retaliation has to take *the bee that
   * threw the punch*, not whichever one happened to be idle — the cost of a
   * fight has to land on the fight.
   */
  private dropBee(bee: Bee): void {
    const index = this.bees.indexOf(bee);
    if (index < 0) return;

    if (bee.routeId !== 0) {
      const route = this.routeById(bee.routeId);
      if (route) route.beeCount -= 1;
    }
    this.bees.splice(index, 1);
    this.beesLost += 1;
  }

  /** The nearest wasp worth pointing a route at. */
  nearestWaspTo(x: number, y: number, limit = Number.POSITIVE_INFINITY): Wasp | null {
    let best: Wasp | null = null;
    let bestDist = limit;
    for (const wasp of this.wasps) {
      if (!wasp.alive || wasp.state === 'fleeing') continue;
      const dist = Math.hypot(wasp.x - x, wasp.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = wasp;
      }
    }
    return best;
  }

  /**
   * Where the announced raid will come in, while the warning is up.
   *
   * The warning is the whole fairness budget for making raid timing random, so
   * it has to say *where* as well as *when* — "wasps are coming" with no
   * direction is not a chance to prepare, it is a chance to panic.
   */
  get raidWarningAt(): { x: number; y: number } | null {
    return this.raid.incoming ? this.raidEntry : null;
  }

  /** True while at least one wasp is actually robbing the hive. */
  get underAttack(): boolean {
    return this.wasps.some((w) => w.isRaiding);
  }

  /**
   * Slides a path the player just drew clear of the walls it pressed into.
   *
   * Shared with the commit path so a freshly drawn line and a wind-bowed one
   * are deflected by exactly the same rule. Two notions of what a wall does is
   * how an obstacle stops being something a player can predict.
   */
  slidePath(coords: readonly number[]): WallSlide {
    return slideAlongWalls(coords, this.maze);
  }

  /** Most bees one line carries today. */
  get crewSize(): number {
    return TUNING.route.beesPerLine + this.modifiers.extraCrew;
  }

  /** Bees with no line to fly, waiting at the hive for the player. */
  get idleBees(): number {
    let idle = 0;
    for (const bee of this.bees) if (bee.state === 'idle') idle += 1;
    return idle;
  }

  private assignBee(bee: Bee): void {
    let best: Route | null = null;
    const crew = this.crewSize;
    for (const route of this.routes) {
      if (route.dead || route.beeCount >= crew) continue;
      if (!best || route.beeCount < best.beeCount) best = route;
    }

    if (!best) {
      bee.routeId = 0;
      bee.state = 'idle';
      return;
    }

    best.beeCount += 1;
    bee.routeId = best.id;
    bee.s = 0;

    // Take a slot in the departure queue. Spacing bees at the hive is what
    // turns a travelling clump into a stream — without it, everyone assigned in
    // the same frame flies the whole route shoulder to shoulder.
    const departAt = Math.max(this.elapsed, best.nextDepartAt);
    best.nextDepartAt = departAt + TUNING.bee.departIntervalSeconds;
    bee.timer = departAt - this.elapsed;

    // Queue first even when the slot is free, so every departure goes through
    // the one spacing rule and the swarm leaves as a stream.
    bee.state = 'queued';
  }

  private releaseBee(bee: Bee): void {
    if (bee.routeId === 0) return;
    const route = this.routeById(bee.routeId);
    if (route) route.beeCount -= 1;
    bee.routeId = 0;
  }

  private stepBee(bee: Bee, dt: number): void {
    bee.prevX = bee.x;
    bee.prevY = bee.y;

    // A beaten track is faster to fly. Looked up once per bee per step rather
    // than per branch below, since every movement case wants it.
    const route = bee.routeId !== 0 ? this.routeById(bee.routeId) : undefined;
    const speed =
      this.stats.beeSpeed *
      bee.speedMul *
      (route?.speedMultiplier ?? 1) *
      (1 + this.modifiers.beeSpeedBonus);

    // Wasps only threaten bees that are actually out in the field.
    if (
      this.wasps.length > 0 &&
      (bee.state === 'outbound' ||
        bee.state === 'inbound' ||
        bee.state === 'collect' ||
        bee.state === 'building')
    ) {
      for (const wasp of this.wasps) {
        if (
          !wasp.threatens(
            bee.x,
            bee.y,
            this.hiveX,
            this.hiveY,
            this.modifiers.waspIntercept,
            this.modifiers.waspSafeRadius,
          )
        ) {
          continue;
        }
        this.events.scattered.push({ x: bee.x, y: bee.y });
        this.releaseBee(bee);
        bee.carrying = 0;
        bee.state = 'homing';
        return;
      }
    }

    switch (bee.state) {
      case 'idle': {
        this.driftNearHive(bee, dt);
        if (this.routes.length > 0) this.assignBee(bee);
        return;
      }

      case 'queued': {
        this.driftNearHive(bee, dt);
        bee.timer -= dt;
        if (bee.timer <= 0) {
          const route = this.routeById(bee.routeId);
          if (!route || route.dead) {
            this.releaseBee(bee);
            bee.state = 'idle';
          } else {
            bee.s = 0;
            bee.state = 'outbound';
          }
        }
        return;
      }

      case 'homing': {
        this.flyToward(bee, this.hiveX, this.hiveY, speed, dt);
        if (Math.hypot(bee.x - this.hiveX, bee.y - this.hiveY) < 26) {
          this.bank(bee);
          bee.state = 'idle';
        }
        return;
      }

      case 'collect': {
        bee.timer -= dt;
        const patch = route?.target ?? null;
        if (patch) this.driftAround(bee, patch.x, patch.y, 16, dt);
        if (bee.timer <= 0) {
          if (patch) {
            bee.carrying = patch.drain(TUNING.bee.nectarPerTrip);
            if (bee.carrying > 0) {
              this.events.collected.push({
                x: patch.x,
                y: patch.y,
                amount: bee.carrying,
              });
            }
          }
          bee.state = 'inbound';
        }
        return;
      }

      case 'confused': {
        // Visibly mills at the dead tip, then gives up and returns empty. The
        // player should be able to see *why* honey stopped arriving.
        bee.timer -= dt;
        if (route) this.driftAround(bee, route.tipX, route.tipY, 20, dt);
        if (bee.timer <= 0) bee.state = 'inbound';
        return;
      }

      case 'building':
      case 'outbound':
      case 'inbound': {
        if (!route || route.dead) {
          this.releaseBee(bee);
          bee.state = 'homing';
          return;
        }

        if (bee.state === 'building') {
          // Flies the new line once to open it, then comes home empty. The lost
          // round trip is the cost of the draw.
          bee.s += speed * dt;
          if (bee.s >= route.liveLength) {
            bee.s = route.liveLength;
            bee.state = 'inbound';
          }
        } else if (bee.state === 'outbound') {
          bee.s += speed * dt;
          if (bee.s >= route.liveLength) {
            bee.s = route.liveLength;
            if (route.reachesTarget()) {
              bee.state = 'collect';
              bee.timer = TUNING.bee.collectSeconds;
            } else {
              bee.state = 'confused';
              bee.timer = TUNING.bee.confusedSeconds;
            }
          }
        } else {
          bee.s -= speed * dt;

          if (bee.s <= 0) {
            bee.s = 0;
            // A delivery beats the path in a little further. Only a laden
            // arrival counts: a builder or a scattered bee coming home empty
            // did not use the road, it merely walked it.
            if (bee.carrying > 0) route.reinforce();
            this.bank(bee);
            this.releaseBee(bee);
            this.assignBee(bee);
            return;
          }
        }

        if (bee.s > route.liveLength) bee.s = route.liveLength;

        route.sample(bee.s, scratch);
        // Fade the sideways offset out near both ends so the stream converges
        // tidily at the hive and the flower instead of arriving as a smear.
        const endFade = Math.min(
          1,
          Math.min(bee.s, Math.max(route.liveLength - bee.s, 0)) / 60,
        );
        // The weave, as a sine of arc distance rather than of time. That is
        // what makes it a shape in the world: the bee traces a serpentine
        // along the road, instead of vibrating in place as a wave in `t`
        // would. See the note on `Bee.wavePhase`.
        const weave =
          Math.sin((bee.s / bee.waveLength) * Math.PI * 2 + bee.wavePhase) *
          TUNING.bee.weaveAmplitude;
        const offset = (bee.lateral + weave) * endFade;
        const targetX = scratch.x - scratch.ty * offset;
        const targetY = scratch.y + scratch.tx * offset;

        this.easeToward(bee, targetX, targetY);
        return;
      }

      default:
        return;
    }
  }

  /** Banks whatever a bee came home with. */
  private bank(bee: Bee): void {
    if (bee.carrying <= 0) return;
    // Comb Wax is paid here, at the hive, rather than at the flower: what it
    // buys is a better yield from honey the swarm has actually brought home,
    // so nectar lost to a wasp on the way back is not paid for.
    const gained =
      bee.carrying *
      this.stats.honeyMultiplier *
      (1 + this.modifiers.honeyBonus) *
      this.comboTier;
    this.honey += gained;
    this.events.deposited += gained;
    bee.carrying = 0;
  }

  private easeToward(bee: Bee, targetX: number, targetY: number): void {
    const k = TUNING.bee.steerLerp;
    bee.x += (targetX - bee.x) * k;
    bee.y += (targetY - bee.y) * k;
  }

  private flyToward(
    bee: Bee,
    targetX: number,
    targetY: number,
    speed: number,
    dt: number,
  ): void {
    const dx = targetX - bee.x;
    const dy = targetY - bee.y;
    const dist = Math.hypot(dx, dy) || 1;
    const step = Math.min(speed * dt, dist);
    bee.x += (dx / dist) * step;
    bee.y += (dy / dist) * step;
  }

  private driftNearHive(bee: Bee, dt: number): void {
    bee.wanderPhase += dt * bee.wanderSpeed;
    const radius =
      TUNING.bee.idleDriftRadius *
      (0.35 + 0.65 * Math.abs(Math.sin(bee.wanderPhase * 0.6)));
    const targetX = this.hiveX + Math.cos(bee.wanderPhase) * radius;
    const targetY = this.hiveY + Math.sin(bee.wanderPhase * 1.3) * radius * 0.6;
    bee.x += (targetX - bee.x) * 0.035;
    bee.y += (targetY - bee.y) * 0.035;
  }

  private driftAround(
    bee: Bee,
    cx: number,
    cy: number,
    radius: number,
    dt: number,
  ): void {
    bee.wanderPhase += dt * 5 * bee.wanderSpeed;
    const targetX = cx + Math.cos(bee.wanderPhase) * radius;
    const targetY = cy + Math.sin(bee.wanderPhase * 1.4) * radius;
    bee.x += (targetX - bee.x) * 0.25;
    bee.y += (targetY - bee.y) * 0.25;
  }

  /** Returns and clears this frame's events. */
  drainEvents(): FieldEvents {
    const out = this.events;
    this.events = emptyEvents();
    return out;
  }

  getStats(): FieldStats {
    let laden = 0;
    let collecting = 0;
    for (const bee of this.bees) {
      if (bee.carrying > 0) laden += 1;
      if (bee.state === 'collect') collecting += 1;
    }
    return {
      honey: this.honey,
      bees: this.bees.length,
      routes: this.routes.length,
      laden,
      collecting,
    };
  }
}

/**
 * A straight path as evenly spaced points.
 *
 * Spaced rather than two endpoints because the wall slide works step by step:
 * a two-point line that crossed a hedge would be judged as one long step and
 * lose everything past the wall instead of running along it.
 */
function straight(ax: number, ay: number, bx: number, by: number): number[] {
  const len = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(len / TUNING.route.pointSpacing));
  const out: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    out.push(ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps);
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
