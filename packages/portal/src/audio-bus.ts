type DuckListener = (ducked: boolean) => void;

const listeners = new Set<DuckListener>();
let ducked = false;

/**
 * The seam between "an ad is playing" (portal's business) and "turn the sound
 * down" (core's business).
 *
 * Both Poki and CrazyGames require game audio to be silent while an ad plays.
 * Rather than trusting every game to remember, adapters flip this bus around
 * every ad call and @ucgames/core's AudioManager subscribes to it. A game that
 * never thinks about audio ducking still ships correct behaviour.
 *
 * Lives in packages/portal rather than packages/core so that core can depend on
 * portal without a cycle.
 */
export const audioBus = {
  /** Registers a listener and immediately syncs it to the current state. */
  subscribe(listener: DuckListener): () => void {
    listeners.add(listener);
    // Guarded for the same reason setDucked is: a listener that throws must
    // not take out the caller. Without this, one bad subscriber makes
    // AudioManager's constructor throw and the whole game fails to boot.
    try {
      listener(ducked);
    } catch (error) {
      console.error('[portal] audio duck listener threw on subscribe', error);
    }
    return () => listeners.delete(listener);
  },

  /** True while an ad is on screen. */
  isDucked(): boolean {
    return ducked;
  },

  /**
   * Adapters call this — games should not. A listener that throws must not
   * prevent the others from running, or a bad subscriber leaves the game
   * permanently muted after an ad.
   */
  setDucked(next: boolean): void {
    if (ducked === next) return;
    ducked = next;
    for (const listener of listeners) {
      try {
        listener(next);
      } catch (error) {
        console.error('[portal] audio duck listener threw', error);
      }
    }
  },
};

/**
 * Runs `fn` with audio ducked, restoring it even if `fn` rejects.
 *
 * The `finally` is the important part: an ad that errors halfway through must
 * still give the player their sound back.
 */
export async function withDuckedAudio<T>(fn: () => Promise<T>): Promise<T> {
  audioBus.setDucked(true);
  try {
    return await fn();
  } finally {
    audioBus.setDucked(false);
  }
}
