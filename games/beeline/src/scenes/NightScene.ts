import Phaser from 'phaser';
import { BaseScene, DESIGN_WIDTH, centerPlayfield, viewRect } from '@ucgames/core';
import { TUNING } from '../config/tuning.ts';
import { forecastFor, type DayResult } from '../game/DayCycle.ts';
import { ITEMS, inventoryLines, type ItemId, type Rarity } from '../game/Items.ts';
import type { BeelineSave } from '../game/SaveState.ts';
import type { AchievementDef } from '../game/Achievements.ts';
import { showAchievements } from '../ui/Toast.ts';
import { Button } from '../ui/Button.ts';
import { star } from '../ui/Hud.ts';
import { itemTextureKey } from '../render/itemIcons.ts';
import type { Sfx } from '../audio/Sfx.ts';

// Nunito first, system stack behind it. The subset is deliberately small, so a
// glyph it lacks — the play triangle — is drawn by the next family along.
const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const RARITY_TINT: Record<Rarity, number> = {
  common: 0x9bc4e2,
  rare: 0xc084fc,
  epic: 0xffb443,
};
const RARITY_NAME: Record<Rarity, string> = {
  common: 'common',
  rare: 'rare',
  epic: 'epic',
};

export interface NightData {
  /** Null when resuming a draft from a reload, with no day just played. */
  result: DayResult | null;
  save: BeelineSave;
  sfx: Sfx;
  /** Resumes the same board with extra seconds. */
  onExtend: () => void;
  /** Starts the day the save says is next. */
  onNextDay: () => void;
  /** Closes a failed run: banks the score and starts the save over. */
  onRunOver: () => void;
  /** Persists after any change made here. */
  onChanged: () => void;
  /** Achievements the day just played unlocked. */
  achievements?: AchievementDef[];
}

/**
 * Between days: the result, then one pick from three.
 *
 * This replaces a night screen with ten buttons, two currencies' worth of
 * arithmetic and a reroll — a spreadsheet the player had to get through
 * between every forty-second day. The draft asks one question with one tap
 * and puts the player straight back in the meadow.
 *
 * Both ad placements live here because both sit at the seam between days, which
 * is the only place an interruption is not interrupting anything:
 *
 *  - **Interstitial** fires after the pick, or on Play Again — after the
 *    player has shown intent to continue, never on the death moment. It fires
 *    on every day boundary; the portal decides whether an ad actually plays.
 *  - **Rewarded** is always opt-in: extra daylight to rescue a day that was
 *    missed by a little. Never offered when ads are blocked.
 */
export class NightScene extends BaseScene {
  private nightData!: NightData;
  private busy = false;
  private rewardTaken = false;
  private cards: Phaser.GameObjects.Container[] = [];

  constructor() {
    super({ key: 'Night' });
  }

  init(data: NightData): void {
    this.nightData = data;
    this.busy = false;
    this.rewardTaken = false;
    this.cards = [];
  }

