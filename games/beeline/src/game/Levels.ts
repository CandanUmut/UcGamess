import type { WaspKind } from '../sim/Wasp.ts';
import type { DayFeatures, FlowerSpot, TreasurePlan } from './DayCycle.ts';
import { noModifiers, type RunModifiers } from './Items.ts';
import { TUNING } from '../config/tuning.ts';
import type { LessonPoints } from './Lessons.ts';
import type { RivalSpec } from './Rival.ts';

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
 * A level is won the moment its jar is full; stars are for how fast. Every
 * board is hand-built: the first world one idea per board, the later two
 * puzzles of hedges, mist, buds and raids, each side of the board a
 * different shape. A race's jar is a little over half the board's honey
 * (`JAR_SHARE`), and no one flower may be worth much of it (`HONEY_RULES`).
 * Star times are **fitted, not chosen**: `src/playtest/fit-levels.ts` plays
 * each level with the three simulated players and writes `LEVEL_GOALS`
 * below, with margins for the fact that people read, aim and hesitate where
 * the bots do not.
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
  /** What the mist hides beyond flowers. */
  treasures: TreasurePlan;
  golden: boolean;
  rich: boolean;
  wave: WaspKind[];
  /** One line said as the level opens, if it introduces something. */
  intro?: string;
  /** Honey for one, two and three stars. (Legacy; stars now come from time.) */
  stars: readonly [number, number, number];
  /** Honey that fills the jar: the level is won the moment it is reached. */
  goal: number;
  /**
   * Seconds of daylight, or 0 for no sunset at all. The clock only starts
   * once the first line is laid, and never runs under a card.
   */
  timed: boolean;
  /** Seconds to fill the jar for three stars, and for two. */
  starTimes: readonly [three: number, two: number];
  /** Hand-placed flowers and hedges, for the boards that teach. */
  layout?: readonly FlowerSpot[];
  walls?: ReadonlyArray<readonly [number, number, 'L' | 'T']>;
  /** The idea this board teaches, if any. */
  lesson?: LessonId;
  /** Where the lesson's hand drags, on boards where that is not a flower. */
  lessonPoints?: LessonPoints;
  /** A rival wasp colony racing the player for the same flowers. */
  rival?: RivalSpec;
}

/** Ideas the first world teaches, one per board. */
export type LessonId =
  | 'drag'
  | 'second'
  | 'dry'
  | 'sun'
  | 'double'
  | 'hedge'
  | 'raid'
  | 'defend'
  | 'mist'
  | 'golden';

/**
 * Flowers in mirrored pairs about the board's centre line (x = 640), so the
 * player's side and the wasps' side hold the same meadow. A spot on the
 * centre line is listed once.
 */
function mirrored(spots: FlowerSpot[]): FlowerSpot[] {
  return spots.flatMap((s) =>
    Math.abs(s.x - 640) < 1 ? [s] : [s, { ...s, x: 1280 - s.x }],
  );
}

/**
 * Hedges, mirrored the same way: a cell's left edge at column c is the
 * mirror of the left edge at column 8 - c; a top edge at (c, r) mirrors to
 * (7 - c, r). A hedge on the centre line (left edge of column 4) is its own
 * mirror.
 */
function mirroredWalls(
  walls: Array<[number, number, 'L' | 'T']>,
): Array<[number, number, 'L' | 'T']> {
  const out: Array<[number, number, 'L' | 'T']> = [];
  const key = new Set<string>();
  const add = (w: [number, number, 'L' | 'T']): void => {
    const k = w.join(',');
    if (!key.has(k)) {
      key.add(k);
      out.push(w);
    }
  };
  for (const [c, r, side] of walls) {
    add([c, r, side]);
    add(side === 'L' ? [8 - c, r, 'L'] : [7 - c, r, 'T']);
  }
  return out;
}

/** The wasps' nest: the mirror image of the hive. */
const NEST = { x: 1014, y: 492 } as const;

