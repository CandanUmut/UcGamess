import type Phaser from 'phaser';
import { COLORS } from '../config/tuning.ts';
import type { Route } from '../sim/Route.ts';
import type { SamplePoint } from '../sim/polyline.ts';

const scratch: SamplePoint = { x: 0, y: 0, tx: 0, ty: 0 };

/** Arc distance between sampled points when stroking. */
/** How tight the wave along a line is, in radians per pixel. */
const WIGGLE_FREQUENCY = 0.035;
/** How fast it travels along the line. */
const WIGGLE_SPEED = 2.4;
/** How far it moves the line, in design units. Deliberately small. */
const WIGGLE_AMPLITUDE = 2.6;

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
      this.drawLive(route, time);
      this.drawTip(route, time, routeTint(route));
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

  private drawLive(route: Route, time: number): void {
    const live = route.liveLength;
    if (live < 2) return;

    const g = this.gfx;
    const bandLength = live / BANDS;

    // A worked path is visibly a road: thicker, brighter, and warmer than a
    // line drawn a moment ago. This is the only readout the strength system
    // gets, and it is enough — the same principle as decay, where the route's
    // health is its shape rather than a bar somewhere else on screen.
    const strength = route.strength;
    const widthGain = 1 + strength * 0.9;
    const alphaGain = strength * 0.08;
    // A line's colour says what it is for. Gathering lines keep the amber the
    // game has always used; a guard line is red because it is spending bees
    // rather than earning, and a sell line takes its buyer's own colour so the
    // depot at its end and the road to it are obviously one thing.
    //
    // This matters more than it sounds. With three jobs and five slots, "which
    // of my lines is doing what" is the question a player asks most often, and
    // answering it by colour costs no screen furniture at all.
    const base = routeTint(route);
    const colour = strength > 0.02 ? blend(base, 0xfff3c4, strength) : base;

    // A soft underlay beneath a mature road, so it reads as packed ground
    // rather than as a slightly fatter scribble.
    if (strength > 0.15) {
      g.lineStyle(11 * widthGain * 0.6, colour, 0.1 * strength);
      g.beginPath();
      let first = true;
      for (let s = 0; s <= live; s += SAMPLE_STEP * 2) {
        route.sample(s, scratch);
        wiggle(scratch, s, time, route.id);
        if (first) {
          g.moveTo(scratch.x, scratch.y);
          first = false;
        } else {
          g.lineTo(scratch.x, scratch.y);
        }
      }
      g.strokePath();
    }

    for (let band = 0; band < BANDS; band += 1) {
      const bandStart = band * bandLength;
      const bandEnd = bandStart + bandLength;

      // Brightest at the hive, faintest at the dissolving tip.
      const t = band / (BANDS - 1);
      const alpha = 0.92 - t * 0.5 + alphaGain;
      const width = (7 - t * 3.4) * widthGain;

      g.lineStyle(width, colour, alpha);
      g.beginPath();

      let first = true;
      for (let s = bandStart; s <= bandEnd; s += SAMPLE_STEP) {
        route.sample(s, scratch);
        wiggle(scratch, s, time, route.id);
        if (first) {
          g.moveTo(scratch.x, scratch.y);
          first = false;
        } else {
          g.lineTo(scratch.x, scratch.y);
        }
      }
      // Close the gap to the next band so the line has no visible seams.
      route.sample(Math.min(bandEnd + 0.5, live), scratch);
      wiggle(scratch, Math.min(bandEnd + 0.5, live), time, route.id);
      g.lineTo(scratch.x, scratch.y);
      g.strokePath();
    }
  }

  /**
   * The grab handle at the end of a line.
   *
   * The single most important piece of chrome in the game, and it used to be a
   * faint dot. Nothing told a player that the end of a line is a place they can
   * tap to carry it further, so most never found out — the mechanic existed and
   * was invisible. It is now a proper knob: a filled disc, a ring around it,
   * and three little spokes that turn slowly, which reads as "this is a
   * control" rather than "this is where the line happens to stop".
   */
  private drawTip(route: Route, time: number, tint: number): void {
    const g = this.gfx;
    const x = route.tipX;
    const y = route.tipY;

    // A gentle breath rather than an alarm. The handle is always available, so
    // it should invite rather than nag.
    const pulse = 0.9 + Math.sin(time * 2.2 + route.id) * 0.1;
    const r = 13 * pulse;

    g.fillStyle(0x2a2312, 0.28);
    g.fillCircle(x, y + 2, r + 3);

    g.fillStyle(tint, 0.95);
    g.fillCircle(x, y, r);
    g.lineStyle(3, 0xfff6d8, 0.9);
    g.strokeCircle(x, y, r + 4);

    // Slowly turning spokes, so the knob reads as a dial you can open.
    const spin = time * 0.9 + route.id;
    g.lineStyle(3, 0xfff6d8, 0.75);
    for (let i = 0; i < 3; i += 1) {
      const a = spin + (i / 3) * Math.PI * 2;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * (r + 7), y + Math.sin(a) * (r + 7));
      g.lineTo(x + Math.cos(a) * (r + 12), y + Math.sin(a) * (r + 12));
      g.strokePath();
    }
  }

  destroy(): void {
    this.gfx.destroy();
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

/**
 * A line's colour says where it goes.
 *
 * A shop's own colour for a sell line, the flower's own colour for a gathering
 * one. Five identical amber lines was the single biggest reason a busy board
 * was hard to read at a glance — and reading the board at a glance is most of
 * what playing well is.
 */
function routeTint(route: Route): number {
  if (route.targetBuyer) return route.targetBuyer.tuning.tint;
  if (route.target) return COLORS.species[route.target.species] ?? COLORS.route;
  return COLORS.route;
}

/**
 * Nudges a sampled point sideways on a slow travelling sine.
 *
 * The lines are bee trails, not cables, and a dead-straight segment is the one
 * thing on this board that never looks alive. The wave travels *along* the
 * route rather than shimmering in place, which reads as flow — the same
 * direction the bees are going — and it is small enough that it never changes
 * where the player believes the line is.
 *
 * Amplitude is fixed rather than scaled by length so a short stub wobbles as
 * much as a long road; a wave that grew with distance would make far lines
 * look unstable.
 */
function wiggle(
  point: { x: number; y: number; tx: number; ty: number },
  s: number,
  time: number,
  seed: number,
): void {
  const phase = s * WIGGLE_FREQUENCY - time * WIGGLE_SPEED + seed;
  const offset = Math.sin(phase) * WIGGLE_AMPLITUDE;
  point.x -= point.ty * offset;
  point.y += point.tx * offset;
}
