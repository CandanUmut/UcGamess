import { describe, expect, it } from 'vitest';
import { Field } from '../sim/Field.ts';
import { deriveStats } from './Upgrades.ts';
import { LEVELS, levelFeatures, levelModifiers, withSeed } from './Levels.ts';
import { Rivalry } from './Rival.ts';
import type { Patch } from '../sim/Patch.ts';
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

describe('raids', () => {
  /** Lays one line from the player's hive to the wasps' nest. */
  const raid = (field: Field, rival: Rivalry): Patch => {
    const nest = field.patches.find(
      (p) => p.kind === 'nest' && p.x === rival.spec.x && p.y === rival.spec.y,
    );
    if (!nest) throw new Error('no nest');
    const plan = field.planLine(
      { x: field.hiveX, y: field.hiveY, route: null },
      nest.x,
      nest.y,
    );
    expect(plan.target).toBe(nest);
    field.commitLine(plan);
    return nest;
  };

  it('pay only on a fuller jar than yours', () => {
    const run = (mine: number, theirs: number): { gained: number; refused: number } => {
      const { field, rival } = board(7);
      const nest = raid(field, rival);
      field.honey = mine;
      nest.pool = nest.maxPool = theirs;
      let refused = 0;
      for (let t = 0; t < 15; t += 1 / 60) {
        field.step(1 / 60);
        refused += field.drainEvents().raidRefused;
      }
      return { gained: field.honey - mine, refused };
    };
    const ahead = run(50, 10);
    expect(ahead.gained).toBe(0);
    expect(ahead.refused).toBeGreaterThan(0);
    const behind = run(0, 100);
    expect(behind.gained).toBeGreaterThan(5);
  });
});

describe('buds', () => {
  it('open on time, in plain sight, and keep the meadow from running dry', () => {
    const level = LEVELS.find((l) => l.layout?.some((f) => f.opensAt));
    if (!level) throw new Error('no board with buds');
    const field = new Field();
    const m = levelModifiers(level);
    field.setStats(deriveStats(m));
    withSeed(level.seed, () =>
      field.beginDay(level.difficulty, levelFeatures(level), level.flowers, 1, m),
    );
    const buds = level.layout?.filter((f) => f.opensAt) ?? [];
    const first = Math.min(...buds.map((b) => b.opensAt ?? 0));
    expect(field.buds).toHaveLength(buds.length);
    for (const p of field.patches) p.alive = false;
    expect(field.cleared).toBe(false);
    for (let t = 0; t < first + 0.5; t += 1 / 60) field.step(1 / 60);
    const opened = field.patches.filter((p) => p.sprouted);
    expect(opened.length).toBeGreaterThan(0);
    for (const p of opened) {
      expect(p.discovered).toBe(true);
      expect(p.alive).toBe(true);
    }
  });
});
