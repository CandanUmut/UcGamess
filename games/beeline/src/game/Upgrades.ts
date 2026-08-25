import { TUNING, UNCAPPED } from '../config/tuning.ts';

export type UpgradeId =
  'swarmSize' | 'beeSpeed' | 'routePersistence' | 'bloom' | 'honeyStore' | 'combWax';

export const UPGRADE_ORDER: readonly UpgradeId[] = [
  'routePersistence',
  'swarmSize',
  'beeSpeed',
  'bloom',
  'combWax',
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
  combWax: {
    id: 'combWax',
    name: 'Comb Wax',
    blurb: 'Every delivery is worth more honey',
    format: (level) => `+${Math.round(level * upgradeStep('combWax') * 100)}% honey`,
  },
};

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
    combWax: 0,
  };
}

/** `cost(level) = round(base × growth^level)`. Returns null when maxed. */
export function upgradeCost(id: UpgradeId, level: number): number | null {
  const tuning = TUNING.upgrades[id];
  if (level >= tuning.levels) return null;
  return Math.round(tuning.base * Math.pow(tuning.growth, level));
}

export function maxLevel(id: UpgradeId): number {
  return TUNING.upgrades[id].levels;
}

/**
 * Whether this line has a ceiling a player will ever reach.
 *
 * The night screen uses it to say "Maxed" only where that is actually true —
 * telling a player they have finished Comb Wax would be a lie, and it is the
 * one line whose whole job is to never finish.
 */
export function isCapped(id: UpgradeId): boolean {
  return TUNING.upgrades[id].levels < UNCAPPED;
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
  beeSpeed: number;
  routeHoldSeconds: number;
  patchCount: number;
  offlineCapHoney: number;
  offlineWindowHours: number;
  /** Multiplier on honey banked per delivery. 1 at level zero. */
  honeyMultiplier: number;
}

export function deriveStats(levels: UpgradeLevels): DerivedStats {
  const u = TUNING.upgrades;
  return {
    beeCount: TUNING.bee.baseCount + levels.swarmSize * u.swarmSize.perLevel,
    beeSpeed: TUNING.bee.baseSpeed + levels.beeSpeed * u.beeSpeed.perLevel,
    routeHoldSeconds:
      TUNING.route.holdSeconds + levels.routePersistence * u.routePersistence.perLevel,
    patchCount: TUNING.patch.baseCount + levels.bloom * u.bloom.perLevel,
    offlineCapHoney:
      TUNING.offline.baseCapHoney + levels.honeyStore * u.honeyStore.perLevel,
    // Fixed: the cap is the limit the upgrade moves. See TUNING.offline.
    offlineWindowHours: TUNING.offline.baseWindowHours,
    honeyMultiplier: 1 + levels.combWax * u.combWax.perLevel,
  };
}
