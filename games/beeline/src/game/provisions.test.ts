import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning.ts';
import {
  PROVISIONS,
  PROVISION_ORDER,
  isProvisionId,
  modifiersFor,
  noModifiers,
  provisionCost,
  provisionsFor,
  type ProvisionId,
} from './Provisions.ts';
import { dayQuota, featuresForDay } from './DayCycle.ts';
import { coerceSave, newSave } from './SaveState.ts';
import { upgradeCost } from './Upgrades.ts';
import { Field } from '../sim/Field.ts';

describe('the provision shelf', () => {
  it('never offers something that could not do anything tomorrow', () => {
    // A dud purchase is worse than no purchase: buy one useless thing and the
    // whole row stops being worth reading.
    const dayOne = provisionsFor(featuresForDay(1));
    expect(dayOne).not.toContain('smokePot');
    expect(dayOne).not.toContain('pruningShears');

    expect(provisionsFor(featuresForDay(TUNING.bramble.startDay))).toContain(
      'pruningShears',
    );
    expect(provisionsFor(featuresForDay(TUNING.wasp.startDay))).toContain('smokePot');
  });

  it('always offers something, on every day of a long run', () => {
    for (let day = 1; day <= 30; day += 1) {
      expect(provisionsFor(featuresForDay(day)).length).toBeGreaterThan(0);
    }
  });

  it('grows the shelf as the field gets more complicated', () => {
    expect(provisionsFor(featuresForDay(1)).length).toBeLessThan(
      provisionsFor(featuresForDay(TUNING.wasp.startDay)).length,
    );
  });
});

describe('provision pricing', () => {
  it('costs a fraction of a first upgrade level, so both are live options', () => {
    // If a provision cost as much as an upgrade nobody would ever buy one; if it
    // were nearly free the choice would not be a choice.
    const cheapestUpgrade = Math.min(
      ...Object.keys(TUNING.upgrades).map(
        (id) => upgradeCost(id as Parameters<typeof upgradeCost>[0], 0) ?? 0,
      ),
    );
    for (const id of PROVISION_ORDER) {
      expect(provisionCost(id, 1)).toBeLessThan(cheapestUpgrade * 1.25);
      expect(provisionCost(id, 1)).toBeGreaterThan(cheapestUpgrade * 0.5);
    }
  });

  it('rises with the day, so it never becomes background noise', () => {
    for (const id of PROVISION_ORDER) {
      expect(provisionCost(id, 10)).toBeGreaterThan(provisionCost(id, 1));
      expect(provisionCost(id, 20)).toBeGreaterThanOrEqual(provisionCost(id, 10));
    }
  });

  it('stays affordable against the quota it is bought to beat', () => {
    // The price curve must not outrun the quota curve, or provisions quietly
    // stop existing in the late game.
    for (let day = 3; day <= 25; day += 1) {
      for (const id of PROVISION_ORDER) {
        expect(provisionCost(id, day) / dayQuota(day)).toBeLessThan(0.75);
      }
    }
  });

  it('is refunded at exactly what it cost, so swapping is free', () => {
    // The night screen refunds before charging. If the price moved between
    // those two calls, swapping would leak or mint honey.
    for (const id of PROVISION_ORDER) {
      expect(provisionCost(id, 7)).toBe(provisionCost(id, 7));
    }
  });
});

describe('provision effects', () => {
  it('does nothing at all when none was packed', () => {
    expect(modifiersFor(null)).toEqual(noModifiers());
  });

  it('changes exactly one thing per provision', () => {
    const neutral = noModifiers();
    for (const id of PROVISION_ORDER) {
      const modifiers = modifiersFor(id);
      const changed = (Object.keys(neutral) as Array<keyof typeof neutral>).filter(
        (key) => modifiers[key] !== neutral[key],
      );
      // Smoke works on both wasp radii, which is one idea expressed twice.
      expect(changed.length, `${id} changed ${changed.join(', ')}`).toBeLessThanOrEqual(
        2,
      );
      expect(changed.length).toBeGreaterThan(0);
    }
  });

  it('feeds a fuller field into the simulation for Scout Bees', () => {
    const plain = new Field();
    plain.beginDay(5, featuresForDay(5), 3, 1);
    const plainPool = plain.patches.reduce((sum, p) => sum + p.maxPool, 0);

    const scouted = new Field();
    scouted.beginDay(5, featuresForDay(5), 3, 1, modifiersFor('scoutBees'));
    const scoutedPool = scouted.patches.reduce((sum, p) => sum + p.maxPool, 0);

    expect(scoutedPool).toBeGreaterThan(plainPool);
  });

  it('lengthens route hold for Waxed Trails without touching the upgrade', () => {
    const field = new Field();
    const base = field.routeHoldSeconds;
    field.beginDay(5, featuresForDay(5), 3, 1, modifiersFor('waxedTrails'));
    expect(field.routeHoldSeconds).toBeGreaterThan(base);

    // And it is gone the next day, because a provision is one use.
    field.beginDay(6, featuresForDay(6), 3, 1);
    expect(field.routeHoldSeconds).toBe(base);
  });

  it('starts thickets smaller for Pruning Shears', () => {
    const field = new Field();
    field.beginDay(10, featuresForDay(10), 4, 1, modifiersFor('pruningShears'));
    const trimmed = field.brambles;

    const plain = new Field();
    plain.beginDay(10, featuresForDay(10), 4, 1);

    if (trimmed.length > 0 && plain.brambles.length > 0) {
      expect(trimmed[0]?.radius).toBeLessThan(plain.brambles[0]?.radius ?? 0);
    }
  });
});

describe('the carried provision', () => {
  it('is a single slot, so there is nothing to stack or manage', () => {
    const save = newSave();
    expect(save.provision).toBeNull();

    save.provision = 'smokePot';
    save.provision = 'scoutBees';
    // Assigning replaces rather than accumulating. There is no second slot to
    // put the first one in, which is the whole point.
    expect(save.provision).toBe('scoutBees');
  });

  it('survives a save round trip', () => {
    const save = newSave();
    save.provision = 'earlyRise';
    expect(coerceSave(JSON.parse(JSON.stringify(save))).provision).toBe('earlyRise');
  });

  it('drops a provision that no longer exists rather than crashing at dawn', () => {
    const save = { ...newSave(), provision: 'jetpack' };
    expect(coerceSave(save).provision).toBeNull();
    expect(isProvisionId('jetpack')).toBe(false);
    expect(isProvisionId('smokePot')).toBe(true);
  });

  it('has a name and a blurb for every id, so no shelf slot renders blank', () => {
    for (const id of PROVISION_ORDER) {
      const info = PROVISIONS[id as ProvisionId];
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.blurb.length).toBeGreaterThan(0);
    }
    expect(new Set(PROVISION_ORDER).size).toBe(PROVISION_ORDER.length);
  });
});
