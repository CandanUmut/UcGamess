import type { LessonId } from './Levels.ts';

/**
 * The first world's lessons: one idea per board, shown by a hand doing it.
 *
 * Same rules as the first-run tutorial this grows out of. A lesson never
 * blocks and never pauses; each step finishes when the player has *done* the
 * thing, not when a timer runs out; a step that waits for its moment (a wasp,
 * an empty flower) shows nothing until that moment comes. Pure data and a
 * small state machine, so the whole of it is testable without a browser.
 */

/** What the hand demonstrates. Points are board coordinates. */
export type LessonHint =
  /** A drag from the hive to the nearest flower no line serves yet. */
  | { kind: 'drag-to-flower' }
  /** A drag from the hive to a fixed point. */
  | { kind: 'drag-to'; x: number; y: number }
  /** A drag from the tip of the newest line to a fixed point. */
  | { kind: 'drag-from-tip'; x: number; y: number }
  /** One drag from the hive that bends at `via` on its way to `to`. */
  | { kind: 'drag-around'; via: { x: number; y: number }; to: { x: number; y: number } }
  /** A tap on the nearest wasp. */
  | { kind: 'tap-wasp' }
  /** A drag from the hive to the golden bloom. */
  | { kind: 'drag-to-golden' }
  /** A press and hold on the wasps' raid line into the hive. */
  | { kind: 'hold-raid' };

/** What the lesson can see of the board, each frame. */
export interface LessonState {
  /** Seconds the board has been running. */
  time: number;
  routesDrawn: number;
  lines: number;
  honey: number;
  /** Flowers that have run dry so far. */
  drained: number;
  /** Wasps on the board right now. */
  wasps: number;
  waspsDowned: number;
  /** Flowers the player knows about. */
  discovered: number;
  /** A golden bloom is open. */
  golden: boolean;
  /** A line is working the golden bloom. */
  goldenServed: boolean;
  /** Lines that end on a flower. */
  connected: number;
  /** One of the player's lines is raiding the wasps' nest. */
  raiding: boolean;
  /** A wasp line is raiding the player's hive. */
  underRaid: boolean;
  /** Wasp raid lines the player has cut. */
  raidCuts: number;
}

interface Step {
  text: string;
  hint: LessonHint | null;
  /** The step waits, silently, until this is true. */
  when?: (s: LessonState) => boolean;
  /** Finished, given the state now and the state when the step began. */
  done: (s: LessonState, from: LessonState) => boolean;
}

/** Board-specific points the hand needs, from the level. */
export interface LessonPoints {
  /** Where to drag first: the hedge's end, or into the mist. */
  via?: { x: number; y: number };
  /** Where the second leg goes. */
  to?: { x: number; y: number };
}

/** Taught on the first board that has golden blooms, the moment one opens. */
const goldenStep: Step = {
  text: 'A golden bloom! Rich honey, but it closes soon — send a line now!',
  hint: { kind: 'drag-to-golden' },
  when: (s) => s.golden,
  done: (s) => s.goldenServed || !s.golden,
};

