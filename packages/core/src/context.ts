import type Phaser from 'phaser';
import type { PortalAdapter } from '@ucgames/portal';
import { AudioManager } from './audio/AudioManager.ts';
import { SaveManager } from './save/SaveManager.ts';
import { Metrics } from './metrics/Metrics.ts';

const REGISTRY_KEY = 'ucgames:context';

/**
 * The services every scene needs, in one object.
 *
 * Stored in Phaser's registry rather than a module-level singleton so that two
 * games on one page (or a test spinning up several) do not share state.
 */
export interface GameContext {
  readonly portal: PortalAdapter;
  readonly audio: AudioManager;
  readonly save: SaveManager;
  readonly metrics: Metrics;
}

export function createGameContext(
  game: Phaser.Game,
  portal: PortalAdapter,
  saveKeys: readonly string[],
): GameContext {
  const context: GameContext = {
    portal,
    audio: new AudioManager(game),
    save: new SaveManager(portal, [...saveKeys, AudioManager.saveKey]),
    metrics: new Metrics(),
  };

  game.registry.set(REGISTRY_KEY, context);
  return context;
}

/**
 * Reads the context from a scene.
 *
 * Throws rather than returning undefined: a missing context means the game was
 * booted without `createGame()`, and every subsequent call would fail with a
 * more confusing error further away from the cause.
 */
export function getContext(scene: Phaser.Scene): GameContext {
  const context = scene.registry.get(REGISTRY_KEY) as GameContext | undefined;
  if (!context) {
    throw new Error(
      'GameContext missing. Boot the game with createGame() from @ucgames/core rather than constructing Phaser.Game directly.',
    );
  }
  return context;
}
