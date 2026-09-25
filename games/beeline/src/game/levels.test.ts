import { describe, expect, it } from 'vitest';
import {
  LEVELS,
  LEVELS_PER_WORLD,
  WORLDS,
  isUnlocked,
  levelStarsFor,
  levelModifiers,
  totalStars,
  withSeed,
  levelFeatures,
} from './Levels.ts';
import { Field } from '../sim/Field.ts';
import { deriveStats } from './Upgrades.ts';

describe('the campaign', () => {
  it('has three worlds of ten levels', () => {
    expect(LEVELS).toHaveLength(WORLDS.length * LEVELS_PER_WORLD);
  });

  it('asks more for each star', () => {
    for (const level of LEVELS) {
      const [one, two, three] = level.stars;
      expect(two, level.name).toBeGreaterThan(one);
      expect(three, level.name).toBeGreaterThan(two);
    }
  });

  it('awards stars at the thresholds', () => {
    const level = LEVELS[0]!;
    const [one, two, three] = level.stars;
    expect(levelStarsFor(level, one - 1)).toBe(0);
    expect(levelStarsFor(level, one)).toBe(1);
    expect(levelStarsFor(level, two)).toBe(2);
    expect(levelStarsFor(level, three)).toBe(3);
  });

  it('opens level by level, and world by world on stars', () => {
    const none: number[] = [];
    expect(isUnlocked(LEVELS[0]!, none)).toBe(true);
    expect(isUnlocked(LEVELS[1]!, none)).toBe(false);
    expect(isUnlocked(LEVELS[1]!, [1])).toBe(true);

    // World two's first level: open only with enough stars.
    const gate = WORLDS[1]!.starsToOpen;
    const justShort = [3, 3, 3, 3, 2, 0, 0, 0, 0, 0];
    expect(totalStars(justShort)).toBe(gate - 1);
    expect(isUnlocked(LEVELS[10]!, justShort)).toBe(false);
    const enough = [3, 3, 3, 3, 3, 0, 0, 0, 0, 0];
    expect(isUnlocked(LEVELS[10]!, enough)).toBe(true);
  });

  it('builds the same board every time a level is played', () => {
    const layout = (): string => {
      const field = new Field();
      const level = LEVELS[14]!;
      const modifiers = levelModifiers(level);
      field.setStats(deriveStats(modifiers));
      withSeed(level.seed, () =>
        field.beginDay(
          level.difficulty,
          levelFeatures(level),
          level.flowers,
          1,
          modifiers,
        ),
      );
      return JSON.stringify(field.patches.map((p) => [Math.round(p.x), Math.round(p.y)]));
    };
    expect(layout()).toBe(layout());
  });

  it('gives each level the swarm it asks for, and the whole board in view', () => {
    for (const level of LEVELS) {
      const field = new Field();
      const modifiers = levelModifiers(level);
      field.setStats(deriveStats(modifiers));
      withSeed(level.seed, () =>
        field.beginDay(
          level.difficulty,
          levelFeatures(level),
          level.flowers,
          1,
          modifiers,
        ),
      );
      expect(field.bees.length).toBe(level.bees);
      expect(field.patches.length).toBe(level.flowers);
      expect(field.patches.every((p) => p.discovered)).toBe(true);
    }
  });

  it('prices every board so a good network reaches the rich flowers and cannot reach everything', () => {
    for (const level of LEVELS.slice(1)) {
      const field = new Field();
      const modifiers = levelModifiers(level);
      field.setStats(deriveStats(modifiers));
      withSeed(level.seed, () =>
        field.beginDay(
          level.difficulty,
          levelFeatures(level),
          level.flowers,
          1,
          modifiers,
        ),
      );
      // Enough for the cheapest tree to the valuable flowers...
      expect(field.waxBudget).toBeGreaterThanOrEqual(field.networkCost(2) * 0.99);
      // ...but well short of separate lines from the hive to all of them.
      const star = field.patches
        .filter((p) => p.tier >= 2)
        .reduce((sum, p) => sum + field.pathDistanceTo(p.x, p.y), 0);
      expect(field.waxBudget).toBeLessThan(star);
    }
  });
});
