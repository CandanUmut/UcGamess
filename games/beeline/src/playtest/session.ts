import { Field } from '../sim/Field.ts';
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
import { seeded, type Persona } from './personas.ts';
import { Forager } from '../game/Forager.ts';
import { Rivalry } from '../game/Rival.ts';

/** A player who never touches the board: does the rival beat them? */
const IDLE = {
  step: () => 'idle' as const,
  beginDay: () => undefined,
} as unknown as Forager;
import {
  levelFeatures,
  levelModifiers,
  withSeed,
  type LevelDef,
} from '../game/Levels.ts';
import type { DayRecord, RunLog } from './metrics.ts';

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
  /** Seconds from the first line to a full jar, or null if it never filled. */
  filledAt: number | null;
  /** The rival filled its jar first. */
  beaten?: boolean;
  /** Both jars every half second, when racing a rival. */
  race?: Array<[number, number]>;
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
  bot: Forager,
  seconds: number,
  log: RunLog,
  traceDay: number,
  goal = Infinity,
  rival: Rivalry | null = null,
): DayPlay {
  const clockBefore = log.days.reduce((a, d) => a + d.seconds, 0);
  let lastScoreChange = 0;
  let lastScoreFeedback = -99;
  let lastScore = 0;
  let t = 0;
  let cleared = false;
  let stolen = 0;
  let swarmIdle = 0;
  let firstLineAt = -1;
  let filledAt: number | null = null;
  let beaten = false;
  const race: Array<[number, number]> = [];

  for (; t < seconds; t += DT) {
    const activity = bot.step(field);
    field.step(DT);
    if (rival) {
      rival.step(DT);
      if (Math.floor(t * 2) !== Math.floor((t - DT) * 2))
        race.push([field.honey, rival.field.honey]);
      const verdict = rival.verdict(field, goal);
      if (verdict === 'won') {
        if (firstLineAt < 0) firstLineAt = 0;
        filledAt = t - firstLineAt;
        break;
      }
      if (verdict === 'beaten') {
        beaten = true;
        break;
      }
    }
    log.activity[activity] += DT;

    const events = field.drainEvents();
    stolen += events.stolen;
    if (field.idleBees * 2 >= field.bees.length) swarmIdle += DT;
    if (TRACE === traceDay && Math.floor(t) !== Math.floor(t - DT)) trace(field, t);
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

    if (firstLineAt < 0 && field.routes.length > 0) firstLineAt = t;
    if (field.honey >= goal) {
      filledAt = t - Math.max(0, firstLineAt);
      break;
    }
    if (goal < Infinity && !rival && field.exhausted) break;

    if (events.cleared && goal === Infinity) {
      cleared = true;
      break;
    }
  }
  return { t: Math.min(t, seconds), cleared, filledAt, stolen, swarmIdle, beaten, race };
}

export interface LevelPlay {
  honey: number;
  cleared: boolean;
  /** Seconds from the first line to a full jar; null if it was not filled. */
  filledAt: number | null;
  /** The rival filled its jar first. */
  beaten: boolean;
  /** Honey the rival had banked when it ended. */
  rivalHoney: number;
  /** Both jars every half second, when racing a rival. */
  race: Array<[number, number]>;
  bestCombo: number;
  seconds: number;
}

/** How long a simulated player keeps at an untimed board. */
const UNTIMED_CAP = 300;

/**
 * Plays one campaign level once, the way `persona` would: until the jar is
 * full, the sun sets, or the flowers run out. `goal` overrides the level's
 * own, for fitting one.
 */
export function playLevel(
  persona: Persona,
  level: LevelDef,
  seed: number,
  goal?: number,
  limit?: number,
): LevelPlay {
  const field = new Field();
  const bot: Forager | null = persona.thinkRate > 0 ? new Forager(persona) : null;
  const modifiers = levelModifiers(level);
  field.setStats(deriveStats(modifiers));
  withSeed(level.seed, () =>
    field.beginDay(level.difficulty, levelFeatures(level), level.flowers, 1, modifiers),
  );
  const realRandom = Math.random;
  Math.random = seeded(seed);
  try {
    const rival = level.rival ? new Rivalry(level.rival) : null;
    rival?.begin(field, { fog: level.fog, beeSpeedBonus: modifiers.beeSpeedBonus });
    bot?.beginDay();
    const log = emptyLog(persona.name);
    // An untimed board still ends for a player who has stopped trying.
    const seconds = limit ?? (level.timed ? level.seconds : UNTIMED_CAP);
    const play = playDay(field, bot ?? IDLE, seconds, log, -1, goal ?? level.goal, rival);
    return {
      honey: Math.floor(field.honey),
      cleared: play.cleared,
      filledAt: play.filledAt,
      beaten: play.beaten ?? false,
      rivalHoney: Math.floor(rival?.field.honey ?? 0),
      race: play.race ?? [],
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
  const bot = new Forager(persona);
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
