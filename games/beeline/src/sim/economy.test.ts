import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning.ts';
import { Field } from './Field.ts';
import { Patch } from './Patch.ts';
import { dayLength, dayQuota, featuresForDay, patchesForDay } from '../game/DayCycle.ts';

/** Straight horizontal route coordinates of the given length from the hive. */
function line(field: Field, length: number): number[] {
  const coords: number[] = [];
  for (let d = 0; d <= length; d += 20) coords.push(field.hiveX + d, field.hiveY);
  return coords;
}

/**
 * A day's field with wax to spare: these tests are about bees and flowers,
 * and a test that places its own flowers would otherwise inherit whatever the
 * random board was priced at. The wax rules have their own tests below.
 */
function newDay(day = 1): Field {
  const field = new Field();
  field.beginDay(day, featuresForDay(day), patchesForDay(day), 1);
  field.wax = field.waxBudget = 100_000;
  return field;
}

function advance(field: Field, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) field.step(dt);
}

/** A flower placed exactly where a test wants it, already found. */
function flowerAt(x: number, y: number, pool = 500): Patch {
  const patch = new Patch(x, y, pool);
  patch.bloomT = 1;
  patch.discovered = true;
  return patch;
}

/** Lays a line from the hive to (x, y) the way a drag would. */
function lay(field: Field, x: number, y: number) {
  const plan = field.planLine(
    { x: field.hiveX, y: field.hiveY, route: null, mode: 'hive', at: 0 },
    x,
    y,
  );
  return field.commitLine(plan);
}

describe('lines and crews', () => {
  it('puts at most a crew of bees on one line', () => {
    // The rule that makes lines matter: without it one line carried the whole
    // swarm and the game played itself once anything was laid.
    const field = newDay();
    field.patches = [flowerAt(field.hiveX + 300, field.hiveY)];
    const route = lay(field, field.hiveX + 300, field.hiveY);
    expect(route).not.toBeNull();
    advance(field, 3);

    const onLine = field.bees.filter((b) => b.routeId === route!.id).length;
    expect(onLine).toBeLessThanOrEqual(field.crewSize);
    expect(field.idleBees).toBeGreaterThan(0);
  });

  it('puts more bees to work for each extra line', () => {
    const field = newDay();
    field.patches = [
      flowerAt(field.hiveX + 300, field.hiveY),
      flowerAt(field.hiveX + 250, field.hiveY - 150),
    ];
    lay(field, field.hiveX + 300, field.hiveY);
    advance(field, 2);
    const idleWithOne = field.idleBees;

    lay(field, field.hiveX + 250, field.hiveY - 150);
    advance(field, 2);
    expect(field.idleBees).toBeLessThan(idleWithOne);
  });

  it('banks honey as score the moment bees get home', () => {
    const field = newDay();
    field.patches = [flowerAt(field.hiveX + 250, field.hiveY)];
    lay(field, field.hiveX + 250, field.hiveY);
    let firstAt = -1;
    for (let t = 0; t < 10 && firstAt < 0; t += 1 / 60) {
      field.step(1 / 60);
      if (field.honey > 0) firstAt = t;
    }
    // The first reward inside a few seconds of the first line: the old sell
    // loop put it fifteen to twenty-five seconds away.
    expect(firstAt).toBeGreaterThan(0);
    expect(firstAt).toBeLessThan(5);
  });

  it('keeps a line whose flower ran dry, and sends its crew home for work', () => {
    // The line is wax the player paid for and a trunk to build on, so it
    // stays; what it must not do is hold bees at a dead flower.
    const field = newDay();
    field.patches = [flowerAt(field.hiveX + 220, field.hiveY, 6)];
    const route = lay(field, field.hiveX + 220, field.hiveY);
    expect(route).not.toBeNull();

    let drained = 0;
    for (let t = 0; t < 20; t += 1 / 60) {
      field.step(1 / 60);
      drained += field.drainEvents().drained.length;
    }
    expect(drained).toBe(1);
    expect(field.routes).toContain(route);
    expect(route!.target).toBeNull();
    expect(field.bees.filter((b) => b.routeId === route!.id)).toHaveLength(0);
  });

  it('leaves a line into nothing as a stub, with no crew on it', () => {
    const field = newDay();
    field.patches = [flowerAt(field.hiveX + 250, field.hiveY - 250)];
    const route = lay(field, field.hiveX + 400, field.hiveY + 100);
    expect(route?.target).toBeNull();
    advance(field, 5);
    expect(field.routes).toContain(route);
    expect(field.bees.filter((b) => b.routeId === route!.id)).toHaveLength(0);
  });
});

