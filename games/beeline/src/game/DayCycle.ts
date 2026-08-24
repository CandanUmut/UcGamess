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
  return 5;
}

/**
 * How many thorn thickets a given day places.
 *
 * Bumps on days 6 and 10, chosen to miss every day that introduces something.
 * The count is intensity, not a new thing to learn — the same reason patch
 * count grows without counting against the one-new-element-at-a-time rule.
 *
 * Capped at three because that is what the board can honestly hold. A thicket
 * needs a corridor between the hive ring and a flower ring to sit in, and on a
 * fixed 1280x720 field only two or three flowers are ever far enough out. A
 * schedule asking for five would have the night screen forecast thorns the day
 * could not deliver, which is worse than having fewer of them.
 */
export function bramblesForDay(day: number): number {
  if (day < TUNING.bramble.startDay) return 0;
  if (day >= 10) return 3;
  if (day >= 6) return 2;
  return 1;
}

/** Radius of a thicket placed on a given day, before any provision. */
export function brambleRadiusForDay(day: number): number {
  const { baseRadius, radiusPerDay, maxRadius, startDay } = TUNING.bramble;
  return Math.min(baseRadius + Math.max(0, day - startDay) * radiusPerDay, maxRadius);
}

export interface DayFeatures {
  wind: boolean;
  wasps: number;
  brambles: number;
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
    brambles: bramblesForDay(day),
    richPatches: day >= RICH_PATCH_DAY,
    nightBloom: day >= NIGHT_BLOOM_DAY,
  };
}

/** The one-line announcement shown at the start of a day that introduces something. */
export function dayIntroduction(day: number): string | null {
  switch (day) {
    case 2:
      return 'A second patch. Your swarm splits between routes.';
    case TUNING.bramble.startDay:
      return 'Thorns. Routes cannot pass through them — draw around.';
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

  if (features.brambles > 0) {
    out.push(
      features.brambles === 1 ? '1 thorn patch' : `${features.brambles} thorn patches`,
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
  if (day === TUNING.bramble.startDay) return 'thorns';
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
  /** The hive's bill for the day, charged against the honey before banking. */
  upkeep: number;
  /** What actually reaches the store once the hive has been fed. */
  banked: number;
}

/**
 * Whether the hive charges upkeep on a given day.
 *
 * Nothing is charged over the first couple of days, for the same reason
 * nothing else is: the opening has one job, and a bill is not it.
 */
export function upkeepDueOn(day: number): boolean {
  return day >= TUNING.hive.upkeepFromDay;
}

export function evaluateDay(
  day: number,
  honey: number,
  bestSoFar: number,
  dailyUpkeep = 0,
): DayResult {
  const quota = dayQuota(day);
  const met = honey >= quota;
  const shortfall = (quota - honey) / quota;

  // Upkeep is charged against the day's honey, never against the quota. The
  // quota asks "did you work hard enough today"; upkeep asks "can you afford
  // the hive you have built". Keeping them separate means a big swarm never
  // makes the day itself harder to pass — it makes the *progress* cost more,
  // which is the decision it is supposed to be.
  const upkeep = upkeepDueOn(day) ? Math.min(dailyUpkeep, Math.floor(honey)) : 0;

  return {
    day,
    honey,
    quota,
    outcome: met ? 'met' : 'missed',
    // Only offer more time when the player was genuinely close. Offering it on
    // a hopeless day reads as the game selling a rescue it knows will not work.
    nearMiss: !met && shortfall <= TUNING.ads.extendOfferMissThreshold,
    isBest: honey > bestSoFar,
    upkeep,
    banked: Math.max(0, Math.floor(honey) - upkeep),
  };
}
