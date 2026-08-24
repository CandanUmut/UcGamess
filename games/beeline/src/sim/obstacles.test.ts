import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning.ts';
import { Field } from './Field.ts';
import { Bramble, blockedDistanceAlong, segmentEntryT } from './Bramble.ts';
import { Patch } from './Patch.ts';
import type { Route } from './Route.ts';
import { buildPolyline } from './polyline.ts';
import { commitDrag, resolveDragStart } from '../game/RouteIntent.ts';
import { bramblesForDay, featuresForDay, patchesForDay } from '../game/DayCycle.ts';
import { modifiersFor, noModifiers } from '../game/Provisions.ts';

function straightCoords(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  step = 12,
): number[] {
  const span = Math.hypot(bx - ax, by - ay);
  const count = Math.max(2, Math.ceil(span / step));
  const out: number[] = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
  }
  return out;
}

describe('segment / thicket intersection', () => {
  it('finds where a segment first enters a circle', () => {
    const t = segmentEntryT(0, 0, 100, 0, { x: 50, y: 0, radius: 10 });
    expect(t).toBeCloseTo(0.4, 5);
  });

  it('reports zero when the segment starts inside', () => {
    expect(segmentEntryT(50, 0, 100, 0, { x: 50, y: 0, radius: 10 })).toBe(0);
  });

  it('misses a circle the segment passes beside', () => {
    expect(segmentEntryT(0, 0, 100, 0, { x: 50, y: 60, radius: 10 })).toBe(-1);
  });

  it('ignores a circle behind the segment rather than reporting a hit', () => {
    expect(segmentEntryT(0, 0, 100, 0, { x: -50, y: 0, radius: 10 })).toBe(-1);
  });
});

