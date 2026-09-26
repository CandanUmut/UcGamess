/**
 * Three simulated players, from first-timer to someone on their tenth run.
 *
 * The numbers are ordinary human-factors figures, not tuned to flatter the
 * game: a simple visual reaction is about 0.25s for an alert, practised player
 * and 0.4-0.5s for someone still reading the screen. Aim error is the spread of
 * where a thumb or mouse actually lets go relative to where it meant to.
 */
export interface Persona {
  name: string;
  /** Mean and spread of the delay between deciding and the input landing, s. */
  reaction: number;
  reactionSd: number;
  /** Spread of where a release lands relative to the intent, design px. */
  aimSd: number;
  /**
   * How often the player looks up from watching the bees and decides
   * something, per second. The single most important difference between a
   * first-timer and a regular: a new player watches the swarm and notices a
   * dry flower a couple of seconds late; a practised one is already moving.
   */
  thinkRate: number;
  /**
   * Probability, per decision, of picking a plainly worse option — the nearest
   * flower instead of the best one, ignoring a wasp for a moment.
   */
  sloppiness: number;
  /** Seconds sat on each between-day screen. */
  nightSeconds: number;
}

export const NOVICE: Persona = {
  name: 'novice',
  reaction: 0.48,
  reactionSd: 0.14,
  aimSd: 34,
  thinkRate: 0.6,
  sloppiness: 0.5,
  nightSeconds: 16,
};

export const CASUAL: Persona = {
  name: 'casual',
  reaction: 0.34,
  reactionSd: 0.08,
  aimSd: 20,
  thinkRate: 1.2,
  sloppiness: 0.25,
  nightSeconds: 10,
};

export const EXPERT: Persona = {
  name: 'expert',
  reaction: 0.23,
  reactionSd: 0.04,
  aimSd: 9,
  thinkRate: 3,
  sloppiness: 0.04,
  nightSeconds: 5,
};

export const PERSONAS: readonly Persona[] = [NOVICE, CASUAL, EXPERT];

/** A normally distributed sample, from the (seeded) Math.random. */
export function gaussian(mean: number, sd: number): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Mulberry32 — a small seeded PRNG, so a playtest is reproducible. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
