/**
 * Fits the campaign's star thresholds by playing every level.
 *
 *   node games/beeline/src/playtest/fit-levels.ts [runs]
 *
 * Each level is played `runs` times (default 6) by each simulated player, and
 * the thresholds are placed against what they actually score:
 *
 *  - **one star**: a first-timer on world one, a regular after that. Passing a
 *    level should be something most players do on the first or second try.
 *  - **two stars**: a regular player's ordinary score.
 *  - **three stars**: what a practised player gets — which in practice means
 *    keeping the Busy Hive multiplier high most of the level.
 *
 * Prints the table to paste into `LEVEL_STARS` in `game/Levels.ts`, and then
 * how often each player earns each star count under it.
 */
import { LEVELS, type LevelDef } from '../game/Levels.ts';
import { CASUAL, EXPERT, NOVICE, type Persona } from './personas.ts';
import { playLevel } from './session.ts';

const runs = Number(process.argv[2] ?? 6);
const print = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

function scores(persona: Persona, level: LevelDef): number[] {
  const out: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    out.push(playLevel(persona, level, 5000 + i * 7919).honey);
  }
  return out.sort((a, b) => a - b);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[i] ?? 0;
}

function nice(value: number): number {
  const step = value < 200 ? 5 : value < 1000 ? 10 : 25;
  return Math.max(step, Math.round(value / step) * step);
}

const table: Array<[number, number, number]> = [];
const report: string[] = [];

for (const level of LEVELS) {
  const novice = scores(NOVICE, level);
  const casual = scores(CASUAL, level);
  const expert = scores(EXPERT, level);

  const firstWorld = level.world === 0;
  // One star: the lower quartile of the player it is meant for, so most of
  // their attempts pass.
  const oneBase = firstWorld ? quantile(novice, 0.35) : quantile(casual, 0.25);
  const one = nice(oneBase * 0.95);
  const two = nice(Math.max(one * 1.12, quantile(casual, 0.6)));
  const three = nice(Math.max(two * 1.1, quantile(expert, 0.5) * 0.97));
  table.push([one, two, three]);

  const starsOf = (sorted: number[]): string => {
    const counts = [0, 0, 0, 0];
    for (const s of sorted) {
      const n = s >= three ? 3 : s >= two ? 2 : s >= one ? 1 : 0;
      counts[n] = (counts[n] ?? 0) + 1;
    }
    return counts.join('/');
  };
  report.push(
    `${String(level.id).padStart(2)} ${level.name.padEnd(16)} ${[one, two, three].join('/').padEnd(16)} ` +
      `novice ${starsOf(novice)}  casual ${starsOf(casual)}  expert ${starsOf(expert)}  ` +
      `(med ${quantile(novice, 0.5)}/${quantile(casual, 0.5)}/${quantile(expert, 0.5)})`,
  );
}

print('export const LEVEL_STARS: ReadonlyArray<readonly [number, number, number]> = [');
for (const row of table) print(`  [${row.join(', ')}],`);
print('];');
print('');
print('stars earned per attempt, as counts of 0/1/2/3 stars:');
for (const line of report) print(line);
