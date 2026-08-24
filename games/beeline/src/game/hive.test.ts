import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning.ts';
import {
  deriveStats,
  emptyLevels,
  maxLevel,
  upgradeCost,
  upkeepFor,
  upkeepRelief,
  UPGRADE_ORDER,
} from './Upgrades.ts';
import { evaluateDay, upkeepDueOn } from './DayCycle.ts';
import { coerceSave, newSave } from './SaveState.ts';

describe('hive upkeep', () => {
  it('charges nothing for the swarm the player started with', () => {
    // The hive you were given is free; the hive you build is not. Without this
    // the bill would land on a player who has bought nothing, which reads as a
    // tax rather than as the cost of a decision.
    expect(upkeepFor(TUNING.bee.baseCount, 0)).toBe(0);
    expect(upkeepFor(TUNING.bee.baseCount - 10, 0)).toBe(0);
  });

  it('scales with the swarm the player chose to build', () => {
    const small = upkeepFor(TUNING.bee.baseCount + 6, 0);
    const large = upkeepFor(TUNING.bee.baseCount + 48, 0);
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(small * 5);
  });

  it('is reduced by Deeper Comb, and never to nothing', () => {
    const bees = TUNING.bee.baseCount + 48;
    const raw = upkeepFor(bees, 0);
    const relieved = upkeepFor(bees, maxLevel('comb'));

    expect(relieved).toBeLessThan(raw);
    expect(relieved).toBeGreaterThan(0);
    expect(upkeepRelief(maxLevel('comb'))).toBeLessThanOrEqual(0.85);
  });

  it('holds off until the game has stopped teaching', () => {
    expect(upkeepDueOn(1)).toBe(false);
    expect(upkeepDueOn(2)).toBe(false);
    expect(upkeepDueOn(TUNING.hive.upkeepFromDay)).toBe(true);
  });
});

describe('the day settles the bill', () => {
  it('banks what is left after the hive is fed', () => {
    const result = evaluateDay(6, 1000, 0, 250);
    expect(result.upkeep).toBe(250);
    expect(result.banked).toBe(750);
  });

  it('never charges more than the day actually earned', () => {
    // A bad day must not put the player in debt. Over-expansion should cost
    // progress, not create a hole they have to climb out of.
    const result = evaluateDay(6, 120, 0, 500);
    expect(result.upkeep).toBe(120);
    expect(result.banked).toBe(0);
  });

  it('charges nothing on the teaching days', () => {
    const result = evaluateDay(1, 400, 0, 500);
    expect(result.upkeep).toBe(0);
    expect(result.banked).toBe(400);
  });

  it('leaves the quota alone', () => {
    // Quota asks "did you work hard enough today"; upkeep asks "can you afford
    // the hive you built". If upkeep counted against the quota, growing the
    // swarm would make the day itself harder to pass, which is the opposite of
    // what buying bees is for.
    const lean = evaluateDay(6, 700, 0, 0);
    const fat = evaluateDay(6, 700, 0, 400);
    expect(lean.outcome).toBe(fat.outcome);
    expect(lean.quota).toBe(fat.quota);
    expect(fat.banked).toBeLessThan(lean.banked);
  });

  it('makes a bigger swarm earn more but bank less per bee', () => {
    // The decision the whole system exists to create.
    const lean = { ...emptyLevels(), swarmSize: 0 };
    const fat = { ...emptyLevels(), swarmSize: 8 };
    expect(deriveStats(fat).beeCount).toBeGreaterThan(deriveStats(lean).beeCount);
    expect(deriveStats(fat).upkeep).toBeGreaterThan(deriveStats(lean).upkeep);
    expect(deriveStats(lean).upkeep).toBe(0);
  });
});

describe('Deeper Comb raises the ceiling', () => {
  it('lifts every other cap and never its own', () => {
    for (const id of UPGRADE_ORDER) {
      if (id === 'comb') {
        expect(maxLevel('comb', 3)).toBe(maxLevel('comb', 0));
        continue;
      }
      expect(maxLevel(id, 3)).toBeGreaterThan(maxLevel(id, 0));
    }
  });

  it('reopens an upgrade that was maxed before the comb deepened', () => {
    // The spine of the night screen: at some point the only way forward is to
    // stop buying output and invest in the hive that can hold it.
    const capped = maxLevel('beeSpeed', 0);
    expect(upgradeCost('beeSpeed', capped, 0)).toBeNull();
    expect(upgradeCost('beeSpeed', capped, 1)).not.toBeNull();
  });

  it('keeps a comb-raised level through a save round trip', () => {
    // Comb has to be read before the others are clamped, or a legitimately
    // bought level is silently demoted every time the game loads.
    const save = newSave();
    save.levels.comb = 3;
    save.levels.beeSpeed = maxLevel('beeSpeed', 3);

    const restored = coerceSave(JSON.parse(JSON.stringify(save)));
    expect(restored.levels.comb).toBe(3);
    expect(restored.levels.beeSpeed).toBe(maxLevel('beeSpeed', 3));
  });

  it('still clamps a level that no comb could justify', () => {
    const restored = coerceSave({
      ...newSave(),
      levels: { ...emptyLevels(), comb: 1, beeSpeed: 999 },
    });
    expect(restored.levels.beeSpeed).toBe(maxLevel('beeSpeed', 1));
  });
});
