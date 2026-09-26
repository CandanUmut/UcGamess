import type { WaspKind } from '../sim/Wasp.ts';
import type { DayFeatures } from './DayCycle.ts';
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
  flowers: number;
  lines: number;
  bees: number;
  /** Which day of the endless run this board's flowers and walls are sized like. */
  difficulty: number;
  /** 1 is an open field, lower is a tighter maze. */
  mazeOpenness: number;
  /** Mist over what the hive cannot see. */
  fog: boolean;
  golden: boolean;
  rich: boolean;
  wave: WaspKind[];
  /** One line said as the level opens, if it introduces something. */
  intro?: string;
  /** Honey for one, two and three stars. */
  stars: readonly [number, number, number];
}

interface Spec {
  name: string;
  seconds: number;
  flowers: number;
  lines: number;
  bees: number;
  difficulty: number;
  maze?: number;
  fog?: boolean;
  golden?: boolean;
  rich?: boolean;
  wave?: WaspKind[];
  intro?: string;
}

const R: WaspKind = 'raider';
const D: WaspKind = 'drone';
const H: WaspKind = 'hornet';

const SPECS: readonly Spec[] = [
  // ---- Spring Meadow: the verb, the crew, the multiplier, the mist
  {
    name: 'First Blooms',
    seconds: 40,
    flowers: 3,
    lines: 3,
    bees: 24,
    difficulty: 1,
    intro: 'Drag from the hive to a flower',
  },
  {
    name: 'Two Crews',
    seconds: 40,
    flowers: 4,
    lines: 2,
    bees: 16,
    difficulty: 1,
    intro: 'A line carries 8 bees — re-lay it when a flower runs dry',
  },
  {
    name: 'Busy Hive',
    seconds: 45,
    flowers: 5,
    lines: 3,
    bees: 24,
    difficulty: 2,
    intro: 'Keep every bee flying and the multiplier climbs',
  },
  {
    name: 'Golden Hour',
    seconds: 45,
    flowers: 5,
    lines: 3,
    bees: 24,
    difficulty: 2,
    golden: true,
    intro: 'Golden blooms are brief — be quick',
  },
  {
    name: 'Wide Field',
    seconds: 50,
    flowers: 6,
    lines: 3,
    bees: 24,
    difficulty: 3,
    golden: true,
  },
  {
    name: 'Morning Mist',
    seconds: 50,
    flowers: 6,
    lines: 3,
    bees: 24,
    difficulty: 3,
    fog: true,
    intro: 'Lines into the mist find hidden flowers',
  },
  {
    name: 'Far Petals',
    seconds: 55,
    flowers: 6,
    lines: 3,
    bees: 24,
    difficulty: 4,
    fog: true,
    golden: true,
    rich: true,
  },
  {
    name: 'Four Lines',
    seconds: 55,
    flowers: 7,
    lines: 4,
    bees: 32,
    difficulty: 4,
    fog: true,
    golden: true,
  },
  {
    name: 'Sweet Spot',
    seconds: 55,
    flowers: 7,
    lines: 4,
    bees: 32,
    difficulty: 5,
    fog: true,
    golden: true,
    rich: true,
  },
  {
    name: 'Full Bloom',
    seconds: 60,
    flowers: 8,
    lines: 4,
    bees: 32,
    difficulty: 6,
    fog: true,
    golden: true,
    rich: true,
  },

  // ---- Bramble Maze: routing in legs
  {
    name: 'First Hedges',
    seconds: 55,
    flowers: 5,
    lines: 3,
    bees: 24,
    difficulty: 4,
    maze: 0.85,
    fog: true,
    intro: 'Drag from the end of a line to steer round hedges',
  },
  {
    name: 'Corners',
    seconds: 55,
    flowers: 6,
    lines: 3,
    bees: 24,
    difficulty: 5,
    maze: 0.75,
    fog: true,
    golden: true,
  },
  {
    name: 'Narrow Rows',
    seconds: 60,
    flowers: 6,
    lines: 3,
    bees: 24,
    difficulty: 5,
    maze: 0.65,
    fog: true,
    golden: true,
  },
  {
    name: 'Thorn Garden',
    seconds: 60,
    flowers: 7,
    lines: 4,
    bees: 32,
    difficulty: 6,
    maze: 0.6,
    fog: true,
    golden: true,
    rich: true,
  },
  {
    name: 'Lost Clover',
    seconds: 60,
    flowers: 7,
    lines: 3,
    bees: 24,
    difficulty: 6,
    maze: 0.55,
    fog: true,
    golden: true,
  },
  {
    name: 'Hedge Loop',
    seconds: 65,
    flowers: 7,
    lines: 4,
    bees: 32,
    difficulty: 7,
    maze: 0.5,
    fog: true,
    golden: true,
    rich: true,
  },
  {
    name: 'The Long Way',
    seconds: 65,
    flowers: 8,
    lines: 4,
    bees: 32,
    difficulty: 8,
    maze: 0.45,
    fog: true,
    golden: true,
    rich: true,
  },
  {
    name: 'Bramble Heart',
    seconds: 70,
    flowers: 8,
    lines: 4,
    bees: 32,
    difficulty: 8,
    maze: 0.4,
    fog: true,
    golden: true,
    rich: true,
  },
  {
    name: 'Five Roads',
    seconds: 70,
    flowers: 8,
    lines: 5,
    bees: 40,
    difficulty: 9,
    maze: 0.35,
    fog: true,
    golden: true,
    rich: true,
  },
  {
    name: 'The Labyrinth',
    seconds: 75,
    flowers: 9,
    lines: 5,
    bees: 40,
    difficulty: 10,
    maze: 0.3,
    fog: true,
    golden: true,
    rich: true,
  },

  // ---- Wasp Summer: everything, plus raids
  {
    name: 'First Raid',
    seconds: 55,
    flowers: 6,
    lines: 3,
    bees: 24,
    difficulty: 5,
    maze: 0.9,
    fog: true,
    wave: [R],
    intro: 'Wasps! Tap them to swat them',
  },
  {
    name: 'Pair of Pests',
    seconds: 60,
    flowers: 6,
    lines: 3,
    bees: 24,
    difficulty: 6,
    maze: 0.8,
    fog: true,
    golden: true,
    wave: [R, R],
  },
  {
    name: 'Stingers',
    seconds: 60,
    flowers: 7,
    lines: 4,
    bees: 32,
    difficulty: 6,
    maze: 0.7,
    fog: true,
    golden: true,
    wave: [R, R, R],
  },
  {
    name: 'Swarm Season',
    seconds: 65,
    flowers: 7,
    lines: 4,
    bees: 32,
    difficulty: 7,
    maze: 0.6,
    fog: true,
    golden: true,
    rich: true,
    wave: [R, R, R],
  },
  {
    name: 'Drone Rush',
    seconds: 65,
    flowers: 7,
    lines: 4,
    bees: 32,
    difficulty: 8,
    maze: 0.6,
    fog: true,
    golden: true,
    wave: [D, D, R, R],
    intro: 'Drones are fast — swat them early',
  },
  {
    name: 'Hot Wind',
    seconds: 65,
    flowers: 8,
    lines: 4,
    bees: 32,
    difficulty: 8,
    maze: 0.5,
    fog: true,
    golden: true,
    rich: true,
    wave: [D, D, R, R],
  },
  {
    name: 'Guarded Grove',
    seconds: 70,
    flowers: 8,
    lines: 5,
    bees: 40,
    difficulty: 9,
    maze: 0.45,
    fog: true,
    golden: true,
    rich: true,
    wave: [D, R, R, R, R],
  },
  {
    name: 'Hornet Nest',
    seconds: 70,
    flowers: 8,
    lines: 5,
    bees: 40,
    difficulty: 10,
    maze: 0.45,
    fog: true,
    golden: true,
    rich: true,
    wave: [H, R, R, D],
    intro: 'Hornets take four swats',
  },
  {
    name: 'Siege',
    seconds: 75,
    flowers: 9,
    lines: 5,
    bees: 40,
    difficulty: 11,
    maze: 0.4,
    fog: true,
    golden: true,
    rich: true,
    wave: [H, D, D, R, R, R],
  },
  {
    name: 'Queen of Summer',
    seconds: 80,
    flowers: 9,
    lines: 5,
    bees: 40,
    difficulty: 12,
    maze: 0.35,
    fog: true,
    golden: true,
    rich: true,
    wave: [H, H, D, D, R, R, R],
  },
];

