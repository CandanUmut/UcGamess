import { Field, type LineStart } from '../sim/Field.ts';
import type { Patch } from '../sim/Patch.ts';
import type { Route } from '../sim/Route.ts';
import {
  dayLength,
  dayQuota,
  evaluateDay,
  featuresForDay,
  patchesForDay,
  sunsetBonus,
  type DayFeatures,
} from '../game/DayCycle.ts';
import { deriveStats } from '../game/Upgrades.ts';
import { TUNING } from '../config/tuning.ts';
import {
  ITEMS,
  modifiersFor,
  noModifiers,
  rollOffer,
  type ItemId,
  type RunModifiers,
} from '../game/Items.ts';
import { gaussian, seeded, type Persona } from './personas.ts';
import {
  levelFeatures,
  levelModifiers,
  levelSunsetBonus,
  withSeed,
  type LevelDef,
} from '../game/Levels.ts';
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
  kind: 'line' | 'swat' | 'recall';
  /** For a recall: the line to take back. */
  route?: Route;
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

/** A way of joining a flower to the network, with what it costs and earns. */
interface Option {
  start: LineStart;
  target: Patch;
  /** Where the first drag is released: the flower, or a corridor corner. */
  aim: { x: number; y: number };
  cost: number;
  score: number;
}

/**
 * A simulated player of the network game.
 *
 * Two brains on the same hands. `nearest` is the player who has not thought
 * about it: a line from the hive to whichever unworked flower is closest, and
 * when the wax runs out, recall something dry. `value` (the planner) weighs
 * every way of reaching every flower — from the hive, off the tip of a dry
 * stub, or as a branch off any line — by what the flower will pay against the
 * wax it costs, the way a player who has understood the game does.
 *
 * The gap between the two on the same level is the number this whole redesign
 * is about: if thinking does not beat not thinking, the stars mean nothing.
 */
class DragBot {
  inputs = 0;
  wasted = 0;
  private pending: Pending | null = null;
  private thinkIn = 0;
  private readonly persona: Persona;
  /** Where a stub this bot laid was heading, so the next leg carries on. */
  private readonly intent = new Map<number, Patch>();

  constructor(persona: Persona) {
    this.persona = persona;
  }

  beginDay(): void {
    this.pending = null;
    this.thinkIn = 0.6;
    this.intent.clear();
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

    if (p.kind === 'swat') {
      const x = gaussian(p.x, this.persona.aimSd);
      const y = gaussian(p.y, this.persona.aimSd);
      if (!field.swatAt(x, y)) this.wasted += 1;
      return;
    }
    if (p.kind === 'recall') {
      const route = p.route;
      if (route && !route.dead) field.recallRoute(route);
      else this.wasted += 1;
      return;
    }

    if (!p.start) return;
    // The line the drag grows from may have changed while the finger moved.
    if (p.start.route?.dead) {
      this.wasted += 1;
      return;
    }
    // Aim assist snaps a release onto a flower, so aim error matters for
    // corners and for the start of the drag, less for the end.
    const x = gaussian(p.x, this.persona.aimSd * 0.5);
    const y = gaussian(p.y, this.persona.aimSd * 0.5);
    const plan = field.planLine(p.start, x, y);
    // A player watches the preview: a drag that would stop short of the wax
    // or run nowhere useful is not released.
    if (!plan.valid || (plan.short && !plan.target)) {
      this.wasted += 1;
      return;
    }
    const route = field.commitLine(plan);
    if (!route) {
      this.wasted += 1;
      return;
    }
    if (!route.target && p.target) this.intent.set(route.id, p.target);
  }

  private delay(): number {
    return Math.max(0.12, gaussian(this.persona.reaction, this.persona.reactionSd));
  }

