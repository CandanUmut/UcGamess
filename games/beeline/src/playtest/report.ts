/**
 * Prints the engagement report for the current build of the game.
 *
 *   node --experimental-strip-types games/beeline/src/playtest/report.ts [runs] [--days]
 *
 * Plays `runs` seeded runs per persona (default 12) and prints the summary
 * table and the score. Seeds are fixed, so two runs of this script on the same
 * code print the same numbers. `--days` adds a per-day breakdown, which is the
 * view to tune quotas against.
 */
import { PERSONAS } from './personas.ts';
import { playRun } from './session.ts';
import { engagementScore, formatReport, summarise, type RunLog } from './metrics.ts';

const print = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

const runs = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 12);
const showDays = process.argv.includes('--days');

const all: RunLog[][] = PERSONAS.map((persona) => {
  const logs: RunLog[] = [];
  for (let i = 0; i < runs; i += 1) logs.push(playRun(persona, 1000 + i * 7919));
  return logs;
});
const summaries = PERSONAS.map((p, i) => summarise(p.name, all[i] ?? []));
const [novice, casual, expert] = summaries;
if (!novice || !casual || !expert) throw new Error('three personas expected');

if (showDays) {
  for (const [i, persona] of PERSONAS.entries()) {
    const logs = all[i] ?? [];
    const lines: string[] = [];
    for (let day = 1; day <= 25; day += 1) {
      const recs = logs.flatMap((l) => l.days.filter((d) => d.day === day));
      if (recs.length === 0) break;
      const ratio = recs.reduce((a, d) => a + d.score / d.quota, 0) / recs.length;
      const secs = recs.reduce((a, d) => a + d.seconds, 0) / recs.length;
      const fail = recs.filter((d) => !d.met).length;
      const score = recs.reduce((a, d) => a + d.score, 0) / recs.length;
      lines.push(
        `d${day}: ${Math.round(score)} ${ratio.toFixed(2)}x ${secs.toFixed(0)}s${fail ? ` fail=${fail}/${recs.length}` : ''}`,
      );
    }
    print(`${persona.name}: ${lines.join(' | ')}`);
  }
  print('');
}
print(formatReport(summaries, engagementScore(novice, casual, expert)));
