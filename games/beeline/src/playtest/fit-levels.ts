/**
 * Fits each campaign level's jar and star times by playing it.
 *
 *   node games/beeline/src/playtest/fit-levels.ts [runs]
 *
 * Each level is played `runs` times (default 6) by each simulated player.
 *
 *  - **the jar** (generated boards only; hand-built ones set their own): what
 *    a regular player banks over the whole level, trimmed so most of their
 *    attempts fill it. On world one it is placed for a first-timer.
 *  - **two stars**: filling it about as fast as a regular player does.
 *  - **three stars**: filling it as fast as a practised one.
 *
 * Prints the table to paste into `LEVEL_GOALS` in `game/Levels.ts`, and then
 * how often each player earns each star count under it.
 */
import { LEVELS, type LevelDef } from '../game/Levels.ts';
import { CASUAL, EXPERT, NOVICE, type Persona } from './personas.ts';
import { playLevel } from './session.ts';

const runs = Number(process.argv[2] ?? 6);
const print = (text: string): void => {
  process.stdout.write(`${text}\n`);
};
const seedOf = (i: number): number => 5000 + i * 7919;

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[i] ?? 0;
}

function nice(value: number): number {
  const step = value < 200 ? 5 : value < 1000 ? 10 : 25;
  return Math.max(step, Math.round(value / step) * step);
}

/** Honey banked over the whole level, with no jar to stop it. */
function totals(persona: Persona, level: LevelDef): number[] {
  return Array.from({ length: runs }, (_, i) =>
    playLevel(persona, level, seedOf(i), Infinity).honey,
  ).sort((a, b) => a - b);
}

/** Seconds to fill `goal`, Infinity for an attempt that never did. */
function fillTimes(persona: Persona, level: LevelDef, goal: number): number[] {
  return Array.from(
    { length: runs },
    (_, i) => playLevel(persona, level, seedOf(i), goal).filledAt ?? Infinity,
  ).sort((a, b) => a - b);
}

const table: Array<[number, number, number]> = [];
const report: string[] = [];

for (const level of LEVELS) {
  const handBuilt = level.layout !== undefined;
  const firstWorld = level.world === 0;
  const goal = handBuilt
    ? level.goal
    : nice(quantile(totals(firstWorld ? NOVICE : CASUAL, level), 0.3) * 0.6);

  const novice = fillTimes(NOVICE, level, goal);
  const casual = fillTimes(CASUAL, level, goal);
  const expert = fillTimes(EXPERT, level, goal);
  const finite = (t: number[], q: number, fallback: number): number => {
    const v = quantile(t, q);
    return Number.isFinite(v) ? v : fallback;
  };
  // The bots act the instant they decide; people read, aim and hesitate. The
  // margins are that difference, so a person playing well still makes them.
  let three = Math.ceil(finite(expert, 0.5, 40) * 1.3);
  let two = Math.max(three + 4, Math.ceil(finite(casual, 0.5, 60) * 1.7));
  if (level.timed) {
    three = Math.min(three, Math.floor(level.seconds * 0.65));
    two = Math.min(two, Math.floor(level.seconds * 0.85));
  }
  table.push([goal, three, two]);

  const starsOf = (times: number[]): string => {
    const counts = [0, 0, 0, 0];
    for (const t of times) {
      const n = !Number.isFinite(t) ? 0 : t <= three ? 3 : t <= two ? 2 : 1;
      counts[n] = (counts[n] ?? 0) + 1;
    }
    return counts.join('/');
  };
  const med = (t: number[]): string => {
    const v = quantile(t, 0.5);
    return Number.isFinite(v) ? v.toFixed(0) : '—';
  };
  report.push(
    `${String(level.id).padStart(2)} ${level.name.padEnd(16)} jar ${String(goal).padEnd(5)} ` +
      `★★★ ≤${three}s ★★ ≤${two}s   novice ${starsOf(novice)}  casual ${starsOf(casual)}  ` +
      `expert ${starsOf(expert)}  (med ${med(novice)}/${med(casual)}/${med(expert)}s)`,
  );
}

print('export const LEVEL_GOALS: ReadonlyArray<readonly [number, number, number]> = [');
for (const row of table) print(`  [${row.join(', ')}],`);
print('];');
print('');
print('stars earned per attempt, as counts of 0/1/2/3 stars:');
for (const line of report) print(line);
