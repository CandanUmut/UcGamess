/**
 * The first-run tutorial, as a tiny state machine.
 *
 * Kept out of the scene deliberately. What the tutorial *is* — the steps, their
 * order, and the condition that completes each one — is design, and design that
 * lives inside a Phaser scene cannot be read or tested without booting a
 * browser. The scene's only job is to draw whatever `current` says.
 *
 * Three rules, all learned the hard way from the hint line this replaces:
 *
 *  - **It never blocks.** No modal, no "tap to continue", no pause. Every step
 *    completes by the player doing the thing, so a player who already knows how
 *    to play never notices there was a tutorial.
 *  - **It only ever runs once**, on the first run of a fresh save.
 *  - **Each step waits for evidence**, not for a timer. Advancing on a timer
 *    teaches the confident player nothing and abandons the hesitant one.
 */
export type TutorialStepId =
  'drag' | 'watch' | 'more' | 'reach' | 'branch' | 'extend' | 'recall' | 'done';

/** Which idea a tutorial teaches. One per level that introduces something. */
export type Lesson = 'basics' | 'branch' | 'extend' | 'recall';

/** Where the hint hand drags from and to, as a kind the scene resolves on the board. */
export type HintKind =
  | 'hive-to-flower'
  | 'hive-to-rich'
  | 'line-to-flower'
  | 'dry-tip-to-flower'
  | 'hold-dry-line';

export interface TutorialStep {
  id: TutorialStepId;
  /** One line, in the player's terms. Shown near the top of the field. */
  text: string;
  /** The hint hand to play, if any. */
  hint: HintKind | null;
  /** Only show this step once a line has run dry — the moment it applies. */
  needsDryLine?: boolean;
}

const LESSONS: Record<Lesson, readonly TutorialStep[]> = {
  basics: [
    { id: 'drag', text: 'Drag from the hive to a flower', hint: 'hive-to-flower' },
    { id: 'watch', text: 'Your bees fly the line and bring honey home', hint: null },
    {
      // The rule that makes lines matter: one line carries a crew, not the
      // whole swarm. Taught the moment it bites — bees idling at the hive.
      id: 'more',
      text: 'One line carries 8 bees — lay more lines!',
      hint: 'hive-to-flower',
    },
  ],
  branch: [
    { id: 'reach', text: 'Lay a line out to the far flowers', hint: 'hive-to-rich' },
    {
      // The idea the whole game turns on, taught on the first board where
      // straight lines from the hive cannot afford everything.
      id: 'branch',
      text: 'Now drag from your line to the next flower — a branch only pays for the new part',
      hint: 'line-to-flower',
    },
  ],
  extend: [
    {
      id: 'extend',
      text: 'That flower is dry. Drag on from the end of its line to reuse it',
      hint: 'dry-tip-to-flower',
      needsDryLine: true,
    },
  ],
  recall: [
    {
      id: 'recall',
      text: 'Hold a dry line to take back all its wax',
      hint: 'hold-dry-line',
      needsDryLine: true,
    },
  ],
};

export interface TutorialProgress {
  /** Lines the player has laid. */
  routesDrawn: number;
  /** Honey banked so far this day. */
  honey: number;
  /** Lines standing right now. */
  lines: number;
  /** Branches laid (a line started off another line). */
  branches?: number;
  /** Dry lines carried on from their tip. */
  extensions?: number;
  /** Lines taken back. */
  recalls?: number;
  /** Whether any line has run dry and is standing idle. */
  dryLine?: boolean;
}

/**
 * Drives a tutorial from what the player has actually done.
 *
 * Deliberately holds no Phaser reference and no timers, so the whole thing can
 * be stepped through in a unit test.
 */
export class Tutorial {
  private index = 0;
  private active: boolean;
  private readonly steps: readonly TutorialStep[];
  private waitingForDry = false;

  constructor(enabled: boolean, lesson: Lesson = 'basics') {
    this.active = enabled;
    this.steps = LESSONS[lesson];
  }

  get current(): TutorialStep | null {
    if (!this.active || this.waitingForDry) return null;
    return this.steps[this.index] ?? null;
  }

  get finished(): boolean {
    return !this.active || this.index >= this.steps.length;
  }

  /** True while the hint hand should be drawn. */
  get wantsHintLine(): boolean {
    return this.current?.hint != null;
  }

  /** Advances if the current step's evidence has arrived. */
  update(progress: TutorialProgress): void {
    const step = this.active ? (this.steps[this.index] ?? null) : null;
    if (!step) return;
    this.waitingForDry = !!step.needsDryLine && !progress.dryLine;

    const satisfied =
      step.id === 'drag' || step.id === 'reach'
        ? progress.routesDrawn >= 1
        : step.id === 'watch'
          ? progress.honey > 0
          : step.id === 'more'
            ? progress.lines >= 2
            : step.id === 'branch'
              ? (progress.branches ?? 0) >= 1
              : step.id === 'extend'
                ? (progress.extensions ?? 0) >= 1
                : step.id === 'recall'
                  ? (progress.recalls ?? 0) >= 1
                  : true;

    if (satisfied) this.index += 1;
  }

  /** Stops the tutorial for good, e.g. when the first day ends. */
  dismiss(): void {
    this.active = false;
  }
}
