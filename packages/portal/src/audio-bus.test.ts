import { describe, expect, it, vi } from 'vitest';
import { audioBus, withDuckedAudio } from './audio-bus.ts';

/**
 * The invariant under test: audio always comes back.
 *
 * A player left permanently muted after a failed ad is a bug they will never
 * report — they will just leave, and it will show up as a retention number
 * nobody can explain.
 */
describe('audioBus', () => {
  it('syncs a new subscriber to the current state immediately', () => {
    const listener = vi.fn();
    const unsubscribe = audioBus.subscribe(listener);

    expect(listener).toHaveBeenCalledWith(false);
    unsubscribe();
  });

  it('notifies on change and not on a repeated value', () => {
    const listener = vi.fn();
    const unsubscribe = audioBus.subscribe(listener);
    listener.mockClear();

    audioBus.setDucked(true);
    audioBus.setDucked(true);
    expect(listener).toHaveBeenCalledTimes(1);

    audioBus.setDucked(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = audioBus.subscribe(listener);
    unsubscribe();
    listener.mockClear();

    audioBus.setDucked(true);
    audioBus.setDucked(false);

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps notifying the other listeners when one throws', () => {
    const thrower = vi.fn(() => {
      throw new Error('bad subscriber');
    });
    const good = vi.fn();

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const un1 = audioBus.subscribe(thrower);
    const un2 = audioBus.subscribe(good);
    good.mockClear();

    audioBus.setDucked(true);
    expect(good).toHaveBeenCalledWith(true);

    audioBus.setDucked(false);
    un1();
    un2();
    consoleError.mockRestore();
  });
});

describe('withDuckedAudio', () => {
  it('ducks for the duration and restores after success', async () => {
    const states: boolean[] = [];
    const unsubscribe = audioBus.subscribe((d) => states.push(d));

    await withDuckedAudio(async () => {
      expect(audioBus.isDucked()).toBe(true);
    });

    expect(audioBus.isDucked()).toBe(false);
    expect(states).toEqual([false, true, false]);
    unsubscribe();
  });

  it('restores audio even when the ad rejects', async () => {
    await expect(
      withDuckedAudio(async () => {
        throw new Error('ad network exploded');
      }),
    ).rejects.toThrow('ad network exploded');

    // The important assertion: a failed ad does not leave the game silent.
    expect(audioBus.isDucked()).toBe(false);
  });

  it('passes the inner result through', async () => {
    const result = await withDuckedAudio(async () => 'rewarded');
    expect(result).toBe('rewarded');
  });
});
