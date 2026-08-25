import { describe, expect, it } from 'vitest';
import { Maze } from './Maze.ts';
import { slideAlongWalls } from './deflect.ts';
import { buildPolyline } from './polyline.ts';
import { Field } from './Field.ts';
import { featuresForDay, patchesForDay } from '../game/DayCycle.ts';
import { commitDrag, resolveDragStart } from '../game/RouteIntent.ts';

/** An 8x4 board of 100x100 cells with every interior wall removed. */
function openField(): Maze {
  const maze = new Maze(0, 0, 800, 400, 8, 4);
  maze.vertical.fill(0);
  maze.horizontal.fill(0);
  return maze;
}

/** Closes the edge above every cell in `row`, making one long wall. */
function wallAcross(maze: Maze, row: number): void {
  for (let col = 0; col < maze.cols; col += 1) {
    maze.horizontal[row * maze.cols + col] = 1;
  }
}

/** Closes the edge to the left of every cell in `col`. */
function wallDown(maze: Maze, col: number): void {
  for (let row = 0; row < maze.rows; row += 1) {
    maze.vertical[row * (maze.cols + 1) + col] = 1;
  }
}

function line(ax: number, ay: number, bx: number, by: number, step = 10): number[] {
  const span = Math.hypot(bx - ax, by - ay);
  const count = Math.max(2, Math.ceil(span / step));
  const out: number[] = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
  }
  return out;
}

function length(coords: readonly number[]): number {
  let total = 0;
  for (let i = 2; i < coords.length; i += 2) {
    total += Math.hypot(
      (coords[i] ?? 0) - (coords[i - 2] ?? 0),
      (coords[i + 1] ?? 0) - (coords[i - 1] ?? 0),
    );
  }
  return total;
}

/** Whether the maze itself considers the whole path clear. */
function isClear(maze: Maze, coords: readonly number[]): boolean {
  const poly = buildPolyline(coords);
  return !Number.isFinite(maze.blockedDistanceAlong(poly, poly.length));
}

describe('slideAlongWalls', () => {
  it('leaves a path that never meets a wall exactly as it was drawn', () => {
    const maze = openField();
    const coords = line(50, 150, 750, 150);
    const slid = slideAlongWalls(coords, maze);

    expect(slid.contact).toBeNull();
    expect(slid.jammed).toBe(false);
    expect(slid.coords).toEqual(coords);
  });

  it('runs a wobbly trace along the wall instead of ending it there', () => {
    // The case the whole change exists for: the player has picked the right
    // corridor and traced it with a thumb, drifting into the side wall. The old
    // rule threw away everything past the drift.
    const maze = openField();
    wallAcross(maze, 1); // a wall along y = 100

    const coords = line(50, 150, 750, 50); // drifts up through the wall
    const slid = slideAlongWalls(coords, maze);

    expect(slid.contact).not.toBeNull();
    expect(isClear(maze, slid.coords)).toBe(true);

    // It kept going: the along-wall component of the drag survived in full.
    const endX = slid.coords[slid.coords.length - 2] ?? 0;
    expect(endX).toBeGreaterThan(700);

    // And it never got through the wall.
    for (let i = 1; i < slid.coords.length; i += 2) {
      expect(slid.coords[i]).toBeGreaterThanOrEqual(100);
    }
  });

  it('keeps far more of the drag than clipping at the wall would', () => {
    const maze = openField();
    wallAcross(maze, 1);

    const coords = line(50, 150, 750, 50);
    const poly = buildPolyline(coords);
    const clipped = maze.blockedDistanceAlong(poly, poly.length);
    const slid = slideAlongWalls(coords, maze);

    // The old behaviour kept only `clipped` worth of line.
    expect(Number.isFinite(clipped)).toBe(true);
    expect(length(slid.coords)).toBeGreaterThan(clipped * 2);
  });

  it('turns a corner rather than stopping at the wall that forms it', () => {
    // Drag right along a corridor that is closed at its end but open upward.
    const maze = openField();
    wallDown(maze, 5); // a wall along x = 500

    const coords = [...line(50, 250, 700, 250), ...line(700, 250, 700, 60)];
    const slid = slideAlongWalls(coords, maze);

    expect(slid.contact).not.toBeNull();
    expect(isClear(maze, slid.coords)).toBe(true);

    // Stopped short of the wall on x, but the upward part of the drag still
    // moved it — which is the slide doing its job at a corner.
    const endX = slid.coords[slid.coords.length - 2] ?? 0;
    const endY = slid.coords[slid.coords.length - 1] ?? 0;
    expect(endX).toBeLessThanOrEqual(500);
    expect(endY).toBeLessThan(200);
  });

  it('absorbs a drag pushed into an inside corner, and says so', () => {
    // A pocket closed on the right and below: a drag pushed into the corner has
    // no component either axis will take, so it goes nowhere — but the walk
    // still consumes it and still terminates.
    const maze = openField();
    wallDown(maze, 1);
    wallAcross(maze, 1);

    const slid = slideAlongWalls(line(50, 50, 700, 350), maze);

    expect(slid.jammed).toBe(true);
    expect(isClear(maze, slid.coords)).toBe(true);
    expect(Number.isFinite(length(slid.coords))).toBe(true);
  });

  it('is stable: sliding an already-slid path changes nothing', () => {
    // What makes this safe to run on every live route on every fixed step. If
    // it crept, a road resting against a wall would drift along it forever.
    const maze = openField();
    wallAcross(maze, 1);

    const once = slideAlongWalls(line(50, 150, 750, 50), maze);
    const twice = slideAlongWalls(once.coords, maze);

    expect(twice.contact).toBeNull();
    expect(twice.coords).toEqual(once.coords);
  });

  it('never returns a path the maze would then cut', () => {
    // The load-bearing property. If a slid path could still read as blocked,
    // the per-step recheck would sever it on the very next frame and the whole
    // change would be invisible.
    const maze = new Maze(0, 0, 800, 400, 8, 4);
    let checked = 0;

    for (let seed = 0; seed < 40; seed += 1) {
      let state = seed * 2654435761 + 1;
      const random = (): number => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
      };
      maze.generate(0.25, random);

      for (const [ax, ay, bx, by] of [
        [60, 60, 740, 340],
        [740, 60, 60, 340],
        [400, 30, 400, 370],
        [60, 200, 740, 200],
      ] as const) {
        const slid = slideAlongWalls(line(ax, ay, bx, by), maze);
        expect(isClear(maze, slid.coords), `seed ${seed}`).toBe(true);
        checked += 1;
      }
    }

    expect(checked).toBe(160);
  });
});

