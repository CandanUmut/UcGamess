/**
 * The single interface every game codes against.
 *
 * Rules that make this work, in priority order:
 *
 *  - A game NEVER imports a portal SDK. It gets a PortalAdapter and calls these
 *    ten methods. Enforced by lint (see packages/config/eslint.config.js).
 *  - A game NEVER implements its own ad timer. It signals opportunities via
 *    `commercialBreak()`; the portal decides whether an ad actually plays.
 *    Both Poki and CrazyGames treat a self-managed ad timer as a rejection
 *    cause.
 *  - Every method must be safe to call even when the SDK failed to load. An
 *    adblocked or offline player still gets a working game — adapters degrade,
 *    they do not throw.
 */
export interface PortalAdapter {
  /**
   * Loads and initialises the underlying SDK. Resolves even on failure — a
   * portal SDK that cannot load must not block the game from starting.
   * Probes ad-block status here so `isAdBlocked()` can stay synchronous.
   */
  init(): Promise<void>;

  /** Signals that preloading is done and the game is interactive. Call once. */
  loadingFinished(): void;

  /** Player is actively playing. Call on every resume, not just the first. */
  gameplayStart(): void;

  /** Gameplay paused, ended, or a menu opened. Must pair with gameplayStart. */
  gameplayStop(): void;

  /**
   * Offers the portal an interstitial opportunity. Resolves when it is safe to
   * resume — whether or not an ad played. Never rejects. Audio is ducked for
   * the duration by the adapter, so games do not handle muting.
   */
  commercialBreak(): Promise<void>;

  /**
   * Shows a rewarded video the player explicitly opted into. Resolves `true`
   * only if the reward was earned. Never rejects; a failed or skipped ad
   * resolves `false`. Games must always offer a non-ad path to continue.
   */
  rewardedBreak(): Promise<boolean>;

  /** Persists a value. Uses the portal's cloud save when it has one. */
  saveData(key: string, value: unknown): Promise<void>;

  /** Reads a persisted value, or `undefined` if absent or unreadable. */
  loadData(key: string): Promise<unknown>;

  /** BCP-47 locale for the player, e.g. "en-US". Falls back to the browser. */
  getLocale(): string;

  /** Whether an ad blocker was detected during `init()`. */
  isAdBlocked(): boolean;

  /** Which adapter this is. Used for logging and the metrics helper. */
  readonly name: PortalName;
}

export type PortalName = 'local' | 'crazygames' | 'poki' | 'gamedistribution';

export interface AdapterOptions {
  /**
   * How long to wait for the SDK script before giving up and degrading to
   * local behaviour. Portals would rather serve an ad-free game than a game
   * stuck on a loading screen.
   */
  scriptTimeoutMs?: number;
}