interface Spec {
  name: string;
  /** Honey to fill the jar. Omitted for generated boards: fitted, see LEVEL_GOALS. */
  goal?: number;
  layout?: FlowerSpot[];
  walls?: Array<[number, number, 'L' | 'T']>;
  lesson?: LessonId;
  lessonPoints?: LessonPoints;
  rival?: RivalSpec;
  /**
   * Star times set by hand, for a board whose trick the simulated players do
   * not know (stacking lines on one flower), so fitting cannot place them.
   */
  starTimes?: [three: number, two: number];
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
  // ---- Spring Meadow: hand-built, one idea per board.
  //
  // The hive sits at (266, 492); from 1-3 the wasps' nest sits at its mirror
  // image and the whole meadow is mirrored (see `mirrored`), so the race is
  // fair and the middle is contested. Cells are ~152 x 116 px from (30, 110):
  // column centres 106, 259, 411, 564, 716, 869, 1021, 1174; row centres
  // 168, 284, 400, 516, 632. A hedge is the left ('L') or top ('T') edge of
  // a cell. Jars hold a little over half the honey on the board, so only one
  // side can fill one; after the first boards a race runs about a minute.
  {
    name: 'First Bloom',
    seconds: 0,
    flowers: 1,
    lines: 2,
    bees: 16,
    difficulty: 1,
    lesson: 'drag',
    goal: 25,
    layout: [{ x: 640, y: 420, honey: 40 }],
  },
  {
    name: 'Two Flowers',
    seconds: 0,
    flowers: 2,
    lines: 2,
    bees: 16,
    difficulty: 1,
    lesson: 'second',
    goal: 50,
    layout: [
      { x: 560, y: 290, honey: 35 },
      { x: 660, y: 600, honey: 35 },
    ],
  },
  {
    name: 'Wasps Next Door',
    seconds: 0,
    flowers: 6,
    lines: 3,
    bees: 24,
    difficulty: 1,
    lesson: 'dry',
    rival: { ...NEST, bees: 16, lines: 2, skill: 'dozy' },
    layout: mirrored([
      { x: 480, y: 360, honey: 20 },
      { x: 480, y: 630, honey: 20 },
      { x: 640, y: 230, honey: 30 },
      { x: 640, y: 520, honey: 30 },
    ]),
  },
  {
    name: 'Golden Race',
    seconds: 0,
    flowers: 7,
    lines: 3,
    bees: 24,
    difficulty: 2,
    golden: true,
    lesson: 'sun',
    rival: { ...NEST, bees: 24, lines: 3, skill: 'dozy' },
    layout: mirrored([
      { x: 460, y: 300, honey: 35 },
      { x: 470, y: 640, honey: 30 },
      { x: 560, y: 180, honey: 25 },
      { x: 640, y: 460, honey: 45 },
    ]),
  },
  {
    name: 'Big Bloom',
    seconds: 0,
    flowers: 6,
    lines: 3,
    bees: 24,
    difficulty: 2,
    lesson: 'double',
    lessonPoints: { to: { x: 480, y: 250 } },
    rival: { ...NEST, bees: 24, lines: 3, skill: 'steady' },
    // Not a mirror: the big flower is nearer you, the wasps have two good
    // ones by their nest. Stack your lines on it and it is yours; spread
    // them and the wasps come for it.
    layout: [
      { x: 480, y: 250, honey: 90 },
      { x: 640, y: 560, honey: 30 },
      { x: 150, y: 250, honey: 20 },
      { x: 380, y: 640, honey: 20 },
      { x: 900, y: 330, honey: 35 },
      { x: 880, y: 640, honey: 35 },
    ],
  },
  {
    name: 'The Hedge',
    seconds: 0,
    flowers: 6,
    lines: 3,
    bees: 24,
    difficulty: 3,
    lesson: 'hedge',
    lessonPoints: { via: { x: 400, y: 190 }, to: { x: 640, y: 170 } },
    rival: { ...NEST, bees: 24, lines: 3, skill: 'steady' },
    // The rich flowers sit behind hedges, top and bottom: straight lines from
    // either side run into them, so both colonies must go round.
    walls: mirroredWalls([
      [3, 1, 'T'],
      [2, 4, 'T'],
      [3, 4, 'T'],
    ]),
    layout: [
      { x: 640, y: 170, honey: 45 },
      { x: 640, y: 650, honey: 45 },
      ...mirrored([
        { x: 430, y: 330, honey: 35 },
        { x: 560, y: 450, honey: 30 },
      ]),
    ],
  },
  {
    name: 'Raid!',
    seconds: 0,
    flowers: 4,
    lines: 3,
    bees: 24,
    difficulty: 3,
    lesson: 'raid',
    // The wasps have two flowers on their doorstep to your one: their jar
    // runs ahead, and a raid only pays on a fuller jar than yours.
    rival: { ...NEST, bees: 16, lines: 3, skill: 'steady', raidOut: true },
    walls: mirroredWalls([
      [4, 1, 'L'],
      [4, 2, 'L'],
    ]),
    layout: [
      { x: 900, y: 600, honey: 35 },
      { x: 1130, y: 300, honey: 35 },
      { x: 380, y: 600, honey: 30 },
      ...mirrored([{ x: 520, y: 220, honey: 35 }]),
    ],
  },
  {
    name: 'Hold the Hive',
    seconds: 0,
    flowers: 7,
    lines: 3,
    bees: 24,
    difficulty: 4,
    golden: true,
    lesson: 'defend',
    wave: ['raider'],
    rival: { ...NEST, bees: 24, lines: 3, skill: 'steady', raids: true, raidOut: true },
    // Two corridors either side of a hedge wall down the middle; the richest
    // flowers wait at their far ends.
    walls: mirroredWalls([
      [4, 1, 'L'],
      [4, 2, 'L'],
      [4, 3, 'L'],
      [2, 1, 'T'],
      [2, 4, 'T'],
    ]),
    layout: [
      { x: 640, y: 170, honey: 60 },
      { x: 640, y: 640, honey: 60 },
      ...mirrored([
        { x: 400, y: 640, honey: 30 },
        { x: 560, y: 360, honey: 40 },
        { x: 110, y: 200, honey: 25 },
      ]),
    ],
  },
  {
    name: 'Into the Mist',
    seconds: 0,
    flowers: 8,
    lines: 3,
    bees: 24,
    difficulty: 4,
    lesson: 'mist',
    lessonPoints: { via: { x: 600, y: 300 } },
    fog: true,
    rival: { ...NEST, bees: 24, lines: 3, skill: 'steady', raidOut: true },
    walls: mirroredWalls([
      [3, 2, 'L'],
      [3, 3, 'L'],
      [1, 2, 'T'],
      [3, 1, 'T'],
    ]),
    layout: [
      { x: 640, y: 168, honey: 50, kind: 'royal' },
      { x: 640, y: 560, honey: 50 },
      ...mirrored([
        { x: 430, y: 420, honey: 30 },
        { x: 470, y: 640, honey: 25 },
        { x: 110, y: 230, honey: 30 },
      ]),
    ],
  },
  {
    name: 'Full Bloom',
    seconds: 0,
    flowers: 9,
    lines: 4,
    bees: 32,
    difficulty: 5,
    lesson: 'golden',
    fog: true,
    golden: true,
    wave: ['raider'],
    rival: { ...NEST, bees: 28, lines: 4, skill: 'sharp', raids: true, raidOut: true },
    // A real maze: the centre is walled in and opened only from above and
    // below, so every rich flower is a route, not a line.
    walls: mirroredWalls([
      [3, 1, 'L'],
      [3, 2, 'L'],
      [3, 3, 'L'],
      [3, 1, 'T'],
      [1, 2, 'T'],
      [2, 3, 'T'],
      [2, 4, 'L'],
    ]),
    layout: [
      { x: 640, y: 400, honey: 80, kind: 'royal' },
      { x: 640, y: 170, honey: 50 },
      { x: 640, y: 650, honey: 50 },
      ...mirrored([
        { x: 440, y: 300, honey: 35 },
        { x: 420, y: 640, honey: 35 },
        { x: 110, y: 200, honey: 30 },
        { x: 110, y: 640, honey: 40, opensAt: 35 },
      ]),
    ],
  },

