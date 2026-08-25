import { BaseScene, DESIGN_WIDTH, centerPlayfield, viewRect } from '@ucgames/core';
import { COLORS } from '../config/tuning.ts';
import { Button } from '../ui/Button.ts';
import {
  coerceSave,
  newSave,
  writeSave,
  SAVE_KEY,
  type BeelineSave,
} from '../game/SaveState.ts';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * The title screen.
 *
 * The game used to boot straight into day one, on the argument that a menu is
 * friction before the hook. That argument is real, but the playtest verdict was
 * that the game "is not professional yet, still a prototype" — and arriving
 * mid-simulation with no title, no way back to the start, and no idea what you
 * are looking at is a large part of why.
 *
 * The compromise is that this screen is *instant* and has one obvious button.
 * Nothing is preloaded, nothing animates in before it is usable, and a returning
 * player's first tap continues their run. It costs one tap and buys the game an
 * identity, a tutorial that can be offered rather than inflicted, and somewhere
 * for "start over" to live.
 */
export class MenuScene extends BaseScene {
  private save!: BeelineSave;

  constructor() {
    super({ key: 'Menu' });
  }

  protected build(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    centerPlayfield(this);

    const view = viewRect(this);
    this.add
      .rectangle(view.centerX, view.centerY, view.width, view.height, 0x12100c)
      .setOrigin(0.5);

    // Read the save before drawing, so the primary button can say what it does.
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      await this.context.save.load();
    } catch (error) {
      console.warn('[beeline] Could not read save; starting fresh.', error);
    }
    this.save = coerceSave(this.context.save.get<unknown>(SAVE_KEY, null));
    this.layoutMenu();
  }

  private layoutMenu(): void {
    const cx = DESIGN_WIDTH / 2;

    this.add
      .text(cx, 170, 'Beeline', {
        fontFamily: FONT,
        fontSize: '76px',
        fontStyle: 'bold',
        color: '#ffd966',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 232, 'Draw the way through. Bring the honey home.', {
        fontFamily: FONT,
        fontSize: '21px',
        color: COLORS.dim,
      })
      .setOrigin(0.5);

    const resuming = this.save.day > 1 || this.save.honey > 0 || this.save.bestRunDay > 0;

    new Button(this, {
      x: cx,
      y: 350,
      width: 380,
      label: resuming ? `Continue — day ${this.save.day}` : 'Play',
      tint: 0x4ade80,
      onClick: () => this.start(),
    });

    if (resuming) {
      this.add
        .text(cx, 415, `Best run: day ${Math.max(1, this.save.bestRunDay)}`, {
          fontFamily: FONT,
          fontSize: '17px',
          color: COLORS.dim,
        })
        .setOrigin(0.5);

      // The explicit ask: a way back to the beginning. Two taps, never one —
      // wiping a run by mis-tapping a menu button would be unforgivable.
      new Button(this, {
        x: cx,
        y: 470,
        width: 380,
        label: 'Start over',
        sublabel: 'clears your hive and every upgrade',
        tint: 0xff8a65,
        onClick: () => this.confirmReset(),
      });
    }

    this.add
      .text(cx, resuming ? 560 : 460, 'Drag from the hive toward a flower.', {
        fontFamily: FONT,
        fontSize: '18px',
        color: COLORS.dim,
      })
      .setOrigin(0.5);
  }

  /**
   * Second tap before anything is destroyed.
   *
   * Replaces the button in place rather than opening a dialog: a modal here
   * would need its own backdrop, its own dismissal and its own hit-testing, and
   * all of that to ask one question.
   */
  private confirmReset(): void {
    const cx = DESIGN_WIDTH / 2;

    const warning = this.add
      .text(cx, 545, 'This cannot be undone.', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#ff8a65',
      })
      .setOrigin(0.5);

    new Button(this, {
      x: cx - 130,
      y: 470,
      width: 240,
      label: 'Yes, start over',
      tint: 0xff8a65,
      onClick: () => {
        writeSave(this.context.save, newSave());
        void this.context.save.flush();
        this.scene.start('Game');
      },
    });

    new Button(this, {
      x: cx + 130,
      y: 470,
      width: 240,
      label: 'Keep my hive',
      tint: 0x60a5fa,
      onClick: () => {
        warning.destroy();
        this.scene.restart();
      },
    });
  }

  private start(): void {
    this.scene.start('Game');
  }
}
