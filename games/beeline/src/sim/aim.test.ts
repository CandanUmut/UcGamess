import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning.ts';
import { Aimer } from './Aimer.ts';
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

describe('the dial', () => {
  it('runs open → fire → stop on three taps', () => {
    const field = newDay(1);
    expect(field.aim.mode).toBe('idle');

    field.tap(field.hiveX, field.hiveY);
    expect(field.aim.mode).toBe('aiming');

    field.tap(field.hiveX, field.hiveY);
    expect(field.aim.mode).toBe('flying');

    // A short hop, so the shot is certainly still in the air — long enough
    // and it lands on a flower by itself, which is a different (good) rule.
    advance(field, 0.05);
    expect(field.aim.mode).toBe('flying');

    field.tap(0, 0);
    expect(field.aim.mode).toBe('idle');
  });

  it('spins the arrow while it is open, and faster the longer it is left', () => {
    // "Gitgide hızlanmalı" inside a single shot: hesitating is what costs you,
    // which is the whole skill the mechanic is asking for.
    const aim = new Aimer();
    aim.beginDay(1);
    aim.open(0, 0, 0, 0);

    const first = aim.spinSpeed;
    for (let t = 0; t < 3; t += DT) aim.spin(DT);
    expect(aim.spinSpeed).toBeGreaterThan(first * 1.3);
    expect(aim.angle).not.toBe(0);
  });

  it('starts faster every day, and never runs away past its ceiling', () => {
    const early = new Aimer();
    early.beginDay(1);
    const late = new Aimer();
    late.beginDay(12);
    expect(late.spinSpeed).toBeGreaterThan(early.spinSpeed);

    const ancient = new Aimer();
    ancient.beginDay(200);
    ancient.open(0, 0, 0, 0);
    for (let t = 0; t < 60; t += DT) ancient.spin(DT);
    expect(ancient.spinSpeed).toBeLessThanOrEqual(TUNING.aim.maxSpin);
  });

  it('lays road when a shot lands', () => {
    const field = newDay(1);
    field.tap(field.hiveX, field.hiveY);
    field.aim.angle = -Math.PI / 2; // straight up, into open board
    field.tap(0, 0);

    advance(field, 4);
    expect(field.routes.length).toBe(1);
    expect(field.routes[0]!.liveLength).toBeGreaterThan(TUNING.route.minLength);
  });

  it('stops on its own when the shot runs out of travel', () => {
    const field = newDay(1);
    field.tap(field.hiveX, field.hiveY);
    field.aim.angle = -Math.PI / 2;
    field.tap(0, 0);

    // Long enough to outlast the flight without anybody tapping.
    advance(field, TUNING.aim.maxFlightLength / TUNING.aim.launchSpeed + 1);
    expect(field.aim.mode).toBe('idle');
    expect(field.routes.length).toBe(1);
  });

  it('carries on from the end of a line rather than starting a new one', () => {
    // Building a long route in shots is the point: three taps, then three
    // more from where the last one stopped.
    const field = newDay(1);
    field.tap(field.hiveX, field.hiveY);
    field.aim.angle = -Math.PI / 2;
    field.tap(0, 0);
    advance(field, 4);

    const route = field.routes[0]!;
    const firstLength = route.liveLength;

    field.tap(route.tipX, route.tipY);
    expect(field.aim.mode).toBe('aiming');
    expect(field.aim.routeId).toBe(route.id);

    // Sideways for the second shot: straight up again would run out of board
    // and the test would be measuring the rim rather than the mechanic.
    field.aim.angle = 0;
    field.tap(0, 0);
    advance(field, 4);

    expect(field.routes.length).toBe(1);
    expect(route.liveLength).toBeGreaterThan(firstLength);
  });

  it('never costs a line for a shot that went nowhere', () => {
    // Firing point-blank into a hedge should cost the shot, not one of the
    // five lines the player owns.
    const field = newDay(1);
    field.tap(field.hiveX, field.hiveY);
    field.tap(0, 0);
    field.aim.cancel();
    expect(field.routes.length).toBe(0);
  });
});

describe('the board has no invisible walls', () => {
  it('lets a path travel through the margins outside the maze', () => {
    // The reported bug: clear grass above a hedge that a line could not cross,
    // because the board is wider than the maze and the strip around it was
    // solid. An obstacle you cannot see is the worst kind there is.
    const field = newDay(1);
    const maze = field.maze;
    const aboveMaze = maze.originY - 40;
    expect(aboveMaze).toBeGreaterThan(0);

    expect(field.pathBlocked(200, aboveMaze, 900, aboveMaze)).toBe(false);
    expect(field.pathBlocked(600, maze.originY + 40, 600, aboveMaze)).toBe(false);

    const leftOfMaze = maze.originX - 12;
    expect(field.pathBlocked(leftOfMaze, 200, leftOfMaze, 600)).toBe(false);
  });
});