function steps(id: LessonId, p: LessonPoints): Step[] {
  switch (id) {
    case 'drag':
      return [
        {
          text: 'Drag from the hive to the flower',
          hint: { kind: 'drag-to-flower' },
          done: (s) => s.routesDrawn >= 1,
        },
        {
          text: 'Your bees fly honey home. Fill the jar!',
          hint: null,
          done: (s) => s.honey >= 8,
        },
      ];
    case 'second':
      return [
        {
          text: 'Drag from the hive to a flower',
          hint: { kind: 'drag-to-flower' },
          done: (s) => s.routesDrawn >= 1,
        },
        {
          text: 'One line carries 8 bees. Send the others to the second flower',
          hint: { kind: 'drag-to-flower' },
          done: (s) => s.connected >= 2,
        },
      ];
    case 'dry':
      return [
        {
          text: 'Wasps! They want the same flowers. Fill your jar before they fill theirs',
          hint: { kind: 'drag-to-flower' },
          done: (s) => s.routesDrawn >= 2,
        },
        {
          text: 'That flower is empty! Drag a new line to a fresh one',
          hint: { kind: 'drag-to-flower' },
          when: (s) => s.drained >= 1,
          done: (s, from) => s.routesDrawn > from.routesDrawn,
        },
      ];
    case 'sun':
      return [
        {
          text: 'The red bar under your jar is the wasps’. Beat them to the best flowers',
          hint: { kind: 'drag-to-flower' },
          done: (s) => s.routesDrawn >= 1,
        },
        goldenStep,
      ];
    case 'double': {
      const big = p.to ?? { x: 860, y: 330 };
      return [
        {
          text: 'The big flower holds the most honey. Drag a line to it',
          hint: { kind: 'drag-to', ...big },
          done: (s) => s.routesDrawn >= 1,
        },
        {
          text: 'Drag a second line to the same flower: twice the bees, twice as fast',
          hint: { kind: 'drag-to', ...big },
          done: (s) => s.routesDrawn >= 2,
        },
      ];
    }
    case 'hedge': {
      const via = p.via ?? { x: 640, y: 640 };
      const to = p.to ?? { x: 880, y: 400 };
      return [
        {
          text: 'Bees can’t fly through hedges — drag around the end of it',
          hint: { kind: 'drag-around', via, to },
          done: (s) => s.connected >= 1,
        },
        {
          text: 'A line can bend: drag on from its tip to go further',
          hint: null,
          when: (s) => s.lines > s.connected,
          done: (s) => s.connected >= 2 || s.lines === s.connected,
        },
      ];
    }
    case 'raid':
      return [
        {
          text: 'Their jar is honey too: drag a line to the wasp nest to steal it',
          hint: { kind: 'drag-to', x: 1014, y: 492 },
          when: (s) => s.time > 6,
          done: (s) => s.raiding,
        },
        {
          text: 'Every raid trip is +1 for you and −1 for them — but the nest stings',
          hint: null,
          done: (s, from) => s.time - from.time > 7,
        },
      ];
    case 'defend':
      return [
        {
          text: 'The wasps are raiding your jar! Press and hold their red line to cut it',
          hint: { kind: 'hold-raid' },
          when: (s) => s.underRaid,
          done: (s) => s.raidCuts >= 1 || !s.underRaid,
        },
        {
          text: 'A raider! Tap it to swat it before it robs your hive',
          hint: { kind: 'tap-wasp' },
          when: (s) => s.wasps > 0,
          done: (s) => s.waspsDowned >= 1 || s.wasps === 0,
        },
      ];
    case 'mist': {
      const via = p.via ?? { x: 760, y: 300 };
      return [
        {
          text: 'More flowers hide in the dark mist. Drag a line into it to explore',
          hint: { kind: 'drag-to', ...via },
          done: (s, from) => s.discovered > from.discovered,
        },
        {
          text: 'Found one! Each find tops up the jar. Now send bees to it',
          hint: { kind: 'drag-to-flower' },
          done: (s, from) => s.routesDrawn > from.routesDrawn,
        },
      ];
    }
    case 'golden':
      return [
        {
          text: 'Everything at once! Golden blooms, wasps and mist — fill the jar',
          hint: null,
          done: (s) => s.routesDrawn >= 2,
        },
      ];
  }
}

export class Lesson {
  private readonly list: Step[];
  private index = 0;
  private from: LessonState | null = null;

  constructor(id: LessonId | undefined, points: LessonPoints = {}) {
    this.list = id ? steps(id, points) : [];
  }

  /** The step showing now, or null while waiting or once finished. */
  private shown: Step | null = null;

  get text(): string {
    return this.shown?.text ?? '';
  }

  get hint(): LessonHint | null {
    return this.shown?.hint ?? null;
  }

  get finished(): boolean {
    return this.index >= this.list.length;
  }

  update(s: LessonState): void {
    const step = this.list[this.index];
    if (!step) {
      this.shown = null;
      return;
    }
    if (!this.from) {
      if (step.when && !step.when(s)) {
        this.shown = null;
        return;
      }
      this.from = { ...s };
    }
    if (step.done(s, this.from)) {
      this.index += 1;
      this.from = null;
      this.shown = null;
      return;
    }
    this.shown = step;
  }
}
