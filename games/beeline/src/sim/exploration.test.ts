import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning.ts';
import { Field, WORLD_HEIGHT, WORLD_WIDTH } from './Field.ts';
import { Fog } from './Fog.ts';
import { Patch } from './Patch.ts';
import { Route } from './Route.ts';
import { featuresForDay, patchesForDay } from '../game/DayCycle.ts';
import { applyAimAssist } from '../game/RouteIntent.ts';

function newDay(day: number): Field {
  const field = new Field();
  field.beginDay(day, featuresForDay(day), patchesForDay(day), 1);
  return field;
}

describe('fog', () => {
  it('starts entirely dark', () => {
    const fog = new Fog(WORLD_WIDTH, WORLD_HEIGHT);
    expect(fog.exploredFraction()).toBe(0);
    expect(fog.revealedAt(600, 300)).toBe(0);
  });

  it('lights brightest at the centre and dimmest at the rim', () => {
    const fog = new Fog(WORLD_WIDTH, WORLD_HEIGHT);
    fog.reveal(600, 300, 200);

    expect(fog.revealedAt(600, 300)).toBeGreaterThan(0.9);
    expect(fog.revealedAt(600, 300 + 180)).toBeLessThan(0.5);
    expect(fog.revealedAt(600, 300 + 180)).toBeGreaterThan(0);
    // Nothing outside the disc.
    expect(fog.revealedAt(600, 300 + 260)).toBe(0);
  });

  it('never forgets, so explored ground stays explored', () => {
    // Re-scouting ground already paid for is busywork wearing a mechanic's
    // clothes. Fog only ever retreats within a day.
    const fog = new Fog(WORLD_WIDTH, WORLD_HEIGHT);
    fog.reveal(600, 300, 200);
    const before = fog.revealedAt(600, 300);

    fog.reveal(50, 50, 60);
    expect(fog.revealedAt(600, 300)).toBe(before);
  });

  it('keeps the brightest visit, so walked ground beats glimpsed ground', () => {
    const fog = new Fog(WORLD_WIDTH, WORLD_HEIGHT);
    fog.reveal(400, 300, 200); // (600,300) is at the rim
    const glimpsed = fog.revealedAt(600, 300);

    fog.reveal(600, 300, 200); // now walked over
    expect(fog.revealedAt(600, 300)).toBeGreaterThan(glimpsed);
  });

  it('ignores reveals entirely off the board without throwing', () => {
    const fog = new Fog(WORLD_WIDTH, WORLD_HEIGHT);
    expect(() => fog.reveal(-900, -900, 100)).not.toThrow();
    expect(fog.exploredFraction()).toBe(0);
  });
});

describe('discovery', () => {
  it('lights every flower on day one, so the tutorial is untouched', () => {
    // The hint line points at the nearest *known* flower. If day one can start
    // with nothing found, a first-time player gets a black screen and no
    // instruction — which is the entire onboarding budget spent on nothing.
    for (let trial = 0; trial < 60; trial += 1) {
      const field = newDay(1);
      expect(field.knownPatches.length).toBe(field.patches.length);
      expect(field.patches.length).toBeGreaterThan(0);
    }
  });

  it('keeps most of the board dark, and more of it each day', () => {
    // The fog is back. Removing it made planning easy and the board boring —
    // knowing where everything is turns a meadow into a checklist. Finding a
    // flower is one of the few moments in this game that feels like a reward.
    const known = (day: number): number => {
      let total = 0;
      const trials = 120;
      for (let t = 0; t < trials; t += 1) {
        const field = newDay(day);
        total += field.knownPatches.length / Math.max(1, field.patches.length);
      }
      return total / trials;
    };

    expect(known(2)).toBeGreaterThan(0.4);
    expect(known(9)).toBeLessThan(known(2));
  });

  it('finds a flower once a bee has been near it, and reports it once', () => {
    const field = newDay(9);
    const hidden = field.patches.find((p) => !p.discovered);
    if (!hidden) return; // a rare day where the hive lit everything

    field.fog.reveal(hidden.x, hidden.y, 120);
    field.step(1 / 60);

    expect(hidden.discovered).toBe(true);
    expect(field.drainEvents().found.some((f) => f.x === hidden.x)).toBe(true);

    // Discovery fires once, not every frame it stays lit.
    field.step(1 / 60);
    expect(field.drainEvents().found.length).toBe(0);
  });

  it('never aims at a flower the player has not found', () => {
    // Snapping onto something invisible hands back the information the dark was
    // there to take away, and reads as the game aiming for the player.
    const field = newDay(1);
    // Placed clear of both buyers on purpose: a drag that ends near one of
    // them is a sell line, and would snap for a completely different and
    // perfectly correct reason.
    field.patches = [new Patch(420, 300, 500)];
    const hidden = field.patches[0]!;
    hidden.discovered = false;

    const assisted = applyAimAssist(field, [400, 300, 410, 300]);
    expect(assisted.connected).toBe(false);

    hidden.discovered = true;
    expect(applyAimAssist(field, [400, 300, 410, 300]).connected).toBe(true);
  });

  it('still lets bees collect from a flower the player has not seen', () => {
    // Exploring has to pay off. The simulation resolves flowers the player has
    // not found; only the *aiming* is gated.
    const field = newDay(1);
    field.patches = [new Patch(field.hiveX + 400, field.hiveY, 500)];
    field.patches[0]!.discovered = false;

    const route = field.createRoute([
      field.hiveX,
      field.hiveY,
      field.hiveX + 400,
      field.hiveY,
    ]);
    expect(route).not.toBeNull();
    expect(route!.reachesTarget()).toBe(true);
  });

  it('does not hand over the next flower when the current one runs dry', () => {
    // The bug this closes made the fog close to pointless in real play. A route
    // whose flower ran out re-aimed at the nearest flower *anywhere*, unseen
    // ones included; the bees flew to it, lit it, and the game announced a
    // discovery the player had never gone looking for. Every dead flower was a
    // free map of the next one.
    const field = newDay(1);
    const near = new Patch(field.hiveX + 200, field.hiveY, 40);
    const hidden = new Patch(field.hiveX + 620, field.hiveY, 500);
    near.discovered = true;
    hidden.discovered = false;
    field.patches = [near, hidden];

    const route = field.createRoute([
      field.hiveX,
      field.hiveY,
      field.hiveX + 200,
      field.hiveY,
    ]);
    expect(route!.target).toBe(near);

    near.drain(999);
    expect(near.alive).toBe(false);
    field.step(1 / 60);

    expect(route!.target).not.toBe(hidden);
    expect(route!.target).toBeNull();

    // And the moment the player has actually found it, it is a target again.
    hidden.discovered = true;
    field.step(1 / 60);
    expect(route!.target).toBe(hidden);
  });
});

