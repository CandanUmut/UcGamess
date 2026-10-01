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
  /** A tap on the nearest wasp. */
  | { kind: 'tap-wasp' }
  /** A drag from the hive to the golden bloom. */
  | { kind: 'drag-to-golden' };

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
          text: 'One line carries 8 bees. The rest are waiting —\ndrag a line to the other flower',
          hint: { kind: 'drag-to-flower' },
          done: (s) => s.connected >= 2,
        },
      ];
    case 'dry':
      return [
        {
          text: 'Small flowers run dry fast. Big ones last longer',
          hint: { kind: 'drag-to-flower' },
          done: (s) => s.routesDrawn >= 1,
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
          text: 'From now on the sun sets. Fill the jar before it does!\nThe clock starts with your first line',
          hint: { kind: 'drag-to-flower' },
          done: (s) => s.routesDrawn >= 1,
        },
      ];
    case 'hedge': {
      const via = p.via ?? { x: 640, y: 640 };
      const to = p.to ?? { x: 880, y: 400 };
      return [
        {
          text: 'Bees can’t fly through hedges. Drag past its end first…',
          hint: { kind: 'drag-to', ...via },
          done: (s) => s.routesDrawn >= 1,
        },
        {
          text: '…then drag on from the tip of your line to the flower',
          hint: { kind: 'drag-from-tip', ...to },
          done: (s) => s.connected >= 1,
        },
      ];
    }
    case 'wasp':
      return [
        {
          text: 'A wasp! Tap it to swat it before it robs your hive',
          hint: { kind: 'tap-wasp' },
          when: (s) => s.wasps > 0,
          done: (s) => s.waspsDowned >= 1 || s.wasps === 0,
        },
      ];
    case 'mist': {
      const via = p.via ?? { x: 760, y: 300 };
      return [
        {
          text: 'More flowers hide in the mist.\nDrag a line into the dark — your bees will look around',
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
          text: 'A golden bloom! Lots of honey, but it closes soon — quick!',
          hint: { kind: 'drag-to-golden' },
          when: (s) => s.golden,
          done: (s) => s.goldenServed || !s.golden,
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
