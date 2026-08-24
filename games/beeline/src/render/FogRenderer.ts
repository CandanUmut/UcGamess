// Value import, not `import type`. `Phaser.Textures.FilterMode` is read at
// runtime, and a type-only import still typechecks against the ambient Phaser
// namespace before throwing "Phaser is not defined" in the browser — a trap
// this repo has already been caught by once. See DESIGN.md section 12.
import Phaser from 'phaser';
import type { Fog } from '../sim/Fog.ts';

const TEXTURE_KEY = 'fog-grid';

/**
 * Draws the unexplored board as a dark overlay.
 *
 * One pixel per fog cell in a tiny canvas texture, stretched over the whole
 * field with linear filtering. The GPU's own bilinear interpolation does all
 * the smoothing, so a 54x30 image becomes a soft gradient across 1280x720 for
 * the cost of a single quad — no per-cell rectangles, no blur shader, and no
 * per-frame Graphics rebuild.
 *
 * Redrawn only when the fog actually changed, which after the first few seconds
 * of a day is a small fraction of frames.
 */
export class FogRenderer {
  private readonly image: Phaser.GameObjects.Image;
  private readonly texture: Phaser.Textures.CanvasTexture | null;
  private readonly pixels: ImageData | null;

  constructor(
    scene: Phaser.Scene,
    fog: Fog,
    width: number,
    height: number,
    depth: number,
  ) {
    if (scene.textures.exists(TEXTURE_KEY)) scene.textures.remove(TEXTURE_KEY);
    this.texture = scene.textures.createCanvas(TEXTURE_KEY, fog.cols, fog.rows) ?? null;

    const context = this.texture?.getContext() ?? null;
    this.pixels = context ? context.createImageData(fog.cols, fog.rows) : null;

    // LINEAR is what turns a grid of cells into weather. Without it the fog is
    // visibly a chessboard, and the player starts reading the grid instead of
    // the field.
    this.texture?.setFilter(Phaser.Textures.FilterMode.LINEAR);

    this.image = scene.add
      .image(0, 0, TEXTURE_KEY)
      .setOrigin(0, 0)
      .setDisplaySize(width, height)
      .setDepth(depth);

    this.draw(fog);
  }

  draw(fog: Fog): void {
    if (!fog.dirty) return;
    fog.dirty = false;

    const texture = this.texture;
    const pixels = this.pixels;
    if (!texture || !pixels) return;

    const data = pixels.data;
    for (let i = 0; i < fog.cells.length; i += 1) {
      const revealed = fog.cells[i] ?? 0;
      const offset = i * 4;
      // A near-black veil rather than pure black, so explored ground still
      // reads as the same field rather than as a hole cut in a curtain.
      data[offset] = 8;
      data[offset + 1] = 7;
      data[offset + 2] = 6;
      data[offset + 3] = Math.round((1 - revealed) * 255);
    }

    texture.getContext().putImageData(pixels, 0, 0);
    texture.refresh();
  }

  destroy(): void {
    this.image.destroy();
  }
}
