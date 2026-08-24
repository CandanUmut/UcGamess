import type { AdapterOptions, PortalAdapter, PortalName } from '../types.ts';
import { withDuckedAudio } from '../audio-bus.ts';
import { browserLocale, readLocal, writeLocal } from '../local-storage.ts';

export interface LocalAdapterOptions extends AdapterOptions {
  /** How long a simulated interstitial blocks for. */
  commercialBreakMs?: number;
  /** How long a simulated rewarded video blocks for. */
  rewardedBreakMs?: number;
  /**
   * Probability a simulated rewarded video is completed. Default 0.8 so the
   * "player closed the ad early" path gets exercised during normal play
   * instead of first appearing in production.
   */
  rewardSuccessRate?: number;
  /** Simulate an ad blocker to test the degraded path. */
  simulateAdBlock?: boolean;
}

/**
 * The development adapter, and the default.
 *
 * This is deliberately not a set of empty functions. Ads introduce real,
 * gameplay-visible delays — a game that looks fine with instant no-op ads can
 * be broken by a four-second pause (timers keep running, tweens finish, input
 * queues up). Simulating the delay and the failure case offline means those
 * bugs surface on a laptop instead of in a portal QA review.
 */
export class LocalAdapter implements PortalAdapter {
  readonly name: PortalName = 'local';

  private readonly commercialBreakMs: number;
  private readonly rewardedBreakMs: number;
  private readonly rewardSuccessRate: number;
  private readonly adBlocked: boolean;

  private gameplayActive = false;
  private loadingFinishedCalled = false;

  constructor(options: LocalAdapterOptions = {}) {
    this.commercialBreakMs = options.commercialBreakMs ?? 3000;
    this.rewardedBreakMs = options.rewardedBreakMs ?? 5000;
    this.rewardSuccessRate = options.rewardSuccessRate ?? 0.8;
    this.adBlocked = options.simulateAdBlock ?? false;
  }

  async init(): Promise<void> {
    this.log('init()');
  }

  loadingFinished(): void {
    if (this.loadingFinishedCalled) {
      // Real portals ignore the second call, but double-calling usually means
      // the preload scene runs twice, which is worth knowing about in dev.
      console.warn('[portal:local] loadingFinished() called more than once');
      return;
    }
    this.loadingFinishedCalled = true;
    this.log('loadingFinished()');
  }

  gameplayStart(): void {
    if (this.gameplayActive) {
      console.warn(
        '[portal:local] gameplayStart() called while already started — portals expect these to pair.',
      );
    }
    this.gameplayActive = true;
    this.log('gameplayStart()');
  }

  gameplayStop(): void {
    if (!this.gameplayActive) {
      console.warn(
        '[portal:local] gameplayStop() called without a matching gameplayStart().',
      );
    }
    this.gameplayActive = false;
    this.log('gameplayStop()');
  }

  async commercialBreak(): Promise<void> {
    this.log(`commercialBreak() — simulating ${this.commercialBreakMs}ms`);
    await withDuckedAudio(() => delay(this.commercialBreakMs));
    this.log('commercialBreak() finished');
  }

  async rewardedBreak(): Promise<boolean> {
    this.log(`rewardedBreak() — simulating ${this.rewardedBreakMs}ms`);
    const earned = await withDuckedAudio(async () => {
      await delay(this.rewardedBreakMs);
      return Math.random() < this.rewardSuccessRate;
    });
    this.log(`rewardedBreak() resolved ${earned ? 'WITH' : 'WITHOUT'} reward`);
    return earned;
  }

  async saveData(key: string, value: unknown): Promise<void> {
    writeLocal(key, value);
    this.log(`saveData(${key})`);
  }

  async loadData(key: string): Promise<unknown> {
    const value = readLocal(key);
    this.log(`loadData(${key}) -> ${value === undefined ? 'undefined' : 'hit'}`);
    return value;
  }

  getLocale(): string {
    return browserLocale();
  }

  isAdBlocked(): boolean {
    return this.adBlocked;
  }

  private log(message: string): void {
    console.warn(`[portal:local] ${message}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
