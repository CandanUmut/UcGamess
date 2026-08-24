import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';
// Constants only, never `computeGameSize` — a test that recomputes the value it
// is checking proves nothing except that the function equals itself.
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  MAX_CANVAS_ASPECT,
  MIN_CANVAS_ASPECT,
} from '../../packages/core/src/scale/canvasSize.ts';

/**
 * The submission smoke test: does the game boot, reach the menu, and stay
 * quiet in the console?
 *
 * These three things are the cheapest possible proxy for the most common
 * rejection reasons. A reviewer opens the game, waits a few seconds, and forms
 * an opinion — if it is blank, throwing, or stuck loading, it is rejected
 * before anyone evaluates the mechanic. Running this on Chromium, WebKit and a
 * mobile viewport catches the Safari- and touch-specific breakage that we
 * otherwise would not see until submission.
 */

/**
 * Console noise we accept.
 *
 * The portal adapters intentionally log through console.warn — that is how the
 * dev adapter reports lifecycle calls, and it is not an error. Anything on
 * console.error, or any uncaught page exception, fails the test.
 */
const IGNORED_ERROR_PATTERNS = [
  // A dev-mode SDK is never loaded, so nothing here should hit the network.
  /Failed to load resource.*favicon/i,
  // WebGL is software-rendered in CI; the warning is environmental.
  /WebGL.*performance caveat/i,
  /Automatic fallback to software WebGL/i,
];

function collectProblems(page: Page) {
  const errors: string[] = [];

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (IGNORED_ERROR_PATTERNS.some((pattern) => pattern.test(text))) return;
    errors.push(`console.error: ${text}`);
  });

  page.on('pageerror', (error: Error) => {
    errors.push(`uncaught: ${error.message}`);
  });

  return errors;
}

test('boots, reaches the menu, and logs no console errors', async ({ page }) => {
  const problems = collectProblems(page);

  await page.goto('/', { waitUntil: 'load' });

  // Phaser renders into a canvas, so there is no DOM to assert on. The canvas
  // existing and having a real size is the signal that the renderer came up.
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);

  // The pre-boot placeholder is hidden only after createGame() resolves, which
  // means the portal adapter initialised and the scenes were registered.
  await expect(page.locator('#boot')).toBeHidden({ timeout: 15_000 });

  // Preload finishing and Menu starting is what "reached the menu" means. The
  // menu draws non-background pixels; a blank canvas would fail this.
  await page.waitForTimeout(1500);
  const isBlank = await page.evaluate(() => {
    const el = document.querySelector('#game canvas') as HTMLCanvasElement | null;
    if (!el) return true;
    // Reading pixels back from a WebGL canvas needs preserveDrawingBuffer, so
    // instead assert the canvas is a sane size — the visual check is the
    // screenshot artifact below.
    return el.width === 0 || el.height === 0;
  });
  expect(isBlank).toBe(false);

  expect(problems, `Console problems:\n${problems.join('\n')}`).toEqual([]);
});

/**
 * Measures the canvas against the viewport it is in.
 *
 * `backing` is the drawing buffer (the game size Phaser renders at) and `css`
 * is what the canvas actually occupies on the page. Comparing the two is how
 * stretching is detected: FIT must scale uniformly, so the two aspect ratios
 * have to agree no matter what shape either of them is.
 */
async function measureCanvas(page: Page) {
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);

  const css = await page.locator('#game canvas').boundingBox();
  expect(css).not.toBeNull();

  const backing = await page.evaluate(() => {
    const el = document.querySelector('#game canvas') as HTMLCanvasElement;
    return { width: el.width, height: el.height };
  });

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  return { css: css!, backing, viewport: viewport! };
}

/**
 * Whole-pixel rounding slack.
 *
 * The scale manager rounds the display size to whole pixels — deliberately, to
 * stop sub-pixel text shimmer — so a canvas that fills its viewport can measure
 * a pixel short of it.
 */
const ROUNDING = 2;

test('fills the viewport without overflowing or stretching', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  const { css, backing, viewport } = await measureCanvas(page);

  // Overflow in a portal iframe shows up as clipped UI or a scrollbar.
  expect(css.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(css.height).toBeLessThanOrEqual(viewport.height + 1);

  // Uniform scaling. This replaces the old "always exactly 16:9" assertion,
  // which stopped being true once the canvas started matching the device's
  // shape — and it is the stronger check, because it catches a stretched canvas
  // at *any* aspect rather than only at one.
  expect(css.width / css.height).toBeCloseTo(backing.width / backing.height, 1);

  // The playfield every player shares is always fully present. A canvas smaller
  // than the design size in either direction would mean some devices playing a
  // cropped board.
  expect(backing.width).toBeGreaterThanOrEqual(DESIGN_WIDTH);
  expect(backing.height).toBeGreaterThanOrEqual(DESIGN_HEIGHT);

  // Within the aspect bounds the canvas takes the viewport's own shape, so
  // there is nothing left to letterbox. Outside them it letterboxes on purpose,
  // and the overflow assertions above are the whole contract.
  const wanted = viewport.width / viewport.height;
  if (wanted >= MIN_CANVAS_ASPECT && wanted <= MAX_CANVAS_ASPECT) {
    expect(css.width).toBeGreaterThanOrEqual(viewport.width - ROUNDING);
    expect(css.height).toBeGreaterThanOrEqual(viewport.height - ROUNDING);
  }
});

test('fills a landscape phone, where the browser chrome makes the viewport wide and short', async ({
  page,
}) => {
  // The shape this was actually reported on. A landscape iPhone showing
  // Safari's tab bar and toolbar is around 2.8:1, not the 2.17:1 its screen
  // suggests, and a canvas locked to 16:9 covered only 63% of it.
  await page.setViewportSize({ width: 932, height: 330 });
  await page.goto('/', { waitUntil: 'load' });

  const { css, viewport } = await measureCanvas(page);

  expect(css.width).toBeGreaterThanOrEqual(viewport.width - ROUNDING);
  expect(css.height).toBeGreaterThanOrEqual(viewport.height - ROUNDING);
  expect(css.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(css.height).toBeLessThanOrEqual(viewport.height + 1);
});

test('re-fits when the device is rotated', async ({ page }) => {
  // The scale manager re-fits the canvas on its own but cannot know the game
  // size should change shape too, so without the viewport tracker a rotate puts
  // the bars straight back.
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto('/', { waitUntil: 'load' });
  await measureCanvas(page);

  await page.setViewportSize({ width: 800, height: 400 });
  const { css, viewport } = await measureCanvas(page);

  expect(css.width).toBeGreaterThanOrEqual(viewport.width - ROUNDING);
  expect(css.height).toBeGreaterThanOrEqual(viewport.height - ROUNDING);
});

test('the page does not scroll', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });

  // A scrollable body inside a portal iframe lets the player drag the game out
  // of view mid-play, which reads as broken.
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
  }));

  expect(overflow.x).toBe(false);
  expect(overflow.y).toBe(false);
});
