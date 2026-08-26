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
  /** Maximum fixed sideways offset from the route centreline. */
  lateralSpread: number;
  /** How far the weave carries a bee off that lane, at its widest. */
  weaveAmplitude: number;
  /** Design units of route covered by one full weave. */
  weaveLength: number;
  /** Per-bee variation in that, as a fraction. Keeps the swarm out of step. */
  weaveLengthJitter: number;
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

/**
 * One kind of wasp.
 *
 * Three of them, because one enemy that always behaves the same way is a
 * timer with wings — the playtest called the single wasp "no skill, no real
 * threat, and very boring", and being alone was half of why. A wave you have
 * to *read* before you answer it is a different thing entirely.
 */
export interface WaspKindTuning {
  speed: number;
  /** Bee hits to bring one down. */
  health: number;
  /**
   * Share of the **day's quota** one of these takes in a full uninterrupted
   * raid.
   *
   * Expressed against the quota rather than as honey per second, which is the
   * fix for the flattest note in the report: "even though you let the wasp in
   * almost nothing happens". A flat 14/second was 6% of a day-ten quota and
   * literal noise by day fifteen. A share stays a threat at every point in the
   * run, and the arithmetic a player does is the one that matters — "that is a
   * fifth of my day walking out of the door".
   */
  stealShare: number;
  /** Seconds between this kind driving off one more bee at the hive. */
  beeLossInterval: number;
  /**
   * Chance a bee that lands a hit is lost.
   *
   * The other half of "there is no fight". Bees used to strike for free, so
   * defending was a button rather than a trade. Now a hornet costs real swarm
   * to bring down, and whether to pay is the decision.
   */
  retaliation: number;
  /** Drawn size, relative to the base sprite. */
  scale: number;
  tint: number;
  /** Shown in the wave forecast. */
  name: string;
}

export interface WaspTuning {
  startDay: number;
  safeRadius: number;
  interceptRadius: number;
  scatterSeconds: number;
  kinds: { raider: WaspKindTuning; drone: WaspKindTuning; hornet: WaspKindTuning };
  /** How long a wasp lingers at the hive before leaving on its own. */
  raidSeconds: number;
  /** Damage one arriving bee does. */
  beeDamage: number;
  /** How close a bee has to be to strike, and a route's tip to be a guard. */
  reachRadius: number;
  /** How close a wasp must get to the hive to start robbing it. */
  arriveRadius: number;
  /** Seconds between blows from one Guard Bee. */
  guardInterval: number;
  /** How long a bee will chase a wasp off the road before giving up. */
  huntSeconds: number;
  /** Quiet seconds before a guard line stands down on its own. */
  standDownSeconds: number;
  /**
   * Most of the swarm a single wave may ever take, as a fraction.
   *
   * The cap exists because the per-wasp numbers were sized against *one* wasp
   * and then the wave was made eight of them. Measured over a run, raids were
   * taking twenty-five to thirty-five bees a day against a swarm of thirty —
   * the entire hive, every day, which is why the later days produced no more
   * money than the early ones. A wave should be a bite, not a wipe.
   */
  maxSwarmLossPerRaid: number;
  /** How near a drag has to end for it to count as aimed at a wasp. */
  aimRadius: number;
}

export interface RaidTuning {
  minGapSeconds: number;
  maxGapSeconds: number;
  firstRaidEarliest: number;
  warningSeconds: number;
  /** Wasps in the first wave. */
  baseSize: number;
  /** One more wasp per this many days. */
  sizeEveryDays: number;
  maxSize: number;
  /** Day the quick drones start turning up. */
  droneFromDay: number;
  /** Day the heavy hornets start turning up. */
  hornetFromDay: number;
  /** Fraction of a wave that is drones / hornets once they appear. */
  droneShare: number;
  hornetShare: number;
}

