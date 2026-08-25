import { createGame } from '@ucgames/core';
import { MenuScene } from './scenes/MenuScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { NightScene } from './scenes/NightScene.ts';
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
async function boot(): Promise<void> {
  const { game, context } = await createGame({
    parent: 'game',
    backgroundColor: COLORS.background,
    saveKeys: SAVE_KEYS,
    scenes: [MenuScene, GameScene, NightScene],
  });

  // Nothing was preloaded, but the portal still has to be told the game is
  // interactive or it keeps showing its own loading overlay.
  context.portal.loadingFinished();

  document.getElementById('boot')?.classList.add('hidden');

  // Harness hook for the automated functional and performance checks. It runs
  // against a production build, so this cannot be behind __UCGAMES_DEV__.
  // Removed before submission.
  game.events.once('ready', () => {
    (window as unknown as Record<string, unknown>).__game = game;

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
