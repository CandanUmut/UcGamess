/**
 * Portrait handling.
 *
 * Beeline is authored at 1280x720 and the scale manager fits that into the
 * viewport. On a portrait phone — say 390x844 — fitting 16:9 produces a
 * 390x219 strip centred in a mostly empty screen. Reported from a real device
 * as "the game is in the middle 1/3, the rest is fully empty", and a portal
 * reviewer opening it on a phone would see exactly the same thing.
 *
 * The overlay is **DOM, not a Phaser scene**. That is the whole trick: the
 * canvas *is* the letterboxed strip, so anything drawn inside Phaser would be
 * confined to the same third of the screen. Only a DOM element can cover the
 * empty area and explain what is going on.
 *
 * Gameplay is paused while it shows. Without that a player loses a day to the
 * countdown while turning their phone, which is a bad first impression from a
 * message that is supposed to be helpful.
 */

export interface RotateGate {
  /** True while the prompt is covering the screen. */
  isBlocking(): boolean;
  destroy(): void;
}

export interface RotateGateOptions {
  onBlock: () => void;
  onUnblock: () => void;
}

const OVERLAY_ID = 'rotate-gate';

/**
 * Only nags devices that can actually rotate.
 *
 * A desktop user with a tall narrow window should never see this — they can
 * simply resize, and a modal telling them to rotate their monitor is absurd.
 * `pointer: coarse` is the standard signal for a touch device.
 */
function shouldGate(): boolean {
  if (typeof window.matchMedia !== 'function') return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (!coarse) return false;
  return window.innerHeight > window.innerWidth;
}

export function installRotateGate(options: RotateGateOptions): RotateGate {
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'status');
  overlay.innerHTML = `
    <div class="rotate-inner">
      <svg class="rotate-icon" viewBox="0 0 64 64" aria-hidden="true">
        <rect x="22" y="6" width="20" height="36" rx="3"
              fill="none" stroke="currentColor" stroke-width="2.5"/>
        <path d="M14 50a22 22 0 0 0 36 0" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round"/>
        <path d="M50 44v7h-7" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <p class="rotate-title">Turn your phone sideways</p>
      <p class="rotate-sub">Beeline needs a wide screen</p>
    </div>`;
  document.body.appendChild(overlay);

  let blocking = false;

  const apply = () => {
    const next = shouldGate();
    if (next === blocking) return;
    blocking = next;
    overlay.classList.toggle('visible', blocking);
    if (blocking) options.onBlock();
    else options.onUnblock();
  };

  // `orientationchange` fires before the new viewport dimensions are readable
  // on some browsers, so re-check shortly after as well as immediately.
  const onOrientation = () => {
    apply();
    window.setTimeout(apply, 120);
    window.setTimeout(apply, 400);
  };

  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', onOrientation);
  apply();

  return {
    isBlocking: () => blocking,
    destroy() {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', onOrientation);
      overlay.remove();
    },
  };
}
