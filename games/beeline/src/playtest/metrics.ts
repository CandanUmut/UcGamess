/**
 * Engagement metrics for a simulated play session, and the score built on them.
 *
 * **This is a proxy, not a measurement of people.** It cannot tell whether a
 * game is charming. What it can do is catch the structural faults that reliably
 * lose casual players before charm gets a chance: a long wait before the first
 * reward, stretches where the player has nothing to do, inputs that the game
 * makes them wait on, days that are trivially easy or hopeless, and a skill
 * ceiling so low that practice changes nothing. Each of those is measurable
 * from a simulated player, and each has a target band taken from the portal
 * thresholds in docs/design-rules.md or from common casual-game practice.
 *
 * Use it to compare two versions of the game under the same bots. The absolute
 * number means little on its own; a change that moves it by 20 points means a
 * lot, and a change that moves it by 2 means nothing.
 */

/** What the player was doing during one slice of time. */
export type Activity =
  /** Carrying out an input: a drag, a tap, a hold. */
  | 'acting'
  /** Wanting to act, but the game is making them wait (a dial, a shot in flight). */
  | 'waiting'
  /** Nothing useful to do right now. */
  | 'idle';

export interface DayRecord {
  day: number;
  seconds: number;
  score: number;
  quota: number;
  met: boolean;
}

/** Everything one simulated run produced. */
export interface RunLog {
  persona: string;
  days: DayRecord[];
  /** Seconds spent in each activity, over the whole run. */
  activity: Record<Activity, number>;
  /** Seconds where the player was idle *and* the score had not moved for a while. */
  deadSeconds: number;
  /** Meaningful inputs: each committed line, erase, throw or tap. */
  inputs: number;
  /** Inputs that produced nothing — a line that never delivered, a throw that missed. */
  wastedInputs: number;
  /** Discrete positive feedback moments (rate-limited, so a stream is not 60 a second). */
  feedbackEvents: number;
  /** Seconds from the first frame of day one to the first point of score. */
  firstScoreAt: number;
  /** Seconds of non-gameplay screens (night, results) the player sat through. */
  overheadSeconds: number;
}

