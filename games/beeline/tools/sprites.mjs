/**
 * Builds the game's generated sprites into `assets/sprites/`.
 *
 *   node games/beeline/tools/sprites.mjs
 *
 * Everything here is drawn with Canvas 2D in a headless Chromium, in the same
 * look as the studio's hand drawings: flat fills and a dark, slightly wobbly
 * double outline. Nothing is AI-generated, and nothing is fetched. Re-run it
 * after changing a drawing below or after the studio redraws the bee or the
 * wasp — the wing beats are cut from those stills.
 *
 * Dev-only: it needs Playwright's Chromium, which the repo already has for its
 * browser tests. The game itself only ever loads the PNGs.
 */
/* global process, Buffer, console, window, document, Image */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SPRITES = join(here, '..', 'assets', 'sprites');
const executablePath = process.env.CHROMIUM_PATH;

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();

const dataUrl = (file) =>
  `data:image/png;base64,${readFileSync(join(SPRITES, file)).toString('base64')}`;

/** Runs a drawing function in the page and saves the canvas it returns. */
async function render(file, draw, arg) {
  const url = await page.evaluate(
    async ([source, value]) => {
      const fn = new Function('arg', `return (${source})(arg);`);
      const canvas = await fn(value);
      return canvas.toDataURL('image/png');
    },
    [draw.toString(), arg],
  );
  writeFileSync(join(SPRITES, file), Buffer.from(url.split(',')[1], 'base64'));
  console.log(`wrote sprites/${file}`);
}

// Shared by every drawing: the sketchy outline. Injected once into the page.
await page.evaluate(() => {
  window.sketch = (g, path, width = 3, colour = '#2a1d08') => {
    g.save();
    g.strokeStyle = colour;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    for (const [dx, dy, w] of [
      [0, 0, width],
      [0.9, -0.6, width * 0.55],
    ]) {
      g.lineWidth = w;
      g.translate(dx, dy);
      path(g);
      g.stroke();
      g.translate(-dx, -dy);
    }
    g.restore();
  };
});

// --- wing beats, cut from the studio's own stills ---------------------------

async function flapSheet(source, out, wingBottom, bodyTop) {
  await render(
    out,
    async ({ url, wingBottom, bodyTop }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = W * 4;
      c.height = H;
      const g = c.getContext('2d');
      const wb = Math.round(H * wingBottom);
      const bt = Math.round(H * bodyTop);
      [1, 0.62, 0.2, 0.62].forEach((s, i) => {
        const ox = i * W;
        const h = wb * s;
        g.drawImage(img, 0, 0, W, wb, ox, wb - h, W, h);
        if (s < 1) {
          g.globalAlpha = 0.25;
          g.drawImage(img, 0, 0, W, wb, ox, wb * 0.15, W, wb * 0.85);
          g.globalAlpha = 1;
        }
        g.drawImage(img, 0, bt, W, H - bt, ox, bt + (s === 0.2 ? 1 : 0), W, H - bt);
      });
      return c;
    },
    { url: dataUrl(source), wingBottom, bodyTop },
  );
}

await flapSheet('bee.png', 'bee-flap.png', 0.5, 0.44);
await flapSheet('wasp.png', 'wasp-flap.png', 0.52, 0.46);

// --- the swat: a comic "pow" burst, six frames ------------------------------

await render('swat-burst.png', () => {
  const S = 128;
  const N = 6;
  const c = document.createElement('canvas');
  c.width = S * N;
  c.height = S;
  const g = c.getContext('2d');
  const star = (cx, cy, points, outer, inner, twist) => (p) => {
    p.beginPath();
    for (let i = 0; i <= points * 2; i += 1) {
      const a = twist + (i * Math.PI) / points;
      const r = i % 2 === 0 ? outer * (0.85 + 0.15 * Math.sin(i * 2.3)) : inner;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.closePath();
  };
  // Grows fast, holds, then breaks up into flecks.
  const scale = [0.35, 0.8, 1, 0.95, 0.8, 0.6];
  const alpha = [1, 1, 1, 0.85, 0.55, 0.25];
  for (let f = 0; f < N; f += 1) {
    const cx = f * S + S / 2;
    const cy = S / 2;
    const k = scale[f];
    g.globalAlpha = alpha[f];
    if (f < 4) {
      const outer = star(cx, cy, 9, 56 * k, 26 * k, f * 0.12);
      outer(g);
      g.fillStyle = '#ffd23f';
      g.fill();
      window.sketch(g, outer, 3.5);
      const inner = star(cx, cy, 9, 32 * k, 15 * k, f * 0.12 + 0.3);
      inner(g);
      g.fillStyle = '#fff7d6';
      g.fill();
    }
    // Flecks flying out, further each frame.
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      const d = (18 + f * 11) * (i % 2 ? 1 : 0.8);
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      const r = Math.max(1.5, 6 - f * 0.7);
      const dot = (p) => {
        p.beginPath();
        p.arc(x, y, r, 0, Math.PI * 2);
      };
      dot(g);
      g.fillStyle = i % 3 === 0 ? '#ff8a5c' : '#ffe38a';
      g.fill();
      window.sketch(g, dot, 1.5);
    }
  }
  return c;
});

