import { Field, WORLD_HEIGHT, WORLD_WIDTH, type LineStart } from '../sim/Field.ts';
import type { Patch } from '../sim/Patch.ts';
import type { Route } from '../sim/Route.ts';
import {
  dayLength,
  dayQuota,
  evaluateDay,
  featuresForDay,
  patchesForDay,
  sunsetBonus,
} from '../game/DayCycle.ts';
import { deriveStats } from '../game/Upgrades.ts';
import { ITEMS, modifiersFor, rollOffer, type ItemId } from '../game/Items.ts';
import { gaussian, seeded, type Persona } from './personas.ts';
import type { Activity, DayRecord, RunLog } from './metrics.ts';

const DT = 1 / 60;
const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env;
/** Set BEELINE_TRACE=<day> to print that day second by second. */
const TRACE = Number(ENV?.BEELINE_TRACE ?? 0);
/** Idle this long with the score frozen counts as dead time. */
const DEAD_AFTER = 3;
/** A stream of score is one feedback moment per this many seconds, not sixty. */
const SCORE_FEEDBACK_GAP = 1;
/** Runs are cut here; a run this long is already a pass. */
export const MAX_DAYS = Number(ENV?.BEELINE_MAX_DAYS ?? 25);

/** One input the bot has decided on, landing after its reaction time. */
interface Pending {
  kind: 'line' | 'swat';
  /** Field time the input lands. */
  at: number;
  /** For a line: where the drag starts from. */
  start?: LineStart;
  /** Where the drag is released, or the tap lands. */
  x: number;
  y: number;
  /** The flower this drag is meant to end on, if it is the last leg. */
  target?: Patch | null;
}

/**
 * A simulated player of the drag-a-line game.
 *
 * It reads the board a few times a second, picks one thing to do, and does it
 * after a human reaction delay and with a human amount of aim error. A drag
 * takes time to perform. Everything it knows, a person looking at the screen
 * would know: it only targets flowers that are drawn, and it scouts into the
 * mist rather than towards flowers it cannot see.
 */
class DragBot {
  inputs = 0;
  wasted = 0;
  private pending: Pending | null = null;
  private thinkIn = 0;
  private readonly persona: Persona;

  constructor(persona: Persona) {
    this.persona = persona;
  }

  beginDay(): void {
    this.pending = null;
    this.thinkIn = 0.6;
  }

  step(field: Field): Activity {
    if (this.pending) {
      if (field.time >= this.pending.at) this.perform(field, this.pending);
      return 'acting';
    }

    this.thinkIn -= DT;
    if (this.thinkIn > 0) return 'idle';
    this.thinkIn = 1 / this.persona.thinkRate;

    const next = this.decide(field);
    if (!next) return 'idle';
    this.pending = next;
    return 'acting';
  }

  private perform(field: Field, p: Pending): void {
    this.pending = null;
    this.inputs += 1;
    const x = gaussian(p.x, this.persona.aimSd);
    const y = gaussian(p.y, this.persona.aimSd);

    if (p.kind === 'swat') {
      if (!field.swatAt(x, y)) this.wasted += 1;
      return;
    }

    if (!p.start) return;
    // The start may have moved (a line retired) while the finger was on its way.
    const start = field.lineStartAt(p.start.x, p.start.y);
    if (!start) {
      this.wasted += 1;
      return;
    }
    let plan = field.planLine(start, x, y);
    // A person watches the preview while dragging. If it has snapped onto
    // some other flower — the line slid along a hedge — they steer to the
    // corridor corner instead of letting go on the wrong thing. Only a player
    // who reads the maze does this; a first-timer lets go regardless.
    if (
      p.target &&
      plan.target &&
      plan.target !== p.target &&
      this.persona.sloppiness <= 0.4
    ) {
      const corner = waypoint(field, start.x, start.y, p.target.x, p.target.y);
      plan = field.planLine(start, corner.x, corner.y);
      if (plan.target && plan.target !== p.target) {
        // Nothing sensible to release on: lift the finger, try again later.
        this.inputs -= 1;
        return;
      }
    }
    const route = field.commitLine(plan);
    if (!route) this.wasted += 1;
  }

  private delay(): number {
    return Math.max(0.12, gaussian(this.persona.reaction, this.persona.reactionSd));
  }

