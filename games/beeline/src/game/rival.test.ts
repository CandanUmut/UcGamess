import { describe, expect, it } from 'vitest';
import { Field } from '../sim/Field.ts';
import { deriveStats } from './Upgrades.ts';
import { LEVELS, levelFeatures, levelModifiers, withSeed } from './Levels.ts';
import { Rivalry } from './Rival.ts';
import { CASUAL, NOVICE } from '../playtest/personas.ts';
import { playLevel } from '../playtest/session.ts';

function board(levelId: number): { field: Field; rival: Rivalry } {
  const level = LEVELS[levelId - 1];
  if (!level?.rival) throw new Error('no rival on that level');
  const field = new Field();
  const m = levelModifiers(level);
  field.setStats(deriveStats(m));
  withSeed(level.seed, () =>
    field.beginDay(level.difficulty, levelFeatures(level), level.flowers, 1, m),
  );
  const rival = new Rivalry(level.rival);
  rival.begin(field, { fog: level.fog, beeSpeedBonus: m.beeSpeedBonus });
  return { field, rival };
}

describe('the rival colony', () => {
  it('drinks from the same flowers as the player', () => {
    const { field, rival } = board(3);
    const flowers = field.patches.filter((p) => p.kind !== 'nest');
    const before = flowers.reduce((s, p) => s + p.honeyLeft, 0);
    for (let t = 0; t < 20; t += 1 / 60) {
      field.step(1 / 60);
      rival.step(1 / 60);
    }
    const after = flowers.reduce((s, p) => s + p.honeyLeft, 0);
    expect(rival.field.honey).toBeGreaterThan(5);
    expect(before - after).toBeGreaterThan(rival.field.honey * 0.8);
    expect(field.honey).toBe(0);
  });

  it('never finds flowers for the player', () => {
    withSeed(42, () => {
      const { field, rival } = board(9);
      const knownAtDawn = new Set(field.patches.filter((p) => p.discovered));
      for (let t = 0; t < 30; t += 1 / 60) {
        field.step(1 / 60);
        rival.step(1 / 60);
      }
      const foundByRival = field.patches.filter(
        (p) => rival.field.knows(p) && !knownAtDawn.has(p),
      );
      expect(foundByRival.length).toBeGreaterThan(0);
      // The player's board only shows what the player's own bees have lit.
      for (const p of foundByRival) {
        if (p.discovered) expect(field.fog.isDiscovered(p.x, p.y)).toBe(true);
      }
    });
  });

  it('beats a player who does nothing, on every rival board of the first world', () => {
    for (const level of LEVELS.slice(0, 10).filter((l) => l.rival)) {
      expect(playLevel({ ...NOVICE, thinkRate: 0 }, level, 1).beaten, level.name).toBe(
        true,
      );
    }
  });

  it('is beaten by a steady player on most first-world boards', () => {
    const races = LEVELS.slice(0, 10)
      .filter((l) => l.rival)
      .flatMap((level) =>
        [1, 2, 3].map((s) => playLevel(CASUAL, level, 5000 + s * 7919)),
      );
    const wins = races.filter((r) => r.filledAt !== null).length;
    expect(wins / races.length).toBeGreaterThan(0.6);
  });
}, 120_000);
