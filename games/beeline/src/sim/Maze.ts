import type { Polyline } from './polyline.ts';

/**
 * The bramble maze the field is grown through.
 *
 * This replaces the scattered thorn circles, which the playtest called out
 * directly: _"thorns are not a great blocks, there could be paths we need to
 * draw through like labyrinths."_ That was right, and the reason is structural
 * rather than a matter of tuning. A handful of circles on an open board leaves
 * the straight line correct almost every time, so the *shape* the player draws
 * almost never matters — and a game whose only verb is drawing a shape cannot
 * afford that.
 *
 * A maze inverts it. Every route is a path that has to be found before it can
 * be drawn, so the drag stops being "point at the flower" and becomes "work out
 * how to get there, then trace it".
 *
 * ### Why a grid, and why wide
 *
 * Corridors are a whole cell across — around 150 design units, which is over
 * 45 CSS pixels on a phone in landscape. That is deliberate and it is the
 * constraint that shapes everything else here. A tight maze is unplayable with
 * a thumb: the interesting part has to be the *topology*, never the precision.
 * So the cells are generous and the difficulty comes from how many walls exist,
 * not from how narrow the gaps are.
 *
 * ### Why a spanning tree, then loops
 *
 * Generation carves a perfect maze (exactly one path between any two cells) and
 * then re-opens a fraction of the remaining walls.
 *
 * The spanning tree is what makes reachability **structural**: every cell can
 * reach every other by construction, so no flower can ever be walled off. The
 * old thorn field could only manage this with a prune pass that deleted
 * obstacles after the fact, and even that was a statistical argument.
 *
 * The loops matter just as much. A perfect maze has exactly one route to each
 * flower, which is a puzzle with a single answer — solvable, then boring. Loops
 * mean several ways round, so the decision becomes *which* way: the short
 * winding one, or the long open one that is quicker to redraw when it decays.
 * That choice is where the skill lives.
 *
 * `openness` is the single difficulty knob: 1 is an open field, 0 is a true
 * maze.
 */
export class Maze {
  readonly cols: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly originX: number;
  readonly originY: number;

  /**
   * Closed walls, as two grids of edges.
   *
   * `vertical[row * (cols + 1) + col]` is the edge to the **left** of cell
   * (col, row), so col runs 0..cols inclusive and the outer boundary is
   * included. `horizontal[row * cols + col]` is the edge **above** cell
   * (col, row), with row running 0..rows inclusive.
   */
  readonly vertical: Uint8Array;
  readonly horizontal: Uint8Array;

  constructor(
    originX: number,
    originY: number,
    width: number,
    height: number,
    cols: number,
    rows: number,
  ) {
    this.originX = originX;
    this.originY = originY;
    this.cols = Math.max(1, cols);
    this.rows = Math.max(1, rows);
    this.cellWidth = width / this.cols;
    this.cellHeight = height / this.rows;

    this.vertical = new Uint8Array((this.cols + 1) * this.rows).fill(1);
    this.horizontal = new Uint8Array(this.cols * (this.rows + 1)).fill(1);
  }

  // ---------------------------------------------------------------- geometry

  colAt(x: number): number {
    return Math.floor((x - this.originX) / this.cellWidth);
  }

  rowAt(y: number): number {
    return Math.floor((y - this.originY) / this.cellHeight);
  }

  centreOf(col: number, row: number): { x: number; y: number } {
    return {
      x: this.originX + (col + 0.5) * this.cellWidth,
      y: this.originY + (row + 0.5) * this.cellHeight,
    };
  }