describe('distance pays', () => {
  it('ramps yield with distance from the hive', () => {
    const field = new Field();
    const near = field.distanceMultiplierAt(
      field.hiveX + TUNING.patch.distanceYieldNear,
      field.hiveY,
    );
    const far = field.distanceMultiplierAt(
      field.hiveX + TUNING.patch.distanceYieldFar,
      field.hiveY,
    );

    expect(near).toBeCloseTo(1, 2);
    expect(far).toBeCloseTo(TUNING.patch.distanceYieldMax, 2);
    // Clamped at both ends rather than running away.
    expect(field.distanceMultiplierAt(field.hiveX, field.hiveY)).toBe(1);
    expect(field.distanceMultiplierAt(field.hiveX + 4000, field.hiveY)).toBeCloseTo(
      TUNING.patch.distanceYieldMax,
      2,
    );
  });

  it('makes a far flower the same rate but a longer-lived one', () => {
    // The load-bearing claim of the whole distance design. Round trip is
    // 2L/speed, so a flower three times further takes three times as long to
    // work and pays three times per trip: identical honey per second. What
    // differs is that the same pool lasts three times longer.
    //
    // If this ever stops holding, distance is either a trap or a free lunch and
    // the choice between a near and a far flower stops being a choice.
    const field = new Field();
    const speed = field.stats.beeSpeed;

    const rate = (distance: number): number => {
      const multiplier = field.distanceMultiplierAt(field.hiveX + distance, field.hiveY);
      const roundTrip = (2 * distance) / speed;
      return multiplier / roundTrip;
    };

    // Flat across the whole ramp, not just at its ends — both the multiplier
    // and the round trip are linear in distance, so the quotient barely moves.
    const nearRate = rate(TUNING.patch.distanceYieldNear);
    for (const distance of [260, 350, 500, 700, 1000]) {
      const ratio = rate(distance) / nearRate;
      expect(ratio, `${distance}px pays a different rate`).toBeGreaterThan(0.94);
      expect(ratio, `${distance}px pays a different rate`).toBeLessThan(1.06);
    }
  });

  it('reports honey left, not pollen left', () => {
    // Two flowers reading "180" can be worth 180 and 540. Asking the player to
    // multiply two figures mid-drag is arithmetic, not a decision.
    const patch = new Patch(0, 0, 200);
    patch.distanceMultiplier = 2.5;
    expect(patch.honeyLeft).toBeCloseTo(500, 5);

    patch.drain(10);
    expect(patch.honeyLeft).toBeCloseTo(475, 5);
  });

  it('never spawns a flower on top of the hive, or off the board', () => {
    // Distance is what yield, honey value and the whole near-versus-far
    // decision are derived from, so a flower in the hive's own cell is not a
    // slightly-off flower, it is a broken one. And the reach ring is the thing
    // the player aims at — one running off the edge is unaimable at exactly the
    // moment it matters.
    const margin = TUNING.patch.reachRadius;
    for (let day = 1; day <= 14; day += 1) {
      for (let trial = 0; trial < 30; trial += 1) {
        const field = newDay(day);
        const hiveCol = field.maze.colAt(field.hiveX);
        const hiveRow = field.maze.rowAt(field.hiveY);

        for (const patch of field.patches) {
          expect(
            field.maze.colAt(patch.x) === hiveCol &&
              field.maze.rowAt(patch.y) === hiveRow,
            `day ${day}: a flower spawned in the hive's own cell`,
          ).toBe(false);

          // The whole reach ring stays on the board: it is the thing the
          // player aims at, and one running off the edge is unaimable at
          // exactly the moment it matters.
          expect(patch.x - margin).toBeGreaterThan(-1);
          expect(patch.x + margin).toBeLessThan(WORLD_WIDTH + 1);
          expect(patch.y + margin).toBeLessThan(WORLD_HEIGHT + 1);
        }
      }
    }
  });

  it('gives the board both near and far flowers on every day', () => {
    // The fallback matters as much as the frontier. If the inner edge moved out
    // with the outer one there would be no cheap option to weigh the expensive
    // one against, and the decision would collapse back into "go as far as you
    // can".
    for (let day = 4; day <= 12; day += 1) {
      let nearSeen = 0;
      const trials = 40;
      for (let t = 0; t < trials; t += 1) {
        const field = newDay(day);
        // Measured across the blooms a day actually produces, not just the two
        // it opens with — the board fills in over the day now.
        for (let f = 0; f < 60 * 45; f += 1) field.step(1 / 60);
        if (
          field.patches.some(
            (p) => Math.hypot(p.x - field.hiveX, p.y - field.hiveY) < 420,
          )
        ) {
          nearSeen += 1;
        }
      }
      expect(nearSeen / trials, `day ${day} had no near flower`).toBeGreaterThan(0.5);
    }
  });
});

