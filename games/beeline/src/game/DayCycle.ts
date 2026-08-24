import { TUNING } from '../config/tuning.ts';

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
  return 5;
}

export interface DayFeatures {
  wind: boolean;
  wasps: number;
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
    richPatches: day >= 8,
    nightBloom: day >= 10,
  };
}

/** The one-line announcement shown at the start of a day that introduces something. */
export function dayIntroduction(day: number): string | null {
  switch (day) {
    case 2:
      return 'A second patch. Your swarm splits between routes.';
    case TUNING.wind.startDay:
      return 'Wind. Straight lines will bend.';
    case TUNING.wasp.startDay:
      return 'Wasps. They hunt bees far from the hive.';
    case 8:
      return 'Rich patches bloom far away. Worth the distance?';
    case TUNING.wasp.secondWaspDay:
      return 'A second wasp.';
    case 10:
      return 'Night bloom. Brief, and worth a lot.';
    default:
      return null;
  }
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
