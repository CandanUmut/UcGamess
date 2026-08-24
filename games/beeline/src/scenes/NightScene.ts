import type Phaser from 'phaser';
import { BaseScene, DESIGN_HEIGHT, DESIGN_WIDTH } from '@ucgames/core';
import { COLORS, TUNING } from '../config/tuning.ts';
import type { DayResult } from '../game/DayCycle.ts';
import {
  UPGRADES,
  UPGRADE_ORDER,
  upgradeCost,
  maxLevel,
  type UpgradeId,
} from '../game/Upgrades.ts';
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
  private buttons: Button[] = [];
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
    this.buttons = [];
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
        78,
        met ? `Day ${result.day} complete` : `Day ${result.day}`,
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
        122,
        met
          ? `${Math.floor(result.honey)} honey — quota ${result.quota} met`
          : `${Math.floor(result.honey)} honey — ${result.quota} needed`,
        { fontFamily: FONT, fontSize: '21px', color: COLORS.dim },
      )
      .setOrigin(0.5);

    if (result.isBest) {
      this.add
        .text(DESIGN_WIDTH / 2, 150, 'Best day yet', {
          fontFamily: FONT,
          fontSize: '18px',
          color: '#ffd966',
        })
        .setOrigin(0.5);
    }

    this.honeyText = this.add
      .text(DESIGN_WIDTH / 2, 186, `${Math.floor(save.honey)} honey to spend`, {
        fontFamily: FONT,
        fontSize: '25px',
        color: COLORS.text,
      })
      .setOrigin(0.5);

    this.buildUpgrades();
    this.buildActions();
  }

  private buildUpgrades(): void {
    const { save } = this.nightData;
    const columns = 3;
    const cardWidth = 340;
    const gapX = 24;
    const gapY = 14;
    const startX = DESIGN_WIDTH / 2 - ((columns - 1) * (cardWidth + gapX)) / 2;

    UPGRADE_ORDER.forEach((id, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + column * (cardWidth + gapX);
      const y = 268 + row * (74 + gapY);

      const button = new Button(this, {
        x,
        y,
        width: cardWidth,
        label: UPGRADES[id].name,
        sublabel: this.upgradeSublabel(id),
        tint: id === 'routePersistence' ? 0xffd966 : 0x60a5fa,
        enabled: this.canAfford(id),
        onClick: () => this.buy(id),
      });

      this.buttons.push(button);
    });

    this.add
      .text(DESIGN_WIDTH / 2, 218, 'Spend honey', {
        fontFamily: FONT,
        fontSize: '17px',
        color: COLORS.dim,
      })
      .setOrigin(0.5);

    void save;
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
      const button = this.buttons[index];
      if (!button) return;
      button.setLabel(UPGRADES[id].name, this.upgradeSublabel(id));
      button.setEnabled(this.canAfford(id));
    });
  }

  private buildActions(): void {
    const { result } = this.nightData;
    const adsAvailable = !this.context.portal.isAdBlocked();
    const y = 500;

    // At most one rewarded offer per night, and only when it buys something the
    // player visibly wants right now. A near miss wants more time; a completed
    // day wants more honey.
    if (adsAvailable && result.nearMiss) {
      this.buttons.push(
        new Button(this, {
          x: DESIGN_WIDTH / 2 - 190,
          y,
          width: 350,
          label: `▶  +${TUNING.ads.extendSeconds}s to finish`,
          sublabel: 'watch a short ad',
          tint: 0x7fd1ae,
          onClick: () => void this.onRewarded('extend'),
        }),
      );
    } else if (adsAvailable && result.honey > 0) {
      this.buttons.push(
        new Button(this, {
          x: DESIGN_WIDTH / 2 - 190,
          y,
          width: 350,
          label: `▶  Double to ${Math.floor(result.honey * 2)}`,
          sublabel: 'watch a short ad',
          tint: 0xffd966,
          onClick: () => void this.onRewarded('double'),
        }),
      );
    }

    // Always present, never delayed, never dimmed. The non-ad path out.
    this.buttons.push(
      new Button(this, {
        x:
          adsAvailable && (result.nearMiss || result.honey > 0)
            ? DESIGN_WIDTH / 2 + 190
            : DESIGN_WIDTH / 2,
        y,
        width: 350,
        label: `Start day ${result.day + 1}`,
        tint: 0x4ade80,
        onClick: () => void this.onNextDay(),
      }),
    );
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
        .text(DESIGN_WIDTH / 2, 560, 'No ad available right now.', {
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
