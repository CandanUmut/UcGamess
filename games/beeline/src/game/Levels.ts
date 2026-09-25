import type { WaspKind } from '../sim/Wasp.ts';
import type { DayFeatures, FlowerGroup, FlowerTier } from './DayCycle.ts';
import { noModifiers, type RunModifiers } from './Items.ts';
import { TUNING } from '../config/tuning.ts';

/**
 * The campaign: thirty fixed meadows in three worlds.
 *
 * The endless run is a good score chase and a poor thing to *finish* — it only
 * ever ends in failure, so the playtest's "no completion feeling" was the
 * structure talking. A level is a board with an end: clear it, earn one to
 * three stars, and a cell of the honeycomb fills. Thirty cells is a comb, and
 * a full comb is a thing a player can look at and say they did.
 *
 * Each level is a fixed seed, so its maze and flowers are the same every time
 * — a board you can learn and replay for the third star, not a dice roll. What
 * still varies between attempts is what the player does, the golden blooms'
 * timing and the wasps'.
 *
 * Star thresholds are **fitted, not chosen**: `src/playtest/fit-levels.ts`
 * plays every level with the three simulated players and writes the table in
 * `LEVEL_STARS` below. One star is meant for a first-timer on world one and a
 * regular after that; three stars needs the Busy Hive multiplier kept high.
 */

export interface WorldDef {
  name: string;
  /** Stars needed, across the whole campaign, to open this world. */
  starsToOpen: number;
  /** Tint for its honeycomb and its title. */
  tint: number;
  blurb: string;
}

export const WORLDS: readonly WorldDef[] = [
  {
    name: 'Spring Meadow',
    starsToOpen: 0,
    tint: 0xffc93c,
    blurb: 'Lay lines, keep every bee busy.',
  },
  {
    name: 'Bramble Maze',
    starsToOpen: 15,
    tint: 0x7fc36a,
    blurb: 'Steer round the hedges, leg by leg.',
  },
  {
    name: 'Wasp Summer',
    starsToOpen: 36,
    tint: 0xff8a5c,
    blurb: 'Swat the raiders. Hold the hive.',
  },
];

export const LEVELS_PER_WORLD = 10;

export interface LevelDef {
  /** 1-based, across the whole campaign. */
  id: number;
  world: number;
  name: string;
  seed: number;
  /** Seconds of daylight. */
  seconds: number;
  bees: number;
  /**
   * Wax, as a multiple of the cheapest network reaching this board's valuable
   * (tier 2+) flowers — see `Field.networkCost`. Near 1 it takes a good
   * trunk-and-branches plan to reach them all.
   */
  wax: number;
  /** The flowers, as clusters. */
  groups: readonly FlowerGroup[];
  /** Flowers on the board, summed over `groups`. */
  flowers: number;
  /** Which endless day the board's hazards are sized like. */
  difficulty: number;
  /** 1 is an open field, lower is a tighter maze. */
  mazeOpenness: number;
  golden: boolean;
  wave: WaspKind[];
  /** One line said as the level opens, if it introduces something. */
  intro?: string;
  /** Honey for one, two and three stars. */
  stars: readonly [number, number, number];
}

interface Spec {
  name: string;
  seconds: number;
  bees: number;
  wax: number;
  groups: FlowerGroup[];
  maze?: number;
  golden?: boolean;
  wave?: WaspKind[];
  intro?: string;
}

const R: WaspKind = 'raider';
const D: WaspKind = 'drone';
const H: WaspKind = 'hornet';

/** Distance bands from the hive, in design px along the maze. */
const NEAR = [150, 470] as const;
const MID = [440, 820] as const;
const FAR = [760, 1250] as const;

/** A cluster: `count` flowers of `tier` in a band, within `spread` cells of each other. */
function g(
  tier: FlowerTier,
  count: number,
  band: readonly [number, number],
  spread = 1,
): FlowerGroup {
  return { tier, count, near: band[0], far: band[1], spread };
}

/**
 * The thirty boards.
 *
 * Every level is built around one question about the network. World one
 * teaches the three ideas in turn — lines cost wax, a branch only pays for
 * what it adds, and rich flowers are worth going far for — and then mixes
 * them. World two puts hedges between the hive and the good flowers, so a
 * trunk has to be routed before it can be shared. World three sends wasps at
 * whatever you built.
 */
