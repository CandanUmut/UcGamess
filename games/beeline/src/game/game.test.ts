import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning.ts';
import {
  dayLength,
  dayQuota,
  evaluateDay,
  featuresForDay,
  patchesForDay,
} from './DayCycle.ts';
import {
  deriveStats,
  emptyLevels,
  upgradeCost,
  maxLevel,
  UPGRADE_ORDER,
} from './Upgrades.ts';
import { coerceSave, newSave } from './SaveState.ts';
import { computeOffline } from './Offline.ts';

describe('day pacing', () => {
  it('grows day length then flattens at the cap', () => {
    expect(dayLength(1)).toBe(45);
    expect(dayLength(2)).toBe(50);
    expect(dayLength(10)).toBe(90);
    expect(dayLength(99)).toBe(90);
  });

  it('reaches three minutes of play within three days', () => {
    // The structural claim the whole session design rests on: a player who
    // reaches day three has cleared Poki's three-minute average before the
    // night screens are even counted.
    const playSeconds = dayLength(1) + dayLength(2) + dayLength(3);
    expect(playSeconds).toBeGreaterThanOrEqual(150);
  });

  it('keeps day one trivially passable and then tightens', () => {
    expect(dayQuota(1)).toBe(60);
    for (let day = 2; day <= 20; day += 1) {
      expect(dayQuota(day)).toBeGreaterThan(dayQuota(day - 1));
    }
  });

  it('extends the quota curve past the hand-tuned table without a jump', () => {
    const last = TUNING.day.quotas[TUNING.day.quotas.length - 1] ?? 0;
    const next = dayQuota(TUNING.day.quotas.length + 1);
    expect(next).toBeGreaterThan(last);
    // No discontinuity where the table hands over to the formula.
    expect(next / last).toBeLessThan(1.5);
  });
});

describe('escalation schedule', () => {
  it('introduces nothing on day one', () => {
    const features = featuresForDay(1);
    expect(features).toEqual({
      wind: false,
      wasps: 0,
      brambles: 0,
      richPatches: false,
      nightBloom: false,
    });
    // Two, not one: now that a drained flower stays dead for the day, the
    // first one runs dry inside 45s and the lesson only lands if there is
    // somewhere to move to.
    expect(patchesForDay(1)).toBe(2);
  });

  it('never introduces two new elements on the same day', () => {
    let previous = featuresForDay(1);
    for (let day = 2; day <= 16; day += 1) {
      const current = featuresForDay(day);
      // Only the *first* thorn thicket counts as an introduction. Later days
      // place more of them, but a second thicket is intensity, not a new thing
      // to learn — the same reason a third flower has never counted either.
      const additions =
        (current.wind && !previous.wind ? 1 : 0) +
        (current.wasps > previous.wasps ? 1 : 0) +
        (current.brambles > 0 && previous.brambles === 0 ? 1 : 0) +
        (current.richPatches && !previous.richPatches ? 1 : 0) +
        (current.nightBloom && !previous.nightBloom ? 1 : 0);
      expect(additions, `day ${day} introduced ${additions} things`).toBeLessThanOrEqual(
        1,
      );
      previous = current;
    }
  });
});

describe('evaluateDay', () => {
  it('offers extra time only on a genuinely close miss', () => {
    const quota = dayQuota(3);
    const close = evaluateDay(3, quota * 0.85, 0);
    const hopeless = evaluateDay(3, quota * 0.2, 0);

    expect(close.outcome).toBe('missed');
    expect(close.nearMiss).toBe(true);

    // Offering a rescue the game knows will not work reads as selling
    // something worthless.
    expect(hopeless.nearMiss).toBe(false);
  });

  it('never offers extra time on a day that was met', () => {
    const result = evaluateDay(3, dayQuota(3) + 1, 0);
    expect(result.outcome).toBe('met');
    expect(result.nearMiss).toBe(false);
  });

  it('reports a new best only when it beats the record', () => {
    expect(evaluateDay(1, 100, 90).isBest).toBe(true);
    expect(evaluateDay(1, 90, 90).isBest).toBe(false);
  });
});

