import { AudioManager, createGame } from '@ucgames/core';
import { MenuScene } from './scenes/MenuScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { NightScene } from './scenes/NightScene.ts';
import { MapScene } from './scenes/MapScene.ts';
import { LevelDoneScene } from './scenes/LevelDoneScene.ts';
import { PauseScene } from './scenes/PauseScene.ts';
import { HiveScene } from './scenes/HiveScene.ts';
import { AwardsScene } from './scenes/AwardsScene.ts';
import { GAME_TITLE } from './config/title.ts';
import { COLORS } from './config/tuning.ts';
import { SAVE_KEYS } from './game/SaveState.ts';
import { installRotateGate } from './ui/rotateGate.ts';

/**
 * Boots into the title screen — no preload scene, and nothing fetched.
 *
 * Nothing is preloaded: sprites are generated at boot in render/textures.ts and
 * audio is synthesised in audio/Sfx.ts, so there is nothing to fetch and a
 * loading screen would only delay the first drag. The menu is interactive on
 * the first frame for the same reason — it costs one tap, not a wait, which is
 * what keeps conversion-to-play intact.
 */
/**
 * How long the UI face is allowed to hold up the first frame, in ms.
 *
 * Waiting at all is worth it: Phaser measures text against whatever face is
 * resolved when a Text object is created, so a font that arrives afterwards
 * leaves every label laid out for the wrong metrics until something forces a
 * re-measure. Waiting *indefinitely* is not — time to interactive is a hard
 * constraint and a shipped game does not get to be blocked by a 19 KB file.
 * Past this, the system stack takes over and the game boots on time.
 */
const FONT_TIMEOUT_MS = 1200;

/**
 * Whether the automated harness's window hooks are installed.
 *
 * The browser checks run against `local` builds, so the hooks have to survive
 * a production build of that — but no portal or public build carries them.
 * `__UCGAMES_PORTAL__` is a build-time literal, so this folds to a constant
 * and the handle code is dropped from the bundle when it is false.
 */
const DEBUG_HOOKS = __UCGAMES_DEV__ || __UCGAMES_PORTAL__ === 'local';

/**
 * Loads the UI face before Phaser measures any text with it.
 *
 * Declared here rather than as an `@font-face` block in index.html for one
 * concrete reason: builds use `base: './'` because portals embed the game at a
 * path we do not know, and a `url()` inside index.html's inline stylesheet is
 * rewritten by Vite against the source tree, where a `publicDir` file does not
 * exist. A FontFace src resolves against the *document* instead, which is
 * exactly the behaviour an iframe at an unknown path needs.
 *
 * Never throws. A missing or slow font drops the game back to the system stack
 * it used before, which is a cosmetic loss; failing to boot is not.
 */
async function loadUiFont(): Promise<void> {
  if (typeof FontFace === 'undefined' || !document.fonts) return;

  try {
    // One file covers the whole 200-1000 weight axis — Nunito ships variable,
    // so asking for two static weights would have downloaded it twice.
    const face = new FontFace('Nunito', "url(./fonts/nunito.woff2) format('woff2')", {
      weight: '200 1000',
      display: 'swap',
    });

    const loaded = await Promise.race([
      face.load(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FONT_TIMEOUT_MS)),
    ]);

    if (loaded) document.fonts.add(loaded);
  } catch (error) {
    console.warn('[beeline] UI font unavailable; using the system stack.', error);
  }
}

async function boot(): Promise<void> {
  document.title = GAME_TITLE;
  await loadUiFont();

  const { game, context } = await createGame({
    parent: 'game',
    backgroundColor: COLORS.background,
    saveKeys: [...SAVE_KEYS, AudioManager.saveKey],
    scenes: [
      MenuScene,
      MapScene,
      GameScene,
      NightScene,
      LevelDoneScene,
      PauseScene,
      HiveScene,
      AwardsScene,
    ],
  });

  // Nothing was preloaded, but the portal still has to be told the game is
  // interactive or it keeps showing its own loading overlay.
  context.portal.loadingFinished();

  document.getElementById('boot')?.classList.add('hidden');

  // Harness hook for the automated functional and performance checks. It runs
  // against a production build, so this cannot be behind __UCGAMES_DEV__.
  // Dev and `local` builds only (see DEBUG_HOOKS).
  game.events.once('ready', () => {
    // Harness hooks exist only in dev and `local` builds — never in a build
    // that goes to a portal or a public page.
    if (DEBUG_HOOKS) (window as unknown as Record<string, unknown>).__game = game;

    // The Game scene installs its own `__beeline` handle when it builds. It is
    // not running yet — the title screen is — and reaching into it here would
    // read a field that does not exist until the first tap.
    const gameScene = (): GameScene | null =>
      (game.scene.getScene('Game') as GameScene | null) ?? null;

    // Installed here rather than immediately after createGame(): the gate
    // applies its state on install, and if the Game scene does not exist yet
    // that first pause is dropped and the countdown runs behind the prompt.
    // Resolved on each call rather than captured: at boot the scene exists but
    // has never been built, and the player may be on the menu when they rotate.
    installRotateGate({
      onBlock: () => gameScene()?.setExternallyPaused(true),
      onUnblock: () => {
        gameScene()?.setExternallyPaused(false);
        // The viewport changed shape; make the scale manager re-measure rather
        // than wait out its polling interval.
        game.scale.refresh();
      },
    });
  });

  if (__UCGAMES_DEV__) {
    (window as unknown as Record<string, unknown>).ucgames = {
      metrics: context.metrics,
      summary: () => context.metrics.logSummary(),
    };
  }
}

void boot().catch((error: unknown) => {
  console.error('[beeline] Failed to boot', error);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = 'Something went wrong. Please refresh.';
});