  // ---- Bramble Maze: hand-built, routing in legs. Every board is a
  // different shape on each side — a fair fight, never a mirror — and from
  // 2-2 on, buds open partway through, so the board you plan at the start is
  // not the board you finish on. Hedges and buds only: no golden blooms and
  // no raids on your hive, so the routing is the whole puzzle. You may still
  // raid them.
  {
    name: 'First Hedges',
    seconds: 0,
    fog: false,
    flowers: 7,
    lines: 3,
    bees: 24,
    difficulty: 4,
    intro: 'Drag on from the end of a line to steer round hedges',
    rival: { ...NEST, bees: 20, lines: 3, skill: 'dozy', raids: false },
    // Your rich flowers wait behind your own hedge; theirs sit in the open.
    walls: [
      [2, 1, 'L'],
      [2, 2, 'L'],
      [2, 3, 'L'],
      [5, 3, 'T'],
      [6, 3, 'T'],
    ],
    layout: [
      { x: 106, y: 200, honey: 25 },
      { x: 411, y: 284, honey: 45 },
      { x: 411, y: 530, honey: 40 },
      { x: 640, y: 400, honey: 45 },
      { x: 640, y: 640, honey: 30 },
      { x: 869, y: 284, honey: 35 },
      { x: 1100, y: 640, honey: 35 },
    ],
  },
  {
    name: 'Buds',
    seconds: 0,
    fog: false,
    flowers: 6,
    lines: 3,
    bees: 24,
    difficulty: 5,
    intro: 'Buds open later — have a line free when they do',
    rival: { ...NEST, bees: 22, lines: 3, skill: 'steady', raids: false },
    // An S through the middle; the big honey is still in bud at the start.
    walls: [
      [3, 0, 'L'],
      [3, 1, 'L'],
      [3, 2, 'L'],
      [5, 2, 'L'],
      [5, 3, 'L'],
      [5, 4, 'L'],
    ],
    layout: [
      { x: 150, y: 250, honey: 30 },
      { x: 420, y: 640, honey: 35 },
      { x: 640, y: 560, honey: 40 },
      { x: 640, y: 170, honey: 30 },
      { x: 860, y: 200, honey: 35 },
      { x: 1150, y: 640, honey: 30 },
      { x: 400, y: 200, honey: 55, opensAt: 25 },
      { x: 880, y: 640, honey: 55, opensAt: 25 },
    ],
  },
  {
    name: 'Narrow Rows',
    seconds: 0,
    flowers: 8,
    lines: 3,
    bees: 24,
    difficulty: 5,
    fog: true,
    rival: { ...NEST, bees: 22, lines: 3, skill: 'steady', raids: false },
    // Three bands of meadow joined by narrow gaps: the middle gap is shared,
    // the top band is reached only round the far edges — yours on the left.
    walls: [
      [0, 3, 'T'],
      [1, 3, 'T'],
      [2, 3, 'T'],
      [5, 3, 'T'],
      [6, 3, 'T'],
      [7, 3, 'T'],
      [1, 1, 'T'],
      [2, 1, 'T'],
      [3, 1, 'T'],
      [4, 1, 'T'],
      [5, 1, 'T'],
      [6, 1, 'T'],
      [7, 1, 'T'],
    ],
    layout: [
      { x: 420, y: 620, honey: 30 },
      { x: 860, y: 620, honey: 30 },
      { x: 300, y: 330, honey: 40 },
      { x: 980, y: 330, honey: 40 },
      { x: 640, y: 300, honey: 45 },
      { x: 640, y: 168, honey: 60 },
      { x: 150, y: 168, honey: 35 },
      { x: 1130, y: 168, honey: 35 },
    ],
  },
  {
    name: 'Thorn Garden',
    seconds: 0,
    flowers: 8,
    lines: 4,
    bees: 32,
    difficulty: 6,
    fog: true,
    rival: { ...NEST, bees: 28, lines: 4, skill: 'steady', raids: false },
    // The Royal Bloom's garden opens toward the wasps; you have a private
    // pocket top-left, reached only the long way round.
    walls: [
      [3, 1, 'T'],
      [4, 1, 'T'],
      [3, 1, 'L'],
      [3, 2, 'L'],
      [3, 3, 'T'],
      [4, 3, 'T'],
      [5, 1, 'L'],
      [1, 1, 'T'],
      [2, 1, 'T'],
      [3, 0, 'L'],
    ],
    layout: [
      { x: 640, y: 340, honey: 60, kind: 'royal' },
      { x: 259, y: 168, honey: 40 },
      { x: 411, y: 168, honey: 40 },
      { x: 411, y: 632, honey: 35 },
      { x: 640, y: 632, honey: 40 },
      { x: 1021, y: 200, honey: 35 },
      { x: 869, y: 632, honey: 30 },
      { x: 564, y: 516, honey: 50, opensAt: 35 },
    ],
  },
  {
    name: 'Lost Clover',
    seconds: 0,
    flowers: 8,
    lines: 3,
    bees: 24,
    difficulty: 6,
    fog: true,
    rival: { ...NEST, bees: 22, lines: 3, skill: 'steady', raids: false },
    // Each colony has a hidden pocket in its own corner, walled off and
    // entered from the side away from home. Find yours first.
    walls: [
      [0, 4, 'T'],
      [1, 4, 'T'],
      [6, 1, 'T'],
      [7, 1, 'T'],
      [3, 2, 'L'],
      [5, 2, 'L'],
    ],
    layout: [
      { x: 106, y: 632, honey: 45 },
      { x: 259, y: 640, honey: 35 },
      { x: 1021, y: 168, honey: 45 },
      { x: 1174, y: 168, honey: 35 },
      { x: 640, y: 284, honey: 40 },
      { x: 640, y: 560, honey: 40 },
      { x: 450, y: 330, honey: 25 },
      { x: 830, y: 420, honey: 25 },
    ],
  },
  {
    name: 'Hedge Loop',
    seconds: 0,
    fog: false,
    flowers: 9,
    lines: 4,
    bees: 32,
    difficulty: 7,
    rival: { ...NEST, bees: 28, lines: 4, skill: 'steady', raids: false },
    // A ring of hedge round the middle: you get in at the bottom-left, they
    // get in at the top-right, and the buds outside open late.
    walls: [
      [2, 1, 'T'],
      [3, 1, 'T'],
      [4, 1, 'T'],
      [5, 1, 'T'],
      [2, 4, 'T'],
      [3, 4, 'T'],
      [4, 4, 'T'],
      [5, 4, 'T'],
      [2, 1, 'L'],
      [2, 2, 'L'],
      [6, 2, 'L'],
      [6, 3, 'L'],
    ],
    layout: [
      { x: 640, y: 400, honey: 60 },
      { x: 480, y: 300, honey: 35 },
      { x: 800, y: 500, honey: 35 },
      { x: 640, y: 168, honey: 45 },
      { x: 640, y: 632, honey: 45 },
      { x: 150, y: 200, honey: 30 },
      { x: 1130, y: 632, honey: 30 },
      { x: 411, y: 632, honey: 50, opensAt: 40 },
      { x: 869, y: 168, honey: 50, opensAt: 40 },
    ],
  },
  {
    name: 'The Long Way',
    seconds: 0,
    flowers: 9,
    lines: 4,
    bees: 32,
    difficulty: 8,
    fog: true,
    rival: { ...NEST, bees: 28, lines: 4, skill: 'steady', raids: false },
    // A hedge down the middle, open only at the bottom: the far side is a
    // long trip for either colony, and the bud there is worth making it.
    walls: [
      [4, 0, 'L'],
      [4, 1, 'L'],
      [4, 2, 'L'],
      [4, 3, 'L'],
      [1, 2, 'T'],
      [2, 2, 'T'],
      [5, 1, 'T'],
      [6, 1, 'T'],
      [7, 1, 'T'],
    ],
    layout: [
      { x: 150, y: 168, honey: 40 },
      { x: 420, y: 168, honey: 45 },
      { x: 420, y: 400, honey: 30 },
      { x: 869, y: 168, honey: 50 },
      { x: 1130, y: 168, honey: 45 },
      { x: 869, y: 400, honey: 30 },
      { x: 640, y: 632, honey: 55 },
      { x: 150, y: 632, honey: 45, opensAt: 40 },
      { x: 1130, y: 632, honey: 45, opensAt: 55 },
    ],
  },
  {
    name: 'Bramble Heart',
    seconds: 0,
    flowers: 10,
    lines: 4,
    bees: 32,
    difficulty: 8,
    fog: true,
    rival: { ...NEST, bees: 24, lines: 4, skill: 'steady', raids: false },
    // The Royal Bloom at the heart has one gate, on the wasps' side of the
    // bottom; your consolation is a bud in your own corner.
    walls: [
      [3, 1, 'T'],
      [4, 1, 'T'],
      [3, 1, 'L'],
      [3, 2, 'L'],
      [5, 1, 'L'],
      [5, 2, 'L'],
      [3, 3, 'T'],
    ],
    layout: [
      { x: 564, y: 284, honey: 70, kind: 'royal' },
      { x: 716, y: 400, honey: 30 },
      { x: 150, y: 168, honey: 35 },
      { x: 411, y: 632, honey: 40 },
      { x: 640, y: 632, honey: 45 },
      { x: 869, y: 632, honey: 40 },
      { x: 1130, y: 168, honey: 35 },
      { x: 259, y: 284, honey: 30 },
      { x: 1021, y: 284, honey: 30 },
      { x: 106, y: 632, honey: 45, opensAt: 40 },
    ],
  },
  {
    name: 'Five Roads',
    seconds: 0,
    fog: false,
    flowers: 12,
    lines: 5,
    bees: 40,
    difficulty: 9,
    rival: { ...NEST, bees: 34, lines: 5, skill: 'steady', raids: false },
    // Hedges with gaps in different rows on each side: five roads across,
    // none of them straight. The two big buds in the middle open together.
    walls: [
      [2, 0, 'L'],
      [2, 1, 'L'],
      [2, 3, 'L'],
      [2, 4, 'L'],
      [4, 0, 'L'],
      [4, 2, 'L'],
      [4, 4, 'L'],
      [6, 0, 'L'],
      [6, 2, 'L'],
      [6, 3, 'L'],
      [6, 4, 'L'],
    ],
    layout: [
      { x: 106, y: 168, honey: 35 },
      { x: 106, y: 632, honey: 35 },
      { x: 1174, y: 168, honey: 35 },
      { x: 1174, y: 632, honey: 35 },
      { x: 411, y: 168, honey: 40 },
      { x: 411, y: 632, honey: 40 },
      { x: 869, y: 168, honey: 40 },
      { x: 869, y: 632, honey: 40 },
      { x: 564, y: 400, honey: 45 },
      { x: 716, y: 400, honey: 45 },
      { x: 564, y: 168, honey: 65, opensAt: 45 },
      { x: 716, y: 632, honey: 65, opensAt: 45 },
    ],
  },
  {
    name: 'The Labyrinth',
    seconds: 0,
    flowers: 12,
    lines: 5,
    bees: 40,
    difficulty: 10,
    fog: true,
    rival: { ...NEST, bees: 36, lines: 5, skill: 'sharp', raids: false },
    // A true maze, different on each side: yours winds, theirs is open but
    // long. The Royal Bloom sits in a dead end that both have to plan for.
    walls: [
      [2, 0, 'L'],
      [2, 1, 'L'],
      [1, 2, 'T'],
      [2, 2, 'T'],
      [3, 1, 'T'],
      [3, 2, 'L'],
      [3, 3, 'L'],
      [4, 0, 'L'],
      [4, 1, 'L'],
      [4, 4, 'L'],
      [5, 2, 'T'],
      [6, 2, 'T'],
      [5, 3, 'L'],
      [6, 1, 'L'],
    ],
    layout: [
      { x: 640, y: 516, honey: 70, kind: 'royal' },
      { x: 106, y: 168, honey: 40 },
      { x: 411, y: 200, honey: 40 },
      { x: 411, y: 400, honey: 35 },
      { x: 411, y: 640, honey: 40 },
      { x: 716, y: 200, honey: 40 },
      { x: 1021, y: 168, honey: 40 },
      { x: 869, y: 400, honey: 35 },
      { x: 869, y: 640, honey: 40 },
      { x: 1174, y: 400, honey: 30 },
      { x: 259, y: 632, honey: 45, opensAt: 45 },
      { x: 1021, y: 632, honey: 45, opensAt: 45 },
    ],
  },

