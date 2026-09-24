import { TUNING } from '../config/tuning.ts';
import { noModifiers, type RunModifiers } from './Items.ts';

/**
 * The hive's working numbers for a day, given what the run has picked.
 *
 * There used to be two tracks here: permanent upgrades bought with coin on a
 * ten-button night screen, and run items bought from a random shelf beside
 * them. Both now come from one place — the draft between days, where the
 * player picks one of three — so this is only the arithmetic that turns the
 * run's picks into numbers the simulation reads.
 *
 * Computed once at dawn rather than read per-bee per-frame: at a few hundred
 * bees and 60Hz, resolving it inline would be tens of thousands of redundant
 * sums a second for a value that changes once a day.
 */
export interface DerivedStats {
  beeCount: number;
  beeSpeed: number;
  /** How many lines may be open at once. */
  routeSlots: number;
  /** Extra flowers on the board, on top of the day's own count. */
  extraPatches: number;
  /** Multiplier on honey banked per delivery. 1 with nothing picked. */
  honeyMultiplier: number;
}

export function deriveStats(modifiers: RunModifiers = noModifiers()): DerivedStats {
  return {
    // Extra bees from picks are added by the field itself (see
    // `Field.fullSwarm`), so a day's losses and boosts apply to one number.
    beeCount: TUNING.bee.baseCount,
    beeSpeed: TUNING.bee.baseSpeed,
    routeSlots: TUNING.route.maxCount + modifiers.extraLines,
    extraPatches: modifiers.extraPatches,
    honeyMultiplier: 1,
  };
}
