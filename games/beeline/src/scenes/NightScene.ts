import type Phaser from 'phaser';
import { BaseScene, DESIGN_WIDTH, centerPlayfield, viewRect } from '@ucgames/core';
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
  ITEMS,
  inventoryLines,
  itemCost,
  rerollCost,
  rollOffer,
  type ItemId,
  type Rarity,
} from '../game/Items.ts';
import type { BeelineSave } from '../game/SaveState.ts';
import { Button } from '../ui/Button.ts';
import { itemTextureKey } from '../render/itemIcons.ts';
import type { Sfx } from '../audio/Sfx.ts';

// Nunito first, system stack behind it. The fallback is load-bearing twice
// over: the face may not have arrived (see main.ts), and the subset is
// deliberately small, so a glyph it lacks — the play triangle, the arrow — is
// drawn by the next family along.
const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Rarity read as colour, which is the only way four cards can be compared at a
 * glance on a screen the player is trying to get through quickly.
 */
const RARITY_TINT: Record<Rarity, number> = {
  common: 0x9bb4c9,
  rare: 0xc084fc,
  epic: 0xffb443,
};

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
  /** Kept separate from the shop row so refreshing one cannot index into the other. */
  private upgradeButtons: Button[] = [];
  private itemButtons: Button[] = [];
  private rerollButton: Button | null = null;
  private inventoryText!: Phaser.GameObjects.Text;
  private offered: ItemId[] = [];
  private moneyText!: Phaser.GameObjects.Text;
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
    this.itemButtons = [];
    this.rerollButton = null;
    this.offered = [];
  }

  /** The day the player is about to start. Day 1 again after a failed run. */
  private get nextDay(): number {
    return this.nightData.save.day;
  }

  protected build(): void {
    const { result, save } = this.nightData;

    // Same trick as the gameplay scene: centre the 1280x720 layout inside a
    // canvas that matches the device, so every position below stays authored
    // against the design size.
    centerPlayfield(this);

    // The backdrop covers the *canvas*, not the playfield. Sized to the design
    // rect it would leave the extra area unpainted and the paused board would
    // show through around the edges of the night screen.
    const view = viewRect(this);
    this.add
      .rectangle(view.centerX, view.centerY, view.width, view.height, 0xf6f3e2, 0.97)
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
          ? `${Math.floor(result.money)} coin — target ${result.quota} met`
          : `${Math.floor(result.money)} of ${result.quota} needed — run ended on day ${result.day}`,
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

    this.moneyText = this.add
      .text(DESIGN_WIDTH / 2, 178, `${Math.floor(save.money)} coin to spend`, {
        fontFamily: FONT,
        fontSize: '25px',
        color: COLORS.text,
      })
      .setOrigin(0.5);

    this.buildUpgrades();
    this.buildForecast();
    this.buildShop();
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
      .text(DESIGN_WIDTH / 2, 198, 'Permanent — spend coin', {
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
   * It earns its place twice over now that the shop is random. Buying smoke is
   * a coin flip unless the player can see there are wasps tomorrow, and shears
   * are wasted honey on a day with no brambles. The forecast turns the row from
   * a gamble into a read, which is the difference between a purchase the player
   * regrets and one they feel clever about.
   */
  private buildForecast(): void {
    const day = this.nextDay;
    const parts = forecastFor(day);

    this.add
      .text(DESIGN_WIDTH / 2, 392, `Tomorrow · Day ${day} · quota ${dayQuota(day)}`, {
        fontFamily: FONT,
        fontSize: '20px',
        color: COLORS.text,
      })
      .setOrigin(0.5);

    const ahead = nextUnlock(day);
    const trailer = ahead ? `      ·      day ${ahead.day}: ${ahead.what}` : '';

    this.add
      .text(DESIGN_WIDTH / 2, 418, parts.join('  ·  ') + trailer, {
        fontFamily: FONT,
        fontSize: '17px',
        color: COLORS.dim,
      })
      .setOrigin(0.5);
  }

  /**
   * The shop: four random items, a reroll, and everything the run has bought.
   *
   * The provision shelf it replaces offered the same five things every night
   * and threw the purchase away at dusk, which is exactly why the playtest said
   * spending honey "don't feel like it adds much value". Nothing accumulated,
   * so nothing was ever being built.
   *
   * Random offers make each night a fresh question, stacking makes a purchase
   * permanent for the run, and the reroll is the release valve for a table with
   * nothing on it — priced to double each time, so it is an escape hatch and
   * not a way to fish the pool for the one item you wanted.
   */
  private buildShop(): void {
    const save = this.nightData.save;
    if (save.offer.length === 0) {
      save.offer = rollOffer(this.nextDay, featuresForDay(this.nextDay));
      this.nightData.onChanged();
    }
    this.offered = save.offer;

    this.add
      .text(DESIGN_WIDTH / 2 - 150, 460, 'Tonight\u2019s wares — kept for the run', {
        fontFamily: FONT,
        fontSize: '17px',
        color: COLORS.dim,
      })
      .setOrigin(0.5);

    // Deliberately a single-line button. With a sublabel it is 74 units tall,
    // which is exactly enough to collide with the row of cards below it.
    this.rerollButton = new Button(this, {
      x: DESIGN_WIDTH / 2 + 200,
      y: 460,
      width: 230,
      label: `Reroll · ${rerollCost(this.nextDay, save.rerolls)}`,
      tint: 0xf0a04b,
      enabled: this.canReroll(),
      onClick: () => this.reroll(),
    });

    const cardWidth = 288;
    const gapX = 10;
    const startX =
      DESIGN_WIDTH / 2 - ((this.offered.length - 1) * (cardWidth + gapX)) / 2;

    this.offered.forEach((id, index) => {
      this.itemButtons.push(
        new Button(this, {
          x: startX + index * (cardWidth + gapX),
          y: 528,
          width: cardWidth,
          label: ITEMS[id].name,
          sublabel: this.itemSublabel(id),
          tint: RARITY_TINT[ITEMS[id].rarity],
          icon: itemTextureKey(id),
          enabled: this.canBuyItem(id),
          onClick: () => this.buyItem(id),
        }),
      );
    });

    this.inventoryText = this.add
      .text(DESIGN_WIDTH / 2, 574, this.inventorySummary(), {
        fontFamily: FONT,
        fontSize: '15px',
        color: COLORS.dim,
        align: 'center',
      })
      .setOrigin(0.5, 0);
  }

  /**
   * The run so far, on one line.
   *
   * Without it the items are invisible the moment they are bought, and an
   * effect the player cannot see is an effect they will not believe in — which
   * was half of what was wrong with the provisions.
   */
  private inventorySummary(): string {
    const lines = inventoryLines(this.nightData.save.items);
    if (lines.length === 0) return 'Carrying nothing yet';

    // Kept to one line on purpose. Wrapping a long late-run inventory pushes it
    // straight into the buttons below, and this is a reminder of what the run
    // is rather than an inventory screen.
    const text = `Carrying: ${lines.join('  ·  ')}`;
    return text.length > 118 ? `${text.slice(0, 115)}…` : text;
  }

  private itemSublabel(id: ItemId): string {
    return `${ITEMS[id].effect}  ·  ${itemCost(id, this.nextDay)}`;
  }

  private canBuyItem(id: ItemId): boolean {
    return this.nightData.save.money >= itemCost(id, this.nextDay);
  }

  private canReroll(): boolean {
    const save = this.nightData.save;
    return save.money >= rerollCost(this.nextDay, save.rerolls);
  }

  private buyItem(id: ItemId): void {
    if (this.busy || !this.canBuyItem(id)) return;
    const { save, sfx } = this.nightData;

    save.money -= itemCost(id, this.nextDay);
    save.items.push(id);
    // The card goes, the row does not refill. Buying is meant to cost you the
    // rest of the table's attention, not open a slot.
    save.offer = save.offer.filter((offered) => offered !== id);
    sfx.play('upgrade', 0.4);

    this.nightData.onChanged();
    this.rebuildShop();
  }

  private reroll(): void {
    if (this.busy || !this.canReroll()) return;
    const { save, sfx } = this.nightData;

    save.money -= rerollCost(this.nextDay, save.rerolls);
    save.rerolls += 1;
    save.offer = rollOffer(this.nextDay, featuresForDay(this.nextDay));
    sfx.play('draw', 0.3);

    this.nightData.onChanged();
    this.rebuildShop();
  }

  /**
   * Tears the row down and lays it out again.
   *
   * Rebuilt rather than relabelled because the number of cards changes — a
   * bought item leaves the table — and a stale button pooled against a shorter
   * offer list is how a shop starts selling the wrong thing.
   */
  private rebuildShop(): void {
    for (const button of this.itemButtons) button.destroy();
    this.itemButtons = [];
    this.rerollButton?.destroy();
    this.rerollButton = null;

    const save = this.nightData.save;
    const cardWidth = 288;
    const gapX = 10;
    const startX = DESIGN_WIDTH / 2 - ((save.offer.length - 1) * (cardWidth + gapX)) / 2;

    this.offered = save.offer;
    this.offered.forEach((id, index) => {
      this.itemButtons.push(
        new Button(this, {
          x: startX + index * (cardWidth + gapX),
          y: 528,
          width: cardWidth,
          label: ITEMS[id].name,
          sublabel: this.itemSublabel(id),
          tint: RARITY_TINT[ITEMS[id].rarity],
          icon: itemTextureKey(id),
          enabled: this.canBuyItem(id),
          onClick: () => this.buyItem(id),
        }),
      );
    });

    // Deliberately a single-line button. With a sublabel it is 74 units tall,
    // which is exactly enough to collide with the row of cards below it.
    this.rerollButton = new Button(this, {
      x: DESIGN_WIDTH / 2 + 200,
      y: 460,
      width: 230,
      label: `Reroll · ${rerollCost(this.nextDay, save.rerolls)}`,
      tint: 0xf0a04b,
      enabled: this.canReroll(),
      onClick: () => this.reroll(),
    });

    this.inventoryText.setText(this.inventorySummary());
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
    const { levels, money } = this.nightData.save;
    const cost = upgradeCost(id, levels[id]);
    return cost !== null && money >= cost;
  }

  private buy(id: UpgradeId): void {
    const { save, sfx } = this.nightData;
    const level = save.levels[id];
    const cost = upgradeCost(id, level);
    if (cost === null || save.money < cost) return;

    save.money -= cost;
    save.levels[id] = Math.min(level + 1, maxLevel(id));
    sfx.play('upgrade', 0.4);

    this.nightData.onChanged();
    this.refresh();
  }

  private refresh(): void {
    this.moneyText.setText(`${Math.floor(this.nightData.save.money)} coin to spend`);

    UPGRADE_ORDER.forEach((id, index) => {
      const button = this.upgradeButtons[index];
      if (!button) return;
      button.setLabel(UPGRADES[id].name, this.upgradeSublabel(id));
      button.setEnabled(this.canAfford(id));
    });

    this.offered.forEach((id, index) => {
      const button = this.itemButtons[index];
      if (!button) return;
      button.setEnabled(this.canBuyItem(id));
    });
    this.rerollButton?.setEnabled(this.canReroll());
  }

  private buildActions(): void {
    const { result } = this.nightData;
    const adsAvailable = !this.context.portal.isAdBlocked();
    const y = 620;

    // At most one rewarded offer per night, and only when it buys something the
    // player visibly wants right now. A near miss wants more time; a completed
    // day wants more honey.
    const offering = adsAvailable && (result.nearMiss || result.money > 0);

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
    } else if (adsAvailable && result.money > 0) {
      new Button(this, {
        x: DESIGN_WIDTH / 2 - 190,
        y,
        width: 350,
        label: `▶  Double to ${Math.floor(result.money * 2)}`,
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
      const bonus = Math.floor(this.nightData.result.money);
      this.nightData.save.money += bonus;
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
