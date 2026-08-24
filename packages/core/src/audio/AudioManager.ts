import type Phaser from 'phaser';
import { audioBus } from '@ucgames/portal';

const MUTE_SAVE_KEY = 'audio.muted';

/**
 * One mute bus for the whole game.
 *
 * Solves three problems that are each individually easy to get wrong:
 *
 * 1. **Safari autoplay.** Safari (and Chrome, and every mobile browser) refuses
 *    to start an AudioContext until the user has interacted with the page.
 *    Phaser creates its context on boot, so it starts suspended and every
 *    `play()` silently does nothing. Games that do not handle this ship with no
 *    sound on iOS and the developer never notices on their desktop. We unlock
 *    on the first pointer/key/touch event, once.
 *
 * 2. **Ad ducking.** Portals require audio to be silent while an ad plays. We
 *    subscribe to the portal's audio bus so this happens without any game code.
 *
 * 3. **Player mute vs ad mute.** These are separate states. If a player muted
 *    the game and then watches a rewarded ad, unducking afterwards must not
 *    turn their sound back on. We track both and derive the actual mute.
 */
export class AudioManager {
  private readonly sound: Phaser.Sound.BaseSoundManager;

  private playerMuted = false;
  private adDucked = false;
  private unlocked = false;

  private unsubscribeDuck: (() => void) | undefined;
  private removeUnlockListeners: (() => void) | undefined;

  constructor(game: Phaser.Game) {
    this.sound = game.sound;

    this.unsubscribeDuck = audioBus.subscribe((ducked) => {
      this.adDucked = ducked;
      this.applyMute();
    });

    this.installUnlockHandlers(game);
  }

  /** Restores the player's saved mute preference. Call after the save system loads. */
  hydrate(savedMuted: unknown): void {
    if (typeof savedMuted === 'boolean') {
      this.playerMuted = savedMuted;
      this.applyMute();
    }
  }

  /** The key the mute preference is stored under, for use with SaveManager. */
  static get saveKey(): string {
    return MUTE_SAVE_KEY;
  }

  get isMuted(): boolean {
    return this.playerMuted;
  }

  setMuted(muted: boolean): void {
    this.playerMuted = muted;
    this.applyMute();
  }

  toggleMute(): boolean {
    this.setMuted(!this.playerMuted);
    return this.playerMuted;
  }

  /**
   * Actual mute is the OR of both reasons, so an ad cannot un-mute a player who
   * chose silence, and a player un-muting mid-ad does not leak audio over it.
   */
  private applyMute(): void {
    this.sound.mute = this.playerMuted || this.adDucked;
  }

  /**
   * Resumes the AudioContext on the first real user gesture.
   *
   * Listens on the document rather than the canvas because a player may first
   * interact with an HTML overlay (the rotate prompt, a start button) that sits
   * above the canvas. `{ once: true }` per event plus explicit teardown keeps
   * this from firing repeatedly.
   */
  private installUnlockHandlers(game: Phaser.Game): void {
    const events: Array<keyof DocumentEventMap> = [
      'pointerdown',
      'touchstart',
      'keydown',
    ];

    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;

      const manager = game.sound as Phaser.Sound.BaseSoundManager & {
        context?: AudioContext;
        unlock?: () => void;
      };

      const context = manager.context;
      if (context && context.state === 'suspended') {
        void context.resume().catch((error: unknown) => {
          console.warn('[core] AudioContext resume failed', error);
        });
      }
      manager.unlock?.();

      this.removeUnlockListeners?.();
    };

    for (const event of events) {
      document.addEventListener(event, unlock, { once: true, passive: true });
    }

    this.removeUnlockListeners = () => {
      for (const event of events) {
        document.removeEventListener(event, unlock);
      }
      this.removeUnlockListeners = undefined;
    };
  }

  destroy(): void {
    this.unsubscribeDuck?.();
    this.unsubscribeDuck = undefined;
    this.removeUnlockListeners?.();
  }
}
