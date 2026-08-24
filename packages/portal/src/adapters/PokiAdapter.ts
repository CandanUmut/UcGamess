import type { AdapterOptions, PortalAdapter, PortalName } from '../types.ts';
import { withDuckedAudio } from '../audio-bus.ts';
import { loadScript } from '../load-script.ts';
import { browserLocale, readLocal, writeLocal } from '../local-storage.ts';

const SDK_URL = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';

/**
 * Shape of the bits of the Poki SDK we use.
 *
 * Verified against sdk.poki.com/html5 and sdk.poki.com/sdk-documentation on
 * 2026-08-23. Signatures:
 *   init(): Promise<void>
 *   gameLoadingFinished(): void
 *   gameplayStart(): void
 *   gameplayStop(): void
 *   commercialBreak(onStart?: () => void): Promise<void>
 *   rewardedBreak(options?): Promise<boolean>
 *   setDebug(enabled: boolean): void
 *   getURLParam(name): string | undefined
 *   getDeviceInfo(): { category: 'mobile' | 'tablet' | 'desktop' }
 *
 * NOTE — two gaps, confirmed absent from the docs rather than assumed:
 *   • Poki exposes NO cloud-save API. saveData/loadData use localStorage.
 *   • Poki exposes NO locale API. getLocale() uses navigator.language.
 * Both are documented in docs/portal-requirements.md.
 */
interface PokiSDK {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: () => void): Promise<void>;
  rewardedBreak(options?: {
    size?: 'small' | 'medium' | 'large';
    onStart?: () => void;
  }): Promise<boolean>;
  setDebug?(enabled: boolean): void;
  getURLParam?(name: string): string | undefined;
  getDeviceInfo?(): { category: 'mobile' | 'tablet' | 'desktop' };
}

/**
 * Poki — second target, and the one with the strictest quality bar.
 *
 * Poki's own guidance is that `commercialBreak()` should be called before every
 * `gameplayStart()` where the player has shown intent to continue, and that not
 * every call plays an ad — Poki decides. That is exactly why games here never
 * gate ad calls behind their own timer: signalling more opportunities is
 * correct and is what Poki asks for.
 *
 * Note that Poki's docs describe `rewardedBreak` in two styles across pages
 * (promise-returning, and callback-taking). We use the promise form documented
 * on the HTML5 page and additionally tolerate a non-boolean resolution.
 */
export class PokiAdapter implements PortalAdapter {
  readonly name: PortalName = 'poki';

  private sdk: PokiSDK | undefined;
  private adBlocked = false;
  private readonly scriptTimeoutMs: number;

  constructor(options: AdapterOptions = {}) {
    this.scriptTimeoutMs = options.scriptTimeoutMs ?? 8000;
  }

  async init(): Promise<void> {
    try {
      await loadScript(SDK_URL, this.scriptTimeoutMs);
      const sdk = (window as unknown as { PokiSDK?: PokiSDK }).PokiSDK;
      if (!sdk) throw new Error('PokiSDK missing after script load');

      if (__UCGAMES_DEV__) sdk.setDebug?.(true);

      // Poki's own example resolves the game either way: "Initialized,
      // something went wrong, load your game anyway."
      await sdk.init().catch((error: unknown) => {
        console.warn('[portal:poki] init() rejected; continuing.', error);
      });

      this.sdk = sdk;
    } catch (error) {
      console.error('[portal:poki] SDK unavailable, continuing without it.', error);
      // Poki has no adblock-detection API. A failed SDK load is the closest
      // usable signal, and it is the case we actually care about (no ads will
      // serve), so we report it as blocked.
      this.adBlocked = true;
    }
  }

  loadingFinished(): void {
    this.sdk?.gameLoadingFinished();
  }

  gameplayStart(): void {
    this.sdk?.gameplayStart();
  }

  gameplayStop(): void {
    this.sdk?.gameplayStop();
  }

  async commercialBreak(): Promise<void> {
    const sdk = this.sdk;
    if (!sdk) return;
    await withDuckedAudio(async () => {
      try {
        await sdk.commercialBreak();
      } catch (error) {
        // Never let a failed ad take down gameplay.
        console.warn('[portal:poki] commercialBreak failed', error);
      }
    });
  }

  async rewardedBreak(): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk) return false;
    return withDuckedAudio(async () => {
      try {
        const result = await sdk.rewardedBreak();
        return result === true;
      } catch (error) {
        console.warn('[portal:poki] rewardedBreak failed', error);
        return false;
      }
    });
  }

  async saveData(key: string, value: unknown): Promise<void> {
    writeLocal(key, value);
  }

  async loadData(key: string): Promise<unknown> {
    return readLocal(key);
  }

  getLocale(): string {
    return browserLocale();
  }

  isAdBlocked(): boolean {
    return this.adBlocked;
  }
}
