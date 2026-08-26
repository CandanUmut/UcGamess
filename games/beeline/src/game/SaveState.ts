import type { SaveManager } from '@ucgames/core';
import { emptyLevels, maxLevel, UPGRADE_ORDER, type UpgradeLevels } from './Upgrades.ts';
import { isItemId, type ItemId } from './Items.ts';

export const SAVE_KEY = 'beeline.save';
export const SAVE_KEYS = [SAVE_KEY] as const;

const CURRENT_VERSION = 1;

export interface BeelineSave {
  version: number;
  /** Unspent money. The run's spendable currency. */
  money: number;
  /** Next day to be played, 1-indexed. */
  day: number;
  levels: UpgradeLevels;
  bestDayMoney: number;
  /** Furthest day reached across all runs. The thing a run is played for. */
  bestRunDay: number;
  /** Epoch ms of the last day completed, for offline accrual. */
  lastPlayedAt: number;
  /**
   * Everything this run has bought. Stacks are repeats in the list.
   *
   * Cleared when a run ends, which is what makes an item a run and an upgrade a
   * career. See Items.ts.
   */
  items: ItemId[];
  /** Tonight's four offers, so a reload does not reroll them for free. */
  offer: ItemId[];
  /** Rerolls taken tonight, which is what the next one is priced from. */
  rerolls: number;
  /** Whether the first-run tutorial has been played through. */
  tutorialDone: boolean;
}

export function newSave(): BeelineSave {
  return {
    version: CURRENT_VERSION,
    money: 0,
    day: 1,
    levels: emptyLevels(),
    bestDayMoney: 0,
    bestRunDay: 0,
    lastPlayedAt: Date.now(),
    items: [],
    offer: [],
    rerolls: 0,
    tutorialDone: false,
  };
}

/**
 * Rebuilds a save from whatever is on disk, repairing anything unexpected.
 *
 * Save data outlives the code that wrote it. A player who last opened the game
 * two versions ago, or whose storage was truncated, must get a playable game —
 * not a crash on boot. So every field is validated individually and falls back
 * to a sane default rather than trusting the shape.
 *
 * The alternative — throwing on malformed data — turns a cosmetic storage
 * problem into a game that cannot start, which is unrecoverable for the player
 * and invisible to us.
 */
export function coerceSave(raw: unknown): BeelineSave {
  const fresh = newSave();
  if (typeof raw !== 'object' || raw === null) return fresh;

  const data = raw as Partial<Record<keyof BeelineSave, unknown>>;

  const levels = emptyLevels();
  const storedLevels = data.levels;
  if (typeof storedLevels === 'object' && storedLevels !== null) {
    const source = storedLevels as Record<string, unknown>;
    for (const id of UPGRADE_ORDER) {
      // Clamp rather than trust: a level above the cap would index past the
      // cost table and produce NaN prices.
      levels[id] = clampInt(source[id], 0, maxLevel(id));
    }
  }

  return {
    version: CURRENT_VERSION,
    money: clampNumber(data.money, 0, Number.MAX_SAFE_INTEGER, 0),
    day: clampInt(data.day, 1, 9999) || 1,
    levels,
    bestDayMoney: clampNumber(data.bestDayMoney, 0, Number.MAX_SAFE_INTEGER, 0),
    bestRunDay: clampInt(data.bestRunDay, 0, 9999),
    lastPlayedAt: clampNumber(data.lastPlayedAt, 0, Date.now(), Date.now()),
    // Unknown ids — items renamed or removed between versions — are dropped
    // rather than crashing the lookup at dawn.
    items: coerceItems(data.items),
    offer: coerceItems(data.offer),
    rerolls: clampInt(data.rerolls, 0, 99),
    tutorialDone: data.tutorialDone === true,
  };
}

function coerceItems(value: unknown): ItemId[] {
  if (!Array.isArray(value)) return [];
  // Capped as well as filtered. A corrupt or hand-edited save with a hundred
  // thousand entries would otherwise be a frame-rate bug at every dawn.
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
