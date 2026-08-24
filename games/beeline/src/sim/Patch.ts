import { TUNING } from '../config/tuning.ts';

let nextPatchId = 1;

/** A flower patch. Drains as bees work it, wilts when empty, reblooms elsewhere. */
export class Patch {
  readonly id: number;
  x: number;
  y: number;
  pool: number;
  maxPool: number;
  alive = true;
  /** Counts down while wilted; on zero the patch reblooms at a new position. */
  rebloomTimer = 0;
  /** Drives the bloom-in and wilt-out animations. 0..1. */
  bloomT = 0;

  constructor(x: number, y: number, pool: number) {
    this.id = nextPatchId++;
    this.x = x;
    this.y = y;
    this.pool = pool;
    this.maxPool = pool;
  }

  get fullness(): number {
    return this.maxPool > 0 ? this.pool / this.maxPool : 0;
  }

  /** Removes up to `amount` nectar. Returns what was actually taken. */
  drain(amount: number): number {
    const taken = Math.min(amount, this.pool);
    this.pool -= taken;
    if (this.pool <= 0) {
      this.alive = false;
      this.rebloomTimer = TUNING.patch.rebloomSeconds;
    }
    return taken;
  }

  step(dt: number, reposition: () => { x: number; y: number }): void {
    if (this.alive) {
      // Ease in on bloom so a new patch draws the eye rather than popping.
      this.bloomT = Math.min(1, this.bloomT + dt * 2.5);
      return;
    }

    this.bloomT = Math.max(0, this.bloomT - dt * 3);
    this.rebloomTimer -= dt;

    if (this.rebloomTimer <= 0) {
      const spot = reposition();
      this.x = spot.x;
      this.y = spot.y;
      this.pool = this.maxPool;
      this.alive = true;
      this.bloomT = 0;
    }
  }
}
