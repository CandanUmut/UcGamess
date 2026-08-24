export interface FixedTimestepOptions {
  /** Simulation rate in Hz. 60 unless a game has a specific reason. */
  hz?: number;
  /**
   * Longest real frame we will simulate, in ms. Anything longer is treated as
   * a stall and discarded.
   */
  maxFrameMs?: number;
  /** Safety valve: most fixed steps to run in a single frame. */
  maxStepsPerFrame?: number;
}

/**
 * Decouples simulation rate from render rate.
 *
 * Why this exists: "physics breaks on a 144 Hz monitor" is a documented
 * rejection cause on CrazyGames, and it is the single easiest bug to ship
 * without noticing — the developer's 60 Hz laptop looks perfect while a
 * reviewer's 144 Hz display runs the game at 2.4x speed, or a 30 Hz phone runs
 * it at half. Any code that does `x += speed` in Phaser's `update()` has this
 * bug.
 *
 * The fix is an accumulator: bank real elapsed time, then run the simulation in
 * discrete fixed-size steps. Every step advances the world by exactly the same
 * dt regardless of display refresh, so behaviour is identical everywhere.
 *
 * Two guards matter:
 *
 *  - `maxFrameMs` clamps the "spiral of death". If a frame took 3 seconds
 *    (tabbed away, GC pause, an ad), naively simulating 180 steps takes longer
 *    than a frame, which enlarges the next delta, which needs more steps. We
 *    discard the excess and accept a small time skip instead — losing a moment
 *    of simulation is always better than locking the browser.
 *  - `maxStepsPerFrame` is the same guard expressed in step count, for the case
 *    where the device is simply too slow to keep up.
 *
 * `step()` returns an interpolation alpha in [0, 1): the fraction of a step
 * left over. Rendering at `previous + (current - previous) * alpha` removes the
 * visual stutter that a fixed simulation otherwise causes on a non-matching
 * refresh rate.
 */
export class FixedTimestep {
  readonly stepMs: number;
  readonly stepSeconds: number;

  private readonly maxFrameMs: number;
  private readonly maxStepsPerFrame: number;
  private accumulatorMs = 0;

  /** Fixed steps run since construction. Useful for deterministic replays. */
  private stepCount = 0;

  constructor(options: FixedTimestepOptions = {}) {
    const hz = options.hz ?? 60;
    if (!Number.isFinite(hz) || hz <= 0) {
      throw new Error(`FixedTimestep: hz must be a positive number, got ${hz}`);
    }

    this.stepMs = 1000 / hz;
    this.stepSeconds = 1 / hz;
    this.maxFrameMs = options.maxFrameMs ?? 250;
    this.maxStepsPerFrame = options.maxStepsPerFrame ?? 5;
  }

  /**
   * Banks `deltaMs` and runs `fixedUpdate` once per whole step available.
   *
   * `fixedUpdate` always receives the same `stepSeconds` — that constancy is
   * the entire point, so it is passed explicitly rather than left for the
   * caller to remember.
   *
   * @returns interpolation alpha in [0, 1) for the render pass.
   */
  step(deltaMs: number, fixedUpdate: (stepSeconds: number) => void): number {
    // Phaser can hand us a NaN or negative delta on the first frame after a
    // resume; treat those as zero rather than poisoning the accumulator.
    const safeDelta =
      Number.isFinite(deltaMs) && deltaMs > 0 ? Math.min(deltaMs, this.maxFrameMs) : 0;

    this.accumulatorMs += safeDelta;

    let steps = 0;
    while (this.accumulatorMs >= this.stepMs && steps < this.maxStepsPerFrame) {
      fixedUpdate(this.stepSeconds);
      this.accumulatorMs -= this.stepMs;
      this.stepCount += 1;
      steps += 1;
    }

    // Too far behind to catch up. Drop the backlog so we do not spiral.
    if (this.accumulatorMs >= this.stepMs) {
      this.accumulatorMs = 0;
    }

    return this.accumulatorMs / this.stepMs;
  }

  /**
   * Clears banked time. Call when gameplay resumes after an arbitrary pause —
   * an ad, a tab switch, a menu — so the first frame back does not try to
   * simulate the entire gap.
   */
  reset(): void {
    this.accumulatorMs = 0;
  }

  get steps(): number {
    return this.stepCount;
  }
}
