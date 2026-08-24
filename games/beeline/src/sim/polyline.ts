/**
 * A resampled path with cumulative arc lengths, so any point can be addressed
 * by distance-along-the-line rather than by index.
 *
 * That addressing is what makes the whole route mechanic work: a bee's position
 * is a single number `s` (distance travelled), decay is "reduce the usable `s`",
 * and refreshing is "truncate at `s`, then append". None of those need to know
 * how many points the player's drag happened to produce.
 *
 * Backed by Float32Array rather than number[] for locality — these are read
 * once per bee per fixed step, so at 500 bees that is 30,000 reads a second.
 */
export interface Polyline {
  /** Flat [x0, y0, x1, y1, …]. */
  pts: Float32Array;
  /** Cumulative arc length at each point. cum[0] === 0. */
  cum: Float32Array;
  /** Number of points (pts.length / 2). */
  count: number;
  /** Total arc length. */
  length: number;
}

export interface SamplePoint {
  x: number;
  y: number;
  /** Unit tangent at this position. */
  tx: number;
  ty: number;
}

/**
 * Bounds-safe typed-array read.
 *
 * This repo compiles with `noUncheckedIndexedAccess`, which applies to typed
 * arrays as well as plain ones — and correctly so, since an out-of-range index
 * on a Float32Array really does return `undefined` at runtime. Funnelling every
 * read through here keeps that honest without scattering `!` assertions through
 * the hot path.
 */
function f(arr: Float32Array, i: number): number {
  return arr[i] ?? 0;
}

/** Builds a polyline from a flat coordinate list, computing arc lengths. */
export function buildPolyline(coords: readonly number[]): Polyline {
  const count = Math.max(1, Math.floor(coords.length / 2));
  const pts = new Float32Array(count * 2);
  for (let i = 0; i < count * 2; i += 1) pts[i] = coords[i] ?? 0;

  const cum = new Float32Array(count);
  let total = 0;
  for (let i = 1; i < count; i += 1) {
    const dx = f(pts, i * 2) - f(pts, (i - 1) * 2);
    const dy = f(pts, i * 2 + 1) - f(pts, (i - 1) * 2 + 1);
    total += Math.hypot(dx, dy);
    cum[i] = total;
  }

  return { pts, cum, count, length: total };
}

/**
 * Index of the last point at or before arc distance `s`.
 *
 * Binary search: routes run to ~75 points, so this is ~7 comparisons. A linear
 * scan from a per-bee hint would be marginally faster, but the hint has to be
 * invalidated every time a route is rebuilt by a refresh — exactly the kind of
 * cache that goes subtly wrong.
 */
function segmentIndexAt(poly: Polyline, s: number): number {
  let lo = 0;
  let hi = poly.count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (f(poly.cum, mid) <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Position and tangent at arc distance `s`, clamped to the polyline.
 *
 * Writes into `out` rather than allocating — called once per bee per fixed
 * step, so allocating here would hand the collector 30,000 objects a second.
 */
export function sampleAt(poly: Polyline, s: number, out: SamplePoint): SamplePoint {
  if (poly.count < 2) {
    out.x = f(poly.pts, 0);
    out.y = f(poly.pts, 1);
    out.tx = 1;
    out.ty = 0;
    return out;
  }

  const clamped = s <= 0 ? 0 : s >= poly.length ? poly.length : s;
  const i = Math.min(segmentIndexAt(poly, clamped), poly.count - 2);

  const ax = f(poly.pts, i * 2);
  const ay = f(poly.pts, i * 2 + 1);
  const bx = f(poly.pts, (i + 1) * 2);
  const by = f(poly.pts, (i + 1) * 2 + 1);

  const segStart = f(poly.cum, i);
  const segLen = f(poly.cum, i + 1) - segStart;
  const t = segLen > 1e-6 ? (clamped - segStart) / segLen : 0;

  out.x = ax + (bx - ax) * t;
  out.y = ay + (by - ay) * t;

  const dx = bx - ax;
  const dy = by - ay;
  const inv = 1 / (Math.hypot(dx, dy) || 1);
  out.tx = dx * inv;
  out.ty = dy * inv;

  return out;
}

const truncScratch: SamplePoint = { x: 0, y: 0, tx: 0, ty: 0 };

/**
 * Coordinates of `poly` truncated at arc distance `s`, with the final point
 * landing exactly on `s`.
 *
 * This is the refresh operation: keep the part of the route still alive, so the
 * player only has to redraw the part that retreated. The exact landing matters
 * — the visible end of the route and the point a refresh drag starts from have
 * to be the same place, or the join shows.
 */
export function truncateCoords(poly: Polyline, s: number): number[] {
  const out: number[] = [];
  const limit = Math.max(0, Math.min(s, poly.length));

  for (let i = 0; i < poly.count; i += 1) {
    if (f(poly.cum, i) > limit) break;
    out.push(f(poly.pts, i * 2), f(poly.pts, i * 2 + 1));
  }

  const tip = sampleAt(poly, limit, truncScratch);
  const lastX = out[out.length - 2];
  const lastY = out[out.length - 1];

  if (
    out.length < 2 ||
    lastX === undefined ||
    lastY === undefined ||
    Math.hypot(tip.x - lastX, tip.y - lastY) > 0.5
  ) {
    out.push(tip.x, tip.y);
  }

  return out;
}

/** Appends `x,y` to `coords` only if it is at least `spacing` from the last point. */
export function pushIfSpaced(
  coords: number[],
  x: number,
  y: number,
  spacing: number,
): boolean {
  const n = coords.length;
  if (n < 2) {
    coords.push(x, y);
    return true;
  }
  const lastX = coords[n - 2] ?? 0;
  const lastY = coords[n - 1] ?? 0;
  if (Math.hypot(x - lastX, y - lastY) < spacing) return false;
  coords.push(x, y);
  return true;
}

/** Total arc length of a flat coordinate list. */
export function coordsLength(coords: readonly number[]): number {
  let total = 0;
  for (let i = 2; i < coords.length; i += 2) {
    const dx = (coords[i] ?? 0) - (coords[i - 2] ?? 0);
    const dy = (coords[i + 1] ?? 0) - (coords[i - 1] ?? 0);
    total += Math.hypot(dx, dy);
  }
  return total;
}
