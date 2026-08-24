import type Phaser from 'phaser';
import { COLORS } from '../config/tuning.ts';
import type { Bee } from '../sim/Bee.ts';
import { TEX } from './textures.ts';

export type RendererMode = 'blitter' | 'sprite';

/**
 * Draws the swarm.
 *
 * Two implementations behind one interface, switchable at runtime, because the
 * brief asks whether individual sprites can hold 60fps with 300+ agents and the
 * only honest way to answer that is to measure both on the same board.
 *
 *   sprite  — a full GameObject per bee. Supports rotation and per-bee scale,
 *             which Stage 4's teardrop art will want. More per-frame overhead.
 *   blitter — lightweight Bobs sharing one texture and one draw call. No
 *             rotation, which is free to give up while a bee is a dot.
 *
 * Both are fed interpolated positions, never raw simulation positions.
 */
export interface BeeRenderer {
  readonly mode: RendererMode;
  sync(bees: readonly Bee[], alpha: number): void;
  resize(count: number): void;
  destroy(): void;
}

const BEE_SCALE = 0.62;
const LADEN_SCALE = 0.82;

class BlitterBeeRenderer implements BeeRenderer {
  readonly mode: RendererMode = 'blitter';
  private readonly blitter: Phaser.GameObjects.Blitter;
  private bobs: Phaser.GameObjects.Bob[] = [];

  constructor(scene: Phaser.Scene, depth: number) {
    this.blitter = scene.add.blitter(0, 0, TEX.bee);
    this.blitter.setDepth(depth);
  }

  resize(count: number): void {
    while (this.bobs.length > count) {
      const bob = this.bobs.pop();
      bob?.destroy();
    }
    while (this.bobs.length < count) {
      const bob = this.blitter.create(0, 0);
      this.bobs.push(bob);
    }
  }

  sync(bees: readonly Bee[], alpha: number): void {
    if (this.bobs.length !== bees.length) this.resize(bees.length);

    for (let i = 0; i < bees.length; i += 1) {
      const bee = bees[i];
      const bob = this.bobs[i];
      if (!bee || !bob) continue;

      // Bobs are positioned by their top-left corner, so offset by half the
      // 16px texture to keep the dot centred on the simulated point.
      bob.x = bee.prevX + (bee.x - bee.prevX) * alpha - 8;
      bob.y = bee.prevY + (bee.y - bee.prevY) * alpha - 8;
      bob.tint = bee.carrying > 0 ? COLORS.beeLaden : COLORS.bee;
    }
  }

  destroy(): void {
    this.blitter.destroy();
    this.bobs = [];
  }
}

class SpriteBeeRenderer implements BeeRenderer {
  readonly mode: RendererMode = 'sprite';
  private readonly scene: Phaser.Scene;
  private readonly depth: number;
  private sprites: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.depth = depth;
  }

  resize(count: number): void {
    while (this.sprites.length > count) {
      const sprite = this.sprites.pop();
      sprite?.destroy();
    }
    while (this.sprites.length < count) {
      const sprite = this.scene.add.image(0, 0, TEX.bee);
      sprite.setDepth(this.depth);
      this.sprites.push(sprite);
    }
  }

  sync(bees: readonly Bee[], alpha: number): void {
    if (this.sprites.length !== bees.length) this.resize(bees.length);

    for (let i = 0; i < bees.length; i += 1) {
      const bee = bees[i];
      const sprite = this.sprites[i];
      if (!bee || !sprite) continue;

      const x = bee.prevX + (bee.x - bee.prevX) * alpha;
      const y = bee.prevY + (bee.y - bee.prevY) * alpha;
      sprite.setPosition(x, y);

      const laden = bee.carrying > 0;
      sprite.setTint(laden ? COLORS.beeLaden : COLORS.bee);
      sprite.setScale(laden ? LADEN_SCALE : BEE_SCALE);

      // Point along travel direction. Free here, unavailable on a Bob, and the
      // reason this path exists at all once bees stop being dots.
      const dx = bee.x - bee.prevX;
      const dy = bee.y - bee.prevY;
      if (dx * dx + dy * dy > 0.01) sprite.setRotation(Math.atan2(dy, dx));
    }
  }

  destroy(): void {
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites = [];
  }
}

export function createBeeRenderer(
  scene: Phaser.Scene,
  mode: RendererMode,
  depth: number,
): BeeRenderer {
  return mode === 'blitter'
    ? new BlitterBeeRenderer(scene, depth)
    : new SpriteBeeRenderer(scene, depth);
}