/**
 * Honey for one, two and three stars, per level.
 *
 * Written by `src/playtest/fit-levels.ts` — run it again after changing any
 * level above or anything that moves honey, and paste its output here.
 */
export const LEVEL_STARS: ReadonlyArray<readonly [number, number, number]> = [
  [190, 210, 230],
  [310, 360, 400],
  [410, 540, 590],
  [480, 860, 950],
  [1025, 1300, 1425],
  [880, 1200, 1325],
  [820, 1275, 1400],
  [800, 1250, 1375],
  [860, 1425, 1675],
  [1025, 1350, 1475],
  [900, 1000, 1100],
  [1325, 1475, 1625],
  [1325, 1550, 1700],
  [910, 1275, 1400],
  [1550, 1875, 2075],
  [1350, 1700, 1875],
  [2225, 2625, 2900],
  [2350, 2700, 2975],
  [2075, 2325, 2850],
  [2600, 3550, 4350],
  [810, 1275, 1475],
  [1100, 1375, 1575],
  [780, 970, 1175],
  [610, 720, 880],
  [1200, 1475, 1675],
  [1475, 2000, 2925],
  [930, 1225, 2150],
  [1425, 1925, 2200],
  [1150, 1300, 1500],
  [2125, 2525, 3075],
];

export const LEVELS: readonly LevelDef[] = SPECS.map((spec, index) => ({
  id: index + 1,
  world: Math.floor(index / LEVELS_PER_WORLD),
  name: spec.name,
  // Fixed, and spread out so neighbouring levels do not share a layout.
  seed: 7919 * (index + 1) + 104_729,
  seconds: spec.seconds,
  flowers: spec.flowers,
  lines: spec.lines,
  bees: spec.bees,
  difficulty: spec.difficulty,
  mazeOpenness: spec.maze ?? 1,
  fog: spec.fog ?? false,
  golden: spec.golden ?? false,
  rich: spec.rich ?? false,
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
    richPatches: level.rich,
    nightBloom: level.golden,
  };
}

/**
 * The hive a level plays with, as run modifiers on top of the base stats.
 *
 * Expressed as the same modifiers a draft pick would add, so the simulation
 * has exactly one way of being told "more lines" or "more bees".
 */
export function levelModifiers(level: LevelDef): RunModifiers {
  const m = noModifiers();
  m.extraLines = level.lines - TUNING.route.maxCount;
  m.extraBees = level.bees - TUNING.bee.baseCount;
  // No mist: light the whole board at dawn.
  if (!level.fog) m.scoutRadius = 2000;
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
