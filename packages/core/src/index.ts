export {
  createGame,
  type CreateGameOptions,
  type BootedGame,
} from './game/createGame.ts';

export { getContext, createGameContext, type GameContext } from './context.ts';

export { FixedTimestep, type FixedTimestepOptions } from './loop/FixedTimestep.ts';

export {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  DESIGN_ASPECT,
  buildScaleConfig,
  readSafeAreaInsets,
  safeAreaRect,
  isPortrait,
  type SafeAreaInsets,
} from './scale/viewport.ts';

export { InputManager, type InputState, type InputDevice } from './input/InputManager.ts';
export { AudioManager } from './audio/AudioManager.ts';
export { SaveManager } from './save/SaveManager.ts';
export { Metrics, type SessionRecord, type MetricsSummary } from './metrics/Metrics.ts';

export { BaseScene } from './scenes/BaseScene.ts';
export { BasePreloadScene } from './scenes/BasePreloadScene.ts';
export { BaseGameplayScene } from './scenes/BaseGameplayScene.ts';

export type { PortalAdapter, PortalName } from '@ucgames/portal';
