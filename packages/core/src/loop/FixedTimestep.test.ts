import { describe, expect, it } from 'vitest';
import { FixedTimestep } from './FixedTimestep.ts';

/**
 * These tests exist because the bug this class prevents — a game running at the
 * wrong speed on a high-refresh display — is invisible on the developer's own
 * machine. The only way to catch a regression is to assert the invariant
 * directly: equal wall-clock time must produce equal simulation, whatever the
 * frame rate.
 */
describe('FixedTimestep', () => {
  function simulate(frameDeltaMs: number, frames: number, hz = 60) {
    const loop = new FixedTimestep({ hz });
    let simulatedSeconds = 0;
    let steps = 0;

    for (let i = 0; i < frames; i += 1) {
      loop.step(frameDeltaMs, (dt) => {
        simulatedSeconds += dt;
        steps += 1;
      });
    }

    return { simulatedSeconds, steps };
  }

  it('simulates the same amount of time at 60, 144 and 30 Hz', () => {
    const oneSecond = 1000;

    // One second of wall clock, delivered at three very different frame rates.
    const at60 = simulate(oneSecond / 60, 60);
    const at144 = simulate(oneSecond / 144, 144);
    const at30 = simulate(oneSecond / 30, 30);

    for (const result of [at60, at144, at30]) {
      expect(result.simulatedSeconds).toBeGreaterThan(0.95);
      // Summing 60 copies of 1/60 overshoots 1 by ~1e-15 in binary floating
      // point, so compare with a tolerance rather than an exact bound.
      expect(result.simulatedSeconds).toBeLessThanOrEqual(1.0001);
    }

    // The whole point: the fast display must not advance the world further.
    expect(Math.abs(at144.simulatedSeconds - at60.simulatedSeconds)).toBeLessThan(0.02);
    expect(Math.abs(at30.simulatedSeconds - at60.simulatedSeconds)).toBeLessThan(0.02);
  });

  it('always passes the same dt regardless of frame delta', () => {
    const loop = new FixedTimestep({ hz: 60 });
    const seen = new Set<number>();

    for (const delta of [4, 7, 16.67, 33, 12, 21]) {
      loop.step(delta, (dt) => seen.add(dt));
    }

    expect(seen.size).toBe(1);
    expect([...seen][0]).toBeCloseTo(1 / 60, 10);
  });

  it('clamps a long stall instead of spiralling', () => {
    const loop = new FixedTimestep({ hz: 60, maxFrameMs: 250, maxStepsPerFrame: 5 });
    let steps = 0;

    // Ten seconds of frozen tab. Naively this is 600 steps.
    loop.step(10_000, () => {
      steps += 1;
    });

    expect(steps).toBeLessThanOrEqual(5);
  });

  it('ignores NaN and negative deltas', () => {
    const loop = new FixedTimestep({ hz: 60 });
    let steps = 0;
    const count = () => {
      steps += 1;
    };

    loop.step(Number.NaN, count);
    loop.step(-100, count);
    loop.step(Number.POSITIVE_INFINITY, count);

    expect(steps).toBe(0);

    // And the accumulator is not poisoned — normal frames still work after.
    loop.step(1000 / 60, count);
    expect(steps).toBe(1);
  });

  it('returns an interpolation alpha in [0, 1)', () => {
    const loop = new FixedTimestep({ hz: 60 });

    for (const delta of [4, 9, 16.67, 25]) {
      const alpha = loop.step(delta, () => {});
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('reset() drops banked time so a resume does not fast-forward', () => {
    const loop = new FixedTimestep({ hz: 60 });
    let steps = 0;

    loop.step(15, () => {
      steps += 1;
    });
    expect(steps).toBe(0); // 15ms banked, not yet a full step

    loop.reset();

    loop.step(5, () => {
      steps += 1;
    });
    expect(steps).toBe(0); // would have stepped if the 15ms were still banked
  });

  it('rejects a non-positive hz rather than dividing by zero', () => {
    expect(() => new FixedTimestep({ hz: 0 })).toThrow();
    expect(() => new FixedTimestep({ hz: -60 })).toThrow();
  });
});