  // ---- Wasp Summer: the wasps fight back. Raiders fly at your hive, the
  // colony gets sharper, and every board asks whether to forage, raid or
  // stand guard.
  {
    name: 'First Raid',
    seconds: 0,
    fog: false,
    flowers: 8,
    lines: 3,
    bees: 24,
    difficulty: 5,
    wave: [R],
    intro: 'Raiders! Tap a wasp to swat it before it robs your hive',
    rival: { ...NEST, bees: 22, lines: 3, skill: 'steady', raids: true, raidOut: true },
    walls: [
      [3, 1, 'L'],
      [3, 2, 'L'],
      [5, 2, 'L'],
      [5, 3, 'L'],
    ],
    layout: [
      { x: 150, y: 200, honey: 30 },
      { x: 411, y: 200, honey: 40 },
      { x: 420, y: 640, honey: 35 },
      { x: 640, y: 400, honey: 45 },
      { x: 869, y: 200, honey: 35 },
      { x: 869, y: 640, honey: 40 },
      { x: 1130, y: 200, honey: 30 },
      { x: 640, y: 640, honey: 50, opensAt: 35 },
    ],
  },
  {
    name: 'Pair of Pests',
    seconds: 0,
    flowers: 9,
    lines: 3,
    bees: 24,
    difficulty: 6,
    fog: true,
    golden: true,
    wave: [R, R],
    rival: { ...NEST, bees: 22, lines: 3, skill: 'steady', raids: true, raidOut: true },
    // Your flowers are near and few; theirs are rich and far. Their jar will
    // pull ahead — that is when a raid pays.
    walls: [
      [2, 2, 'T'],
      [2, 3, 'L'],
      [5, 1, 'L'],
      [5, 2, 'L'],
      [6, 4, 'T'],
    ],
    layout: [
      { x: 150, y: 330, honey: 30 },
      { x: 300, y: 640, honey: 30 },
      { x: 480, y: 450, honey: 35 },
      { x: 640, y: 200, honey: 40 },
      { x: 880, y: 330, honey: 45 },
      { x: 1100, y: 200, honey: 50 },
      { x: 1100, y: 640, honey: 45 },
      { x: 640, y: 620, honey: 35 },
      { x: 420, y: 200, honey: 50, opensAt: 40 },
    ],
  },
  {
    name: 'Stingers',
    seconds: 0,
    flowers: 10,
    lines: 4,
    bees: 32,
    difficulty: 6,
    fog: true,
    golden: true,
    wave: [R, R, R],
    rival: { ...NEST, bees: 20, lines: 4, skill: 'steady', raids: true, raidOut: true },
    // A long hedge across the middle row: top and bottom are two meadows,
    // joined by one narrow gap on each side.
    walls: [
      [0, 2, 'T'],
      [1, 2, 'T'],
      [3, 2, 'T'],
      [4, 2, 'T'],
      [5, 2, 'T'],
      [7, 2, 'T'],
      [0, 3, 'T'],
      [1, 3, 'T'],
    ],
    layout: [
      { x: 150, y: 200, honey: 40 },
      { x: 420, y: 168, honey: 45 },
      { x: 640, y: 250, honey: 50 },
      { x: 869, y: 168, honey: 40 },
      { x: 1130, y: 200, honey: 35 },
      { x: 450, y: 600, honey: 35 },
      { x: 640, y: 520, honey: 40 },
      { x: 869, y: 600, honey: 35 },
      { x: 150, y: 640, honey: 30 },
      { x: 300, y: 290, honey: 50, opensAt: 40 },
    ],
  },
  {
    name: 'Swarm Season',
    seconds: 0,
    flowers: 10,
    lines: 4,
    bees: 32,
    difficulty: 7,
    fog: true,
    golden: true,
    wave: [R, R, R],
    rival: { ...NEST, bees: 28, lines: 4, skill: 'steady', raids: true, raidOut: true },
    // Open ground, thick mist, buds on a timer: a board about reading
    // what is coming and who will get there first.
    walls: [
      [3, 0, 'L'],
      [5, 4, 'L'],
      [4, 2, 'T'],
    ],
    layout: [
      { x: 150, y: 168, honey: 35 },
      { x: 420, y: 300, honey: 40 },
      { x: 450, y: 640, honey: 40 },
      { x: 640, y: 400, honey: 45 },
      { x: 830, y: 500, honey: 40 },
      { x: 860, y: 168, honey: 40 },
      { x: 1130, y: 330, honey: 35 },
      { x: 1130, y: 640, honey: 35 },
      { x: 640, y: 168, honey: 50, opensAt: 30 },
      { x: 640, y: 640, honey: 50, opensAt: 50 },
    ],
  },
  {
    name: 'Drone Rush',
    seconds: 0,
    flowers: 10,
    lines: 4,
    bees: 32,
    difficulty: 8,
    fog: true,
    golden: true,
    wave: [D, D, R, R],
    intro: 'Drones are fast — swat them early',
    rival: { ...NEST, bees: 26, lines: 4, skill: 'sharp', raids: true, raidOut: true },
    // Your hive sits in a hedged yard with two gates: easy to defend,
    // slow to leave.
    walls: [
      [0, 2, 'T'],
      [1, 2, 'T'],
      [2, 3, 'L'],
      [2, 4, 'L'],
      [5, 1, 'T'],
      [6, 1, 'T'],
      [4, 1, 'L'],
      [4, 2, 'L'],
    ],
    layout: [
      { x: 106, y: 632, honey: 35 },
      { x: 150, y: 168, honey: 40 },
      { x: 411, y: 284, honey: 40 },
      { x: 480, y: 600, honey: 45 },
      { x: 716, y: 400, honey: 45 },
      { x: 869, y: 168, honey: 45 },
      { x: 869, y: 632, honey: 40 },
      { x: 1174, y: 168, honey: 35 },
      { x: 640, y: 168, honey: 50, opensAt: 35 },
      { x: 300, y: 400, honey: 40, opensAt: 50 },
    ],
  },
  {
    name: 'Hot Wind',
    seconds: 0,
    flowers: 11,
    lines: 4,
    bees: 32,
    difficulty: 8,
    fog: true,
    golden: true,
    wave: [D, D, R, R],
    rival: { ...NEST, bees: 27, lines: 4, skill: 'sharp', raids: true, raidOut: true },
    // Diagonal hedges: what is near as the bee flies is far as the line goes.
    walls: [
      [1, 1, 'L'],
      [2, 1, 'T'],
      [2, 2, 'L'],
      [3, 2, 'T'],
      [3, 3, 'L'],
      [5, 1, 'L'],
      [5, 2, 'T'],
      [6, 2, 'L'],
      [6, 3, 'T'],
      [4, 4, 'L'],
    ],
    layout: [
      { x: 106, y: 168, honey: 40 },
      { x: 259, y: 168, honey: 35 },
      { x: 411, y: 284, honey: 45 },
      { x: 564, y: 400, honey: 40 },
      { x: 564, y: 640, honey: 40 },
      { x: 716, y: 284, honey: 40 },
      { x: 869, y: 400, honey: 45 },
      { x: 1174, y: 168, honey: 40 },
      { x: 1021, y: 640, honey: 35 },
      { x: 259, y: 640, honey: 45, opensAt: 40 },
      { x: 1021, y: 168, honey: 45, opensAt: 40 },
    ],
  },
  {
    name: 'Guarded Grove',
    seconds: 0,
    flowers: 11,
    lines: 5,
    bees: 40,
    difficulty: 9,
    fog: true,
    golden: true,
    wave: [D, R, R, R, R],
    rival: { ...NEST, bees: 28, lines: 5, skill: 'sharp', raids: true, raidOut: true },
    // The grove in the middle is walled on three sides and open to the top;
    // the Royal Bloom is inside. The far corners hold the rest.
    walls: [
      [3, 2, 'L'],
      [3, 3, 'L'],
      [5, 2, 'L'],
      [5, 3, 'L'],
      [3, 4, 'T'],
      [4, 4, 'T'],
    ],
    layout: [
      { x: 640, y: 516, honey: 70, kind: 'royal' },
      { x: 564, y: 300, honey: 35 },
      { x: 106, y: 168, honey: 40 },
      { x: 106, y: 632, honey: 40 },
      { x: 1174, y: 168, honey: 40 },
      { x: 1174, y: 632, honey: 40 },
      { x: 411, y: 168, honey: 40 },
      { x: 869, y: 168, honey: 40 },
      { x: 400, y: 640, honey: 40 },
      { x: 880, y: 640, honey: 40 },
      { x: 716, y: 168, honey: 50, opensAt: 45 },
    ],
  },
  {
    name: 'Hornet Nest',
    seconds: 0,
    flowers: 11,
    lines: 5,
    bees: 40,
    difficulty: 10,
    fog: true,
    golden: true,
    wave: [H, R, R, D],
    intro: 'Hornets take four swats',
    rival: { ...NEST, bees: 32, lines: 5, skill: 'sharp', raids: true, raidOut: true },
    // Their side is a fortress with one door; yours is open meadow and an
    // easy target. Raid their jar when it runs ahead, cut their raids when
    // yours does.
    walls: [
      [5, 1, 'L'],
      [5, 2, 'L'],
      [5, 4, 'L'],
      [5, 1, 'T'],
      [6, 1, 'T'],
      [7, 1, 'T'],
    ],
    layout: [
      { x: 150, y: 200, honey: 40 },
      { x: 300, y: 640, honey: 40 },
      { x: 450, y: 300, honey: 45 },
      { x: 640, y: 450, honey: 45 },
      { x: 640, y: 168, honey: 40 },
      { x: 869, y: 300, honey: 45 },
      { x: 1021, y: 640, honey: 45 },
      { x: 1174, y: 300, honey: 40 },
      { x: 869, y: 168, honey: 40 },
      { x: 480, y: 640, honey: 50, opensAt: 40 },
      { x: 1100, y: 168, honey: 50, opensAt: 55 },
    ],
  },
  {
    name: 'Siege',
    seconds: 0,
    flowers: 12,
    lines: 5,
    bees: 40,
    difficulty: 11,
    fog: true,
    golden: true,
    wave: [H, D, D, R, R, R],
    rival: { ...NEST, bees: 26, lines: 5, skill: 'sharp', raids: true, raidOut: true },
    // A maze down the middle and the buds on their side: you will be behind
    // at the half, and the raid is how you get back.
    walls: [
      [3, 0, 'L'],
      [3, 1, 'L'],
      [3, 3, 'L'],
      [3, 4, 'L'],
      [4, 1, 'T'],
      [4, 4, 'T'],
      [5, 1, 'L'],
      [5, 2, 'L'],
      [5, 3, 'L'],
      [1, 1, 'T'],
      [6, 4, 'T'],
    ],
    layout: [
      { x: 106, y: 168, honey: 40 },
      { x: 259, y: 168, honey: 35 },
      { x: 411, y: 400, honey: 45 },
      { x: 300, y: 640, honey: 40 },
      { x: 640, y: 168, honey: 45 },
      { x: 640, y: 400, honey: 50 },
      { x: 640, y: 640, honey: 45 },
      { x: 869, y: 300, honey: 40 },
      { x: 1174, y: 168, honey: 40 },
      { x: 1021, y: 640, honey: 40 },
      { x: 869, y: 640, honey: 55, opensAt: 40 },
      { x: 1174, y: 400, honey: 55, opensAt: 55 },
    ],
  },
  {
    name: 'Queen of Summer',
    seconds: 0,
    flowers: 13,
    lines: 5,
    bees: 40,
    difficulty: 12,
    fog: true,
    golden: true,
    wave: [H, D, D, R, R, R],
    rival: { ...NEST, bees: 22, lines: 5, skill: 'sharp', raids: true, raidOut: true },
    // Everything the summer taught: a walled heart with the Royal Bloom,
    // pockets in the mist, buds in two waves, and a colony as good as you.
    walls: [
      [3, 1, 'T'],
      [4, 1, 'T'],
      [3, 1, 'L'],
      [5, 1, 'L'],
      [5, 2, 'L'],
      [3, 3, 'T'],
      [1, 1, 'T'],
      [0, 4, 'T'],
      [6, 1, 'T'],
      [7, 4, 'T'],
      [2, 3, 'L'],
      [6, 2, 'L'],
    ],
    layout: [
      { x: 640, y: 340, honey: 80, kind: 'royal' },
      { x: 106, y: 168, honey: 45 },
      { x: 106, y: 640, honey: 45 },
      { x: 1174, y: 168, honey: 45 },
      { x: 1174, y: 640, honey: 45 },
      { x: 411, y: 168, honey: 40 },
      { x: 411, y: 600, honey: 40 },
      { x: 869, y: 168, honey: 40 },
      { x: 869, y: 600, honey: 40 },
      { x: 640, y: 640, honey: 45 },
      { x: 259, y: 284, honey: 35 },
      { x: 564, y: 168, honey: 55, opensAt: 35 },
      { x: 716, y: 516, honey: 55, opensAt: 60 },
    ],
  },
];

