import type Phaser from 'phaser';
import { COLORS } from '../config/tuning.ts';
import { DESIGN_WIDTH } from '@ucgames/core';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Day timer, honey progress against quota, and the day banner.
 *
 * The quota bar is the whole reason this game has stakes, so it is the largest
 * element and sits along the top edge where it is readable at a glance without
 * moving the eye off the field. It changes colour on reaching quota — that
 * moment is the only unambiguously good news in a day and it should be
 * impossible to miss.
 *
 * Everything is anchored to the safe-area rect rather than to the canvas edge,
 * so nothing lands under a notch.
 */
export class Hud {
  private readonly root: Phaser.GameObjects.Container;
  private readonly barBg: Phaser.GameObjects.Rectangle;
  private readonly barFill: Phaser.GameObjects.Rectangle;
  private readonly quotaTick: Phaser.GameObjects.Rectangle;
  private readonly honeyText: Phaser.GameObjects.Text;
  private readonly dayText: Phaser.GameObjects.Text;
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly banner: Phaser.GameObjects.Text;

  private barWidth = 560;
  private lastHoney = 0;
  private metShown = false;

  constructor(scene: Phaser.Scene, depth: number) {
    this.root = scene.add.container(0, 0).setDepth(depth);

    this.dayText = scene.add
      .text(0, 0, 'Day 1', { fontFamily: FONT, fontSize: '26px', color: COLORS.text })
      .setOrigin(0, 0.5);

    this.timerText = scene.add
      .text(0, 0, '45', {
        fontFamily: FONT,
        fontSize: '30px',
        color: COLORS.text,
        // Tabular figures stop the countdown jittering as digit widths change.
        fontStyle: 'bold',
      })
      .setOrigin(1, 0.5);

    this.barBg = scene.add
      .rectangle(0, 0, this.barWidth, 14, 0xffffff, 0.1)
      .setOrigin(0, 0.5);
    this.barFill = scene.add
      .rectangle(0, 0, this.barWidth, 14, COLORS.hive)
      .setOrigin(0, 0.5)
      .setScale(0, 1);
    this.quotaTick = scene.add.rectangle(0, 0, 3, 22, 0xffffff, 0.55).setOrigin(0.5, 0.5);

    this.honeyText = scene.add
      .text(0, 0, '0 / 60', { fontFamily: FONT, fontSize: '20px', color: COLORS.dim })
      .setOrigin(0.5, 0);

    this.banner = scene.add
      .text(DESIGN_WIDTH / 2, 150, '', {
        fontFamily: FONT,
        fontSize: '26px',
        color: COLORS.text,
        align: 'center',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.root.add([
      this.dayText,
      this.timerText,
      this.barBg,
      this.barFill,
      this.quotaTick,
      this.honeyText,
      this.banner,
    ]);
  }

  layout(safe: Phaser.Geom.Rectangle): void {
    const top = safe.y + 26;
    this.barWidth = Math.min(560, safe.width - 260);

    this.dayText.setPosition(safe.x + 24, top);
    this.timerText.setPosition(safe.right - 24, top);

    const barX = safe.centerX - this.barWidth / 2;
    this.barBg.setPosition(barX, top).setSize(this.barWidth, 14);
    this.barFill.setPosition(barX, top).setSize(this.barWidth, 14);
    this.quotaTick.setPosition(barX + this.barWidth, top);
    this.honeyText.setPosition(safe.centerX, top + 16);
    this.banner.setPosition(safe.centerX, safe.y + 140);
  }

  update(day: number, honey: number, quota: number, secondsLeft: number): void {
    this.dayText.setText(`Day ${day}`);

    const seconds = Math.max(0, Math.ceil(secondsLeft));
    this.timerText.setText(String(seconds));
    // Red in the last ten seconds. Time pressure should be felt, not read.
    this.timerText.setColor(seconds <= 10 ? '#ff8a65' : COLORS.text);

    const ratio = quota > 0 ? honey / quota : 0;
    this.barFill.setScale(Math.min(1, ratio), 1);

    const met = honey >= quota;
    this.barFill.setFillStyle(met ? 0x7fd1ae : COLORS.hive);
    this.honeyText.setText(
      met ? `${Math.floor(honey)} — quota met` : `${Math.floor(honey)} / ${quota}`,
    );
    this.honeyText.setColor(met ? '#7fd1ae' : COLORS.dim);

    if (met && !this.metShown) {
      this.metShown = true;
      this.pulse();
    }

    this.lastHoney = honey;
  }

  /** Small punch on the bar when the quota is first reached. */
  private pulse(): void {
    const scene = this.barBg.scene;
    scene.tweens.add({
      targets: [this.barBg, this.barFill],
      scaleY: 1.6,
      duration: 140,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** One-line announcement for a day that introduces something new. */
  showBanner(text: string): void {
    const scene = this.banner.scene;
    this.banner.setText(text).setAlpha(0).setScale(0.96);
    scene.tweens.add({
      targets: this.banner,
      alpha: 1,
      scale: 1,
      duration: 320,
      ease: 'Back.easeOut',
      hold: 2200,
      yoyo: true,
    });
  }

  resetDay(): void {
    this.metShown = false;
    this.lastHoney = 0;
    this.barFill.setScale(0, 1);
  }

  get currentHoney(): number {
    return this.lastHoney;
  }

  setVisible(visible: boolean): void {
    this.root.setVisible(visible);
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