  private decide(field: Field): Pending | null {
    const sloppy = Math.random() < this.persona.sloppiness;
    const greedy = sloppy || this.persona.strategy === 'nearest';
    const now = field.time;

    // 1. A wasp on the board. Swat it where it will be when the tap lands.
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

    // 2. Only build when bees are waiting or the network is short of crew.
    const crew = field.crewSize;
    const working = field.routes.filter((r) => r.target).length;
    if (field.idleBees === 0 && working * crew >= field.bees.length) return null;

    const open = field.knownPatches.filter((p) => p.pool > 0 && !field.routeTargeting(p));
    if (open.length === 0) return null;

    // 3. Carry on a stub this bot laid towards a flower it still wants.
    for (const route of field.routes) {
      const want = this.intent.get(route.id);
      if (route.target || !want) continue;
      if (!want.alive || field.routeTargeting(want)) {
        this.intent.delete(route.id);
        continue;
      }
      const start: LineStart = {
        x: route.tipX,
        y: route.tipY,
        route,
        mode: 'tip',
        at: 0,
      };
      // A leg that can no longer be finished (the wax ran short) is given up.
      const check = field.planLine(start, want.x, want.y);
      if (check.short && check.target !== want) {
        this.intent.delete(route.id);
        continue;
      }
      // Everyone steers for the gap in a hedge; a first-timer only sometimes.
      const aim =
        sloppy && Math.random() < 0.5
          ? { x: want.x, y: want.y }
          : waypoint(field, route.tipX, route.tipY, want.x, want.y);
      return this.line(field, start, aim, want);
    }

    const best = greedy
      ? this.nearestOption(field, open, sloppy)
      : this.bestOption(field, open);
    if (best) return this.line(field, best.start, best.aim, best.target);

    // 4. Nothing affordable: take back a dry line for its wax.
    const dry = field.routes
      .filter(
        (r) => !r.target && r.hadTarget && !field.descendantsOf(r).some((d) => d.target),
      )
      .sort((a, b) => b.ownCost - a.ownCost)[0];
    if (dry) {
      return { kind: 'recall', at: now + this.delay() + 0.6, route: dry, x: 0, y: 0 };
    }
    return null;
  }

  /** The unthinking choice: straight from the hive to the closest flower. */
  private nearestOption(field: Field, open: Patch[], sloppy: boolean): Option | null {
    const target = [...open].sort(
      (a, b) =>
        Math.hypot(a.x - field.hiveX, a.y - field.hiveY) -
        Math.hypot(b.x - field.hiveX, b.y - field.hiveY),
    )[0];
    if (!target) return null;
    const start: LineStart = {
      x: field.hiveX,
      y: field.hiveY,
      route: null,
      mode: 'hive',
      at: 0,
    };
    const plan = field.planLine(start, target.x, target.y);
    if (plan.target === target) {
      return {
        start,
        target,
        aim: { x: target.x, y: target.y },
        cost: plan.cost,
        score: 0,
      };
    }
    // Blocked or unaffordable. Steer for the gap in the hedge, if it is that.
    const aim =
      sloppy && Math.random() < 0.5
        ? { x: target.x, y: target.y }
        : waypoint(field, start.x, start.y, target.x, target.y);
    const leg = field.planLine(start, aim.x, aim.y);
    if (!leg.valid || leg.short) return null;
    return { start, target, aim, cost: leg.cost, score: 0 };
  }

  /** The planner: every flower, every way in, scored by honey per wax. */
  private bestOption(field: Field, open: Patch[]): Option | null {
    const starts = this.startsOn(field);
    const speed = field.stats.beeSpeed;
    const timeLeft = Math.max(1, this.secondsLeft - field.time);
    let best: Option | null = null;

    for (const target of open) {
      // Rank ways in by a straight-line guess, then plan only the best few.
      const guesses = starts
        .map((st) => ({
          st,
          guess: Math.hypot(target.x - st.start.x, target.y - st.start.y),
        }))
        .filter((g) => g.guess <= field.wax + TUNING.patch.reachRadius)
        .sort((a, b) => a.guess - b.guess)
        .slice(0, 4);

      for (const { st } of guesses) {
        let cost: number;
        let aim = { x: target.x, y: target.y };
        const plan = field.planLine(st.start, target.x, target.y);
        if (plan.target === target && !plan.short) {
          cost = plan.cost;
        } else {
          // Round a hedge: one leg to the corridor corner, then on.
          aim = waypoint(field, st.start.x, st.start.y, target.x, target.y);
          const leg = field.planLine(st.start, aim.x, aim.y);
          if (!leg.valid || leg.short) continue;
          const tipX = leg.coords[leg.coords.length - 2] ?? aim.x;
          const tipY = leg.coords[leg.coords.length - 1] ?? aim.y;
          const rest = Math.hypot(target.x - tipX, target.y - tipY);
          if (field.pathBlocked(tipX, tipY, target.x, target.y)) continue;
          cost = leg.cost + rest;
          if (cost > field.wax) continue;
        }
        const trip = st.arc + cost;
        const earn = this.earnFrom(field, target, trip, timeLeft, speed);
        // A branch off a line to a flower about to run dry ties the new line
        // to one that cannot be taken back without it. A planner avoids it.
        const parent = st.start.route;
        const fragile =
          st.start.mode === 'branch' &&
          parent !== null &&
          (!parent.target || parent.target.honeyLeft < 60);
        // What this line opens up: the unworked flowers near its end, each a
        // short branch away. This is what makes a trunk to a far cluster worth
        // more than its first flower alone — the thing a planner sees and a
        // flower-by-flower player does not.
        let extraEarn = 0;
        let extraCost = 0;
        for (const other of open) {
          if (other === target) continue;
          const d = Math.hypot(other.x - target.x, other.y - target.y);
          if (d > 260 || field.pathBlocked(target.x, target.y, other.x, other.y))
            continue;
          extraEarn += 0.6 * this.earnFrom(field, other, trip + d, timeLeft, speed);
          extraCost += d;
        }
        const score =
          (earn / (cost + 60) +
            (extraEarn > 0 ? (0.5 * (earn + extraEarn)) / (cost + extraCost + 60) : 0)) *
          (fragile ? 0.5 : 1);
        if (!best || score > best.score)
          best = { start: st.start, target, aim, cost, score };
      }
    }
    return best;
  }

