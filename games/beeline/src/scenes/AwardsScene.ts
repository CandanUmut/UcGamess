import type Phaser from 'phaser';
import { BaseScene, DESIGN_WIDTH, centerPlayfield, viewRect } from '@ucgames/core';
import { COLORS } from '../config/tuning.ts';
import { coerceSave, SAVE_KEY } from '../game/SaveState.ts';
import { ACHIEVEMENTS } from '../game/Achievements.ts';
import { Button } from '../ui/Button.ts';
import { star } from '../ui/Hud.ts';

const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Every achievement, earned or not. The ones still to get are listed with
 * their goal in full, so this screen is a to-do list as much as a trophy case.
 */
export class AwardsScene extends BaseScene {
  constructor() {
    super({ key: 'Awards' });
  }

  protected build(): void {
    centerPlayfield(this);
    this.cameras.main.setBackgroundColor(COLORS.background);
    const save = coerceSave(this.context.save.get<unknown>(SAVE_KEY, null));
    const view = viewRect(this);
    const cx = DESIGN_WIDTH / 2;

    this.text(
      `Awards  ${save.achievements.length} / ${ACHIEVEMENTS.length}`,
      cx,
      56,
      40,
      '#ffd23f',
      true,
    );
    new Button(this, {
      x: view.x + 110,
      y: view.y + 44,
      width: 170,
      label: '⌂  Menu',
      tint: 0x8a6a3a,
      onClick: () => this.scene.start('Menu'),
    });

    const colW = 560;
    const rowH = 64;
    const perCol = Math.ceil(ACHIEVEMENTS.length / 2);
    ACHIEVEMENTS.forEach((a, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      const x = cx + (col === 0 ? -colW / 2 - 10 : colW / 2 + 10);
      const y = 130 + row * rowH;
      const got = save.achievements.includes(a.id);

      const g = this.add.graphics();
      g.fillStyle(0x2a2114, got ? 0.94 : 0.78);
      g.fillRoundedRect(x - colW / 2, y - rowH / 2 + 4, colW, rowH - 8, 14);
      if (got) {
        g.lineStyle(2, 0xffc93c, 0.9);
        g.strokeRoundedRect(x - colW / 2, y - rowH / 2 + 4, colW, rowH - 8, 14);
      }
      star(g, x - colW / 2 + 32, y, 18, got ? 0xffd84a : 0x5a4a30);

      this.text(
        a.name,
        x - colW / 2 + 62,
        y - 11,
        20,
        got ? '#ffe38a' : '#d8cbaa',
        true,
      ).setOrigin(0, 0.5);
      this.text(
        a.goal,
        x - colW / 2 + 62,
        y + 13,
        15,
        got ? '#e9dcc0' : '#c2b491',
      ).setOrigin(0, 0.5);
    });
  }

  private text(
    value: string,
    x: number,
    y: number,
    size: number,
    colour: string,
    bold = false,
  ): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, value, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: bold ? 'bold' : 'normal',
        color: colour,
        stroke: '#1d160c',
        strokeThickness: bold ? 5 : 0,
      })
      .setOrigin(0.5);
  }
}
