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
  /**
   * Honey per day each bee **beyond the starting swarm** costs to keep.
   *
   * The hive you were given is free; the hive you build is not. This is what
   * turns Brood Chamber from an auto-buy into a decision — six more bees is
   * more throughput every day and a bill every day — and it is the pressure
   * that replaces the route-refreshing busywork standing roads remove.
   *
   * Charged against the day's honey before it is banked, never against the
   * quota. Quota asks "did you work hard enough today"; upkeep asks "can you
   * afford the hive you have built".
   */
  upkeepPerBee: number;
  /** First day the hive starts charging. Early days stay clean. */
  upkeepFromDay: number;
  /** Fraction of the bill each level of Deeper Comb waives. */
  upkeepReliefPerComb: number;
  /** A route must start within this distance of the hive to be created. */
  drawRadius: number;
  depositSeconds: number;
  /** How far the hive itself lights the field at dawn. */
  sightRadius: number;
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
  /**
   * How far a bee lights the field around itself.
   *
   * This is the whole scouting mechanic. Drawing a line into the dark sends
   * bees down it, and they light it as they fly — so exploring is the verb the
   * player already has, not a second one to learn.
   */
  sightRadius: number;
}

export interface RouteTuning {
  maxCount: number;
  /**
   * Strength gained each time a bee completes a delivery on the route.
   *
   * This is what makes a path mean something. A line the swarm has actually
   * worked becomes a beaten track: it retreats slower, it barely bends in the
   * wind, and bees fly it faster. It is the only thing in the game the player
   * builds up rather than spends, and it is earned by use rather than bought.
   */
  strengthPerDelivery: number;
  /**
   * Fraction of remaining strength lost per second, so a neglected road goes
   * back to scrub. A rate, not an amount — see `Route.step` for why that
   * distinction is the difference between a dial and a hidden boolean.
   */
  strengthDecayPerSecond: number;
  /** At full strength, retreat is slowed by this fraction. */
  strengthDecayResist: number;
  /** At full strength, wind bends the route this much less. */
  strengthWindResist: number;
  /** At full strength, bees fly this much faster along it. */
  strengthSpeedBonus: number;
  /**
   * Strength at which a road stops decaying altogether and becomes permanent
   * for the day.
   *
   * The payoff the whole strength system was building toward. A road you have
   * genuinely committed the swarm to stops needing you, which turns a day from
   * "re-draw the same three lines forever" into "build your arteries, then go
   * and spend your hands on the frontier".
   *
   * Set so roughly one or two roads can stand at once, never all of them. If
   * every route could stand there would be no decision left; if none could, the
   * strength dial would have no destination.
   */
  standingStrength: number;
  /**
   * Fraction of strength kept when a route is redrawn from the hive rather than
   * refreshed from its tip.
   *
   * Extending keeps everything; starting over costs half. The design has wanted
   * the cheap gesture to matter economically since the first playtest, and this
   * is the first thing that gives it a price rather than just a shorter drag.
   */
  strengthKeptOnRedraw: number;
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
   * How much further out the frontier reaches each day.
   *
   * Only the *outer* edge moves. The inner edge stays put, so there is always a
   * near flower to fall back on and the distance-yield decision is live on
   * every day of a run rather than only the late ones.
   *
   * This is also what paces the fog. Day one's flowers spawn inside the hive's
   * own light, so the first thirty seconds are exactly what they were before
   * the board went dark; each day after that pushes a little more of the field
   * past the edge of what the hive can see, and the player walks into scouting
   * instead of being dropped into it.
   */
  radiusPerDay: number;
  /**
   * Where the distance-yield ramp starts and ends, and what it reaches.
   *
   * This is the change that turns distance from a pure cost into a decision.
   * Round trip is 2L/speed, so a flower three times further takes three times
   * as long to work and pays three times per trip — **identical honey per
   * second**. What actually differs is that the same pool lasts three times
   * longer. A far flower is therefore not "better", it is a longer-lived
   * investment that costs more to reach and more to hold, and a near flower is
   * the fallback that runs dry fast.
   */
  distanceYieldNear: number;
  distanceYieldFar: number;
  distanceYieldMax: number;
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
  fog: {
    cellSize: number;
    /** Reveal at the edge of a sight radius, rising to 1 at its centre. */
    edgeReveal: number;
    /** A flower or thicket is found once its cell is lit at least this much. */
    discoverAt: number;
    /** Radius the Scout Bees provision lights around the hive at dawn. */
    scoutRadius: number;
  };
  bramble: BrambleTuning;
  provisions: Record<
    'scoutBees' | 'pruningShears' | 'smokePot' | 'waxedTrails' | 'earlyRise',
    ProvisionTuning
  > & { costGrowth: number; costCapMultiplier: number };
  upgrades: Record<
    'swarmSize' | 'beeSpeed' | 'routePersistence' | 'bloom' | 'honeyStore' | 'comb',
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
  /**
   * The hive sits in the lower left, not the middle.
   *
   * A centred hive on a 1280x720 board caps a route at about 560px, so every
   * flower is a few seconds away and no route is ever a commitment. Moving the
   * hive to a corner roughly doubles the longest possible route without
   * shrinking anything on screen — which is the part that matters, because
   * zooming the camera out to fit a larger world would push a flower's reach
   * ring below the size a thumb can reliably hit.
   *
   * It also gives the board a direction. There is a home and there is a
   * frontier, rather than a circle you sit in the middle of.
   */
  hive: {
    x: 210,
    y: 545,
    drawRadius: 110,
    depositSeconds: 0.15,
    upkeepPerBee: 10,
    upkeepFromDay: 3,
    upkeepReliefPerComb: 0.12,
    // Sized against the *discovery* threshold, not the radius. Reveal falls off
    // linearly to `fog.edgeReveal` at the rim, so a flower only counts as found
    // inside about 0.79 of this — at 340 that was 267px, and day one's band
    // reaches 300, so half the time the tutorial had nothing to point at.
    sightRadius: 420,
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
    sightRadius: 105,
  },