const SPECS: readonly Spec[] = [
  // ---- Spring Meadow: wax, branches, value
  {
    name: 'First Blooms',
    seconds: 45,
    bees: 16,
    wax: 1.2,
    groups: [g(1, 3, NEAR, 2)],
    intro: 'Drag from the hive to a flower',
  },
  {
    name: 'Branch Out',
    seconds: 50,
    bees: 16,
    wax: 1.2,
    groups: [g(1, 1, NEAR), g(2, 3, MID)],
    intro: 'Lines cost wax. Drag from a line to branch — you only pay for the new part',
  },
  {
    name: 'Worth the Trip',
    seconds: 55,
    bees: 24,
    wax: 1.2,
    groups: [g(1, 3, NEAR, 2), g(3, 2, FAR)],
    intro: 'Blue and violet flowers pay three times as much',
  },
  {
    name: 'Dry Spells',
    seconds: 55,
    bees: 24,
    wax: 1.2,
    groups: [g(1, 4, NEAR, 2), g(2, 3, MID)],
    intro: 'A dry line stays yours — drag on from its end to reuse it',
  },
  {
    name: 'Golden Hour',
    seconds: 60,
    bees: 24,
    wax: 1.2,
    golden: true,
    groups: [g(1, 3, NEAR, 2), g(2, 3, MID)],
    intro: 'Golden blooms are brief and pay six — branch to them fast',
  },
  {
    name: 'Two Meadows',
    seconds: 60,
    bees: 24,
    wax: 1.2,
    groups: [g(1, 2, NEAR, 2), g(2, 3, MID), g(3, 3, FAR)],
  },
  {
    name: 'Thrift',
    seconds: 60,
    bees: 24,
    wax: 1.2,
    groups: [g(1, 3, NEAR, 2), g(3, 3, FAR)],
    intro: 'Short on wax. Hold a line to take it back for half',
  },
  {
    name: 'Far Petals',
    seconds: 65,
    bees: 32,
    wax: 1.2,
    golden: true,
    groups: [g(1, 4, NEAR, 2), g(3, 4, FAR)],
  },
  {
    name: 'Three Roads',
    seconds: 65,
    bees: 32,
    wax: 1.2,
    groups: [g(2, 3, MID), g(3, 3, FAR), g(2, 2, MID)],
  },
  {
    name: 'Full Bloom',
    seconds: 70,
    bees: 32,
    wax: 1.2,
    golden: true,
    groups: [g(1, 3, NEAR, 2), g(2, 3, MID), g(3, 3, FAR)],
  },

  // ---- Bramble Maze: route the trunk, then share it
  {
    name: 'First Hedges',
    seconds: 55,
    bees: 24,
    wax: 1.2,
    maze: 0.85,
    groups: [g(1, 2, NEAR, 2), g(2, 3, MID)],
    intro: 'Hedges! Drag to a gap, then on from the end of the line',
  },
  {
    name: 'Corners',
    seconds: 60,
    bees: 24,
    wax: 1.2,
    maze: 0.75,
    golden: true,
    groups: [g(2, 3, MID), g(3, 2, FAR)],
  },
  {
    name: 'Narrow Rows',
    seconds: 60,
    bees: 24,
    wax: 1.2,
    maze: 0.65,
    groups: [g(1, 3, NEAR, 2), g(3, 3, FAR)],
  },
  {
    name: 'Thorn Garden',
    seconds: 60,
    bees: 32,
    wax: 1.2,
    maze: 0.6,
    golden: true,
    groups: [g(2, 3, MID), g(2, 2, MID), g(3, 2, FAR)],
  },
  {
    name: 'Lost Clover',
    seconds: 65,
    bees: 32,
    wax: 1.2,
    maze: 0.55,
    groups: [g(1, 2, NEAR, 2), g(2, 4, MID), g(3, 2, FAR)],
  },
  {
    name: 'Hedge Loop',
    seconds: 65,
    bees: 32,
    wax: 1.2,
    maze: 0.5,
    golden: true,
    groups: [g(2, 3, MID), g(3, 3, FAR)],
  },
  {
    name: 'The Long Way',
    seconds: 70,
    bees: 32,
    wax: 1.2,
    maze: 0.45,
    groups: [g(1, 3, NEAR, 2), g(3, 4, FAR)],
  },
  {
    name: 'Bramble Heart',
    seconds: 70,
    bees: 32,
    wax: 1.2,
    maze: 0.4,
    golden: true,
    groups: [g(2, 3, MID), g(3, 3, FAR), g(1, 2, NEAR, 2)],
  },
  {
    name: 'Five Roads',
    seconds: 70,
    bees: 40,
    wax: 1.2,
    maze: 0.35,
    golden: true,
    groups: [g(2, 3, MID), g(2, 2, MID), g(3, 3, FAR), g(3, 2, FAR)],
  },
  {
    name: 'The Labyrinth',
    seconds: 75,
    bees: 40,
    wax: 1.2,
    maze: 0.3,
    golden: true,
    groups: [g(1, 2, NEAR, 2), g(2, 3, MID), g(3, 4, FAR)],
  },

  // ---- Wasp Summer: defend what you built
  {
    name: 'First Raid',
    seconds: 55,
    bees: 24,
    wax: 1.2,
    maze: 0.9,
    wave: [R],
    groups: [g(1, 2, NEAR, 2), g(2, 3, MID)],
    intro: 'Wasps! Tap them to swat them',
  },
  {
    name: 'Pair of Pests',
    seconds: 60,
    bees: 24,
    wax: 1.2,
    maze: 0.8,
    golden: true,
    wave: [R, R],
    groups: [g(2, 3, MID), g(3, 2, FAR)],
  },
  {
    name: 'Stingers',
    seconds: 60,
    bees: 32,
    wax: 1.2,
    maze: 0.7,
    golden: true,
    wave: [R, R, R],
    groups: [g(1, 3, NEAR, 2), g(3, 3, FAR)],
  },
  {
    name: 'Swarm Season',
    seconds: 65,
    bees: 32,
    wax: 1.2,
    maze: 0.6,
    golden: true,
    wave: [R, R, R],
    groups: [g(2, 3, MID), g(2, 2, MID), g(3, 2, FAR)],
  },
  {
    name: 'Drone Rush',
    seconds: 65,
    bees: 32,
    wax: 1.2,
    maze: 0.6,
    golden: true,
    wave: [D, D, R, R],
    groups: [g(1, 2, NEAR, 2), g(2, 3, MID), g(3, 2, FAR)],
    intro: 'Drones are fast — swat them early',
  },
  {
    name: 'Hot Wind',
    seconds: 65,
    bees: 32,
    wax: 1.2,
    maze: 0.5,
    golden: true,
    wave: [D, D, R, R],
    groups: [g(2, 3, MID), g(3, 3, FAR)],
  },
  {
    name: 'Guarded Grove',
    seconds: 70,
    bees: 40,
    wax: 1.2,
    maze: 0.45,
    golden: true,
    wave: [D, R, R, R, R],
    groups: [g(1, 3, NEAR, 2), g(3, 4, FAR)],
  },
  {
    name: 'Hornet Nest',
    seconds: 70,
    bees: 40,
    wax: 1.2,
    maze: 0.45,
    golden: true,
    wave: [H, R, R, D],
    groups: [g(2, 3, MID), g(3, 3, FAR), g(1, 2, NEAR, 2)],
    intro: 'Hornets take four swats',
  },
  {
    name: 'Siege',
    seconds: 75,
    bees: 40,
    wax: 1.2,
    maze: 0.4,
    golden: true,
    wave: [H, D, D, R, R, R],
    groups: [g(2, 3, MID), g(2, 2, MID), g(3, 3, FAR)],
  },
  {
    name: 'Queen of Summer',
    seconds: 80,
    bees: 40,
    wax: 1.2,
    maze: 0.35,
    golden: true,
    wave: [H, H, D, D, R, R, R],
    groups: [g(1, 2, NEAR, 2), g(2, 3, MID), g(3, 4, FAR)],
  },
];