/**
 * Honey for one, two and three stars, per level.
 *
 * Written by `src/playtest/fit-levels.ts` — run it again after changing any
 * level above or anything that moves honey, and paste its output here.
 */
export const LEVEL_STARS: ReadonlyArray<readonly [number, number, number]> = [
  [210, 260, 290],
  [310, 360, 400],
  [240, 390, 550],
  [290, 500, 550],
  [400, 630, 770],
  [450, 1225, 1350],
  [390, 2025, 2225],
  [370, 1675, 1850],
  [590, 1775, 1950],
  [560, 3500, 3850],
  [1025, 1175, 1300],
  [1250, 1400, 1550],
  [970, 1175, 1300],
  [1125, 1675, 1850],
  [630, 900, 990],
  [1900, 2225, 2450],
  [2075, 2600, 2850],
  [2250, 2575, 2825],
  [2775, 3175, 3500],
  [1775, 2000, 2200],
  [1350, 1500, 1650],
  [1325, 1725, 1900],
  [930, 1050, 1150],
  [920, 1275, 1400],
  [1100, 1325, 1450],
  [700, 810, 890],
  [990, 1125, 1250],
  [1150, 1600, 1750],
  [1175, 1625, 1825],
  [2675, 3200, 4175],
];

/**
 * Treasure grows with the campaign: a honey pot once the mist arrives, a
 * lost swarm and a Royal Bloom from the sixth board, and a second pot after.
 */
