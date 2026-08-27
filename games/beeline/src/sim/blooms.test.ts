import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning.ts';
import { Field } from './Field.ts';
import { featuresForDay, patchesForDay } from '../game/DayCycle.ts';
import { deriveStats, emptyLevels } from '../game/Upgrades.ts';

const DT = 1 / 60;

function newDay(day = 1): Field {
  const field = new Field();
  field.beginDay(day, featuresForDay(day), patchesForDay(day), 1);
  return field;
}

function advance(field: Field, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) field.step(DT);
}

/** A line from the hive to a point, cleared of the walls in the way. */
function lineTo(field: Field, x: number, y: number): number[] {
  const coords: number[] = [];
  const n = 24;
  for (let i = 0; i <= n; i += 1) {
    coords.push(
      field.hiveX + ((x - field.hiveX) * i) / n,
      field.hiveY + ((y - field.hiveY) * i) / n,
    );
  }
  return field.slidePath(coords).coords;
}

describe('a bloom is on a clock', () => {
  it('wilts if nothing reaches it, and says so', () => {
    // The star mechanic. A flower is not a resource waiting to be collected,
    // it is an offer with a deadline — which is what makes a fixed number of
    // lines a real budget and losing legible.
    const field = newDay(1);
    const patch = field.patches[0]!;
    expect(patch.alive).toBe(true);

    advance(field, TUNING.patch.wiltSeconds + 1);

    expect(patch.alive).toBe(false);
    expect(field.missed).toBeGreaterThan(0);
  });

  it('holds for as long as a line is reaching it', () => {
    // The promise the visible clock makes: get there in time and it is yours.
    const field = newDay(1);
    const patch = field.patches[0]!;
    const route = field.createRoute(lineTo(field, patch.x, patch.y));
    expect(route).not.toBeNull();

    advance(field, TUNING.patch.wiltSeconds + 4);

    // Either still blooming, or drained by the swarm — never *wilted* while a
    // line was on it.
    expect(patch.pool === 0 || patch.alive).toBe(true);
  });

  it('gives every bloom the same clock it started with', () => {
    const field = newDay(1);
    for (const patch of field.patches) {
      expect(patch.windowFraction).toBeCloseTo(1, 3);
    }
  });

  it('shortens the clock as the run goes on, but never below the floor', () => {
    const early = newDay(1).patches[0]!;
    const late = newDay(30).patches[0]!;
    expect(late.windowTotal).toBeLessThan(early.windowTotal);
    expect(late.windowTotal).toBeGreaterThanOrEqual(TUNING.patch.minWiltSeconds);
  });
});

describe('lines are the budget', () => {
  it('starts with only a few, and the upgrade is what buys more', () => {
    const base = deriveStats(emptyLevels());
    expect(base.routeSlots).toBe(TUNING.route.maxCount);

    const withOne = deriveStats({ ...emptyLevels(), routeSlots: 1 });
    expect(withOne.routeSlots).toBe(base.routeSlots + 1);
  });

  it('drops the least-worked line rather than refusing the drag', () => {
    // A gesture that does nothing on a touchscreen is indistinguishable from a
    // broken game, so the drag always lands. Strength is traffic the road has
    // actually carried, so the line the swarm used least is the one to go.
    const field = newDay(1);
    const slots = field.stats.routeSlots;

    const routes = [];
    for (let i = 0; i < slots; i += 1) {
      const r = field.createRoute(
        lineTo(field, field.hiveX + 200 + i * 30, field.hiveY - 120),
      );
      expect(r).not.toBeNull();
      routes.push(r!);
    }
    // Give every line but the first some traffic.
    for (let i = 1; i < routes.length; i += 1) {
      for (let n = 0; n < 60; n += 1) routes[i]!.reinforce();
    }

    const idle = routes[0]!;
    field.createRoute(lineTo(field, field.hiveX + 40, field.hiveY - 260));

    expect(field.routes.length).toBeLessThanOrEqual(slots);
    expect(field.routes).not.toContain(idle);
  });
});
