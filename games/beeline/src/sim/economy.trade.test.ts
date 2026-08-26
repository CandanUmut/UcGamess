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

  it('keeps the yard free of walls, every day of a run', () => {
    // Home ground is open; the frontier is a maze. A hedge between the hive and
    // a shop it has to reach within seconds turns an emergency into a puzzle,
    // at the moment the player has least attention to spare for one.
    const yard = TUNING.maze.yard;

    for (let day = 1; day <= 20; day += 1) {
      const field = newDay(day);
      const { maze } = field;

      for (let row = yard.row0; row <= yard.row1; row += 1) {
        for (let col = yard.col0; col <= yard.col1; col += 1) {
          if (col > yard.col0) {
            expect(
              maze.canStep(col - 1, row, col, row),
              `wall in yard at ${col},${row}`,
            ).toBe(true);
          }
          if (row > yard.row0) {
            expect(
              maze.canStep(col, row - 1, col, row),
              `wall in yard at ${col},${row}`,
            ).toBe(true);
          }
        }
      }

      // And a way out of it, or the yard would be a room rather than an apron.
      expect(maze.canStep(yard.col0, yard.row0, yard.col0, yard.row0 - 1)).toBe(true);
    }
  });

  it('stands both shops in the yard, not in a wall', () => {
    const yard = TUNING.maze.yard;
    const field = newDay(9);
    for (const buyer of field.buyers) {
      const col = field.maze.colAt(buyer.x);
      const row = field.maze.rowAt(buyer.y);
      expect(col).toBeGreaterThanOrEqual(yard.col0);
      expect(col).toBeLessThanOrEqual(yard.col1);
      expect(row).toBeGreaterThanOrEqual(yard.row0);
      expect(row).toBeLessThanOrEqual(yard.row1);
    }
  });

  it('never spawns a flower in the yard', () => {
    // The yard is the road to the shops, and a foraging target standing on it
    // is how open ground stops being open.
    const yard = TUNING.maze.yard;
    let checked = 0;

    for (let trial = 0; trial < 200; trial += 1) {
      const field = newDay(1 + (trial % 15));
      for (const patch of field.patches) {
        checked += 1;
        const col = field.maze.colAt(patch.x);
        const row = field.maze.rowAt(patch.y);
        const inYard =
          col >= yard.col0 && col <= yard.col1 && row >= yard.row0 && row <= yard.row1;
        expect(inYard, `flower in the yard at ${col},${row}`).toBe(false);
      }
    }

    expect(checked).toBeGreaterThan(500);
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

  it('drops the other shop when one is chosen', () => {
    // The player should never have to erase the old line by hand. More than
    // convenience: a sell line left standing at the other shop goes on selling
    // into it at whatever the price happens to be, so honey the player meant to
    // hold for a peak leaks away at a trough while they look elsewhere — and
    // then neither line is a decision.
    const field = newDay();
    const [first, second] = field.buyers;
    expect(first && second).toBeTruthy();

    const a = field.createRoute(lineTo(field, first!.x, first!.y));
    field.aimRouteAt(a!, null, first!);
    expect(field.routes).toContain(a);

    const b = field.createRoute(lineTo(field, second!.x, second!.y));
    field.aimRouteAt(b!, null, second!);

    expect(field.routes).toContain(b);
    expect(field.routes).not.toContain(a);
    expect(field.events.droppedBuyer?.name).toBe(first!.tuning.name);
  });

  it('keeps several lines into the same shop', () => {
    // Several roads into one buyer is a legitimate way to move a full hive
    // quickly, and it is still one choice.
    const field = newDay();
    const buyer = field.buyers[0]!;

    const a = field.createRoute(lineTo(field, buyer.x, buyer.y));
    field.aimRouteAt(a!, null, buyer);
    const b = field.createRoute(lineTo(field, buyer.x, buyer.y));
    field.aimRouteAt(b!, null, buyer);

    expect(field.routes).toContain(a);
    expect(field.routes).toContain(b);
    expect(field.events.droppedBuyer).toBeNull();
  });

  it('brings the bees on a dropped line home rather than losing them', () => {
    // Switching shops must never cost the honey already in the air. Tried at a
    // spread of moments, because the interesting case is a bee caught mid-flight
    // and the shops are close enough that a fixed delay would usually miss it.
    for (let delay = 0.2; delay <= 2.4; delay += 0.2) {
      const field = newDay();
      const [first, second] = field.buyers;
      field.honey = field.honeyCap;

      const a = field.createRoute(lineTo(field, first!.x, first!.y));
      field.aimRouteAt(a!, null, first!);
      advance(field, delay);

      const b = field.createRoute(lineTo(field, second!.x, second!.y));
      field.aimRouteAt(b!, null, second!);
      expect(field.routes).not.toContain(a);

      advance(field, 10);

      // Nobody is left holding a load with no route to fly it on.
      const stranded = field.bees.filter(
        (bee) => bee.routeId === 0 && bee.state === 'idle' && bee.carrying > 0,
      );
      expect(stranded, `stranded after switching at ${delay.toFixed(1)}s`).toHaveLength(
        0,
      );

      // And no honey evaporated. Conservation rather than value, because a
      // buyer's price can be under 1.00 — money is not a proxy for honey. Every
      // unit that started in the combs was sold, is still there, or went over
      // the brim; a bee dropped mid-flight must not be a fourth outcome.
      const sold = field.events.sold.reduce((sum, sale) => sum + sale.honey, 0);
      const stillFlying = field.bees.reduce(
        (sum, bee) => sum + (bee.payload === 'honey' ? bee.carrying : 0),
        0,
      );
      const accounted = sold + field.honey + field.spilled + stillFlying;
      expect(accounted, `honey lost switching at ${delay.toFixed(1)}s`).toBeGreaterThan(
        field.honeyCap * 0.99,
      );
    }
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
