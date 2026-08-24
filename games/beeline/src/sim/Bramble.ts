import { TUNING } from '../config/tuning.ts';
import type { Polyline } from './polyline.ts';

let nextBrambleId = 1;

/** Anything a route cannot pass through. */
export interface Circle {
  x: number;
  y: number;
  radius: number;
}

/**
 * A thorn thicket. Routes cannot pass through one.
 *
 * This is the piece the game was missing. Without an obstacle, a straight line
 * from the hive to a flower is always the best line, so the *shape* the player
 * draws never matters — only which flower they point at. The drag is a target
 * selection wearing a gesture's clothes.
 *
 * A bramble makes the shape the answer to a question. It costs nothing to
 * understand (you can see it, and you can see your line stop at it) and it
 * cannot be solved once and forgotten, because it grows through the day and
 * because the wind bends yesterday's safe arc into it.
 *
 * Two rules keep it a puzzle rather than a punishment:
 *
 *  - **It never touches the hive ring or a flower's reach ring.** Placement
 *    rejects those spots outright, so there is always a way around and the
 *    player is never blocked from starting or finishing a route.
 *  - **It clips, it does not kill.** A route drawn into thorns simply ends
 *    there. The player sees the cut, sees the bees mill at a tip that reaches
 *    nothing, and redraws. No health, no damage, no failure state of its own.
 */
export class Bramble {
  readonly id: number;
  x: number;
  y: number;
  radius: number;
  readonly maxRadius: number;
  readonly growthPerSecond: number;

  /**
   * Fixed spike shape, generated once.
   *
   * Regenerating the jagged outline every frame would make the thicket shimmer
   * like static, which reads as an animation rather than as terrain. The shape
   * is stable and only the radius changes, so growth is legible as growth.
   */
  readonly spikes: readonly number[];

  /**
   * Whether the player has ever seen this thicket.
   *
   * An undiscovered thicket still blocks routes — that is the whole risk of
   * drawing into the dark. It is simply not drawn until a bee has been near
   * enough to see it, and the cut is where the player learns it was there.
   */
  discovered = false;

  constructor(
    x: number,
    y: number,
    radius: number,
    growthPerSecond: number,
    growthFactor = TUNING.bramble.growthFactor,
  ) {
    this.id = nextBrambleId++;
    this.x = x;
    this.y = y;
    this.radius = radius;
    // Growth is bounded so a bramble can never expand into the corridor that
    // placement carefully left open around the flowers. Placement checks every
    // clearance against this number, not against the starting radius.
    this.maxRadius = radius * growthFactor;
    this.growthPerSecond = growthPerSecond;

    const spikes: number[] = [];
    const count = 11 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i += 1) {
      spikes.push(
        (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.25,
        0.86 + Math.random() * 0.36,
      );
    }
    this.spikes = spikes;
  }

  step(dt: number): void {
    if (this.radius >= this.maxRadius) return;
    this.radius = Math.min(this.maxRadius, this.radius + this.growthPerSecond * dt);
  }
}

/**
 * Distance along a segment at which it first enters `circle`, as a fraction of
 * the segment. Returns -1 if the segment never enters it.
 *
 * A start point already inside the circle returns 0, which is what makes the
 * "extend a route whose tip is now swallowed by a growing bramble" case clip to
 * nothing rather than tunnelling through.
 */
export function segmentEntryT(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  circle: Circle,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - circle.x;
  const fy = ay - circle.y;

  const rSq = circle.radius * circle.radius;
  if (fx * fx + fy * fy <= rSq) return 0;

  const a = dx * dx + dy * dy;
  if (a < 1e-9) return -1;

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - rSq;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;

  // Only the near root matters: the far root is where the segment would leave
  // the circle, and a route that has entered is already cut.
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

/**
 * Arc distance at which `poly` first enters an obstacle, searching only up to
 * `limit`. Returns `Infinity` when the path is clear.
 *
 * Walks the polyline in place rather than materialising the live portion as a
 * coordinate array. This runs for every route every fixed step — once wind is
 * bending lines and brambles are growing, "is this route still clear" has to be
 * asked continuously, and allocating a few hundred short arrays a second to ask
 * it is exactly the garbage that shows up as a frame-time spike on a phone.
 */
export function blockedDistanceAlong(
  poly: Polyline,
  limit: number,
  obstacles: readonly Circle[],
): number {
  if (obstacles.length === 0 || poly.count < 2) return Number.POSITIVE_INFINITY;

  const { pts, cum, count } = poly;

  for (let i = 0; i < count - 1; i += 1) {
    const segStart = cum[i] ?? 0;
    if (segStart > limit) break;

    const ax = pts[i * 2] ?? 0;
    const ay = pts[i * 2 + 1] ?? 0;
    const bx = pts[(i + 1) * 2] ?? 0;
    const by = pts[(i + 1) * 2 + 1] ?? 0;
    const segLength = (cum[i + 1] ?? 0) - segStart;

    let nearest = -1;
    for (const obstacle of obstacles) {
      const t = segmentEntryT(ax, ay, bx, by, obstacle);
      if (t >= 0 && (nearest < 0 || t < nearest)) nearest = t;
    }

    if (nearest >= 0) {
      const hit = segStart + nearest * segLength;
      if (hit <= limit) return hit;
    }
  }

  return Number.POSITIVE_INFINITY;
}

/** Whether the straight line a→b crosses any obstacle. */
export function segmentBlocked(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  obstacles: readonly Circle[],
): boolean {
  for (const obstacle of obstacles) {
    if (segmentEntryT(ax, ay, bx, by, obstacle) >= 0) return true;
  }
  return false;
}
