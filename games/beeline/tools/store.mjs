/**
 * Renders the store listing's images and videos into `store/out/`.
 *
 *   node games/beeline/tools/store.mjs [--no-video]
 *
 * Everything is captured from the real game: the script starts the dev server
 * itself, seeds a save, lets a simple bot play a level in headless Chromium,
 * and grabs frames and a recording. Covers are those frames with the title set
 * over them — CrazyGames asks for the title and nothing else on a cover (no
 * logos, no borders, no other text).
 *
 * Output (CrazyGames sizes; itch.io takes the landscape cover at 630x500):
 *   cover-landscape.png   1920x1080
 *   cover-portrait.png     800x1200
 *   cover-square.png       800x800
 *   cover-itch.png         630x500
 *   screenshot-*.png      1920x1080
 *   preview-landscape.mp4 1920x1080, ~18 s, silent, opens on the cover
 *   preview-portrait.mp4   720x1080 (2:3), same
 *
 * Videos need `ffmpeg` on PATH (or FFMPEG=/path/to/ffmpeg); without it the
 * raw .webm recordings are kept instead. Dev-only, like tools/sprites.mjs: it
 * uses the repo's Playwright Chromium (CHROMIUM_PATH overrides the binary).
 */
/* global process, Buffer, console, window, document, Image, FontFace */
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const GAME = join(here, '..');
const OUT = join(GAME, 'store', 'out');
const WANT_VIDEO = !process.argv.includes('--no-video');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const executablePath = process.env.CHROMIUM_PATH;

const TITLE = /GAME_TITLE = '([^']+)'/.exec(
  readFileSync(join(GAME, 'src', 'config', 'title.ts'), 'utf8'),
)?.[1];
if (!TITLE) throw new Error('Could not read GAME_TITLE from src/config/title.ts');

/** A mid-campaign save: the map has progress on it and no tutorial shows. */
const SAVE = {
  version: 3,
  day: 1,
  tutorialDone: true,
  levelStars: [3, 3, 2, 3, 2, 3, 3, 2, 3, 3, 2, 3, 1, 0],
  levelBest: [],
  worldsCelebrated: [0],
};
/** "Full Bloom" (1-10): eight flowers, four lines — the busiest clean board. */
const LEVEL = 10;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: GAME,
  configFile: join(GAME, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, open: false },
});
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('dev server did not report a URL');

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ['--use-gl=swiftshader', '--mute-audio'],
});

try {
  const frames = await captureStills();
  await renderCovers(frames);
  if (WANT_VIDEO) await captureVideo(frames.clean);
} finally {
  await browser.close();
  await server.close();
}
console.log(`store assets in ${OUT}`);

// ------------------------------------------------------------------ capture

async function openGame(context) {
  await context.addInitScript((save) => {
    window.localStorage.setItem('ucgames:beeline.save', JSON.stringify(save));
  }, SAVE);
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.scene.isActive('Menu'), null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(800);
  return page;
}

async function startLevel(page, level) {
  await page.evaluate((id) => {
    const game = window.__game;
    for (const s of game.scene.getScenes(false)) game.scene.stop(s.scene.key);
    game.scene.start('Game', { mode: 'level', level: id });
  }, level);
  await page.waitForFunction(() => window.__beeline?.day?.().phase === 'playing');
}

/**
 * Plays like a competent human would at a glance: swat any wasp, then run a
 * line to the nearest flower nobody is working. Not the playtest harness —
 * this only has to look like play, not measure it.
 */
