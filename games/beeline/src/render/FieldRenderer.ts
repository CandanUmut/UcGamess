import type Phaser from 'phaser';
import { COLORS, TUNING } from '../config/tuning.ts';
import type { Field } from '../sim/Field.ts';
import type { Patch } from '../sim/Patch.ts';
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

  constructor(scene: Phaser.Scene, field: Field, depth: number) {
    this.gfx = scene.add.graphics().setDepth(depth);
    this.hiveGlow = scene.add
      .image(field.hiveX, field.hiveY, TEX.glow)
      .setDepth(depth + 1)
      .setTint(COLORS.hive)
      .setScale(1.6);
    this.waspGfx = scene.add.graphics().setDepth(depth + 3);
  }

  draw(field: Field, alpha: number, drawingFromHive: boolean): void {
    const g = this.gfx;
    g.clear();

    for (const patch of field.patches) this.drawPatch(g, patch, field.time);

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

    const tint = patch.alive ? (PATCH_TINT[patch.kind] ?? COLORS.patch) : COLORS.patchDry;
    const radius = 26 * scale;

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
  }
}
