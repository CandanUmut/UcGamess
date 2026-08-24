import { createGame } from '@ucgames/core';
import { PreloadScene } from './scenes/PreloadScene.ts';
import { MenuScene } from './scenes/MenuScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { GameOverScene } from './scenes/GameOverScene.ts';
import { COLORS, SAVE_KEYS } from './config.ts';

async function boot(): Promise<void> {
  const { context } = await createGame({
    parent: 'game',
    backgroundColor: COLORS.background,
    saveKeys: SAVE_KEYS,
    scenes: [PreloadScene, MenuScene, GameScene, GameOverScene],
  });

  // Phaser has taken over the canvas; drop the pre-boot placeholder.
  document.getElementById('boot')?.classList.add('hidden');

  // In development, expose the metrics summary so a playtest can be checked
  // against the portal thresholds without any backend. Stripped from
  // production builds by the `__UCGAMES_DEV__` constant.
  if (__UCGAMES_DEV__) {
    (window as unknown as Record<string, unknown>).ucgames = {
      metrics: context.metrics,
      summary: () => context.metrics.logSummary(),
    };
    console.warn('[template] Dev tools ready — run ucgames.summary() in the console.');
  }
}

void boot().catch((error: unknown) => {
  console.error('[template] Failed to boot', error);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = 'Something went wrong. Please refresh.';
});
