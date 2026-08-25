import { TUNING } from '../config/tuning.ts';

export type WaspState = 'approaching' | 'raiding' | 'fleeing' | 'gone';

/**
 * A wasp, which now comes for the hive rather than loitering near it.
 *
 * The old wasp drifted between random points and scattered the occasional bee,
 * which the playtest summed up as "the wasps also don't do almost anything".
 * It was right: a hazard you route around once is a slightly smaller board, not
 * an enemy. This one has somewhere to be.
 *
 *   - **approaching** — crossing the maze toward the hive. It has to use the
 *     corridors like everything else, which is what turns a dense day from
 *     purely a cost into a wall the wasps also have to get through. Bees it
 *     passes on the way are still scattered, so distance stays dangerous.
 *   - **raiding** — at the hive, draining honey by the second and driving bees
 *     out of the day's swarm. This is the part that has to hurt.
 *   - **fleeing** — leaving, having been beaten off or having taken its fill.
 *
 * Health, and therefore the fact that it can be beaten off at all, is the
 * counterpart to the defence gesture: drawing a line at a wasp sends bees to
 * fight it. A hazard you can only endure is weather; a hazard you can answer is
 * a decision, because the bees you send are bees that are not carrying nectar.
 */
export class Wasp {
  x: number;
  y: number;
  prevX: number;
  prevY: number;

  state: WaspState = 'approaching';
  health = TUNING.wasp.health;
  /** Where it came in, and where it leaves to. */
  readonly homeX: number;
  readonly homeY: number;

  /** Seconds left at the hive before it goes home of its own accord. */
  private raidLeft = TUNING.wasp.raidSeconds;
  /** Counts down to driving off the next bee. */
  private beeTimer = TUNING.wasp.beeLossInterval;
  private wanderPhase = Math.random() * Math.PI * 2;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.homeX = x;
    this.homeY = y;
  }

  get alive(): boolean {
    return this.state !== 'gone';
  }

  /** True while it is actually stealing, which is when the HUD should shout. */
  get isRaiding(): boolean {
    return this.state === 'raiding';
  }

  /** 0..1, for the damage pips. */
  get vitality(): number {
    return Math.max(0, this.health) / TUNING.wasp.health;
  }

  /**
   * Takes a hit from a bee. Returns true when that was the last one.
   *
   * A downed wasp is not removed on the spot — it flees, visibly, back the way
   * it came. Enemies that blink out of existence make a defence feel like a
   * counter ticking down; one that turns and runs makes it feel won.
   */
  hit(damage: number): boolean {
    if (this.state === 'fleeing' || this.state === 'gone') return false;
    this.health -= damage;
    if (this.health > 0) return false;
    this.health = 0;
    this.state = 'fleeing';
    return true;
  }

  /** Flies toward a point at wasp speed. The caller decides which point. */
  moveToward(x: number, y: number, dt: number): void {
    const dx = x - this.x;
    const dy = y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-3) return;
    const step = Math.min(TUNING.wasp.speed * dt, dist);
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
  }

  beginStep(): void {
    this.prevX = this.x;
    this.prevY = this.y;
  }

  /** Circles the hive while it robs it, so the raid reads as an event. */
  hover(cx: number, cy: number, dt: number): void {
    this.wanderPhase += dt * 1.7;
    const radius = 54;
    const targetX = cx + Math.cos(this.wanderPhase) * radius;
    const targetY = cy + Math.sin(this.wanderPhase * 1.2) * radius * 0.6;
    this.x += (targetX - this.x) * 0.12;
    this.y += (targetY - this.y) * 0.12;
  }

  /** Marks arrival at the hive. */
  beginRaid(): void {
    this.state = 'raiding';
    this.raidLeft = TUNING.wasp.raidSeconds;
    this.beeTimer = TUNING.wasp.beeLossInterval;
  }

  /**
   * Advances the raid timer. Returns how many bees it drove off this step.
   *
   * Returns a count rather than a boolean so a very long fixed step can never
   * silently swallow a loss — the same reason every other timer in the sim
   * loops rather than resets.
   */
  tickRaid(dt: number): number {
    this.raidLeft -= dt;
    this.beeTimer -= dt;

    let taken = 0;
    while (this.beeTimer <= 0) {
      this.beeTimer += TUNING.wasp.beeLossInterval;
      taken += 1;
    }

    if (this.raidLeft <= 0) this.state = 'fleeing';
    return taken;
  }

  /**
   * Whether a point is close enough to be scattered, given hive safety.
   *
   * Only an approaching wasp threatens the field: once it is at the hive it is
   * busy robbing the place, and a raid that also sterilised every route would
   * leave the player nothing to do but watch.
   *
   * The two multipliers are how a Smoke Pot works — it widens the safe zone and
   * shrinks the wasp's reach for a day. Applying it here rather than mutating
   * TUNING keeps the tuning table a constant and the provision a parameter.
   */
  threatens(
    x: number,
    y: number,
    hiveX: number,
    hiveY: number,
    interceptMultiplier = 1,
    safeRadiusMultiplier = 1,
  ): boolean {
    if (this.state !== 'approaching') return false;
    const safe = TUNING.wasp.safeRadius * safeRadiusMultiplier;
    if (Math.hypot(x - hiveX, y - hiveY) <= safe) return false;
    return (
      Math.hypot(x - this.x, y - this.y) <=
      TUNING.wasp.interceptRadius * interceptMultiplier
    );
  }
}
