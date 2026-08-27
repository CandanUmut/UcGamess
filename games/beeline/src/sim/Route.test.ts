import { describe, expect, it } from 'vitest';
import { Route } from './Route.ts';
import { TUNING } from '../config/tuning.ts';
import { coordsLength } from './polyline.ts';

/** A straight horizontal route of `length` px starting at the origin. */
function straightRoute(length: number): Route {
  const coords: number[] = [];
  for (let x = 0; x <= length; x += 20) coords.push(x, 0);
  return new Route(coords);
}

function advance(route: Route, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) route.step(dt);
}

describe('a line is permanent', () => {
  it('keeps its whole length however long it is left alone', () => {
    // The oldest mechanic in the game, removed. Decay meant the line you drew
    // was not the line you got, and every complaint about the game not feeling
    // skilful circled back to it: drawing was maintenance rather than
    // planning, and there is no craft in redrawing the same line.
    const route = straightRoute(300);
    expect(route.liveLength).toBeCloseTo(300, 0);

    advance(route, 120);
    expect(route.liveLength).toBeCloseTo(300, 0);
    expect(route.dead).toBe(false);
  });

  it('puts its tip at the far end and leaves it there', () => {
    const route = straightRoute(300);
    advance(route, 60);
    expect(route.tipX).toBeCloseTo(300, 0);
    expect(route.tipY).toBeCloseTo(0, 0);
  });
});

describe('extending and re-routing', () => {
  it('carries a line further without losing what it has earned', () => {
    // The cheap gesture: a bloom opens past the end of a line you already own,
    // and you reach it on rather than starting again.
    const route = straightRoute(300);
    for (let i = 0; i < 200; i += 1) route.reinforce();
    const earned = route.strength;

    route.extendWith([300, 0, 400, 0]);

    expect(route.liveLength).toBeCloseTo(400, 0);
    expect(route.strength).toBe(earned);
  });

  it('charges half the road for starting over', () => {
    // Re-routing is the main verb now that the board keeps changing under a
    // fixed number of lines. It has to cost something, or extending would
    // never be worth finding — and it must never cost so much that re-planning
    // feels forbidden.
    const route = straightRoute(300);
    for (let i = 0; i < 200; i += 1) route.reinforce();
    const earned = route.strength;

    route.replaceWith([0, 0, 200, 0]);

    expect(route.strength).toBeCloseTo(earned * TUNING.route.strengthKeptOnRedraw, 5);
    expect(route.liveLength).toBeCloseTo(200, 0);
  });

  it('never grows past the maximum length', () => {
    const route = straightRoute(200);
    const far: number[] = [];
    for (let x = 200; x <= TUNING.route.maxLength * 2; x += 20) far.push(x, 0);
    route.extendWith(far);
    expect(route.liveLength).toBeLessThanOrEqual(TUNING.route.maxLength);
  });

  it('measures its own length honestly', () => {
    const route = straightRoute(400);
    expect(coordsLength([...route.poly.pts])).toBeCloseTo(route.liveLength, 1);
  });
});
