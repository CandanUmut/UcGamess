/**
 * Fits the campaign's star thresholds by playing every level.
 *
 *   node games/beeline/src/playtest/fit-levels.ts [runs]
 *
 * Each level is played `runs` times (default 6) by each simulated player, and
 * the thresholds are placed against what they actually score:
 *
 *  - **one star**: a first-timer with no plan passes about half their tries.
 *    Nobody is walled out of the campaign for not having found branching
 *    yet; the stars above are where planning shows.
 *  - **two stars**: a regular player's ordinary score.
 *  - **three stars**: what a practised planner gets, and always clear of what
 *    expert hands earn with no plan at all (`THOUGHTLESS`, straight lines to
 *    the nearest flower). Three stars has to mean the network was good.
 *
 * Prints the table to paste into `LEVEL_STARS` in `game/Levels.ts`, and then
 * how often each player earns each star count under it.
 */
import { LEVELS, type LevelDef } from '../game/Levels.ts';
import { CASUAL, EXPERT, NOVICE, THOUGHTLESS, type Persona } from './personas.ts';
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
  const thoughtless = scores(THOUGHTLESS, level);

  let one = nice(Math.max(quantile(novice, 0.5) * 0.95, quantile(expert, 0.5) * 0.12));
  let three = nice(
    Math.max(one * 1.5, quantile(expert, 0.35) * 0.95, quantile(thoughtless, 1) * 1.2),
  );
  // Two stars: a regular's ordinary game, kept clearly below three even on
  // the early boards where a regular already plays almost like a planner.
  let two = nice(
    Math.max(one * 1.25, Math.min(quantile(casual, 0.4) * 0.95, three / 1.12)),
  );
  if (level.id === 1) {
    // The first board teaches the drag, and nothing else: everyone who plays
    // it through gets there, and three stars is just playing it well.
    const med = quantile(novice, 0.5);
    one = nice(med * 0.6);
    two = nice(med * 0.85);
    three = nice(quantile(expert, 0.5) * 0.97);
  }
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
      `thoughtless ${starsOf(thoughtless)}  ` +
      `(med ${quantile(novice, 0.5)}/${quantile(casual, 0.5)}/${quantile(expert, 0.5)}/${quantile(thoughtless, 0.5)}` +
      ` gap ${(quantile(expert, 0.5) / Math.max(1, quantile(thoughtless, 0.5))).toFixed(2)})`,
  );
}

print('export const LEVEL_STARS: ReadonlyArray<readonly [number, number, number]> = [');
for (const row of table) print(`  [${row.join(', ')}],`);
print('];');
print('');
print('stars earned per attempt, as counts of 0/1/2/3 stars:');
for (const line of report) print(line);