describe('wax', () => {
  function pricedDay(): Field {
    const field = new Field();
    field.beginDay(1, featuresForDay(1), patchesForDay(1), 1);
    return field;
  }
  const hive = (field: Field) =>
    ({ x: field.hiveX, y: field.hiveY, route: null, mode: 'hive', at: 0 }) as const;

  it('charges a line its own length', () => {
    const field = pricedDay();
    field.patches = [flowerAt(field.hiveX + 200, field.hiveY)];
    const before = field.wax;
    const plan = field.planLine(hive(field), field.hiveX + 200, field.hiveY);
    field.commitLine(plan);
    expect(before - field.wax).toBeCloseTo(plan.cost, 5);
    expect(plan.cost).toBeGreaterThan(150);
  });

  it('charges a branch only for what it adds, and flies it end to end', () => {
    const field = pricedDay();
    field.wax = field.waxBudget = 5000;
    const a = flowerAt(field.hiveX + 400, field.hiveY);
    const b = flowerAt(field.hiveX + 400, field.hiveY - 150);
    field.patches = [a, b];
    const trunk = field.commitLine(field.planLine(hive(field), a.x, a.y))!;
    const before = field.wax;
    const start = field.lineStartAt(trunk.tipX, trunk.tipY)!;
    expect(start.mode).toBe('branch');
    const branch = field.commitLine(field.planLine(start, b.x, b.y))!;
    expect(branch.target).toBe(b);
    // Paid about the 150 px it added, not the 550 px it flies.
    expect(before - field.wax).toBeLessThan(200);
    expect(branch.liveLength).toBeGreaterThan(500);
    expect(branch.parentId).toBe(trunk.id);
  });

  it('cuts a drag short at the wax there is, and will not lay it to nowhere', () => {
    const field = pricedDay();
    field.patches = [flowerAt(field.hiveX + 600, field.hiveY)];
    field.wax = 200;
    const plan = field.planLine(hive(field), field.hiveX + 600, field.hiveY);
    expect(plan.short).toBe(true);
    expect(plan.target).toBeNull();
    expect(plan.cost).toBeLessThanOrEqual(200);
  });

  it('refunds half a working line, all of a dry one, and all of a fresh misdrag', () => {
    const field = pricedDay();
    field.wax = field.waxBudget = 5000;
    field.patches = [flowerAt(field.hiveX + 300, field.hiveY, 500)];
    const misdrag = field.commitLine(
      field.planLine(hive(field), field.hiveX + 300, field.hiveY),
    )!;
    expect(field.recallRoute(misdrag)).toBe(Math.round(misdrag.ownCost));

    const working = field.commitLine(
      field.planLine(hive(field), field.hiveX + 300, field.hiveY),
    )!;
    advance(field, TUNING.wax.undoSeconds + 1);
    expect(field.recallRoute(working)).toBe(
      Math.round(working.ownCost * TUNING.wax.refundShare),
    );

    field.patches = [flowerAt(field.hiveX + 300, field.hiveY, 2)];
    const dry = field.commitLine(
      field.planLine(hive(field), field.hiveX + 300, field.hiveY),
    )!;
    advance(field, 12);
    expect(dry.target).toBeNull();
    expect(field.recallRoute(dry)).toBe(
      Math.round(dry.ownCost * TUNING.wax.dryRefundShare),
    );
  });

  it("takes a line's branches back with it", () => {
    const field = pricedDay();
    field.wax = field.waxBudget = 5000;
    const a = flowerAt(field.hiveX + 400, field.hiveY);
    const b = flowerAt(field.hiveX + 400, field.hiveY - 150);
    field.patches = [a, b];
    const trunk = field.commitLine(field.planLine(hive(field), a.x, a.y))!;
    field.commitLine(
      field.planLine(field.lineStartAt(trunk.tipX, trunk.tipY)!, b.x, b.y),
    );
    expect(field.routes).toHaveLength(2);
    field.recallRoute(trunk);
    expect(field.routes).toHaveLength(0);
  });

  it('announces a cleared meadow once, when every flower is dry', () => {
    const field = newDay();
    field.patches = [flowerAt(field.hiveX + 220, field.hiveY, 4)];
    lay(field, field.hiveX + 220, field.hiveY);

    let cleared = 0;
    for (let t = 0; t < 20; t += 1 / 60) {
      field.step(1 / 60);
      if (field.drainEvents().cleared) cleared += 1;
    }
    expect(cleared).toBe(1);
    expect(field.cleared).toBe(true);
  });

  it('keeps day one comfortably winnable for a player who lays three lines', () => {
    const field = newDay(1);
    const flowers = field.knownPatches;
    expect(flowers.length).toBeGreaterThanOrEqual(3);
    for (const patch of flowers) lay(field, patch.x, patch.y);
    advance(field, dayLength(1));
    expect(field.honey).toBeGreaterThan(dayQuota(1));
  });
});

