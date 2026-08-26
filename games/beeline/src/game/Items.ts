import { TUNING } from '../config/tuning.ts';
import type { DayFeatures } from './DayCycle.ts';
import type { Glyph } from '../render/itemIcons.ts';

/**
 * The run's item shop.
 *
 * Replaces the one-slot provision shelf, which the playtest summed up as
 * "spending money don't feel like it adds much value". It was right, and the
 * reason was structural rather than a matter of prices: a provision was spent
 * on a single day and then gone, so no purchase ever changed how the hive
 * played. The night screen asked the same small question fifteen times.
 *
 * Items answer it the way a roguelite does:
 *
 *  - **Four random offers a night**, drawn from a pool of fifteen. What is on
 *    the table is itself part of the run, so two runs diverge.
 *  - **They stack and they last the run.** Buying is building something. By day
 *    ten a hive with three Guard Bees and a Propolis Seal is a fortress and one
 *    with Swift Wings and Royal Jelly is a courier service, and neither was
 *    planned at the start.
 *  - **Reroll, at an escalating price.** The out when the table has nothing for
 *    you, priced so that it is a real choice rather than a free spin.
 *
 * The permanent upgrades stay exactly as they were, a smaller meta track that
 * survives a failed run. That split is the point: upgrades are what you keep,
 * items are what this run turned out to be.
 */
export type ItemId =
  | 'scoutBees'
  | 'waxedTrails'
  | 'earlyRise'
  | 'richLoam'
  | 'swiftWings'
  | 'combFrames'
  | 'pruningShears'
  | 'smokePot'
  | 'guardBees'
  | 'propolisSeal'
  | 'stingers'
  | 'lookouts'
  | 'queensGift'
  | 'windbreak'
  | 'royalJelly';

export type Rarity = 'common' | 'rare' | 'epic';

/**
 * Everything the run's items change about a day.
 *
 * A plain data bag rather than a set of callbacks, so the whole effect of an
 * inventory is one object the simulation reads at dawn. Adding an item is a
 * table entry, not a new branch somewhere inside `beginDay`.
 */
export interface RunModifiers {
  /** Multiplier on every flower's starting pollen. */
  patchPool: number;
  /** Radius the map is lit to around the hive at dawn. 0 for none. */
  scoutRadius: number;
  /** Extra openness carved into the maze at dawn, 0..1. */
  mazeOpennessBonus: number;
  /** Multiplier on a wasp's intercept radius. */
  waspIntercept: number;
  /** Multiplier on the safe radius around the hive. */
  waspSafeRadius: number;
  /** Extra seconds of route hold, on top of the upgrade. */
  extraHoldSeconds: number;
  /** Extra seconds on the day's clock. */
  extraDaySeconds: number;
  /** Extra damage every bee strike does to a wasp. */
  beeDamageBonus: number;
  /** Multiplier on how fast a raider drains the hive. */
  stealResist: number;
  /** Bees stationed at the hive that fight raiders on their own. */
  hiveGuards: number;
  /** Extra seconds of warning before a raid lands. */
  extraWarningSeconds: number;
  /** Extra bees in the swarm. */
  extraBees: number;
  /** Fractional bonus on honey deposited. */
  honeyBonus: number;
  /** Fractional bonus on bee speed. */
  beeSpeedBonus: number;
  /** Multiplier on how hard the wind bends a route. */
  windResist: number;
}

export function noModifiers(): RunModifiers {
  return {
    patchPool: 1,
    scoutRadius: 0,
    mazeOpennessBonus: 0,
    waspIntercept: 1,
    waspSafeRadius: 1,
    extraHoldSeconds: 0,
    extraDaySeconds: 0,
    beeDamageBonus: 0,
    stealResist: 1,
    hiveGuards: 0,
    extraWarningSeconds: 0,
    extraBees: 0,
    honeyBonus: 0,
    beeSpeedBonus: 0,
    windResist: 1,
  };
}

export interface ItemInfo {
  id: ItemId;
  name: string;
  rarity: Rarity;
  /** The silhouette drawn on the card. See render/itemIcons.ts. */
  glyph: Glyph;
  /** Colour the glyph is drawn in. */
  iconTint: number;
  /** The effect in a handful of characters, for the card. */
  effect: string;
  /**
   * Whether it would do anything at all on a day like this.
   *
   * The rule that keeps the shop honest. Offering smoke before wasps exist is
   * offering nothing, and a player who buys one dud stops trusting the whole
   * row — which matters far more here than it did with provisions, because
   * these are random and there is no fixed shelf to learn.
   */
  relevant(features: DayFeatures): boolean;
  apply(into: RunModifiers): void;
}

