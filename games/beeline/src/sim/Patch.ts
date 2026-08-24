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
  /** Counts down while wilted; on zero the patch reblooms at a new position. */
  rebloomTimer = 0;
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
    this.rebloomTimer = TUNING.patch.rebloomSeconds;
  }

  step(dt: number, reposition: (kind: PatchKind) => { x: number; y: number }): void {
    if (this.alive) {
      // Ease in on bloom so a new patch draws the eye rather than popping.
      this.bloomT = Math.min(1, this.bloomT + dt * 2.5);

      if (Number.isFinite(this.windowRemaining)) {
        this.windowRemaining -= dt;
        if (this.windowRemaining <= 0) this.wilt();
      }
      return;
    }

    this.bloomT = Math.max(0, this.bloomT - dt * 3);
    this.rebloomTimer -= dt;

    if (this.rebloomTimer <= 0) {
      // A night bloom is a one-off event; it reblooms as an ordinary patch so
      // the field does not fill up with permanent high-value targets.
      if (this.kind === 'night') {
        this.kind = 'normal';
        this.windowRemaining = Number.POSITIVE_INFINITY;
      }
      const spot = reposition(this.kind);
      this.x = spot.x;
      this.y = spot.y;
      this.pool = this.maxPool;
      this.alive = true;
      this.bloomT = 0;
    }
  }
}