  /** Honey a crew on a line of length `trip` to `target` could bring in by dusk. */
  private earnFrom(
    field: Field,
    target: Patch,
    trip: number,
    timeLeft: number,
    speed: number,
  ): number {
    const tripSeconds = (2 * trip) / speed + TUNING.bee.collectSeconds + 0.3;
    const window =
      target.kind === 'night' ? Math.min(timeLeft, target.windowRemaining) : timeLeft;
    return Math.min(
      target.honeyLeft,
      (field.crewSize * target.yieldPerTrip * window) / tripSeconds,
    );
  }

  /** Every place a drag could start: the hive, stub tips, and along each line. */
  private startsOn(field: Field): Array<{ start: LineStart; arc: number }> {
    const out: Array<{ start: LineStart; arc: number }> = [
      {
        start: { x: field.hiveX, y: field.hiveY, route: null, mode: 'hive', at: 0 },
        arc: 0,
      },
    ];
    const probe = { x: 0, y: 0, tx: 0, ty: 0 };
    for (const route of field.routes) {
      if (!route.target) {
        out.push({
          start: { x: route.tipX, y: route.tipY, route, mode: 'tip', at: 0 },
          arc: route.liveLength,
        });
      }
      for (let s = 60; s <= route.liveLength; s += 40) {
        route.sample(Math.min(s, route.liveLength), probe);
        out.push({
          start: { x: probe.x, y: probe.y, route, mode: 'branch', at: s },
          arc: s,
        });
      }
    }
    return out;
  }

  /** Seconds in today's level, set by the harness so the planner can weigh time. */
  secondsLeft = 60;

