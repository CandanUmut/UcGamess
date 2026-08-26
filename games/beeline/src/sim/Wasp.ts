import { TUNING, type WaspKindTuning } from '../config/tuning.ts';

export type WaspState = 'approaching' | 'raiding' | 'fleeing' | 'gone';
export type WaspKind = 'raider' | 'drone' | 'hornet';

/**
 * A wasp, in one of three kinds.
 *
 * The previous one turned up alone, drifted to the hive, took a flat 140 honey
 * and died to five free bee hits. The playtest verdict — "no skill, no real
 * threat, and very boring, there is no fight" — was accurate on every count,
 * and each of them had a cause worth naming:
 *
 *  - **Alone.** One enemy cannot besiege a board. A wave can be triaged.
 *  - **Flat damage.** 140 honey is six percent of a day-ten quota and a
 *    rounding error by day fifteen, so ignoring it was correct play. Theft is
 *    now a share of the day's quota, so it stays a threat at any point.
 *  - **No fight.** Bees struck for free, so answering a raid was a button
 *    rather than a trade. Every kind now hits back, and a hornet costs real
 *    swarm to bring down.
 *
 * The three kinds ask different questions. Raiders go for the stores; drones
 * are fast, fragile and after the swarm, so they punish a slow reaction;
 * hornets are slow and expensive to leave alone but brutal to meet head-on.
 */
export class Wasp {
  x: number;
  y: number;
  prevX: number;
  prevY: number;

  readonly kind: WaspKind;
  readonly tuning: WaspKindTuning;

  state: WaspState = 'approaching';
  health: number;
  /** Where it came in, and where it leaves to. */
  readonly homeX: number;
  readonly homeY: number;

  /** Seconds left at the hive before it goes home of its own accord. */
  private raidLeft = TUNING.wasp.raidSeconds;
  /** Counts down to driving off the next bee. */
  private beeTimer: number;
  private wanderPhase = Math.random() * Math.PI * 2;

  constructor(x: number, y: number, kind: WaspKind = 'raider') {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.homeX = x;
    this.homeY = y;
    this.kind = kind;
    this.tuning = TUNING.wasp.kinds[kind];
    this.health = this.tuning.health;
    this.beeTimer = this.tuning.beeLossInterval;
  }

  get alive(): boolean {
    return this.state !== 'gone';
  }

  /** True while it is actually stealing, which is when the HUD should shout. */
  get isRaiding(): boolean {
    return this.state === 'raiding';
  }

  /** 0..1, for the damage arc. */
  get vitality(): number {
    return Math.max(0, this.health) / this.tuning.health;
  }

  /**
   * Honey this kind drains per second, given the day's quota.
   *
   * Derived rather than tuned so the threat scales with the run. See
   * `WaspKindTuning.stealShare`.
   */
  stealRate(quota: number): number {
    return (quota * this.tuning.stealShare) / TUNING.wasp.raidSeconds;
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

  /**
   * Whether the bee that just landed a hit is lost for the day.
   *
   * The trade that makes a defence a decision. A drone is nearly free to swat;
   * a hornet takes more than half the bees that touch it, so seven hits is a
   * real bite out of the swarm and "let this one through and cover the door
   * instead" is a live option rather than a failure.
   */
  strikesBack(random: () => number = Math.random): boolean {
    return random() < this.tuning.retaliation;
  }

  /** Flies toward a point at this kind's speed. The caller decides which point. */
  moveToward(x: number, y: number, dt: number): void {
    const dx = x - this.x;
    const dy = y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-3) return;
    const step = Math.min(this.tuning.speed * dt, dist);
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
    this.beeTimer = this.tuning.beeLossInterval;
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
      this.beeTimer += this.tuning.beeLossInterval;
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
   * shrinks the wasp's reach for a day.
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