describe('upgrades', () => {
  it('prices each level by the growth curve and caps out', () => {
    for (const id of UPGRADE_ORDER) {
      const tuning = TUNING.upgrades[id];
      expect(upgradeCost(id, 0)).toBe(tuning.base);
      expect(upgradeCost(id, 1)).toBe(Math.round(tuning.base * tuning.growth));
      // Beyond the last level there is nothing left to buy.
      expect(upgradeCost(id, maxLevel(id))).toBeNull();
    }
  });

  it('gets strictly more expensive every level', () => {
    for (const id of UPGRADE_ORDER) {
      for (let level = 1; level < maxLevel(id); level += 1) {
        expect(upgradeCost(id, level)!).toBeGreaterThan(upgradeCost(id, level - 1)!);
      }
    }
  });

  it('feeds purchased levels into the simulation stats', () => {
    const base = deriveStats(emptyLevels());
    expect(base.beeCount).toBe(TUNING.bee.baseCount);
    expect(base.routeHoldSeconds).toBe(TUNING.route.holdSeconds);

    const upgraded = deriveStats({ ...emptyLevels(), swarmSize: 2, routePersistence: 3 });
    expect(upgraded.beeCount).toBe(
      TUNING.bee.baseCount + 2 * TUNING.upgrades.swarmSize.perLevel,
    );
    expect(upgraded.routeHoldSeconds).toBeCloseTo(
      TUNING.route.holdSeconds + 3 * TUNING.upgrades.routePersistence.perLevel,
      5,
    );
  });

  it('makes route persistence the biggest relief per level', () => {
    // The flagship upgrade must actually be worth its price: maxing it should
    // roughly double how long a route survives untouched.
    const maxed = deriveStats({
      ...emptyLevels(),
      routePersistence: maxLevel('routePersistence'),
    });
    expect(maxed.routeHoldSeconds).toBeGreaterThanOrEqual(TUNING.route.holdSeconds * 1.7);
  });
});

describe('save coercion', () => {
  it('round-trips a valid save', () => {
    const original = newSave();
    original.honey = 1234;
    original.day = 7;
    original.levels.swarmSize = 3;
    expect(coerceSave(JSON.parse(JSON.stringify(original)))).toMatchObject({
      honey: 1234,
      day: 7,
      levels: expect.objectContaining({ swarmSize: 3 }),
    });
  });

  it('survives garbage instead of crashing on boot', () => {
    // Save data outlives the code that wrote it. Anything unreadable must give
    // a playable game, because a crash here is unrecoverable for the player.
    for (const junk of [null, undefined, 42, 'nonsense', [], { day: 'seven' }]) {
      const save = coerceSave(junk);
      expect(save.day).toBeGreaterThanOrEqual(1);
      expect(save.honey).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(save.honey)).toBe(true);
    }
  });

  it('clamps an upgrade level above the cap', () => {
    // A level past the table would index off the end of the cost curve and
    // price the next purchase as NaN.
    const save = coerceSave({ levels: { swarmSize: 9999 } });
    expect(save.levels.swarmSize).toBe(maxLevel('swarmSize'));
    expect(upgradeCost('swarmSize', save.levels.swarmSize)).toBeNull();
  });

  it('rejects negative and non-finite honey', () => {
    expect(coerceSave({ honey: -500 }).honey).toBe(0);
    expect(coerceSave({ honey: Number.NaN }).honey).toBe(0);
    expect(coerceSave({ honey: Number.POSITIVE_INFINITY }).honey).toBeLessThan(Infinity);
  });
});

describe('offline accrual', () => {
  const stats = deriveStats(emptyLevels());
  const HOUR = 3_600_000;

  it('pays for time away, capped by the Honey Store', () => {
    const now = Date.now();
    const short = computeOffline(now - HOUR, now, stats);
    expect(short.honey).toBeGreaterThan(0);
    expect(short.honey).toBeLessThanOrEqual(stats.offlineCapHoney);

    const long = computeOffline(now - 500 * HOUR, now, stats);
    expect(long.honey).toBe(stats.offlineCapHoney);
    expect(long.capped).toBe(true);
  });

  it('lets the cap bind before the window, so the upgrade actually matters', () => {
    // Guards a real tuning bug: a short window at a low rate meant the cap was
    // never reached, and buying Honey Store raised a ceiling nothing hit.
    const maxEarnableInWindow = stats.offlineWindowHours * TUNING.offline.honeyPerHour;
    expect(maxEarnableInWindow).toBeGreaterThan(stats.offlineCapHoney);

    const maxed = deriveStats({ ...emptyLevels(), honeyStore: maxLevel('honeyStore') });
    expect(maxed.offlineWindowHours * TUNING.offline.honeyPerHour).toBeGreaterThan(
      maxed.offlineCapHoney,
    );
  });

  it('ignores a clock that jumped backwards', () => {
    const now = Date.now();
    expect(computeOffline(now + 100 * HOUR, now, stats).honey).toBe(0);
  });

  it('never pays out more for a longer absence than the window allows', () => {
    const now = Date.now();
    const a = computeOffline(now - 10_000 * HOUR, now, stats).honey;
    const b = computeOffline(now - 100_000 * HOUR, now, stats).honey;
    // A device clock set years forward must not hand over years of honey.
    expect(a).toBe(b);
    expect(a).toBeLessThanOrEqual(stats.offlineCapHoney);
  });

  it('does not bother the player with a trivial amount', () => {
    const now = Date.now();
    expect(computeOffline(now - 1000, now, stats).honey).toBe(0);
  });

  it('pays more once the Honey Store is upgraded', () => {
    const now = Date.now();
    const upgraded = deriveStats({ ...emptyLevels(), honeyStore: 3 });
    const base = computeOffline(now - 200 * HOUR, now, stats).honey;
    const better = computeOffline(now - 200 * HOUR, now, upgraded).honey;
    expect(better).toBeGreaterThan(base);
  });
});
