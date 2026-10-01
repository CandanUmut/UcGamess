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
  HONEY_RULES,
  JAR_SHARE,
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

  it('gives each level the hive it asks for', () => {
    for (const level of LEVELS) {
      const stats = deriveStats(levelModifiers(level));
      expect(stats.routeSlots).toBe(level.lines);
    }
  });

  /** A board as the sim builds it, with its maze. */
  const built = (level: (typeof LEVELS)[number]): Field => {
    const field = new Field();
    const modifiers = levelModifiers(level);
    field.setStats(deriveStats(modifiers));
    withSeed(level.seed, () =>
      field.beginDay(level.difficulty, levelFeatures(level), level.flowers, 1, modifiers),
    );
    return field;
  };

  it('lets both colonies reach every flower round the hedges', () => {
    for (const level of LEVELS) {
      const field = built(level);
      const { maze } = field;
      const homes = [{ x: field.hiveX, y: field.hiveY }];
      if (level.rival) homes.push({ x: level.rival.x, y: level.rival.y });
      for (const home of homes) {
        const dist = maze.distancesFrom(maze.colAt(home.x), maze.rowAt(home.y));
        for (const f of level.layout ?? []) {
          const d = dist[maze.rowAt(f.y) * maze.cols + maze.colAt(f.x)] ?? -1;
          expect(d, `${level.name}: flower at ${f.x},${f.y}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('keeps flowers clear of hedges, so a line can reach them', () => {
    for (const level of LEVELS) {
      for (const [c, r, side] of level.walls ?? []) {
        const x = 30 + 152 * c;
        const y = 110 + 116 * r;
        for (const f of level.layout ?? []) {
          const near =
            side === 'L'
              ? Math.abs(f.x - x) < 30 && f.y > y - 10 && f.y < y + 126
              : Math.abs(f.y - y) < 30 && f.x > x - 10 && f.x < x + 162;
          expect(near, `${level.name}: flower at ${f.x},${f.y} on a hedge`).toBe(false);
        }
      }
    }
  });

  it('never lets one flower decide a race', () => {
    for (const level of LEVELS) {
      if (!level.rival || level.lesson === 'double') continue;
      for (const f of level.layout ?? []) {
        expect(f.honey, `${level.name}: ${f.x},${f.y}`).toBeLessThanOrEqual(
          level.goal * HONEY_RULES.maxFlowerShare,
        );
      }
    }
  });

  it('sets a race jar at a little over half the board', () => {
    for (const level of LEVELS) {
      if (!level.rival) continue;
      const total = (level.layout ?? []).reduce((sum, f) => sum + f.honey, 0);
      expect(level.goal, level.name).toBeGreaterThan(total / 2);
      expect(level.goal, level.name).toBeLessThanOrEqual(
        Math.ceil(total * JAR_SHARE) + 5,
      );
    }
  });
});
