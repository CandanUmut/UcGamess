import { TUNING } from '../config/tuning.ts';

/**
 * The clock that decides when wasps turn up.
 *
 * Kept apart from the wasps themselves because the two answer different
 * questions. A wasp knows how to cross a maze and what to do at the hive; this
 * knows *when* that becomes the player's problem, and that is the part the
 * playtest was actually complaining about. Wasps that drift about on a fixed
 * schedule are scenery.
 *
 * ### Why the gap is random
 *
 * A fixed interval is learned once and then stopped being looked at: the player
 * counts to twenty-five, defends, and goes back to ignoring the board. Sampling
 * the gap uniformly inside a range means the board has to be watched, which is
 * the entire reason to put an enemy on it.
 *
 * Randomness alone would be unfair, so the surprise is spent on *when* and
 * never on *whether you had a chance*: every raid announces itself
 * `warningSeconds` before it arrives, from the edge it will arrive at. That is
 * enough to break off a drag and lay a defence, and not enough to relax.
 */
export type RaidSignal = 'warning' | 'arrive' | null;

export class RaidClock {
  /** Wasps in the next raid. Zero on a day that has none. */
  size = 0;

  /** Seconds until the next thing happens — a warning, or the arrival. */
  private timer = 0;
  /** True between the warning and the arrival. */
  private warning = false;
  private random: () => number = Math.random;
  private extraWarning = 0;

  /**
   * Arms the clock for a day. `extraWarning` is what Lookouts buy.
   *
   * The extra seconds lengthen the warning without touching the gap, so the
   * item sells exactly what it says — more time to react — rather than quietly
   * making raids rarer as well.
   */
  begin(size: number, extraWarning = 0, random: () => number = Math.random): void {
    this.size = Math.max(0, Math.floor(size));
    this.extraWarning = Math.max(0, extraWarning);
    this.random = random;
    this.warning = false;

    if (this.size === 0) {
      this.timer = Number.POSITIVE_INFINITY;
      return;
    }

    // The opening is deliberately quiet. A raid landing in the first few
    // seconds would arrive before the player has a single route earning, and
    // "you lost honey you never had" teaches nothing.
    const first = Math.max(TUNING.raid.firstRaidEarliest, this.sampleGap());
    this.timer = Math.max(0, first - this.warningWindow);
  }

  /** True while the warning is showing and the wasps have not landed yet. */
  get incoming(): boolean {
    return this.warning;
  }

  /** Seconds of warning left, for the countdown. Zero when none is showing. */
  get warningLeft(): number {
    return this.warning ? Math.max(0, this.timer) : 0;
  }

  step(dt: number): RaidSignal {
    if (this.size === 0) return null;

    this.timer -= dt;
    if (this.timer > 0) return null;

    if (!this.warning) {
      this.warning = true;
      this.timer = this.warningWindow;
      return 'warning';
    }

    this.warning = false;
    // The gap is measured arrival-to-arrival, so the warning for the next raid
    // is subtracted out here rather than added on top. Otherwise every gap is
    // silently longer than the tuning says it is.
    this.timer = Math.max(0, this.sampleGap() - this.warningWindow);
    return 'arrive';
  }

  private get warningWindow(): number {
    return TUNING.raid.warningSeconds + this.extraWarning;
  }

  private sampleGap(): number {
    const { minGapSeconds, maxGapSeconds } = TUNING.raid;
    return minGapSeconds + this.random() * Math.max(0, maxGapSeconds - minGapSeconds);
  }
}
