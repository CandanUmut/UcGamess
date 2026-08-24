import Phaser from 'phaser';
import { BaseScene, DESIGN_HEIGHT, DESIGN_WIDTH } from '@ucgames/core';
import { COLORS } from '../config.ts';

/**
 * Menu.
 *
 * Design rule this demonstrates (see docs/design-rules.md): the player must be
 * able to start playing within five seconds of the page loading. That means one
 * obvious action, no splash sequence, no settings gate. The control hint adapts
 * to the device so a phone player is never told to "press A/D".
 */
export class MenuScene extends BaseScene {
  private hint?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'Menu' });
  }

  protected build(): void {
    const cx = DESIGN_WIDTH / 2;

    this.add
      .image(cx, DESIGN_HEIGHT * 0.28, 'logo')
      .setScale(0.6)
      .setOrigin(0.5);

    this.add
      .text(cx, DESIGN_HEIGHT * 0.44, 'CATCH THE BLUE', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '58px',
        fontStyle: 'bold',
        color: COLORS.text,
      })
      .setOrigin(0.5);

    const highScore = this.context.save.get('highScore', 0);
    if (highScore > 0) {
      this.add
        .text(cx, DESIGN_HEIGHT * 0.54, `Best: ${highScore}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '30px',
          color: COLORS.dim,
        })
        .setOrigin(0.5);
    }

    this.hint = this.add
      .text(cx, DESIGN_HEIGHT * 0.68, this.startPrompt(), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '32px',
        color: COLORS.text,
      })
      .setOrigin(0.5);

    // A gently pulsing prompt reads as "ready for input" without a tutorial.
    this.tweens.add({
      targets: this.hint,
      alpha: 0.45,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(cx, DESIGN_HEIGHT * 0.8, 'Catch blue. Avoid red.', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '24px',
        color: COLORS.dim,
      })
      .setOrigin(0.5);

    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => this.start());
    this.input.keyboard?.once('keydown', () => this.start());
  }

  override update(): void {
    // The device is only known once the player touches something, so keep the
    // prompt honest rather than guessing from the user agent.
    const next = this.startPrompt();
    if (this.hint && this.hint.text !== next) this.hint.setText(next);
  }

  private startPrompt(): string {
    return this.input2.lastDevice === 'touch' ? 'Tap to play' : 'Click or press any key';
  }

  private start(): void {
    this.scene.start('Game');
  }
}
