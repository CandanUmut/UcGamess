import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning.ts';
import { Buyer } from './Buyer.ts';
import { Field } from './Field.ts';
import { featuresForDay, patchesForDay } from '../game/DayCycle.ts';

const DT = 1 / 60;

function newDay(day = 1): Field {
  const field = new Field();
  field.beginDay(day, featuresForDay(day), patchesForDay(day), 1);
  return field;
}

function advance(field: Field, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) field.step(DT);
}

/** Draws a line from the hive to a point, cleared of any walls in the way. */
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

describe('a buyer’s price', () => {
  it('stays inside a band no matter how long the day runs', () => {
    // The reason the price is waves and not a random walk. A walk can wander
    // anywhere given enough seconds, and one freak number would decide a day.
    const buyer = new Buyer('apothecary', 0, 0);
    let low = Infinity;
    let high = 0;
    for (let t = 0; t < 60 * 300; t += 1) {
      buyer.step(DT);
      low = Math.min(low, buyer.price);
      high = Math.max(high, buyer.price);
    }
    const { basePrice, swingSlow, swingFast } = TUNING.buyers.apothecary;
    expect(low).toBeGreaterThan(basePrice * (1 - swingSlow - swingFast) - 0.001);
    expect(high).toBeLessThan(basePrice * (1 + swingSlow + swingFast) + 0.001);
  });

  it('moves smoothly enough for the trend arrow to mean something', () => {
    // An arrow on a random walk is a lie. This asserts the property that makes
    // it a forecast: the price keeps going the way it was going, most of the
    // time, for long enough to act on.
    const buyer = new Buyer('market', 0, 0);
    let sameDirection = 0;
    let changes = 0;
    let previous = buyer.trend;
    for (let t = 0; t < 60 * 120; t += 1) {
      buyer.step(DT);
      if (buyer.trend === previous) sameDirection += 1;
      else changes += 1;
      previous = buyer.trend;
    }
    expect(sameDirection / (sameDirection + changes)).toBeGreaterThan(0.97);
  });

  it('drops when leaned on, and recovers when left alone', () => {
    // The rule that keeps both buyers worth having. Without it the whole game
    // is "find the peak, dump everything", and the cheaper buyer is pointless.
    //
    // Measured against an untouched twin on the same wave phase rather than
    // against its own earlier price. The price moves on its own, so comparing
    // a buyer to its past self tests the wave and the saturation at once and
    // fails whenever the wave happens to be in a trough an hour later.
    const seed = () => 0.25;
    const sold = new Buyer('market', 0, 0);
    const untouched = new Buyer('market', 0, 0);
    sold.beginDay(seed);
    untouched.beginDay(seed);

    expect(sold.price).toBeCloseTo(untouched.price, 6);

    sold.sell(200);
    expect(sold.price).toBeLessThan(untouched.price * 0.9);

    for (let t = 0; t < 60 * 90; t += 1) {
      sold.step(DT);
      untouched.step(DT);
    }
    // Back level with the twin, rather than stuck low for the rest of the day.
    expect(sold.price).toBeGreaterThan(untouched.price * 0.97);
  });

  it('never pays nothing, however hard it is hammered', () => {
    const buyer = new Buyer('apothecary', 0, 0);
    for (let i = 0; i < 50; i += 1) buyer.sell(500);
    expect(buyer.price).toBeGreaterThan(0);
  });
});

describe('the hive fills, and spills', () => {
  it('holds no more than its cap and reports the overflow', () => {
    const field = newDay();
    const cap = field.honeyCap;
    expect(cap).toBeGreaterThan(0);

    // Fill it past the brim through the ordinary delivery path.
    const bee = field.bees[0]!;
    for (let i = 0; i < 400; i += 1) {
      bee.carrying = 20;
      bee.payload = 'nectar';
      bee.x = field.hiveX;
      bee.y = field.hiveY;
      bee.state = 'homing';
      field.step(DT);
      if (field.spilled > 0) break;
    }

    expect(field.honey).toBeLessThanOrEqual(cap + 1e-6);
    expect(field.isSpilling).toBe(true);
    expect(field.spilled).toBeGreaterThan(0);
  });

  it('is the thing the Honey Store upgrade moves', () => {
    // The upgrade used to raise a cap that only applied while the game was
    // closed, which no player could feel. It is now the wall the whole selling
    // loop is pressed against.
    const field = newDay();
    const before = field.honeyCap;
    field.setStats({ ...field.stats, honeyCap: before + 300 });
    expect(field.honeyCap).toBe(before + 300);
  });
});

describe('selling', () => {
  it('turns honey into money by flying it to a buyer and back', () => {
    const field = newDay();
    const buyer = field.buyers[0]!;
    field.honey = field.honeyCap;

    const route = field.createRoute(lineTo(field, buyer.x, buyer.y));
    expect(route).not.toBeNull();
    field.aimRouteAt(route!, null, buyer);
    expect(route!.targetBuyer).toBe(buyer);

    const honeyBefore = field.honey;
    advance(field, 30);

    expect(field.honey).toBeLessThan(honeyBefore);
    expect(field.money).toBeGreaterThan(0);
  });

  it('holds bees at the hive rather than flying empty errands', () => {
    // A sell line running on nothing looks exactly like one that is working,
    // which is the most confusing possible failure.
    const field = newDay();
    const buyer = field.buyers[0]!;
    field.honey = 0;

    const route = field.createRoute(lineTo(field, buyer.x, buyer.y));
    field.aimRouteAt(route!, null, buyer);

    advance(field, 10);
    expect(field.money).toBe(0);
    for (const bee of field.bees) expect(bee.payload).not.toBe('money');
  });

  it('keeps its buyer even when the tip drifts past a flower', () => {
    // A sell line quietly reverting to foraging would undo the player's
    // decision without telling them — the same betrayal a guard line avoids.
    const field = newDay();
    const buyer = field.buyers[0]!;
    const route = field.createRoute(lineTo(field, buyer.x, buyer.y));
    field.aimRouteAt(route!, null, buyer);

    advance(field, 5);
    expect(route!.dead || route!.targetBuyer === buyer).toBe(true);
    expect(route!.target).toBeNull();
  });
});
