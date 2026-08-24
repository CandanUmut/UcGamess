import Phaser from 'phaser';
import { computeGameSize, DESIGN_HEIGHT, DESIGN_WIDTH } from './canvasSize.ts';

export {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  DESIGN_ASPECT,
  MIN_CANVAS_ASPECT,
  MAX_CANVAS_ASPECT,
  computeGameSize,
  type CanvasSize,
} from './canvasSize.ts';

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Reads the device's safe-area insets, in CSS pixels.
 *
 * Notched phones and the CrazyGames app both reserve screen edges. Anything
 * drawn there — a pause button in the top-left, a score in the top-right — is
 * either invisible or unreachable. Requires `viewport-fit=cover` in the
 * viewport meta tag; the game template sets it.
 *
 * Returns zeroes on browsers without env() support, which is the correct
 * fallback: no notch, no inset.
 */
export function readSafeAreaInsets(): SafeAreaInsets {
  const probe = document.createElement('div');
  probe.style.cssText = [
    'position:fixed',
    'visibility:hidden',
    'pointer-events:none',
    'top:env(safe-area-inset-top,0px)',
    'right:env(safe-area-inset-right,0px)',
    'bottom:env(safe-area-inset-bottom,0px)',
    'left:env(safe-area-inset-left,0px)',
  ].join(';');
  document.body.appendChild(probe);

  const computed = window.getComputedStyle(probe);
  const insets: SafeAreaInsets = {
    top: parsePx(computed.top),
    right: parsePx(computed.right),
    bottom: parsePx(computed.bottom),
    left: parsePx(computed.left),
  };

  probe.remove();
  return insets;
}

function parsePx(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The rectangle inside the design canvas that is guaranteed visible and
 * touchable, in game coordinates.
 *
 * Anchor HUD elements to this rather than to (0,0) and (width,height).
 */
export function safeAreaRect(scene: Phaser.Scene): Phaser.Geom.Rectangle {
  const insets = readSafeAreaInsets();
  const { displaySize, gameSize } = scene.scale;

  // Convert CSS pixels to game units. displaySize is the canvas's on-screen
  // size; gameSize is our design resolution.
  const scaleX = gameSize.width / Math.max(displaySize.width, 1);
  const scaleY = gameSize.height / Math.max(displaySize.height, 1);

  const left = insets.left * scaleX;
  const right = insets.right * scaleX;
  const top = insets.top * scaleY;
  const bottom = insets.bottom * scaleY;

  return new Phaser.Geom.Rectangle(
    left,
    top,
    Math.max(gameSize.width - left - right, 0),
    Math.max(gameSize.height - top - bottom, 0),
  );
}

/**
 * The scale config every game uses.
 *
 * Still FIT + CENTER_BOTH — cropping hides UI and stretching looks broken, and
 * both are the kind of thing a portal reviewer rejects on sight. The difference
 * is that the game size now matches the device's shape, so FIT has almost
 * nothing left to letterbox.
 */
export function buildScaleConfig(
  parent: string | HTMLElement,
): Phaser.Types.Core.ScaleConfig {
  const size = computeGameSize(window.innerWidth, window.innerHeight);
  return {
    parent,
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: size.width,
    height: size.height,
    // Rounding display size to whole pixels avoids sub-pixel text shimmer on
    // low-DPI screens and is cheaper on weak mobile GPUs.
    autoRound: true,
    expandParent: true,
  };
}

/**
 * Keeps the canvas matched to the viewport across rotates and resizes.
 *
 * Phaser's ScaleManager re-fits the canvas on its own, but it cannot know the
 * game size should change shape too — so without this, rotating a phone or
 * Safari hiding its toolbar reintroduces exactly the bars this removes.
 *
 * The guard is load-bearing: `setGameSize` emits RESIZE, so reacting to RESIZE
 * by calling it again recurses until the stack gives out.
 */
export function trackViewportSize(game: Phaser.Game): void {
  let applying = false;

  const apply = (): void => {
    if (applying) return;
    const next = computeGameSize(window.innerWidth, window.innerHeight);
    const current = game.scale.gameSize;
    if (current.width === next.width && current.height === next.height) return;

    applying = true;
    try {
      game.scale.setGameSize(next.width, next.height);
    } finally {
      applying = false;
    }
  };

  game.scale.on(Phaser.Scale.Events.RESIZE, apply);
  window.addEventListener('orientationchange', apply);
  apply();
}

/**
 * The part of design space actually on screen, in design units.
 *
 * The playfield is `0,0 -> DESIGN_WIDTH,DESIGN_HEIGHT`; this rectangle is at
 * least that and usually larger, extending symmetrically outside it. Use it to
 * cover the whole canvas — a full-screen backdrop sized to the playfield leaves
 * the extra area unpainted.
 */
export function viewRect(scene: Phaser.Scene): Phaser.Geom.Rectangle {
  const { width, height } = scene.scale.gameSize;
  return new Phaser.Geom.Rectangle(
    (DESIGN_WIDTH - width) / 2,
    (DESIGN_HEIGHT - height) / 2,
    width,
    height,
  );
}

/**
 * Centres the fixed playfield inside a canvas that may be larger than it.
 *
 * Scrolling the camera rather than moving every object means scenes stay
 * authored against 1280x720 and nothing else has to know the canvas grew.
 */
export function centerPlayfield(scene: Phaser.Scene): void {
  const { width, height } = scene.scale.gameSize;
  scene.cameras.main.setScroll((DESIGN_WIDTH - width) / 2, (DESIGN_HEIGHT - height) / 2);
}

/**
 * Whether the device is currently held in portrait.
 *
 * Used by the template's rotate prompt. We compare the window's own dimensions
 * rather than `screen.orientation`, because the latter reports the *device*
 * orientation and is wrong inside a portal iframe.
 */
export function isPortrait(): boolean {
  return window.innerHeight > window.innerWidth;
}
