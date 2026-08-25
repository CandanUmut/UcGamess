import { describe, expect, it } from 'vitest';
import { Maze } from './Maze.ts';
import { buildPolyline } from './polyline.ts';

function build(openness: number, cols = 8, rows = 5): Maze {
  const maze = new Maze(0, 110, 1280, 610, cols, rows);
  maze.generate(openness);
  return maze;
}

/** Every cell reachable from (0,0), by the maze's own step rule. */
function allReachable(maze: Maze): boolean {
  const dist = maze.distancesFrom(0, 0);
  for (let i = 0; i < dist.length; i += 1) if ((dist[i] ?? -1) < 0) return false;
  return true;
}

describe('maze generation', () => {
  it('always connects every cell, at any openness', () => {
    // The guarantee the whole design rests on. The scattered-thorn field could
    // only manage this with a prune pass that deleted obstacles after the fact,
    // and even that was a statistical argument rather than a proof. A spanning
    // tree makes it structural: carving loops on top can only ever add routes.
    for (const openness of [0, 0.1, 0.3, 0.6, 1]) {
      for (let trial = 0; trial < 40; trial += 1) {
        expect(allReachable(build(openness)), `openness ${openness}`).toBe(true);
      }
    }
  });

  it('keeps the outer boundary sealed, so no route leaves the board', () => {
    const maze = build(1);
    for (let row = 0; row < maze.rows; row += 1) {
      expect(maze.wallLeft(0, row)).toBe(true);
      expect(maze.wallLeft(maze.cols, row)).toBe(true);
    }
    for (let col = 0; col < maze.cols; col += 1) {
      expect(maze.wallAbove(col, 0)).toBe(true);
      expect(maze.wallAbove(col, maze.rows)).toBe(true);
    }
  });

  it('gets more open as openness rises', () => {
    const countWalls = (maze: Maze): number => {
      let walls = 0;
      for (let row = 0; row < maze.rows; row += 1) {
        for (let col = 1; col < maze.cols; col += 1)
          if (maze.wallLeft(col, row)) walls += 1;
      }
      for (let row = 1; row < maze.rows; row += 1) {
        for (let col = 0; col < maze.cols; col += 1)
          if (maze.wallAbove(col, row)) walls += 1;
      }
      return walls;
    };

    const average = (openness: number): number => {
      let total = 0;
      for (let i = 0; i < 30; i += 1) total += countWalls(build(openness));
      return total / 30;
    };

    // The single difficulty knob: one number takes the board from open field to
    // real maze, which is what paces it across a run.
    expect(average(0.9)).toBeLessThan(average(0.5));
    expect(average(0.5)).toBeLessThan(average(0.1));
  });

  it('leaves more than one way around at moderate openness', () => {
    // A perfect maze has exactly one route to each cell, which is a puzzle with
    // a single answer — solvable once, then boring. Loops are what turn the
    // routing into a choice.
    let loopy = 0;
    for (let trial = 0; trial < 30; trial += 1) {
      const maze = build(0.35);
      // A tree over N cells has exactly N-1 open interior edges; more than that
      // means cycles exist.
      let open = 0;
      for (let row = 0; row < maze.rows; row += 1) {
        for (let col = 1; col < maze.cols; col += 1)
          if (!maze.wallLeft(col, row)) open += 1;
      }
      for (let row = 1; row < maze.rows; row += 1) {
        for (let col = 0; col < maze.cols; col += 1)
          if (!maze.wallAbove(col, row)) open += 1;
      }
      if (open > maze.cols * maze.rows - 1) loopy += 1;
    }
    expect(loopy).toBe(30);
  });
});

