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
   * Most bees one line can carry at once.
   *
   * The rule that makes lines matter. Without it the swarm's whole output
   * went down whichever single line existed, so one line and five lines
   * earned the same and the game played itself once anything was laid —
   * measured, novice and expert bots finished level. With a crew cap, bees
   * beyond what the lines can carry wait at the hive, visibly, and laying the
   * next line is how you put them to work.
   */
  beesPerLine: number;
  /**
   * Strength gained each time a bee completes a delivery on the route.
   *
   * This is what makes a path mean something. A line the swarm has actually
   * worked becomes a beaten track: it retreats slower, it barely bends in the
   * and bees fly it faster. It is the only thing in the game the player
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
  /** Seconds between one bloom opening and the next. */
  bloomIntervalSeconds: number;
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
  /** How near a thrown shot has to pass to hit a wasp. Generous on purpose. */
  hitRadius: number;
  /** Damage one thrown shot does. */
  throwDamage: number;
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

/**
 * The line gesture: press on the hive (or the end of a line), drag, let go.
 *
 * A straight "beeline" from where the press started to where the finger is,
 * previewed while dragging exactly as it will be laid — sliding along any
 * hedge it runs into. It replaced the dial, which measured at 69% of play time
 * spent waiting for an arrow to come round.
 */
export interface LineTuning {
  /** How near the hive a press has to land to start a line from it. */
  startRadius: number;
  /** How near a line's end a press has to land to carry that line on. */
  tipGrabRadius: number;
  /** The longest single leg. Long enough to cross most of the board. */
  maxLegLength: number;
  /** How near a tap has to land on a flower to lay a line straight to it. */
  tapFlowerRadius: number;
  /** Seconds a line lingers after its flower runs dry, so its bees get home. */
  retireSeconds: number;
}

/** Tapping a wasp. */
export interface SwatTuning {
  /** How near a tap has to land to hit. Generous: the target moves. */
  radius: number;
  /** Honey paid for a wasp downed, as a share of the day's quota. */
  bountyShare: number;
}

/**
 * Golden blooms: short-lived, valuable flowers that open during the day.
 *
 * The one thing on the board that asks for a reaction rather than a plan. They
 * are marked as special and come with a visible countdown, which is what keeps
 * them from reading as the ordinary board rewriting itself.
 */
export interface GoldenTuning {
  startDay: number;
  firstAt: number;
  minGap: number;
  maxGap: number;
  /** Seconds a golden bloom stays open. */
  window: number;
  /** Pollen in one, as a fraction of an ordinary flower's. */
  poolShare: number;
}

/** The end of a day. */
export interface ScoreTuning {
  /**
   * Honey paid for each second of daylight left when the meadow is cleared,
   * as a share of the day's quota. Rewards clearing fast rather than waiting.
   */
  sunsetBonusPerSecond: number;
  /** Stars: one for the quota, two and three for these multiples of it. */
  twoStars: number;
  threeStars: number;
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
  /** Cards offered between days. */
  offerCount: number;
  epicChanceBase: number;
  epicChancePerDay: number;
  epicChanceMax: number;
  rareChance: number;
  /** Added to the rare and epic chances for each star the day earned. */
  perStar: number;
}

export interface Tuning {
  hive: HiveTuning;
  bee: BeeTuning;
  route: RouteTuning;
  patch: PatchTuning;
  day: DayTuning;
  wasp: WaspTuning;
  line: LineTuning;
  swat: SwatTuning;
  golden: GoldenTuning;
  score: ScoreTuning;
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
    sightRadius: 600,
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
    maxCount: 3,
    beesPerLine: 8,
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
    strengthSpeedBonus: 0.35,
    strengthKeptOnRedraw: 0.5,
    holdSeconds: 12.0,
    decaySpeed: 26,
    minLength: 40,
    refreshSnapRadius: 160,
    pointSpacing: 12,
    // The board is twice as deep now the hive sits in a corner.
    // Long. The cap used to bite in ordinary play — a line simply stopped
    // accepting shots with no explanation, which reads as the game breaking.
    // Five slots are the budget that matters; a line's length should be
    // limited by the board, not by a number nobody can see.
    maxLength: 3200,
  },

  patch: {
    baseCount: 2,
    // Day one's band is 230-300, comfortably inside the hive's 340 light.
    minRadius: 230,
    maxRadius: 300,
    reachRadius: 85,
    aimAssistRadius: 130,
    // Slower than the wilt, so the board fills up rather than churning: blooms
    // accumulate until you are behind, which is the pressure being visible.
    bloomIntervalSeconds: 7,
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
    basePool: 40,
    poolPerDay: 7,
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
    baseSeconds: 40,
    secondsPerDay: 4,
    maxSeconds: 75,
    nightScreenMinSeconds: 6,
    // Fitted with the playtest harness (src/playtest), against three simulated
    // players who differ in reaction time, aim and — most of all — how often
    // they look up from the bees to act.
    //
    // The shape is the point: day one is a guaranteed win that clears in about
    // twenty seconds; a first-timer's run ends around day four to six, a
    // regular's around day nine to twelve, and a practised player keeps going
    // well past that. Every day after the second is meant to be in doubt for
    // somebody. Re-run `pnpm --filter @ucgames/game-beeline playtest` after
    // changing anything that moves honey, and refit here if the per-day table
    // drifts.
    quotas: [80, 170, 280, 390, 480, 580, 680, 790, 910, 1030, 1160, 1300],
    quotaGrowthAfterTable: 1.11,
  },

  // Shifted a day later than the original schedule to make room for brambles on
  // day 3. The rule the schedule exists to protect is one new element at a
  // time with a quiet day after it, not any particular day number.

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
    startDay: 4,
    safeRadius: 160,
    interceptRadius: 34,
    scatterSeconds: 1.2,

    kinds: {
      /** The staple. Middling everything; the wave is mostly these. */
      raider: {
        speed: 95,
        health: 2,
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
        health: 1,
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
        health: 4,
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
    // Wide, because the target moves and the dial is already the hard part.
    // Asking for pixel accuracy *and* timing would be two skills for one tap,
    // and a wasp crosses a good part of the board while the arrow comes round.
    hitRadius: 80,
    throwDamage: 1,
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
    // Three, the classic draft. Four made the choice a scan rather than a
    // decision, and five was the old shop's wall of buttons again.
    offerCount: 3,
    epicChanceBase: 0.05,
    epicChancePerDay: 0.012,
    epicChanceMax: 0.22,
    rareChance: 0.3,
    // A three-star day is worth playing for: it tilts the next draft toward
    // the good cards.
    perStar: 0.06,
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
  line: {
    startRadius: 110,
    tipGrabRadius: 70,
    maxLegLength: 1100,
    tapFlowerRadius: 70,
    retireSeconds: 0.6,
  },

  swat: {
    radius: 64,
    bountyShare: 0.04,
  },

  golden: {
    startDay: 2,
    firstAt: 9,
    minGap: 14,
    maxGap: 24,
    window: 7,
    poolShare: 0.5,
  },

  score: {
    sunsetBonusPerSecond: 0.02,
    twoStars: 1.4,
    threeStars: 1.9,
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