  inside(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  private vIndex(col: number, row: number): number {
    return row * (this.cols + 1) + col;
  }

  private hIndex(col: number, row: number): number {
    return row * this.cols + col;
  }

  /** Whether the edge to the left of (col, row) is a wall. */
  wallLeft(col: number, row: number): boolean {
    if (row < 0 || row >= this.rows || col < 0 || col > this.cols) return true;
    return this.vertical[this.vIndex(col, row)] === 1;
  }

  /** Whether the edge above (col, row) is a wall. */
  wallAbove(col: number, row: number): boolean {
    if (col < 0 || col >= this.cols || row < 0 || row > this.rows) return true;
    return this.horizontal[this.hIndex(col, row)] === 1;
  }

  private openLeft(col: number, row: number): void {
    if (col <= 0 || col >= this.cols) return; // never open the outer boundary
    this.vertical[this.vIndex(col, row)] = 0;
  }

  private openAbove(col: number, row: number): void {
    if (row <= 0 || row >= this.rows) return;
    this.horizontal[this.hIndex(col, row)] = 0;
  }

  /** Whether a step between two edge-adjacent cells is legal. */
  canStep(fromCol: number, fromRow: number, toCol: number, toRow: number): boolean {
    if (fromCol === toCol && fromRow === toRow) return true;
    if (!this.inside(toCol, toRow)) return false;

    if (fromRow === toRow && Math.abs(fromCol - toCol) === 1) {
      return !this.wallLeft(Math.max(fromCol, toCol), fromRow);
    }
    if (fromCol === toCol && Math.abs(fromRow - toRow) === 1) {
      return !this.wallAbove(fromCol, Math.max(fromRow, toRow));
    }

    // A diagonal step clips a corner. Allowed only if both ways round are open,
    // so a route can never squeeze through the point where four walls meet.
    if (Math.abs(fromCol - toCol) === 1 && Math.abs(fromRow - toRow) === 1) {
      const viaHorizontal =
        this.canStep(fromCol, fromRow, toCol, fromRow) &&
        this.canStep(toCol, fromRow, toCol, toRow);
      const viaVertical =
        this.canStep(fromCol, fromRow, fromCol, toRow) &&
        this.canStep(fromCol, toRow, toCol, toRow);
      return viaHorizontal && viaVertical;
    }

    return false;
  }

  // ---------------------------------------------------------------- generation

  /**
   * Carves the maze: a perfect maze first, then `openness` of the remaining
   * walls removed.
   *
   * Recursive backtracker, iterative so a large grid cannot blow the stack. The
   * spanning tree it produces is what makes every cell reachable from every
   * other by construction rather than by inspection afterwards.
   */
  generate(openness: number, random: () => number = Math.random): void {
    this.vertical.fill(1);
    this.horizontal.fill(1);

    const visited = new Uint8Array(this.cols * this.rows);
    const stack: Array<[number, number]> = [];

    let col = Math.floor(random() * this.cols);
    let row = Math.floor(random() * this.rows);
    visited[row * this.cols + col] = 1;
    stack.push([col, row]);

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (!top) break;
      [col, row] = top;

      const options: Array<[number, number]> = [];
      if (col > 0 && !visited[row * this.cols + (col - 1)]) options.push([col - 1, row]);
      if (col < this.cols - 1 && !visited[row * this.cols + (col + 1)]) {
        options.push([col + 1, row]);
      }
      if (row > 0 && !visited[(row - 1) * this.cols + col]) options.push([col, row - 1]);
      if (row < this.rows - 1 && !visited[(row + 1) * this.cols + col]) {
        options.push([col, row + 1]);
      }

      if (options.length === 0) {
        stack.pop();
        continue;
      }

      const pick = options[Math.floor(random() * options.length)];
      if (!pick) {
        stack.pop();
        continue;
      }
      const [nextCol, nextRow] = pick;

      if (nextRow === row) this.openLeft(Math.max(col, nextCol), row);
      else this.openAbove(col, Math.max(row, nextRow));

      visited[nextRow * this.cols + nextCol] = 1;
      stack.push([nextCol, nextRow]);
    }

    this.carveLoops(openness, random);
  }