function treasuresFor(index: number): TreasurePlan {
  // Hand-built boards place their Royal Bloom themselves; the generated
  // worlds hide one each. Honey pots and lost swarms are gone: treasure that
  // only showed up on the results card confused more than it rewarded.
  // Every board is hand-built now and places its own Royal Bloom.
  void index;
  return { honeyPots: 0, lostBees: 0, royalBloom: false };
}

/**
 * [goal, three-star seconds, two-star seconds] per level, fitted by
 * `src/playtest/fit-levels.ts`. The goal column is the board's own jar,
 * repeated for reference. 3-3 is set by hand, after its hedge gap changed.
 */
export const LEVEL_GOALS: ReadonlyArray<readonly [number, number, number]> = [
  [25, 21, 28],
  [50, 23, 30],
  [75, 27, 38],
  [115, 30, 46],
  [120, 36, 47],
  [115, 48, 74],
  [90, 48, 63],
  [160, 80, 84],
  [140, 74, 107],
  [240, 78, 113],
  [135, 42, 57],
  [160, 66, 83],
  [165, 112, 136],
  [170, 73, 134],
  [150, 45, 79],
  [200, 67, 108],
  [200, 89, 115],
  [210, 109, 125],
  [270, 98, 126],
  [260, 139, 179],
  [160, 79, 122],
  [185, 69, 93],
  [210, 82, 100],
  [215, 66, 88],
  [215, 69, 97],
  [235, 84, 117],
  [245, 69, 102],
  [250, 62, 89],
  [275, 72, 102],
  [315, 55, 102],
];

