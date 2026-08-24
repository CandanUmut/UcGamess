/** Tunables for the template game, gathered so they are easy to find and change. */
export const GAME = {
  /** Horizontal speed of the player paddle, in game units per second. */
  playerSpeed: 720,
  /** How fast falling shapes descend at the start, units per second. */
  baseFallSpeed: 260,
  /** Added to fall speed per point scored — the difficulty ramp. */
  fallSpeedPerPoint: 6,
  /** Cap so the game stays playable rather than becoming a reflex lottery. */
  maxFallSpeed: 900,
  /** Seconds between spawns at the start. */
  baseSpawnInterval: 0.9,
  /** Fastest spawn rate allowed. */
  minSpawnInterval: 0.32,
  /** Lives the player starts with. */
  startingLives: 3,
  playerWidth: 150,
  playerHeight: 22,
  shapeSize: 34,
} as const;

/** Save keys this game persists. Declared up front so they load in one pass. */
export const SAVE_KEYS = ['highScore'] as const;

export const COLORS = {
  background: '#101018',
  player: 0x4ade80,
  good: 0x60a5fa,
  bad: 0xf87171,
  text: '#f4f4f8',
  dim: '#8a8aa0',
} as const;
