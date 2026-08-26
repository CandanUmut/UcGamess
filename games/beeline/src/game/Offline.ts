import { TUNING } from '../config/tuning.ts';
import type { DerivedStats } from './Upgrades.ts';

export interface OfflineResult {
  money: number;
  hoursAway: number;
  /** True when the store filled up and further time earned nothing. */
  capped: boolean;
}

const MIN_CLAIM = 5;

/**
 * Honey the hive gathered while the player was away.
 *
 * Two guards matter more than the arithmetic:
 *
 *  - **Clamp the elapsed time to the window.** A device clock that jumps
 *    forward — timezone change, manual adjustment, a stale `lastPlayedAt` —
 *    would otherwise pay out years of money and destroy the progression.
 *  - **Ignore negative elapsed.** Clocks move backwards too.
 *
 * The Honey Store upgrade raises both the hourly cap and the window, which is
 * what makes it the only purchase that pays out between sessions.
 */
export function computeOffline(
  lastPlayedAt: number,
  now: number,
  stats: DerivedStats,
): OfflineResult {
  const elapsedMs = now - lastPlayedAt;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return { money: 0, hoursAway: 0, capped: false };
  }

  const hoursAway = elapsedMs / 3_600_000;
  const countedHours = Math.min(hoursAway, stats.offlineWindowHours);

  const earned = countedHours * TUNING.offline.honeyPerHour;
  const money = Math.floor(Math.min(earned, stats.offlineCapMoney));

  return {
    money: money < MIN_CLAIM ? 0 : money,
    hoursAway,
    capped: earned > stats.offlineCapMoney || hoursAway > stats.offlineWindowHours,
  };
}

/** "3h 20m away" — for the claim prompt. */
export function formatAway(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return minutes > 0 ? `${whole}h ${minutes}m` : `${whole}h`;
}
