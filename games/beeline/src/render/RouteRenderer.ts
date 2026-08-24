import type Phaser from 'phaser';
import { COLORS, TUNING } from '../config/tuning.ts';
import type { Route } from '../sim/Route.ts';
import type { SamplePoint } from '../sim/polyline.ts';

const scratch: SamplePoint = { x: 0, y: 0, tx: 0, ty: 0 };

/** Arc distance between sampled points when stroking. */
const SAMPLE_STEP = 10;

/**
 * How many constant-alpha bands each route is stroked in.
 *
 * Stroking every segment at its own alpha would mean ~280 separate
 * lineStyle/beginPath/strokePath cycles per frame. Ten bands per route gives a
 * gradient the eye reads as smooth for a twentieth of the draw calls.
 */
const BANDS = 10;

/**
 * Draws routes so their remaining life is readable without any UI.
 *
 * Three things are on screen at once:
 *
 *   - the **live path**, brightest and thickest at the hive, fading toward the
 *     tip — so the eye is drawn to the end that is dissolving;
 *   - the **ghost**, a faint trace of the length already lost, which is the
 *     player's target when refreshing: it shows exactly where the route used to
 *     reach and therefore how far the drag needs to go;
 *   - the **tip handle**, a small pulsing dot marking where a refresh drag has
 *     to start.
 *
 * The ghost is the one to watch in playtesting. It is a genuine affordance, but
 * with five decaying routes it may read as clutter. `G` toggles it.
 */
export class RouteRenderer {
  private readonly gfx: Phaser.GameObjects.Graphics;
  showGhosts = true;

  constructor(scene: Phaser.Scene, depth: number) {
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(depth);
  }

  draw(routes: readonly Route[], time: number): void {
    const g = this.gfx;
    g.clear();

    for (const route of routes) {
      if (this.showGhosts) this.drawGhost(route);
      this.drawLive(route);
      this.drawTip(route, time);
    }
  }

  /** The section already lost to decay, drawn faintly as a refresh target. */
  private drawGhost(route: Route): void {
    const from = route.liveLength;
    const to = route.poly.length;
    if (to - from < SAMPLE_STEP) return;

    const g = this.gfx;
    g.lineStyle(2, COLORS.route, 0.1);
    g.beginPath();

    let first = true;
    for (let s = from; s <= to; s += SAMPLE_STEP * 2) {
      route.sample(s, scratch);
      if (first) {
        g.moveTo(scratch.x, scratch.y);
        first = false;
      } else {
        g.lineTo(scratch.x, scratch.y);
      }
    }
    g.strokePath();
  }

  private drawLive(route: Route): void {
    const live = route.liveLength;
    if (live < 2) return;

    const g = this.gfx;
    const bandLength = live / BANDS;

    for (let band = 0; band < BANDS; band += 1) {
      const bandStart = band * bandLength;
      const bandEnd = bandStart + bandLength;

      // Brightest at the hive, faintest at the dissolving tip.
      const t = band / (BANDS - 1);
      const alpha = 0.92 - t * 0.5;
      const width = 7 - t * 3.4;

      g.lineStyle(width, COLORS.route, alpha);
      g.beginPath();

      let first = true;
      for (let s = bandStart; s <= bandEnd; s += SAMPLE_STEP) {
        route.sample(s, scratch);
        if (first) {
          g.moveTo(scratch.x, scratch.y);
          first = false;
        } else {
          g.lineTo(scratch.x, scratch.y);
        }
      }
      // Close the gap to the next band so the line has no visible seams.
      route.sample(Math.min(bandEnd + 0.5, live), scratch);
      g.lineTo(scratch.x, scratch.y);
      g.strokePath();
    }
  }

  /** The grab handle: where a refresh drag must start. */
  private drawTip(route: Route, time: number): void {
    const g = this.gfx;

    // Pulses only once decay has actually begun, so a freshly drawn route is
    // calm and a retreating one asks for attention.
    const urgency = route.isRetreating ? 1 : 0.25;
    const pulse = 0.7 + Math.sin(time * 6) * 0.3 * urgency;
    const radius = TUNING.route.refreshSnapRadius * 0.11 * pulse;

    g.fillStyle(COLORS.route, 0.08 * urgency + 0.03);
    g.fillCircle(route.tipX, route.tipY, radius * 2.2);

    g.fillStyle(COLORS.route, 0.85);
    g.fillCircle(route.tipX, route.tipY, radius * 0.75);
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