describe('drawing into a maze wall', () => {
  /** A real board on a day the maze is actually carved. */
  function newDay(day: number): Field {
    const field = new Field();
    field.beginDay(day, featuresForDay(day), patchesForDay(day), 1);
    return field;
  }

  it('keeps the route going instead of ending it at the first wall', () => {
    // The end-to-end version of the fix, on real generated boards. A straight
    // drag from the hive at a flower crosses walls on almost every seed; what
    // matters is that what comes back is a working route rather than the stub
    // the old rule left behind.
    let blockedBoards = 0;

    for (let trial = 0; trial < 60; trial += 1) {
      const field = newDay(8);
      const patch = field.patches.find((candidate) => candidate.alive);
      if (!patch) continue;

      const coords = line(field.hiveX, field.hiveY, patch.x, patch.y, 8);
      const straight = buildPolyline(coords);
      const cutAt = field.maze.blockedDistanceAlong(straight, straight.length);
      if (!Number.isFinite(cutAt)) continue; // this seed had a clear shot
      blockedBoards += 1;

      const intent = resolveDragStart(field, field.hiveX, field.hiveY);
      const result = commitDrag(field, intent, coords);

      expect(result.deflectedAt, `trial ${trial}`).not.toBeNull();

      const route = field.routeById(result.routeId);
      if (!route) {
        // Only acceptable when the drag jammed immediately against a wall in
        // the hive's own cell, which leaves nothing to build a route from.
        expect(cutAt, `trial ${trial} produced no route`).toBeLessThan(40);
        continue;
      }

      // The committed route is clear: it will not be severed on the next step.
      expect(
        field.blockedDistance(route.poly, route.poly.length),
        `trial ${trial} committed a blocked route`,
      ).toBe(Number.POSITIVE_INFINITY);

      // And it kept meaningfully more than clipping at the wall would have.
      expect(route.poly.length, `trial ${trial} was no better than a clip`)
        .toBeGreaterThan(cutAt);
    }

    // If no board ever blocked the straight line the assertions above never
    // ran, and this test would be passing vacuously.
    expect(blockedBoards).toBeGreaterThan(10);
  });

  it('never leaves a live route that the next step would cut', () => {
    // Routes are re-checked every fixed step, so a deflection that produced a
    // still-blocked path would show up as a route that dies a frame later.
    for (let trial = 0; trial < 20; trial += 1) {
      const field = newDay(10);
      const patch = field.patches.find((candidate) => candidate.alive);
      if (!patch) continue;

      const intent = resolveDragStart(field, field.hiveX, field.hiveY);
      commitDrag(field, intent, line(field.hiveX, field.hiveY, patch.x, patch.y, 8));

      for (let step = 0; step < 120; step += 1) field.step(1 / 60);

      for (const route of field.routes) {
        expect(
          field.blockedDistance(route.poly, route.liveLength),
          `trial ${trial} left a blocked live route`,
        ).toBe(Number.POSITIVE_INFINITY);
      }
    }
  });
});
