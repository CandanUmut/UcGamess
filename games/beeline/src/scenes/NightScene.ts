import type Phaser from 'phaser';
import { BaseScene, DESIGN_HEIGHT, DESIGN_WIDTH } from '@ucgames/core';
import { COLORS, TUNING } from '../config/tuning.ts';
import {
  dayQuota,
  featuresForDay,
  forecastFor,
  nextUnlock,
  type DayResult,
} from '../game/DayCycle.ts';
import {
  UPGRADES,
  UPGRADE_ORDER,
  upgradeCost,
  maxLevel,
  type UpgradeId,
} from '../game/Upgrades.ts';
import {
  PROVISIONS,
  provisionCost,
  provisionsFor,
  type ProvisionId,
} from '../game/Provisions.ts';
import type { BeelineSave } from '../game/SaveState.ts';
import { Button } from '../ui/Button.ts';
import type { Sfx } from '../audio/Sfx.ts';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export interface NightData {
  result: DayResult;
  save: BeelineSave;
  sfx: Sfx;
  /** Resumes the same board with extra seconds. */
  onExtend: () => void;
  /** Starts the next day. */
  onNextDay: () => void;
  /** Persists after any change made here. */
  onChanged: () => void;
}

/**
 * Night: the results of the day, upgrades, and the ad break points.
 *
 * Both ad placements live here because both sit at the seam between days, which
 * is the only place an interruption is not interrupting anything:
 *
 *  - **Interstitial** fires when the player presses Next Day — after they have
 *    shown intent to continue, never on the death moment. It fires on *every*
 *    press including day one; suppressing early calls to manage frequency is
 *    exactly the home-grown ad timer both portals reject. The portal decides.
 *  - **Rewarded** is always opt-in, offers something visibly wanted, and never
 *    blocks progress. At most one offer per night, never chained.
 */
export class NightScene extends BaseScene {
  private nightData!: NightData;
  /** Kept separate from the provision shelf so refreshing one cannot index into the other. */
  private upgradeButtons: Button[] = [];
  private provisionButtons: Button[] = [];
  private offered: ProvisionId[] = [];
  private honeyText!: Phaser.GameObjects.Text;
  private busy = false;
  private rewardTaken = false;

  constructor() {
    super({ key: 'Night' });
  }

  init(data: NightData): void {
    this.nightData = data;
    this.busy = false;
    this.rewardTaken = false;
    this.upgradeButtons = [];
    this.provisionButtons = [];
    this.offered = [];
  }

  /** The day the player is about to start. Day 1 again after a failed run. */
  private get nextDay(): number {
    return this.nightData.save.day;
  }

  protected build(): void {
    const { result, save } = this.nightData;

    this.add
      .rectangle(
        DESIGN_WIDTH / 2,
        DESIGN_HEIGHT / 2,
        DESIGN_WIDTH,
        DESIGN_HEIGHT,
        0x08070a,
        0.93,
      )
      .setOrigin(0.5);

    const met = result.outcome === 'met';

    this.add
      .text(
        DESIGN_WIDTH / 2,
        66,
        met ? `Day ${result.day} complete` : 'The hive goes hungry',
        {
          fontFamily: FONT,
          fontSize: '38px',
          fontStyle: 'bold',
          color: met ? '#7fd1ae' : '#ff8a65',
        },
      )
      .setOrigin(0.5);

    this.add
      .text(
        DESIGN_WIDTH / 2,
        106,
        met
          ? `${Math.floor(result.honey)} honey — quota ${result.quota} met`
          : `${Math.floor(result.honey)} of ${result.quota} needed — run ended on day ${result.day}`,
        { fontFamily: FONT, fontSize: '21px', color: COLORS.dim },
      )
      .setOrigin(0.5);

    if (!met) {
      // What a failed run leaves behind, said plainly. A fail state that looks
      // like it wiped everything is how players quit; this one never does.
      this.add
        .text(
          DESIGN_WIDTH / 2,
          134,
          save.bestRunDay > 0
            ? `Best run: day ${save.bestRunDay}  ·  your upgrades carry over`
            : 'Your upgrades carry over',
          { fontFamily: FONT, fontSize: '18px', color: '#ffd966' },
        )
        .setOrigin(0.5);
    } else if (result.isBest) {
      this.add
        .text(DESIGN_WIDTH / 2, 134, 'Best day yet', {
          fontFamily: FONT,
          fontSize: '18px',
          color: '#ffd966',
        })
        .setOrigin(0.5);
    }

    this.honeyText = this.add
      .text(DESIGN_WIDTH / 2, 168, `${Math.floor(save.honey)} honey to spend`, {
        fontFamily: FONT,
        fontSize: '25px',
        color: COLORS.text,
      })
      .setOrigin(0.5);

    this.buildUpgrades();
    this.buildForecast();
    this.buildProvisions();
    this.buildActions();
  }

