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

function newDay(day = 1): Field {
  const field = new Field();
  field.beginDay(day, featuresForDay(day), patchesForDay(day), 1);
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
  const plan = field.planLine({ x: field.hiveX, y: field.hiveY, route: null }, x, y);
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

  it('retires a line when its flower runs dry, freeing the slot', () => {
    const field = newDay();
    field.patches = [flowerAt(field.hiveX + 220, field.hiveY, 6)];
    lay(field, field.hiveX + 220, field.hiveY);
    expect(field.routes).toHaveLength(1);

    let drained = 0;
    for (let t = 0; t < 20 && field.routes.length > 0; t += 1 / 60) {
      field.step(1 / 60);
      drained += field.drainEvents().drained.length;
    }
    expect(field.routes).toHaveLength(0);
    expect(drained).toBe(1);
  });

  it('lets a line into nothing scout, then give up', () => {
    const field = newDay();
    field.patches = [flowerAt(field.hiveX + 250, field.hiveY - 250)];
    const route = lay(field, field.hiveX + 400, field.hiveY + 100);
    expect(route?.target).toBeNull();

    let fizzled = 0;
    for (let t = 0; t < 15 && field.routes.length > 0; t += 1 / 60) {
      field.step(1 / 60);
      fizzled += field.drainEvents().fizzled.length;
    }
    expect(field.routes).toHaveLength(0);
    expect(fizzled).toBe(1);
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
    expect(field.patches.filter((p) => p.alive).length).toBe(patchesForDay(6));

    for (let t = 0; t < 60 * 60; t += 1) {
      field.step(1 / 60);
      field.drainEvents();
      const golden = field.patches.filter((p) => p.kind === 'night' && p.alive);
      expect(golden.length).toBeLessThanOrEqual(1);
    }
    const ordinary = field.patches.filter((p) => p.kind !== 'night');
    expect(ordinary.length).toBe(patchesForDay(6));
  });

  it('gives day one somewhere to move to when the first flower dies', () => {
    // A single flower would teach "everything ran out and I could do nothing".
    expect(patchesForDay(1)).toBeGreaterThanOrEqual(2);
  });

  it('scales pools with the day, since throughput grows too', () => {
    const early = new Field();
    early.beginDay(1, featuresForDay(1), patchesForDay(1), 1);
    const late = new Field();
    late.beginDay(10, featuresForDay(10), patchesForDay(10), 1);

    expect(late.patches[0]!.maxPool).toBeGreaterThan(early.patches[0]!.maxPool);
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
