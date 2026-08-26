import { TUNING } from '../config/tuning.ts';
import {
  buildPolyline,
  sampleAt,
  truncateCoords,
  type Polyline,
  type SamplePoint,
} from './polyline.ts';
import type { Patch } from './Patch.ts';
import type { Wasp } from './Wasp.ts';
import type { Buyer } from './Buyer.ts';

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
  /**
   * The wasp this route was aimed at, if any.
   *
   * A route has one job or the other, never both: bees flying it either bring
   * nectar home or go and fight. That exclusivity *is* the cost of defending —
   * every line you point at a wasp is a line that stopped earning.
   */
  targetWasp: Wasp | null = null;
  /**
   * Whether this line is a guard line: its bees fight instead of foraging.
   *
   * Set when a drag lands on a wasp and never cleared while the route lives,
   * which is the whole point. The wasp it was aimed at will be dead or gone in
   * seconds, but the *line* stays where the player put it, and every wasp that
   * passes within reach of a bee on it gets hit.
   *
   * That is where the skill went. A wave crosses the maze through corridors,
   * so a line laid across the corridor they must use is worth several lines
   * laid on top of individual wasps — and reading the board for that corridor
   * is a real decision made under a real clock.
   */
  guard = false;
  /**
   * How long this guard line has had nothing to fight.
   *
   * A guard line that has done its job is dead weight: its bees carry no
   * pollen, and it holds one of the five slots. The playtest was blunt about
   * it — "those wasps are gone but I have to delete the red line because those
   * bees cannot carry polens". Making the player tidy up after a fight they
   * just won is the game asking for chores.
   */
  guardIdleFor = 0;
  /**
   * The buyer this line sells to, if it is a sell line.
   *
   * A route now has exactly one job: gather from a flower, hold a corridor
   * against wasps, or carry honey to a buyer. Keeping them exclusive is what
   * makes the five route slots the real budget of the game — every line spent
   * on selling is a line not gathering, and a hive that is filling up while you
   * decide is the clock on that choice.
   */
  targetBuyer: Buyer | null = null;
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
   * Re-lays the live path along `coords`, which is the same road slid clear of
   * a wall it had come to touch.
   *
   * `liveLength` is carried over **as an absolute number**, not as a fraction.
   * That single choice is what keeps walls a real pressure now that they no
   * longer sever anything: sliding along a wall is a longer trip than cutting
   * the corner would have been, so holding the live length fixed means the tip
   * pulls back by exactly the detour the wall imposed. A route pushed into a
   * wall visibly loses reach, and the fix is the ordinary refresh gesture.
   *
   * Strength survives untouched. Being pressed against a wall is the board
   * moving, not the swarm forgetting the road, and charging a road's hard-won
   * strength for it would punish exactly the long-lived routes that strength
   * exists to reward.
   */
  deflectTo(coords: readonly number[]): void {
    const live = this.liveLength;

    this.poly = buildPolyline(coords);
    this.liveLength = Math.min(live, this.poly.length);

    if (this.liveLength <= TUNING.route.minLength) {
      this.liveLength = Math.max(this.liveLength, 0);
      this.dead = true;
    }

    this.updateTip();
  }

  /**
   * Whether the live tip still reaches `targetBuyer`, so bees can trade.
   *
   * Measured from the **tip**, not from the bee. A bee eases toward its sample
   * point rather than snapping to it, so it is always a little behind the line
   * it is flying; testing the bee's own position meant a sell line that plainly
   * touched the buyer paid nothing, which is the most confusing failure this
   * game has available to it.
   */
  reachesBuyer(): boolean {
    const buyer = this.targetBuyer;
    if (!buyer) return false;
    return (
      Math.hypot(buyer.x - this.tipX, buyer.y - this.tipY) <= TUNING.honey.reachRadius
    );
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
