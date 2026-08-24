const NAMESPACE = 'ucgames';

function keyFor(key: string): string {
  return `${NAMESPACE}:${key}`;
}

/**
 * localStorage that cannot throw.
 *
 * Safari in private mode and embedded iframes with third-party storage blocked
 * both make `localStorage` either absent or throw on write. Since portals embed
 * games in an iframe, this is the normal case, not the edge case — a save
 * system that throws there takes the whole game down.
 *
 * Falls back to an in-memory map so the session still works; progress is just
 * not persisted across reloads.
 */
const memoryFallback = new Map<string, string>();

let storageWorks: boolean | undefined;

function canUseLocalStorage(): boolean {
  if (storageWorks !== undefined) return storageWorks;
  try {
    const probe = `${NAMESPACE}:__probe__`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    storageWorks = true;
  } catch {
    console.warn(
      '[portal] localStorage unavailable (private mode or blocked third-party storage). Saves are in-memory for this session only.',
    );
    storageWorks = false;
  }
  return storageWorks;
}

export function readLocal(key: string): unknown {
  const raw = canUseLocalStorage()
    ? window.localStorage.getItem(keyFor(key))
    : (memoryFallback.get(keyFor(key)) ?? null);

  if (raw === null) return undefined;

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // A value written by an older build, or corrupted. Treat as absent rather
    // than crashing the game on boot.
    console.warn(`[portal] Could not parse stored value for "${key}"; ignoring.`);
    return undefined;
  }
}

export function writeLocal(key: string, value: unknown): void {
  let serialised: string;
  try {
    serialised = JSON.stringify(value);
  } catch (error) {
    console.error(`[portal] Value for "${key}" is not serialisable`, error);
    return;
  }

  if (canUseLocalStorage()) {
    try {
      window.localStorage.setItem(keyFor(key), serialised);
      return;
    } catch (error) {
      // Quota exceeded mid-session — fall through to memory.
      console.warn(`[portal] localStorage write failed for "${key}"`, error);
      storageWorks = false;
    }
  }
  memoryFallback.set(keyFor(key), serialised);
}

/** Browser locale, used by every adapter whose portal exposes no locale API. */
export function browserLocale(): string {
  return navigator.language || 'en-US';
}
