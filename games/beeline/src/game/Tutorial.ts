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
export type TutorialStepId = 'aim' | 'watch' | 'sell' | 'done';

export interface TutorialStep {
  id: TutorialStepId;
  /** One line, in the player's terms. Shown near the top of the field. */
  text: string;
  /** Whether the hint line to the nearest flower should pulse. */
  showHintLine: boolean;
}

const STEPS: readonly TutorialStep[] = [
  {
    id: 'aim',
    text: 'Tap the hive to open the dial, tap again to fire the path',
    showHintLine: true,
  },
  {
    id: 'watch',
    text: 'Your bees follow the line you drew',
    showHintLine: false,
  },
  {
    // The step the whole economy hangs on, and the one a new player will not
    // guess: honey in the combs is stock, not score, and it only becomes money
    // when a line carries it to somebody who wants it. Taught immediately after
    // the first honey arrives, while the connection is obvious.
    id: 'sell',
    text: 'Honey is not money yet — drag a line to a buyer to sell it',
    showHintLine: false,
  },
];

export interface TutorialProgress {
  /** Routes the player has committed. */
  routesDrawn: number;
  /** Honey banked so far this day. */
  honey: number;
  /** Money earned so far this day. */
  money: number;
}

/**
 * Drives the tutorial from what the player has actually done.
 *
 * Deliberately holds no Phaser reference and no timers, so the whole thing can
 * be stepped through in a unit test.
 */
export class Tutorial {
  private index = 0;
  private active: boolean;

  constructor(enabled: boolean) {
    this.active = enabled;
  }

  get current(): TutorialStep | null {
    if (!this.active) return null;
    return STEPS[this.index] ?? null;
  }

  get finished(): boolean {
    return !this.active || this.index >= STEPS.length;
  }

  /** True while the pulsing hint line to the nearest flower should be drawn. */
  get wantsHintLine(): boolean {
    return this.current?.showHintLine ?? false;
  }

  /** Advances if the current step's evidence has arrived. */
  update(progress: TutorialProgress): void {
    const step = this.current;
    if (!step) return;

    const satisfied =
      step.id === 'aim'
        ? progress.routesDrawn >= 1
        : step.id === 'watch'
          ? progress.honey > 0
          : // Honey in the combs is not the lesson: money is. A player who
            // never sells never sees the loop close.
            progress.money > 0;

    if (satisfied) this.index += 1;
  }

  /** Stops the tutorial for good, e.g. when the first day ends. */
  dismiss(): void {
    this.active = false;
  }
}
