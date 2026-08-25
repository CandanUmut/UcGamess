import type Phaser from 'phaser';
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
 *   sprite  — a full GameObject per bee. Supports rotation and per-bee scale.
 *             This is the shipping path now that a bee is a bee: an insect that
 *             cannot turn to face where it is flying reads as debris.
 *   blitter — lightweight Bobs sharing one texture and one draw call. No
 *             rotation, which was free to give up while a bee was a dot and is
 *             not any more. Kept because it is still the honest way to measure
 *             what the sprite path costs on the same board.
 *
 * Both are fed interpolated positions, never raw simulation positions.
 */
export interface BeeRenderer {
  readonly mode: RendererMode;
  sync(bees: readonly Bee[], alpha: number): void;
  resize(count: number): void;
  destroy(): void;
}

/**
 * Scales against the 96x83 shipped bee, whose *width* is nose to tail.
 *
 * ~25px long on a 1280x720 board. Bigger turns a three-hundred-strong swarm
 * into a carpet; smaller and the stripes and the face stop resolving, which is
 * most of what makes this bee that bee rather than a speck.
 */
const BEE_SCALE = 0.26;
const LADEN_SCALE = 0.31;

/**
 * Hard limit on how far a bee leans, in radians (~28 degrees).
 *
 * The sprite is a profile view, so "rotation" here is a lean, not a heading.
 * Past roughly this much it stops reading as a bee climbing and starts reading
 * as a bee falling over.
 */
const MAX_TILT = 0.5;

/**
 * State is a *multiply over* the bee, not a repaint of it.
 *
 * The bee texture is full colour now, so `setTint` no longer picks the bee's
 * colour — it filters it. White therefore means "an ordinary bee, shown as
 * drawn", and the other two shift its warmth without destroying the stripes
 * that make it read as an insect at twenty pixels.
 */
const NORMAL_TINT = 0xffffff;
/** Warm and bright: a bee carrying nectar home. */
const LADEN_TINT = 0xffd98a;
/** Cool and pale, so a wave of builders reads as distinct from foraging. */
const BUILDER_TINT = 0xb9dcf5;

/**
 * The texture for the swarm.
 *
 * Prefers the shipped honeybee and falls back to the generated one, so a
 * dropped request costs detail rather than turning every bee into the green box
 * Phaser draws for a missing texture.
 */
function beeTextureKey(scene: Phaser.Scene): string {
  return scene.textures.exists(TEX.bee) ? TEX.bee : TEX.beeDrawn;
}

function tintFor(state: string, carrying: number): number {
  if (state === 'building') return BUILDER_TINT;
  return carrying > 0 ? LADEN_TINT : NORMAL_TINT;
}

class BlitterBeeRenderer implements BeeRenderer {
  readonly mode: RendererMode = 'blitter';
  private readonly blitter: Phaser.GameObjects.Blitter;
  private bobs: Phaser.GameObjects.Bob[] = [];

  constructor(scene: Phaser.Scene, depth: number) {
    this.blitter = scene.add.blitter(0, 0, beeTextureKey(scene));
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
      // Builders are tinted apart so the cost of a draw is visible: a burst of
      // pale bees streaming out means the swarm is opening a line, not earning.
      bob.tint = tintFor(bee.state, bee.carrying);
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
  private readonly texture: string;
  private sprites: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.depth = depth;
    this.texture = beeTextureKey(scene);
  }

  resize(count: number): void {
    while (this.sprites.length > count) {
      const sprite = this.sprites.pop();
      sprite?.destroy();
    }
    while (this.sprites.length < count) {
      const sprite = this.scene.add.image(0, 0, this.texture);
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
      sprite.setTint(tintFor(bee.state, bee.carrying));
      sprite.setScale(laden ? LADEN_SCALE : BEE_SCALE);

      // Face the way it is flying — flipped, not spun.
      //
      // The bee is drawn in profile, with a definite up: wings on top, legs
      // underneath, face the right way round. Rotating such a sprite by its
      // full heading looks correct going right and puts the bee on its back
      // going left, which is exactly what half a swarm does on every return
      // trip. Mirroring instead keeps it the right way up at every heading.
      //
      // The residual tilt comes from the vertical component alone and is
      // clamped well short of vertical, so a bee leans into a climb without the
      // lean ever becoming a flip. Its sign follows the mirror, or a
      // left-flying bee would tilt its nose up while descending.
      const dx = bee.x - bee.prevX;
      const dy = bee.y - bee.prevY;
      if (dx * dx + dy * dy > 0.01) {
        const facingLeft = dx < 0;
        sprite.setFlipX(facingLeft);
        const tilt = Math.atan2(dy, Math.abs(dx));
        const clamped = Math.max(-MAX_TILT, Math.min(MAX_TILT, tilt));
        sprite.setRotation(facingLeft ? -clamped : clamped);
      }
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
