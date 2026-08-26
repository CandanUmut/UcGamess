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

  it('points the trend arrow both ways, not just at nothing', () => {
    // The arrow was silently broken for the whole life of the market: it
    // compared consecutive frames, and one frame of a wave whose period is
    // measured in tens of seconds moves the price by far less than the
    // threshold it was tested against. Both arrows read blank, always, and the
    // "moves smoothly" test above passed *because* of it — a value that never
    // changes never changes direction.
    //
    // This is the assertion that would have caught it: over a long run the
    // arrow has to actually take both values.
    for (const id of ['market', 'apothecary'] as const) {
      const buyer = new Buyer(id, 0, 0);
      const seen = new Set<number>();
      for (let t = 0; t < 60 * 180; t += 1) {
        buyer.step(DT);
        seen.add(buyer.trend);
      }
      expect(seen.has(1), `${id} never pointed up`).toBe(true);
      expect(seen.has(-1), `${id} never pointed down`).toBe(true);
    }
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

describe('where the buyers stand', () => {
  it('keeps both within a few corridors of the hive', () => {
    // Selling is the pressure inside the loop, not the reward at the end of it.
    // A depot far enough away that answering a brimming hive is a project turns
    // that pressure into a chore — and at long range the near-versus-far
    // decision collapses, because both buyers are simply far.
    const field = newDay(6);
    for (const buyer of field.buyers) {
      const flight = field.pathDistanceTo(buyer.x, buyer.y);
      expect(flight).toBeLessThan(TUNING.hive.sightRadius * 2.2);
    }
  });

  it('never spawns a flower on top of a depot', () => {
    // Two reach rings on top of each other is genuinely ambiguous, and the aim
    // assist has to pick one — so a flower next door to a depot costs the
    // player either the sell line or the forage line they meant to draw.
    const clearance = TUNING.patch.reachRadius + TUNING.honey.reachRadius;
    let checked = 0;

    for (let trial = 0; trial < 200; trial += 1) {
      const day = 1 + (trial % 15);
      const field = newDay(day);
      for (const patch of field.patches) {
        checked += 1;
        for (const buyer of field.buyers) {
          expect(Math.hypot(patch.x - buyer.x, patch.y - buyer.y)).toBeGreaterThan(
            clearance,
          );
        }
      }
    }

    // Anti-vacuity: a placement rule tested against no placements passes.
    expect(checked).toBeGreaterThan(500);
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

  it('never lets one bee shoulder the whole hive', () => {
    // A sale should read as a swarm working a line, not as a single bee
    // teleporting the day's work to a depot — and at the other end of the same
    // bug, a bee arriving at a nearly-empty hive used to take every last drop.
    const field = newDay();
    const buyer = field.buyers[0]!;
    const route = field.createRoute(lineTo(field, buyer.x, buyer.y));
    field.aimRouteAt(route!, null, buyer);

    let biggestShare = 0;
    for (let i = 0; i < 60 * 40; i += 1) {
      field.honey = field.honeyCap;
      field.step(DT);
      for (const bee of field.bees) {
        if (bee.payload !== 'honey') continue;
        biggestShare = Math.max(biggestShare, bee.carrying / field.honeyCap);
      }
    }

    // The share, or the small-hive floor, whichever binds — at a base hive the
    // 26-honey floor is fractionally the larger of the two.
    const allowed =
      Math.max(TUNING.honey.perSellTrip, field.honeyCap * TUNING.honey.maxTripShare) /
      field.honeyCap;
    expect(biggestShare).toBeGreaterThan(0);
    expect(biggestShare).toBeLessThanOrEqual(allowed + 1e-6);
    // And well under a third of the hive whatever the numbers say, which is the
    // property the player actually notices.
    expect(biggestShare).toBeLessThan(0.2);
  });

  it('takes about the same number of trips however big the hive gets', () => {
    // The flat per-trip load did not scale: every Honey Store level added trips
    // to empty the hive, so the upgrade meant to relieve pressure quietly made
    // selling more tedious.
    const trips = (cap: number): number => {
      const field = newDay();
      field.setStats({ ...field.stats, honeyCap: cap });
      field.honey = cap;

      const buyer = field.buyers[0]!;
      const route = field.createRoute(lineTo(field, buyer.x, buyer.y));
      field.aimRouteAt(route!, null, buyer);

      let count = 0;
      for (let i = 0; i < 60 * 120 && field.honey > 0; i += 1) {
        const before = field.honey;
        field.step(DT);
        if (field.honey < before) count += 1;
      }
      return count;
    };

    const small = trips(220);
    const large = trips(880);
    expect(small).toBeGreaterThan(4);
    expect(large).toBeLessThan(small * 2);
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
