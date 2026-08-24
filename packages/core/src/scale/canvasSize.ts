/**
 * Canvas geometry. Deliberately free of any Phaser import.
 *
 * This is pure arithmetic about rectangles, and keeping it that way means it
 * can be unit tested in a plain node environment rather than dragging a whole
 * WebGL-capable DOM in behind it — the same split the games use between their
 * simulation and their renderers.
 */

/**
 * The design resolution every game is authored against.
 *
 * 1280x720 is 16:9, which is what portals embed. Authoring at a single fixed
 * size and letting the scale manager fit it means a scene laid out on a desktop
 * is automatically correct on a phone — no per-device layout code, and no
 * chance of UI drifting off-screen on an aspect ratio nobody tested.
 */
export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;
export const DESIGN_ASPECT = DESIGN_WIDTH / DESIGN_HEIGHT;

/**
 * How far the canvas may depart from 16:9 to match the device.
 *
 * A hard-locked 16:9 canvas wastes a great deal of a real phone. A landscape
 * iPhone with Safari's tab bar and toolbar showing is about 2.8:1 — not the
 * 2.17:1 the raw screen suggests — and fitting 16:9 into that leaves 37% of the
 * display as black bars. Measured, not guessed: at 932x330 the canvas used 63%
 * of the screen.
 *
 * So the canvas takes the device's aspect within these bounds, and the
 * playfield stays a fixed 1280x720 centred inside it. Every player gets exactly
 * the same board — which matters for any game that balances on distance — and
 * the space that used to be bars becomes background the HUD can spread into.
 *
 * Beyond these bounds we letterbox again, which is correct: nothing sensible
 * happens at 5:1, and an unbounded canvas is an unbounded amount of background
 * to paint.
 */
export const MIN_CANVAS_ASPECT = 1.2;
export const MAX_CANVAS_ASPECT = 3.2;

export interface CanvasSize {
  width: number;
  height: number;
}

/**
 * The canvas size that fills a viewport of this shape.
 *
 * The playfield is always fully contained: the canvas grows in whichever
 * dimension has slack and never shrinks below the design size in either. So a
 * wide short phone gets extra width, a squarish tablet gets extra height, and
 * both see the same board.
 */
export function computeGameSize(
  viewportWidth: number,
  viewportHeight: number,
): CanvasSize {
  const width = Number.isFinite(viewportWidth) ? Math.max(viewportWidth, 1) : 1;
  const height = Number.isFinite(viewportHeight) ? Math.max(viewportHeight, 1) : 1;

  const aspect = Math.min(MAX_CANVAS_ASPECT, Math.max(MIN_CANVAS_ASPECT, width / height));

  if (aspect >= DESIGN_ASPECT) {
    return { width: Math.round(DESIGN_HEIGHT * aspect), height: DESIGN_HEIGHT };
  }
  return { width: DESIGN_WIDTH, height: Math.round(DESIGN_WIDTH / aspect) };
}