export interface BuyerTuning {
  name: string;
  /** Money paid per unit of honey at this buyer's own normal. */
  basePrice: number;
  /** Seconds for the slow wave and the fast one. */
  periodSlow: number;
  periodFast: number;
  /** How far each wave moves the price, as a fraction of base. */
  swingSlow: number;
  swingFast: number;
  /** Price floor, as a fraction of base. Nobody ever pays nothing. */
  floorFraction: number;
  /** How much one unit of honey sold here depresses the price. */
  saturationPerHoney: number;
  /** How fast that wears off, per second. */
  saturationRecovery: number;
  maxSaturation: number;
  /** Board position, in design units. */
  x: number;
  y: number;
  tint: number;
}

export interface HoneyTuning {
  /** Hive capacity at level zero. Deliberately small — see the runtime note. */
  baseCap: number;
  /** Most honey one bee carries to a buyer per trip, as a flat amount. */
  perSellTrip: number;
  /** And as a fraction of hive capacity, so trips-to-empty stays constant. */
  maxTripShare: number;
  /** How near a route's tip must be for its bees to trade. */
  reachRadius: number;
  /** How near a drag has to end to count as aimed at a buyer. */
  aimRadius: number;
  /** How much board a depot lights at dawn. Not the same as its reach. */
  revealRadius: number;
}

export interface MazeTuning {
  /** Grid the board is carved into. Cells are the corridors. */
  cols: number;
  rows: number;
  /**
   * How thick a wall is drawn, in design units.
   *
   * Purely cosmetic — collision is "did the line cross a closed edge", so the
   * bar is drawn centred on that edge. Thick enough to read as terrain at phone
   * scale, thin enough that it never looks like it is eating the corridor it
   * borders.
   */
  wallThickness: number;
  /**
   * How open the board is, 0..1. The single difficulty knob.
   *
   * 1 removes every interior wall and gives back the open field the game had
   * before; 0 is a perfect maze with exactly one route to each flower. The ramp
   * between them is the escalation.
   *
   * It never reaches 0. A perfect maze is a puzzle with one answer, and the
   * decision worth having is *which* way round — the short winding path, or the
   * long open one that is quicker to redraw when it decays.
   */
  opennessDay1: number;
  opennessFloor: number;
  /** Days taken to fall from the opening board to the tightest one. */
  tighteningDays: number;
  /** First day any wall appears at all. */
  startDay: number;
  /**
   * A rectangle of cells kept clear of walls, in cell coordinates inclusive.
   *
   * The hive's front yard: the strip of board the two shops stand on. See the
   * note on `maze.yard` for why home ground is open and only the frontier is a
   * maze.
   */
  yard: { col0: number; row0: number; col1: number; row1: number };
}

export interface ItemShopTuning {
  /** Cards on the table each night. */
  offerCount: number;
  /** Price at day one, by rarity. Grows by `costGrowth` per day. */
  cost: { common: number; rare: number; epic: number };
  costGrowth: number;
  costCapMultiplier: number;
  rerollBase: number;
  /** Multiplier on the reroll price for each reroll already taken tonight. */
  rerollGrowth: number;
  epicChanceBase: number;
  epicChancePerDay: number;
  epicChanceMax: number;
  rareChance: number;
}

/**
 * Level ceiling for an upgrade that is not meant to have one.
 *
 * A finite number rather than `Infinity` on purpose: it flows through save
 * clamping, cost tables and display, and every one of those has an awkward
 * edge with a non-finite value. At the growth rates here, level 400 costs
 * more honey than exists, so it is a ceiling in the same sense that the
 * speed of light is a speed limit.
 */
