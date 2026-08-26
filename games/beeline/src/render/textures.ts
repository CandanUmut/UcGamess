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
  /** The hand-drawn bee. Falls back to `beeDrawn` if the file never arrives. */
  bee: 'bee',
  /** Generated stand-in for the bee, so a failed fetch is cosmetic. */
  beeDrawn: 'bee-drawn',
  glow: 'soft-glow',
  /**
   * Two CC0 starbursts from Kenney's Particle Pack.
   *
   * They exist because a radial gradient cannot make a *star*, and the two
   * moments the game most wants to celebrate — finding a flower in the dark,
   * and banking honey — read as light with points on it rather than as another
   * soft dot. White on transparent, so the game tints them per use exactly as
   * it tints the generated textures.
   */
  sparkle: 'sparkle',
  glint: 'glint',
  /** Seamless meadow ground, tiled under the whole board. */
  meadow: 'meadow',
  /** The studio's own drawings for the three things left as primitives. */
  hive: 'hive',
  wasp: 'wasp',
  wall: 'wall',
  /** A pollen grain, for the moment a bee picks one up. */
  pollen: 'pollen',
  /**
   * The two shops, keyed by buyer id.
   *
   * `SHOP_TEX` below is the lookup the renderer uses; these exist so the keys
   * are declared in one place with everything else. A missing file falls back
   * to the drawn depot, so a failed fetch costs the picture and not the loop.
   */
  shopMarket: 'shop-market',
  shopApothecary: 'shop-apothecary',
} as const;

/** Shop art by buyer id, in the same order the buyers are built. */
export const SHOP_TEX: Record<'market' | 'apothecary', string> = {
  market: TEX.shopMarket,
  apothecary: TEX.shopApothecary,
};

/**
 * One flower sprite per species, in the same order as `COLORS.species`.
 *
 * The order is the contract: `Patch.species` indexes both, so a flower's colour
 * on the board and the sprite drawn for it cannot disagree.
 */
export const FLOWER_TEX = [
  'flower-pink',
  'flower-violet',
  'flower-poppy',
  'flower-buttercup',
  'flower-daisy',
  'flower-cornflower',
] as const;

/** Files fetched at boot, relative to the deployed root. */
export const TEX_FILES: ReadonlyArray<readonly [key: string, path: string]> = [
  [TEX.bee, 'sprites/bee.png'],
  [TEX.meadow, 'sprites/meadow.jpg'],
  [TEX.hive, 'sprites/hive.png'],
  [TEX.wasp, 'sprites/wasp.png'],
  [TEX.wall, 'sprites/wall.png'],
  [TEX.pollen, 'sprites/pollen.png'],
  [TEX.shopMarket, 'sprites/shop-market.png'],
  [TEX.shopApothecary, 'sprites/shop-apothecary.png'],
  [TEX.sparkle, 'particles/sparkle.png'],
  [TEX.glint, 'particles/glint.png'],
  ...FLOWER_TEX.map((key) => [key, `sprites/${key}.png`] as const),
];

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

/**
 * An actual bee: striped amber body, dark head, two wings.
 *
 * Drawn nose-right (+x) because `SpriteBeeRenderer` rotates by
 * `atan2(dy, dx)`, so a bee drawn along +x points the way it is flying with no
 * offset to remember. `sprites/bee.png` follows the same convention — anything
 * that replaces it must too, or the whole swarm flies backwards.
 *
 * This is the *fallback*, not the bee the game normally draws — `sprites/bee.png`
 * is. It exists because the swarm is the one thing on screen that cannot
 * degrade to nothing: a missing flower sprite costs a flower, a missing bee
 * texture costs every bee, and Phaser draws a missing texture as a green box.
 *
 * Kept as drawing code rather than a second shipped file because it is 32px of
 * flat shapes, which a canvas produces exactly as well as a PNG and for none of
 * the bytes.
 */
function drawnBeeTexture(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) return;

  const size = 32;
  const canvasTexture = scene.textures.createCanvas(key, size, size);
  if (!canvasTexture) {
    console.warn(`[beeline] could not create canvas texture "${key}"`);
    return;
  }

  const ctx = canvasTexture.getContext();
  const cx = 15;
  const cy = size / 2;

  // Wings first, so the body overlaps them at the root and they read as
  // attached rather than as two blobs stuck on the side.
  ctx.fillStyle = 'rgba(226, 240, 252, 0.72)';
  for (const sign of [-1, 1]) {
    ctx.save();
    ctx.translate(cx - 1, cy + sign * 3);
    ctx.rotate(sign * 0.55);
    ctx.beginPath();
    ctx.ellipse(-3, 0, 7.5, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Abdomen and thorax as one tapered body.
  ctx.fillStyle = '#e9a219';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Stripes, clipped to the body so they follow its edge instead of running
  // off into the transparent margin.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, 9, 6, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#3d2a0c';
  for (const offset of [-5.5, -1.5, 2.5]) {
    ctx.fillRect(cx + offset, cy - 7, 2.6, 14);
  }
  ctx.restore();

  // Head, slightly proud of the body at the nose.
  ctx.fillStyle = '#33240b';
  ctx.beginPath();
  ctx.arc(cx + 8.5, cy, 4.1, 0, Math.PI * 2);
  ctx.fill();

  canvasTexture.refresh();
}

export function createGeneratedTextures(scene: Phaser.Scene): void {
  drawnBeeTexture(scene, TEX.beeDrawn);

  // Reused for the hive, patches and any bloom — tinted and scaled per use.
  radialDot(scene, TEX.glow, 64, [
    [0, 'rgba(255,255,255,1)'],
    [0.35, 'rgba(255,255,255,0.55)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
}