  // Retuned after the first playtest, which reported the original pacing as
  // "nagging". A 267px route previously produced for ~7.6s and died at ~11.9s,
  // so five routes demanded roughly twenty gestures per 45-second day. It now
  // produces for ~15s and dies at ~22s: about half the hand traffic, and the
  // grace window between "stopped paying" and "gone" grows from 3s to 7s.
  route: {
    maxCount: 5,
    // Tuned as an equilibrium, not as a count. A route carrying D deliveries a
    // second settles at D x perDelivery / decay, and reaches it with a time
    // constant of 1/decay — about ten seconds.
    //
    // The delivery rate across real routes spans roughly 2/s (a long line
    // holding a third of the swarm) to 18/s (a short one holding all of it), so
    // a ratio of 0.152 puts a thin far road at about a third strength, a
    // middling one at about six tenths, and a short fat one at full.
    //
    // That spread is what makes the split decision bite. Three routes give
    // three half-roads; one route gives one real road. Choosing between them is
    // the question this game has been about since day two, and strength is the
    // first thing that pays out differently depending on the answer.
    strengthPerDelivery: 0.018,
    strengthDecayPerSecond: 0.1,
    standingStrength: 0.8,
    strengthDecayResist: 0.75,
    strengthWindResist: 0.85,
    strengthSpeedBonus: 0.35,
    strengthKeptOnRedraw: 0.5,
    holdSeconds: 12.0,
    decaySpeed: 26,
    minLength: 40,
    refreshSnapRadius: 160,
    pointSpacing: 12,
    // The board is twice as deep now the hive sits in a corner.
    maxLength: 1400,
  },

  patch: {
    baseCount: 2,
    // Day one's band is 230-300, comfortably inside the hive's 340 light.
    minRadius: 230,
    maxRadius: 300,
    reachRadius: 85,
    aimAssistRadius: 130,
    // Sized so one flower under the full swarm's attention runs dry in roughly
    // 25-35 seconds at any point in the progression. Big enough that a day is
    // never lost to an empty field, small enough that standing still is wrong.
    // Scales with the day because the swarm's throughput does too.
    basePool: 180,
    poolPerDay: 70,
    radiusPerDay: 95,
    distanceYieldNear: 260,
    distanceYieldFar: 1000,
    // 1000/260 rounded down. The multiplier has to match the *distance ratio*,
    // not some pleasing round number: at 3x over a 3.85x span a far flower paid
    // 22% less per second than a near one, so with thorns, wasps and a bigger
    // draw cost on top of that nobody would ever have gone out there and the
    // whole map would have been decoration.
    distanceYieldMax: 3.8,
    richMinRadius: 700,
    richYieldMultiplier: 3,
    nightBloomMultiplier: 4,
    nightBloomWindowSeconds: 12,
  },

  day: {
    baseSeconds: 45,
    secondsPerDay: 5,
    maxSeconds: 90,
    nightScreenMinSeconds: 6,
    // Re-tuned against the deeper board. Distance-yield and beaten-in roads
    // both raise throughput, so the old table left a competent player at three
    // to four times quota through the whole midgame — no day after the first
    // was ever in doubt, which is the opposite of what the table is for.
    //
    // Set against a simulated player who actually *spends* what the run earns.
    // The first attempt was tuned against one that banked more than half its
    // honey, which made the late game look unclearable when the real problem
    // was that the model was not buying anything. A player who under-invests
    // now stalls around day eight, which is the meta-progression working.
    //
    // Tightened again once standing roads landed. They remove the busywork of
    // holding a line open, so the difficulty had to move somewhere — it moved
    // into the quota and into the hive's daily bill, which is the trade the
    // whole management layer is built on: less thumb, more decision.
    quotas: [60, 110, 300, 540, 600, 780, 880, 1000, 1220, 1450, 1650, 1900],
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
   * Fog.
   *
   * A 24px cell is finer than anything the player can act on and coarse enough
   * that the whole grid is 1620 cells — small enough to push through a canvas
   * texture whenever it changes without thinking about it.
   */
  fog: {
    cellSize: 24,
    edgeReveal: 0.3,
    discoverAt: 0.45,
    scoutRadius: 620,
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
    maxCount: 3,
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
    /**
     * The hive itself.
     *
     * Deliberately the one upgrade with no immediate effect on a day's honey:
     * it cuts the standing bill and raises the ceiling on everything else. That
     * makes the night screen a real allocation question — spend on output now,
     * or on the hive that lets you afford more output later — which is the
     * management layer the other five cards never had.
     */
    comb: { base: 150, growth: 1.7, levels: 5, perLevel: 1 },
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