/**
 * The jar on a board against the wasps: a little over half of all the honey
 * it will ever hold, buds included. Filling it means out-foraging the wasps
 * outright, so the third star is there for a clear win — and only one side
 * can fill it.
 */
export const JAR_SHARE = 0.52;

/** Every rule a board's honey has to keep. Checked by `levels.test.ts`. */
export const HONEY_RULES = {
  /** No one flower is more than this share of the jar: no single fact wins. */
  maxFlowerShare: 0.4,
} as const;

function jarFor(spec: Spec): number | undefined {
  if (!spec.rival || !spec.layout) return undefined;
  const total = spec.layout.reduce((sum, f) => sum + f.honey, 0);
  return Math.round((total * JAR_SHARE) / 5) * 5;
}

function withRival(rival: RivalSpec | undefined): { rival?: RivalSpec } {
  return rival ? { rival } : {};
}

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
  // Mist from the third board on: the first two teach the drag in the open.
  // The first world is lit unless a board says otherwise; the mist is taught
  // on its own board. The worlds after keep it.
  fog: spec.fog ?? index >= LEVELS_PER_WORLD,
  treasures: treasuresFor(index),
  golden: spec.golden ?? false,
  rich: spec.rich ?? false,
  wave: spec.wave ?? [],
  ...(spec.intro ? { intro: spec.intro } : {}),
  stars: LEVEL_STARS[index] ?? [60, 110, 160],
  goal: spec.goal ?? jarFor(spec) ?? LEVEL_GOALS[index]?.[0] ?? 100,
  // Against a rival there is no sunset: the wasps are the clock.
  timed: spec.seconds > 0 && !spec.rival,
  starTimes: spec.starTimes ?? [
    LEVEL_GOALS[index]?.[1] ?? 20,
    LEVEL_GOALS[index]?.[2] ?? 35,
  ],
  ...(spec.layout ? { layout: spec.layout } : {}),
  ...(spec.walls ? { walls: spec.walls } : {}),
  ...(spec.lesson ? { lesson: spec.lesson } : {}),
  ...(spec.lessonPoints ? { lessonPoints: spec.lessonPoints } : {}),
  ...withRival(spec.rival),
}));

