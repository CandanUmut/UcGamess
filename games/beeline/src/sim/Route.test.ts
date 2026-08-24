import { describe, expect, it } from 'vitest';
import { Route } from './Route.ts';
import { TUNING } from '../config/tuning.ts';
import { buildPolyline, truncateCoords, coordsLength, sampleAt } from './polyline.ts';

/** A straight horizontal route of `length` px starting at the origin. */
function straightRoute(length: number, hold = TUNING.route.holdSeconds): Route {
  const coords: number[] = [];
  for (let x = 0; x <= length; x += 20) coords.push(x, 0);
  return new Route(coords, hold);
}

/** Advances a route by `seconds` in 1/60s steps, as the real loop does. */
function advance(route: Route, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) route.step(dt);
}

describe('Route decay', () => {
  it('holds full length during the grace period, then retreats', () => {
    const route = straightRoute(300, 2);

    advance(route, 1.5);
    expect(route.liveLength).toBeCloseTo(300, 0);

    advance(route, 1.0); // 0.5s past the hold
    expect(route.liveLength).toBeLessThan(300);
    expect(route.liveLength).toBeCloseTo(300 - TUNING.route.decaySpeed * 0.5, 0);
  });

  it('retreats from the far end, so the tip moves back toward the hive', () => {
    const route = straightRoute(300, 0);
    route.updateTip();
    expect(route.tipX).toBeCloseTo(300, 0);

    advance(route, 2);

    // The whole design rests on this: the end that dies is the end at the
    // patch, which is what makes a refresh gesture shorter than a fresh draw.
    expect(route.tipX).toBeLessThan(300);
    expect(route.tipX).toBeGreaterThan(0);
    expect(route.tipY).toBeCloseTo(0, 1);
  });

  it('dies once the live length falls below the minimum', () => {
    const route = straightRoute(200, 0);
    advance(route, 200 / TUNING.route.decaySpeed + 1);
    expect(route.dead).toBe(true);
  });

  it('decays at a constant px/s, so long routes are structurally expensive', () => {
    const short = straightRoute(200, 0);
    const long = straightRoute(600, 0);

    advance(short, 1);
    advance(long, 1);

    // Both lose the same absolute length — so a long route loses its patch
    // connection just as fast, but costs three times as much to rebuild.
    const shortLost = 200 - short.liveLength;
    const longLost = 600 - long.liveLength;
    expect(shortLost).toBeCloseTo(longLost, 1);
  });
});

describe('Route refresh', () => {
  it('keeps the live portion and appends only the redrawn piece', () => {
    const route = straightRoute(400, 0);
    advance(route, 2); // retreat ~90px

    const liveBefore = route.liveLength;
    expect(liveBefore).toBeLessThan(400);

    // The player redraws from the current tip back out to 400. The final point
    // must land exactly on 400 — a stepped loop would stop short and the
    // assertion below would be measuring the test's rounding, not the merge.
    const appended: number[] = [];
    for (let x = route.tipX; x < 400; x += 20) appended.push(x, 0);
    appended.push(400, 0);

    route.extendWith(appended, TUNING.route.holdSeconds);

    expect(route.poly.length).toBeCloseTo(400, 0);
    expect(route.liveLength).toBeCloseTo(400, 0);
    expect(route.holdRemaining).toBeCloseTo(TUNING.route.holdSeconds, 5);
    expect(route.dead).toBe(false);
  });

  it('makes refreshing cheaper than redrawing, and cheaper the sooner you act', () => {
    const early = straightRoute(400, 0);
    const late = straightRoute(400, 0);

    advance(early, 1);
    advance(late, 4);

    const earlyCost = 400 - early.liveLength;
    const lateCost = 400 - late.liveLength;

    expect(earlyCost).toBeLessThan(lateCost);
    // Both are cheaper than drawing the whole 400px again — the property that
    // makes skilled play *less* physical work rather than more.
    expect(lateCost).toBeLessThan(400);
  });

  it('leaves no gap at the join', () => {
    const route = straightRoute(400, 0);
    advance(route, 2);

    const kept = truncateCoords(route.poly, route.liveLength);
    const keptLength = coordsLength(kept);

    // The retained coordinates must measure exactly the live length, or the
    // rebuilt route would be longer or shorter than what is on screen.
    expect(keptLength).toBeCloseTo(route.liveLength, 1);

    const tipIndex = kept.length - 2;
    expect(kept[tipIndex]).toBeCloseTo(route.tipX, 1);
    expect(kept[tipIndex + 1]).toBeCloseTo(route.tipY, 1);
  });
});

describe('polyline', () => {
  it('measures arc length along a bent path', () => {
    const poly = buildPolyline([0, 0, 100, 0, 100, 100]);
    expect(poly.length).toBeCloseTo(200, 5);
  });

  it('samples position and tangent at a given distance', () => {
    const poly = buildPolyline([0, 0, 100, 0, 100, 100]);
    const out = { x: 0, y: 0, tx: 0, ty: 0 };

    sampleAt(poly, 50, out);
    expect(out.x).toBeCloseTo(50, 5);
    expect(out.y).toBeCloseTo(0, 5);
    expect(out.tx).toBeCloseTo(1, 5);

    sampleAt(poly, 150, out);
    expect(out.x).toBeCloseTo(100, 5);
    expect(out.y).toBeCloseTo(50, 5);
    expect(out.ty).toBeCloseTo(1, 5);
  });

  it('clamps out-of-range distances instead of returning NaN', () => {
    const poly = buildPolyline([0, 0, 100, 0]);
    const out = { x: 0, y: 0, tx: 0, ty: 0 };

    sampleAt(poly, -50, out);
    expect(out.x).toBeCloseTo(0, 5);

    sampleAt(poly, 9999, out);
    expect(out.x).toBeCloseTo(100, 5);
    expect(Number.isNaN(out.x)).toBe(false);
  });
});
