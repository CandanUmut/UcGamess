import { describe, expect, it } from 'vitest';
import { Maze } from './Maze.ts';
import { stopAtWalls } from './deflect.ts';
import { buildPolyline } from './polyline.ts';
import { Field } from './Field.ts';
import { featuresForDay, patchesForDay } from '../game/DayCycle.ts';

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

/** Closes the left edge of `col` on the given rows only. */
function wallDownRows(maze: Maze, col: number, rows: number[]): void {
  for (const row of rows) maze.vertical[row * (maze.cols + 1) + col] = 1;
}

describe('stopAtWalls', () => {
  it('leaves a path that never meets a wall exactly as it was drawn', () => {
    const coords = line(50, 150, 750, 150);
    const stop = stopAtWalls(coords, openField());
    expect(stop.contact).toBeNull();
    expect(stop.coords).toEqual(coords);
  });

  it('stops a straight drag at the hedge instead of steering round it', () => {
    // A hedge down column 4 with a gap in the bottom row: the straight drag
    // across row 1 must end at the hedge, not slide down to the gap.
    const maze = openField();
    wallDownRows(maze, 4, [0, 1, 2]);
    const stop = stopAtWalls(line(50, 150, 750, 150), maze);
    expect(stop.contact).not.toBeNull();
    const tipX = stop.coords[stop.coords.length - 2] ?? 0;
    expect(tipX).toBeLessThanOrEqual(400);
    expect(length(stop.coords)).toBeLessThan(360);
  });

  it('lets a drag that goes round the end of the hedge through', () => {
    const maze = openField();
    wallDownRows(maze, 4, [0, 1, 2]);
    const around = [
      ...line(50, 150, 350, 350),
      ...line(350, 350, 450, 350).slice(2),
      ...line(450, 350, 750, 150).slice(2),
    ];
    const stop = stopAtWalls(around, maze);
    expect(stop.contact).toBeNull();
    expect(stop.coords[stop.coords.length - 2]).toBeCloseTo(750);
  });

  it('never returns a path the maze would then cut', () => {
    const maze = openField();
    wallAcross(maze, 2);
    wallDown(maze, 5);
    for (let a = 0; a < 12; a += 1) {
      const ax = 30 + a * 60;
      const stop = stopAtWalls(line(ax, 40, 780 - ax, 380), maze);
      expect(isClear(maze, stop.coords), `drag ${a}`).toBe(true);
    }
  });
});

describe('drawing into a maze wall', () => {
  /** A real board on a day the maze is actually carved. */
  function newDay(day: number): Field {
    const field = new Field();
    field.beginDay(day, featuresForDay(day), patchesForDay(day), 1);
    return field;
  }

  it('ends a straight line at the first hedge in its way', () => {
    let blocked = 0;
    for (let trial = 0; trial < 40; trial += 1) {
      const field = newDay(8);
      const patch = field.patches.find((candidate) => candidate.alive);
      if (!patch) continue;
      const straight = buildPolyline(line(field.hiveX, field.hiveY, patch.x, patch.y, 8));
      const cutAt = field.maze.blockedDistanceAlong(straight, straight.length);
      if (!Number.isFinite(cutAt)) continue;
      blocked += 1;
      const plan = field.planLine(
        { x: field.hiveX, y: field.hiveY, route: null },
        patch.x,
        patch.y,
      );
      expect(plan.contact, `trial ${trial}`).not.toBeNull();
      expect(plan.target, `trial ${trial} reached through a hedge`).not.toBe(patch);
      expect(length(plan.coords)).toBeLessThan(
        Math.hypot(patch.x - field.hiveX, patch.y - field.hiveY),
      );
    }
    expect(blocked).toBeGreaterThan(5);
  });

  it('never leaves a live route that the next step would cut', () => {
    // Routes are re-checked every fixed step, so a deflection that produced a
    // still-blocked path would show up as a route that dies a frame later.
    for (let trial = 0; trial < 20; trial += 1) {
      const field = newDay(10);
      const patch = field.patches.find((candidate) => candidate.alive);
      if (!patch) continue;

      field.commitLine(
        field.planLine({ x: field.hiveX, y: field.hiveY, route: null }, patch.x, patch.y),
      );

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