async function play(page, ms, { reveal = false } = {}) {
  const until = Date.now() + ms;
  if (reveal) await page.evaluate(() => window.__beeline.revealAll());
  const screen = (x, y) =>
    page.evaluate(([a, b]) => window.__beeline.screenOf(a, b), [x, y]);
  while (Date.now() < until) {
    const st = await page.evaluate(() => {
      const h = window.__beeline;
      return h
        ? { d: h.day(), pt: h.patches(), r: h.routes(), w: h.wasps(), hive: h.hive }
        : null;
    });
    if (!st || st.d.phase !== 'playing') return;
    const wasp = st.w.find((w) => w.state !== 'fleeing' && w.state !== 'gone');
    if (wasp) {
      const s = await screen(wasp.x, wasp.y);
      await page.mouse.click(s.x, s.y);
      await page.waitForTimeout(200);
      continue;
    }
    // Every free line goes out in one pass, nearest flowers first.
    const served = st.r.map((r) => [r.tipX, r.tipY]);
    const open = st.pt
      .filter((p) => p.alive && p.discovered)
      .filter((p) => !served.some(([x, y]) => Math.hypot(x - p.x, y - p.y) < 90))
      .sort(
        (a, b) =>
          Math.hypot(a.x - st.hive.x, a.y - st.hive.y) -
          Math.hypot(b.x - st.hive.x, b.y - st.hive.y),
      )
      .slice(0, Math.max(0, 4 - st.r.length));
    const a = await screen(st.hive.x, st.hive.y);
    for (const target of open) {
      const b = await screen(target.x + 10, target.y - 8);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      for (let i = 1; i <= 10; i += 1) {
        await page.mouse.move(a.x + ((b.x - a.x) * i) / 10, a.y + ((b.y - a.y) * i) / 10);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(250);
  }
}

function hud(page, visible) {
  return page.evaluate((v) => {
    const scene = window.__game.scene.getScene('Game');
    scene.hud.setVisible(v);
    scene.tutorialText?.setVisible(v);
  }, visible);
}

async function captureStills() {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await openGame(context);
  const shot = (name) => page.screenshot({ path: join(OUT, name) });

  await startLevel(page, LEVEL);
  await play(page, 14_000, { reveal: true });
  await shot('screenshot-1-gameplay.png');
  // The cover frame: no HUD, and no text of any kind on the board — the
  // title is the only words a cover may carry. Juice text is short-lived, so
  // it is hidden rather than waited out.
  await hud(page, false);
  // Renderers re-show their labels every frame, so the camera is told to skip
  // them instead.
  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('Game');
    const camera = scene.cameras.main;
    for (const child of scene.children.list) {
      if (child.type === 'Text' || child.type === 'Container') camera.ignore(child);
    }
    camera.ignore(scene.fieldRenderer.plateGfx); // the labels' backing pills
  });
  await page.waitForTimeout(100);
  const clean = await page.screenshot();
  const hive = await page.evaluate(() => {
    const h = window.__beeline.hive;
    return window.__beeline.screenOf(h.x, h.y);
  });
  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('Game');
    const id = scene.cameras.main.id;
    for (const child of scene.children.list) child.cameraFilter &= ~id;
  });
  await hud(page, true);
  await play(page, 3000);

  // The level card at its best: the bot is a mediocre player, so the honey is
  // topped up to the three-star mark — the screen itself is the real one.
  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('Game');
    const three = scene.level?.stars?.[2] ?? 0;
    scene.field.honey = Math.max(scene.field.honey, three + 40);
    window.__beeline.endDayNow();
  });
  await page.waitForTimeout(3200);
  await shot('screenshot-2-level-complete.png');

  // The honeycomb map.
  await page.evaluate(() => {
    const game = window.__game;
    for (const s of game.scene.getScenes(false)) game.scene.stop(s.scene.key);
    game.scene.start('Map', { world: 1 });
  });
  await page.waitForTimeout(1500);
  await shot('screenshot-3-map.png');

  // The wasps of world 3.
  await startLevel(page, 24);
  await play(page, 7000, { reveal: true });
  await page.evaluate(() => window.__beeline.raidNow());
  await page.waitForTimeout(1200);
  await shot('screenshot-4-wasps.png');

  await context.close();
  return { clean, hive };
}

// ------------------------------------------------------------------- covers

async function renderCovers({ clean, hive }) {
  const page = await browser.newPage();
  const font = readFileSync(join(GAME, 'assets', 'fonts', 'nunito.woff2')).toString(
    'base64',
  );
  const bee = readFileSync(join(GAME, 'assets', 'sprites', 'bee.png')).toString('base64');
  await page.evaluate(
    async ([fontData, beeData]) => {
      const face = new FontFace('Nunito', `url(data:font/woff2;base64,${fontData})`, {
        weight: '200 1000',
      });
      document.fonts.add(await face.load());
      const load = (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.src = src;
        });
      window.bee = await load(`data:image/png;base64,${beeData}`);
      window.load = load;
    },
    [font, bee],
  );

  const frame = `data:image/png;base64,${clean.toString('base64')}`;
  const covers = [
    ['cover-landscape.png', 1920, 1080],
    ['cover-portrait.png', 800, 1200],
    ['cover-square.png', 800, 800],
    ['cover-itch.png', 630, 500],
  ];
  for (const [file, w, h] of covers) {
    const data = await page.evaluate(
      async ([src, width, height, title, focus]) => {
        const img = await window.load(src);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const g = canvas.getContext('2d');

        // Cover-fit the frame, centred on the hive as far as the edges allow.
        const scale = Math.max(width / img.width, height / img.height) * 1.2;
        const sw = width / scale;
        const sh = height / scale;
        const sx = Math.min(Math.max(focus.x - sw / 2, 0), img.width - sw);
        const sy = Math.min(Math.max(focus.y - sh * 0.58, 0), img.height - sh);
        g.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);

        // Warm the top so the title sits on something calm.
        const shade = g.createLinearGradient(0, 0, 0, height);
        shade.addColorStop(0, 'rgba(58, 39, 8, 0.62)');
        shade.addColorStop(0.42, 'rgba(58, 39, 8, 0.12)');
        shade.addColorStop(1, 'rgba(58, 39, 8, 0.18)');
        g.fillStyle = shade;
        g.fillRect(0, 0, width, height);

        // The title: honey fill, thick dark outline, a soft drop.
        const size = Math.round(Math.min(width * 0.2, height * 0.24));
        const ty = height * (height > width ? 0.2 : 0.24);
        g.font = `900 ${size}px Nunito`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.shadowColor = 'rgba(0,0,0,0.45)';
        g.shadowBlur = size * 0.12;
        g.shadowOffsetY = size * 0.06;
        g.lineWidth = size * 0.2;
        g.strokeStyle = '#3a2708';
        g.strokeText(title, width / 2, ty);
        g.shadowColor = 'transparent';
        const fill = g.createLinearGradient(0, ty - size / 2, 0, ty + size / 2);
        fill.addColorStop(0, '#ffe98f');
        fill.addColorStop(0.55, '#ffc928');
        fill.addColorStop(1, '#f09a12');
        g.fillStyle = fill;
        g.fillText(title, width / 2, ty);

        // Two bees buzzing round the title.
        const b = window.bee;
        const bw = size * 0.62;
        const bh = (bw * b.height) / b.width;
        const tw = g.measureText(title).width;
        g.save();
        g.translate(width / 2 + tw / 2 + bw * 0.25, ty - size * 0.42);
        g.rotate(0.35);
        g.drawImage(b, -bw / 2, -bh / 2, bw, bh);
        g.restore();
        g.save();
        g.translate(width / 2 - tw / 2 - bw * 0.1, ty + size * 0.45);
        g.scale(-0.7, 0.7);
        g.rotate(0.3);
        g.drawImage(b, -bw / 2, -bh / 2, bw, bh);
        g.restore();
        return canvas.toDataURL('image/png');
      },
      [frame, w, h, TITLE, hive],
    );
    writeFileSync(join(OUT, file), Buffer.from(data.split(',')[1], 'base64'));
    console.log(`wrote store/out/${file}`);
  }
  await page.close();
}

