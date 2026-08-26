import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning.ts';
import { Field } from './Field.ts';
import { RaidClock } from './Raid.ts';
import { Wasp } from './Wasp.ts';
import { featuresForDay, patchesForDay, raidSizeForDay } from '../game/DayCycle.ts';
import { modifiersFor } from '../game/Items.ts';

const DT = 1 / 60;

/**
 * Day one: no maze, no wind, no raid clock.
 *
 * Everything below that tests the raid *mechanics* rather than the raid
 * *schedule* builds on this, and places its wasps by hand. Running them on a
 * real wasp day means a scheduled raid, a bramble wall or a gust can walk into
 * the middle of the measurement, which is how a test starts failing one run in
 * ten for reasons that have nothing to do with what it is checking.
 */
function openBoard(): Field {
  return newDay(1);
}

function newDay(day: number): Field {
  const field = new Field();
  field.beginDay(day, featuresForDay(day), patchesForDay(day), 1);
  return field;
}

function advance(field: Field, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) field.step(DT);
}

/** Runs a clock until the first raid lands, returning when the warning came. */
function firstRaid(random: () => number): { warnedAt: number; arrivedAt: number } {
  const clock = new RaidClock();
  clock.begin(1, 0, random);

  let t = 0;
  let warnedAt = -1;
  for (let i = 0; i < 60 * 200; i += 1) {
    const signal = clock.step(DT);
    t += DT;
    if (signal === 'warning') warnedAt = t;
    if (signal === 'arrive') return { warnedAt, arrivedAt: t };
  }
  throw new Error('no raid inside 200 seconds');
}

describe('raid timing', () => {
  it('always warns before it arrives, with the full warning window', () => {
    // The whole fairness budget for making the timing random. A raid that
    // landed without one would be a surprise about *whether you had a chance*,
    // which is a different and much worse thing than a surprise about when.
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const { warnedAt, arrivedAt } = firstRaid(() => r);
      expect(warnedAt).toBeGreaterThan(0);
      expect(arrivedAt - warnedAt).toBeCloseTo(TUNING.raid.warningSeconds, 1);
    }
  });

  it('never lands before the day has had a chance to start', () => {
    // "You lost honey you never had" teaches nothing.
    const { arrivedAt } = firstRaid(() => 0);
    expect(arrivedAt).toBeGreaterThanOrEqual(TUNING.raid.firstRaidEarliest - 0.1);
  });

  it('is not a metronome', () => {
    // The playtest note this whole system answers: "every 25 second is too
    // predictable". A fixed interval is learned once and then ignored.
    const clock = new RaidClock();
    clock.begin(1);

    const arrivals: number[] = [];
    let t = 0;
    for (let i = 0; i < 60 * 600; i += 1) {
      const signal = clock.step(DT);
      t += DT;
      if (signal === 'arrive') arrivals.push(t);
    }

    expect(arrivals.length).toBeGreaterThan(6);
    const gaps: number[] = [];
    for (let i = 1; i < arrivals.length; i += 1) {
      gaps.push((arrivals[i] ?? 0) - (arrivals[i - 1] ?? 0));
    }

    const spread = Math.max(...gaps) - Math.min(...gaps);
    expect(spread).toBeGreaterThan(4);
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(TUNING.raid.minGapSeconds - 0.2);
      expect(gap).toBeLessThanOrEqual(TUNING.raid.maxGapSeconds + 0.2);
    }
  });

  it('never schedules anything on a day before wasps exist', () => {
    const clock = new RaidClock();
    clock.begin(raidSizeForDay(TUNING.wasp.startDay - 1));
    for (let i = 0; i < 60 * 300; i += 1) expect(clock.step(DT)).toBeNull();
  });
});

