/**
 * Chooses each campaign level's layout seed and wax by playing candidates.
 *
 *   node games/beeline/src/playtest/search-levels.ts [seeds] [levels]
 *
 * For every level, tries `seeds` layout seeds (default 24) at a few wax
 * factors, and plays each board with three players: the planner (EXPERT), a
 * regular (CASUAL) and expert hands with no plan at all (THOUGHTLESS). It keeps
 * the board that best satisfies, in order:
 *
 *  1. **it is a real board** — the planner scores, and the no-plan player gets
 *     something (a board where only one answer works reads as broken);
 *  2. **a regular gets most of the way** (casual ≥ 55% of the planner), so the
 *     level is learnable rather than a wall;
 *  3. **planning pays**: the largest planner / no-plan ratio, capped at 4 so a
 *     degenerate board does not win on a near-zero denominator.
 *
 * The first two levels are the exception: level one should be passable with
 * no plan at all, and level two is where branching is first taught, so it
 * simply wants the biggest gap.
 *
 * Prints `LEVEL_LAYOUTS` to paste into `game/Levels.ts`. Re-run
 * `fit-levels.ts` afterwards: the star thresholds depend on the boards.
 */
import { LEVELS, type LevelDef } from '../game/Levels.ts';
import { CASUAL, EXPERT, THOUGHTLESS, type Persona } from './personas.ts';
import { playLevel } from './session.ts';

const seedsPerLevel = Number(process.argv[2] ?? 24);
const only = (process.argv[3] ?? '').split(',').filter(Boolean).map(Number);
const FACTORS = [1.0, 1.15, 1.35];

const print = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

function median(persona: Persona, level: LevelDef, runs: number): number {
  const out: number[] = [];
  for (let i = 0; i < runs; i += 1)
    out.push(playLevel(persona, level, 1234 + i * 977).honey);
  out.sort((a, b) => a - b);
  return out[Math.floor(out.length / 2)] ?? 0;
}

interface Candidate {
  seed: number;
  wax: number;
  expert: number;
  casual: number;
  thoughtless: number;
  score: number;
}

const rows: string[] = [];
const report: string[] = [];

for (const base of LEVELS) {
  if (only.length > 0 && !only.includes(base.id)) {
    rows.push(`  [${base.seed}, ${base.wax}],`);
    continue;
  }
  // Level one teaches the drag, not the budget: wax for a line to everything.
  const factors = base.id === 1 ? [3] : FACTORS;
  let best: Candidate | null = null;

  for (let k = 0; k < seedsPerLevel; k += 1) {
    const seed = 104_729 + base.id * 7919 + k * 15_485_863;
    for (const wax of factors) {
      const level: LevelDef = { ...base, seed, wax };
      const expert = median(EXPERT, level, 1);
      const thoughtless = median(THOUGHTLESS, level, 1);
      if (expert <= 0) continue;
      const casual = median(CASUAL, level, 1);

      const gap = Math.min(4, expert / Math.max(1, thoughtless));
      let score: number;
      if (base.id === 1) {
        // Anyone passes: no-plan close to the planner, and a decent score.
        score = -Math.abs(1 - thoughtless / expert) + expert / 10_000;
      } else {
        const real = thoughtless >= 0.12 * expert ? 1 : 0;
        const learnable = casual >= 0.55 * expert ? 1 : 0;
        score = real * 100 + learnable * 10 + gap + expert / 100_000;
      }
      if (!best || score > best.score)
        best = { seed, wax, expert, casual, thoughtless, score };
    }
  }

  if (!best) {
    rows.push(`  [${base.seed}, ${base.wax}],`);
    report.push(`${base.id} ${base.name}: no playable candidate`);
    continue;
  }
  rows.push(`  [${best.seed}, ${best.wax}],`);
  report.push(
    `${String(base.id).padStart(2)} ${base.name.padEnd(16)} wax×${best.wax} ` +
      `planner ${best.expert} casual ${best.casual} no-plan ${best.thoughtless} ` +
      `gap ${(best.expert / Math.max(1, best.thoughtless)).toFixed(2)}`,
  );
}

print(
  'export const LEVEL_LAYOUTS: ReadonlyArray<readonly [seed: number, wax: number]> = [',
);
for (const row of rows) print(row);
print('];');
print('');
for (const line of report) print(line);