  private buildUpgrades(): void {
    const columns = 3;
    const cardWidth = 340;
    const gapX = 24;
    const gapY = 12;
    const startX = DESIGN_WIDTH / 2 - ((columns - 1) * (cardWidth + gapX)) / 2;

    UPGRADE_ORDER.forEach((id, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + column * (cardWidth + gapX);
      const y = 246 + row * (74 + gapY);

      this.upgradeButtons.push(
        new Button(this, {
          x,
          y,
          width: cardWidth,
          label: UPGRADES[id].name,
          sublabel: this.upgradeSublabel(id),
          tint: id === 'routePersistence' ? 0xffd966 : 0x60a5fa,
          enabled: this.canAfford(id),
          onClick: () => this.buy(id),
        }),
      );
    });

    this.add
      .text(DESIGN_WIDTH / 2, 194, 'Permanent — spend honey', {
        fontFamily: FONT,
        fontSize: '17px',
        color: COLORS.dim,
      })
      .setOrigin(0.5);
  }

  /**
   * What tomorrow holds, and the next thing still to come.
   *
   * The design has claimed a progression track since the first draft — "the
   * night screen shows the next unlock two or three days ahead, so there is
   * always a visible reason to start another day" — and it was never built.
   *
   * It earns its place twice over now that provisions exist. Buying smoke is a
   * coin flip unless the player can see there are wasps tomorrow, and shears
   * are wasted honey on a day with no thorns. The forecast turns the shelf from
   * a gamble into a read, which is the difference between a purchase the player
   * regrets and one they feel clever about.
   */
  private buildForecast(): void {
    const day = this.nextDay;
    const parts = forecastFor(day);

    this.add
      .text(DESIGN_WIDTH / 2, 404, `Tomorrow · Day ${day} · quota ${dayQuota(day)}`, {
        fontFamily: FONT,
        fontSize: '20px',
        color: COLORS.text,
      })
      .setOrigin(0.5);

    const ahead = nextUnlock(day);
    const trailer = ahead ? `      ·      day ${ahead.day}: ${ahead.what}` : '';

    this.add
      .text(DESIGN_WIDTH / 2, 432, parts.join('  ·  ') + trailer, {
        fontFamily: FONT,
        fontSize: '17px',
        color: COLORS.dim,
      })
      .setOrigin(0.5);
  }

  /**
   * The provision shelf: one-use items spent on tomorrow.
   *
   * Exactly one can be carried. That cap is the design, not a limitation of it
   * — a stackable inventory needs quantities, a screen to manage them, and
   * balance against every combination, and it would turn the night screen into
   * bookkeeping. One slot keeps the question small and sharp: given what the
   * forecast says, what is the single thing that would help most?
   *
   * Clicking the carried item puts it back at full price. Nothing here should
   * be a decision a misplaced thumb makes permanent.
   */
  private buildProvisions(): void {
    this.offered = provisionsFor(featuresForDay(this.nextDay));
    if (this.offered.length === 0) return;

    const cardWidth = 240;
    const gapX = 10;
    const startX =
      DESIGN_WIDTH / 2 - ((this.offered.length - 1) * (cardWidth + gapX)) / 2;

    this.add
      .text(DESIGN_WIDTH / 2, 466, 'Pack one for tomorrow', {
        fontFamily: FONT,
        fontSize: '17px',
        color: COLORS.dim,
      })
      .setOrigin(0.5);

    this.offered.forEach((id, index) => {
      this.provisionButtons.push(
        new Button(this, {
          x: startX + index * (cardWidth + gapX),
          y: 516,
          width: cardWidth,
          label: PROVISIONS[id].name,
          sublabel: this.provisionSublabel(id),
          tint: this.isPacked(id) ? 0x7fd1ae : 0xc084fc,
          enabled: this.canPack(id),
          onClick: () => this.togglePack(id),
        }),
      );
    });
  }

  private isPacked(id: ProvisionId): boolean {
    return this.nightData.save.provision === id;
  }

  private provisionSublabel(id: ProvisionId): string {
    if (this.isPacked(id)) return 'packed · tap to remove';
    return `${PROVISIONS[id].effect}  ·  ${provisionCost(id, this.nextDay)}`;
  }

  /**
   * Affordable *after* refunding whatever is currently packed.
   *
   * Without that, packing a cheap provision first would grey out an expensive
   * one the player can perfectly well afford by swapping — a shelf that
   * punishes looking at it in the wrong order.
   */
  private canPack(id: ProvisionId): boolean {
    if (this.isPacked(id)) return true;
    return this.availableHoney() >= provisionCost(id, this.nextDay);
  }

  private availableHoney(): number {
    const { save } = this.nightData;
    const packed = save.provision;
    return save.honey + (packed ? provisionCost(packed, this.nextDay) : 0);
  }

