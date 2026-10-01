import type Phaser from 'phaser';
import type { Field } from '../sim/Field.ts';
import { TEX } from './textures.ts';
import { RouteRenderer } from './RouteRenderer.ts';

const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const RIVAL_RED = 0xe5533d;

/**
 * The wasp colony: its nest, its red lines and its foragers.
 *
 * Drawn from the rival's own field, which shares the player's flowers. The
 * nest carries the rival's jar as a number, so a glance across the board
 * says how close the race is.
 */
export class RivalRenderer {
  private readonly scene: Phaser.Scene;
  private readonly routes: RouteRenderer;
  private readonly beeDepth: number;
  private nest: Phaser.GameObjects.Image | null = null;
  private ring: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private wasps: Phaser.GameObjects.Image[] = [];

  constructor(
    scene: Phaser.Scene,
    routeDepth: number,
    beeDepth: number,
    labelDepth: number,
  ) {
    this.scene = scene;
    this.routes = new RouteRenderer(scene, routeDepth);
    this.routes.tint = RIVAL_RED;
    this.routes.showGhosts = false;
    this.beeDepth = beeDepth;
    this.ring = scene.add.graphics().setDepth(routeDepth - 1);
    this.label = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#ff9b85',
        stroke: '#1d160c',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(labelDepth)
      .setVisible(false);
  }

  /** Puts the nest on the board, or takes it away (null). */
  setNest(at: { x: number; y: number } | null): void {
    this.nest?.destroy();
    this.nest = null;
    this.ring.clear();
    this.label.setVisible(at !== null);
    if (!at) {
      for (const w of this.wasps) w.setVisible(false);
      this.routes.draw([], 0);
      return;
    }
    const key = this.scene.textures.exists(TEX.hive) ? TEX.hive : TEX.glow;
    this.nest = this.scene.add
      .image(at.x, at.y, key)
      .setDisplaySize(96, 96)
      .setTint(0xff7f66)
      .setDepth(this.beeDepth - 1);
    this.ring.fillStyle(RIVAL_RED, 0.22);
    this.ring.fillCircle(at.x, at.y, 62);
    this.ring.lineStyle(4, RIVAL_RED, 0.9);
    this.ring.strokeCircle(at.x, at.y, 62);
    this.label.setPosition(at.x, at.y - 78);
  }

  draw(field: Field | null, goal: number, alpha: number): void {
    if (!field) return;
    this.routes.draw(field.routes, field.time);
    this.label.setText(`Wasps ${Math.floor(field.honey)}/${goal}`);

    const key = this.scene.textures.exists(TEX.wasp) ? TEX.wasp : TEX.beeDrawn;
    const bees = field.bees;
    while (this.wasps.length < bees.length) {
      this.wasps.push(
        this.scene.add.image(0, 0, key).setDepth(this.beeDepth).setTint(0xff6a55),
      );
    }
    for (let i = 0; i < this.wasps.length; i += 1) {
      const sprite = this.wasps[i];
      const bee = bees[i];
      if (!sprite) continue;
      if (!bee) {
        sprite.setVisible(false);
        continue;
      }
      const x = bee.prevX + (bee.x - bee.prevX) * alpha;
      const y = bee.prevY + (bee.y - bee.prevY) * alpha;
      sprite
        .setVisible(true)
        .setPosition(x, y)
        .setDisplaySize(bee.carrying > 0 ? 24 : 21, bee.carrying > 0 ? 15 : 13)
        .setFlipX(bee.x - bee.prevX < 0);
    }
  }
}
