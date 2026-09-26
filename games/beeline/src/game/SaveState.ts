import type { SaveManager } from '@ucgames/core';
import { isItemId, type ItemId } from './Items.ts';
import { UPGRADES, type UpgradeLevels } from './HiveUpgrades.ts';

export const SAVE_KEY = 'beeline.save';
export const SAVE_KEYS = [SAVE_KEY] as const;

/**
 * Version 3 adds the campaign — stars and best honey per level — on top of
 * version 2 without disturbing it. A v2 save keeps its endless run as-is.
 *
 * Version 2: the coin economy is gone.
 *
 * Version 1 saved spendable money, permanent upgrade levels and a night shop's
 * shelf. None of that exists any more — every pick is a run pick from the
 * draft — so a v1 save keeps only what still means something: the best day
 * reached and whether the tutorial has been seen. Anything else would be a
 * number the player can no longer spend.
 */
const CURRENT_VERSION = 4;
/** Saves from before this version played a different game; see below. */
const FIRST_COMPATIBLE_VERSION = 2;

export interface BeelineSave {
  version: number;
  /** Next day to be played, 1-indexed. 1 means a fresh run. */
  day: number;
  /** Honey banked across the run so far. The run's score. */
  runScore: number;
  /** Everything this run has picked. Stacks are repeats in the list. */
  items: ItemId[];
  /** The draft on the table, so a reload does not deal a fresh hand. */
  offer: ItemId[];
  /** Furthest day reached across all runs. */
  bestRunDay: number;
  /** Highest run score across all runs. */
  bestScore: number;
  /** Whether the first-run tutorial has been played through. */
  tutorialDone: boolean;
  /** Best stars per campaign level, 0-3, indexed by level id - 1. */
  levelStars: number[];
  /** Best honey per campaign level, indexed the same way. */
  levelBest: number[];
  /** Worlds whose completion has already been celebrated. */
  worldsCelebrated: number[];
  /** Honey waiting to be spent on the hive. Every level and day adds to it. */
  honeyBank: number;
  /** Every drop ever banked, spent or not. */
  lifetimeHoney: number;
  /** Levels of each permanent hive skill bought. */
  upgrades: UpgradeLevels;
  /** Achievement ids unlocked. */
  achievements: string[];
  /** Running totals the achievements count. */
  tally: Tally;
  /** 1 for a level whose mist has given up every treasure. */
  levelExplored: number[];
}

/** Lifetime counts, for achievements. */
export interface Tally {
  wasps: number;
  pots: number;
  royals: number;
  flowersFound: number;
  bestCombo: number;
}

export function emptyTally(): Tally {
  return { wasps: 0, pots: 0, royals: 0, flowersFound: 0, bestCombo: 1 };
}

export function newSave(): BeelineSave {
  return {
    version: CURRENT_VERSION,
    day: 1,
    runScore: 0,
    items: [],
    offer: [],
    bestRunDay: 0,
    bestScore: 0,
    tutorialDone: false,
    levelStars: [],
    levelBest: [],
    worldsCelebrated: [],
    honeyBank: 0,
    lifetimeHoney: 0,
    upgrades: {},
    achievements: [],
    tally: emptyTally(),
    levelExplored: [],
  };
}

/**
 * Rebuilds a save from whatever is on disk, repairing anything unexpected.
 *
 * Save data outlives the code that wrote it. A player who last opened the game
 * two versions ago, or whose storage was truncated, must get a playable game —
 * not a crash on boot. So every field is validated individually and falls back
 * to a sane default rather than trusting the shape.
 */
export function coerceSave(raw: unknown): BeelineSave {
  const fresh = newSave();
  if (typeof raw !== 'object' || raw === null) return fresh;

  const data = raw as Partial<Record<keyof BeelineSave, unknown>>;
  const version = typeof data.version === 'number' ? data.version : 0;
  const legacy = version < FIRST_COMPATIBLE_VERSION;

  return {
    version: CURRENT_VERSION,
    // A v1 run was balanced for a different game; it starts over at day one.
    day: legacy ? 1 : clampInt(data.day, 1, 9999) || 1,
    runScore: legacy ? 0 : clampNumber(data.runScore, 0, Number.MAX_SAFE_INTEGER, 0),
    items: legacy ? [] : coerceItems(data.items),
    offer: legacy ? [] : coerceItems(data.offer),
    bestRunDay: clampInt(data.bestRunDay, 0, 9999),
    bestScore: clampNumber(data.bestScore, 0, Number.MAX_SAFE_INTEGER, 0),
    tutorialDone: data.tutorialDone === true,
    levelStars: coerceNumbers(data.levelStars, 0, 3),
    levelBest: coerceNumbers(data.levelBest, 0, Number.MAX_SAFE_INTEGER),
    worldsCelebrated: coerceNumbers(data.worldsCelebrated, 0, 9),
    honeyBank: clampNumber(data.honeyBank, 0, Number.MAX_SAFE_INTEGER, 0),
    lifetimeHoney: clampNumber(data.lifetimeHoney, 0, Number.MAX_SAFE_INTEGER, 0),
    upgrades: coerceUpgrades(data.upgrades),
    achievements: Array.isArray(data.achievements)
      ? data.achievements.filter((a): a is string => typeof a === 'string').slice(0, 100)
      : [],
    tally: coerceTally(data.tally),
    levelExplored: coerceNumbers(data.levelExplored, 0, 1),
  };
}

function coerceUpgrades(value: unknown): UpgradeLevels {
  const out: UpgradeLevels = {};
  if (typeof value !== 'object' || value === null) return out;
  for (const def of UPGRADES) {
    const n = (value as Record<string, unknown>)[def.id];
    const level = clampInt(n, 0, def.max);
    if (level > 0) out[def.id] = level;
  }
  return out;
}

function coerceTally(value: unknown): Tally {
  const t = emptyTally();
  if (typeof value !== 'object' || value === null) return t;
  const v = value as Record<string, unknown>;
  for (const key of Object.keys(t) as Array<keyof Tally>) {
    t[key] = clampInt(v[key], key === 'bestCombo' ? 1 : 0, Number.MAX_SAFE_INTEGER);
  }
  return t;
}

function coerceNumbers(value: unknown, min: number, max: number): number[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((v) => Math.floor(clampNumber(v, min, max, min)));
}

function coerceItems(value: unknown): ItemId[] {
  if (!Array.isArray(value)) return [];
  // Unknown ids — items renamed or removed between versions — are dropped
  // rather than crashing the lookup at dawn. Capped as well, so a corrupt save
  // with a hundred thousand entries is not a frame-rate bug at every dawn.
  return value.filter(isItemId).slice(0, 200);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function clampInt(value: unknown, min: number, max: number): number {
  return Math.floor(clampNumber(value, min, max, min));
}

export async function loadSave(save: SaveManager): Promise<BeelineSave> {
  return coerceSave(save.get<unknown>(SAVE_KEY, null));
}

export function writeSave(save: SaveManager, state: BeelineSave): void {
  save.set(SAVE_KEY, state);
}
