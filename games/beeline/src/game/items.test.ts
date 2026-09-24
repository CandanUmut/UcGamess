import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning.ts';
import { featuresForDay } from './DayCycle.ts';
import {
  ITEMS,
  ITEM_IDS,
  inventoryLines,
  modifiersFor,
  rollOffer,
  type ItemId,
} from './Items.ts';
import { coerceSave, newSave } from './SaveState.ts';

/** A deterministic stand-in for Math.random, cycling through fixed values. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe('the night offer', () => {
  it('never offers an item that would do nothing tomorrow', () => {
    // The rule that keeps a random shop honest. One dud purchase and the
    // player stops trusting the whole row — which matters far more here than
    // it did with a fixed shelf, because there is no shelf to learn.
    for (let day = 1; day <= 20; day += 1) {
      const features = featuresForDay(day);
      for (let trial = 0; trial < 40; trial += 1) {
        for (const id of rollOffer(day, features)) {
          expect(ITEMS[id].relevant(features), `${id} on day ${day}`).toBe(true);
        }
      }
    }
  });

  it('never offers the same item twice in one row', () => {
    // Duplicates read as the shop being broken even though the items stack.
    for (let trial = 0; trial < 200; trial += 1) {
      const offer = rollOffer(9, featuresForDay(9));
      expect(new Set(offer).size).toBe(offer.length);
    }
  });

  it('always fills the row once the pool is big enough', () => {
    for (let day = 1; day <= 20; day += 1) {
      for (let trial = 0; trial < 25; trial += 1) {
        expect(rollOffer(day, featuresForDay(day))).toHaveLength(TUNING.items.offerCount);
      }
    }
  });

  it('fills the row even when the rarity roll asks for something the day has none of', () => {
    // A rarity weight decides the *shape* of the row, never whether it exists.
    // Rolling epic on a day whose only epic is irrelevant used to be the shape
    // of an infinite loop; it must fall through to the rest of the pool.
    const alwaysEpic = sequence([0]);
    const offer = rollOffer(1, featuresForDay(1), alwaysEpic);
    expect(offer).toHaveLength(TUNING.items.offerCount);
  });

  it('reaches every item in the pool eventually', () => {
    // A pool entry that can never be drawn is dead weight in the bundle and a
    // promise to the player that is never kept.
    const seen = new Set<ItemId>();
    for (let trial = 0; trial < 4000; trial += 1) {
      for (const id of rollOffer(30, featuresForDay(30))) seen.add(id);
    }
    expect([...ITEM_IDS].filter((id) => !seen.has(id))).toEqual([]);
  });
});

describe('stars tilt the draft', () => {
  it('offers more rare and epic cards after a three-star day', () => {
    const rareShare = (stars: number): number => {
      let rare = 0;
      let total = 0;
      for (let trial = 0; trial < 3000; trial += 1) {
        for (const id of rollOffer(5, featuresForDay(5), Math.random, stars)) {
          total += 1;
          if (ITEMS[id].rarity !== 'common') rare += 1;
        }
      }
      return rare / total;
    };
    expect(rareShare(3)).toBeGreaterThan(rareShare(1));
  });
});

describe('items stack for the run', () => {
  it('adds the effect again for a second copy', () => {
    const one = modifiersFor(['earlyRise']);
    const two = modifiersFor(['earlyRise', 'earlyRise']);
    expect(two.extraDaySeconds).toBe(one.extraDaySeconds * 2);
  });

  it('does not sell the same knowledge twice', () => {
    // A second "you can see the whole field" is worth nothing, and charging
    // for it would be a lie the player finds out about at dawn.
    const one = modifiersFor(['scoutBees']);
    const two = modifiersFor(['scoutBees', 'scoutBees']);
    expect(two.scoutRadius).toBe(one.scoutRadius);
  });

  it('lists stacks rather than repeating a name', () => {
    expect(inventoryLines(['guardBees', 'guardBees', 'smokePot'])).toEqual([
      'Guard Bees x2',
      'Smoke Pot',
    ]);
  });

  it('ignores anything that is not an item', () => {
    // Saves outlive the code that wrote them; a renamed id must not throw at
    // dawn on a player who last opened the game two versions ago.
    const modifiers = modifiersFor(['notAnItem' as ItemId, 'combFrames']);
    expect(modifiers.honeyBonus).toBeCloseTo(0.07, 5);
  });
});

describe('the save carries a run inventory', () => {
  it('starts empty', () => {
    const save = newSave();
    expect(save.items).toEqual([]);
    expect(save.offer).toEqual([]);
  });

  it('drops unknown ids rather than crashing on them', () => {
    const save = coerceSave({
      version: 2,
      items: ['guardBees', 'ghostItem', 7],
      offer: 'nope',
    });
    expect(save.items).toEqual(['guardBees']);
    expect(save.offer).toEqual([]);
  });

  it('caps a corrupt inventory instead of trusting its length', () => {
    const save = coerceSave({ version: 2, items: new Array(5000).fill('combFrames') });
    expect(save.items.length).toBeLessThanOrEqual(200);
  });
});
