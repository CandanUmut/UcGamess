import { createGame } from '@ucgames/core';
import { GameScene } from './scenes/GameScene.ts';
import { NightScene } from './scenes/NightScene.ts';
import { COLORS } from './config/tuning.ts';
import { SAVE_KEYS } from './game/SaveState.ts';
import { installRotateGate } from './ui/rotateGate.ts';

/**
 * Boots straight into the game — no preload scene, no menu.
 *
 * Nothing is preloaded: sprites are generated at boot in render/textures.ts and
 * audio is synthesised in audio/Sfx.ts, so there is nothing to fetch and a
 * loading screen would only delay the first drag. That is the whole reason the
 * game is interactive in well under a second, which is the single largest
 * factor in conversion-to-play.
 */
async function boot(): Promise<void> {
  const { game, context } = await createGame({
    parent: 'game',
    backgroundColor: COLORS.background,
    saveKeys: SAVE_KEYS,
    scenes: [GameScene, NightScene],
  });

  // Nothing was preloaded, but the portal still has to be told the game is
  // interactive or it keeps showing its own loading overlay.
  context.portal.loadingFinished();

  document.getElementById('boot')?.classList.add('hidden');

  // Harness hook for the automated functional and performance checks. It runs
  // against a production build, so this cannot be behind __UCGAMES_DEV__.
  // Removed before submission.
  game.events.once('ready', () => {
    const scene = game.scene.getScene('Game') as GameScene | null;
    if (scene) {
      (window as unknown as Record<string, unknown>).__beeline = scene.debugHandle();
    }
    (window as unknown as Record<string, unknown>).__game = game;

    // Installed here rather than immediately after createGame(): the gate
    // applies its state on install, and if the Game scene does not exist yet
    // that first pause is dropped and the countdown runs behind the prompt.
    installRotateGate({
      onBlock: () => scene?.setExternallyPaused(true),
      onUnblock: () => {
        scene?.setExternallyPaused(false);
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
