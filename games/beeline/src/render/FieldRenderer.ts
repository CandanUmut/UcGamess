import type Phaser from 'phaser';
import { COLORS, TUNING } from '../config/tuning.ts';
import type { Field } from '../sim/Field.ts';
import type { Patch } from '../sim/Patch.ts';
import type { Bramble } from '../sim/Bramble.ts';
import { TEX } from './textures.ts';

const PATCH_TINT: Record<string, number> = {
  normal: COLORS.patch,
  rich: 0xffb454,
  night: 0xb98cff,
};

/** Draws the hive, the flower patches and the wasps. */
export class FieldRenderer {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly hiveGlow: Phaser.GameObjects.Image;
  private readonly waspGfx: Phaser.GameObjects.Graphics;
  /**
   * Thorns get their own layer beneath the routes.
   *
   * A route drawn *over* a thicket would look like it passes through, which is
   * exactly the thing that cannot be true. Under the route layer, a line that
   * ends at a thicket reads as stopped by it.
   */
  private readonly brambleGfx: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;
  private readonly depth: number;
  /** One label per patch, reused. Pollen left is a number worth reading now. */
  private labels: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene, field: Field, depth: number) {
    this.scene = scene;
    this.depth = depth;
    this.gfx = scene.add.graphics().setDepth(depth);
    this.hiveGlow = scene.add
      .image(field.hiveX, field.hiveY, TEX.glow)
      .setDepth(depth + 1)
      .setTint(COLORS.hive)
      .setScale(1.6);
    this.waspGfx = scene.add.graphics().setDepth(depth + 3);
    this.brambleGfx = scene.add.graphics().setDepth(depth + 4);
  }

  draw(field: Field, alpha: number, drawingFromHive: boolean): void {
    const g = this.gfx;
    g.clear();

    for (const patch of field.patches) {
      if (!patch.discovered) continue;
      this.drawPatch(g, patch, field.time);
    }
    this.drawLabels(field);
    this.drawBrambles(field);

    // The area a new route can start from. Brightening it while the player is
    // mid-drag is the only chrome the playfield has.
    g.lineStyle(2, COLORS.hive, drawingFromHive ? 0.5 : 0.16);
    g.strokeCircle(field.hiveX, field.hiveY, TUNING.hive.drawRadius);

    const pulse = 1 + Math.sin(field.time * 2) * 0.04;
    this.hiveGlow.setScale(1.6 * pulse);

    this.drawWasps(field, alpha);
  }

  private drawPatch(g: Phaser.GameObjects.Graphics, patch: Patch, time: number): void {
    const scale = patch.bloomT;
    if (scale <= 0.01) return;

    const tint = patch.alive ? this.patchTint(patch) : COLORS.patchDry;
    // Richer flowers are physically bigger, so "worth the distance" is legible
    // from across the board before the number is read.
    const radius = 26 * scale * (0.85 + 0.2 * patch.yieldPerTrip);

    // The ring marks where a route has to reach. It is the target the player
    // aims at, so it stays visible rather than being decorative.
    g.lineStyle(2, tint, patch.alive ? 0.45 : 0.15);
    g.strokeCircle(patch.x, patch.y, TUNING.patch.reachRadius * scale);

    g.fillStyle(tint, 0.06);
    g.fillCircle(patch.x, patch.y, radius * 1.7);

    // The inner disc shrinks with the remaining pool, so a patch running dry is
    // readable from across the field without a number on it.
    g.fillStyle(tint, 0.85);
    g.fillCircle(patch.x, patch.y, radius * (0.4 + 0.6 * patch.fullness));

    if (patch.kind === 'rich' && patch.alive) {
      // A second ring, so "worth the distance" is visible at a glance.
      g.lineStyle(2, tint, 0.35 + 0.25 * Math.sin(time * 3));
      g.strokeCircle(patch.x, patch.y, radius * 1.35);
    }

    if (patch.kind === 'night' && patch.alive) {
      // A closing arc: the window is the whole point of a night bloom, so it
      // gets the only countdown in the game.
      const sweep = Math.PI * 2 * patch.windowFraction;
      g.lineStyle(4, tint, 0.9);
      g.beginPath();
      g.arc(patch.x, patch.y, radius * 1.5, -Math.PI / 2, -Math.PI / 2 + sweep, false);
      g.strokePath();
    }
  }

  /**
   * Remaining pollen, drawn on each flower.
   *
   * Only worth showing now that pollen actually runs out. The shrinking disc
   * conveys roughly-how-much; the number answers "is it worth redrawing to
   * this one", which is the decision the player is actually making once a
   * flower can die for the day.
   */
  /**
   * Warmer with distance.
   *
   * A far flower pays up to three times a near one, and the player should be
   * able to feel that from the colour before they read the number — the number
   * confirms the decision, it should not be what triggers it.
   */
  private patchTint(patch: Patch): number {
    const base = PATCH_TINT[patch.kind] ?? COLORS.patch;
    if (patch.kind !== 'normal') return base;
    const t = Math.min(1, Math.max(0, (patch.distanceMultiplier - 1) / 2));
    return blend(COLORS.patch, 0xffd166, t);
  }

  private drawLabels(field: Field): void {
    while (this.labels.length < field.patches.length) {
      const label = this.scene.add
        .text(0, 0, '', {
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          fontSize: '19px',
          color: '#f4f4f8',
          stroke: '#12100c',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(this.depth + 2);
      this.labels.push(label);
    }

    for (let i = 0; i < this.labels.length; i += 1) {
      const label = this.labels[i];
      const patch = field.patches[i];
      if (!label) continue;

      if (!patch || !patch.alive || !patch.discovered || patch.bloomT < 0.5) {
        label.setVisible(false);
        continue;
      }

      label.setVisible(true);
      // Clear of the route's tip handle, which lands near the flower's edge and
      // was clipping the number.
      label.setPosition(patch.x, patch.y - 62);
      // Honey left, not pollen left. Once flowers pay different rates by
      // distance, two reading "180" can be worth 180 and 540, and asking the
      // player to multiply two figures mid-drag is arithmetic, not a decision.
      label.setText(String(Math.ceil(patch.honeyLeft)));
      // Warns before it runs dry, so retargeting is a decision rather than a
      // surprise.
      label.setColor(patch.fullness < 0.25 ? '#ff8a65' : '#f4f4f8');
    }
  }

  /**
   * Thorn thickets: a dark mass with a spiked rim.
   *
   * Drawn dark and matte against a field of glowing flowers and a glowing hive,
   * because the one thing the player has to read instantly is "nothing of mine
   * goes there". The spikes are a fixed shape per thicket and only the radius
   * animates, so growth reads as growth rather than as noise.
   */
  private drawBrambles(field: Field): void {
    const g = this.brambleGfx;
    g.clear();
    if (field.brambles.length === 0) return;

    for (const bramble of field.brambles) {
      if (!bramble.discovered) continue;
      this.drawBramble(g, bramble);
    }
  }

  private drawBramble(g: Phaser.GameObjects.Graphics, bramble: Bramble): void {
    const { x, y, radius, spikes } = bramble;

    // A soft dark halo so the edge does not look like a hard cut-out, and so
    // the boundary the route stops at is visible slightly before it is reached.
    g.fillStyle(0x000000, 0.32);
    g.fillCircle(x, y, radius * 1.12);

    g.fillStyle(COLORS.bramble, 0.96);
    g.fillCircle(x, y, radius);

    g.lineStyle(2, COLORS.brambleThorn, 0.75);
    for (let i = 0; i < spikes.length; i += 2) {
      const angle = spikes[i] ?? 0;
      const reach = spikes[i + 1] ?? 1;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      g.beginPath();
      g.moveTo(x + cos * radius * 0.55, y + sin * radius * 0.55);
      g.lineTo(x + cos * radius * reach, y + sin * radius * reach);
      g.strokePath();
    }

    g.lineStyle(2, COLORS.brambleThorn, 0.5);
    g.strokeCircle(x, y, radius);
  }

  private drawWasps(field: Field, alpha: number): void {
    const g = this.waspGfx;
    g.clear();
    if (field.wasps.length === 0) return;

    for (const wasp of field.wasps) {
      const x = wasp.prevX + (wasp.x - wasp.prevX) * alpha;
      const y = wasp.prevY + (wasp.y - wasp.prevY) * alpha;

      // Threat radius drawn faintly — the player needs to judge whether a route
      // passes through danger, and guessing at an invisible radius is unfair.
      g.fillStyle(0xff5252, 0.08);
      g.fillCircle(x, y, TUNING.wasp.interceptRadius * 1.6);

      g.fillStyle(0x1b1b1b, 0.9);
      g.fillCircle(x, y, 9);
      g.fillStyle(0xff7043, 1);
      g.fillCircle(x, y, 5);
    }
  }

  destroy(): void {
    this.gfx.destroy();
    this.hiveGlow.destroy();
    this.waspGfx.destroy();
    this.brambleGfx.destroy();
    for (const label of this.labels) label.destroy();
    this.labels = [];
  }
}

/** Linear blend between two packed RGB colours. */
function blend(from: number, to: number, t: number): number {
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * t);
  const g = Math.round(fg + (tg - fg) * t);
  const b = Math.round(fb + (tb - fb) * t);
  return (r << 16) | (g << 8) | b;
}
