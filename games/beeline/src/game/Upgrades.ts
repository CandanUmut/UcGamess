import { TUNING, UNCAPPED } from '../config/tuning.ts';

export type UpgradeId =
  'swarmSize' | 'beeSpeed' | 'routeSlots' | 'bloom' | 'honeyStore' | 'combWax';

export const UPGRADE_ORDER: readonly UpgradeId[] = [
  'routeSlots',
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
 * More Lines is listed first deliberately.
 *
 * It is the only upgrade that buys *reach* rather than throughput, and reach is
 * the thing the board is always short of: blooms open faster than a fixed
 * number of lines can hold. Every other upgrade makes the swarm bigger or
 * faster; this one changes how much of the board you can be in at once, which
 * is why buying one is the best moment in a run.
 */
export const UPGRADES: Record<UpgradeId, UpgradeInfo> = {
  routeSlots: {
    id: 'routeSlots',
    name: 'More Lines',
    blurb: 'Hold one more flower at once',
    format: (level) =>
      `${TUNING.route.maxCount + level * upgradeStep('routeSlots')} lines`,
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
    // Repurposed, and it is now one of the most important lines on the board.
    // It used to raise a cap that only applied to honey earned while the game
    // was closed, which nobody could feel. It now raises the cap on the hive
    // itself — how much you can hold before the combs spill and a good price
    // has to be taken rather than waited for.
    blurb: 'The hive holds more honey before it spills',
    format: (level) =>
      `${TUNING.honey.baseCap + level * upgradeStep('honeyStore')} capacity`,
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
    routeSlots: 0,
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
  /** How many lines may be open at once. */
  routeSlots: number;
  patchCount: number;
  /** How much honey the hive holds before it spills. */
  honeyCap: number;
  offlineCapMoney: number;
  offlineWindowHours: number;
  /** Multiplier on honey banked per delivery. 1 at level zero. */
  honeyMultiplier: number;
}

export function deriveStats(levels: UpgradeLevels): DerivedStats {
  const u = TUNING.upgrades;
  return {
    beeCount: TUNING.bee.baseCount + levels.swarmSize * u.swarmSize.perLevel,
    beeSpeed: TUNING.bee.baseSpeed + levels.beeSpeed * u.beeSpeed.perLevel,
    routeSlots: TUNING.route.maxCount + levels.routeSlots * u.routeSlots.perLevel,
    patchCount: TUNING.patch.baseCount + levels.bloom * u.bloom.perLevel,
    honeyCap: TUNING.honey.baseCap + levels.honeyStore * u.honeyStore.perLevel,
    // Offline earnings are money the swarm sold while you were away, and the
    // same Honey Store level that lets the hive hold more is what lets them
    // bank more of it before the combs back up.
    offlineCapMoney:
      TUNING.offline.baseCapHoney + levels.honeyStore * u.honeyStore.perLevel * 4,
    // Fixed: the cap is the limit the upgrade moves. See TUNING.offline.
    offlineWindowHours: TUNING.offline.baseWindowHours,
    honeyMultiplier: 1 + levels.combWax * u.combWax.perLevel,
  };
}