describe('paths mature', () => {
  function workedRoute(deliveries: number): Route {
    const route = new Route([0, 0, 400, 0]);
    for (let i = 0; i < deliveries; i += 1) route.reinforce();
    return route;
  }

  it('earns strength from deliveries and caps at one', () => {
    expect(workedRoute(0).strength).toBe(0);
    expect(workedRoute(5).strength).toBeGreaterThan(0);
    expect(workedRoute(500).strength).toBe(1);
  });

  it('carries bees faster', () => {
    const beaten = workedRoute(500);
    expect(beaten.speedMultiplier).toBeCloseTo(1 + TUNING.route.strengthSpeedBonus, 5);
  });

  it('settles at a level set by how much traffic it carries', () => {
    // The property that makes strength a dial rather than a hidden boolean.
    // Decay is proportional, so a route sits where its delivery rate and its
    // decay balance: thin traffic holds a thin road, heavy traffic holds a
    // full one. With a flat decay there would be no stable middle at all —
    // every route would peg at 1 or fall to 0.
    const settle = (deliveriesPerSecond: number): number => {
      const route = new Route([0, 0, 400, 0]);
      const dt = 1 / 60;
      let owed = 0;
      for (let i = 0; i < 60 * 90; i += 1) {
        owed += deliveriesPerSecond * dt;
        while (owed >= 1) {
          route.reinforce();
          owed -= 1;
        }
        route.step(dt);
      }
      return route.strength;
    };

    const thin = settle(2);
    const middling = settle(4);
    const heavy = settle(18);

    expect(thin).toBeGreaterThan(0.15);
    expect(thin).toBeLessThan(0.55);
    expect(middling).toBeGreaterThan(thin);
    expect(heavy).toBeGreaterThan(0.95);
  });

  it('goes back to scrub when it is neglected', () => {
    const route = workedRoute(500);
    for (let i = 0; i < 60 * 30; i += 1) route.step(1 / 60);
    expect(route.strength).toBeLessThan(0.2);
  });

  it('keeps everything when extended and half when redrawn', () => {
    // What makes extending worth finding: reaching a line on to a new bloom
    // keeps the traffic it has earned; starting over is construction.
    const extended = workedRoute(500);
    extended.extendWith([400, 0, 500, 0]);
    expect(extended.strength).toBe(1);

    const redrawn = workedRoute(500);
    redrawn.replaceWith([0, 0, 500, 0]);
    expect(redrawn.strength).toBeCloseTo(TUNING.route.strengthKeptOnRedraw, 5);
  });

  it('is earned by laden arrivals in the running simulation', () => {
    // A fixed flower with a pool deep enough to outlast the measurement. Built
    // from the day's random spawn this was flaky: a near flower drains in about
    // ten seconds, after which the road is decaying rather than earning, and
    // the reading depended on where the flower happened to land.
    const field = newDay(1);
    const patch = new Patch(field.hiveX + 320, field.hiveY, 5000);
    patch.discovered = true;
    field.patches = [patch];

    const route = field.createRoute([field.hiveX, field.hiveY, patch.x, patch.y]);
    expect(route).not.toBeNull();
    expect(route!.strength).toBe(0);
    expect(route!.reachesTarget()).toBe(true);

    for (let i = 0; i < 60 * 10; i += 1) field.step(1 / 60);

    expect(route!.strength).toBeGreaterThan(0.4);
    expect(field.honey).toBeGreaterThan(0);
  });
});
