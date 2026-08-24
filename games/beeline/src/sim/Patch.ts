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

  /** Honey per bee-trip from this patch. */
  get yieldPerTrip(): number {
    switch (this.kind) {
      case 'rich':
        return TUNING.patch.richYieldMultiplier;
      case 'night':
        return TUNING.patch.nightBloomMultiplier;
      default:
        return 1;
    }
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
