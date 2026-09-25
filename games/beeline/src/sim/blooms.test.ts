import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning.ts';
import { Field } from './Field.ts';
import { featuresForDay, patchesForDay } from '../game/DayCycle.ts';
import { deriveStats } from '../game/Upgrades.ts';
import { modifiersFor } from '../game/Items.ts';

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
  it('starts with only a few, and the More Lines pick is what buys more', () => {
    const base = deriveStats();
    expect(base.routeSlots).toBe(TUNING.route.maxCount);

    const withOne = deriveStats(modifiersFor(['moreLines']));
    expect(withOne.routeSlots).toBe(base.routeSlots + 1);
  });

  it('refuses a line past the cap rather than tearing up one already laid', () => {
    // Evicting a line the player paid wax for would be the game spending their
    // budget for them; the preview says "too many lines" instead.
    const field = newDay(1);
    field.wax = field.waxBudget = 100_000;
    for (let i = 0; i < TUNING.wax.maxLines; i += 1) {
      expect(
        field.createRoute(
          lineTo(field, field.hiveX + 150 + (i % 4) * 30, field.hiveY - 60 - i * 10),
        ),
      ).not.toBeNull();
    }
    const plan = field.planLine(
      { x: field.hiveX, y: field.hiveY, route: null, mode: 'hive', at: 0 },
      field.hiveX + 200,
      field.hiveY + 40,
    );
    expect(plan.valid).toBe(false);
    expect(plan.reason).toBe('lines');
    expect(field.routes).toHaveLength(TUNING.wax.maxLines);
  });
});
