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
  /**
   * Workers dispatched per pixel of route drawn.
   *
   * This is what drawing costs. A new line does not appear for free: workers
   * peel off the swarm to fly it, and while they are out there they are not
   * carrying nectar. Because the count scales with length, refreshing a short
   * stub costs a handful of bees and redrawing a long route costs a crowd —
   * which is what finally makes the retreat-from-the-tip economy matter in
   * resources rather than only in thumb effort.
   *
   * Charging the swarm rather than inventing a currency keeps the cost inside
   * the decision the game is already about: the swarm is finite, and every
   * route you commit to is swarm you are not spending elsewhere.
   */
  workersPerPixel: number;
  /** Never commit more than this fraction of the swarm to building at once. */
  maxWorkerFraction: number;
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
  /**
   * How much the field spreads per day.
   *
   * Distance is already structurally expensive — retreat speed is constant in
   * px/s, so a long route loses its flower just as fast but costs far more to
   * rebuild, and now more workers to draw. Pushing flowers outward therefore
   * ramps difficulty using pressure that already exists, rather than adding a
   * new one.
   */
  radiusPerDay: number;
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

export interface BrambleTuning {
  /** First day thorns appear at all. */
  startDay: number;
  /** Radius of a fresh thicket, before the per-day term. */
  baseRadius: number;
  radiusPerDay: number;
  maxRadius: number;
  /** Hard ceiling on how many can be on the field at once. */
  maxCount: number;
  /**
   * How fast a thicket spreads, in px/s.
   *
   * Small on purpose: over a 90-second day this is about +30px, which is enough
   * to close a gap the player was relying on without ever feeling like the
   * field moved under them. It is the same shape of pressure as flowers running
   * dry — the board gets harder as the day goes on, so a route that was right
   * at dawn is not automatically right at dusk.
   */
  growthPerSecond: number;
  /** How much larger a thicket can get than the size it was placed at. */
  growthFactor: number;
  /** Fraction along the hive→flower line where a thicket is placed. */
  minLineFraction: number;
  maxLineFraction: number;
  /** Clearance kept from the hive ring, a flower's reach ring, and each other. */
  hiveClearance: number;
  patchClearance: number;
  siblingClearance: number;
  /**
   * How much of a flower's reach ring must stay clear of thorns.
   *
   * Not all of it. A thicket may bite into the outer edge of a ring — the
   * player simply approaches from the open side, which is the puzzle working as
   * intended. Demanding the whole ring stay clear was the difference between a
   * field with thorns on it and a field with almost none: at five flowers, a
   * point far enough from every ring barely exists.
   */
  patchRingFraction: number;
}

export interface ProvisionTuning {
  /** Price at day one. Grows by `costGrowth` per day. */
  base: number;
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
  bramble: BrambleTuning;
  provisions: Record<
    'scoutBees' | 'pruningShears' | 'smokePot' | 'waxedTrails' | 'earlyRise',
    ProvisionTuning
  > & { costGrowth: number; costCapMultiplier: number };
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
    // ~12 workers for a 400px route, ~3 for a 90px refresh. Tuned down hard
    // from 0.08/0.55, which took over half a day-one swarm on a single draw and
    // made day one unwinnable — the exact failure mode of taxing the core verb.
    workersPerPixel: 0.03,
    maxWorkerFraction: 0.35,
  },

  // Retuned after the first playtest, which reported the original pacing as
  // "nagging". A 267px route previously produced for ~7.6s and died at ~11.9s,
  // so five routes demanded roughly twenty gestures per 45-second day. It now
  // produces for ~15s and dies at ~22s: about half the hand traffic, and the
  // grace window between "stopped paying" and "gone" grows from 3s to 7s.
  route: {
    maxCount: 3,
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
    // Sized so one flower under the full swarm's attention runs dry in roughly
    // 25-35 seconds at any point in the progression. Big enough that a day is
    // never lost to an empty field, small enough that standing still is wrong.
    // Scales with the day because the swarm's throughput does too.
    basePool: 180,
    poolPerDay: 70,
    radiusPerDay: 20,
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

  // Shifted a day later than the original schedule to make room for brambles on
  // day 3. The rule the schedule exists to protect is one new element at a
  // time with a quiet day after it, not any particular day number.
  wind: {
    startDay: 5,
    baseStrength: 9,
    strengthPerDay: 1.6,
    maxStrength: 34,
    rotationSpeed: 0.12,
  },

  wasp: {
    startDay: 7,
    secondWaspDay: 11,
    speed: 95,
    safeRadius: 160,
    interceptRadius: 34,
    scatterSeconds: 1.2,
  },

  /**
   * Thorn thickets. See sim/Bramble.ts for why the game needed them.
   *
   * Sized against the field the flowers actually sit in: a thicket is roughly
   * two and a half flower-reach-rings across, big enough that going around it
   * is a real detour and small enough that the detour is one flick of a thumb
   * rather than a scenic tour of the canvas.
   */
  bramble: {
    startDay: 3,
    // Sized against the corridor a thicket actually has to fit inside. Between
    // the hive draw ring and a flower's reach ring there is only
    // `distance - 110 - 85` of usable line, and both ends have to stay clear at
    // the thicket's *grown* size. At 58px growing to 1.35x the corridor came out
    // at 412-487px, wider than most flowers are far — and every placement was
    // silently rejected, so the field shipped with no thorns on it at all.
    baseRadius: 48,
    radiusPerDay: 3,
    maxRadius: 72,
    maxCount: 5,
    growthPerSecond: 0.35,
    growthFactor: 1.22,
    minLineFraction: 0.28,
    maxLineFraction: 0.78,
    hiveClearance: 10,
    patchClearance: 12,
    siblingClearance: 24,
    patchRingFraction: 0.6,
  },

  /**
   * One-use purchases, spent on the next day only.
   *
   * Priced at roughly half a first upgrade level so they are affordable most
   * nights, and grown per day so they stay a real choice rather than becoming
   * free background noise by day fifteen. The cap stops the curve outrunning
   * the quota curve late.
   */
  provisions: {
    costGrowth: 1.15,
    costCapMultiplier: 9,
    scoutBees: { base: 55 },
    pruningShears: { base: 65 },
    smokePot: { base: 70 },
    waxedTrails: { base: 80 },
    earlyRise: { base: 45 },
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
  bramble: 0x3a2f22,
  brambleThorn: 0x6b5a3e,
  route: 0xffe08a,
  /** Text colours are CSS strings; Phaser text styles do not take hex numbers. */
  text: '#f4f4f8',
  dim: '#8a8aa0',
  good: '#7fd1ae',
  bad: '#ff8a65',
} as const;
