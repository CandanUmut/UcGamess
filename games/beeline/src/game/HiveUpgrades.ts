import type { ItemId } from './Items.ts';
import type { RunModifiers } from './Items.ts';

/**
 * The hive's permanent skills, bought with banked honey.
 *
 * This is what honey is *for*. Every drop a level or an endless day brings in
 * goes into the bank, and the bank buys a stronger hive: more bees, faster
 * wings, keener eyes for the mist. A level that was out of reach for three
 * stars becomes reachable after a few purchases, which is the reason to replay
 * the ones you have already passed.
 *
 * The higher levels of each skill also need stars, so honey alone cannot buy
 * the top of the tree — you have to have played well, not just played long.
 */
export type UpgradeId =
  'swarm' | 'wings' | 'crews' | 'eyes' | 'nectar' | 'stingers' | 'lines';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** What one level gives, in the player's words. */
  perLevel: string;
  max: number;
  /** Honey for the first level; each next level costs `growth` times more. */
  baseCost: number;
  growth: number;
  /** Stars (campaign total) needed to buy each level, index 0 = first level. */
  starsFor: readonly number[];
  /** Draft item whose icon this skill borrows. */
  icon: ItemId;
  apply(m: RunModifiers, level: number): void;
}

export const UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'swarm',
    name: 'Bigger Swarm',
    perLevel: '+3 bees',
    max: 5,
    baseCost: 250,
    growth: 1.7,
    starsFor: [0, 0, 6, 15, 30],
    icon: 'broodChamber',
    apply: (m, n) => {
      m.extraBees += 3 * n;
    },
  },
  {
    id: 'wings',
    name: 'Swift Wings',
    perLevel: '+7% flying speed',
    max: 5,
    baseCost: 300,
    growth: 1.7,
    starsFor: [0, 0, 6, 15, 30],
    icon: 'swiftWings',
    apply: (m, n) => {
      m.beeSpeedBonus += 0.07 * n;
    },
  },
  {
    id: 'eyes',
    name: 'Keen Eyes',
    perLevel: 'see further into the mist',
    max: 4,
    baseCost: 350,
    growth: 1.8,
    starsFor: [0, 3, 12, 25],
    icon: 'scoutBees',
    apply: (m, n) => {
      m.beeSightBonus += 0.2 * n;
      m.hiveSightBonus += 40 * n;
    },
  },
  {
    id: 'nectar',
    name: 'Sweet Nectar',
    perLevel: '+6% honey',
    max: 5,
    baseCost: 400,
    growth: 1.75,
    starsFor: [0, 3, 10, 20, 40],
    icon: 'combFrames',
    apply: (m, n) => {
      m.honeyBonus += 0.06 * n;
    },
  },
  {
    id: 'crews',
    name: 'Wide Lanes',
    perLevel: '+1 bee on every line',
    max: 3,
    baseCost: 600,
    growth: 2,
    starsFor: [5, 18, 35],
    icon: 'wideLanes',
    apply: (m, n) => {
      m.extraCrew += n;
    },
  },
  {
    id: 'stingers',
    name: 'Sharp Stingers',
    perLevel: 'swats hit harder',
    max: 3,
    baseCost: 500,
    growth: 2,
    starsFor: [10, 25, 45],
    icon: 'stingers',
    apply: (m, n) => {
      m.beeDamageBonus += n;
    },
  },
  {
    id: 'lines',
    name: 'Extra Line',
    perLevel: '+1 line at once',
    max: 2,
    baseCost: 1500,
    growth: 2.5,
    starsFor: [12, 40],
    icon: 'moreLines',
    apply: (m, n) => {
      m.extraLines += n;
    },
  },
];

export type UpgradeLevels = Partial<Record<UpgradeId, number>>;

export function upgradeById(id: UpgradeId): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}

/** Honey the next level of `def` costs, when `owned` levels are held. */
export function upgradeCost(def: UpgradeDef, owned: number): number {
  return Math.round((def.baseCost * Math.pow(def.growth, owned)) / 10) * 10;
}

export type BuyCheck =
  | { ok: true; cost: number }
  | { ok: false; reason: 'max' | 'stars' | 'honey'; cost: number; stars: number };

/** Whether the next level of `def` can be bought now, and if not, why not. */
export function canBuy(
  def: UpgradeDef,
  levels: UpgradeLevels,
  bank: number,
  stars: number,
): BuyCheck {
  const owned = levels[def.id] ?? 0;
  const cost = upgradeCost(def, owned);
  const needStars = def.starsFor[owned] ?? 0;
  if (owned >= def.max) return { ok: false, reason: 'max', cost, stars: needStars };
  if (stars < needStars) return { ok: false, reason: 'stars', cost, stars: needStars };
  if (bank < cost) return { ok: false, reason: 'honey', cost, stars: needStars };
  return { ok: true, cost };
}

/** Adds every owned skill to `m`. */
export function applyUpgrades(m: RunModifiers, levels: UpgradeLevels): RunModifiers {
  for (const def of UPGRADES) {
    const n = Math.min(def.max, levels[def.id] ?? 0);
    if (n > 0) def.apply(m, n);
  }
  return m;
}