/**
 * Honey for one, two and three stars, per level.
 *
 * Written by `src/playtest/fit-levels.ts` — run it again after changing any
 * level above or anything that moves honey, and paste its output here.
 */
export const LEVEL_STARS: ReadonlyArray<readonly [number, number, number]> = [
  [145, 210, 260],
  [100, 710, 800],
  [190, 900, 1175],
  [220, 980, 1100],
  [220, 1075, 1200],
  [440, 2350, 2625],
  [230, 1625, 1825],
  [380, 2675, 3000],
  [540, 3225, 3600],
  [510, 2800, 3125],
  [260, 1000, 1125],
  [270, 1125, 2125],
  [640, 3350, 3750],
  [470, 1350, 1900],
  [330, 1875, 2100],
  [420, 1400, 3300],
  [740, 3575, 4000],
  [390, 2625, 3075],
  [550, 2925, 3775],
  [490, 2825, 3875],
  [260, 1225, 1375],
  [220, 1075, 1600],
  [270, 1200, 1725],
  [360, 1900, 2275],
  [320, 1700, 1950],
  [310, 1975, 2225],
  [550, 3400, 4375],
  [350, 2300, 2750],
  [640, 3575, 4000],
  [660, 3375, 5200],
];

/**
 * Each level's layout seed and wax, chosen by `src/playtest/search-levels.ts`.
 *
 * The groups above say *what* a board holds; the seed decides where it all
 * lands, and some landings make a far better question than others. The search
 * plays candidate boards with a planner, a regular player and a player with no
 * plan, and keeps the one where planning is worth the most while a regular
 * player still gets most of the way. Re-run it after changing the groups.
 */
