import type { PortalAdapter, PortalName } from '../types.ts';
import { browserLocale, readLocal, writeLocal } from '../local-storage.ts';

/**
 * Self-hosted web builds: itch.io, GitHub Pages, our own site.
 *
 * No SDK and no ads. The `local` adapter is the wrong thing to ship to a public
 * page: it *simulates* ads by blocking for several seconds with the audio
 * ducked, which a playtester understands and a stranger reads as the game
 * hanging after every level.
 *
 * Reports ads as blocked on purpose, so games hide their rewarded offers — a
 * "watch an ad" button that can never play one is worse than no button.
 */
export class WebAdapter implements PortalAdapter {
  readonly name: PortalName = 'web';

  async init(): Promise<void> {}

  loadingFinished(): void {}

  gameplayStart(): void {}

  gameplayStop(): void {}

  happyTime(): void {}

  async commercialBreak(): Promise<void> {}

  async rewardedBreak(): Promise<boolean> {
    return false;
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
    return true;
  }
}
