/**
 * Every number a designer would want to change lives here and nowhere else.
 *
 * Explicitly typed rather than declared `as const`: a const assertion gives
 * numeric fields literal types (`5` instead of `number`), which then fail to
 * assign to mutable runtime state. That trap has already been hit once in this
 * repo — see the `lives` field in games/_template.
 *
 * Values are pre-playtest estimates derived from the throughput model in
 * DESIGN.md §8. Treat the shape of the curves as the design and the values as a
 * starting position.
 */

export interface HiveTuning {
  x: number;
  y: number;
  /** A route must start within this distance of the hive to be created. */
  drawRadius: number;
  depositSeconds: number;
}

export interface BeeTuning {
  baseSpeed: number;
  /** Per-bee speed variation, so the stream is not a rigid line. */
  speedJitter: number;
  baseCount: number;
  collectSeconds: number;
  nectarPerTrip: number;
  idleDriftRadius: number;
  /** Maximum sideways offset from the route centreline. */
  lateralSpread: number;
  /** How hard a bee corrects toward its target point. 0..1 per fixed step. */
  steerLerp: number;
  /** How long a bee mills about after finding no patch at the route's end. */
  confusedSeconds: number;
  /**
   * Minimum gap between two bees leaving the hive on the same route.
   *
   * Without this the swarm departs as one packet and travels as a dense blob,
   * which reads as a single object rather than as a stream of insects. Spacing
   * departures turns the same bees into a continuous line. Roughly
   * roundTripTime / beesPerRoute is the value that fills a route evenly.
   */
  departIntervalSeconds: number;
}

export interface RouteTuning {
  maxCount: number;
  /** Seconds at full length before the far end starts retreating. */
  holdSeconds: number;
  /** Retreat speed in px/s once decay begins. */
  decaySpeed: number;
  /** Below this live length the route dies. */
  minLength: number;
  /** A drag starting within this of a live end extends that route. */
  refreshSnapRadius: number;
  /** Resample distance when capturing the drag. */
  pointSpacing: number;
  maxLength: number;
}

export interface PatchTuning {
  baseCount: number;
  minRadius: number;
  maxRadius: number;
  /** Forgiveness so a route does not stop paying the instant decay starts. */
  reachRadius: number;
  /**
   * How near a flower a drag has to end for the route to snap onto it.
   *
   * Without this the player must land inside `reachRadius` by hand, which on a
   * phone means a lot of drags that visibly do nothing. Snapping makes "drag
   * toward a flower" always mean what it looks like it means.
   */
  aimAssistRadius: number;
  basePool: number;
  poolPerDay: number;
  rebloomSeconds: number;
  richMinRadius: number;
  richYieldMultiplier: number;
  nightBloomMultiplier: number;
  nightBloomWindowSeconds: number;
}

export interface DayTuning {
  baseSeconds: number;
  secondsPerDay: number;
  maxSeconds: number;
  nightScreenMinSeconds: number;
  quotas: readonly number[];
  quotaGrowthAfterTable: number;
}

export interface WindTuning {
  startDay: number;
  baseStrength: number;
  strengthPerDay: number;
  maxStrength: number;
  rotationSpeed: number;
}

export interface WaspTuning {
  startDay: number;
  secondWaspDay: number;
  speed: number;
  safeRadius: number;
  interceptRadius: number;
  scatterSeconds: number;
}

export interface UpgradeTuning {
  base: number;
  growth: number;
  levels: number;
  perLevel: number;
}

export interface Tuning {
  hive: HiveTuning;
  bee: BeeTuning;
  route: RouteTuning;
  patch: PatchTuning;
  day: DayTuning;
  wind: WindTuning;
  wasp: WaspTuning;
  upgrades: Record<
    'swarmSize' | 'beeSpeed' | 'routePersistence' | 'bloom' | 'honeyStore',
    UpgradeTuning
  >;
  offline: { baseCapHoney: number; baseWindowHours: number; honeyPerHour: number };
  ads: {
    rewardedSwarmBoostFromDay: number;
    rewardedSwarmBoostMultiplier: number;
    extendSeconds: number;
    extendOfferMissThreshold: number;
  };
}