export const ITEMS: Record<ItemId, ItemInfo> = {
  // ---- common: the everyday levers, useful on any board
  scoutBees: {
    id: 'scoutBees',
    glyph: 'eye',
    iconTint: 0x9bd3f0,
    name: 'Scout Bees',
    rarity: 'common',
    effect: 'field mapped at dawn',
    relevant: () => true,
    // Deliberately does not stack: a second copy of "you can see everything"
    // is worth nothing, and selling a player a second one would be a lie.
    apply: (m) => {
      m.scoutRadius = Math.max(m.scoutRadius, TUNING.fog.scoutRadius);
    },
  },
  waxedTrails: {
    id: 'waxedTrails',
    glyph: 'comb',
    iconTint: 0xf0c14b,
    name: 'Waxed Trails',
    rarity: 'common',
    effect: '+5s route hold',
    relevant: () => true,
    apply: (m) => {
      m.extraHoldSeconds += 5;
    },
  },
  earlyRise: {
    id: 'earlyRise',
    glyph: 'sun',
    iconTint: 0xffd76a,
    name: 'Early Rise',
    rarity: 'common',
    effect: '+8s daylight',
    relevant: () => true,
    apply: (m) => {
      m.extraDaySeconds += 8;
    },
  },
  richLoam: {
    id: 'richLoam',
    glyph: 'leaf',
    iconTint: 0x8fd06a,
    name: 'Rich Loam',
    rarity: 'common',
    effect: '+15% pollen',
    relevant: () => true,
    apply: (m) => {
      m.patchPool *= 1.15;
    },
  },
  swiftWings: {
    id: 'swiftWings',
    glyph: 'wing',
    iconTint: 0xcfe6f7,
    name: 'Swift Wings',
    rarity: 'common',
    effect: '+8% bee speed',
    relevant: () => true,
    apply: (m) => {
      m.beeSpeedBonus += 0.08;
    },
  },
  combFrames: {
    id: 'combFrames',
    glyph: 'drop',
    iconTint: 0xf0b429,
    name: 'Comb Frames',
    rarity: 'common',
    effect: '+7% honey',
    relevant: () => true,
    apply: (m) => {
      m.honeyBonus += 0.07;
    },
  },

  // ---- rare: the answers to a specific board
  pruningShears: {
    id: 'pruningShears',
    glyph: 'shears',
    iconTint: 0xb7c4cf,
    name: 'Pruning Shears',
    rarity: 'rare',
    effect: 'brambles cut back',
    relevant: (features) => features.mazeOpenness < 1,
    apply: (m) => {
      m.mazeOpennessBonus += 0.15;
    },
  },
  smokePot: {
    id: 'smokePot',
    glyph: 'smoke',
    iconTint: 0xc9c1b4,
    name: 'Smoke Pot',
    rarity: 'rare',
    effect: 'wasps keep away',
    relevant: (features) => features.raidSize > 0,
    apply: (m) => {
      m.waspIntercept *= 0.7;
      m.waspSafeRadius *= 1.35;
    },
  },
  guardBees: {
    id: 'guardBees',
    glyph: 'shield',
    iconTint: 0xffc857,
    name: 'Guard Bees',
    rarity: 'rare',
    effect: 'a guard at the door',
    // The hive defence the design was missing. Everything else about raids
    // asks the player to react; this is the thing you *build* so that a raid
    // arriving while you are mid-drag is survivable rather than a disaster.
    relevant: (features) => features.raidSize > 0,
    apply: (m) => {
      m.hiveGuards += 1;
    },
  },
  propolisSeal: {
    id: 'propolisSeal',
    glyph: 'seal',
    iconTint: 0xd08a4a,
    name: 'Propolis Seal',
    rarity: 'rare',
    effect: '-35% honey stolen',
    relevant: (features) => features.raidSize > 0,
    apply: (m) => {
      m.stealResist *= 0.65;
    },
  },
  stingers: {
    id: 'stingers',
    glyph: 'sting',
    iconTint: 0xe8e2d6,
    name: 'Sharpened Stingers',
    rarity: 'rare',
    effect: '+1 damage per bee',
    relevant: (features) => features.raidSize > 0,
    apply: (m) => {
      m.beeDamageBonus += 1;
    },
  },
  lookouts: {
    id: 'lookouts',
    glyph: 'flask',
    iconTint: 0x8fd0c4,
    name: 'Lookouts',
    rarity: 'rare',
    effect: '+2s raid warning',
    relevant: (features) => features.raidSize > 0,
    apply: (m) => {
      m.extraWarningSeconds += 2;
    },
  },

  // ---- epic: the ones that change what the hive is
  queensGift: {
    id: 'queensGift',
    glyph: 'crown',
    iconTint: 0xffd166,
    name: "Queen's Gift",
    rarity: 'epic',
    effect: '+5 bees',
    relevant: () => true,
    apply: (m) => {
      m.extraBees += 5;
    },
  },
  windbreak: {
    id: 'windbreak',
    glyph: 'wind',
    iconTint: 0xa9d6e5,
    name: 'Windbreak',
    rarity: 'epic',
    effect: 'routes resist wind',
    relevant: (features) => features.wind,
    apply: (m) => {
      m.windResist *= 0.45;
    },
  },
  royalJelly: {
    id: 'royalJelly',
    glyph: 'drop',
    iconTint: 0xfff0a8,
    name: 'Royal Jelly',
    rarity: 'epic',
    effect: '+18% honey, +12% speed',
    relevant: () => true,
    apply: (m) => {
      m.honeyBonus += 0.18;
      m.beeSpeedBonus += 0.12;
    },
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export function isItemId(value: unknown): value is ItemId {
  return typeof value === 'string' && value in ITEMS;
}

/**
 * What an item costs on a given day.
 *
 * Priced by rarity and grown with the day, so the shop stays a decision. A flat
 * price is a real choice on day three and a rounding error on day fifteen, at
 * which point the row stops asking anything.
 */
export function itemCost(id: ItemId, day: number): number {
  const base = TUNING.items.cost[ITEMS[id].rarity];
  const growth = Math.min(
    Math.pow(TUNING.items.costGrowth, Math.max(0, day - 1)),
    TUNING.items.costCapMultiplier,
  );
  return Math.round(base * growth);
}

/** What the next reroll costs, having already rerolled `rerolls` times tonight. */
export function rerollCost(day: number, rerolls: number): number {
  const { rerollBase, rerollGrowth, costGrowth, costCapMultiplier } = TUNING.items;
  const dayGrowth = Math.min(
    Math.pow(costGrowth, Math.max(0, day - 1)),
    costCapMultiplier,
  );
  return Math.round(
    rerollBase * dayGrowth * Math.pow(rerollGrowth, Math.max(0, rerolls)),
  );
}

/**
 * Draws the night's offers.
 *
 * Weighted by rarity, with the epic chance climbing across the run so that a
 * long run keeps producing things the player has not seen. Never offers the
 * same item twice in one row — a duplicate reads as the shop being broken even
 * when the items stack.
 */
export function rollOffer(
  day: number,
  features: DayFeatures,
  random: () => number = Math.random,
): ItemId[] {
  const pool = ITEM_IDS.filter((id) => ITEMS[id].relevant(features));
  const chosen: ItemId[] = [];
  const count = Math.min(TUNING.items.offerCount, pool.length);

  while (chosen.length < count) {
    const rarity = rollRarity(day, random);
    // Falls back to the whole remaining pool rather than rerolling the rarity,
    // so an early day with no epics in it still fills all four slots instead of
    // looping. The weights decide the *shape* of the row, never whether it
    // exists.
    const byRarity = pool.filter(
      (id) => ITEMS[id].rarity === rarity && !chosen.includes(id),
    );
    const candidates =
      byRarity.length > 0 ? byRarity : pool.filter((id) => !chosen.includes(id));
    const pick = candidates[Math.floor(random() * candidates.length)];
    if (pick) chosen.push(pick);
  }

  return chosen;
}

function rollRarity(day: number, random: () => number): Rarity {
  const { epicChanceBase, epicChancePerDay, epicChanceMax, rareChance } = TUNING.items;
  const epic = Math.min(epicChanceMax, epicChanceBase + epicChancePerDay * (day - 1));
  const roll = random();
  if (roll < epic) return 'epic';
  if (roll < epic + rareChance) return 'rare';
  return 'common';
}

/** The modifiers a day starts with, given everything the run has bought. */
export function modifiersFor(items: readonly ItemId[]): RunModifiers {
  const modifiers = noModifiers();
  for (const id of items) {
    if (isItemId(id)) ITEMS[id].apply(modifiers);
  }
  return modifiers;
}

/** The run's inventory as `name xN` lines, for the night screen. */
export function inventoryLines(items: readonly ItemId[]): string[] {
  const counts = new Map<ItemId, number>();
  for (const id of items) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, n]) =>
    n > 1 ? `${ITEMS[id].name} x${n}` : ITEMS[id].name,
  );
}
