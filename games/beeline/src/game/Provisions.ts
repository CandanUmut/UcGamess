import { TUNING } from '../config/tuning.ts';
import type { DayFeatures } from './DayCycle.ts';

export type ProvisionId =
  'scoutBees' | 'pruningShears' | 'smokePot' | 'waxedTrails' | 'earlyRise';

export const PROVISION_ORDER: readonly ProvisionId[] = [
  'scoutBees',
  'waxedTrails',
  'pruningShears',
  'smokePot',
  'earlyRise',
];

/**
 * What a provision changes about tomorrow.
 *
 * A plain data bag rather than a callback, so the whole effect of a purchase is
 * one object the simulation reads at dawn. That keeps every consumable testable
 * without a scene, and it means adding one is a table entry rather than a new
 * branch somewhere in `beginDay`.
 */
export interface DayModifiers {
  /** Multiplier on every flower's starting pollen. */
  patchPool: number;
  /** Radius the map is lit to around the hive at dawn. 0 for none. */
  scoutRadius: number;
  /**
   * Extra openness carved into the maze at dawn, 0..1.
   *
   * Added to the day's own openness, so it opens gaps rather than removing the
   * board — a cleared path is still a path through brambles.
   */
  mazeOpennessBonus: number;
  /** Multiplier on a wasp's intercept radius. */
  waspIntercept: number;
  /** Multiplier on the safe radius around the hive. */
  waspSafeRadius: number;
  /** Extra seconds of route hold, on top of the upgrade. */
  extraHoldSeconds: number;
  /** Extra seconds on the day's clock. */
  extraDaySeconds: number;
}

export function noModifiers(): DayModifiers {
  return {
    patchPool: 1,
    scoutRadius: 0,
    mazeOpennessBonus: 0,
    waspIntercept: 1,
    waspSafeRadius: 1,
    extraHoldSeconds: 0,
    extraDaySeconds: 0,
  };
}

export interface ProvisionInfo {
  id: ProvisionId;
  name: string;
  /**
   * The effect in a handful of characters, for the shelf chip.
   *
   * Separate from `blurb` because the chip is 240 design units wide and the
   * sublabel does not wrap or clip — a sentence there runs straight over the
   * chip beside it. The upgrade cards already read as terse effect deltas
   * ("36 bees → 42 bees"), so this matches them.
   */
  effect: string;
  /** The same thing as a sentence, for the banner at dawn. */
  blurb: string;
  /**
   * Whether it would actually do anything on a day with these features.
   *
   * This is the rule that keeps the shelf honest. Selling smoke on a day with
   * no wasps is selling nothing, and a player who buys one dud stops trusting
   * the whole row — so a provision that cannot help is never offered. It also
   * gives the shelf a pleasant ramp of its own: three options early, five once
   * the field has thorns and wasps in it.
   */
  relevant(features: DayFeatures): boolean;
  apply(into: DayModifiers): void;
}

export const PROVISIONS: Record<ProvisionId, ProvisionInfo> = {
  scoutBees: {
    id: 'scoutBees',
    name: 'Scout Bees',
    effect: 'wide dawn light',
    // Reveals rather than fattens the flowers. The old effect was a flat
    // pollen bonus, which had nothing to do with scouting and was the least
    // interesting thing honey could buy. Now that the board is dark, buying
    // knowledge of it is the most valuable one-off there is — and the name
    // finally describes what the item does.
    blurb: 'the scouts map the field before dawn',
    relevant: () => true,
    apply: (m) => {
      m.scoutRadius = TUNING.fog.scoutRadius;
    },
  },
  waxedTrails: {
    id: 'waxedTrails',
    name: 'Waxed Trails',
    effect: '+8s route hold',
    blurb: 'routes hold far longer today',
    relevant: () => true,
    apply: (m) => {
      m.extraHoldSeconds = 8;
    },
  },
  pruningShears: {
    id: 'pruningShears',
    name: 'Pruning Shears',
    effect: 'wider paths',
    blurb: 'the brambles are cut back overnight',
    relevant: (features) => features.mazeOpenness < 1,
    apply: (m) => {
      m.mazeOpennessBonus = 0.25;
    },
  },
  smokePot: {
    id: 'smokePot',
    name: 'Smoke Pot',
    effect: 'wasps kept back',
    blurb: 'wasps keep their distance',
    relevant: (features) => features.wasps > 0,
    apply: (m) => {
      m.waspIntercept = 0.45;
      m.waspSafeRadius = 1.9;
    },
  },
  earlyRise: {
    id: 'earlyRise',
    name: 'Early Rise',
    effect: '+12s daylight',
    blurb: 'twelve more seconds of daylight',
    relevant: () => true,
    apply: (m) => {
      m.extraDaySeconds = 12;
    },
  },
};

/**
 * What a provision costs for a given day.
 *
 * Grows with the day so it stays a decision. A flat price would be a real
 * choice on day three and a rounding error on day fifteen, at which point the
 * row stops asking anything and becomes a button you press out of habit.
 */
export function provisionCost(id: ProvisionId, day: number): number {
  const { base } = TUNING.provisions[id];
  const growth = Math.min(
    Math.pow(TUNING.provisions.costGrowth, Math.max(0, day - 1)),
    TUNING.provisions.costCapMultiplier,
  );
  return Math.round(base * growth);
}

/** The provisions worth showing for a day with these features. */
export function provisionsFor(features: DayFeatures): ProvisionId[] {
  return PROVISION_ORDER.filter((id) => PROVISIONS[id].relevant(features));
}

/**
 * The modifiers a day starts with, given the provision carried into it.
 *
 * At most one provision is ever carried, which is the entire design of the
 * system. A stackable inventory would need quantities, a screen to manage them,
 * and balance against every combination — and it would turn the night screen
 * from "which one thing do I want tomorrow" into bookkeeping. One slot makes
 * the purchase a read of the forecast, which is a decision worth having.
 */
export function modifiersFor(provision: ProvisionId | null): DayModifiers {
  const modifiers = noModifiers();
  if (provision) PROVISIONS[provision].apply(modifiers);
  return modifiers;
}

export function isProvisionId(value: unknown): value is ProvisionId {
  return typeof value === 'string' && value in PROVISIONS;
}
