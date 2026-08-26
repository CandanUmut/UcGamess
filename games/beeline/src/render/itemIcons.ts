import type Phaser from 'phaser';
import { ITEMS, ITEM_IDS, type ItemId } from '../game/Items.ts';

/**
 * An icon for every shop item, drawn at boot rather than shipped.
 *
 * The night screen was reported as "very same and not interesting really", and
 * it was: fifteen items rendered as fifteen identical rectangles with different
 * words in them. Words are the slowest thing on a screen to tell apart, and the
 * shop is the one screen a player wants to get through quickly.
 *
 * A shape and a colour are read before the eye reaches the text, so an icon is
 * not decoration here — it is what turns four cards into four *choices* at a
 * glance. Kept as canvas drawing code for the same reason the bee is (see
 * textures.ts): 44px of flat shapes costs nothing in the bundle, re-tints
 * freely, and never fails to load.
 *
 * The glyph vocabulary is deliberately small and reused. Fifteen unique little
 * paintings would be fifteen things to get right and would still not read at
 * 44px; a handful of unmistakable silhouettes in the item's own colour does.
 */
export type Glyph =
  | 'drop'
  | 'wing'
  | 'sun'
  | 'leaf'
  | 'comb'
  | 'shears'
  | 'smoke'
  | 'shield'
  | 'seal'
  | 'sting'
  | 'eye'
  | 'crown'
  | 'wind'
  | 'flask';

const SIZE = 44;

export function itemTextureKey(id: ItemId): string {
  return `item-${id}`;
}

function hex(colour: number, alpha = 1): string {
  const r = (colour >> 16) & 0xff;
  const g = (colour >> 8) & 0xff;
  const b = colour & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

// One flat switch of small shapes, rather than fourteen tiny functions and a
// dispatch table. Every case is four to ten lines of drawing with no branching
// of its own, so the shape of the file is a lookup table that happens to be
// written as a switch.
function drawGlyph(ctx: CanvasRenderingContext2D, glyph: Glyph, colour: number): void {
  const c = SIZE / 2;
  ctx.fillStyle = hex(colour);
  ctx.strokeStyle = hex(colour);
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (glyph) {
    case 'drop': {
      ctx.beginPath();
      ctx.moveTo(c, 8);
      ctx.bezierCurveTo(c + 13, c + 2, c + 9, 36, c, 36);
      ctx.bezierCurveTo(c - 9, 36, c - 13, c + 2, c, 8);
      ctx.fill();
      return;
    }
    case 'wing': {
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(c + sign * 6, c, 11, 5.5, sign * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    case 'sun': {
      ctx.beginPath();
      ctx.arc(c, c, 7, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * 11, c + Math.sin(a) * 11);
        ctx.lineTo(c + Math.cos(a) * 17, c + Math.sin(a) * 17);
        ctx.stroke();
      }
      return;
    }
    case 'leaf': {
      ctx.beginPath();
      ctx.moveTo(9, 35);
      ctx.quadraticCurveTo(9, 9, 35, 9);
      ctx.quadraticCurveTo(35, 35, 9, 35);
      ctx.fill();
      return;
    }
    case 'comb': {
      // A hexagon, the one shape this game can only mean one thing by.
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = c + Math.cos(a) * 15;
        const y = c + Math.sin(a) * 15;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = c + Math.cos(a) * 7;
        const y = c + Math.sin(a) * 7;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      return;
    }
    case 'shears': {
      ctx.beginPath();
      ctx.moveTo(11, 11);
      ctx.lineTo(30, 30);
      ctx.moveTo(33, 11);
      ctx.lineTo(14, 30);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(12, 33, 4.5, 0, Math.PI * 2);
      ctx.arc(32, 33, 4.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'smoke': {
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(c - 6 + i * 6, 26 - i * 6, 7 - i, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillRect(11, 30, 22, 6);
      return;
    }
    case 'shield': {
      ctx.beginPath();
      ctx.moveTo(c, 8);
      ctx.lineTo(34, 15);
      ctx.quadraticCurveTo(34, 32, c, 37);
      ctx.quadraticCurveTo(10, 32, 10, 15);
      ctx.closePath();
      ctx.fill();
      return;
    }
    case 'seal': {
      ctx.beginPath();
      ctx.arc(c, c, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c, c, 7, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'sting': {
      ctx.beginPath();
      ctx.moveTo(c, 7);
      ctx.lineTo(c + 6, 28);
      ctx.lineTo(c, 37);
      ctx.lineTo(c - 6, 28);
      ctx.closePath();
      ctx.fill();
      return;
    }
    case 'eye': {
      ctx.beginPath();
      ctx.ellipse(c, c, 16, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c, c, 5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'crown': {
      ctx.beginPath();
      ctx.moveTo(9, 31);
      ctx.lineTo(12, 13);
      ctx.lineTo(c, 24);
      ctx.lineTo(32, 13);
      ctx.lineTo(35, 31);
      ctx.closePath();
      ctx.fill();
      return;
    }
    case 'wind': {
      for (let i = 0; i < 3; i += 1) {
        const y = 14 + i * 8;
        ctx.beginPath();
        ctx.moveTo(9, y);
        ctx.lineTo(26 - i * 3, y);
        ctx.quadraticCurveTo(34 - i * 3, y, 30 - i * 3, y + 5);
        ctx.stroke();
      }
      return;
    }
    case 'flask': {
      ctx.beginPath();
      ctx.moveTo(17, 8);
      ctx.lineTo(27, 8);
      ctx.lineTo(27, 18);
      ctx.lineTo(35, 34);
      ctx.lineTo(9, 34);
      ctx.lineTo(17, 18);
      ctx.closePath();
      ctx.fill();
      return;
    }
    default:
      return;
  }
}

/** Builds one texture per item. Call once, at boot. */
export function createItemIcons(scene: Phaser.Scene): void {
  for (const id of ITEM_IDS) {
    const key = itemTextureKey(id);
    if (scene.textures.exists(key)) continue;

    const texture = scene.textures.createCanvas(key, SIZE, SIZE);
    if (!texture) continue;

    const ctx = texture.getContext();
    drawGlyph(ctx, ITEMS[id].glyph, ITEMS[id].iconTint);
    texture.refresh();
  }
}
