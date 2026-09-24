import type Phaser from 'phaser';
import { BaseScene, DESIGN_WIDTH, centerPlayfield, viewRect } from '@ucgames/core';
import {
  LEVELS,
  LEVELS_PER_WORLD,
  WORLDS,
  isUnlocked,
  type LevelDef,
} from '../game/Levels.ts';
import { coerceSave, SAVE_KEY } from '../game/SaveState.ts';
import { Button } from '../ui/Button.ts';
import { star } from '../ui/Hud.ts';
import { TEX } from '../render/textures.ts';
import type { Sfx } from '../audio/Sfx.ts';

const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export interface LevelDoneData {
  level: LevelDef;
  honey: number;
  /** The part of `honey` that was the sunset bonus. */
  bonus: number;
  stars: number;
  /** Stars and best honey before this attempt, for "new star" and "new best". */
  prevStars: number;
  prevBest: number;
  bestCombo: number;
  /** A world finished for the first time by this level, or null. */
  worldComplete: number | null;
  sfx: Sfx;
  onRetry: () => void;
  onNext: () => void;
  onMap: () => void;
}

/** Petal colours for the confetti, from the flowers themselves. */
const PETALS = [0xe2669a, 0x9b6fd4, 0xe4573f, 0xf0b429, 0xf2f0e6, 0x4f9ede, 0xffd23f];

/**
 * The end of a level: the moment the game has to pay the player back.
 *
 * Everything here is sequenced rather than shown at once, because a result
 * that appears in one frame is read in one glance and forgotten. The stars
 * land one at a time with a rising note each; the honey counts up; a new best
 * is stamped on; petals fall. A missed level gets none of that — just the
 * score, what it needed, and Retry in the biggest button on the card.
 *
 * Interstitial ads are signalled on Next and Retry, after the player has
 * chosen to continue — never on the result itself.
 */
export class LevelDoneScene extends BaseScene {
  private done!: LevelDoneData;
  private busy = false;

  constructor() {
    super({ key: 'LevelDone' });
  }

  init(data: LevelDoneData): void {
    this.done = data;
    this.busy = false;
  }

