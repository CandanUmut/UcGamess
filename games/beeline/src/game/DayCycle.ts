import { TUNING } from '../config/tuning.ts';

/**
 * Days the late-game elements arrive on.
 *
 * Named rather than inlined because they moved when brambles took day 3, and a
 * magic `8` in three places is how a schedule drifts out of sync with itself.
 */
const RICH_PATCH_DAY = 9;
const NIGHT_BLOOM_DAY = 12;

/** Seconds a given day runs for. Grows early, then flattens. */
export function dayLength(day: number): number {
  const { baseSeconds, secondsPerDay, maxSeconds } = TUNING.day;
  return Math.min(baseSeconds + secondsPerDay * (day - 1), maxSeconds);
}

/**
 * Honey needed to pass a day.
 *
 * A hand-tuned table for the first twelve days, then a growth curve. A single
 * exponential cannot be both trivially passable on day one and tight by day
 * five — the early shape has to be flatter than any clean formula gives.
 */
export function dayQuota(day: number): number {
  const table = TUNING.day.quotas;
  const index = day - 1;
  if (index < table.length) return table[index] ?? 60;

  const last = table[table.length - 1] ?? 1550;
  return Math.round(
    last * Math.pow(TUNING.day.quotaGrowthAfterTable, day - table.length),
  );
}

/**
 * How many flowers bloom on a given day, before the Bloom upgrade.
 *
 * Day one has two rather than one. Now that a drained flower stays dead for the
 * day, the first one *will* run dry inside 45 seconds — and the lesson only
 * lands if there is somewhere to move to. A single flower would teach
 * "everything ran out and I could do nothing", which is the wrong first
 * impression entirely.
 */
export function patchesForDay(day: number): number {
  if (day <= 1) return 2;
  if (day <= 3) return 3;
  if (day <= 6) return 4;
  if (day <= 9) return 5;
  // More flowers, each holding less.
  //
  // The two go together. Shrinking the pool is what forces a player to move on
  // when a flower runs dry — the loop the game is built on — but on its own it
  // just makes the day poorer, because the swarm spends it hunting. Adding
  // flowers puts the next target within reach of the one that just died, so
  // the retargeting is a decision rather than a walk.
  //
  // Five route slots against seven flowers is also the first point in the run
  // where the board offers more than the player can hold at once, which is
  // where choosing *which* flowers starts to matter.
  if (day <= 12) return 6;
  return 7;
}

/**
 * How open the board is on a given day: 1 is an open field, lower is a tighter
 * maze.
 *
 * The single knob that paces the labyrinth. Days one and two have no walls at
 * all, so the opening thirty seconds are exactly the game they always were;
 * from then on the board tightens a little each day until it settles at a real
 * maze that still has more than one way round everything.
 */
export function mazeOpennessForDay(day: number): number {
  const { startDay, opennessDay1, opennessFloor, tighteningDays } = TUNING.maze;
  if (day < startDay) return 1;

  // `+ 1` so the day brambles are introduced already has some. Starting the
  // ramp at zero meant the introduction day was still a completely open board,
  // and the game announced a mechanic it had not yet placed.
  const progress = Math.min(1, (day - startDay + 1) / Math.max(1, tighteningDays));
  return opennessDay1 - (opennessDay1 - opennessFloor) * progress;
}

export interface DayFeatures {
  wind: boolean;
  wasps: number;
  /** 1 is an open field, lower is a tighter maze. */
  mazeOpenness: number;
  richPatches: boolean;
  nightBloom: boolean;
}

/**
 * Which elements are active on a given day.
 *
 * One new thing every couple of days, never two at once, with a quiet day after
 * each introduction so the last addition has room to be understood. Day one is
 * deliberately empty of everything.
 */
