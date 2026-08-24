import type { AdapterOptions, PortalAdapter, PortalName } from '../types.ts';
import { withDuckedAudio } from '../audio-bus.ts';
import { loadScript } from '../load-script.ts';
import { browserLocale, readLocal, writeLocal } from '../local-storage.ts';

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

/**
 * Shape of the bits of the CrazyGames v3 SDK we use.
 *
 * Verified against docs.crazygames.com on 2026-08-23:
 *   /sdk/intro/      — script URL, `await window.CrazyGames.SDK.init()`
 *   /sdk/game/       — gameplayStart, gameplayStop, loadingStart, loadingStop,
 *                      happytime, reportGameCompletedPercentage
 *   /sdk/video-ads/  — requestAd("midgame" | "rewarded", callbacks),
 *                      callbacks are { adStarted, adFinished, adError },
 *                      hasAdblock() is async
 *   /sdk/data/       — getItem/setItem/removeItem/clear, synchronous,
 *                      localStorage-compatible
 *   /sdk/user/       — systemInfo.locale, systemInfo.countryCode
 */
interface CrazyGamesSDK {
  init(): Promise<void>;
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    loadingStart(): void;
    loadingStop(): void;
    happytime(): void;
  };
  ad: {
    requestAd(
      type: 'midgame' | 'rewarded',
      callbacks: {
        adStarted?: () => void;
        adFinished?: () => void;
        adError?: (error: unknown) => void;
      },
    ): void;
    hasAdblock(): Promise<boolean>;
  };
  data: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    clear(): void;
  };
  user: {
    systemInfo?: {
      countryCode?: string;
      locale?: string;
    };
  };
}

/**
 * CrazyGames — our first shipping target.
 *
 * Two things worth knowing when reading this:
 *
 * 1. `requestAd` is callback-based and fires exactly one of adFinished/adError.
 *    We wrap it in a Promise and guard against a double-settle, because a
 *    misbehaving ad network firing both would otherwise leave the game in an
 *    inconsistent state.
 *
 * 2. During Basic Launch, ads are deliberately disabled so soft-launch metrics
 *    stay clean. That surfaces as an `adsDisabledBasicLaunch` error code, which
 *    is expected, not a bug — we resolve rather than reject so the game just
 *    continues.
 */
export class CrazyGamesAdapter implements PortalAdapter {
  readonly name: PortalName = 'crazygames';

  private sdk: CrazyGamesSDK | undefined;
  private adBlocked = false;
  private readonly scriptTimeoutMs: number;

  constructor(options: AdapterOptions = {}) {
    this.scriptTimeoutMs = options.scriptTimeoutMs ?? 8000;
  }

  async init(): Promise<void> {
    try {
      await loadScript(SDK_URL, this.scriptTimeoutMs);
      const sdk = (window as unknown as { CrazyGames?: { SDK?: CrazyGamesSDK } })
        .CrazyGames?.SDK;
      if (!sdk) throw new Error('CrazyGames.SDK missing after script load');

      await sdk.init();
      this.sdk = sdk;

      // hasAdblock() is async but PortalAdapter.isAdBlocked() is sync by
      // design — games ask this mid-render, and an async check there would
      // mean either a stall or a wrong answer on first frame. Probe once here
      // and cache.
      try {
        this.adBlocked = await sdk.ad.hasAdblock();
      } catch {
        this.adBlocked = false;
      }

      // The SDK is initialised after our preloader already started, so tell it
      // loading is in progress; loadingFinished() closes the pair.
      sdk.game.loadingStart();
    } catch (error) {
      // Degrade rather than fail. An adblocked player still gets the game.
      console.error('[portal:crazygames] SDK unavailable, continuing without it.', error);
      this.adBlocked = true;
    }
  }

  loadingFinished(): void {
    this.sdk?.game.loadingStop();
  }

  gameplayStart(): void {
    this.sdk?.game.gameplayStart();
  }

  gameplayStop(): void {
    this.sdk?.game.gameplayStop();
  }

  commercialBreak(): Promise<void> {
    if (!this.sdk) return Promise.resolve();
    return withDuckedAudio(async () => {
      await this.requestAd('midgame');
    });
  }

  rewardedBreak(): Promise<boolean> {
    if (!this.sdk) return Promise.resolve(false);
    return withDuckedAudio(() => this.requestAd('rewarded'));
  }

  /**
   * Resolves `true` only on adFinished. Every error path — unfilled, adblock,
   * cooldown, Basic Launch — resolves `false` instead of rejecting, so callers
   * never need a try/catch around an ad.
   */
  private requestAd(type: 'midgame' | 'rewarded'): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk) return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (result: boolean) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      // If the SDK never calls back at all, do not strand the player.
      const guard = window.setTimeout(() => {
        console.warn(`[portal:crazygames] ${type} ad never called back`);
        settle(false);
      }, 60_000);

      try {
        sdk.ad.requestAd(type, {
          adFinished: () => {
            window.clearTimeout(guard);
            settle(true);
          },
          adError: (error: unknown) => {
            window.clearTimeout(guard);
            console.warn(`[portal:crazygames] ${type} ad error`, error);
            settle(false);
          },
        });
      } catch (error) {
        window.clearTimeout(guard);
        console.error('[portal:crazygames] requestAd threw', error);
        settle(false);
      }
    });
  }

  /**
   * CrazyGames' data module is a localStorage-shaped API that upgrades to
   * cloud save for signed-in players, so we prefer it and fall back to plain
   * localStorage when the SDK is absent.
   */
  async saveData(key: string, value: unknown): Promise<void> {
    if (!this.sdk) {
      writeLocal(key, value);
      return;
    }
    try {
      this.sdk.data.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('[portal:crazygames] saveData failed, using localStorage', error);
      writeLocal(key, value);
    }
  }

  async loadData(key: string): Promise<unknown> {
    if (!this.sdk) return readLocal(key);
    try {
      const raw = this.sdk.data.getItem(key);
      return raw === null ? undefined : (JSON.parse(raw) as unknown);
    } catch (error) {
      console.warn('[portal:crazygames] loadData failed, using localStorage', error);
      return readLocal(key);
    }
  }

  getLocale(): string {
    return this.sdk?.user.systemInfo?.locale ?? browserLocale();
  }

  isAdBlocked(): boolean {
    return this.adBlocked;
  }
}
