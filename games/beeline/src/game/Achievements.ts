import type { BeelineSave } from './SaveState.ts';
import { UPGRADES } from './HiveUpgrades.ts';

/**
 * Long-term goals, kept across every run and level.
 *
 * Each is a line the player can read before they have it, so it works as a
 * goal and not only as a surprise: "find ten Royal Blooms" is a reason to go
 * back into the mist on a level already three-starred.
 */
export interface AchievementDef {
  id: string;
  name: string;
  /** What to do, said as a goal. */
  goal: string;
  done(save: BeelineSave): boolean;
}

const stars = (save: BeelineSave): number => save.levelStars.reduce((a, b) => a + b, 0);
const explored = (save: BeelineSave): number =>
  save.levelExplored.filter((v) => v > 0).length;

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'first-harvest',
    name: 'First Harvest',
    goal: 'Pass your first level',
    done: (s) => (s.levelStars[0] ?? 0) >= 1,
  },
  {
    id: 'into-the-mist',
    name: 'Into the Mist',
    goal: 'Find a hidden flower',
    done: (s) => s.tally.flowersFound >= 1,
  },
  {
    id: 'honey-hunter',
    name: 'Honey Hunter',
    goal: 'Find 10 honey pots',
    done: (s) => s.tally.pots >= 10,
  },
  {
    id: 'royal-discovery',
    name: 'Royal Discovery',
    goal: 'Find a Royal Bloom',
    done: (s) => s.tally.royals >= 1,
  },
  {
    id: 'royal-botanist',
    name: "Queen's Botanist",
    goal: 'Find 10 Royal Blooms',
    done: (s) => s.tally.royals >= 10,
  },
  {
    id: 'cartographer',
    name: 'Cartographer',
    goal: 'Find every treasure on a level',
    done: (s) => explored(s) >= 1,
  },
  {
    id: 'master-cartographer',
    name: 'Master Cartographer',
    goal: 'Find every treasure on 15 levels',
    done: (s) => explored(s) >= 15,
  },
  {
    id: 'swatter',
    name: 'Swatter',
    goal: 'Swat 25 wasps',
    done: (s) => s.tally.wasps >= 25,
  },
  {
    id: 'wasp-bane',
    name: 'Wasp Bane',
    goal: 'Swat 150 wasps',
    done: (s) => s.tally.wasps >= 150,
  },
  {
    id: 'busy-hive',
    name: 'Busy Hive',
    goal: 'Reach the ×5 multiplier',
    done: (s) => s.tally.bestCombo >= 5,
  },
  {
    id: 'growing-hive',
    name: 'Growing Hive',
    goal: 'Buy your first hive skill',
    done: (s) => Object.values(s.upgrades).some((n) => (n ?? 0) > 0),
  },
  {
    id: 'master-beekeeper',
    name: 'Master Beekeeper',
    goal: 'Max out any hive skill',
    done: (s) => UPGRADES.some((u) => (s.upgrades[u.id] ?? 0) >= u.max),
  },
  {
    id: 'honey-baron',
    name: 'Honey Baron',
    goal: 'Bank 10,000 honey',
    done: (s) => s.lifetimeHoney >= 10_000,
  },
  {
    id: 'honey-tycoon',
    name: 'Honey Tycoon',
    goal: 'Bank 100,000 honey',
    done: (s) => s.lifetimeHoney >= 100_000,
  },
  {
    id: 'star-gatherer',
    name: 'Star Gatherer',
    goal: 'Earn 30 stars',
    done: (s) => stars(s) >= 30,
  },
  {
    id: 'full-comb',
    name: 'Full Comb',
    goal: 'Earn all 90 stars',
    done: (s) => stars(s) >= 90,
  },
  {
    id: 'long-summer',
    name: 'Long Summer',
    goal: 'Reach day 10 in endless mode',
    done: (s) => s.bestRunDay >= 10,
  },
];

/** Marks every newly met achievement unlocked, and returns them for a toast. */
export function unlockAchievements(save: BeelineSave): AchievementDef[] {
  const fresh: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements.includes(a.id) || !a.done(save)) continue;
    save.achievements.push(a.id);
    fresh.push(a);
  }
  return fresh;
}
