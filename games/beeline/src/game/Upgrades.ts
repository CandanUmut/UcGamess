import { TUNING } from '../config/tuning.ts';

export type UpgradeId =
  'swarmSize' | 'beeSpeed' | 'routePersistence' | 'bloom' | 'honeyStore' | 'comb';

export const UPGRADE_ORDER: readonly UpgradeId[] = [
  'routePersistence',
  'swarmSize',
  'beeSpeed',
  'comb',
  'bloom',
  'honeyStore',
];

export interface UpgradeInfo {
  id: UpgradeId;
  name: string;
  /** What it does, in the player's terms. No stat names. */
  blurb: string;
  /** Current effect, formatted for display. */
  format(level: number): string;
}

/**
 * Route Persistence is listed first deliberately.
 *
 * It is the only upgrade that buys relief from the core pressure rather than
 * more throughput, so it should be the one a new player reads first and the one
 * they most want. Everything else makes the swarm bigger or faster; this one
 * makes the game less demanding.
 */
export const UPGRADES: Record<UpgradeId, UpgradeInfo> = {
  routePersistence: {
    id: 'routePersistence',
    name: 'Beeswax Trails',
    blurb: 'Routes last longer before they fade',
    format: (level) =>
      `${(TUNING.route.holdSeconds + level * upgradeStep('routePersistence')).toFixed(0)}s`,
  },
  swarmSize: {
    id: 'swarmSize',
    name: 'Brood Chamber',
    blurb: 'More bees in the swarm',
    format: (level) => `${TUNING.bee.baseCount + level * upgradeStep('swarmSize')} bees`,
  },
  beeSpeed: {
    id: 'beeSpeed',
    name: 'Stronger Wings',
    blurb: 'Bees fly faster',
    format: (level) =>
      `${Math.round(((TUNING.bee.baseSpeed + level * upgradeStep('beeSpeed')) / TUNING.bee.baseSpeed) * 100)}%`,
  },
  bloom: {
    id: 'bloom',
    name: 'Wildflowers',
    blurb: 'More flower patches in bloom at once',
    format: (level) => `${TUNING.patch.baseCount + level * upgradeStep('bloom')} patches`,
  },
  honeyStore: {
    id: 'honeyStore',
    name: 'Honey Store',
    blurb: 'Hold more honey collected while you are away',
    format: (level) =>
      `${TUNING.offline.baseCapHoney + level * upgradeStep('honeyStore')} max`,
  },
  comb: {
    id: 'comb',
    name: 'Deeper Comb',
    blurb: 'A cheaper hive to keep, and room to grow further',
    // Upkeep only. The card sublabel renders "effect → next effect · cost" on
    // one unwrapped line in a 340-unit card, and spelling out both of this
    // upgrade's effects ran the text clean over the card beside it. The raised
    // caps are said once under the section heading instead of twice on every
    // redraw of this card.
    format: (level) => `−${Math.round(upkeepRelief(level) * 100)}% keep`,
  },
};

/** How much of the daily bill Deeper Comb waives at a given level. */
export function upkeepRelief(level: number): number {
  return Math.min(0.85, level * TUNING.hive.upkeepReliefPerComb);
}

function upgradeStep(id: UpgradeId): number {
  return TUNING.upgrades[id].perLevel;
}

export type UpgradeLevels = Record<UpgradeId, number>;

export function emptyLevels(): UpgradeLevels {
  return {
    swarmSize: 0,
    beeSpeed: 0,
    routePersistence: 0,
    bloom: 0,
    honeyStore: 0,
    comb: 0,
  };
}

/**
 * How far along the hive is, 0..1, across everything bought.
 *
 * Used only for how the hive looks. Measured against the caps at the player's
 * current comb depth, so deepening the comb does not make the hive appear to
 * shrink back — it raises the ceiling, and the hive should read as bigger for
 * it, not smaller.
 */
export function hiveGrowth(levels: UpgradeLevels): number {
  let bought = 0;
  let available = 0;
  for (const id of UPGRADE_ORDER) {
    bought += levels[id];
    available += maxLevel(id, levels.comb);
  }
  return available > 0 ? Math.min(1, bought / available) : 0;
}

/** `cost(level) = round(base × growth^level)`. Returns null when maxed. */
export function upgradeCost(id: UpgradeId, level: number, combLevel = 0): number | null {
  const tuning = TUNING.upgrades[id];
  if (level >= maxLevel(id, combLevel)) return null;
  return Math.round(tuning.base * Math.pow(tuning.growth, level));
}

/**
 * The level cap for an upgrade, given how deep the comb is.
 *
 * Deeper Comb raises the ceiling on everything else, which is what gives the
 * night screen a spine: at some point the only way forward is to stop buying
 * output and invest in the hive that can hold it. Comb's own cap never moves,
 * or the ladder would have no top.
 */
export function maxLevel(id: UpgradeId, combLevel = 0): number {
  const base = TUNING.upgrades[id].levels;
  if (id === 'comb') return base;
  return base + combLevel * TUNING.upgrades.comb.perLevel;
}

/**
 * Everything the simulation needs to know about the player's purchases.
 *
 * Computed once when levels change rather than read per-bee per-frame — at 500
 * bees and 60Hz, resolving `base + level * perLevel` inline would be 30,000
 * redundant multiplications a second for a value that changes once a day.
 */
export interface DerivedStats {
  beeCount: number;
  /** Honey the hive charges per day for the swarm above its starting size. */
  upkeep: number;
  beeSpeed: number;
  routeHoldSeconds: number;
  patchCount: number;
  offlineCapHoney: number;
  offlineWindowHours: number;
}

/**
 * The hive's daily bill for a swarm of this size.
 *
 * Only bees beyond the starting swarm are charged. The hive you were given is
 * free; the hive you built has to be fed — which is what makes Brood Chamber a
 * decision rather than the obvious purchase, and what puts the difficulty back
 * that standing roads take away.
 */
export function upkeepFor(beeCount: number, combLevel: number): number {
  const extra = Math.max(0, beeCount - TUNING.bee.baseCount);
  return Math.round(extra * TUNING.hive.upkeepPerBee * (1 - upkeepRelief(combLevel)));
}

export function deriveStats(levels: UpgradeLevels): DerivedStats {
  const u = TUNING.upgrades;
  const beeCount = TUNING.bee.baseCount + levels.swarmSize * u.swarmSize.perLevel;
  return {
    beeCount,
    upkeep: upkeepFor(beeCount, levels.comb),
    beeSpeed: TUNING.bee.baseSpeed + levels.beeSpeed * u.beeSpeed.perLevel,
    routeHoldSeconds:
      TUNING.route.holdSeconds + levels.routePersistence * u.routePersistence.perLevel,
    patchCount: TUNING.patch.baseCount + levels.bloom * u.bloom.perLevel,
    offlineCapHoney:
      TUNING.offline.baseCapHoney + levels.honeyStore * u.honeyStore.perLevel,
    // Fixed: the cap is the limit the upgrade moves. See TUNING.offline.
    offlineWindowHours: TUNING.offline.baseWindowHours,
  };
}
