import { TUNING } from '../config/tuning.ts';

/**
 * What the player has seen of the field today.
 *
 * The game was missing scarcity, and the scarcest thing a board can offer is
 * **information**. With the whole field lit there is nothing to learn about it:
 * the best flower is visible from the first frame, so the drag is an execution
 * of a decision the eye already made. Take the light away and the board becomes
 * something the player builds knowledge of over a day.
 *
 * Three rules keep it fair rather than annoying:
 *
 *  - **Bees carry the light.** Drawing a line into the dark sends bees down it
 *    and they light it as they go, so exploring is the verb the player already
 *    has. There is no scout button and no second mode.
 *  - **What is seen stays seen.** Fog only ever retreats within a day, so the
 *    board gets easier as the day goes on and no one is ever punished for
 *    looking away. Live-only vision would mean re-scouting ground you already
 *    paid for, which is busywork wearing a mechanic's clothes.
 *  - **The hive lights its own neighbourhood at dawn**, sized so day one's
 *    flowers are visible from the start. The tutorial is untouched; later days
 *    push flowers past the light, which is what walks the player into the dark.
 *
 * A flat grid rather than anything cleverer. At a 24px cell the whole board is
 * 1620 cells, which is small enough to sweep every fixed step without noticing
 * and coarse enough that no player can act on the difference.
 */
export class Fog {
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;

  /** 0 = unseen, 1 = fully lit. Never decreases within a day. */
  readonly cells: Float32Array;

  /** Set whenever a cell changes, so the renderer can skip untouched frames. */
  dirty = true;

  constructor(width: number, height: number, cellSize = TUNING.fog.cellSize) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.cells = new Float32Array(this.cols * this.rows);
  }

  /**
   * Lights the whole board.
   *
   * Used at dawn now that planning is the game: choosing which blooms to give
   * up is not a decision if the alternatives are invisible.
   */
  revealAll(): void {
    this.cells.fill(1);
    this.dirty = true;
  }

  clear(): void {
    this.cells.fill(0);
    this.dirty = true;
  }

  /** How lit the cell containing (x, y) is. */
  revealedAt(x: number, y: number): number {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return 0;
    return this.cells[row * this.cols + col] ?? 0;
  }

  /** Whether something at (x, y) counts as found. */
  isDiscovered(x: number, y: number): boolean {
    return this.revealedAt(x, y) >= TUNING.fog.discoverAt;
  }

  /**
   * Lights a disc, brightest at the centre.
   *
   * Cells keep the brightest value they have ever had, so ground walked over
   * repeatedly ends up fully lit while somewhere glimpsed once from the edge of
   * a bee's sight stays dim. That gives the map a legible sense of how well
   * known each part of it is, for free.
   */
  reveal(x: number, y: number, radius: number): void {
    const { cellSize, cols, rows, cells } = this;
    const edge = TUNING.fog.edgeReveal;

    const minCol = Math.max(0, Math.floor((x - radius) / cellSize));
    const maxCol = Math.min(cols - 1, Math.floor((x + radius) / cellSize));
    const minRow = Math.max(0, Math.floor((y - radius) / cellSize));
    const maxRow = Math.min(rows - 1, Math.floor((y + radius) / cellSize));
    if (minCol > maxCol || minRow > maxRow) return;

    const radiusSq = radius * radius;
    const half = cellSize * 0.5;

    for (let row = minRow; row <= maxRow; row += 1) {
      const cy = row * cellSize + half;
      const dy = cy - y;
      for (let col = minCol; col <= maxCol; col += 1) {
        const cx = col * cellSize + half;
        const dx = cx - x;
        const distSq = dx * dx + dy * dy;
        if (distSq > radiusSq) continue;

        // Linear falloff from 1 at the centre to `edgeReveal` at the rim.
        const t = Math.sqrt(distSq) / radius;
        const strength = 1 - (1 - edge) * t;

        const index = row * cols + col;
        if ((cells[index] ?? 0) >= strength) continue;
        cells[index] = strength;
        this.dirty = true;
      }
    }
  }

  /** Fraction of the board lit at all. Used for the explored readout. */
  exploredFraction(): number {
    let seen = 0;
    for (let i = 0; i < this.cells.length; i += 1) {
      if ((this.cells[i] ?? 0) >= TUNING.fog.discoverAt) seen += 1;
    }
    return this.cells.length > 0 ? seen / this.cells.length : 0;
  }
}