describe('blockedDistanceAlong', () => {
  const poly = buildPolyline(straightCoords(0, 0, 300, 0));

  it('is infinite for a clear path', () => {
    expect(blockedDistanceAlong(poly, poly.length, [])).toBe(Number.POSITIVE_INFINITY);
    expect(
      blockedDistanceAlong(poly, poly.length, [{ x: 150, y: 400, radius: 50 }]),
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it('measures the arc distance at which the path enters thorns', () => {
    const hit = blockedDistanceAlong(poly, poly.length, [{ x: 200, y: 0, radius: 40 }]);
    expect(hit).toBeCloseTo(160, 0);
  });

  it('returns the nearest of several thickets, not the first one listed', () => {
    const hit = blockedDistanceAlong(poly, poly.length, [
      { x: 250, y: 0, radius: 20 },
      { x: 100, y: 0, radius: 20 },
    ]);
    expect(hit).toBeCloseTo(80, 0);
  });

  it('ignores thorns past the live end of a decayed route', () => {
    // The section beyond `limit` is already gone, so a thicket sitting on it is
    // not something the route is currently running into.
    expect(blockedDistanceAlong(poly, 100, [{ x: 250, y: 0, radius: 20 }])).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});

/**
 * A field with one flower 420px due right of the hive and one thicket squarely
 * on the line to it.
 *
 * Deterministic on purpose. Building this from the day's randomly placed
 * flowers made the whole block flaky: a flower that happened to spawn near the
 * hive put the thicket close enough that the clipped stub fell under
 * `route.minLength` and the draw was rejected rather than clipped — correct
 * behaviour, but not the case these tests are about, and real placement never
 * puts a thicket that close in.
 */
function fixedField(brambleAt = 0.5, brambleRadius = 50): Field {
  const field = new Field();
  field.beginDay(1, featuresForDay(1), 1, 1);
  field.patches = [new Patch(field.hiveX + 420, field.hiveY, 500)];
  field.patches[0]!.bloomT = 1;
  field.brambles = [
    new Bramble(field.hiveX + 420 * brambleAt, field.hiveY, brambleRadius, 0),
  ];
  return field;
}

describe('drawing into thorns', () => {
  it('clips a route at the thicket rather than refusing the gesture', () => {
    const field = fixedField();
    const patch = field.patches[0]!;

    const intent = resolveDragStart(field, field.hiveX, field.hiveY);
    const result = commitDrag(
      field,
      intent,
      straightCoords(field.hiveX, field.hiveY, patch.x, patch.y),
    );

    expect(result.kind).toBe('fresh');
    expect(result.cutAt).not.toBeNull();

    const route = field.routeById(result.routeId);
    expect(route).toBeDefined();
    // It stops at the thorns, well short of the flower, so it pays nothing
    // until it is redrawn around them.
    expect(route!.liveLength).toBeCloseTo(160, 0);
    expect(route!.reachesTarget()).toBe(false);
  });

  it('charges workers only for the length that survived the cut', () => {
    const field = fixedField();
    const patch = field.patches[0]!;

    const intent = resolveDragStart(field, field.hiveX, field.hiveY);
    const result = commitDrag(
      field,
      intent,
      straightCoords(field.hiveX, field.hiveY, patch.x, patch.y),
    );

    // 160px of a 420px drag survived. Billing the full gesture for a line the
    // thorns ate is the one genuinely unfair reading of this mechanic.
    expect(result.drawnLength).toBeCloseTo(160, 0);
    expect(result.fullLength).toBeGreaterThan(400);
  });

  it('lets a curve around the thicket reach the flower', () => {
    const field = fixedField();

    const coords: number[] = [];
    for (let i = 0; i <= 24; i += 1) {
      const t = i / 24;
      coords.push(field.hiveX + 420 * t, field.hiveY - Math.sin(Math.PI * t) * 150);
    }

    const intent = resolveDragStart(field, field.hiveX, field.hiveY);
    const result = commitDrag(field, intent, coords);

    expect(result.cutAt).toBeNull();
    expect(field.routeById(result.routeId)?.reachesTarget()).toBe(true);
  });

  it('never snaps aim assist through a thicket', () => {
    // The drag stops short of the thorns but well inside aim-assist range of the
    // flower. Snapping here would draw a line straight through something the
    // player can plainly see.
    const field = fixedField(0.75, 60);
    const stopX = field.hiveX + 420 * 0.75 - 60 - 20;

    const intent = resolveDragStart(field, field.hiveX, field.hiveY);
    const result = commitDrag(
      field,
      intent,
      straightCoords(field.hiveX, field.hiveY, stopX, field.hiveY),
    );

    expect(result.connected).toBe(false);
  });
});

describe('thorns cut routes that stop being clear', () => {
  /** A clear route to the flower, with no thorns on the board yet. */
  function drawnRoute(): { field: Field; route: Route } {
    const field = new Field();
    field.beginDay(1, featuresForDay(1), 1, 1);
    field.patches = [new Patch(field.hiveX + 420, field.hiveY, 500)];
    field.patches[0]!.bloomT = 1;

    const intent = resolveDragStart(field, field.hiveX, field.hiveY);
    const result = commitDrag(
      field,
      intent,
      straightCoords(field.hiveX, field.hiveY, field.hiveX + 420, field.hiveY),
    );
    const route = field.routeById(result.routeId);
    if (!route) throw new Error('route was not created');
    return { field, route };
  }

  it('severs a live route when a thicket grows across it', () => {
    const { field, route } = drawnRoute();
    const before = route.liveLength;
    expect(route.reachesTarget()).toBe(true);

    // A thicket spreads across a line drawn at dawn — which is what wind bowing
    // a route and thorns growing produce between them, without the player
    // touching anything.
    field.brambles.push(new Bramble(field.hiveX + 250, field.hiveY, 50, 0));
    field.step(1 / 60);

    expect(route.liveLength).toBeLessThan(before);
    expect(route.liveLength).toBeCloseTo(200, 0);
    expect(route.reachesTarget()).toBe(false);
    expect(field.drainEvents().cut.length).toBe(1);
  });

  it('leaves no ghost pointing back through the thorns', () => {
    // Decay leaves a ghost because refreshing along it is the right move. A cut
    // must not, because redrawing along it would hit the same thicket.
    const { field, route } = drawnRoute();
    field.brambles.push(new Bramble(field.hiveX + 250, field.hiveY, 50, 0));
    field.step(1 / 60);

    expect(route.poly.length).toBeCloseTo(route.liveLength, 0);
  });
});

describe('thicket placement', () => {
  it('never appears before the day it is introduced', () => {
    for (let day = 1; day < TUNING.bramble.startDay; day += 1) {
      expect(bramblesForDay(day)).toBe(0);
    }
    expect(bramblesForDay(TUNING.bramble.startDay)).toBeGreaterThan(0);
  });

  it('actually puts thorns on the field, on every day that should have them', () => {
    // The clearance tests below all pass vacuously on an empty field, and an
    // empty field is exactly what shipped the first time: the corridor between
    // the hive ring and a flower ring was narrower than the thicket needed, so
    // every candidate spot was rejected and no thorns were ever placed. This is
    // the test that fails when that happens.
    for (let day = TUNING.bramble.startDay; day <= 16; day += 1) {
      const wanted = bramblesForDay(day);
      let placed = 0;
      const trials = 25;
      for (let trial = 0; trial < trials; trial += 1) {
        const field = new Field();
        field.beginDay(day, featuresForDay(day), patchesForDay(day), 1);
        placed += field.brambles.length;
      }
      // The night screen forecasts this number the evening before, so a day
      // that quietly delivers fewer makes the forecast a lie.
      expect(placed / trials, `day ${day} placed too few thickets`).toBeGreaterThan(
        wanted * 0.9,
      );
    }
  });

  it('never swallows the hive ring or the heart of a flower ring', () => {
    // Placement is the whole design: a thicket that covers where a route has to
    // start, or where it has to end, makes the drag impossible rather than
    // interesting.
    //
    // The flower rule is deliberately the softer of the two. A thicket may bite
    // into the outer edge of a reach ring — the player approaches from the open
    // side, which is the puzzle working — but the inner part stays clear so
    // there is always an approach to find. The guarantee that one exists is the
    // reachability test below; this one keeps the geometry that makes it true.
    for (let day = 3; day <= 14; day += 1) {
      for (let trial = 0; trial < 25; trial += 1) {
        const field = new Field();
        field.beginDay(day, featuresForDay(day), patchesForDay(day), 1);

        for (const bramble of field.brambles) {
          const grown = bramble.maxRadius;

          expect(
            Math.hypot(bramble.x - field.hiveX, bramble.y - field.hiveY),
            `day ${day} thicket sits on the hive ring`,
          ).toBeGreaterThan(TUNING.hive.drawRadius + grown);

          for (const patch of field.patches) {
            expect(
              Math.hypot(bramble.x - patch.x, bramble.y - patch.y),
              `day ${day} thicket sits over the heart of a flower ring`,
            ).toBeGreaterThan(
              TUNING.patch.reachRadius * TUNING.bramble.patchRingFraction + grown,
            );
          }
        }
      }
    }
  });

  it('never fuses two thickets into a wall', () => {
    for (let trial = 0; trial < 40; trial += 1) {
      const field = new Field();
      field.beginDay(12, featuresForDay(12), patchesForDay(12), 1);

      for (let i = 0; i < field.brambles.length; i += 1) {
        for (let j = i + 1; j < field.brambles.length; j += 1) {
          const a = field.brambles[i];
          const b = field.brambles[j];
          if (!a || !b) continue;
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(
            a.maxRadius + b.maxRadius,
          );
        }
      }
    }
  });

  it('keeps every thicket on screen', () => {
    for (let trial = 0; trial < 40; trial += 1) {
      const field = new Field();
      field.beginDay(10, featuresForDay(10), patchesForDay(10), 1);
      for (const bramble of field.brambles) {
        expect(bramble.x - bramble.maxRadius).toBeGreaterThanOrEqual(0);
        expect(bramble.x + bramble.maxRadius).toBeLessThanOrEqual(1280);
        expect(bramble.y + bramble.maxRadius).toBeLessThanOrEqual(720);
      }
    }
  });

  it('spreads through the day, but only within its bound', () => {
    const bramble = new Bramble(600, 300, 60, TUNING.bramble.growthPerSecond);
    for (let i = 0; i < 90 * 60; i += 1) bramble.step(1 / 60);
    expect(bramble.radius).toBeGreaterThan(60);
    expect(bramble.radius).toBeLessThanOrEqual(bramble.maxRadius);
  });

  it('does not spread at all when the shears were packed', () => {
    const field = new Field();
    field.beginDay(
      8,
      featuresForDay(8),
      patchesForDay(8),
      1,
      modifiersFor('pruningShears'),
    );
    const before = field.brambles.map((b) => b.radius);
    for (let i = 0; i < 60 * 60; i += 1) field.step(1 / 60);
    field.brambles.forEach((b, i) => expect(b.radius).toBe(before[i]));
  });

  it('always leaves at least one clear way to every flower', () => {
    // The load-bearing playability guarantee. Thorns are a puzzle only while
    // the puzzle has an answer — a flower walled off is not difficulty, it is a
    // dead flower the player wastes a drag on. Placement enforces clearances
    // that make this true; this test is what keeps them enforced.
    //
    // "Clear" is deliberately modest: a single dog-leg through one waypoint,
    // which is one flick of a thumb. If only an elaborate serpentine worked,
    // the field would technically pass and still feel unfair.
    const clear = (
      field: Field,
      ax: number,
      ay: number,
      bx: number,
      by: number,
    ): boolean => !field.pathBlocked(ax, ay, bx, by);

    for (let day = 3; day <= 16; day += 1) {
      for (let trial = 0; trial < 20; trial += 1) {
        const field = new Field();
        field.beginDay(day, featuresForDay(day), patchesForDay(day), 1);

        for (const patch of field.patches) {
          if (!patch.alive) continue;

          const dx = patch.x - field.hiveX;
          const dy = patch.y - field.hiveY;
          const span = Math.hypot(dx, dy) || 1;
          const nx = -dy / span;
          const ny = dx / span;

          let reachable = clear(field, field.hiveX, field.hiveY, patch.x, patch.y);

          for (let side = -1; side <= 1 && !reachable; side += 2) {
            for (const offset of [90, 140, 190, 240, 300]) {
              for (const along of [0.35, 0.5, 0.65]) {
                const wx = field.hiveX + dx * along + nx * offset * side;
                const wy = field.hiveY + dy * along + ny * offset * side;
                if (
                  clear(field, field.hiveX, field.hiveY, wx, wy) &&
                  clear(field, wx, wy, patch.x, patch.y)
                ) {
                  reachable = true;
                  break;
                }
              }
              if (reachable) break;
            }
          }

          expect(
            reachable,
            `day ${day}: a flower had no clear route around the thorns`,
          ).toBe(true);
        }
      }
    }
  });

  it('leaves day one and day two untouched, so onboarding is unchanged', () => {
    for (const day of [1, 2]) {
      const field = new Field();
      field.beginDay(day, featuresForDay(day), patchesForDay(day), 1, noModifiers());
      expect(field.brambles.length).toBe(0);
    }
  });
});