export interface PersonaSummary {
  persona: string;
  runs: number;
  /** Mean days reached (the day the run ended on). */
  daysReached: number;
  /** Mean length of a whole run in minutes, overhead included. */
  runMinutes: number;
  /** Share of runs longer than three minutes — Poki's second threshold. */
  over3Min: number;
  /** Day the run most often ended on (the median). */
  medianEndDay: number;
  firstScoreSeconds: number;
  inputsPerMinute: number;
  waitFraction: number;
  idleFraction: number;
  deadFraction: number;
  feedbackPerMinute: number;
  wasteFraction: number;
  /** Mean score/quota on the days that were played, excluding day one. */
  quotaRatio: number;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export function summarise(persona: string, logs: RunLog[]): PersonaSummary {
  const perRun = logs.map((log) => {
    const played = log.days.reduce((a, d) => a + d.seconds, 0);
    const total = played + log.overheadSeconds;
    const minutes = played / 60;
    const later = log.days.filter((d) => d.day > 1);
    return {
      days: log.days.length,
      endDay: log.days[log.days.length - 1]?.day ?? 1,
      totalMinutes: total / 60,
      firstScore: log.firstScoreAt,
      inputsPerMinute: minutes > 0 ? log.inputs / minutes : 0,
      wait: played > 0 ? log.activity.waiting / played : 0,
      idle: played > 0 ? log.activity.idle / played : 0,
      dead: played > 0 ? log.deadSeconds / played : 0,
      feedback: minutes > 0 ? log.feedbackEvents / minutes : 0,
      waste: log.inputs > 0 ? log.wastedInputs / log.inputs : 0,
      ratio: later.length > 0 ? mean(later.map((d) => d.score / d.quota)) : 0,
    };
  });

  return {
    persona,
    runs: logs.length,
    daysReached: mean(perRun.map((r) => r.endDay)),
    runMinutes: mean(perRun.map((r) => r.totalMinutes)),
    over3Min: mean(perRun.map((r) => (r.totalMinutes > 3 ? 1 : 0))),
    medianEndDay: median(perRun.map((r) => r.endDay)),
    firstScoreSeconds: mean(perRun.map((r) => r.firstScore)),
    inputsPerMinute: mean(perRun.map((r) => r.inputsPerMinute)),
    waitFraction: mean(perRun.map((r) => r.wait)),
    idleFraction: mean(perRun.map((r) => r.idle)),
    deadFraction: mean(perRun.map((r) => r.dead)),
    feedbackPerMinute: mean(perRun.map((r) => r.feedback)),
    wasteFraction: mean(perRun.map((r) => r.waste)),
    quotaRatio: mean(perRun.map((r) => r.ratio)),
  };
}

/**
 * 1 inside the good band, falling linearly to 0 at the bad bound.
 *
 * `good` and `bad` can be in either order: a metric where lower is better just
 * passes a `bad` above its `good`.
 */
function band(value: number, good: number, bad: number): number {
  if (good === bad) return value === good ? 1 : 0;
  const t = (value - bad) / (good - bad);
  return Math.max(0, Math.min(1, t));
}

/** 1 inside [lo, hi], falling to 0 at `loBad` below and `hiBad` above. */
function window(
  value: number,
  loBad: number,
  lo: number,
  hi: number,
  hiBad: number,
): number {
  if (value < lo) return band(value, lo, loBad);
  if (value > hi) return band(value, hi, hiBad);
  return 1;
}

export interface EngagementComponent {
  name: string;
  weight: number;
  /** 0..1 */
  score: number;
  /** The raw figure it was scored from, for the report. */
  value: string;
  target: string;
}

export interface EngagementReport {
  /** 0..100. */
  score: number;
  components: EngagementComponent[];
}

/**
 * The engagement score, from the three personas' summaries.
 *
 * Most components are read off the **casual** player, because that is who a
 * portal's Player Fit Test is made of. Skill expression compares the expert with
 * the novice, and the onboarding check uses the novice, because a first-time
 * player is exactly who has to be caught in the first ten seconds.
 */
export function engagementScore(
  novice: PersonaSummary,
  casual: PersonaSummary,
  expert: PersonaSummary,
): EngagementReport {
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  const components: EngagementComponent[] = [
    {
      name: 'First reward (novice)',
      weight: 10,
      score: band(novice.firstScoreSeconds, 6, 30),
      value: `${novice.firstScoreSeconds.toFixed(1)}s`,
      target: '<= 6s',
    },
    {
      name: 'Inputs per minute (casual)',
      weight: 12,
      score: band(casual.inputsPerMinute, 18, 3),
      value: casual.inputsPerMinute.toFixed(1),
      target: '>= 18',
    },
    {
      name: 'Time spent waiting on the game',
      weight: 10,
      score: band(casual.waitFraction, 0.05, 0.35),
      value: pct(casual.waitFraction),
      target: '<= 5%',
    },
    {
      name: 'Dead time (nothing to do, nothing happening)',
      weight: 15,
      score: band(casual.deadFraction, 0.04, 0.35),
      value: pct(casual.deadFraction),
      target: '<= 4%',
    },
    {
      name: 'Feedback moments per minute',
      weight: 10,
      score: band(casual.feedbackPerMinute, 30, 6),
      value: casual.feedbackPerMinute.toFixed(1),
      target: '>= 30',
    },
    {
      name: 'Challenge fit (score / quota, days 2+)',
      weight: 10,
      score: window(casual.quotaRatio, 0.8, 1.05, 1.6, 3),
      value: casual.quotaRatio.toFixed(2),
      target: '1.05 - 1.6',
    },
    {
      name: 'First-run length (casual)',
      weight: 15,
      score: band(casual.runMinutes, 6, 1.5),
      value: `${casual.runMinutes.toFixed(1)} min`,
      target: '>= 6 min',
    },
    {
      name: 'Skill expression (expert days / novice days)',
      weight: 8,
      score:
        window(expert.daysReached / Math.max(1, novice.daysReached), 1.05, 1.5, 4, 8) *
        // A game only the expert can play is not skill expression, it is a wall.
        band(novice.daysReached, 3, 1),
      value: `${(expert.daysReached / Math.max(1, novice.daysReached)).toFixed(2)}x (novice day ${novice.daysReached.toFixed(1)})`,
      target: '1.5 - 4x, novice >= day 3',
    },
    {
      name: 'Wasted inputs (casual)',
      weight: 10,
      score: band(casual.wasteFraction, 0.1, 0.5),
      value: pct(casual.wasteFraction),
      target: '<= 10%',
    },
  ];

  const total = components.reduce((a, c) => a + c.weight, 0);
  const score = (100 * components.reduce((a, c) => a + c.weight * c.score, 0)) / total;
  return { score, components };
}

export function formatReport(
  summaries: PersonaSummary[],
  report: EngagementReport,
): string {
  const lines: string[] = [];
  const cols: Array<[string, (s: PersonaSummary) => string]> = [
    ['days reached', (s) => s.daysReached.toFixed(1)],
    ['median end day', (s) => String(s.medianEndDay)],
    ['run minutes', (s) => s.runMinutes.toFixed(1)],
    ['runs > 3 min', (s) => `${Math.round(s.over3Min * 100)}%`],
    ['first score (s)', (s) => s.firstScoreSeconds.toFixed(1)],
    ['inputs / min', (s) => s.inputsPerMinute.toFixed(1)],
    ['waiting', (s) => `${Math.round(s.waitFraction * 100)}%`],
    ['idle', (s) => `${Math.round(s.idleFraction * 100)}%`],
    ['dead', (s) => `${Math.round(s.deadFraction * 100)}%`],
    ['feedback / min', (s) => s.feedbackPerMinute.toFixed(1)],
    ['wasted inputs', (s) => `${Math.round(s.wasteFraction * 100)}%`],
    ['score / quota', (s) => s.quotaRatio.toFixed(2)],
  ];

  const pad = (s: string, n: number): string => s.padEnd(n);
  lines.push(pad('', 18) + summaries.map((s) => pad(s.persona, 12)).join(''));
  for (const [name, get] of cols) {
    lines.push(pad(name, 18) + summaries.map((s) => pad(get(s), 12)).join(''));
  }
  lines.push('');
  for (const c of report.components) {
    lines.push(
      `${pad(c.name, 48)} ${pad(c.value, 26)} target ${pad(c.target, 26)} ${(c.score * c.weight).toFixed(1)}/${c.weight}`,
    );
  }
  lines.push('');
  lines.push(`ENGAGEMENT SCORE: ${report.score.toFixed(1)} / 100`);
  return lines.join('\n');
}
