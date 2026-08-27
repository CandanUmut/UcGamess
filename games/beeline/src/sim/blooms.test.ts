import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning.ts';
import { Field } from './Field.ts';
import { featuresForDay, patchesForDay } from '../game/DayCycle.ts';
import { deriveStats, emptyLevels } from '../game/Upgrades.ts';

function newDay(day = 1): Field {
  const field = new Field();
  field.beginDay(day, featuresForDay(day), patchesForDay(day), 1);
  return field;
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
