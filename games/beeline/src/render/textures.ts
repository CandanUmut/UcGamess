import type Phaser from 'phaser';

/**
 * Textures generated at boot instead of shipped as files.
 *
 * A radial-gradient dot drawn to a canvas is indistinguishable from a PNG at
 * 12px, costs zero bytes of initial download, and can be re-tinted freely. Per
 * ASSETS.md this is the permanent plan for the bee, the trail and the honey
 * droplet — not a Stage 2 placeholder.
 */
export const TEX = {
  bee: 'bee-dot',
  glow: 'soft-glow',
} as const;

function radialDot(
  scene: Phaser.Scene,
  key: string,
  size: number,
  stops: Array<[number, string]>,
): void {
  if (scene.textures.exists(key)) return;

  const canvasTexture = scene.textures.createCanvas(key, size, size);
  if (!canvasTexture) {
    console.warn(`[beeline] could not create canvas texture "${key}"`);
    return;
  }

  const ctx = canvasTexture.getContext();
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  canvasTexture.refresh();
}

export function createGeneratedTextures(scene: Phaser.Scene): void {
  // Bee: a solid core with a soft edge, so overlapping bees read as a mass
  // rather than as a grid of hard circles.
  radialDot(scene, TEX.bee, 16, [
    [0, 'rgba(255,255,255,1)'],
    [0.42, 'rgba(255,236,170,1)'],
    [1, 'rgba(255,214,110,0)'],
  ]);

  // Reused for the hive, patches and any bloom — tinted and scaled per use.
  radialDot(scene, TEX.glow, 64, [
    [0, 'rgba(255,255,255,1)'],
    [0.35, 'rgba(255,255,255,0.55)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
}