  private togglePack(id: ProvisionId): void {
    const { save, sfx } = this.nightData;
    const day = this.nextDay;

    // Refund first, so swapping is a single decision rather than a sequence
    // the player has to get in the right order.
    if (save.provision) {
      save.honey += provisionCost(save.provision, day);
      const wasPacked = save.provision;
      save.provision = null;
      if (wasPacked === id) {
        this.nightData.onChanged();
        this.refresh();
        return;
      }
    }

    const cost = provisionCost(id, day);
    if (save.honey >= cost) {
      save.honey -= cost;
      save.provision = id;
      sfx.play('collect', 0.4);
    }

    this.nightData.onChanged();
    this.refresh();
  }

  private upgradeSublabel(id: UpgradeId): string {
    const level = this.nightData.save.levels[id];
    const cost = upgradeCost(id, level);
    const effect = UPGRADES[id].format(level);
    if (cost === null) return `${effect} · maxed`;
    return `${effect} → ${UPGRADES[id].format(level + 1)}   ·   ${cost}`;
  }

  private canAfford(id: UpgradeId): boolean {
    const level = this.nightData.save.levels[id];
    const cost = upgradeCost(id, level);
    return cost !== null && this.nightData.save.honey >= cost;
  }

  private buy(id: UpgradeId): void {
    const { save, sfx } = this.nightData;
    const level = save.levels[id];
    const cost = upgradeCost(id, level);
    if (cost === null || save.honey < cost) return;

    save.honey -= cost;
    save.levels[id] = Math.min(level + 1, maxLevel(id));
    sfx.play('upgrade', 0.4);

    this.nightData.onChanged();
    this.refresh();
  }

  private refresh(): void {
    this.honeyText.setText(`${Math.floor(this.nightData.save.honey)} honey to spend`);

    UPGRADE_ORDER.forEach((id, index) => {
      const button = this.upgradeButtons[index];
      if (!button) return;
      button.setLabel(UPGRADES[id].name, this.upgradeSublabel(id));
      button.setEnabled(this.canAfford(id));
    });

    this.offered.forEach((id, index) => {
      const button = this.provisionButtons[index];
      if (!button) return;
      button.setLabel(PROVISIONS[id].name, this.provisionSublabel(id));
      button.setTint(this.isPacked(id) ? 0x7fd1ae : 0xc084fc);
      button.setEnabled(this.canPack(id));
    });
  }

  private buildActions(): void {
    const { result } = this.nightData;
    const adsAvailable = !this.context.portal.isAdBlocked();
    const y = 620;

    // At most one rewarded offer per night, and only when it buys something the
    // player visibly wants right now. A near miss wants more time; a completed
    // day wants more honey.
    const offering = adsAvailable && (result.nearMiss || result.honey > 0);

    if (adsAvailable && result.nearMiss) {
      new Button(this, {
        x: DESIGN_WIDTH / 2 - 190,
        y,
        width: 350,
        label: `▶  +${TUNING.ads.extendSeconds}s to finish`,
        sublabel: 'watch a short ad',
        tint: 0x7fd1ae,
        onClick: () => void this.onRewarded('extend'),
      });
    } else if (adsAvailable && result.honey > 0) {
      new Button(this, {
        x: DESIGN_WIDTH / 2 - 190,
        y,
        width: 350,
        label: `▶  Double to ${Math.floor(result.honey * 2)}`,
        sublabel: 'watch a short ad',
        tint: 0xffd966,
        onClick: () => void this.onRewarded('double'),
      });
    }

    // Always present, never delayed, never dimmed. The non-ad path out.
    const met = result.outcome === 'met';
    new Button(this, {
      x: offering ? DESIGN_WIDTH / 2 + 190 : DESIGN_WIDTH / 2,
      y,
      width: 350,
      label: met ? `Start day ${result.day + 1}` : 'Start a new run',
      tint: 0x4ade80,
      onClick: () => void this.onNextDay(),
    });
  }

  private async onRewarded(kind: 'extend' | 'double'): Promise<void> {
    if (this.busy || this.rewardTaken) return;
    this.busy = true;

    await this.context.save.flush();
    const earned = await this.context.portal.rewardedBreak();

    if (!earned) {
      // Never punish a failed ad. Say so plainly and leave everything intact.
      this.busy = false;
      this.add
        .text(DESIGN_WIDTH / 2, 574, 'No ad available right now.', {
          fontFamily: FONT,
          fontSize: '18px',
          color: COLORS.dim,
        })
        .setOrigin(0.5);
      return;
    }

    this.rewardTaken = true;

    if (kind === 'double') {
      const bonus = Math.floor(this.nightData.result.honey);
      this.nightData.save.honey += bonus;
      this.nightData.onChanged();
      this.busy = false;
      this.refresh();
      this.nightData.sfx.play('upgrade', 0.5);
      return;
    }

    this.nightData.onExtend();
  }

  private async onNextDay(): Promise<void> {
    if (this.busy) return;
    this.busy = true;

    await this.context.save.flush();
    // Signal the opportunity on every day boundary and let the portal decide
    // whether an ad actually plays. Deciding that ourselves would be an ad
    // timer, which is a documented rejection cause.
    await this.context.portal.commercialBreak();

    this.nightData.onNextDay();
  }
}
