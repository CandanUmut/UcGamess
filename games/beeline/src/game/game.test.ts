import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning.ts';
import {
  dayLength,
  dayQuota,
  evaluateDay,
  featuresForDay,
  patchesForDay,
  starsFor,
  sunsetBonus,
} from './DayCycle.ts';
import { deriveStats } from './Upgrades.ts';
import { modifiersFor } from './Items.ts';
import { coerceSave, newSave } from './SaveState.ts';

describe('day pacing', () => {
  it('grows day length then flattens at the cap', () => {
    expect(dayLength(1)).toBe(TUNING.day.baseSeconds);
    expect(dayLength(2)).toBe(TUNING.day.baseSeconds + TUNING.day.secondsPerDay);
    expect(dayLength(99)).toBe(TUNING.day.maxSeconds);
  });

  it('reaches three minutes of play within three days', () => {
    // The structural claim the whole session design rests on: a player who
    // reaches day three has cleared Poki's three-minute average before the
    // night screens are even counted.
    const playSeconds = dayLength(1) + dayLength(2) + dayLength(3);
    expect(playSeconds).toBeGreaterThanOrEqual(120);
  });

  it('keeps day one trivially passable and then tightens', () => {
    expect(dayQuota(1)).toBe(TUNING.day.quotas[0]);
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
      raidSize: 0,
      wave: [],
      mazeOpenness: 1,
      richPatches: false,
      nightBloom: false,
    });
    // Three, against three lines: day one is the one board a first-timer
    // can hold in full, and clearing it early is the first win they get.
    expect(patchesForDay(1)).toBe(3);
  });

  it('never introduces two new elements on the same day', () => {
    let previous = featuresForDay(1);
    for (let day = 2; day <= 16; day += 1) {
      const current = featuresForDay(day);
      // Only the day the brambles first appear counts as an introduction. The
      // maze tightening a little each day after that is intensity, not a new
      // thing to learn — the same reason a third flower has never counted.
      const additions =
        // A *new kind* of wasp is a new thing to learn. A bigger wave of the
        // same kinds is intensity, exactly like the maze tightening — counting
        // it here would make every other day an "introduction" and the rule
        // meaningless.
        (new Set(current.wave).size > new Set(previous.wave).size ? 1 : 0) +
        (current.mazeOpenness < 1 && previous.mazeOpenness >= 1 ? 1 : 0) +
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

  it('gives stars for beating the quota well, and none for missing it', () => {
    const quota = dayQuota(4);
    expect(starsFor(quota - 1, quota)).toBe(0);
    expect(starsFor(quota, quota)).toBe(1);
    expect(starsFor(quota * TUNING.score.twoStars, quota)).toBe(2);
    expect(starsFor(quota * TUNING.score.threeStars, quota)).toBe(3);
    expect(evaluateDay(4, quota * 2, 0).stars).toBe(3);
  });

  it('pays a sunset bonus for clearing early, scaled to the day', () => {
    expect(sunsetBonus(3, 0)).toBe(0);
    expect(sunsetBonus(3, 10)).toBeGreaterThan(0);
    // Worth the same share of the quota whatever the day.
    const early = sunsetBonus(2, 10) / dayQuota(2);
    const late = sunsetBonus(12, 10) / dayQuota(12);
    expect(Math.abs(early - late)).toBeLessThan(0.02);
  });
});

describe('draft picks', () => {
  it("feed the day's stats", () => {
    const base = deriveStats();
    const picked = deriveStats(modifiersFor(['moreLines', 'moreLines', 'wildflowers']));
    expect(picked.routeSlots).toBe(base.routeSlots + 2);
    expect(picked.extraPatches).toBe(1);
  });

  it('stack', () => {
    expect(modifiersFor(['broodChamber', 'broodChamber']).extraBees).toBe(8);
    expect(modifiersFor(['wideLanes']).extraCrew).toBe(2);
  });
});

describe('save coercion', () => {
  it('round-trips a valid save', () => {
    const save = newSave();
    save.day = 4;
    save.runScore = 812;
    save.items = ['moreLines', 'swiftWings'];
    save.bestScore = 2000;
    expect(coerceSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });

  it('survives garbage instead of crashing on boot', () => {
    for (const junk of [null, undefined, 42, 'x', [], { day: 'lots', items: 7 }]) {
      const save = coerceSave(junk);
      expect(save.day).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(save.items)).toBe(true);
    }
  });

  it("keeps a v1 player's record but not a run balanced for another game", () => {
    const v1 = { version: 1, day: 9, money: 5000, bestRunDay: 11, tutorialDone: true };
    const save = coerceSave(v1);
    expect(save.day).toBe(1);
    expect(save.bestRunDay).toBe(11);
    expect(save.tutorialDone).toBe(true);
  });

  it('drops item ids that no longer exist', () => {
    const save = newSave();
    const raw = { ...save, items: ['moreLines', 'waxedTrails', 'nonsense'] };
    expect(coerceSave(raw).items).toEqual(['moreLines']);
  });
});
