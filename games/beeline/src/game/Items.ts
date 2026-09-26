import { TUNING } from '../config/tuning.ts';
import type { DayFeatures } from './DayCycle.ts';
import type { Glyph } from '../render/itemIcons.ts';

/**
 * Boons: what the hive becomes over a run.
 *
 * Between days the player is offered three and picks one. That is the whole
 * between-day screen. It replaced a coin economy with two shops side by side —
 * six permanent upgrades and a random shelf of items, a reroll button and a
 * rewarded-ad row — which read as a spreadsheet and took longer to get through
 * than the day it followed.
 *
 * What survived is what made the shelf interesting: picks **stack and last the
 * run**, the offer is random and weighted by rarity, and an offer never
 * includes something that would do nothing tomorrow. What went is the maths:
 * there is no price, so there is nothing to save up for and no wrong time to
 * take the card you want.
 */
export type ItemId =
  | 'moreLines'
  | 'broodChamber'
  | 'wildflowers'
  | 'wideLanes'
  | 'scoutBees'
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
  /** Extra lines the hive can hold at once. */
  extraLines: number;
  /** Extra flowers on the board each day. */
  extraPatches: number;
  /** Extra bees each line can carry. */
  extraCrew: number;
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
}

export function noModifiers(): RunModifiers {
  return {
    extraLines: 0,
    extraPatches: 0,
    extraCrew: 0,
    patchPool: 1,
    scoutRadius: 0,
    mazeOpennessBonus: 0,
    waspIntercept: 1,
    waspSafeRadius: 1,
    extraDaySeconds: 0,
    beeDamageBonus: 0,
    stealResist: 1,
    hiveGuards: 0,
    extraWarningSeconds: 0,
    extraBees: 0,
    honeyBonus: 0,
    beeSpeedBonus: 0,
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
  // ---- the three that change the shape of a day, rarer than the rest
  moreLines: {
    id: 'moreLines',
    glyph: 'comb',
    iconTint: 0xf0c14b,
    name: 'More Lines',
    rarity: 'rare',
    effect: '+1 line at once',
    // The flagship. A line is how much of the board you can hold at once, and
    // the board always has more flowers than you have lines.
    relevant: () => true,
    apply: (m) => {
      m.extraLines += 1;
    },
  },
  broodChamber: {
    id: 'broodChamber',
    glyph: 'crown',
    iconTint: 0xffe08a,
    name: 'Brood Chamber',
    rarity: 'common',
    effect: '+4 bees',
    relevant: () => true,
    apply: (m) => {
      m.extraBees += 4;
    },
  },
  wildflowers: {
    id: 'wildflowers',
    glyph: 'leaf',
    iconTint: 0xe2669a,
    name: 'Wildflowers',
    rarity: 'rare',
    effect: '+1 flower a day',
    relevant: () => true,
    apply: (m) => {
      m.extraPatches += 1;
    },
  },

  wideLanes: {
    id: 'wideLanes',
    glyph: 'wing',
    iconTint: 0xffd166,
    name: 'Wide Lanes',
    rarity: 'rare',
    effect: '+2 bees per line',
    relevant: () => true,
    apply: (m) => {
      m.extraCrew += 2;
    },
  },

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
  stars = 0,
): ItemId[] {
  const pool = ITEM_IDS.filter((id) => ITEMS[id].relevant(features));
  const chosen: ItemId[] = [];
  const count = Math.min(TUNING.items.offerCount, pool.length);

  while (chosen.length < count) {
    const rarity = rollRarity(day, random, stars);
    // Falls back to the whole remaining pool rather than rerolling the rarity,
    // so an early day with no epics in it still fills every slot instead of
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

function rollRarity(day: number, random: () => number, stars: number): Rarity {
  const { epicChanceBase, epicChancePerDay, epicChanceMax, rareChance, perStar } =
    TUNING.items;
  const bonus = Math.max(0, stars - 1) * perStar;
  const epic =
    Math.min(epicChanceMax, epicChanceBase + epicChancePerDay * (day - 1)) + bonus;
  const roll = random();
  if (roll < epic) return 'epic';
  if (roll < epic + rareChance + bonus) return 'rare';
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