export const TUNING: Tuning = {
  hive: {
    x: 640,
    y: 400, // below centre, leaving room for the HUD
    drawRadius: 110,
    depositSeconds: 0.15,
  },

  bee: {
    baseSpeed: 175,
    speedJitter: 0.18,
    baseCount: 24,
    collectSeconds: 0.35,
    nectarPerTrip: 1,
    idleDriftRadius: 90,
    lateralSpread: 14,
    steerLerp: 0.16,
    confusedSeconds: 0.4,
    departIntervalSeconds: 0.045,
  },

  // Retuned after the first playtest, which reported the original pacing as
  // "nagging". A 267px route previously produced for ~7.6s and died at ~11.9s,
  // so five routes demanded roughly twenty gestures per 45-second day. It now
  // produces for ~15s and dies at ~22s: about half the hand traffic, and the
  // grace window between "stopped paying" and "gone" grows from 3s to 7s.
  route: {
    maxCount: 5,
    holdSeconds: 12.0,
    decaySpeed: 26,
    minLength: 40,
    refreshSnapRadius: 160,
    pointSpacing: 12,
    maxLength: 900,
  },

  patch: {
    baseCount: 2,
    minRadius: 180,
    maxRadius: 520,
    reachRadius: 85,
    aimAssistRadius: 130,
    basePool: 200,
    poolPerDay: 45,
    rebloomSeconds: 3.5,
    richMinRadius: 400,
    richYieldMultiplier: 3,
    nightBloomMultiplier: 4,
    nightBloomWindowSeconds: 12,
  },

  day: {
    baseSeconds: 45,
    secondsPerDay: 5,
    maxSeconds: 90,
    nightScreenMinSeconds: 6,
    quotas: [60, 110, 170, 240, 320, 420, 540, 680, 850, 1050, 1280, 1550],
    quotaGrowthAfterTable: 1.22,
  },

  wind: {
    startDay: 4,
    baseStrength: 9,
    strengthPerDay: 1.6,
    maxStrength: 34,
    rotationSpeed: 0.12,
  },

  wasp: {
    startDay: 6,
    secondWaspDay: 9,
    speed: 95,
    safeRadius: 160,
    interceptRadius: 34,
    scatterSeconds: 1.2,
  },

  upgrades: {
    swarmSize: { base: 80, growth: 1.55, levels: 8, perLevel: 6 },
    beeSpeed: { base: 100, growth: 1.6, levels: 6, perLevel: 16 },
    // 12s → 22s of grace. Still the flagship: the only upgrade that directly
    // buys relief from the core pressure rather than more throughput.
    routePersistence: { base: 140, growth: 1.75, levels: 5, perLevel: 2.0 },
    bloom: { base: 120, growth: 1.8, levels: 4, perLevel: 1 },
    honeyStore: { base: 70, growth: 1.5, levels: 5, perLevel: 300 },
  },

  /**
   * Offline accrual.
   *
   * The cap is the only limit that binds, deliberately. An earlier tuning had a
   * 2-hour window at 90/hour against a 200 cap — the window always ran out
   * first, so the Honey Store upgrade raised a ceiling nothing ever reached and
   * did essentially nothing. One number the player can read off the upgrade
   * ("your hive holds 200 honey") is worth more than two that interact.
   *
   * The window stays fixed and generous; it exists only to stop a device clock
   * set years forward from paying out years of honey.
   */
  offline: {
    baseCapHoney: 200,
    baseWindowHours: 12,
    honeyPerHour: 200,
  },

  ads: {
    rewardedSwarmBoostFromDay: 3,
    rewardedSwarmBoostMultiplier: 1.5,
    extendSeconds: 15,
    extendOfferMissThreshold: 0.25,
  },
};

export const COLORS = {
  background: '#12100c',
  hive: 0xf2b134,
  bee: 0xffd966,
  beeLaden: 0xffa726,
  patch: 0x7fd1ae,
  patchDry: 0x4a5750,
  route: 0xffe08a,
  /** Text colours are CSS strings; Phaser text styles do not take hex numbers. */
  text: '#f4f4f8',
  dim: '#8a8aa0',
  good: '#7fd1ae',
  bad: '#ff8a65',
} as const;
