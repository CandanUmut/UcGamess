import type Phaser from 'phaser';
import { COLORS, TUNING } from '../config/tuning.ts';
import type { Field } from '../sim/Field.ts';
import type { Patch } from '../sim/Patch.ts';
import {
  WORLD_HEIGHT as PLAYFIELD_HEIGHT,
  WORLD_WIDTH as PLAYFIELD_WIDTH,
} from '../sim/Field.ts';
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
   * The maze gets its own layer beneath the routes.
   *
   * A route drawn *over* a hedge would look like it passes through, which is
   * exactly the thing that cannot be true. Under the route layer, a line that
   * ends at a wall reads as stopped by it.
   */
  private readonly wallGfx: Phaser.GameObjects.Graphics;
  /**
   * The area outside the 1280x720 playfield, on devices whose canvas is a
   * different shape.
   *
   * Painted a shade off the field with a hairline at the boundary, so the edge
   * of the board is legible rather than the field appearing to run off into
   * darkness. Without it the extra space reads as more unexplored ground, which
   * is exactly the wrong signal on a game about exploring.
   */
  private readonly surroundGfx: Phaser.GameObjects.Graphics;
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
    this.wallGfx = scene.add.graphics().setDepth(depth + 4);
    this.surroundGfx = scene.add.graphics().setDepth(depth + 60);
  }

  /**
   * Paints the surround for a canvas larger than the playfield.
   *
   * Redrawn only on layout rather than per frame — the canvas shape changes on
   * a rotate and at no other time.
   */
  setViewRect(view: Phaser.Geom.Rectangle): void {
    const g = this.surroundGfx;
    g.clear();

    const left = view.x;
    const top = view.y;
    const right = view.right;
    const bottom = view.bottom;

    // Four bands around the playfield. Drawn as bands rather than as one big
    // rectangle with a hole because Graphics has no even-odd fill, and a mask
    // would cost a render texture for something this simple.
    g.fillStyle(0x000000, 0.55);
    if (left < 0) g.fillRect(left, top, -left, bottom - top);
    if (right > PLAYFIELD_WIDTH) {
      g.fillRect(PLAYFIELD_WIDTH, top, right - PLAYFIELD_WIDTH, bottom - top);
    }
    if (top < 0) g.fillRect(0, top, PLAYFIELD_WIDTH, -top);
    if (bottom > PLAYFIELD_HEIGHT) {
      g.fillRect(0, PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH, bottom - PLAYFIELD_HEIGHT);
    }

    if (left < 0 || top < 0 || right > PLAYFIELD_WIDTH || bottom > PLAYFIELD_HEIGHT) {
      g.lineStyle(2, COLORS.hive, 0.16);
      g.strokeRect(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
    }
  }

  draw(field: Field, alpha: number, drawingFromHive: boolean): void {
    const g = this.gfx;
    g.clear();

    for (const patch of field.patches) {
      if (!patch.discovered) continue;
      this.drawPatch(g, patch, field.time);
    }
    this.drawLabels(field);
    this.drawWalls(field);

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
   * The bramble walls, drawn only where the player has been.
   *
   * A wall is drawn as a rounded bar centred on the cell edge it closes, which
   * is exactly where the collision test puts it — so a line that stops against
   * a hedge stops where the hedge looks like it is.
   *
   * Fog gates it per wall rather than per board: an unexplored corridor stays
   * black, and learning the layout by flying it is the point. A wall is shown
   * once either of the cells it divides has been seen, because a hedge you have
   * stood next to is a hedge you know about.
   */
  private drawWalls(field: Field): void {
    const g = this.wallGfx;
    g.clear();

    const { maze } = field;
    const thickness = TUNING.maze.wallThickness;
    const half = thickness / 2;

    const seen = (col: number, row: number): boolean =>
      maze.inside(col, row) &&
      field.fog.isDiscovered(maze.centreOf(col, row).x, maze.centreOf(col, row).y);

    // Vertical edges: the wall to the left of each cell.
    for (let row = 0; row < maze.rows; row += 1) {
      for (let col = 0; col <= maze.cols; col += 1) {
        if (!maze.wallLeft(col, row)) continue;
        if (!seen(col, row) && !seen(col - 1, row)) continue;

        const x = maze.originX + col * maze.cellWidth;
        const y = maze.originY + row * maze.cellHeight;
        this.drawWallBar(g, x - half, y, thickness, maze.cellHeight);
      }
    }

    // Horizontal edges: the wall above each cell.
    for (let row = 0; row <= maze.rows; row += 1) {
      for (let col = 0; col < maze.cols; col += 1) {
        if (!maze.wallAbove(col, row)) continue;
        if (!seen(col, row) && !seen(col, row - 1)) continue;

        const x = maze.originX + col * maze.cellWidth;
        const y = maze.originY + row * maze.cellHeight;
        this.drawWallBar(g, x, y - half, maze.cellWidth, thickness);
      }
    }
  }

  private drawWallBar(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    // A soft dark halo so the edge does not read as a hard cut-out, and so the
    // boundary a route stops at is visible slightly before it is reached.
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(x - 3, y - 3, width + 6, height + 6, 8);

    g.fillStyle(COLORS.wall, 0.97);
    g.fillRoundedRect(x, y, width, height, 6);

    g.lineStyle(1.5, COLORS.wallThorn, 0.5);
    g.strokeRoundedRect(x, y, width, height, 6);
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
    this.wallGfx.destroy();
    this.surroundGfx.destroy();
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
