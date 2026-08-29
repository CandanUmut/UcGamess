import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning.ts';
import { Field } from './Field.ts';
import { Patch } from './Patch.ts';
import { featuresForDay, patchesForDay } from '../game/DayCycle.ts';

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

describe('drawing costs workers', () => {
  it('charges more workers for a long draw than a short refresh', () => {
    // Both measurements are taken on a fresh field with the whole swarm at the
    // hive, so each one is purely the per-pixel charge.
    //
    // The previous shape drew the long route first and then advanced six
    // seconds before the short one, which made the result depend on where the
    // day's random flower happened to land: a route that reached it returned
    // laden bees, which cannot be conscripted, and the short draw measured zero
    // instead of its cost. That failed roughly one run in fourteen.
    const longField = newDay();
    const long = longField.createRoute(line(longField, 400));
    expect(long).not.toBeNull();
    const forLong = longField.dispatchBuilders(long!, 400);

    const shortField = newDay();
    const short = shortField.createRoute(line(shortField, 400));
    const forShort = shortField.dispatchBuilders(short!, 90);

    // The whole point of decaying from the far end: catching a route early is
    // cheaper in bees, not just in thumb effort.
    expect(forShort).toBeLessThan(forLong);
    expect(forShort).toBeGreaterThan(0);
  });

  it('never commits more than the configured share of the swarm', () => {
    const field = newDay();
    const route = field.createRoute(line(field, 900));
    const sent = field.dispatchBuilders(route!, 100_000);

    expect(sent).toBeLessThanOrEqual(
      Math.floor(field.bees.length * TUNING.bee.maxWorkerFraction),
    );
  });

  it('never conscripts a bee that is already outbound or on a flower', () => {
    const field = newDay();

    // Put a flower exactly where the test's fixed 300px line ends.
    //
    // Without it this test was quietly at the mercy of random flower
    // placement: on the seeds where nothing happened to sit near the tip, the
    // swarm flew out, found nothing, went confused and idled, and the
    // assertion below failed through no fault of the behaviour under test. It
    // is about conscription, not about whether the day dealt a reachable
    // flower — measured at roughly a 2% failure rate before this line, which
    // over a repo's worth of CI runs is a test that cries wolf.
    const target = new Patch(field.hiveX + 300, field.hiveY, 500);
    target.bloomT = 1;
    target.discovered = true;
    field.patches = [target];

    const route = field.createRoute(line(field, 300));
    field.dispatchBuilders(route!, 300);

    // Let the swarm spread out along the line and start working.
    advance(field, 8);
    const outboundBefore = field.bees.filter(
      (b) => b.state === 'outbound' || b.state === 'collect',
    ).length;
    expect(outboundBefore).toBeGreaterThan(0);

    // Redraw repeatedly, as a player under decay pressure would.
    for (let i = 0; i < 6; i += 1) {
      const again = field.createRoute(line(field, 300));
      if (again) field.dispatchBuilders(again, 300);
      advance(field, 0.5);
    }

    // Measured regression: yanking in-flight foragers back to the start meant
    // nobody ever arrived, honey flatlined, and day one became unwinnable.
    const stillWorking = field.bees.filter(
      (b) => b.state === 'outbound' || b.state === 'collect' || b.state === 'inbound',
    ).length;
    expect(stillWorking).toBeGreaterThan(0);
  });

  it('keeps day one winnable despite the worker cost', () => {
    const field = newDay(1);
    const patch = field.patches[0]!;

    // Draw once and simply keep it refreshed, as a first-time player would.
    for (let tick = 0; tick < 45; tick += 1) {
      const route = field.routes[0];
      if (!route || route.dead || !route.reachesTarget()) {
        const coords: number[] = [field.hiveX, field.hiveY];
        const steps = 12;
        for (let i = 1; i <= steps; i += 1) {
          coords.push(
            field.hiveX + ((patch.x - field.hiveX) * i) / steps,
            field.hiveY + ((patch.y - field.hiveY) * i) / steps,
          );
        }
        const fresh = field.createRoute(coords);
        if (fresh) field.dispatchBuilders(fresh, 200);
      }
      advance(field, 1);
    }

    // Day one must never be failable — the entire onboarding budget is spent
    // buying the player's third day.
    expect(field.honey).toBeGreaterThan(60);
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

  it('opens the whole board at dawn and never adds to it', () => {
    // Blooms used to arrive across the day and it read as the game changing
    // its mind: you planned around what was there, then a flower appeared
    // somewhere you had already decided not to go.
    const field = newDay(6);
    expect(field.patches.filter((p) => p.alive).length).toBe(patchesForDay(6));

    let opened = 0;
    for (let t = 0; t < 60 * 60; t += 1) {
      field.step(1 / 60);
      opened += field.drainEvents().bloomed.length;
    }
    expect(opened).toBe(0);
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
    field.dispatchBuilders(route!, 300);
    advance(field, 4);

    field.killRoute(route!);
    expect(field.routes).toHaveLength(0);
    expect(field.bees.every((b) => b.routeId === 0)).toBe(true);
  });
});