export const LEVEL_LAYOUTS: ReadonlyArray<readonly [seed: number, wax: number]> = [
  [62056100, 3],
  [185950923, 1.15],
  [154987116, 1.35],
  [31108131, 1.35],
  [232432269, 1.35],
  [152243, 1.15],
  [139532929, 1.35],
  [15653944, 1.35],
  [46633589, 1.15],
  [93099097, 1.35],
  [216993920, 1.35],
  [31171483, 1.35],
  [155066306, 1.35],
  [186045951, 1.15],
  [108624555, 1],
  [31203159, 1.15],
  [170583845, 1],
  [186077627, 1.35],
  [31226916, 1.15],
  [46720698, 1.35],
  [77700343, 1.15],
  [108679988, 1.35],
  [62230318, 1.35],
  [108695826, 1.15],
  [139675471, 1.35],
  [15796486, 1.35],
  [15804405, 1],
  [62269913, 1.35],
  [155193010, 1],
  [342299, 1.35],
];

/** A level's layout seed and wax factor: the searched value, or a default. */
export function layoutFor(
  index: number,
  spec: { wax: number },
): readonly [number, number] {
  return LEVEL_LAYOUTS[index] ?? [7919 * (index + 1) + 104_729, spec.wax];
}

/** The raw specs, for the layout search. */
export const LEVEL_SPECS = SPECS;

export const LEVELS: readonly LevelDef[] = SPECS.map((spec, index) => ({
  id: index + 1,
  world: Math.floor(index / LEVELS_PER_WORLD),
  name: spec.name,
  seed: layoutFor(index, spec)[0],
  seconds: spec.seconds,
  bees: spec.bees,
  wax: layoutFor(index, spec)[1],
  groups: spec.groups,
  flowers: spec.groups.reduce((sum, group) => sum + group.count, 0),
  difficulty:
    1 + Math.floor(index / LEVELS_PER_WORLD) * 4 + (index % LEVELS_PER_WORLD) / 3,
  mazeOpenness: spec.maze ?? 1,
  golden: spec.golden ?? false,
  wave: spec.wave ?? [],
  ...(spec.intro ? { intro: spec.intro } : {}),
  stars: LEVEL_STARS[index] ?? [60, 110, 160],
}));

export function levelById(id: number): LevelDef | undefined {
  return LEVELS[id - 1];
}

/** The day features a level plays with. */
export function levelFeatures(level: LevelDef): DayFeatures {
  return {
    raidSize: level.wave.length,
    wave: level.wave,
    mazeOpenness: level.mazeOpenness,
    richPatches: false,
    nightBloom: level.golden,
    flowers: [...level.groups],
    waxFactor: level.wax,
  };
}

/**
 * The hive a level plays with, as run modifiers on top of the base stats.
 *
 * Every campaign board is fully lit: a network game is a planning game, and a
 * plan needs the whole board in view.
 */
export function levelModifiers(level: LevelDef): RunModifiers {
  const m = noModifiers();
  m.extraBees = level.bees - TUNING.bee.baseCount;
  m.scoutRadius = 2000;
  return m;
}

/**
 * Honey for clearing a level with daylight left: a share of its one-star
 * target per second, the same shape as the endless run's sunset bonus.
 */
export function levelSunsetBonus(level: LevelDef, secondsLeft: number): number {
  return Math.round(
    Math.max(0, secondsLeft) * level.stars[0] * TUNING.score.sunsetBonusPerSecond,
  );
}

/** Stars a score earns on a level, 0-3. */
export function levelStarsFor(level: LevelDef, honey: number): number {
  const [one, two, three] = level.stars;
  if (honey >= three) return 3;
  if (honey >= two) return 2;
  if (honey >= one) return 1;
  return 0;
}

export function totalStars(stars: readonly number[]): number {
  return stars.reduce((a, b) => a + Math.max(0, Math.min(3, b)), 0);
}

/** Whether a level can be played, given the stars earned so far. */
export function isUnlocked(level: LevelDef, stars: readonly number[]): boolean {
  if (level.id === 1) return true;
  const world = WORLDS[level.world];
  if (world && totalStars(stars) < world.starsToOpen) return false;
  // The first level of an opened world is always available; otherwise the
  // level before it has to have been passed.
  if ((level.id - 1) % LEVELS_PER_WORLD === 0) return true;
  return (stars[level.id - 2] ?? 0) >= 1;
}

/** Runs `fn` with Math.random seeded, so a level's board is the same each time. */
export function withSeed<T>(seed: number, fn: () => T): T {
  const real = Math.random;
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}