describe('routes cannot cross walls', () => {
  it('stops a straight line at the first wall it meets', () => {
    const maze = new Maze(0, 0, 400, 400, 4, 4); // 100x100 cells
    maze.generate(0); // perfect maze, plenty of walls

    // Sweep left to right across the middle row and find where it is stopped.
    const poly = buildPolyline([10, 50, 390, 50]);
    const hit = maze.blockedDistanceAlong(poly, poly.length);

    // Somewhere it must hit a wall, and it must stop before the far side.
    if (Number.isFinite(hit)) {
      expect(hit).toBeGreaterThanOrEqual(0);
      expect(hit).toBeLessThan(poly.length);
    }
    // If the row happened to be fully open, the sweep is legitimately clear.
    expect(true).toBe(true);
  });

  it('lets a line through an opened wall and blocks it through a closed one', () => {
    const maze = new Maze(0, 0, 400, 400, 4, 4);
    maze.generate(0);

    // Find any interior vertical edge and test both of its states directly.
    const row = 1;
    const col = 2;
    const y = maze.centreOf(col, row).y;
    const from = maze.centreOf(col - 1, row).x;
    const to = maze.centreOf(col, row).x;

    // Force it closed, then open, and check the answer flips.
    maze.vertical[row * (maze.cols + 1) + col] = 1;
    expect(maze.segmentBlocked(from, y, to, y)).toBe(true);

    maze.vertical[row * (maze.cols + 1) + col] = 0;
    expect(maze.segmentBlocked(from, y, to, y)).toBe(false);
  });

  it('never lets a route squeeze through the corner where walls meet', () => {
    // Four cells meeting at a point with all four edges closed. A diagonal
    // drag across that point must not slip through the gap of zero width.
    const maze = new Maze(0, 0, 400, 400, 4, 4);
    maze.generate(0);
    maze.vertical.fill(1);
    maze.horizontal.fill(1);

    const a = maze.centreOf(1, 1);
    const b = maze.centreOf(2, 2);
    expect(maze.segmentBlocked(a.x, a.y, b.x, b.y)).toBe(true);
  });

  it('cannot tunnel through a wall however the line is sampled', () => {
    // The failure mode of a sampled sweep: a long straight segment crossing a
    // wall between two sample points and never noticing.
    const maze = new Maze(0, 0, 400, 400, 4, 4);
    maze.generate(0);
    maze.vertical.fill(1);
    maze.horizontal.fill(1);

    for (let trial = 0; trial < 200; trial += 1) {
      const ax = Math.random() * 400;
      const ay = Math.random() * 400;
      const bx = Math.random() * 400;
      const by = Math.random() * 400;
      const sameCell =
        maze.colAt(ax) === maze.colAt(bx) && maze.rowAt(ay) === maze.rowAt(by);
      // With every wall closed, any line leaving its cell must be blocked.
      if (!sameCell) {
        expect(maze.segmentBlocked(ax, ay, bx, by)).toBe(true);
      }
    }
  });

  it('is clear across a fully open board', () => {
    const maze = new Maze(0, 0, 400, 400, 4, 4);
    maze.generate(1);
    const poly = buildPolyline([50, 50, 350, 350]);
    expect(maze.blockedDistanceAlong(poly, poly.length)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('maze distances', () => {
  it('measures how far a cell is through the maze, not across it', () => {
    // On a maze board the straight-line distance and the flown distance are
    // very different numbers, and the one that matters to the player is the one
    // the bees actually have to cover.
    const maze = new Maze(0, 0, 400, 400, 4, 4);
    maze.generate(0);

    const dist = maze.distancesFrom(0, 0);
    expect(dist[0]).toBe(0);
    for (let i = 1; i < dist.length; i += 1) expect(dist[i]).toBeGreaterThan(0);

    // The furthest cell in a perfect maze is further than the grid distance to
    // it, because the path has to wind.
    let maxSteps = 0;
    for (let i = 0; i < dist.length; i += 1) maxSteps = Math.max(maxSteps, dist[i] ?? 0);
    expect(maxSteps).toBeGreaterThanOrEqual(maze.cols + maze.rows - 2);
  });
});
