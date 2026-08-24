import Phaser from 'phaser';
import { BaseScene, DESIGN_HEIGHT, DESIGN_WIDTH } from '@ucgames/core';
import { COLORS } from '../config.ts';
import type { GameScene } from './GameScene.ts';

interface GameOverData {
  score: number;
  best: number;
}

/**
 * Game over, and the reference implementation of both ad placements.
 *
 * **Rewarded video** — offered here, where it buys something the player
 * visibly wants (one more life on the run they just lost). Two rules from the
 * portals are load-bearing:
 *   • The player opts in explicitly. Never auto-play a rewarded ad.
 *   • There is always a standard non-ad way forward — the "Play again" button
 *     below is that path, and it is never hidden or delayed.
 * The offer is shown once per run, because chaining several videos for one
 * reward is explicitly disallowed.
 *
 * **Interstitial** — fired on "Play again", immediately before the next
 * `gameplayStart()`. That is exactly where Poki's docs say to put it: the
 * player has shown intent to continue, so the break is at a natural seam rather
 * than interrupting play. We call it on every replay and let the portal decide
 * whether an ad actually runs — the game must never run its own ad timer.
 */
export class GameOverScene extends BaseScene {
  private score = 0;
  private best = 0;
  private busy = false;
  private rewardOffered = false;

  constructor() {
    super({ key: 'GameOver' });
  }

  init(data: GameOverData): void {
    this.score = data.score ?? 0;
    this.best = data.best ?? 0;
    this.busy = false;
    this.rewardOffered = false;
  }

  protected build(): void {
    const cx = DESIGN_WIDTH / 2;

    this.add
      .rectangle(cx, DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT, 0x000000, 0.72)
      .setOrigin(0.5);

    this.add
      .text(cx, DESIGN_HEIGHT * 0.24, 'GAME OVER', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '64px',
        fontStyle: 'bold',
        color: COLORS.text,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, DESIGN_HEIGHT * 0.37, `Score ${this.score}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '38px',
        color: COLORS.text,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, DESIGN_HEIGHT * 0.45, `Best ${this.best}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '26px',
        color: COLORS.dim,
      })
      .setOrigin(0.5);

    // Only offer the video when there is a real ad network behind it. Showing
    // a "watch an ad" button to an adblocked player that then does nothing is
    // worse than not offering it.
    if (!this.context.portal.isAdBlocked()) {
      this.rewardOffered = true;
      this.makeButton(
        cx,
        DESIGN_HEIGHT * 0.6,
        '▶  Watch ad for 1 more life',
        COLORS.good,
        () => void this.onRewardedContinue(),
      );
    }

    this.makeButton(
      cx,
      DESIGN_HEIGHT * (this.rewardOffered ? 0.73 : 0.63),
      'Play again',
      COLORS.player,
      () => void this.onPlayAgain(),
    );
  }

  /**
   * Rewarded path. `showRewardedBreak()` handles gameplayStop/Start, audio
   * ducking and a save flush; we only decide what the reward is.
   */
  private async onRewardedContinue(): Promise<void> {
    if (this.busy) return;
    this.busy = true;

    const earned = await this.rewardedBreak();

    if (earned) {
      const game = this.scene.get('Game') as GameScene;
      this.scene.stop();
      game.continueWithExtraLife();
      return;
    }

    // Ad unfilled, blocked, or closed early. Say so plainly and leave the
    // player exactly where they were — never punish a failed ad.
    this.busy = false;
    this.add
      .text(DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.66, 'No ad available right now.', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        color: COLORS.dim,
      })
      .setOrigin(0.5);
  }

  private async onPlayAgain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;

    await this.commercialBreak();

    this.scene.stop('Game');
    this.scene.stop();
    this.scene.start('Game');
  }

  /**
   * This overlay is not a BaseGameplayScene, so it reaches the portal through
   * the context directly. Audio ducking still happens — it lives in the
   * adapter, not in the scene base.
   */
  private async commercialBreak(): Promise<void> {
    await this.context.save.flush();
    await this.context.portal.commercialBreak();
  }

  private async rewardedBreak(): Promise<boolean> {
    await this.context.save.flush();
    return this.context.portal.rewardedBreak();
  }

  private makeButton(
    x: number,
    y: number,
    label: string,
    tint: number,
    onClick: () => void,
  ): void {
    const text = this.add
      .text(x, y, label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '30px',
        color: COLORS.text,
        // Generous padding keeps the tap target comfortably above the ~44px
        // minimum on a phone, where this button is small in CSS pixels.
        padding: { x: 28, y: 16 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    const frame = this.add
      .rectangle(x, y, text.width, text.height)
      .setStrokeStyle(2, tint, 0.9)
      .setOrigin(0.5);
    frame.setDepth(text.depth - 1);

    text.on(Phaser.Input.Events.POINTER_OVER, () => frame.setFillStyle(tint, 0.12));
    text.on(Phaser.Input.Events.POINTER_OUT, () => frame.setFillStyle(tint, 0));
    text.on(Phaser.Input.Events.POINTER_DOWN, onClick);
  }
}
