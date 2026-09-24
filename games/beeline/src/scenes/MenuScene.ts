import type Phaser from 'phaser';
import {
  BaseScene,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  centerPlayfield,
  viewRect,
} from '@ucgames/core';
import { COLORS } from '../config/tuning.ts';
import { Button } from '../ui/Button.ts';
import {
  coerceSave,
  newSave,
  writeSave,
  SAVE_KEY,
  type BeelineSave,
} from '../game/SaveState.ts';
import {
  createGeneratedTextures,
  FLAP_FRAMES,
  FLOWER_TEX,
  loadShippedTextures,
  TEX,
} from '../render/textures.ts';

// Nunito first, system stack behind it. The subset is deliberately small, so a
// glyph it lacks — the play triangle — is drawn by the next family along.
const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const HIVE = { x: 300, y: 470 };
const TARGET = { x: 980, y: 540 };

/**
 * The title screen: the game playing itself behind one big button.
 *
 * A hive, a meadow, a beeline drawn to a flower and bees streaming along it.
 * The screen teaches the verb before the first tap — "a line from the hive to
 * a flower, and bees fly it" — which is the only instruction the game needs.
 *
 * One obvious action. A returning player's first tap continues their run;
 * "New run" sits beside it, two taps deep, because wiping a run by mis-tapping
 * a menu would be unforgivable.
 */
export class MenuScene extends BaseScene {
  private save!: BeelineSave;
  private bees: Array<{
    sprite: Phaser.GameObjects.Image;
    s: number;
    speed: number;
    lane: number;
  }> = [];
  private lineGfx!: Phaser.GameObjects.Graphics;
  private ready = false;

  constructor() {
    super({ key: 'Menu' });
  }

  preload(): void {
    createGeneratedTextures(this);
    loadShippedTextures(this);
    this.load.on('loaderror', (file: { key: string }) => {
      console.warn(`[beeline] optional asset "${file.key}" failed to load.`);
    });
  }

  protected build(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    centerPlayfield(this);
    this.bees = [];
    this.ready = false;

    const view = viewRect(this);
    if (this.textures.exists(TEX.meadow)) {
      this.add
        .tileSprite(view.x, view.y, view.width, view.height, TEX.meadow)
        .setOrigin(0, 0);
    }
    // A warm vignette so the title reads over the grass.
    this.add
      .rectangle(view.centerX, view.centerY, view.width, view.height, 0x2a1d08, 0.18)
      .setOrigin(0.5);

    this.buildScenery();
    void this.bootstrap();
  }

