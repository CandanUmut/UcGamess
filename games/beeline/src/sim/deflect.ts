import { buildPolyline, truncateCoords } from './polyline.ts';
import type { Maze } from './Maze.ts';

/**
 * Stops a drawn leg at the first hedge it meets.
 *
 * Lines used to *slide* along a hedge they were pressed into, which forgave a
 * wobbly trace — and also bent a straight drag round the end of the hedge on
 * its own, so aiming at a flower behind one reached it anyway. Players saw the
 * line route itself and, rightly, asked what the hedges were for. A hedge is
 * the puzzle: getting past one is the player's move, made by curving the drag
 * round its end (the drag pins a bend where the finger turns) or by dragging
 * on from a line's tip.
 *
 * Corridors are a whole cell wide, so a trace down the middle of one never
 * grazes a hedge; precision is not the tax here, the route is.
 */

export interface WallStop {
  /** The leg, up to where it met a hedge. */
  coords: number[];
  /** Where it met a hedge, for the impact effect. Null when it was clear. */
  contact: { x: number; y: number } | null;
}

/**
 * Cuts `coords` where they first cross a hedge, by the maze's own test — the
 * same one that would sever a live route — so a leg is never drawn that the
 * next step would cut. Returns the coordinates untouched when they are clear.
 */
export function stopAtWalls(coords: readonly number[], maze: Maze): WallStop {
  if (coords.length < 4) return { coords: [...coords], contact: null };
  const poly = buildPolyline(coords);
  const hit = maze.blockedDistanceAlong(poly, poly.length);
  if (!Number.isFinite(hit)) return { coords: [...coords], contact: null };
  const cut = truncateCoords(poly, hit);
  return {
    coords: cut,
    contact: {
      x: cut[cut.length - 2] ?? coords[0] ?? 0,
      y: cut[cut.length - 1] ?? coords[1] ?? 0,
    },
  };
}
