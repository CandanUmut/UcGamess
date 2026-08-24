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

  /**
   * How beaten-in this path is, 0..1. Earned by traffic, lost by neglect.
   *
   * This is the thing the player builds rather than spends. A line the swarm
   * has actually worked stops behaving like a scribble and starts behaving like
   * a road: it retreats slowly, it barely bends in the wind, and bees fly it
   * faster. Without it every route is disposable and redrawing is a chore
   * rather than a choice — which is precisely why the game read as a toy.
   */
  strength = 0;

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

  /** Retreat speed right now, after the road's own resistance. */
  get decaySpeed(): number {
    return (
      TUNING.route.decaySpeed * (1 - this.strength * TUNING.route.strengthDecayResist)
    );
  }

  /** Multiplier on the speed of a bee flying this route. */
  get speedMultiplier(): number {
    return 1 + this.strength * TUNING.route.strengthSpeedBonus;
  }

  /** How much of the wind's sideways push this route actually takes. */
  get windExposure(): number {
    return 1 - this.strength * TUNING.route.strengthWindResist;
  }

  /** Records a delivery made along this route. */
  reinforce(): void {
    this.strength = Math.min(1, this.strength + TUNING.route.strengthPerDelivery);
  }

  step(dt: number): void {
    // Neglect undoes the road, **proportionally**.
    //
    // Subtracting a flat amount per second looks equivalent and is not: with
    // both gain and loss constant, a route whose traffic beats the decay climbs
    // to full and one whose traffic does not falls to nothing, with no stable
    // value in between. Strength would have been a hidden boolean.
    //
    // Decaying a fraction of what is there gives a real equilibrium at
    // `deliveriesPerSecond x strengthPerDelivery / strengthDecayPerSecond`, so
    // a thinly-fed line genuinely sits at a third of a road and a well-fed one
    // genuinely sits at full.
    this.strength = Math.max(
      0,
      this.strength - this.strength * TUNING.route.strengthDecayPerSecond * dt,
    );

    if (this.holdRemaining > 0) {
      this.holdRemaining -= dt;
    } else {
      this.liveLength -= this.decaySpeed * dt;
    }

    if (this.liveLength <= TUNING.route.minLength) {
      this.liveLength = Math.max(this.liveLength, 0);
      this.dead = true;
    }

    this.updateTip();
  }

  /**
   * Severs the route at arc distance `s`, discarding everything beyond it.
   *
   * Unlike decay, this shortens the *drawn* path as well as the live length.
   * That distinction matters: decay leaves a ghost showing where the route used
   * to reach, which is the refresh target. A cut is not something to refresh
   * back into — the thorns are still there — so leaving a ghost pointing
   * straight through a thicket would be an invitation to redraw the same
   * mistake.
   */
  cutAt(s: number): void {
    const limit = Math.max(0, Math.min(s, this.poly.length));
    this.poly = buildPolyline(truncateCoords(this.poly, limit));
    this.liveLength = Math.min(this.liveLength, this.poly.length);

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
   * Rebuilds the route as "everything still alive" + "what the player just
   * drew", keeping the road's strength intact.
   *
   * Extending is maintenance, so it costs nothing. That is the whole reason the
   * refresh gesture is now worth finding: it is not merely a shorter drag, it
   * is the one that does not throw away what the swarm has built.
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

  /**
   * Replaces the path entirely, at full length, at the cost of half the road.
   *
   * Starting over is not free. The line is new ground even where it happens to
   * lie on top of the old one, and charging for it is what makes "refresh from
   * the tip" a decision rather than a tip for the manual nobody reads.
   */
  replaceWith(coords: readonly number[], holdSeconds: number): void {
    this.strength *= TUNING.route.strengthKeptOnRedraw;
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