  protected build(): void {
    showAchievements(this, this.nightData.achievements ?? [], 900);
    const { result, save } = this.nightData;
    centerPlayfield(this);

    // A dark wash over the paused meadow rather than an opaque page: the day
    // the player just played is still there behind the result.
    const view = viewRect(this);
    const shade = this.add
      .rectangle(view.centerX, view.centerY, view.width, view.height, 0x1d160c, 0.8)
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: shade, alpha: 1, duration: 220 });

    if (!result) {
      this.title(`Day ${save.day - 1} complete`, '#ffe38a', 80);
      this.buildDraft(300);
      return;
    }

    if (result.outcome === 'met') this.buildWin(result);
    else this.buildLoss(result);
  }

  // ---------------------------------------------------------------- winning

  private buildWin(result: DayResult): void {
    const { save } = this.nightData;
    this.title(`Day ${result.day} complete!`, '#ffe38a', 66);

    // Three stars, lit one after another with a rising note each.
    const g = this.add.graphics();
    const cx = DESIGN_WIDTH / 2;
    for (let i = 0; i < 3; i += 1) {
      const x = cx + (i - 1) * 74;
      const y = i === 1 ? 138 : 150;
      star(g, x, y, 30, 0x4a3d24);
      if (i < result.stars) {
        this.time.delayedCall(260 + i * 260, () => {
          const lit = this.add.graphics();
          star(lit, 0, 0, 30, 0xffd84a);
          lit.setPosition(x, y).setScale(0.2);
          this.tweens.add({
            targets: lit,
            scale: 1,
            duration: 260,
            ease: 'Back.easeOut',
          });
          this.nightData.sfx.playNote('collect', 0.35);
        });
      }
    }

    const bonus = result.bonus > 0 ? `  (incl. +${result.bonus} sunset bonus)` : '';
    this.line(`${result.score} honey · goal ${result.quota}${bonus}`, 204, '#fff4d6', 22);
    this.line(
      `Run total ${Math.floor(save.runScore).toLocaleString('en-US')}`,
      234,
      '#c9b98f',
      18,
    );

    this.buildDraft(290);
  }

  private buildDraft(top: number): void {
    const { save } = this.nightData;
    const offer = save.offer.length > 0 ? save.offer : [];

    this.line('Pick one for your hive', top, '#fff4d6', 26);

    const width = 290;
    const gap = 26;
    const startX = DESIGN_WIDTH / 2 - (offer.length - 1) * ((width + gap) / 2);
    offer.forEach((id, index) => {
      const card = this.card(id, startX + index * (width + gap), top + 150, width);
      card.setAlpha(0).setScale(0.8);
      this.tweens.add({
        targets: card,
        alpha: 1,
        scale: 1,
        delay: 500 + index * 110,
        duration: 260,
        ease: 'Back.easeOut',
      });
      this.cards.push(card);
    });

    const tomorrow = forecastFor(save.day).join(' · ');
    this.line(`Tomorrow, day ${save.day}: ${tomorrow}`, top + 300, '#c9b98f', 18);

    const carried = inventoryLines(save.items);
    if (carried.length > 0) {
      this.line(
        `Your hive: ${carried.join(', ')}`,
        top + 330,
        '#9f9272',
        16,
      ).setWordWrapWidth(1100);
    }

    if (offer.length === 0) {
      new Button(this, {
        x: DESIGN_WIDTH / 2,
        y: top + 400,
        width: 360,
        label: `Start day ${save.day}`,
        tint: 0x3aa860,
        big: true,
        onClick: () => void this.onNextDay(),
      });
    }
  }

  /** One draft card: icon, name, what it does, and how rare it is. */
  private card(
    id: ItemId,
    x: number,
    y: number,
    width: number,
  ): Phaser.GameObjects.Container {
    const info = ITEMS[id];
    const tint = RARITY_TINT[info.rarity];
    const height = 200;
    const c = this.add.container(x, y);

    const g = this.add.graphics();
    const draw = (hover: boolean): void => {
      g.clear();
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(-width / 2 + 4, -height / 2 + 8, width, height, 22);
      g.fillStyle(hover ? 0x4a3a20 : 0x3a2d18, 1);
      g.fillRoundedRect(-width / 2, -height / 2, width, height, 22);
      g.lineStyle(hover ? 5 : 3, tint, 1);
      g.strokeRoundedRect(-width / 2, -height / 2, width, height, 22);
    };
    draw(false);
    c.add(g);

    const key = itemTextureKey(id);
    if (this.textures.exists(key)) {
      c.add(this.add.image(0, -48, key).setDisplaySize(62, 62));
    }
    c.add(
      this.add
        .text(0, 8, info.name, {
          fontFamily: FONT,
          fontSize: '25px',
          fontStyle: 'bold',
          color: '#fff4d6',
        })
        .setOrigin(0.5),
    );
    c.add(
      this.add
        .text(0, 44, info.effect, {
          fontFamily: FONT,
          fontSize: '19px',
          color: '#e9dcc0',
          align: 'center',
          wordWrap: { width: width - 30 },
        })
        .setOrigin(0.5),
    );
    c.add(
      this.add
        .text(0, 80, RARITY_NAME[info.rarity].toUpperCase(), {
          fontFamily: FONT,
          fontSize: '13px',
          fontStyle: 'bold',
          color: `#${tint.toString(16).padStart(6, '0')}`,
        })
        .setOrigin(0.5),
    );

    const zone = this.add
      .zone(0, 0, width, height)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    c.add(zone);
    zone.on(Phaser.Input.Events.POINTER_OVER, () => {
      draw(true);
      this.tweens.add({ targets: c, scale: 1.04, duration: 100 });
    });
    zone.on(Phaser.Input.Events.POINTER_OUT, () => {
      draw(false);
      this.tweens.add({ targets: c, scale: 1, duration: 100 });
    });
    zone.on(Phaser.Input.Events.POINTER_UP, () => this.pick(id, c));
    return c;
  }

  private pick(id: ItemId, chosen: Phaser.GameObjects.Container): void {
    if (this.busy) return;
    this.busy = true;
    const { save } = this.nightData;
    save.items.push(id);
    save.offer = [];
    this.nightData.onChanged();
    this.nightData.sfx.play('upgrade', 0.5);

    for (const card of this.cards) {
      if (card === chosen) {
        this.tweens.add({
          targets: card,
          scale: 1.15,
          y: card.y - 20,
          duration: 260,
          ease: 'Back.easeOut',
        });
      } else {
        this.tweens.add({ targets: card, alpha: 0, scale: 0.85, duration: 200 });
      }
    }
    this.time.delayedCall(650, () => {
      this.busy = false;
      void this.onNextDay();
    });
  }

  // ---------------------------------------------------------------- losing

  private buildLoss(result: DayResult): void {
    const { save } = this.nightData;
    const adsAvailable = !this.context.portal.isAdBlocked();
    const cx = DESIGN_WIDTH / 2;

    this.title('Out of daylight', '#ff9b80', 96);
    this.line(`${result.score} of ${result.quota} honey needed`, 150, '#fff4d6', 24);

    // The run's result, and whether it beat the record. Computed here rather
    // than after closing the run so the "new best" can be said while it is
    // still true that it is new.
    const runScore = Math.floor(save.runScore);
    const best = Math.max(save.bestScore, runScore);
    const isBest = runScore > save.bestScore && runScore > 0;
    this.line(
      `Run reached day ${result.day} · ${runScore.toLocaleString('en-US')} honey`,
      240,
      '#ffe38a',
      30,
    );
    if (isBest || best > 0) {
      this.line(
        isBest ? 'New best run!' : `Best run: ${best.toLocaleString('en-US')} honey`,
        282,
        isBest ? '#9ff0a8' : '#c9b98f',
        20,
      );
    }

    let y = 380;
    if (adsAvailable && result.nearMiss && !this.rewardTaken) {
      new Button(this, {
        x: cx,
        y,
        width: 420,
        label: `▶  +${TUNING.ads.extendSeconds}s to finish the day`,
        sublabel: 'watch a short ad',
        tint: 0x2f8fb8,
        onClick: () => void this.onRewarded(),
      });
      y += 110;
    }

    // Always present, never delayed, never dimmed. The non-ad path out, and
    // the moment the game most needs to be one tap from another go.
    new Button(this, {
      x: cx,
      y,
      width: 360,
      label: 'Play again',
      tint: 0x3aa860,
      big: true,
      onClick: () => void this.onPlayAgain(),
    }).pulse();
  }

  // ---------------------------------------------------------------- helpers

  private title(text: string, colour: string, y: number): void {
    const t = this.add
      .text(DESIGN_WIDTH / 2, y, text, {
        fontFamily: FONT,
        fontSize: '48px',
        fontStyle: 'bold',
        color: colour,
        stroke: '#1d160c',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 320, ease: 'Back.easeOut' });
  }

  private line(
    text: string,
    y: number,
    colour: string,
    size: number,
  ): Phaser.GameObjects.Text {
    return this.add
      .text(DESIGN_WIDTH / 2, y, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color: colour,
        align: 'center',
      })
      .setOrigin(0.5);
  }

  private async onRewarded(): Promise<void> {
    if (this.busy || this.rewardTaken) return;
    this.busy = true;

    await this.context.save.flush();
    const earned = await this.context.portal.rewardedBreak();

    if (!earned) {
      // Never punish a failed ad. Say so plainly and leave everything intact.
      this.busy = false;
      this.line('No ad available right now.', 330, '#c9b98f', 18);
      return;
    }

    this.rewardTaken = true;
    this.nightData.onExtend();
  }

  private async onPlayAgain(): Promise<void> {
    if (this.busy) return;
    this.nightData.onRunOver();
    await this.onNextDay();
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
