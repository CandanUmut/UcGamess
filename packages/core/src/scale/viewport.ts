import Phaser from 'phaser';

/**
 * The design resolution every game is authored against.
 *
 * 1280x720 is 16:9, which is what portals embed. Authoring at a single fixed
 * size and letting the scale manager fit it means a scene laid out on a desktop
 * is automatically correct on a phone — no per-device layout code, and no
 * chance of UI drifting off-screen on an aspect ratio nobody tested.
 */
export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;
export const DESIGN_ASPECT = DESIGN_WIDTH / DESIGN_HEIGHT;

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
 * FIT + CENTER_BOTH letterboxes rather than cropping or stretching. That is the
 * deliberate choice: cropping hides UI on unusual aspect ratios and stretching
 * looks broken, and both are the kind of thing a portal reviewer rejects on
 * sight. Letterbox bars are boring and always correct.
 */
export function buildScaleConfig(
  parent: string | HTMLElement,
): Phaser.Types.Core.ScaleConfig {
  return {
    parent,
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    // Rounding display size to whole pixels avoids sub-pixel text shimmer on
    // low-DPI screens and is cheaper on weak mobile GPUs.
    autoRound: true,
    expandParent: true,
  };
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