  /**
   * Flattens every wall in a rectangle of cells, and every wall around it.
   *
   * Called after `generate`, so the spanning tree has already guaranteed that
   * every cell is reachable; removing walls can only ever add routes, never
   * strand a cell. That ordering is the whole safety argument, and it is why
   * this is a separate pass rather than a special case inside generation.
   *
   * The boundary walls go too, not just the interior ones. A cleared rectangle
   * that kept its outer wall would be a *room*, and a room with the hive in
   * front of it is a bottleneck — the opposite of the open apron this is for.
   * `openLeft` and `openAbove` already refuse to touch the board's own edge, so
   * a region on the rim stays enclosed by the board.
   */
  clearRegion(col0: number, row0: number, col1: number, row1: number): void {
    const left = Math.max(0, Math.min(col0, col1));
    const right = Math.min(this.cols - 1, Math.max(col0, col1));
    const top = Math.max(0, Math.min(row0, row1));
    const bottom = Math.min(this.rows - 1, Math.max(row0, row1));
    if (left > right || top > bottom) return;

    // Every vertical edge from the region's left rim to its right rim
    // inclusive, so the cells inside connect to each other and to the column
    // on either side.
    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right + 1; col += 1) this.openLeft(col, row);
    }
    for (let row = top; row <= bottom + 1; row += 1) {
      for (let col = left; col <= right; col += 1) this.openAbove(col, row);
    }
  }

  /**
   * Re-opens a fraction of the interior walls.
   *
   * Without this the board is a perfect maze: exactly one route to each flower,
   * which is a puzzle with one answer and therefore a puzzle that stops being
   * one as soon as it is solved. Loops give the player a choice of route, and
   * choosing between a short winding path and a long open one is the decision
   * this whole change exists to create.
   */
  private carveLoops(openness: number, random: () => number): void {
    const chance = Math.min(1, Math.max(0, openness));
    if (chance <= 0) return;

    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 1; col < this.cols; col += 1) {
        if (random() < chance) this.openLeft(col, row);
      }
    }
    for (let row = 1; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        if (random() < chance) this.openAbove(col, row);
      }
    }
  }

  // ---------------------------------------------------------------- blocking

  /**
   * Arc distance at which `poly` first crosses a wall, searching up to `limit`.
   * `Infinity` when the whole path is clear.
   *
   * Walks the line and watches for the cell index changing, rather than testing
   * the path against every wall on the board. That is what keeps it cheap
   * enough to run for every route on every fixed step: cost is proportional to
   * the length of the route, not to how many walls exist.
   */
  blockedDistanceAlong(poly: Polyline, limit: number): number {
    const { pts, cum, count } = poly;
    if (count < 2) return Number.POSITIVE_INFINITY;

    // Fine enough that a step can never skip a whole cell, which is the only
    // way this could tunnel through a wall.
    const step = Math.min(this.cellWidth, this.cellHeight) / 8;

    let prevCol = this.colAt(pts[0] ?? 0);
    let prevRow = this.rowAt(pts[1] ?? 0);

    for (let i = 0; i < count - 1; i += 1) {
      const segStart = cum[i] ?? 0;
      if (segStart > limit) break;

      const ax = pts[i * 2] ?? 0;
      const ay = pts[i * 2 + 1] ?? 0;
      const bx = pts[(i + 1) * 2] ?? 0;
      const by = pts[(i + 1) * 2 + 1] ?? 0;
      const segLength = (cum[i + 1] ?? 0) - segStart;
      if (segLength <= 0) continue;

      const steps = Math.max(1, Math.ceil(segLength / step));
      for (let s = 1; s <= steps; s += 1) {
        const t = s / steps;
        const x = ax + (bx - ax) * t;
        const y = ay + (by - ay) * t;
        const col = this.colAt(x);
        const row = this.rowAt(y);
        if (col === prevCol && row === prevRow) continue;

        if (!this.canStep(prevCol, prevRow, col, row)) {
          return segStart + segLength * ((s - 1) / steps);
        }
        prevCol = col;
        prevRow = row;
      }
    }

    return Number.POSITIVE_INFINITY;
  }

  /** Whether the straight line a→b crosses a wall. */
  segmentBlocked(ax: number, ay: number, bx: number, by: number): boolean {
    const step = Math.min(this.cellWidth, this.cellHeight) / 8;
    const length = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(length / step));

    let prevCol = this.colAt(ax);
    let prevRow = this.rowAt(ay);

    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      const col = this.colAt(ax + (bx - ax) * t);
      const row = this.rowAt(ay + (by - ay) * t);
      if (col === prevCol && row === prevRow) continue;
      if (!this.canStep(prevCol, prevRow, col, row)) return true;
      prevCol = col;
      prevRow = row;
    }
    return false;
  }

  /**
   * Cells in breadth-first order from a starting cell, with their step count.
   *
   * Used to place flowers by how far they are through the maze rather than by
   * straight-line distance — on a maze board those are very different numbers,
   * and the one that matters to the player is the one they have to fly.
   */
  distancesFrom(startCol: number, startRow: number): Int32Array {
    const total = this.cols * this.rows;
    const dist = new Int32Array(total).fill(-1);
    if (!this.inside(startCol, startRow)) return dist;

    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    const startIndex = startRow * this.cols + startCol;
    dist[startIndex] = 0;
    queue[tail++] = startIndex;

    while (head < tail) {
      const index = queue[head++] ?? 0;
      const col = index % this.cols;
      const row = Math.floor(index / this.cols);
      const here = dist[index] ?? 0;

      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nextCol = col + dc;
        const nextRow = row + dr;
        if (!this.inside(nextCol, nextRow)) continue;
        if (!this.canStep(col, row, nextCol, nextRow)) continue;

        const nextIndex = nextRow * this.cols + nextCol;
        if ((dist[nextIndex] ?? -1) >= 0) continue;
        dist[nextIndex] = here + 1;
        queue[tail++] = nextIndex;
      }
    }

    return dist;
  }
}
