import { describe, expect, it } from 'vitest';
import {
  computeGameSize,
  DESIGN_ASPECT,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  MAX_CANVAS_ASPECT,
  MIN_CANVAS_ASPECT,
} from './canvasSize.ts';

/** Landscape shapes real devices actually present, including browser chrome. */
const VIEWPORTS: Array<[string, number, number]> = [
  ['desktop 16:9', 1920, 1080],
  ['laptop', 1440, 820],
  ['iPhone landscape, chrome hidden', 932, 430],
  ['iPhone landscape, Safari bars showing', 932, 330],
  ['iPhone SE landscape', 667, 320],
  ['iPad landscape', 1080, 700],
  ['tall portrait', 390, 844],
];

describe('canvas sizing', () => {
  it('always contains the whole playfield', () => {
    // The playfield is the board every player shares. If the canvas were ever
    // smaller than it in either dimension, some devices would be playing a
    // cropped board — which is both unfair and a documented rejection cause.
    for (const [name, w, h] of VIEWPORTS) {
      const size = computeGameSize(w, h);
      expect(size.width, `${name} lost playfield width`).toBeGreaterThanOrEqual(
        DESIGN_WIDTH,
      );
      expect(size.height, `${name} lost playfield height`).toBeGreaterThanOrEqual(
        DESIGN_HEIGHT,
      );
    }
  });

  it('matches the viewport shape, so nothing is letterboxed', () => {
    // The bug this exists to fix: a hard 16:9 canvas used 63% of a 932x330
    // landscape phone. Matching the shape is what gets that to 100%.
    for (const [name, w, h] of VIEWPORTS) {
      const wanted = w / h;
      if (wanted < MIN_CANVAS_ASPECT || wanted > MAX_CANVAS_ASPECT) continue;

      const size = computeGameSize(w, h);
      expect(size.width / size.height, `${name} did not match its viewport`).toBeCloseTo(
        wanted,
        1,
      );
    }
  });

  it('grows only the dimension with slack', () => {
    // Wide and short gets extra width at the design height; tall and narrow
    // gets extra height at the design width. Never both, or the playfield
    // would float in a sea of background.
    const wide = computeGameSize(2000, 700);
    expect(wide.height).toBe(DESIGN_HEIGHT);
    expect(wide.width).toBeGreaterThan(DESIGN_WIDTH);

    const tall = computeGameSize(1000, 900);
    expect(tall.width).toBe(DESIGN_WIDTH);
    expect(tall.height).toBeGreaterThan(DESIGN_HEIGHT);

    const exact = computeGameSize(1920, 1080);
    expect(exact.width).toBe(DESIGN_WIDTH);
    expect(exact.height).toBe(DESIGN_HEIGHT);
  });

  it('refuses to follow an absurd aspect ratio', () => {
    // Past the bounds we letterbox again, which is correct — nothing sensible
    // happens at 5:1, and an unbounded canvas is an unbounded amount of
    // background to paint.
    const silly = computeGameSize(5000, 400);
    expect(silly.width / silly.height).toBeCloseTo(MAX_CANVAS_ASPECT, 1);

    const narrow = computeGameSize(400, 5000);
    expect(narrow.width / narrow.height).toBeCloseTo(MIN_CANVAS_ASPECT, 1);
  });

  it('never returns a degenerate size', () => {
    for (const [w, h] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [-100, -100],
    ]) {
      const size = computeGameSize(w ?? 0, h ?? 0);
      expect(Number.isFinite(size.width)).toBe(true);
      expect(Number.isFinite(size.height)).toBe(true);
      expect(size.width).toBeGreaterThanOrEqual(DESIGN_WIDTH);
      expect(size.height).toBeGreaterThanOrEqual(DESIGN_HEIGHT);
    }
  });

  it('keeps the design aspect as the hinge between the two cases', () => {
    const atDesign = computeGameSize(DESIGN_WIDTH, DESIGN_HEIGHT);
    expect(atDesign.width).toBe(DESIGN_WIDTH);
    expect(atDesign.height).toBe(DESIGN_HEIGHT);
    expect(DESIGN_ASPECT).toBeCloseTo(16 / 9, 5);
  });
});
