import { describe, expect, it } from 'vitest';
import { CASUAL, EXPERT, NOVICE, type Persona } from './personas.ts';
import { playRun } from './session.ts';
import { summarise, type PersonaSummary } from './metrics.ts';

/**
 * The engagement properties the redesign was built to have, held as a gate.
 *
 * A small, capped version of `report.ts` — four seeded runs per persona, eight
 * days at most — so it runs in CI in seconds rather than minutes. The bounds
 * are deliberately looser than the targets in `metrics.ts`: this is here to
 * catch a change that breaks the *shape* of the game (a verb that makes the
 * player wait again, a quota table that walls first-timers on day two, skill
 * that stops mattering), not to fail on noise. Run the full report to tune.
 */
const RUNS = 4;
const DAYS = 8;

function measure(persona: Persona): PersonaSummary {
  const logs = [];
  for (let i = 0; i < RUNS; i += 1) logs.push(playRun(persona, 1000 + i * 7919, DAYS));
  return summarise(persona.name, logs);
}

describe('engagement gate', () => {
  const novice = measure(NOVICE);
  const casual = measure(CASUAL);
  const expert = measure(EXPERT);

  it('rewards a first-timer within a few seconds of starting', () => {
    expect(novice.firstScoreSeconds).toBeLessThan(8);
  });

  it('never makes the player wait on the game to act', () => {
    expect(casual.waitFraction).toBeLessThan(0.05);
  });

  it('keeps dead time — nothing to do, nothing happening — rare', () => {
    expect(casual.deadFraction).toBeLessThan(0.1);
  });

  it('gets a first-timer past day two', () => {
    expect(novice.daysReached).toBeGreaterThanOrEqual(3);
  });

  it('keeps the days in doubt: neither trivial nor hopeless', () => {
    expect(casual.quotaRatio).toBeGreaterThan(1.05);
    expect(casual.quotaRatio).toBeLessThan(2.2);
  });

  it('rewards skill: a practised player goes further than a first-timer', () => {
    expect(expert.daysReached).toBeGreaterThan(novice.daysReached + 1);
  });
}, 180_000);