  protected build(): void {
    centerPlayfield(this);
    const view = viewRect(this);
    const shade = this.add
      .rectangle(view.centerX, view.centerY, view.width, view.height, 0x1d160c, 0.82)
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: shade, alpha: 1, duration: 200 });

    const { level, stars, honey, bonus, prevBest, prevStars, bestCombo } = this.done;
    const cx = DESIGN_WIDTH / 2;
    const passed = stars > 0;

    this.text(
      `${level.world + 1}-${((level.id - 1) % LEVELS_PER_WORLD) + 1}  ${level.name}`,
      cx,
      58,
      20,
      '#c9b98f',
    );
    const title = this.text(
      passed ? (stars === 3 ? 'Perfect!' : 'Level complete!') : 'Not quite!',
      cx,
      104,
      50,
      passed ? '#ffe38a' : '#ff9b80',
      true,
    ).setScale(0.5);
    this.tweens.add({ targets: title, scale: 1, duration: 300, ease: 'Back.easeOut' });

    // Stars: empty sockets first, then each earned one slams in.
    const starY = 200;
    const sockets = this.add.graphics();
    for (let i = 0; i < 3; i += 1) {
      star(sockets, cx + (i - 1) * 110, starY + (i === 1 ? -14 : 0), 44, 0x3d311d);
    }
    for (let i = 0; i < stars; i += 1) {
      this.time.delayedCall(450 + i * 380, () =>
        this.slamStar(i, cx + (i - 1) * 110, starY + (i === 1 ? -14 : 0)),
      );
    }

    // The honey, counting up.
    const count = this.text('0', cx, 300, 44, '#ffd466', true);
    const tally = { value: 0 };
    this.tweens.add({
      targets: tally,
      value: honey,
      delay: 250,
      duration: 900,
      ease: 'Cubic.easeOut',
      onUpdate: () =>
        count.setText(`${Math.floor(tally.value).toLocaleString('en-US')} honey`),
    });

    const details: string[] = [];
    if (bonus > 0) details.push(`+${bonus} sunset bonus`);
    if (bestCombo > 1) details.push(`best multiplier x${bestCombo}`);
    if (details.length > 0) this.text(details.join('   ·   '), cx, 342, 18, '#e9dcc0');

    // What the next star needs, so a replay has a number to aim at.
    const [one, two, three] = level.stars;
    const next = stars === 0 ? one : stars === 1 ? two : stars === 2 ? three : 0;
    if (next > 0) {
      this.text(
        `${stars + 1} star${stars + 1 > 1 ? 's' : ''} at ${next.toLocaleString('en-US')} honey`,
        cx,
        372,
        18,
        '#c9b98f',
      );
    }

    if (prevBest > 0 && honey > prevBest)
      this.time.delayedCall(1400, () => this.stamp('NEW BEST!'));
    else if (stars > prevStars && prevStars > 0)
      this.time.delayedCall(1400, () => this.stamp('NEW STAR!'));

    if (passed) this.time.delayedCall(450 + stars * 380, () => this.confetti(stars * 30));

    this.buildButtons(passed);

    if (this.done.worldComplete !== null) {
      this.time.delayedCall(2000, () => this.worldCard(this.done.worldComplete ?? 0));
    }
  }

  private buildButtons(passed: boolean): void {
    const cx = DESIGN_WIDTH / 2;
    const y = 470;
    const nextLevel = LEVELS[this.done.level.id];
    const save = coerceSave(this.context.save.get<unknown>(SAVE_KEY, null));
    const canNext =
      passed && nextLevel !== undefined && isUnlocked(nextLevel, save.levelStars);

    new Button(this, {
      x: cx - 250,
      y,
      width: 200,
      label: 'Map',
      tint: 0x8a6a3a,
      onClick: () => this.leave('map'),
    });
    const retry = new Button(this, {
      x: canNext ? cx : cx + 120,
      y,
      width: canNext ? 200 : 300,
      label: '↻  Retry',
      tint: canNext ? 0x2f8fb8 : 0x3aa860,
      big: !canNext,
      onClick: () => void this.leave('retry'),
    });
    if (!canNext) retry.pulse();
    if (canNext) {
      new Button(this, {
        x: cx + 250,
        y,
        width: 220,
        label: 'Next  ▶',
        tint: 0x3aa860,
        big: true,
        onClick: () => void this.leave('next'),
      }).pulse();
    }
  }

  private async leave(where: 'retry' | 'next' | 'map'): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    await this.context.save.flush();
    if (where === 'map') {
      this.done.onMap();
      return;
    }
    // The player chose to keep playing: the portal decides whether an ad plays.
    await this.context.portal.commercialBreak();
    if (where === 'next') this.done.onNext();
    else this.done.onRetry();
  }

  /** One earned star arriving: big, then settling, with a rising note. */
  private slamStar(index: number, x: number, y: number): void {
    const g = this.add.graphics().setPosition(x, y);
    star(g, 0, 0, 44, 0xffd84a);
    g.setScale(2.4).setAlpha(0);
    this.tweens.add({
      targets: g,
      scale: 1,
      alpha: 1,
      duration: 260,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.cameras.main.shake(90, 0.004);
        // A ring of sparks where it lands.
        for (let i = 0; i < 10; i += 1) {
          const a = (i / 10) * Math.PI * 2;
          const spark = this.add.circle(x, y, 5, 0xffe38a);
          this.tweens.add({
            targets: spark,
            x: x + Math.cos(a) * 80,
            y: y + Math.sin(a) * 80,
            alpha: 0,
            scale: 0.3,
            duration: 420,
            ease: 'Quad.easeOut',
            onComplete: () => spark.destroy(),
          });
        }
      },
    });
    this.done.sfx.play('sparkle', 0.45, index * 300);
  }

  /** "NEW BEST!" stamped across the card at an angle. */
  private stamp(text: string): void {
    const label = this.text(text, DESIGN_WIDTH / 2 + 300, 150, 34, '#ff7a5e', true)
      .setAngle(-14)
      .setScale(2.2)
      .setAlpha(0);
    this.tweens.add({
      targets: label,
      scale: 1,
      alpha: 1,
      duration: 220,
      ease: 'Quad.easeIn',
      onComplete: () => this.cameras.main.shake(110, 0.005),
    });
    this.done.sfx.playVaried('swat', 0.5, 60);
  }

  /** Petals falling across the card. */
  private confetti(count: number): void {
    const view = viewRect(this);
    for (let i = 0; i < count; i += 1) {
      const colour = PETALS[i % PETALS.length] ?? 0xffd23f;
      const petal = this.add
        .ellipse(
          view.x + Math.random() * view.width,
          view.y - 20 - Math.random() * 200,
          12,
          7,
          colour,
        )
        .setAngle(Math.random() * 360);
      this.tweens.add({
        targets: petal,
        y: view.bottom + 30,
        x: petal.x + (Math.random() - 0.5) * 240,
        angle: petal.angle + (Math.random() - 0.5) * 720,
        duration: 1800 + Math.random() * 1600,
        ease: 'Sine.easeIn',
        onComplete: () => petal.destroy(),
      });
    }
    this.done.sfx.play('fanfare', 0.45);
  }

  /** A world finished for the first time: its own card, with the medal. */
  private worldCard(world: number): void {
    const view = viewRect(this);
    const info = WORLDS[world];
    if (!info) return;
    const layer = this.add.container(0, 0).setDepth(50);
    const blocker = this.add
      .rectangle(view.centerX, view.centerY, view.width, view.height, 0x120d06, 0.9)
      .setInteractive();
    layer.add(blocker);

    if (this.textures.exists(TEX.medal)) {
      const medal = this.add.image(DESIGN_WIDTH / 2, 230, TEX.medal).setScale(0.2);
      layer.add(medal);
      this.tweens.add({
        targets: medal,
        scale: 1.2,
        duration: 500,
        ease: 'Back.easeOut',
      });
      this.tweens.add({
        targets: medal,
        angle: { from: -6, to: 6 },
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    layer.add(
      this.text(`${info.name} complete!`, DESIGN_WIDTH / 2, 420, 44, '#ffe38a', true),
    );
    const nextWorld = WORLDS[world + 1];
    layer.add(
      this.text(
        nextWorld
          ? `Next: ${nextWorld.name} — opens at ${nextWorld.starsToOpen} ★`
          : 'You filled the whole honeycomb. The hive is proud of you.',
        DESIGN_WIDTH / 2,
        470,
        20,
        '#e9dcc0',
      ),
    );
    this.confetti(90);

    const close = new Button(this, {
      x: DESIGN_WIDTH / 2,
      y: 560,
      width: 260,
      label: 'Wonderful!',
      tint: 0x3aa860,
      big: true,
      onClick: () => {
        layer.destroy();
        close.destroy();
      },
    }).setDepth(60);
  }

  private text(
    value: string,
    x: number,
    y: number,
    size: number,
    colour: string,
    bold = false,
  ): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, value, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: bold ? 'bold' : 'normal',
        color: colour,
        align: 'center',
        stroke: '#1d160c',
        strokeThickness: bold ? 8 : 0,
      })
      .setOrigin(0.5);
  }
}
