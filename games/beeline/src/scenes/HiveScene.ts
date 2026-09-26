import type Phaser from 'phaser';
import { BaseScene, DESIGN_WIDTH, centerPlayfield, viewRect } from '@ucgames/core';
import { COLORS } from '../config/tuning.ts';
import { coerceSave, SAVE_KEY, writeSave, type BeelineSave } from '../game/SaveState.ts';
import { UPGRADES, canBuy, upgradeCost, type UpgradeDef } from '../game/HiveUpgrades.ts';
import { unlockAchievements } from '../game/Achievements.ts';
import { totalStars } from '../game/Levels.ts';
import { createItemIcons, itemTextureKey } from '../render/itemIcons.ts';
import { Button } from '../ui/Button.ts';
import { star } from '../ui/Hud.ts';
import { showAchievements } from '../ui/Toast.ts';
import { Sfx } from '../audio/Sfx.ts';

const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export interface HiveData {
  /** Scene to return to. */
  back: 'Menu' | 'Map';
  /** World the map should open on, when returning to it. */
  world?: number;
}

/**
 * The hive's skill shop: where banked honey is spent.
 *
 * Seven skills, each a few levels deep. A level costs honey; the higher ones
 * also need stars, so the top of the tree is earned by playing well, not only
 * by playing long. Buying is instant and saved at once.
 */
export class HiveScene extends BaseScene {
  private back: HiveData = { back: 'Menu' };
  private save!: BeelineSave;
  private sfx!: Sfx;
  private objects: Array<{ destroy(): void }> = [];
  private bankText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'Hive' });
  }

  init(data: HiveData): void {
    this.back = data ?? { back: 'Menu' };
  }

  protected build(): void {
    centerPlayfield(this);
    createItemIcons(this);
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.sfx = new Sfx(this);
    this.sfx.startMusic();
    this.save = coerceSave(this.context.save.get<unknown>(SAVE_KEY, null));

    const view = viewRect(this);
    const cx = DESIGN_WIDTH / 2;
    this.text('The Hive', cx, 56, 44, '#ffd23f', true);
    this.bankText = this.text('', cx, 108, 24, '#ffe38a', true);

    new Button(this, {
      x: view.x + 110,
      y: view.y + 44,
      width: 170,
      label: this.back.back === 'Map' ? '◀  Map' : '⌂  Menu',
      tint: 0x8a6a3a,
      onClick: () => this.leave(),
    });

    this.layoutCards();
  }

  private stars(): number {
    return totalStars(this.save.levelStars);
  }

  private layoutCards(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.bankText.setText(
      `${Math.floor(this.save.honeyBank).toLocaleString('en-US')} honey to spend   ·   ★ ${this.stars()}`,
    );

    const cardW = 280;
    const cardH = 250;
    const rows = [UPGRADES.slice(0, 4), UPGRADES.slice(4)];
    rows.forEach((row, r) => {
      const y = 290 + r * 275;
      const startX = DESIGN_WIDTH / 2 - ((row.length - 1) * (cardW + 16)) / 2;
      row.forEach((def, i) => this.card(def, startX + i * (cardW + 16), y, cardW, cardH));
    });
  }

  private card(def: UpgradeDef, x: number, y: number, w: number, h: number): void {
    const owned = this.save.upgrades[def.id] ?? 0;
    const check = canBuy(def, this.save.upgrades, this.save.honeyBank, this.stars());

    const g = this.add.graphics();
    g.fillStyle(0x2a2114, 0.9);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 18);
    g.lineStyle(3, owned >= def.max ? 0x8fd17a : 0xffc93c, 0.8);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 18);
    // Level pips.
    for (let i = 0; i < def.max; i += 1) {
      const px = x + (i - (def.max - 1) / 2) * 24;
      g.fillStyle(i < owned ? 0xffc93c : 0x000000, i < owned ? 1 : 0.4);
      g.fillCircle(px, y - 18, 8);
      g.lineStyle(2, 0xffc93c, 0.9);
      g.strokeCircle(px, y - 18, 8);
    }
    this.objects.push(g);

    const key = itemTextureKey(def.icon);
    if (this.textures.exists(key)) {
      this.objects.push(
        this.add.image(x - w / 2 + 38, y - h / 2 + 38, key).setScale(1.1),
      );
    }
    this.objects.push(this.text(def.name, x + 18, y - h / 2 + 38, 22, '#fff4d6', true));
    this.objects.push(this.text(`Each level: ${def.perLevel}`, x, y + 16, 16, '#e9dcc0'));

    let label: string;
    let sub: string | undefined;
    if (!check.ok && check.reason === 'max') {
      label = 'Maxed';
    } else if (!check.ok && check.reason === 'stars') {
      label = `Needs ★ ${check.stars}`;
      sub = `${check.cost.toLocaleString('en-US')} honey`;
    } else {
      label = `Buy  ${upgradeCost(def, owned).toLocaleString('en-US')}`;
      sub = `level ${owned + 1} of ${def.max}`;
    }
    if (!check.ok && check.reason === 'stars') {
      const sg = this.add.graphics();
      star(sg, x - 72, y + 72, 11, 0xffd84a);
      this.objects.push(sg);
    }
    const button = new Button(this, {
      x,
      y: y + 78,
      width: 230,
      label,
      ...(sub ? { sublabel: sub } : {}),
      tint: check.ok ? 0x3aa860 : 0x5a4a30,
      enabled: check.ok,
      onClick: () => this.buy(def),
    });
    this.objects.push(button);
  }

  private buy(def: UpgradeDef): void {
    const check = canBuy(def, this.save.upgrades, this.save.honeyBank, this.stars());
    if (!check.ok) return;
    this.save.honeyBank -= check.cost;
    this.save.upgrades[def.id] = (this.save.upgrades[def.id] ?? 0) + 1;
    const unlocked = unlockAchievements(this.save);
    writeSave(this.context.save, this.save);
    void this.context.save.flush();
    this.sfx.play('fanfare', 0.35);
    this.cameras.main.flash(140, 255, 220, 120);
    this.layoutCards();
    showAchievements(this, unlocked, 200);
  }

  private leave(): void {
    if (this.back.back === 'Map')
      this.scene.start('Map', { world: this.back.world ?? 0 });
    else this.scene.start('Menu');
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
        strokeThickness: bold ? 6 : 3,
      })
      .setOrigin(0.5);
  }
}
