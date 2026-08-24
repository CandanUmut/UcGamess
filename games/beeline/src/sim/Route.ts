import { TUNING } from '../config/tuning.ts';
import {
  buildPolyline,
  sampleAt,
  truncateCoords,
  type Polyline,
  type SamplePoint,
} from './polyline.ts';
import type { Patch } from './Patch.ts';

const scratch: SamplePoint = { x: 0, y: 0, tx: 0, ty: 0 };

let nextRouteId = 1;

/**
 * A flight path from the hive to a patch, which decays from the far end backward.
 *
 * The decay direction is the single most important decision in the game. A
 * uniformly fading route would need a health bar to be legible and would cost
 * the same full gesture to restore no matter how early you caught it. Retreating
 * from the tip instead means:
 *
 *   - the route's remaining life *is* its visible length, so no UI is needed;
 *   - refreshing costs only the missing piece, so skilled play is less physical
 *     work rather than more;
 *   - the gesture is identical whether creating or refreshing;
 *   - long routes are structurally expensive, because retreat speed is constant
 *     in px/s while rebuild cost scales with length.
 */
export class Route {
  readonly id: number;

  poly: Polyline;
  /** Usable length. Shrinks from `poly.length` toward zero as the tip retreats. */
  liveLength: number;
  /** Seconds of grace left before the tip starts retreating. */
  holdRemaining: number;
  /** The patch this route was aimed at, if any. */
  target: Patch | null = null;
  /** Bees currently assigned. Maintained by Field. */
  beeCount = 0;
  /**
   * Simulation time at which the next bee may leave the hive on this route.
   *
   * Departures are spaced rather than simultaneous so the swarm forms a stream
   * instead of a travelling clump. Held per route, not per bee, because the
   * spacing has to be shared by everyone queueing for the same line.
   */
  nextDepartAt = 0;
  /** Set when the route dies, so Field can sweep it. */
  dead = false;

  constructor(coords: readonly number[], holdSeconds: number) {
    this.id = nextRouteId++;
    this.poly = buildPolyline(coords);
    this.liveLength = this.poly.length;
    this.holdRemaining = holdSeconds;
  }

  /** 0..1, how much of the drawn length is still alive. Used for the fade. */
  get vitality(): number {
    return this.poly.length > 0 ? this.liveLength / this.poly.length : 0;
  }

  /** True once decay has begun eating into the drawn length. */
  get isRetreating(): boolean {
    return this.holdRemaining <= 0;
  }

  tipX = 0;
  tipY = 0;

  /** Recomputes the cached live-end position. Called once per fixed step. */
  updateTip(): void {
    sampleAt(this.poly, this.liveLength, scratch);
    this.tipX = scratch.x;
    this.tipY = scratch.y;
  }

  step(dt: number): void {
    if (this.holdRemaining > 0) {
      this.holdRemaining -= dt;
    } else {
      this.liveLength -= TUNING.route.decaySpeed * dt;
    }

    if (this.liveLength <= TUNING.route.minLength) {
      this.liveLength = Math.max(this.liveLength, 0);
      this.dead = true;
    }

    this.updateTip();
  }

  /** Whether the live tip still reaches `target`, so bees can collect. */
  reachesTarget(): boolean {
    const patch = this.target;
    if (!patch || !patch.alive || patch.pool <= 0) return false;
    return (
      Math.hypot(patch.x - this.tipX, patch.y - this.tipY) <= TUNING.patch.reachRadius
    );
  }

  /**
   * Rebuilds the route as "everything still alive" + "what the player just drew".
   *
   * This is the refresh operation. The retained portion is truncated at exactly
   * `liveLength` so the join is seamless and the player's drag genuinely only
   * had to cover the retreated section.
   */
  extendWith(appended: readonly number[], holdSeconds: number): void {
    const kept = truncateCoords(this.poly, this.liveLength);
    const merged = kept.concat(appended as number[]);

    this.poly = buildPolyline(merged);
    this.liveLength = Math.min(this.poly.length, TUNING.route.maxLength);
    this.holdRemaining = holdSeconds;
    this.dead = false;
    this.updateTip();
  }

  /** Replaces the path entirely, at full length. */
  replaceWith(coords: readonly number[], holdSeconds: number): void {
    this.poly = buildPolyline(coords);
    this.liveLength = Math.min(this.poly.length, TUNING.route.maxLength);
    this.holdRemaining = holdSeconds;
    this.dead = false;
    this.updateTip();
  }

  /**
   * Recomputes arc lengths after the points have been moved in place.
   *
   * Wind bends stored points every frame, which changes the true length of the
   * path. Without this the cumulative table would describe the shape the player
   * originally drew, and bees would bunch or stretch as the line bowed.
   *
   * `liveLength` is scaled by the same ratio, so bending a route neither
   * revives nor kills it — the wind changes its *shape*, and decay alone
   * governs its life.
   */
  rebuildLengths(): void {
    const before = this.poly.length;
    const fraction = before > 0 ? this.liveLength / before : 1;

    const { pts, cum, count } = this.poly;
    let total = 0;
    for (let i = 1; i < count; i += 1) {
      const dx = (pts[i * 2] ?? 0) - (pts[(i - 1) * 2] ?? 0);
      const dy = (pts[i * 2 + 1] ?? 0) - (pts[(i - 1) * 2 + 1] ?? 0);
      total += Math.hypot(dx, dy);
      cum[i] = total;
    }

    this.poly.length = total;
    this.liveLength = Math.min(total, fraction * total);
    this.updateTip();
  }

  /** Position and tangent at arc distance `s`, written into `out`. */
  sample(s: number, out: SamplePoint): SamplePoint {
    return sampleAt(this.poly, s, out);
  }
}