// -------------------------------------------------------------------- video

async function captureVideo() {
  const raw = join(OUT, 'raw');
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: raw, size: { width: 1920, height: 1080 } },
  });
  // The recording starts with the page; everything before the level is cut.
  const t0 = Date.now();
  const page = await openGame(context);
  await startLevel(page, LEVEL);
  const startAt = (Date.now() - t0) / 1000;
  const clock = () => page.evaluate(() => window.__beeline.day().secondsLeft);
  const [wall0, game0] = [Date.now(), await clock()];
  await play(page, 16_000, { reveal: true });
  await page.evaluate(() => window.__beeline.raidNow());
  await play(page, 8000);
  // Software GL cannot hold 60 fps at 1080p, so the game ran slower than real
  // time; the clip is retimed by the measured rate so it plays at true speed.
  const rate = Math.min(
    1,
    Math.max(0.3, (game0 - (await clock())) / ((Date.now() - wall0) / 1000)),
  );
  console.log(`game ran at ${rate.toFixed(2)}x real time; retiming`);
  await context.close();

  const webm = readdirSync(raw).find((f) => f.endsWith('.webm'));
  if (!webm) throw new Error('no recording produced');
  const source = join(raw, webm);
  const offset = startAt + 0.2;

  const probe = spawnSync(FFMPEG, ['-version']);
  if (probe.status !== 0) {
    renameSync(source, join(OUT, 'preview-raw.webm'));
    rmSync(raw, { recursive: true, force: true });
    console.warn(
      'ffmpeg not found: kept preview-raw.webm; convert to MP4 before upload.',
    );
    return;
  }

  // Cover still (1.5 s) then 16.5 s of play — CrazyGames wants the preview to
  // open on the static cover, 15-20 s total, no audio.
  const encode = (cover, crop, out) => {
    const args = [
      '-y',
      '-loop',
      '1',
      '-t',
      '1.5',
      '-i',
      join(OUT, cover),
      '-ss',
      String(offset),
      '-t',
      String(16.5 / rate),
      '-i',
      source,
      '-filter_complex',
      `[0:v]${crop.coverScale},setsar=1,fps=30[a];` +
        `[1:v]setpts=PTS*${rate.toFixed(4)},${crop.video},setsar=1,fps=30[b];[a][b]concat=n=2:v=1:a=0[v]`,
      '-map',
      '[v]',
      '-an',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '20',
      '-preset',
      'slow',
      '-movflags',
      '+faststart',
      join(OUT, out),
    ];
    const run = spawnSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    if (run.status !== 0) throw new Error(`ffmpeg failed:\n${run.stderr}`);
    console.log(`wrote store/out/${out}`);
  };
  encode(
    'cover-landscape.png',
    { coverScale: 'scale=1920:1080', video: 'scale=1920:1080' },
    'preview-landscape.mp4',
  );
  encode(
    'cover-portrait.png',
    { coverScale: 'scale=720:1080', video: 'crop=720:1080:600:0' },
    'preview-portrait.mp4',
  );
  rmSync(raw, { recursive: true, force: true });
}
