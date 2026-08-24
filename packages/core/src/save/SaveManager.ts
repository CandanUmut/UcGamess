import type { PortalAdapter } from '@ucgames/portal';

/**
 * Save/load behind one interface, with the portal's cloud save used
 * automatically when the portal has one.
 *
 * Games call `get`/`set` and never learn whether a value lives in localStorage
 * or in a portal's cloud store. Today CrazyGames provides cloud save and Poki
 * does not — that difference is entirely absorbed by the adapters, so porting a
 * game between them requires no save-system changes.
 *
 * Reads are served from an in-memory cache so gameplay code can call `get`
 * synchronously in an update loop. `load()` populates the cache once at boot.
 */
export class SaveManager {
  private readonly portal: PortalAdapter;
  private readonly cache = new Map<string, unknown>();
  private readonly keys: readonly string[];

  private pendingWrites = new Map<string, unknown>();
  private flushHandle: number | undefined;

  /**
   * @param keys every key this game persists. Declared up front so `load()` can
   *   fetch them in one pass at boot rather than paying an async round trip the
   *   first time each is read mid-game.
   */
  constructor(portal: PortalAdapter, keys: readonly string[]) {
    this.portal = portal;
    this.keys = keys;
  }

  /** Populates the cache. Call once, during preload. */
  async load(): Promise<void> {
    const entries = await Promise.all(
      this.keys.map(async (key) => {
        try {
          return [key, await this.portal.loadData(key)] as const;
        } catch (error) {
          console.warn(`[core] Failed to load "${key}"`, error);
          return [key, undefined] as const;
        }
      }),
    );

    for (const [key, value] of entries) {
      if (value !== undefined) this.cache.set(key, value);
    }
  }

  /** Synchronous read from cache. Returns `fallback` when unset. */
  get<T>(key: string, fallback: T): T {
    const value = this.cache.get(key);
    return value === undefined ? fallback : (value as T);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Writes through to the cache immediately and schedules a persist.
   *
   * Batched because a naive implementation writes on every score change, and on
   * CrazyGames that is a cloud round trip per point scored. Coalescing to one
   * write per frame-ish window keeps gameplay smooth without the game having to
   * think about write frequency.
   */
  set(key: string, value: unknown): void {
    this.cache.set(key, value);
    this.pendingWrites.set(key, value);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushHandle !== undefined) return;
    this.flushHandle = window.setTimeout(() => {
      this.flushHandle = undefined;
      void this.flush();
    }, 250);
  }

  /**
   * Persists pending writes now. Called automatically, but call it directly
   * before a commercial break or on game over — a player who closes the tab
   * during an ad should not lose their high score.
   */
  async flush(): Promise<void> {
    if (this.flushHandle !== undefined) {
      window.clearTimeout(this.flushHandle);
      this.flushHandle = undefined;
    }

    if (this.pendingWrites.size === 0) return;

    const writes = [...this.pendingWrites];
    this.pendingWrites = new Map();

    await Promise.all(
      writes.map(async ([key, value]) => {
        try {
          await this.portal.saveData(key, value);
        } catch (error) {
          console.warn(`[core] Failed to save "${key}"`, error);
        }
      }),
    );
  }
}