export const UNCAPPED = 400;

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
  buyers: Record<'market' | 'apothecary', BuyerTuning>;
  honey: HoneyTuning;
  raid: RaidTuning;
  fog: {
    cellSize: number;
    /** Reveal at the edge of a sight radius, rising to 1 at its centre. */
    edgeReveal: number;
    /** A flower or thicket is found once its cell is lit at least this much. */
    discoverAt: number;
    /** Radius the Scout Bees item lights around the hive at dawn. */
    scoutRadius: number;
  };
  maze: MazeTuning;
  items: ItemShopTuning;
  upgrades: Record<
    'swarmSize' | 'beeSpeed' | 'routePersistence' | 'bloom' | 'honeyStore' | 'combWax',
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
    // Up and to the right of the board's bottom-left corner, which is what
    // clears room for the yard below and beside it. Not further: the hive is
    // still meant to sit in a corner with a frontier in front of it, not in
    // the middle of a field it looks out over in every direction.
    x: 266,
    y: 492,
    drawRadius: 110,
    depositSeconds: 0.15,
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
    /**
     * The two lanes, and the weave laid over them.
     *
     * `lateralSpread` was 14 and doing the whole job alone, which meant the
     * swarm flew a route as two dead-straight lines. The lane is now narrower
     * and the weave carries the rest, so the total envelope is about the same
     * width as before — the bees are not spread wider, they are spread
     * *differently*, along a curve instead of a rail.
     *
     * Width is capped by the corridors rather than by taste: a cell is 116 deep
     * and a hedge eats 20 of it, so a bee more than about 25 off a centreline
     * that runs beside a wall would be drawn inside the hedge. It does not
     * collide — bees never do — but it would look like it should.
     *
     * The wavelength is a little under a corridor, so a bee crossing one cell
     * completes roughly one weave. Much longer and the path reads as a gentle
     * bend rather than as flight; much shorter and it reads as a rattle.
     */
    lateralSpread: 9,
    weaveAmplitude: 8,
    weaveLength: 96,
    weaveLengthJitter: 0.35,
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
    strengthPerDelivery: 0.0152,
    strengthDecayPerSecond: 0.1,
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
    //
    // `poolPerDay` was 70, and that second sentence had stopped being true.
    // Measured at day ten: a flower held 810 pollen, and against a 3.8x
    // distance multiplier that is up to 3,078 honey on one flower for a quota
    // of 2,050. **One flower was more than the whole day.** So the loop this
    // game is built on — work a flower, watch it run dry, pick the next one and
    // draw again — simply stopped happening: you drew one route, waited, and
    // won. The day was long enough to be boring rather than short enough to be
    // tight, which is exactly the "not challenging, too many resources" report.
    //
    // At 55 a day-ten flower holds 675, or roughly 1,485 honey once distance is
    // paid. Clearing 2,050 therefore means genuinely working three or four
    // flowers, which is three or four drags and a retarget every time one dies.
    // The board carries more flowers to compensate, so the income is there —
    // it just has to be gone and got rather than parked on.
    // The throughput per flower is untouched — only how long it lasts — so the
    // 25-35 second figure above still holds for the flower you are on.
    basePool: 180,
    poolPerDay: 55,
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
    // Dropped from 3 once yield started following the path through the maze
    // rather than the crow-flies distance. Stacked on a 3.8x distance
    // multiplier it put 10,000 honey on a single flower against a day quota of
    // 1,900, which made the quota look like a rounding error.
    richYieldMultiplier: 2,
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
    // The tail climbs slightly steeper than before, and Comb Wax is why.
    //
    // Quotas compound and a player's power did not: every line used to max out
    // around day ten and hand over its full effect at once, after which the
    // curve simply ran away. An uncapped economic line changes the shape — a
    // player who keeps buying keeps earning more, so the quota can keep asking
    // for more, and the run ends when the player stops keeping up rather than
    // when the shop runs out.
    //
    // Days one to seven are untouched. That is where a new player decides
    // whether to keep going, and none of this problem lives there.
    // Rebuilt from measurement rather than from the old honey figures.
    //
    // The previous table asked for 3,722 on day sixteen against a swarm that
    // measurably earns about 600, so every run died on day seven and stayed
    // dead — which is most of why the game did not make anyone want another
    // one. A scripted player that gathers, sells and **never defends** now
    // sits just under the line from day seven and comfortably over it before
    // that, so ignoring the wasps is survivable early and fatal later, and
    // answering them is what buys the rest of the run.
    //
    // Growth after the table is 5% a day, not 18%. Throughput grows with the
    // swarm and the swarm grows linearly; a compounding quota against linear
    // production has exactly one outcome and it is the one we had.
    quotas: [70, 140, 240, 340, 430, 520, 580, 640, 700, 760, 820, 880],
    quotaGrowthAfterTable: 1.05,
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

  /**
   * Wasps, and the raids they come in.
   *
   * They used to drift about scattering the odd bee, which the playtest called
   * out as doing "almost nothing". They now come for the hive itself.
   *
   * Timing is deliberately **random inside a range** rather than on a fixed
   * interval. A metronome is something you learn once and then stop looking at;
   * an unpredictable arrival keeps you watching the board, which is the whole
   * point of putting an enemy on it. The warning is what keeps that fair —
   * surprise about *when*, never about *whether you had a chance*.
   */
  /**
   * Wasps, in three kinds.
   *
   * The single raider that used to turn up alone was reported as "no skill, no
   * real threat, and very boring", and both halves of that were true in the
   * numbers. It stole a flat 140 honey — six percent of a day-ten quota — and
   * bees killed it for free, so there was no fight to have and nothing much
   * lost by skipping it.
   *
   * What replaces it is a **wave you have to read**. Raiders go for the honey,
   * drones are fast and go for the swarm, hornets are slow, tough and take a
   * tenth of the day's quota each. Every one of them hits back, so a defence
   * costs bees and choosing what to answer is the game.
   */
  wasp: {
    startDay: 7,
    safeRadius: 160,
    interceptRadius: 34,
    scatterSeconds: 1.2,

    kinds: {
      /** The staple. Middling everything; the wave is mostly these. */
      raider: {
        speed: 95,
        health: 3,
        stealShare: 0.05,
        beeLossInterval: 5.5,
        retaliation: 0.12,
        scale: 1,
        tint: 0xffffff,
        name: 'raiders',
      },
      /**
       * Fast and fragile, and after the swarm rather than the stores.
       *
       * The one that punishes a slow reaction. It is at the door before a
       * comfortable defence is drawn, so the answer is a line already sitting
       * across the approach — which is the whole reason placing a guard line
       * early is a skill worth having.
       */
      drone: {
        speed: 165,
        health: 2,
        stealShare: 0.02,
        beeLossInterval: 3.0,
        retaliation: 0.06,
        scale: 0.78,
        tint: 0xbfe06a,
        name: 'drones',
      },
      /**
       * Slow, tough, and expensive to leave alone.
       *
       * A tenth of the quota each, and it takes seven hits to drop while
       * downing over half the bees that land them. Meeting one head-on is
       * rarely right; the shape of the answer is a line placed where it has to
       * pass, plus Guard Bees at the door for what gets through.
       */
      hornet: {
        speed: 68,
        health: 7,
        stealShare: 0.1,
        beeLossInterval: 7.0,
        retaliation: 0.28,
        scale: 1.4,
        tint: 0xff8a5c,
        name: 'hornets',
      },
    },

    /** How long a wasp lingers at the hive before leaving on its own. */
    raidSeconds: 10,
    /** Damage one arriving bee does. */
    beeDamage: 1,
    /** How close a bee has to be to strike, and a route's tip to be a guard. */
    reachRadius: 74,
    /** How close a wasp must get to the hive to start robbing it. */
    arriveRadius: 70,
    // Two guards bring a raider down in about a second and a half, so a
    // stacked defence genuinely holds the door while a single one only buys
    // time. That gap is what makes the second copy worth buying.
    guardInterval: 1.0,
    // Bounded, and shorter than it sounds. Bees are much faster than wasps, so
    // four seconds is a comfortable margin for a chase that started next to its
    // target — and a hard stop on one that did not, so a bad drag costs a trip
    // rather than removing a bee from the day.
    huntSeconds: 4,
    // Long enough to cover the gaps inside a wave — wasps arrive in ones and
    // twos, and standing down on the first quiet frame would dissolve the line
    // mid-fight — and short enough that the slot is back before the player has
    // finished noticing they won.
    standDownSeconds: 2.5,
    maxSwarmLossPerRaid: 0.16,
    // Wider than the flower assist, because a wasp is a moving target. A drag
    // aimed squarely at one still ends well behind it: the wasp covers most of
    // a corridor in the second the gesture takes.
    aimRadius: 200,
  },

  raid: {
    // Wider than the old 16-38 because a wave is a bigger event than a single
    // wasp was: two or three a day that each demand an answer, rather than
    // three that could all be ignored.
    /** Gap between waves, sampled uniformly. Never a metronome. */
    minGapSeconds: 22,
    maxGapSeconds: 46,
    /** Quiet opening so the first wave never lands before the day has started. */
    firstRaidEarliest: 18,
    /**
     * Seconds of warning before the wave appears.
     *
     * The whole fairness budget. Longer than it was, because there is now more
     * to decide in it than "draw a line at the wasp" — the forecast names what
     * is coming, and reading it is the point.
     */
    warningSeconds: 3.4,
    /**
     * Wave size. Three on the day wasps arrive, growing to ten.
     *
     * "Why are there only 1 usually" was the other half of the report, and it
     * was right: a lone enemy cannot make a board feel besieged however hard it
     * hits. A wave can be triaged, funnelled and partly let through, which is
     * where the skill lives.
     */
    baseSize: 3,
    sizeEveryDays: 2,
    maxSize: 10,
    // Placed in the gaps the rest of the schedule leaves: rich patches take
    // day nine and the night bloom takes day twelve, and the rule this repo
    // has kept since the first draft is one new thing to learn at a time.
    droneFromDay: 10,
    hornetFromDay: 13,
    droneShare: 0.35,
    hornetShare: 0.2,
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
   * The bramble maze. See sim/Maze.ts for why the scattered thorns became one.
   *
   * An 8x5 grid over the playfield gives corridors 160 x 122 design units
   * across — over 45 CSS pixels on a phone in landscape. That width is the
   * constraint everything else bends to: the interesting part of a maze has to
   * be its topology, never its precision, because a tight corridor cannot be
   * traced with a thumb.
   */
  maze: {
    cols: 8,
    rows: 5,
    wallThickness: 20,
    opennessDay1: 1,
    opennessFloor: 0.28,
    tighteningDays: 10,
    startDay: 3,
    /**
     * The hive's front yard: the bottom-left strip, always open.
     *
     * **Home ground is open; the frontier is a maze.** Selling is the pressure
     * inside the loop rather than the reward at the end of it, and a hedge
     * between the hive and the shop it has to reach in the next few seconds
     * makes an emergency into a puzzle — at exactly the moment the player has
     * no attention to spare for one. Foraging is where the maze earns its keep,
     * and foraging happens everywhere else.
     *
     * It also gives the board a readable shape. There is a *town* down here —
     * hive, two shops, open ground between them — and a wilderness beyond it,
     * rather than one undifferentiated grid.
     *
     * Two cells by two, holding the hive and both shops: the hive top-right of
     * the block, one shop out to its left and one directly below it, and the
     * fourth cell left open as the corner they all look into. Cleared after
     * generation, so the spanning tree has already made every cell reachable
     * and this can only add routes.
     */
    yard: { col0: 0, row0: 3, col1: 1, row1: 4 },
  },

  /**
   * One-use purchases, spent on the next day only.
   *
   * Priced at roughly half a first upgrade level so they are affordable most
   * nights, and grown per day so they stay a real choice rather than becoming
   * free background noise by day fifteen. The cap stops the curve outrunning
   * the quota curve late.
   */
  /**
   * The item shop.
   *
   * Prices are set against a day's take rather than against each other: an
   * early common is roughly a third of a good day, an epic is most of one. That
   * is what makes a night a decision instead of a shopping list — you cannot
   * have the row, only a piece of it.
   *
   * The reroll is priced to be used once and thought about twice. Doubling each
   * time keeps the escape hatch open without letting a patient player fish the
   * pool for the one item they wanted.
   */
  items: {
    offerCount: 4,
    cost: { common: 110, rare: 240, epic: 480 },
    costGrowth: 1.15,
    costCapMultiplier: 9,
    rerollBase: 60,
    rerollGrowth: 1.9,
    // Epics stay a rare thrill early and become a real possibility deep in a
    // run, which is what keeps a long run producing things you have not seen.
    epicChanceBase: 0.04,
    epicChancePerDay: 0.012,
    epicChanceMax: 0.2,
    rareChance: 0.3,
  },

  /**
   * Every level is a thing to want on the night screen.
   *
   * The ceiling used to be 12,556 honey to buy literally everything, against a
   * board that supplied 40,000 by day ten. A player was maxed out with money
   * left over and a night screen full of nothing — the report was "maxed out on
   * almost everything, lots of resource, not many places to spend it", and the
   * arithmetic agreed.
   *
   * The lines are extended rather than a sixth line invented. More *kinds* of
   * upgrade would mean more to read on a screen the player is trying to get
   * through quickly; more levels of a line they already understand costs no
   * comprehension at all, and the geometric price curve does the rest — the top
   * levels of swarm size are the honey sink that the late game was missing.
   *
   * Growth rates are unchanged. They were tuned against the shape of the run,
   * and it is the length of the ladder that was wrong, not its steepness.
   */
  upgrades: {
    swarmSize: { base: 80, growth: 1.55, levels: 12, perLevel: 6 },
    beeSpeed: { base: 100, growth: 1.6, levels: 9, perLevel: 16 },
    // 12s → 26s of grace. Still the flagship: the only upgrade that directly
    // buys relief from the core pressure rather than more throughput.
    routePersistence: { base: 140, growth: 1.75, levels: 7, perLevel: 2.0 },
    bloom: { base: 120, growth: 1.8, levels: 6, perLevel: 1 },
    // Seven, not more: the offline window can only ever earn
    // `baseWindowHours * honeyPerHour` = 2,400, and a cap above that is a
    // ceiling nothing reaches. Level seven puts it at 2,300, just under. There
    // is a test that fails the moment this line raises a ceiling that does not
    // bind, which is what caught an eighth level being added here.
    // Re-sized when this line stopped being an offline curiosity and became
    // the hive's actual capacity: 220 at level zero to 710 at the top, so the
    // pressure to sell eases across a run without ever going away.
    honeyStore: { base: 70, growth: 1.5, levels: 7, perLevel: 70 },
    /**
     * The line that never runs out.
     *
     * Every other upgrade has to stop somewhere, and not for want of
     * generosity: unbounded bee speed breaks a fixed-timestep simulation,
     * unbounded route hold deletes the decay the whole game is built on, and
     * unbounded swarm size is a GameObject per bee. Those are real ceilings.
     *
     * So the ladder that has no ceiling is an economic one. Comb Wax pays a
     * flat percentage more honey per delivery, which is safe to grow forever
     * — it scales income, and the quota curve compounds too, so the two can
     * chase each other indefinitely without anything in the simulation
     * having to move faster or hold more.
     *
     * It is what makes the night screen never say "nothing to buy". A player
     * who has capped everything else still has somewhere to put a day's
     * honey, and still watches a number go up for putting it there. The
     * growth rate is gentler than the rest (1.28) precisely so it stays a
     * purchase rather than becoming a monument.
     */
    combWax: { base: 90, growth: 1.28, levels: UNCAPPED, perLevel: 0.04 },
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
  /**
   * The two buyers.
   *
   * The Market is close, steady and cheap; the Apothecary is further, wild and
   * pays much better at its peaks. That contrast is the decision — not "which
   * number is bigger right now", but whether a longer run to a swinging price
   * is worth the trips it costs, with a hive filling up while you decide.
   *
   * ### Why they sit near the hive
   *
   * They used to be planted on the far side of the board, on the theory that
   * selling should be a real journey. It was the wrong theory. Selling is not
   * the reward at the end of the loop, it is the *pressure inside* it — the
   * hive is small, it spills, and the answer to a brimming hive has to be
   * reachable inside the few seconds before honey starts walking out of the
   * door. A depot four corridors away turned that pressure into a chore, and
   * turned the near-versus-far decision into a foregone one, because at that
   * range both buyers were simply *far*.
   *
   * Both now stand in the hive's front yard — the wall-free block in the
   * bottom-left corner, see `maze.yard`. Money Inc. sits directly below the
   * hive and Honey Inc. out to its left, both a few seconds' flight away.
   *
   * That leaves **the price doing nearly all the work**, and it is worth being
   * honest that this is a narrower decision than the one the two buyers were
   * built for. When the shops stood on opposite edges of the board, choosing
   * between them was half geography: a long line to a volatile price was a real
   * commitment of bees and of road. Side by side in the yard, the flights are
   * within a fifth of each other and the question collapses to "steady, or
   * swinging?".
   *
   * That question is still a question — the Apothecary's swings are wide enough
   * that catching one is the best thing that happens in a day — but if the
   * market ever stops feeling like a decision, this is the reason, and the fix
   * is in the swings and the saturation rather than in moving the buildings
   * back out.
   *
   * Both sit on maze cell centres inside the yard, so a shop never lands inside
   * a wall and the yard never grows one around it. Flower placement blocks the
   * whole yard — see `Field.randomPatchPosition`.
   */
  buyers: {
    market: {
      // The studio's own drawings name the two shops, so the fiction follows
      // the art rather than the other way round.
      name: 'Money Inc.',
      basePrice: 1,
      // A slow wave you can plan around and a small fast one so the number is
      // never quite still. Steady enough to be the answer when the hive is
      // brimming and there is no time to gamble.
      periodSlow: 60,
      periodFast: 26,
      swingSlow: 0.2,
      swingFast: 0.08,
      floorFraction: 0.45,
      saturationPerHoney: 0.0011,
      saturationRecovery: 0.055,
      maxSaturation: 0.45,
      // Directly below the hive, a short drop straight down. A sell line here
      // is barely a corridor — cheap enough to keep standing all day, which is
      // exactly what the safe buyer should be.
      x: 266,
      y: 648,
      // Read off the drawing, so the price tag, the highlight and the building
      // are obviously one thing.
      tint: 0xf221b5,
    },
    apothecary: {
      name: 'Honey Inc.',
      // Half again as much at its own normal, and it swings by more than half
      // that on top. Catching a peak here is the best thing that happens in a
      // day; arriving at a trough after a long flight is the worst.
      basePrice: 1.5,
      periodSlow: 42,
      periodFast: 18,
      swingSlow: 0.34,
      swingFast: 0.16,
      floorFraction: 0.35,
      // Saturates faster as well as harder: the Apothecary is a specialist, not
      // a warehouse, and dumping a whole hive into one is meant to be the wrong
      // shape of sale even when the price is good.
      saturationPerHoney: 0.0019,
      saturationRecovery: 0.045,
      maxSaturation: 0.55,
      // Out to the left of the hive, hard against the board's edge. Still the
      // longer flight of the two, though the margin is now small — see the
      // note on `buyers` about what carries the decision instead.
      x: 92,
      y: 516,
      tint: 0x1fd6c4,
    },
  },

  /**
   * The hive's own stores.
   *
   * The cap is deliberately small — a little over three full bee-loads' worth
   * of trips — and it is now actually enforced: a full hive **spills**, and
   * every second it spills is money walking away. That is the pressure the
   * whole selling loop hangs on. A generous cap would mean gathering all day
   * and selling once at dusk, which is not a loop, it is two chores.
   */
  honey: {
    baseCap: 220,
    /**
     * The smallest useful load, in absolute honey.
     *
     * A floor rather than the cap it used to be — see `maxTripShare`. It only
     * binds at the very bottom of the Honey Store, and it is there so a small
     * hive is emptied by bees rather than by dribbles.
     */
    perSellTrip: 26,
    /**
     * What one bee shoulders, as a fraction of hive capacity.
     *
     * A flat load failed at both ends. Near the brim a sale read as one bee
     * teleporting a chunk of the day's work to a depot instead of as a swarm
     * working a line; and once the hive was low, a single bee took *all* of it,
     * which is the same thing seen from the other side. Worse, a flat load does
     * not scale — every Honey Store level added trips to empty the hive, so the
     * upgrade meant to relieve pressure quietly made selling more tedious.
     *
     * A share fixes both. Roughly nine trips to empty a full hive at any
     * capacity, so a sell line is always a standing commitment of several bees
     * over several seconds, and the Honey Store buys headroom rather than
     * homework.
     */
    maxTripShare: 0.11,
    /**
     * How near a route's tip must be for its bees to trade.
     *
     * Small on purpose. This ring is drawn on the board, and a depot sitting in
     * the play area with an 88-unit disc around it covered most of a corridor —
     * two landmarks reading as craters. The aim assist below is what makes the
     * ring easy to hit; the ring itself only has to say "here".
     */
    reachRadius: 54,
    /**
     * How near a drag has to end to count as aimed at a buyer.
     *
     * Deliberately under `patch.aimAssistRadius`, and a nearer flower now beats
     * a buyer outright (see `RouteIntent.applyAimAssist`). While the depots
     * were exiled to the far edge nothing else was ever within reach of one, so
     * an unconditional win cost nothing; near the hive it would quietly steal
     * drags meant for the flowers next door.
     */
    aimRadius: 104,
    /**
     * How much ground a depot lights at dawn.
     *
     * Buyers are landmarks, not discoveries, so their ground is never fogged.
     * Kept separate from `reachRadius` because it answers a different question
     * — shrinking the ring you have to touch should not also dim the board.
     */
    revealRadius: 190,
  },

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

/**
 * A sunlit meadow, not a night field.
 *
 * The board used to be near-black, with the unexplored part rendered as
 * darkness. Reading it as *mist over a bright field* instead costs the design
 * nothing — short sight works the same way whether what hides the ground is
 * dark or fog — and it buys a game that looks like the thing it is about.
 *
 * Every value below is chosen against a pale ground, which inverts the old
 * rule: things that used to glow pale against black now have to sit *darker*
 * than the field to be seen. That is why the bee is dark amber rather than the
 * near-white it was, and why nothing here is a pastel.
 */
export const COLORS = {
  background: '#e9f0d6',
  /** The ground beyond the playfield, a shade off the field itself. */
  surround: 0xdae3c2,
  hive: 0xb9761c,
  bee: 0x6b4a16,
  beeLaden: 0xd98b18,
  patch: 0x67b58c,
  patchDry: 0xa8b09a,
  wall: 0x46603a,
  wallThorn: 0x2c3d24,
  route: 0xc98a2b,
  /**
   * Flower species colours.
   *
   * Variety here is not only decoration: five flowers that differ only in size
   * are hard to refer to, and "the purple one" is how a person actually thinks
   * about the board they are working.
   *
   * It does not cost the game its value signal. Distance-worth still rides on
   * the *halo* around a flower, which warms as the payout climbs, so hue tells
   * you which flower and warmth tells you what it is worth. Those were the same
   * channel before, and separating them is what made room for this.
   */
  species: [
    0xe2669a, // pink
    0x9b6fd4, // violet
    0xe4573f, // poppy red
    0xf0b429, // buttercup
    0xf2f0e6, // white daisy
    0x4f9ede, // cornflower
  ],
  /** Warm end of the distance halo; the cool end is the flower's own colour. */
  halo: 0xffb454,
  /** Text colours are CSS strings; Phaser text styles do not take hex numbers. */
  text: '#3c3524',
  dim: '#7b7358',
  good: '#3f8f5f',
  bad: '#c0472c',
} as const;