  private decide(field: Field): Pending | null {
    const sloppy = Math.random() < this.persona.sloppiness;
    const now = field.time;

    // 1. A wasp on the board. Swat it where it will be when the tap lands —
    // a practised player leads the target, a new one taps where it is.
    const wasp = field.wasps.find((w) => w.alive && w.state !== 'fleeing');
    if (wasp && !(sloppy && Math.random() < 0.5)) {
      const rt = this.delay();
      const lead = sloppy ? 0 : rt * (1 - this.persona.sloppiness);
      const vx = (wasp.x - wasp.prevX) / DT;
      const vy = (wasp.y - wasp.prevY) / DT;
      return {
        kind: 'swat',
        at: now + rt,
        x: wasp.x + vx * lead,
        y: wasp.y + vy * lead,
      };
    }

    // 2. A free line and a flower worth working.
    if (field.routes.length >= field.stats.routeSlots) return null;

    const served = new Set<Patch>();
    for (const r of field.routes) if (r.target) served.add(r.target);

    const open = field.knownPatches.filter((p) => !served.has(p));
    const partial = this.partialLine(field);

    if (open.length === 0) {
      // Nothing known to work: push a line into the mist, if any is left.
      if (partial) return null;
      const dark = this.nearestDark(field);
      if (!dark) return null;
      return this.line(field, { x: field.hiveX, y: field.hiveY, route: null }, dark);
    }

    const target = this.pick(field, open, sloppy);
    if (!target) return null;

    // Carry on a line that stopped short, if there is one.
    const from: LineStart = partial
      ? { x: partial.tipX, y: partial.tipY, route: partial }
      : { x: field.hiveX, y: field.hiveY, route: null };

    // Where to aim this leg: straight at the flower, or — for a player who
    // reads the maze — at the furthest corridor corner they can see from here.
    const aim =
      sloppy || this.persona.sloppiness > 0.4
        ? { x: target.x, y: target.y }
        : waypoint(field, from.x, from.y, target.x, target.y);
    const pending = this.line(field, from, aim);
    pending.target = target;
    return pending;
  }

  /** A line with no flower under its tip, still young enough to carry on. */
  private partialLine(field: Field): Route | null {
    return field.routes.find((r) => !r.target && !r.hadTarget) ?? null;
  }

  private line(field: Field, start: LineStart, to: { x: number; y: number }): Pending {
    // Reaction, then the drag itself — longer for a longer drag.
    const dist = Math.hypot(to.x - start.x, to.y - start.y);
    const gesture = 0.18 + dist / 2400 + this.persona.sloppiness * 0.2;
    return {
      kind: 'line',
      at: field.time + this.delay() + gesture,
      start,
      x: to.x,
      y: to.y,
    };
  }

  private pick(field: Field, open: Patch[], sloppy: boolean): Patch | null {
    const scored = open.map((p) => {
      const dist = Math.hypot(p.x - field.hiveX, p.y - field.hiveY);
      const golden = p.kind === 'night' ? 4 : 1;
      return {
        p,
        value: sloppy ? -dist : (golden * p.honeyLeft) / (120 + dist),
      };
    });
    scored.sort((a, b) => b.value - a.value);
    return scored[0]?.p ?? null;
  }

  /** The nearest unlit ground to the hive, as a person would see the mist. */
  private nearestDark(field: Field): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (let y = 140; y < WORLD_HEIGHT - 30; y += 40) {
      for (let x = 40; x < WORLD_WIDTH - 30; x += 40) {
        if (field.fog.isDiscovered(x, y)) continue;
        const d = Math.hypot(x - field.hiveX, y - field.hiveY);
        if (d < bestDist) {
          bestDist = d;
          best = { x, y };
        }
      }
    }
    return best;
  }
}

/**
 * The furthest point along the maze path to (tx, ty) that is in plain view
 * from (fx, fy) — the corner a person would drag to.
 */
function waypoint(
  field: Field,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
): { x: number; y: number } {
  if (!field.pathBlocked(fx, fy, tx, ty)) return { x: tx, y: ty };
  const { maze } = field;
  const dist = maze.distancesFrom(maze.colAt(tx), maze.rowAt(ty));
  let col = maze.colAt(fx);
  let row = maze.rowAt(fy);
  let best = { x: tx, y: ty };
  let found = false;
  for (let guard = 0; guard < 80; guard += 1) {
    const here = dist[row * maze.cols + col] ?? -1;
    if (here <= 0) break;
    let moved = false;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nc = col + dc;
      const nr = row + dr;
      if (!maze.inside(nc, nr) || !maze.canStep(col, row, nc, nr)) continue;
      if ((dist[nr * maze.cols + nc] ?? -1) === here - 1) {
        col = nc;
        row = nr;
        moved = true;
        break;
      }
    }
    if (!moved) break;
    const c = maze.centreOf(col, row);
    if (!field.pathBlocked(fx, fy, c.x, c.y)) {
      best = c;
      found = true;
    } else if (found) {
      break;
    }
  }
  return best;
}

