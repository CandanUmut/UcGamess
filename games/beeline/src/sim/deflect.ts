import { buildPolyline, pushIfSpaced, truncateCoords } from './polyline.ts';
import type { Maze } from './Maze.ts';

/**
 * Slides a drawn path along the maze walls instead of severing it at them.
 *
 * The old rule was that a line touching a wall simply ended there. On a field
 * of scattered thorn circles that was survivable; on a maze it is the single
 * most frustrating thing the game does, because a maze *is* walls. Every drag
 * runs along one for most of its length, and asking a thumb to trace a corridor
 * without ever grazing its sides is asking for precision the design explicitly
 * refuses to require — corridors are wide precisely so that "the interesting
 * part is the topology, never the precision".
 *
 * Clipping broke that promise. A player who had read the maze correctly, chosen
 * a good route and traced it with an ordinary thumb still lost the whole line
 * past the first wobble. The mistake being punished was not a routing mistake.
 *
 * Sliding fixes it in the way every game with walls has fixed it: when a step
 * cannot be taken, take the part of it that can. A drag pressed into a wall
 * runs *along* the wall, so a sloppy trace of the right corridor produces the
 * right corridor, while a drag aimed at a wall with no way through still goes
 * nowhere — the topology is still the puzzle, only the precision tax is gone.
 *
 * ### Why sliding and not reflecting
 *
 * A true bounce would send the line away from the wall at an angle, so the
 * obstacle would decide where the route goes and a drag into a corridor wall
 * would leave the corridor. Sliding keeps the player's intent — the component
 * of the drag the wall permits — and simply drops the component it does not.
 */

export interface WallSlide {
  /** The path, kept clear of every wall. */
  coords: number[];
  /** Where it first met a wall, for the impact effect. Null when it was clear. */
  contact: { x: number; y: number } | null;
  /**
   * True when some of the drag was pressed into a corner that would take
   * neither axis, and was therefore absorbed rather than drawn.
   *
   * Not a failure and not a stop: the walk keeps consuming the drag, so a path
   * that jams on one wall and later turns away from it still gets the rest of
   * its length. It is reported only so a caller can tell "the wall shaped this"
   * from "the wall ate some of this".
   */
  jammed: boolean;
}

/**
 * Whether a point may move from one place to another without crossing a wall.
 *
 * Expressed in cells because that is what the maze knows: `canStep` answers for
 * a pair of adjacent cells, and any movement inside a single cell is free.
 */
function canReach(maze: Maze, fromX: number, fromY: number, toX: number, toY: number): boolean {
  const fromCol = maze.colAt(fromX);
  const fromRow = maze.rowAt(fromY);
  const toCol = maze.colAt(toX);
  const toRow = maze.rowAt(toY);
  if (fromCol === toCol && fromRow === toRow) return true;
  return maze.canStep(fromCol, fromRow, toCol, toRow);
}

/**
 * Walks `coords`, sliding along any wall it is pressed into.
 *
 * Returns the original coordinates untouched when the path never meets a wall,
 * which is the common case for a route the player traced carefully — and this
 * runs on every live route every fixed step, so the clear path costs one scan
 * and no allocation beyond the copy.
 */
export function slideAlongWalls(coords: readonly number[], maze: Maze): WallSlide {
  if (coords.length < 4) {
    return { coords: [...coords], contact: null, jammed: false };
  }

  // Matched to the maze's own blocked-distance scan. Any coarser and a single
  // step could cross a whole cell, which is the one way this could tunnel
  // through a wall rather than slide along it.
  const step = Math.min(maze.cellWidth, maze.cellHeight) / 8;

  let px = coords[0] ?? 0;
  let py = coords[1] ?? 0;

  const out: number[] = [px, py];
  let contact: { x: number; y: number } | null = null;
  let jammed = false;
  let touched = false;

  for (let i = 2; i < coords.length; i += 2) {
    const tx = coords[i] ?? 0;
    const ty = coords[i + 1] ?? 0;
    const prevX = coords[i - 2] ?? 0;
    const prevY = coords[i - 1] ?? 0;

    const spanX = tx - prevX;
    const spanY = ty - prevY;
    const span = Math.hypot(spanX, spanY);
    const steps = Math.max(1, Math.ceil(span / step));

    for (let s = 1; s <= steps; s += 1) {
      const dx = spanX / steps;
      const dy = spanY / steps;

      if (canReach(maze, px, py, px + dx, py + dy)) {
        px += dx;
        py += dy;
      } else {
        // The wall took the step. Give back whichever component of it the wall
        // does not block — that is the slide.
        touched = true;
        contact ??= { x: px, y: py };

        const freeX = dx !== 0 && canReach(maze, px, py, px + dx, py);
        const freeY = dy !== 0 && canReach(maze, px, py, px, py + dy);

        if (freeX) {
          px += dx;
        } else if (freeY) {
          py += dy;
        } else {
          // An inside corner: neither axis is available, so this slice of the
          // drag is simply absorbed.
          //
          // The walk deliberately does *not* give up here. It used to, and that
          // was wrong in the most ordinary way there is: a drag that runs into
          // the end of a corridor and then turns to follow it jams on the first
          // leg and is perfectly fine on the second, and abandoning the whole
          // gesture threw the turn away. Every step consumes input whether or
          // not the position moves, so the walk always terminates regardless.
          jammed = true;
        }
      }

      pushIfSpaced(out, px, py, step);
    }
  }

  // Always land the final position, even if it is closer than the spacing —
  // the tip is what a refresh drag starts from and what `reachesTarget` reads,
  // so it must be exactly where the walk finished.
  const lastX = out[out.length - 2];
  const lastY = out[out.length - 1];
  if (lastX !== px || lastY !== py) out.push(px, py);

  if (!touched) {
    return { coords: [...coords], contact: null, jammed: false };
  }

  // Safety net, not an expectation.
  //
  // The slide is validated against exactly the test `Maze.blockedDistanceAlong`
  // applies, at exactly its sampling rate, so the path it produces should
  // already be clear. But the emitted points are sparser than the walk, and a
  // straight segment between two of them is not quite the arc the walk took —
  // so if the maze disagrees, the maze wins, and the path is trimmed rather
  // than handed back to be cut on the very next fixed step.
  const poly = buildPolyline(out);
  const hit = maze.blockedDistanceAlong(poly, poly.length);
  if (Number.isFinite(hit)) {
    return { coords: truncateCoords(poly, hit), contact, jammed: true };
  }

  return { coords: out, contact, jammed };
}
