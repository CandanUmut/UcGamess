import type { AdapterOptions, PortalAdapter, PortalName } from '../types.ts';
import { withDuckedAudio } from '../audio-bus.ts';
import { loadScript } from '../load-script.ts';
import { browserLocale, readLocal, writeLocal } from '../local-storage.ts';

/**
 * TODO: verify against official docs — https://github.com/GameDistribution/GD-HTML5
 *
 * Everything in this file marked `TODO: verify` was reconstructed from the
 * GD-HTML5 wiki summary rather than read directly off the official docs page
 * (gamedistribution.com returned 404 for the SDK doc URLs at the time of
 * writing, 2026-08-23). The overall shape — GD_OPTIONS + `gdsdk` global +
 * showAd/preloadAd + an onEvent callback — is right, but do not ship a
 * GameDistribution build until someone has checked these against a live
 * integration.
 *
 * This is deliberately a marked stub. GameDistribution is a third-priority,
 * non-exclusive target; per docs/strategy.md we ship CrazyGames first.
 */

/** TODO: verify against official docs — script URL. */
const SDK_URL = 'https://html5.api.gamedistribution.com/main.min.js';

/** TODO: verify against official docs — exact event name strings. */
const EVENT_REWARD_COMPLETE = 'SDK_REWARDED_WATCH_COMPLETE';
const EVENT_READY = 'SDK_READY';
const EVENT_ERROR = 'SDK_ERROR';

interface GdSdk {
  showAd(type?: 'interstitial' | 'rewarded'): Promise<void>;
  preloadAd(type: 'rewarded'): Promise<void>;
}

interface GdEvent {
  name?: string;
  message?: string;
}

export class GameDistributionAdapter implements PortalAdapter {
  readonly name: PortalName = 'gamedistribution';

  private sdk: GdSdk | undefined;
  private ready = false;
  private rewardEarned = false;
  private readonly scriptTimeoutMs: number;

  constructor(options: AdapterOptions = {}) {
    this.scriptTimeoutMs = options.scriptTimeoutMs ?? 8000;
  }

  async init(): Promise<void> {
    const gameId = import.meta.env?.VITE_GD_GAME_ID as string | undefined;
    if (!gameId) {
      // Not a crash: without a game id there is nothing to initialise, and the
      // game should still be playable. See docs/workflow.md for how to supply
      // this as a GitHub Actions secret.
      console.warn(
        '[portal:gamedistribution] VITE_GD_GAME_ID is not set — running without the SDK.',
      );
      return;
    }

    try {
      // TODO: verify against official docs — GD_OPTIONS must be assigned
      // before the script tag is appended, and the SDK must load exactly once.
      (window as unknown as { GD_OPTIONS?: unknown }).GD_OPTIONS = {
        gameId,
        onEvent: (event: GdEvent) => {
          switch (event.name) {
            case EVENT_READY:
              this.ready = true;
              break;
            case EVENT_REWARD_COMPLETE:
              this.rewardEarned = true;
              break;
            case EVENT_ERROR:
              console.warn('[portal:gamedistribution] SDK error', event.message);
              break;
            default:
              break;
          }
        },
      };

      await loadScript(SDK_URL, this.scriptTimeoutMs);
      this.sdk = (window as unknown as { gdsdk?: GdSdk }).gdsdk;
    } catch (error) {
      console.error(
        '[portal:gamedistribution] SDK unavailable, continuing without it.',
        error,
      );
    }
  }

  /**
   * TODO: verify against official docs — GameDistribution has no documented
   * equivalent of gameLoadingFinished / gameplayStart / gameplayStop. These are
   * intentionally no-ops rather than guessed calls.
   */
  loadingFinished(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}

  async commercialBreak(): Promise<void> {
    const sdk = this.sdk;
    if (!sdk || !this.ready) return;
    await withDuckedAudio(async () => {
      try {
        await sdk.showAd('interstitial');
      } catch (error) {
        console.warn('[portal:gamedistribution] interstitial failed', error);
      }
    });
  }

  async rewardedBreak(): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk || !this.ready) return false;

    return withDuckedAudio(async () => {
      this.rewardEarned = false;
      try {
        // TODO: verify against official docs — the wiki shows preloadAd before
        // showAd for rewarded, and says the reward must only be granted on
        // SDK_REWARDED_WATCH_COMPLETE, never on the showAd promise alone.
        await sdk.preloadAd('rewarded');
        await sdk.showAd('rewarded');
      } catch (error) {
        console.warn('[portal:gamedistribution] rewarded failed', error);
        return false;
      }
      return this.rewardEarned;
    });
  }

  /** GameDistribution has no cloud save; localStorage is the only option. */
  async saveData(key: string, value: unknown): Promise<void> {
    writeLocal(key, value);
  }

  async loadData(key: string): Promise<unknown> {
    return readLocal(key);
  }

  getLocale(): string {
    return browserLocale();
  }

  /** No adblock-detection API is documented. A failed load is the only signal. */
  isAdBlocked(): boolean {
    return this.sdk === undefined;
  }
}
