import Phaser from 'phaser';
import { initPortal, type PortalAdapter } from '@ucgames/portal';
import { createGameContext, type GameContext } from '../context.ts';
import { buildScaleConfig, DESIGN_HEIGHT, DESIGN_WIDTH } from '../scale/viewport.ts';

export interface CreateGameOptions {
  /** DOM element (or id) that hosts the canvas. */
  parent: string | HTMLElement;
  /** Scene classes in boot order. */
  scenes: Phaser.Types.Scenes.SceneType[];
  /** Keys this game persists, so they can be preloaded in one pass. */
  saveKeys?: readonly string[];
  /** Canvas clear colour. */
  backgroundColor?: string;
  /** Extra Phaser config merged last. Use sparingly. */
  phaserOverrides?: Partial<Phaser.Types.Core.GameConfig>;
}

export interface BootedGame {
  game: Phaser.Game;
  context: GameContext;
  portal: PortalAdapter;
}

/**
 * Boots a game with the portal, scaler, audio, save and metrics already wired.
 *
 * Games call this instead of `new Phaser.Game(...)`. That is not ceremony: the
 * portal adapter must be initialised *before* the first scene runs, because the
 * preload scene calls `loadingFinished()` on it. Constructing Phaser directly
 * skips that and produces a game that never tells the portal it finished
 * loading — which looks, from the player's side, like a permanent loading
 * screen.
 *
 * `init()` resolves even when the SDK fails, so an adblocked player still gets
 * a working game.
 */
export async function createGame(options: CreateGameOptions): Promise<BootedGame> {
  const portal = await initPortal();

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: options.parent,
    backgroundColor: options.backgroundColor ?? '#101018',
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    scale: buildScaleConfig(options.parent),

    // We run our own accumulator (see FixedTimestep), so Phaser's loop is left
    // to render as fast as the display allows. `smoothStep` is off because we
    // want the true delta — smoothing it would hide exactly the frame-time
    // variation the accumulator exists to absorb.
    fps: {
      target: 60,
      min: 30,
      forceSetTimeOut: false,
      smoothStep: false,
    },

    render: {
      // Portals embed games in an iframe over arbitrary page backgrounds;
      // a transparent canvas leaks that through.
      transparent: false,
      antialias: true,
      // Cheaper on the low-end Android hardware that makes up a large share of
      // portal traffic, and invisible on everything else.
      powerPreference: 'high-performance',
    },

    // Autofocus steals focus from the embedding page, which portals dislike.
    autoFocus: true,
    disableContextMenu: true,

    scene: options.scenes,
    ...options.phaserOverrides,
  };

  const game = new Phaser.Game(config);
  const context = createGameContext(game, portal, options.saveKeys ?? []);

  // Persist before the tab goes away. `pagehide` fires reliably on iOS Safari
  // where `beforeunload` does not.
  window.addEventListener('pagehide', () => void context.save.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void context.save.flush();
  });

  return { game, context, portal };
}