/** One line of the second-by-second trace, for diagnosing a bad day. */
function trace(field: Field, t: number): void {
  const known = field.patches.filter((q) => q.alive && q.discovered).length;
  const hidden = field.patches.filter((q) => q.alive && !q.discovered).length;
  const lines = field.routes
    .map((r) => {
      const tag = r.target
        ? `F${Math.round(r.target.pool)}`
        : r.hadTarget
          ? 'dry'
          : 'scout';
      return `${tag}:${r.beeCount}`;
    })
    .join(',');
  const out = `t${Math.floor(t)} honey${Math.round(field.honey)} known${known} hidden${hidden} idle${field.idleBees} lines[${lines}]`;
  (
    globalThis as { process?: { stdout?: { write(s: string): void } } }
  ).process?.stdout?.write(`${out}\n`);
}

/** Picks a card from the draft, the way each persona would. */
function draftPick(offer: ItemId[], persona: Persona): ItemId | undefined {
  if (Math.random() < persona.sloppiness) {
    return offer[Math.floor(Math.random() * offer.length)];
  }
  const rank: Partial<Record<ItemId, number>> = {
    moreLines: 10,
    queensGift: 9,
    royalJelly: 9,
    broodChamber: 7,
    wildflowers: 6,
    swiftWings: 5,
    combFrames: 5,
    guardBees: 5,
    earlyRise: 4,
  };
  return [...offer].sort((a, b) => (rank[b] ?? 2) - (rank[a] ?? 2))[0];
}

/** Plays one whole run, from day one to the first missed quota. */
export function playRun(persona: Persona, seed: number, maxDays = MAX_DAYS): RunLog {
  const realRandom = Math.random;
  Math.random = seeded(seed);
  try {
    return playRunInner(persona, maxDays);
  } finally {
    Math.random = realRandom;
  }
}

function playRunInner(persona: Persona, maxDays: number): RunLog {
  const field = new Field();
  const bot = new DragBot(persona);
  const items: ItemId[] = [];

  const log: RunLog = {
    persona: persona.name,
    days: [],
    activity: { acting: 0, waiting: 0, idle: 0 },
    deadSeconds: 0,
    inputs: 0,
    wastedInputs: 0,
    feedbackEvents: 0,
    firstScoreAt: -1,
    overheadSeconds: 0,
  };
  let clock = 0;

  for (let day = 1; day <= maxDays; day += 1) {
    const modifiers = modifiersFor(items);
    const stats = deriveStats(modifiers);
    field.setStats(stats);
    const features = featuresForDay(day);
    field.beginDay(day, features, patchesForDay(day) + stats.extraPatches, 1, modifiers);
    bot.beginDay();

    const seconds = dayLength(day) + modifiers.extraDaySeconds;
    let lastScoreChange = 0;
    let lastScoreFeedback = -99;
    let lastScore = 0;
    let t = 0;
    let cleared = false;
    let stolen = 0;
    let swarmIdle = 0;

    for (; t < seconds; t += DT) {
      const activity = bot.step(field);
      field.step(DT);
      clock += DT;
      log.activity[activity] += DT;

      const events = field.drainEvents();
      stolen += events.stolen;
      if (field.idleBees * 2 >= field.bees.length) swarmIdle += DT;
      if (TRACE === day && Math.floor(t) !== Math.floor(t - DT)) trace(field, t);
      log.feedbackEvents +=
        events.found.length +
        events.waspDown.length +
        events.struck.length +
        events.drained.length +
        events.bloomed.length +
        events.lineLaid.length;

      const score = field.honey;
      if (score > lastScore + 1e-9) {
        if (log.firstScoreAt < 0) log.firstScoreAt = clock;
        lastScoreChange = t;
        if (t - lastScoreFeedback >= SCORE_FEEDBACK_GAP) {
          log.feedbackEvents += 1;
          lastScoreFeedback = t;
        }
      }
      lastScore = score;
      if (activity === 'idle' && t - lastScoreChange > DEAD_AFTER) log.deadSeconds += DT;

      if (events.cleared) {
        cleared = true;
        break;
      }
    }

    const bonus = cleared ? sunsetBonus(day, seconds - t) : 0;
    const result = evaluateDay(day, field.honey + bonus, bonus);
    const record: DayRecord = {
      day,
      seconds: Math.min(t, seconds),
      score: result.score,
      quota: dayQuota(day),
      met: result.outcome === 'met',
      stolen,
      beesLost: field.beesLost,
      swarmIdle,
    };
    log.days.push(record);
    // The day-end card: a few seconds to read the result.
    log.overheadSeconds += 3;
    if (!record.met) break;

    // The draft.
    log.overheadSeconds += persona.nightSeconds * 0.6;
    const offer = rollOffer(day + 1, featuresForDay(day + 1), Math.random, result.stars);
    const pick = draftPick(offer, persona);
    if (pick && ITEMS[pick]) items.push(pick);
  }

  log.inputs = bot.inputs;
  log.wastedInputs = bot.wasted;
  if (log.firstScoreAt < 0) log.firstScoreAt = clock;
  // The results screen after a failed run.
  log.overheadSeconds += persona.nightSeconds;
  return log;
}