  private line(
    field: Field,
    start: LineStart,
    to: { x: number; y: number },
    target: Patch,
  ): Pending {
    const dist = Math.hypot(to.x - start.x, to.y - start.y);
    const gesture = 0.18 + dist / 2400 + this.persona.sloppiness * 0.2;
    return {
      kind: 'line',
      at: field.time + this.delay() + gesture,
      start,
      x: to.x,
      y: to.y,
      target,
    };
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

/** Writes a diagnostic line to stdout (the harness runs under Node). */
function write(line: string): void {
  (
    globalThis as { process?: { stdout?: { write(s: string): void } } }
  ).process?.stdout?.write(`${line}\n`);
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

interface DayPlay {
  t: number;
  cleared: boolean;
  stolen: number;
  swarmIdle: number;
}

/**
 * Plays one day to dusk or to a cleared meadow, accumulating into `log`.
 *
 * Shared by the endless run and the campaign, so the two are measured the
 * same way. `log.firstScoreAt` is set against the log's own running clock.
 */
function playDay(
  field: Field,
  bot: DragBot,
  seconds: number,
  log: RunLog,
  traceDay: number,
): DayPlay {
  const clockBefore = log.days.reduce((a, d) => a + d.seconds, 0);
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
    log.activity[activity] += DT;

    const events = field.drainEvents();
    stolen += events.stolen;
    if (field.idleBees * 2 >= field.bees.length) swarmIdle += DT;
    if (TRACE > 0 && TRACE === traceDay && Math.floor(t) !== Math.floor(t - DT))
      trace(field, t);
    log.feedbackEvents +=
      events.found.length +
      events.waspDown.length +
      events.struck.length +
      events.drained.length +
      events.bloomed.length +
      events.lineLaid.length +
      (events.comboUp > 0 ? 1 : 0);

    const score = field.honey;
    if (score > lastScore + 1e-9) {
      if (log.firstScoreAt < 0) log.firstScoreAt = clockBefore + t;
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
  return { t: Math.min(t, seconds), cleared, stolen, swarmIdle };
}

export interface LevelPlay {
  honey: number;
  cleared: boolean;
  bestCombo: number;
  seconds: number;
}

/** Plays one campaign level once, the way `persona` would. */
export function playLevel(persona: Persona, level: LevelDef, seed: number): LevelPlay {
  const field = new Field();
  const bot = new DragBot(persona);
  const modifiers = levelModifiers(level);
  field.setStats(deriveStats(modifiers));
  withSeed(level.seed, () =>
    field.beginDay(level.difficulty, levelFeatures(level), level.flowers, 1, modifiers),
  );
  const realRandom = Math.random;
  Math.random = seeded(seed);
  try {
    bot.beginDay();
    bot.secondsLeft = level.seconds;
    const log = emptyLog(persona.name);
    const play = playDay(field, bot, level.seconds, log, 1);
    const bonus = play.cleared ? levelSunsetBonus(level, level.seconds - play.t) : 0;
    // BOT_REPORT=1 prints, per level played, the wax spent and how much of
    // each flower was worked — the fastest way to see why a board scores.
    if (ENV?.BOT_REPORT) {
      const taken = field.patches
        .map((p) => `t${p.tier}:${Math.round(100 * (1 - p.pool / p.maxPool))}%`)
        .join(' ');
      write(
        `L${level.id} ${persona.name} wax ${field.waxBudget}->${Math.round(field.wax)} honey ${Math.floor(field.honey)} | ${taken}`,
      );
    }
    return {
      honey: Math.floor(field.honey) + bonus,
      cleared: play.cleared,
      bestCombo: field.bestCombo,
      seconds: play.t,
    };
  } finally {
    Math.random = realRandom;
  }
}

function emptyLog(persona: string): RunLog {
  return {
    persona,
    days: [],
    activity: { acting: 0, waiting: 0, idle: 0 },
    deadSeconds: 0,
    inputs: 0,
    wastedInputs: 0,
    feedbackEvents: 0,
    firstScoreAt: -1,
    overheadSeconds: 0,
  };
}

function playRunInner(persona: Persona, maxDays: number): RunLog {
  const field = new Field();
  const bot = new DragBot(persona);
  const items: ItemId[] = [];

  const log = emptyLog(persona.name);
  let clock = 0;

  for (let day = 1; day <= maxDays; day += 1) {
    const modifiers = modifiersFor(items);
    const stats = deriveStats(modifiers);
    field.setStats(stats);
    const features = featuresForDay(day);
    field.beginDay(day, features, patchesForDay(day) + stats.extraPatches, 1, modifiers);
    bot.beginDay();
    bot.secondsLeft = dayLength(day) + modifiers.extraDaySeconds;

    const seconds = dayLength(day) + modifiers.extraDaySeconds;
    const { t, cleared, stolen, swarmIdle } = playDay(field, bot, seconds, log, day);
    clock += t;

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

/** A board to play that is not (yet) a campaign level: for tuning experiments. */
export interface Setup {
  features: DayFeatures;
  seconds: number;
  /** Seeds the layout, so every persona plays the same board. */
  layoutSeed: number;
  modifiers?: RunModifiers;
}

/** Plays `setup` once, the way `persona` would. */
export function playSetup(persona: Persona, setup: Setup, seed: number): LevelPlay {
  const field = new Field();
  const bot = new DragBot(persona);
  const modifiers = setup.modifiers ?? noModifiers();
  field.setStats(deriveStats(modifiers));
  withSeed(setup.layoutSeed, () => field.beginDay(1, setup.features, 0, 1, modifiers));
  const realRandom = Math.random;
  Math.random = seeded(seed);
  try {
    bot.beginDay();
    bot.secondsLeft = setup.seconds;
    const play = playDay(field, bot, setup.seconds, emptyLog(persona.name), 1);
    return {
      honey: Math.floor(field.honey),
      cleared: play.cleared,
      bestCombo: field.bestCombo,
      seconds: play.t,
    };
  } finally {
    Math.random = realRandom;
  }
}