describe('wasps cross the maze and rob the hive', () => {
  it('reaches the hive from the far rim, on the densest board the game makes', () => {
    // The point of walking them in through the corridors: a wasp that could
    // fly over the walls would make the maze purely a cost to the player,
    // where it should be terrain both sides have to deal with. The other half
    // of that bargain is that it must genuinely arrive — a raider stuck in a
    // dead end is an enemy the player never has to answer.
    //
    // The bound is generous on purpose. What is being tested is that gradient
    // descent over the maze always terminates at the hive, not how fast.
    for (let trial = 0; trial < 25; trial += 1) {
      const field = newDay(20);
      const wasp = field.spawnRaidNow();
      expect(wasp.length).toBeGreaterThan(0);

      advance(field, 40);
      for (const w of wasp) {
        expect(w.state, `trial ${trial}`).not.toBe('approaching');
      }
    }
  });

  it('drains honey and drives off bees once it lands', () => {
    const field = openBoard();
    field.honey = 4000;
    const swarm = field.bees.length;

    // Put one at the door directly, so the test measures the raid rather than
    // the crossing.
    const wasp = new Wasp(field.hiveX, field.hiveY);
    wasp.beginRaid();
    field.wasps.push(wasp);

    advance(field, 6);

    expect(field.honey).toBeLessThan(4000);
    expect(field.beesLost).toBeGreaterThan(0);
    expect(field.bees.length).toBeLessThan(swarm);
  });

  it('never strips the swarm below a playable hive', () => {
    // A hive that cannot fly a single route is not a punished player, it is a
    // player watching an empty board until dusk.
    const field = openBoard();
    field.honey = 100000;
    for (let i = 0; i < 6; i += 1) {
      const wasp = new Wasp(field.hiveX, field.hiveY);
      wasp.beginRaid();
      field.wasps.push(wasp);
    }
    advance(field, 60);
    expect(field.bees.length).toBeGreaterThanOrEqual(4);
  });

  it('leaves of its own accord rather than camping the hive', () => {
    const field = openBoard();
    field.honey = 100000;
    const wasp = new Wasp(field.hiveX + 400, field.hiveY);
    wasp.beginRaid();
    field.wasps.push(wasp);

    advance(field, TUNING.wasp.raidSeconds + 12);
    // Only this wasp: the day's own clock is free to send another in the
    // meantime, and asserting on an empty board would make the test a
    // measurement of the raid schedule rather than of the wasp.
    expect(field.wasps).not.toContain(wasp);
    expect(wasp.state).toBe('gone');
  });
});

describe('drawing a line at a wasp fights it', () => {
  it('brings one down, and the route stops earning while it does', () => {
    const field = openBoard();
    const wasp = new Wasp(field.hiveX + 300, field.hiveY);
    field.wasps.push(wasp);

    const coords: number[] = [];
    for (let d = 0; d <= 300; d += 20) coords.push(field.hiveX + d, field.hiveY);
    const route = field.createRoute(coords);
    expect(route).not.toBeNull();
    // Aimed at the wasp, not at a flower that happens to be behind it.
    expect(route!.targetWasp).toBe(wasp);
    expect(route!.target).toBeNull();

    advance(field, 25);
    expect(wasp.health).toBe(0);
    expect(field.wasps).not.toContain(wasp);
  });

  it('drops the wasp target once it is gone, so the line goes back to work', () => {
    const field = openBoard();
    const wasp = new Wasp(field.hiveX + 260, field.hiveY);
    field.wasps.push(wasp);

    const coords: number[] = [];
    for (let d = 0; d <= 260; d += 20) coords.push(field.hiveX + d, field.hiveY);
    const route = field.createRoute(coords);
    expect(route!.targetWasp).toBe(wasp);

    wasp.hit(TUNING.wasp.kinds.raider.health);
    field.step(DT);
    expect(route!.targetWasp).toBeNull();
  });
});

describe('the wind cannot blow a route through a wall', () => {
  it('shelters a route lying inside a corridor', () => {
    // The fix for "there is no way to prevent once it hits to the walls".
    // There was not: wind pushed a line into a hedge, the hedge shortened it,
    // and nothing the player did changed that. A hedge now *breaks* the wind
    // instead, so the maze is cover as well as an obstacle.
    const field = newDay(14);
    const coords: number[] = [];
    for (let d = 0; d <= 260; d += 20) coords.push(field.hiveX + d, field.hiveY);
    const route = field.createRoute(field.slidePath(coords).coords);
    if (!route) return;

    // Whatever the gale does over a full day, it may never end up with the
    // road crossing a wall — that is the property, not any particular shape.
    for (let t = 0; t < 60 * 45; t += 1) {
      field.step(DT);
      if (route.dead) break;
      expect(
        Number.isFinite(field.blockedDistance(route.poly, route.liveLength)) &&
          field.blockedDistance(route.poly, route.liveLength) < route.liveLength,
      ).toBe(false);
    }
  });

  it('leaves a road to a shop completely alone', () => {
    // A sell line that wandered off its own depot would break the one part of
    // the loop a player cannot improvise around: there is nowhere else to sell.
    const field = newDay(14);
    const buyer = field.buyers[0]!;
    const coords: number[] = [];
    const n = 20;
    for (let i = 0; i <= n; i += 1) {
      coords.push(
        field.hiveX + ((buyer.x - field.hiveX) * i) / n,
        field.hiveY + ((buyer.y - field.hiveY) * i) / n,
      );
    }
    const route = field.createRoute(field.slidePath(coords).coords);
    field.aimRouteAt(route!, null, buyer);

    const shape = [...route!.poly.pts];
    advance(field, 20);
    expect([...route!.poly.pts]).toEqual(shape);
  });
});

