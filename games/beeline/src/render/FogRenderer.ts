// Value import, not `import type`. `Phaser.Textures.FilterMode` is read at
// runtime, and a type-only import still typechecks against the ambient Phaser
// namespace before throwing "Phaser is not defined" in the browser — a trap
// this repo has already been caught by once. See DESIGN.md section 12.
import Phaser from 'phaser';
import type { Fog } from '../sim/Fog.ts';

const TEXTURE_KEY = 'fog-grid';

/**
 * How opaque the mist gets over completely unseen ground, 0-255.
 *
 * It does not have to hide anything. An undiscovered flower is not drawn at
 * all — `FieldRenderer` skips it — so the mist marks *where you have not been*
 * rather than concealing what is there, and it can be tuned purely on looks.
 *
 * Near-opaque washed the whole board to flat white, which is the failure mode
 * a light theme has and a dark one does not: black over green still reads as
 * ground, white over green reads as paper. This leaves the grass just visible
 * under the haze, so the unexplored field is somewhere you have not been rather
 * than somewhere that is not there.
 */
const MIST_ALPHA = 198;

/**
 * Draws the unexplored board as low morning mist.
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
      // Warm white rather than grey: grey over green reads as a dead screen,
      // where a faintly warm white reads as sun through haze.
      data[offset] = 250;
      data[offset + 1] = 251;
      data[offset + 2] = 242;
      // Stops short of opaque. Unexplored ground should be *unreadable*, not
      // absent — a hint of the field under the mist is what makes the board
      // feel like one continuous place rather than a hole cut in a curtain,
      // and it is the whole difference between fog and a wall.
      data[offset + 3] = Math.round((1 - revealed) * MIST_ALPHA);
    }

    texture.getContext().putImageData(pixels, 0, 0);
    texture.refresh();
  }

  destroy(): void {
    this.image.destroy();
  }
}
