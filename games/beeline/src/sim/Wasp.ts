import { TUNING } from '../config/tuning.ts';

/**
 * A wasp, which makes distance dangerous rather than merely slow.
 *
 * It patrols between wander targets and scatters bees it passes close to. Two
 * deliberate limits keep it a pressure rather than a punishment:
 *
 *  - **Bees are never killed.** They drop their cargo and fly home. On a
 *    45-second day, permanently losing swarm members reads as unfair rather
 *    than tense, and it compounds a bad day into an unrecoverable one.
 *  - **A safe radius around the hive.** Short routes are genuinely safe, so the
 *    wasp sharpens the existing distance trade-off instead of adding a
 *    separate one.
 */
export class Wasp {
  x: number;
  y: number;
  prevX: number;
  prevY: number;

  private targetX: number;
  private targetY: number;
  private repathTimer = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.targetX = x;
    this.targetY = y;
  }

  step(dt: number, pickTarget: () => { x: number; y: number }): void {
    this.prevX = this.x;
    this.prevY = this.y;

    this.repathTimer -= dt;
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 30 || this.repathTimer <= 0) {
      const next = pickTarget();
      this.targetX = next.x;
      this.targetY = next.y;
      this.repathTimer = 3 + Math.random() * 3;
      return;
    }

    const step = Math.min(TUNING.wasp.speed * dt, dist);
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
  }

  /** Whether a point is close enough to be scattered, given hive safety. */
  threatens(x: number, y: number, hiveX: number, hiveY: number): boolean {
    if (Math.hypot(x - hiveX, y - hiveY) <= TUNING.wasp.safeRadius) return false;
    return Math.hypot(x - this.x, y - this.y) <= TUNING.wasp.interceptRadius;
  }
}
