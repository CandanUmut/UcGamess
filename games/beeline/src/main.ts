import { createGame } from '@ucgames/core';
import { PrototypeScene } from './scenes/PrototypeScene.ts';
import { COLORS } from './config/tuning.ts';

/**
 * Stage 2 boots straight into the prototype — no preload scene, no menu.
 *
 * The prototype ships no external assets (textures are generated at boot, see
 * render/textures.ts), so there is nothing to preload and a loading screen
 * would only delay the one thing being tested. Stage 3 restores the full
 * Preload → Menu → Game → Night flow.
 */
async function boot(): Promise<void> {
  const { context } = await createGame({
    parent: 'game',
    backgroundColor: COLORS.background,
    saveKeys: [],
    scenes: [PrototypeScene],
  });

  // Nothing was preloaded, but the portal still has to be told the game is
  // interactive or it will keep showing its own loading overlay.
  context.portal.loadingFinished();

  document.getElementById('boot')?.classList.add('hidden');

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