export function featuresForDay(day: number): DayFeatures {
  return {
    wind: day >= TUNING.wind.startDay,
    wasps: day >= TUNING.wasp.secondWaspDay ? 2 : day >= TUNING.wasp.startDay ? 1 : 0,
    mazeOpenness: mazeOpennessForDay(day),
    richPatches: day >= RICH_PATCH_DAY,
    nightBloom: day >= NIGHT_BLOOM_DAY,
  };
}

/** The one-line announcement shown at the start of a day that introduces something. */
export function dayIntroduction(day: number): string | null {
  switch (day) {
    case 2:
      return 'A second patch. Your swarm splits between routes.';
    case TUNING.maze.startDay:
      return 'Brambles close in. Your lines cannot cross them — find a way round.';
    case TUNING.wind.startDay:
      return 'Wind. Straight lines will bend.';
    case TUNING.wasp.startDay:
      return 'Wasps. They hunt bees far from the hive.';
    case RICH_PATCH_DAY:
      return 'Rich patches bloom far away. Worth the distance?';
    case TUNING.wasp.secondWaspDay:
      return 'A second wasp.';
    case NIGHT_BLOOM_DAY:
      return 'Night bloom. Brief, and worth a lot.';
    default:
      return null;
  }
}

/**
 * A short description of what a day holds, for the night screen.
 *
 * The design has always claimed a progression track — "the night screen shows
 * the next unlock two or three days ahead, so there is always a visible reason
 * to start another day" — and it was never built. It matters more now that
 * provisions exist: buying smoke is a guess unless you can see there are wasps
 * tomorrow. One line does both jobs.
 */
export function forecastFor(day: number): string[] {
  const features = featuresForDay(day);
  const out: string[] = [`${patchesForDay(day)} flowers`];

  if (features.mazeOpenness < 1) {
    // What the player cares about is how hard the board is to cross, not the
    // number behind it.
    out.push(
      features.mazeOpenness > 0.7
        ? 'scattered brambles'
        : features.mazeOpenness > 0.45
          ? 'a tangled field'
          : 'a dense maze',
    );
  }
  if (features.wind) out.push('wind');
  if (features.wasps === 1) out.push('1 wasp');
  else if (features.wasps > 1) out.push(`${features.wasps} wasps`);
  if (features.richPatches) out.push('rich blooms');
  if (features.nightBloom) out.push('night bloom');

  return out;
}

/** The next day that introduces something, and what it is. Null once nothing is left. */
export function nextUnlock(day: number): { day: number; what: string } | null {
  for (let ahead = day + 1; ahead <= day + 8; ahead += 1) {
    const what = unlockName(ahead);
    if (what) return { day: ahead, what };
  }
  return null;
}

function unlockName(day: number): string | null {
  if (day === TUNING.maze.startDay) return 'brambles';
  if (day === TUNING.wind.startDay) return 'wind';
  if (day === TUNING.wasp.startDay) return 'wasps';
  if (day === RICH_PATCH_DAY) return 'rich blooms';
  if (day === TUNING.wasp.secondWaspDay) return 'a second wasp';
  if (day === NIGHT_BLOOM_DAY) return 'night bloom';
  return null;
}

export type DayOutcome = 'met' | 'missed';

export interface DayResult {
  day: number;
  honey: number;
  quota: number;
  outcome: DayOutcome;
  /** True when the miss was close enough to be worth offering extra time. */
  nearMiss: boolean;
  isBest: boolean;
}

export function evaluateDay(day: number, honey: number, bestSoFar: number): DayResult {
  const quota = dayQuota(day);
  const met = honey >= quota;
  const shortfall = (quota - honey) / quota;

  return {
    day,
    honey,
    quota,
    outcome: met ? 'met' : 'missed',
    // Only offer more time when the player was genuinely close. Offering it on
    // a hopeless day reads as the game selling a rescue it knows will not work.
    nearMiss: !met && shortfall <= TUNING.ads.extendOfferMissThreshold,
    isBest: honey > bestSoFar,
  };
}