describe('pollen is finite for the day', () => {
  it('a drained flower stays dead rather than reblooming', () => {
    const patch = new Patch(500, 400, 10);
    expect(patch.alive).toBe(true);

    patch.drain(10);
    expect(patch.alive).toBe(false);

    // Used to rebloom at full pool after a few seconds, which made pollen
    // effectively infinite and removed the pressure to retarget at all.
    for (let t = 0; t < 60; t += 1) patch.step(1);
    expect(patch.alive).toBe(false);
    expect(patch.pool).toBe(0);
  });

  it('opens the ordinary board at dawn; only golden blooms arrive later', () => {
    // Ordinary flowers arriving across the day read as the game changing its
    // mind. The only arrivals are golden blooms: marked as special, brief,
    // and one at a time.
    const field = newDay(6);
    const dawn = field.patches.filter((p) => p.alive).length;

    for (let t = 0; t < 60 * 60; t += 1) {
      field.step(1 / 60);
      field.drainEvents();
      const golden = field.patches.filter((p) => p.kind === 'night' && p.alive);
      expect(golden.length).toBeLessThanOrEqual(1);
    }
    const ordinary = field.patches.filter((p) => p.kind !== 'night');
    expect(ordinary.length).toBe(dawn);
  });

  it('gives day one somewhere to move to when the first flower dies', () => {
    // A single flower would teach "everything ran out and I could do nothing".
    expect(patchesForDay(1)).toBeGreaterThanOrEqual(2);
  });

  it('pays by tier: a richer flower is worth more a trip and more in all', () => {
    const field = newDay(10);
    const byTier = (tier: number) => field.patches.find((p) => p.tier === tier);
    const [one, two, three] = [byTier(1), byTier(2), byTier(3)];
    expect(one && two && three).toBeTruthy();
    expect(two!.yieldPerTrip).toBeGreaterThan(one!.yieldPerTrip);
    expect(three!.yieldPerTrip).toBeGreaterThan(two!.yieldPerTrip);
    expect(three!.honeyLeft).toBeGreaterThan(two!.honeyLeft);
    expect(two!.honeyLeft).toBeGreaterThan(one!.honeyLeft);
  });
});

describe('the field widens over days', () => {
  it('pushes flowers further from the hive on later days', () => {
    const distance = (day: number): number => {
      const field = new Field();
      let total = 0;
      let count = 0;
      // Averaged over several days' worth of spawns: positions are random, so a
      // single sample proves nothing.
      for (let run = 0; run < 12; run += 1) {
        field.beginDay(day, featuresForDay(day), patchesForDay(day), 1);
        for (const patch of field.patches) {
          total += Math.hypot(patch.x - field.hiveX, patch.y - field.hiveY);
          count += 1;
        }
      }
      return total / count;
    };

    expect(distance(12)).toBeGreaterThan(distance(1));
  });

  it('keeps every flower on screen with room for its reach ring', () => {
    const field = new Field();
    const margin = TUNING.patch.reachRadius;
    for (let day = 1; day <= 14; day += 1) {
      field.beginDay(day, featuresForDay(day), patchesForDay(day), 1);
      for (const patch of field.patches) {
        expect(patch.x).toBeGreaterThanOrEqual(margin);
        expect(patch.x).toBeLessThanOrEqual(1280 - margin);
        expect(patch.y).toBeGreaterThanOrEqual(margin);
        expect(patch.y).toBeLessThanOrEqual(720 - margin);
      }
    }
  });
});

describe('erase', () => {
  it('finds a route anywhere along its length, not just at the tip', () => {
    const field = newDay();
    const route = field.createRoute(line(field, 300));
    expect(route).not.toBeNull();

    // Mid-route: the player is pointing at a line they can see.
    expect(field.routeNear(field.hiveX + 150, field.hiveY)?.id).toBe(route!.id);
    // Far away: nothing.
    expect(field.routeNear(field.hiveX, field.hiveY - 400)).toBeNull();
  });

  it('returns bees to the hive when a route is erased', () => {
    const field = newDay();
    const route = field.createRoute(line(field, 300));
    advance(field, 4);

    field.killRoute(route!);
    expect(field.routes).toHaveLength(0);
    expect(field.bees.every((b) => b.routeId === 0)).toBe(true);
  });
});