  /** The hive, a few flowers, and the demonstration line with its bees. */
  private buildScenery(): void {
    const flowers = [
      { x: TARGET.x, y: TARGET.y, s: 1.25 },
      { x: 760, y: 640, s: 0.8 },
      { x: 1140, y: 380, s: 0.9 },
      { x: 560, y: 660, s: 0.7 },
      { x: 110, y: 640, s: 0.75 },
    ];
    flowers.forEach((f, i) => {
      const key = FLOWER_TEX[i % FLOWER_TEX.length] ?? FLOWER_TEX[0];
      if (!key || !this.textures.exists(key)) return;
      const img = this.add.image(f.x, f.y, key).setScale(f.s * 0.9);
      this.tweens.add({
        targets: img,
        angle: { from: -5, to: 5 },
        duration: 1600 + i * 230,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });

    this.lineGfx = this.add.graphics();

    if (this.textures.exists(TEX.hive)) {
      const hive = this.add
        .image(HIVE.x, HIVE.y, TEX.hive)
        .setScale(1.3)
        .setOrigin(0.5, 0.62);
      this.tweens.add({
        targets: hive,
        scaleX: 1.34,
        scaleY: 1.26,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    const key = this.textures.exists(TEX.beeFlap) ? TEX.beeFlap : TEX.beeDrawn;
    for (let i = 0; i < 14; i += 1) {
      this.bees.push({
        sprite: this.add.image(HIVE.x, HIVE.y, key).setScale(0.42),
        s: i / 14,
        speed: 0.16 + Math.random() * 0.05,
        lane: (Math.random() - 0.5) * 22,
      });
    }
  }

  private async bootstrap(): Promise<void> {
    try {
      await this.context.save.load();
    } catch (error) {
      console.warn('[beeline] Could not read save; starting fresh.', error);
    }
    this.save = coerceSave(this.context.save.get<unknown>(SAVE_KEY, null));
    this.layoutMenu();
    this.ready = true;
  }

  private layoutMenu(): void {
    const cx = DESIGN_WIDTH / 2;

    const title = this.add
      .text(cx, 128, 'Beeline', {
        fontFamily: FONT,
        fontSize: '104px',
        fontStyle: 'bold',
        color: '#ffd23f',
        stroke: '#3a2708',
        strokeThickness: 14,
      })
      .setOrigin(0.5)
      .setScale(0.3);
    this.tweens.add({ targets: title, scale: 1, duration: 520, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: title,
      y: 136,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 520,
    });

    this.add
      .text(cx, 214, 'Drag lines from the hive. Feed the swarm.', {
        fontFamily: FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#fff4d6',
        stroke: '#2a1d08',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    const resuming = this.save.day > 1;

    new Button(this, {
      x: cx,
      y: 318,
      width: 380,
      label: resuming ? `▶  Continue — day ${this.save.day}` : '▶  Play',
      tint: 0x3aa860,
      big: true,
      onClick: () => this.start(),
    }).pulse();

    if (resuming) {
      new Button(this, {
        x: cx,
        y: 406,
        width: 260,
        label: 'New run',
        tint: 0xb8742a,
        onClick: () => this.confirmReset(),
      });
    }

    if (this.save.bestScore > 0 || this.save.bestRunDay > 0) {
      this.add
        .text(
          cx,
          resuming ? 468 : 400,
          `Best run: ${Math.floor(this.save.bestScore).toLocaleString('en-US')} honey · day ${Math.max(1, this.save.bestRunDay)}`,
          {
            fontFamily: FONT,
            fontSize: '20px',
            fontStyle: 'bold',
            color: '#ffe38a',
            stroke: '#2a1d08',
            strokeThickness: 5,
          },
        )
        .setOrigin(0.5);
    }
  }

  override update(time: number, delta: number): void {
    super.update(time, delta);
    const dt = delta / 1000;

    // The demonstration beeline, drawing itself out and holding.
    const g = this.lineGfx;
    if (!g) return;
    g.clear();
    const grow = Math.min(1, (time % 9000) / 1400);
    const ex = HIVE.x + (TARGET.x - HIVE.x) * grow;
    const ey = HIVE.y + (TARGET.y - HIVE.y) * grow;
    g.lineStyle(14, 0x2a1d08, 0.2);
    g.lineBetween(HIVE.x, HIVE.y, ex, ey);
    g.lineStyle(7, 0xffc94a, 0.95);
    g.lineBetween(HIVE.x, HIVE.y, ex, ey);

    const dx = TARGET.x - HIVE.x;
    const dy = TARGET.y - HIVE.y;
    const len = Math.hypot(dx, dy);
    for (const [i, bee] of this.bees.entries()) {
      bee.s = (bee.s + dt * bee.speed) % 2;
      // Out along the line and back: 0..1 outbound, 1..2 home.
      const t = bee.s < 1 ? bee.s : 2 - bee.s;
      const along = Math.min(t, grow);
      const wobble = Math.sin((along * len) / 60 + i) * 8 + bee.lane;
      const x = HIVE.x + dx * along - (dy / len) * wobble;
      const y = HIVE.y + dy * along + (dx / len) * wobble;
      bee.sprite.setPosition(x, y);
      bee.sprite.setFlipX(bee.s >= 1);
      if (bee.sprite.texture.key === TEX.beeFlap) {
        bee.sprite.setFrame(Math.floor(time / 38 + i * 1.7) % FLAP_FRAMES);
      }
    }
  }

  /**
   * Second tap before anything is destroyed.
   *
   * Replaces the menu in place rather than opening a dialog: a modal here
   * would need its own backdrop, its own dismissal and its own hit-testing, and
   * all of that to ask one question.
   */
  private confirmReset(): void {
    const cx = DESIGN_WIDTH / 2;
    const shade = this.add
      .rectangle(
        cx,
        DESIGN_HEIGHT / 2,
        DESIGN_WIDTH * 2,
        DESIGN_HEIGHT * 2,
        0x1d160c,
        0.7,
      )
      .setInteractive();
    const warning = this.add
      .text(cx, 300, 'Start a new run?\nThis run will be lost.', {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#fff4d6',
        align: 'center',
      })
      .setOrigin(0.5);

    const yes = new Button(this, {
      x: cx - 150,
      y: 420,
      width: 260,
      label: 'New run',
      tint: 0xc0472c,
      onClick: () => {
        const fresh = newSave();
        fresh.bestScore = this.save.bestScore;
        fresh.bestRunDay = this.save.bestRunDay;
        fresh.tutorialDone = this.save.tutorialDone;
        writeSave(this.context.save, fresh);
        void this.context.save.flush();
        this.scene.start('Game');
      },
    });
    const no = new Button(this, {
      x: cx + 150,
      y: 420,
      width: 260,
      label: 'Keep playing',
      tint: 0x2b6ca8,
      onClick: () => {
        shade.destroy();
        warning.destroy();
        yes.destroy();
        no.destroy();
      },
    });
  }

  private start(): void {
    if (!this.ready) return;
    this.scene.start('Game');
  }
}
