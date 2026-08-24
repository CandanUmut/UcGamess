import { TUNING } from '../config/tuning.ts';

let nextPatchId = 1;

export type PatchKind = 'normal' | 'rich' | 'night';

/** A flower patch. Drains as bees work it, wilts when empty, reblooms elsewhere. */
export class Patch {
  readonly id: number;
  x: number;
  y: number;
  pool: number;
  maxPool: number;
  kind: PatchKind;
  alive = true;
  /**
   * Whether the player has ever seen this flower.
   *
   * An undiscovered flower is not drawn, is not labelled, and cannot be aimed
   * at — it genuinely does not exist to the player until a bee finds it.
   */
  discovered = false;
  /** Drives the bloom-in and wilt-out animations. 0..1. */
  bloomT = 0;
  /**
   * Seconds left before a night-bloom patch closes regardless of its pool.
   * Infinity for patches that do not expire.
   */
  windowRemaining = Number.POSITIVE_INFINITY;

  constructor(x: number, y: number, pool: number, kind: PatchKind = 'normal') {
    this.id = nextPatchId++;
    this.x = x;
    this.y = y;
    this.pool = pool;
    this.maxPool = pool;
    this.kind = kind;
    if (kind === 'night') this.windowRemaining = TUNING.patch.nightBloomWindowSeconds;
  }

  /**
   * How much more this flower pays for being far from the hive, 1..3.
   *
   * Set by `Field` when the flower is placed, because distance needs the hive
   * and a Patch does not know where that is.
   *
   * The arithmetic behind it is the point. A round trip is 2L/speed, so a
   * flower three times further away takes three times as long to work and pays
   * three times per trip — **the same honey per second**. What actually differs
   * is that the same pool lasts three times longer. A far flower is therefore
   * not a better flower, it is a longer-lived one that costs more to reach and
   * more to hold; a near flower is the fallback that runs dry fast. That is a
   * decision, where "distance is simply worse" was not.
   */
  distanceMultiplier = 1;

  /** Honey per bee-trip from this patch. */
  get yieldPerTrip(): number {
    return this.kindMultiplier * this.distanceMultiplier;
  }

  private get kindMultiplier(): number {
    switch (this.kind) {
      case 'rich':
        return TUNING.patch.richYieldMultiplier;
      case 'night':
        return TUNING.patch.nightBloomMultiplier;
      default:
        return 1;
    }
  }

  /**
   * Honey actually left in this flower.
   *
   * The number worth putting on screen. Pool alone stopped meaning anything the
   * moment flowers started paying different rates — two flowers reading "180"
   * can be worth 180 and 540 — and asking the player to multiply two figures in
   * their head mid-drag is not a decision, it is arithmetic.
   */
  get honeyLeft(): number {
    return this.pool * this.yieldPerTrip;
  }

  get fullness(): number {
    return this.maxPool > 0 ? this.pool / this.maxPool : 0;
  }

  /** Fraction of the night-bloom window left, or 1 for ordinary patches. */
  get windowFraction(): number {
    if (!Number.isFinite(this.windowRemaining)) return 1;
    return Math.max(0, this.windowRemaining / TUNING.patch.nightBloomWindowSeconds);
  }

  /** Removes up to `amount` nectar. Returns honey earned, after the kind bonus. */
  drain(amount: number): number {
    const taken = Math.min(amount, this.pool);
    this.pool -= taken;
    if (this.pool <= 0) this.wilt();
    return taken * this.yieldPerTrip;
  }

  private wilt(): void {
    this.alive = false;
  }

  /**
   * Dry is dry.
   *
   * Patches used to rebloom at full pool a few seconds after draining, which
   * made pollen effectively infinite — the "routes must be redrawn to new
   * targets constantly" pressure the design claims did not actually exist,
   * because the same flower always came back. Now the field runs down over the
   * day and only refills at dawn.
   *
   * That is what makes the remaining-pollen number worth reading, makes early
   * routing decisions compound, and makes the last stretch of a day tense.
   */
  step(dt: number): void {
    if (!this.alive) {
      this.bloomT = Math.max(0, this.bloomT - dt * 2);
      return;
    }

    // Ease in on bloom so a new patch draws the eye rather than popping.
    this.bloomT = Math.min(1, this.bloomT + dt * 2.5);

    if (Number.isFinite(this.windowRemaining)) {
      this.windowRemaining -= dt;
      if (this.windowRemaining <= 0) this.wilt();
    }
  }
}
