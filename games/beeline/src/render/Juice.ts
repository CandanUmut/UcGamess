import type Phaser from 'phaser';
import { COLORS } from '../config/tuning.ts';
import { TEX } from './textures.ts';

interface Pop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  tint: number;
  size: number;
}

const MAX_POPS = 220;

/**
 * Short-lived visual feedback: collection pops, scatter puffs, deposit sparks.
 *
 * The first playtest reported the game as "fine but flat" — the verb worked but
 * nothing acknowledged doing it well. These are the acknowledgements. Every one
 * is tied to something that actually happened in the simulation, so the screen
 * is never busier than the game is.
 *
 * A fixed pool of reused Images rather than tweened objects created on demand.
 * Hundreds of collections a day would otherwise mean hundreds of object
 * creations and tween allocations per second — exactly the garbage that shows
 * up as a frame-time spike on a phone. The pool never allocates after boot.
 *
 * Images rather than Blitter Bobs specifically because a pop has to shrink as
 * it fades, and a Bob supports alpha and tint but not scale. At a couple of
 * hundred objects the difference in draw cost is not measurable.
 */
export class Juice {
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly pops: Pop[] = [];
  private cursor = 0;

  constructor(scene: Phaser.Scene, depth: number) {
    for (let i = 0; i < MAX_POPS; i += 1) {
      const sprite = scene.add.image(0, 0, TEX.glow).setDepth(depth);
      sprite.setVisible(false);
      this.sprites.push(sprite);
      this.pops.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        tint: COLORS.bee,
        size: 1,
      });
    }
  }

  /** Nectar picked up: a small droplet lifting off the flower. */
  collect(x: number, y: number, amount: number): void {
    const count = amount >= 3 ? 3 : 1;
    for (let i = 0; i < count; i += 1) {
      this.spawn(
        x,
        y,
        (Math.random() - 0.5) * 60,
        -50 - Math.random() * 40,
        0.5,
        COLORS.beeLaden,
        0.3,
      );
    }
  }

  /** Honey banked at the hive. */
  deposit(x: number, y: number): void {
    this.spawn(x, y, (Math.random() - 0.5) * 40, -70, 0.42, COLORS.hive, 0.36);
  }

  /** A bee driven off by a wasp. */
  scatter(x: number, y: number): void {
    for (let i = 0; i < 3; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      this.spawn(
        x,
        y,
        Math.cos(angle) * 110,
        Math.sin(angle) * 110,
        0.32,
        0xff7043,
        0.26,
      );
    }
  }

  /** Sparkle along a freshly drawn route. */
  trail(x: number, y: number): void {
    this.spawn(
      x,
      y,
      (Math.random() - 0.5) * 30,
      (Math.random() - 0.5) * 30,
      0.35,
      COLORS.route,
      0.22,
    );
  }

  private spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    tint: number,
    size: number,
  ): void {
    // Ring buffer: the oldest pop is overwritten rather than dropping the new
    // one, so a burst always shows something.
    const pop = this.pops[this.cursor];
    if (!pop) return;
    this.cursor = (this.cursor + 1) % MAX_POPS;

    pop.x = x;
    pop.y = y;
    pop.vx = vx;
    pop.vy = vy;
    pop.life = life;
    pop.maxLife = life;
    pop.tint = tint;
    pop.size = size;
  }

  /** Advances and redraws. Uses real frame delta — these are visuals only. */
  update(deltaSeconds: number): void {
    for (let i = 0; i < MAX_POPS; i += 1) {
      const pop = this.pops[i];
      const sprite = this.sprites[i];
      if (!pop || !sprite) continue;

      if (pop.life <= 0) {
        if (sprite.visible) sprite.setVisible(false);
        continue;
      }

      pop.life -= deltaSeconds;
      pop.x += pop.vx * deltaSeconds;
      pop.y += pop.vy * deltaSeconds;
      pop.vy += 120 * deltaSeconds; // a little gravity so pops arc rather than drift

      const t = Math.max(0, pop.life / pop.maxLife);

      sprite.setVisible(true);
      sprite.setPosition(pop.x, pop.y);
      sprite.setTint(pop.tint);
      sprite.setAlpha(t);
      sprite.setScale(pop.size * (0.4 + t * 0.6));
    }
  }

  destroy(): void {
    for (const sprite of this.sprites) sprite.destroy();
  }
}