/**
 * The hive's shop opens once this level is passed. Before that there is one
 * thing to learn — the drag — and a shop full of skills is a menu of words
 * that mean nothing yet.
 */
export const HIVE_OPENS_AFTER = 5;

export function hiveOpen(levelStars: readonly number[]): boolean {
  return (levelStars[HIVE_OPENS_AFTER - 1] ?? 0) >= 1;
}

/** Endless mode opens with the first world finished. */
export function endlessOpen(levelStars: readonly number[]): boolean {
  return (levelStars[LEVELS_PER_WORLD - 1] ?? 0) >= 1;
}

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
    treasures: level.treasures,
    ...(level.layout ? { layout: level.layout } : {}),
    ...(level.walls ? { walls: level.walls } : {}),
    // A find tops up the jar, but never fills it: one lucky sparkle used to
    // win a level outright.
    // Against the wasps, no find bonus: the jar should be readable from the
    // flowers alone, and finding a flower first is its own reward.
    discoveryCap: level.rival ? 0 : Math.max(5, Math.round(level.goal * 0.12)),
    // Worth chasing, never the whole jar: a bloom that held most of the goal
    // turned a timed board into waiting for it to open.
    goldenHoney: Math.max(10, Math.round(level.goal * 0.15)),
    // Not in the first seconds: the opening is for reading the board and
    // laying the first lines. A bloom at 4s and raiders at 8s, on top of a
    // rival, was a race nobody could follow.
    firstGoldenAt: 18,
    firstRaidAt: 25,
    // What a raider steals is a share of this. Against the wasps a theft
    // counts twice — out of your jar and into theirs — so it is a third of
    // what a lone hive's raider takes.
    threatQuota: level.goal * (level.rival ? 1 : 3),
    // A swat is defence, not a honey source: a wave of five used to pay more
    // than half the jar and decided the race on its own.
    swatBounty: Math.max(1, Math.round(level.goal * 0.02)),
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
  // Ordinary wings. Campaign bees used to fly 30% faster to cut the wait,
  // and with a rival on the board it made everything happen at once.
  m.beeSpeedBonus = 0;
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

/**
 * Stars for filling the jar in `seconds`: one for filling it at all, two and
 * three for filling it fast. Not filling it is no stars.
 */
export function levelStarsForTime(level: LevelDef, seconds: number | null): number {
  if (seconds === null) return 0;
  const [three, two] = level.starTimes;
  if (seconds <= three) return 3;
  if (seconds <= two) return 2;
  return 1;
}

/** Stars a score earns on a level, 0-3. (Legacy honey thresholds.) */
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
