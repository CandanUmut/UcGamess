import type Phaser from 'phaser';
import { COLORS } from '../config/tuning.ts';
import { DESIGN_WIDTH } from '@ucgames/core';

// Nunito first, system stack behind it. The fallback is load-bearing twice
// over: the face may not have arrived (see main.ts), and the subset is
// deliberately small, so a glyph it lacks — the play triangle and the arrow
// in the night screen — is drawn by the next family along.
const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

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
  private readonly alertText: Phaser.GameObjects.Text;
  private alertPhase = 0;

  /** One row per buyer: name, price, and which way it is going. */
  private readonly priceTexts: Phaser.GameObjects.Text[] = [];

  /**
   * Wind readout.
   *
   * Wasp threat radii are drawn on the field so danger is never invisible, but
   * wind shipped with no indicator at all — the player could only react to
   * routes bending, never plan around them. An arrow pointing where the wind
   * pushes, sized by strength, makes it something to route around.
   */
  private readonly windArrow: Phaser.GameObjects.Graphics;
  private readonly windLabel: Phaser.GameObjects.Text;
  private windX = 0;
  private windY = 0;
  private windStrength = 0;

  /** Swarm split between carrying and opening new routes. */
  private readonly swarmText: Phaser.GameObjects.Text;

  /**
   * How many flowers are still out in the dark.
   *
   * Without this the player cannot tell an unexplored corner from an empty one,
   * and exploring becomes a superstition rather than a decision. The count says
   * there is something worth finding; it deliberately never says where, which
   * is the part the player has to go and buy with bees and time.
   */
  private readonly unfoundText: Phaser.GameObjects.Text;

  private barWidth = 560;
  private lastHoney = 0;
  private metShown = false;

  constructor(scene: Phaser.Scene, depth: number) {
    this.root = scene.add.container(0, 0).setDepth(depth);
    // Pinned to the camera, not to the world. The playfield is a fixed
    // 1280x720 centred in a canvas that matches the device, so a HUD living in
    // world space would sit inside the playfield's edges and leave the real
    // screen edges empty — which is the letterboxing this was meant to remove,
    // just repainted. At scroll factor zero, `layout` positions everything in
    // canvas coordinates and the HUD reaches the actual corners of the display.
    this.root.setScrollFactor(0);

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
      .rectangle(0, 0, this.barWidth, 14, 0x3c3524, 0.14)
      .setOrigin(0, 0.5);
    this.barFill = scene.add
      .rectangle(0, 0, this.barWidth, 14, COLORS.hive)
      .setOrigin(0, 0.5)
      .setScale(0, 1);
    this.quotaTick = scene.add.rectangle(0, 0, 3, 22, 0x3c3524, 0.5).setOrigin(0.5, 0.5);

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

    this.windArrow = scene.add.graphics();
    this.windLabel = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: COLORS.dim })
      .setOrigin(0.5, 0);

    this.swarmText = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '16px', color: COLORS.dim })
      .setOrigin(0, 0.5);

    this.unfoundText = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '16px', color: '#1f6f9c' })
      .setOrigin(0, 0.5);

    // Sits under the honey bar rather than in the banner slot. The banner is a
    // once-a-day announcement that fades; a raid is a state the player is in,
    // and it has to still be on screen while they deal with it.
    this.alertText = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '20px', color: '#e0523c' })
      .setOrigin(0.5, 0)
      .setAlpha(0);

    for (let i = 0; i < 2; i += 1) {
      this.priceTexts.push(
        scene.add
          .text(0, 0, '', { fontFamily: FONT, fontSize: '16px', color: COLORS.text })
          .setOrigin(1, 0.5),
      );
    }

    this.root.add([
      ...this.priceTexts,
      this.dayText,
      this.timerText,
      this.barBg,
      this.barFill,
      this.quotaTick,
      this.honeyText,
      this.banner,
      this.windArrow,
      this.windLabel,
      this.swarmText,
      this.unfoundText,
      this.alertText,
    ]);
  }

  /** Wind direction and strength, in field units. Strength 0 hides it. */
  setWind(x: number, y: number, strength: number): void {
    this.windX = x;
    this.windY = y;
    this.windStrength = strength;
    this.redrawWind();
  }

  private redrawWind(): void {
    const g = this.windArrow;
    g.clear();

    const visible = this.windStrength > 0.01;
    this.windLabel.setVisible(visible);
    if (!visible) return;

    const cx = this.windAnchorX;
    const cy = this.windAnchorY;
    // Length carries strength, so a glance gives both facts at once.
    const len = 16 + Math.min(1, this.windStrength / 34) * 20;
    const tipX = cx + this.windX * len;
    const tipY = cy + this.windY * len;

    g.lineStyle(3, 0x1f6f9c, 0.85);
    g.beginPath();
    g.moveTo(cx - this.windX * len, cy - this.windY * len);
    g.lineTo(tipX, tipY);
    g.strokePath();

    // Arrowhead.
    const nx = -this.windY;
    const ny = this.windX;
    g.fillStyle(0x1f6f9c, 0.95);
    g.fillTriangle(
      tipX + this.windX * 8,
      tipY + this.windY * 8,
      tipX - this.windX * 4 + nx * 6,
      tipY - this.windY * 4 + ny * 6,
      tipX - this.windX * 4 - nx * 6,
      tipY - this.windY * 4 - ny * 6,
    );

    this.windLabel.setText('wind').setPosition(cx, cy + 24);
  }

  /** How many flowers remain undiscovered. Hidden at zero. */
  setUnfound(count: number): void {
    this.unfoundText.setText(
      count > 0 ? `${count} flower${count === 1 ? '' : 's'} still out there` : '',
    );
  }

  /** Bees carrying versus bees opening routes — what a draw just cost. */
  setSwarm(foraging: number, building: number, lost = 0): void {
    this.swarmText.setText(
      [
        `${foraging} foraging`,
        building > 0 ? `${building} building` : '',
        // Shown only once a raid has actually taken some. A permanent "0 lost"
        // would be a scoreboard for something that has not happened.
        lost > 0 ? `${lost} lost` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    );
    this.swarmText.setColor(lost > 0 ? '#e0523c' : building > 0 ? '#b9761c' : COLORS.dim);
  }

  private windAnchorX = 0;
  private windAnchorY = 0;

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
    this.alertText.setPosition(safe.centerX, top + 42);

    this.priceTexts.forEach((text, index) => {
      text.setPosition(safe.right - 24, top + 34 + index * 22);
    });

    this.swarmText.setPosition(safe.x + 24, top + 34);
    this.unfoundText.setPosition(safe.x + 24, top + 56);
    this.windAnchorX = safe.right - 62;
    this.windAnchorY = top + 46;
    this.redrawWind();
  }

  update(day: number, honey: number, quota: number, secondsLeft: number): void {
    this.dayText.setText(`Day ${day}`);

    const seconds = Math.max(0, Math.ceil(secondsLeft));
    this.timerText.setText(String(seconds));
    // Red in the last ten seconds. Time pressure should be felt, not read.
    this.timerText.setColor(seconds <= 10 ? COLORS.bad : COLORS.text);

    const ratio = quota > 0 ? honey / quota : 0;
    this.barFill.setScale(Math.min(1, ratio), 1);

    const met = honey >= quota;
    this.barFill.setFillStyle(met ? 0x3f8f5f : COLORS.hive);
    this.honeyText.setText(
      met ? `${Math.floor(honey)} — quota met` : `${Math.floor(honey)} / ${quota}`,
    );
    this.honeyText.setColor(met ? COLORS.good : COLORS.dim);

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

  /**
   * The live raid line: null clears it, a string keeps it up and pulsing.
   *
   * Driven every frame rather than tweened, because the thing it describes can
   * end at any moment and a tween that outlives its cause is how a HUD starts
   * lying to the player.
   */
  setAlert(text: string | null, deltaSeconds = 0): void {
    if (!text) {
      this.alertText.setAlpha(0);
      this.alertPhase = 0;
      return;
    }
    this.alertPhase += deltaSeconds * 6;
    this.alertText.setText(text);
    this.alertText.setAlpha(0.72 + 0.28 * Math.abs(Math.sin(this.alertPhase)));
  }

  /**
   * The two buyers' prices, best one highlighted.
   *
   * The hive's own fullness used to live here too, as a vertical comb gauge
   * against the left edge. It has moved onto the board and into the hive
   * itself — see `FieldRenderer.drawHiveHoney`. A gauge in the corner asked the
   * player to watch two objects and join them mentally; the building is already
   * on screen and is already the thing filling up.
   */
  setPrices(
    rows: ReadonlyArray<{ name: string; price: number; trend: number; tint: number }>,
  ): void {
    let best = rows[0];
    for (const row of rows) if (best && row.price > best.price) best = row;
    rows.forEach((row, index) => {
      const text = this.priceTexts[index];
      if (!text) return;
      const arrow = row.trend > 0 ? '▲' : row.trend < 0 ? '▼' : '·';
      text.setText(`${row.name}  ${row.price.toFixed(2)} ${arrow}`);
      // Tinted by buyer so the number on the HUD and the depot on the board are
      // obviously the same thing, and brightened when it is the better offer.
      text.setColor(
        row === best ? `#${row.tint.toString(16).padStart(6, '0')}` : COLORS.dim,
      );
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