describe('hive defences fight without the player', () => {
  it('brings a raider down on their own, given enough guards', () => {
    // The one answer to a raid that does not cost a drag. Everything else in
    // the system asks the player to react at the worst possible moment; this
    // is what they buy so that a raid landing mid-gesture is survivable.
    const field = new Field();
    field.beginDay(
      1,
      featuresForDay(1),
      patchesForDay(1),
      1,
      modifiersFor(['guardBees', 'guardBees']),
    );
    field.honey = 5000;

    const wasp = new Wasp(field.hiveX, field.hiveY);
    wasp.beginRaid();
    field.wasps.push(wasp);

    advance(field, TUNING.wasp.kinds.raider.health * TUNING.wasp.guardInterval + 1);
    expect(wasp.health).toBe(0);
  });

  it('does not bank idle time and delete the next arrival instantly', () => {
    const field = new Field();
    field.beginDay(
      1,
      featuresForDay(1),
      patchesForDay(1),
      1,
      modifiersFor(['guardBees']),
    );
    field.honey = 5000;

    // A long quiet stretch with nothing at the door.
    advance(field, 30);

    const wasp = new Wasp(field.hiveX, field.hiveY);
    wasp.beginRaid();
    field.wasps.push(wasp);
    field.step(DT);

    expect(wasp.health).toBe(TUNING.wasp.kinds.raider.health);
  });

  it('slows the theft when the hive is sealed', () => {
    const drain = (items: Parameters<typeof modifiersFor>[0]): number => {
      const field = new Field();
      field.beginDay(1, featuresForDay(1), patchesForDay(1), 1, modifiersFor(items));
      field.honey = 5000;
      const wasp = new Wasp(field.hiveX, field.hiveY);
      wasp.beginRaid();
      field.wasps.push(wasp);
      advance(field, 4);
      return 5000 - field.honey;
    };

    expect(drain(['propolisSeal'])).toBeLessThan(drain([]) * 0.8);
  });
});

describe('a guard line stands itself down', () => {
  it('goes back to work once the last wasp is gone', () => {
    // "Those wasps are gone but I have to delete the red line because those
    // bees cannot carry polens." Making the player tidy up after a fight they
    // won is the game handing them a chore for succeeding.
    const field = openBoard();
    const wasp = new Wasp(field.hiveX + 300, field.hiveY);
    field.wasps.push(wasp);

    const coords: number[] = [];
    for (let d = 0; d <= 300; d += 20) coords.push(field.hiveX + d, field.hiveY);
    const route = field.createRoute(coords);
    expect(route!.guard).toBe(true);

    // Still guarding while anything is on the board, however long it takes.
    // Moved out of the line's reach first, so this measures the stand-down
    // rule rather than how fast the line kills what it was drawn at.
    wasp.x = field.hiveX;
    wasp.y = field.hiveY - 340;
    advance(field, TUNING.wasp.standDownSeconds + 1);
    expect(route!.guard).toBe(true);

    field.wasps = [];
    advance(field, TUNING.wasp.standDownSeconds + 0.5);

    // Either it found something to forage or it retired — never left standing
    // there costing a slot and a share of the swarm for nothing.
    expect(route!.dead || route!.guard === false).toBe(true);
    expect(route!.guard).toBe(false);
  });

  it('holds through the gaps inside a wave', () => {
    // Wasps arrive in ones and twos. Standing down on the first quiet frame
    // would dissolve the line in the middle of the fight it was drawn for.
    const field = openBoard();
    const first = new Wasp(field.hiveX + 300, field.hiveY);
    field.wasps.push(first);

    const coords: number[] = [];
    for (let d = 0; d <= 300; d += 20) coords.push(field.hiveX + d, field.hiveY);
    const route = field.createRoute(coords);
    expect(route!.guard).toBe(true);

    field.wasps = [];
    advance(field, TUNING.wasp.standDownSeconds * 0.5);
    field.wasps.push(new Wasp(field.hiveX + 320, field.hiveY));
    advance(field, TUNING.wasp.standDownSeconds * 0.9);

    expect(route!.guard).toBe(true);
  });
});