// --- the golden bloom -------------------------------------------------------

await render('flower-golden.png', () => {
  const S = 96;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const cx = S / 2;
  const cy = S / 2;
  const petals = 10;
  for (let i = 0; i < petals; i += 1) {
    const a = (i / petals) * Math.PI * 2;
    const petal = (p) => {
      p.beginPath();
      p.ellipse(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24, 17, 9, a, 0, Math.PI * 2);
    };
    petal(g);
    const grad = g.createLinearGradient(
      cx,
      cy,
      cx + Math.cos(a) * 42,
      cy + Math.sin(a) * 42,
    );
    grad.addColorStop(0, '#ffb300');
    grad.addColorStop(1, '#ffe985');
    g.fillStyle = grad;
    g.fill();
    window.sketch(g, petal, 2.2, '#8a5400');
  }
  const heart = (p) => {
    p.beginPath();
    p.arc(cx, cy, 13, 0, Math.PI * 2);
  };
  heart(g);
  g.fillStyle = '#e8740c';
  g.fill();
  window.sketch(g, heart, 2.5, '#5a3000');
  // Seeds and a highlight, so the centre reads as a flower and not a coin.
  g.fillStyle = '#ffcf6b';
  for (let i = 0; i < 7; i += 1) {
    const a = i * 2.4;
    g.beginPath();
    g.arc(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 1.8, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.beginPath();
  g.ellipse(cx - 4, cy - 5, 4, 2.5, -0.6, 0, Math.PI * 2);
  g.fill();
  return c;
});

// --- a drop of honey --------------------------------------------------------

await render('honey-drop.png', () => {
  const S = 48;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const drop = (p) => {
    p.beginPath();
    p.moveTo(24, 5);
    p.bezierCurveTo(30, 16, 40, 24, 40, 31);
    p.bezierCurveTo(40, 40, 33, 45, 24, 45);
    p.bezierCurveTo(15, 45, 8, 40, 8, 31);
    p.bezierCurveTo(8, 24, 18, 16, 24, 5);
    p.closePath();
  };
  drop(g);
  const grad = g.createRadialGradient(20, 28, 2, 24, 32, 22);
  grad.addColorStop(0, '#ffd45a');
  grad.addColorStop(1, '#e88a00');
  g.fillStyle = grad;
  g.fill();
  window.sketch(g, drop, 3);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.ellipse(18, 30, 3.5, 6, 0.3, 0, Math.PI * 2);
  g.fill();
  return c;
});

// --- the world medal --------------------------------------------------------

await render('medal.png', () => {
  const W = 160;
  const H = 200;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const cx = W / 2;
  // Ribbon tails, behind the disc.
  for (const [dx, colour] of [
    [-1, '#e2669a'],
    [1, '#4f9ede'],
  ]) {
    const tail = (p) => {
      p.beginPath();
      p.moveTo(cx + dx * 14, 96);
      p.lineTo(cx + dx * 46, 188);
      p.lineTo(cx + dx * 30, 176);
      p.lineTo(cx + dx * 18, 194);
      p.lineTo(cx - dx * 6, 104);
      p.closePath();
    };
    tail(g);
    g.fillStyle = colour;
    g.fill();
    window.sketch(g, tail, 3);
  }
  // The disc.
  const disc = (p) => {
    p.beginPath();
    p.arc(cx, 74, 62, 0, Math.PI * 2);
  };
  disc(g);
  const grad = g.createRadialGradient(cx - 18, 54, 6, cx, 74, 64);
  grad.addColorStop(0, '#fff2a8');
  grad.addColorStop(0.55, '#ffc93c');
  grad.addColorStop(1, '#d88a0a');
  g.fillStyle = grad;
  g.fill();
  window.sketch(g, disc, 4);
  const rim = (p) => {
    p.beginPath();
    p.arc(cx, 74, 50, 0, Math.PI * 2);
  };
  window.sketch(g, rim, 2, '#9a5c00');
  // A honeycomb of seven cells, the middle one full.
  const hex = (hx, hy, r) => (p) => {
    p.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const x = hx + Math.cos(a) * r;
      const y = hy + Math.sin(a) * r;
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.closePath();
  };
  const r = 13;
  const w = Math.sqrt(3) * r;
  const cells = [
    [0, 0],
    [w, 0],
    [-w, 0],
    [w / 2, -1.5 * r],
    [-w / 2, -1.5 * r],
    [w / 2, 1.5 * r],
    [-w / 2, 1.5 * r],
  ];
  cells.forEach(([dx, dy], i) => {
    const shape = hex(cx + dx, 74 + dy, r - 1.5);
    shape(g);
    g.fillStyle = i === 0 ? '#e8740c' : '#ffe07a';
    g.fill();
    window.sketch(g, shape, 2, '#8a5400');
  });
  // Shine.
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath();
  g.ellipse(cx - 30, 44, 14, 7, -0.7, 0, Math.PI * 2);
  g.fill();
  return c;
});

await browser.close();
