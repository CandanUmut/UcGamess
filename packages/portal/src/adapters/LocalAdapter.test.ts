// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalAdapter } from './LocalAdapter.ts';
import { audioBus } from '../audio-bus.ts';

/**
 * The LocalAdapter is what every game is developed against, so its contract
 * being right matters more than any other adapter's: a bug here is a bug every
 * game inherits before it ever reaches a portal.
 */
describe('LocalAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('satisfies the PortalAdapter contract without a real SDK', async () => {
    const adapter = new LocalAdapter();
    await expect(adapter.init()).resolves.toBeUndefined();
    expect(adapter.name).toBe('local');
    expect(typeof adapter.getLocale()).toBe('string');
    expect(adapter.isAdBlocked()).toBe(false);
  });

  it('ducks audio for the whole commercial break', async () => {
    const adapter = new LocalAdapter({ commercialBreakMs: 1000 });
    await adapter.init();

    const promise = adapter.commercialBreak();
    expect(audioBus.isDucked()).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(audioBus.isDucked()).toBe(false);
  });

  it('resolves rewardedBreak deterministically at the rate extremes', async () => {
    const always = new LocalAdapter({ rewardedBreakMs: 10, rewardSuccessRate: 1 });
    const never = new LocalAdapter({ rewardedBreakMs: 10, rewardSuccessRate: 0 });

    const earnedPromise = always.rewardedBreak();
    await vi.advanceTimersByTimeAsync(10);
    expect(await earnedPromise).toBe(true);

    const deniedPromise = never.rewardedBreak();
    await vi.advanceTimersByTimeAsync(10);
    expect(await deniedPromise).toBe(false);
  });

  it('round-trips saved values', async () => {
    const adapter = new LocalAdapter();
    await adapter.saveData('highScore', 42);
    expect(await adapter.loadData('highScore')).toBe(42);

    await adapter.saveData('state', { level: 3, unlocked: ['a', 'b'] });
    expect(await adapter.loadData('state')).toEqual({
      level: 3,
      unlocked: ['a', 'b'],
    });
  });

  it('returns undefined for a key that was never saved', async () => {
    const adapter = new LocalAdapter();
    expect(await adapter.loadData('never-written')).toBeUndefined();
  });

  it('simulates an ad blocker when asked', () => {
    expect(new LocalAdapter({ simulateAdBlock: true }).isAdBlocked()).toBe(true);
  });

  it('warns when gameplayStart and gameplayStop do not pair', () => {
    const adapter = new LocalAdapter();
    const warn = vi.mocked(console.warn);

    adapter.gameplayStop();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('without a matching gameplayStart'),
    );
  });
});
