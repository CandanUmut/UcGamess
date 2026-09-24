import type Phaser from 'phaser';
import { BaseScene, DESIGN_WIDTH, centerPlayfield, viewRect } from '@ucgames/core';
import { COLORS } from '../config/tuning.ts';
import {
  LEVELS,
  LEVELS_PER_WORLD,
  WORLDS,
  isUnlocked,
  totalStars,
  type LevelDef,
} from '../game/Levels.ts';
import { coerceSave, SAVE_KEY, type BeelineSave } from '../game/SaveState.ts';
import { Button } from '../ui/Button.ts';
import { star } from '../ui/Hud.ts';
import { FLAP_FRAMES, TEX } from '../render/textures.ts';
import { Sfx } from '../audio/Sfx.ts';

const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Hex size, in design units: pointy-topped, this far from centre to corner. */
const R = 64;
const HEX_W = Math.sqrt(3) * R;
const CENTRE_Y = 420;

/**
 * Where each of a world's ten cells sits, as offsets from the comb's centre:
 * rows of three, four and three, read left to right, top to bottom.
 */
const CELL_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1.5],
  [0, -1.5],
  [1, -1.5],
  [-1.5, 0],
  [-0.5, 0],
  [0.5, 0],
  [1.5, 0],
  [-1, 1.5],
  [0, 1.5],
  [1, 1.5],
];

export interface MapStart {
  world?: number;
}

/**
 * The honeycomb: the campaign's map, and its whole sense of progress.
 *
 * Each level is a cell, and a cell fills with honey by thirds as its stars are
 * earned — so the thing a completionist works toward is a picture, not a
 * number: a comb going from empty wax to gold. The world's cells are laid out
 * as a real comb (three, four, three) rather than a path, because a comb is
 * what the player is building.
 */
export class MapScene extends BaseScene {
  private save!: BeelineSave;
  private world = 0;
  private layer: Phaser.GameObjects.Container | null = null;
  private buttons: Button[] = [];
  private cellGfx: Phaser.GameObjects.Graphics | null = null;
  private current: LevelDef | null = null;
  private bees: Array<{
    sprite: Phaser.GameObjects.Image;
    phase: number;
    speed: number;
  }> = [];

  constructor() {
    super({ key: 'Map' });
  }

  init(data: MapStart | undefined): void {
    this.world = data?.world ?? -1;
  }

  protected build(): void {
    centerPlayfield(this);
    this.cameras.main.setBackgroundColor(COLORS.background);
    const view = viewRect(this);
    if (this.textures.exists(TEX.meadow)) {
      this.add
        .tileSprite(view.x, view.y, view.width, view.height, TEX.meadow)
        .setOrigin(0, 0);
    }
    this.add
      .rectangle(view.centerX, view.centerY, view.width, view.height, 0x2a1d08, 0.35)
      .setOrigin(0.5);

    // The loop carries on from the menu or the level; nothing restarts.
    new Sfx(this).startMusic();

    this.save = coerceSave(this.context.save.get<unknown>(SAVE_KEY, null));
    if (this.world < 0) this.world = this.suggestedWorld();

    new Button(this, {
      x: view.x + 110,
      y: view.y + 44,
      width: 170,
      label: '⌂  Menu',
      tint: 0x8a6a3a,
      onClick: () => this.scene.start('Menu'),
    }).setDepth(20);

    this.spawnBees();
    this.draw();
  }

  /** The world with the next thing to do in it. */
  private suggestedWorld(): number {
    for (const level of LEVELS) {
      if (
        isUnlocked(level, this.save.levelStars) &&
        (this.save.levelStars[level.id - 1] ?? 0) === 0
      ) {
        return level.world;
      }
    }
    return 0;
  }

  private draw(): void {
    this.layer?.destroy();
    for (const b of this.buttons) b.destroy();
    this.buttons = [];
    this.layer = this.add.container(0, 0).setDepth(5);
    const cx = DESIGN_WIDTH / 2;
    const info = WORLDS[this.world] ?? WORLDS[0];
    if (!info) return;

    const stars = this.save.levelStars;
    const total = totalStars(stars);
    const first = this.world * LEVELS_PER_WORLD;
    const worldStars = totalStars(stars.slice(first, first + LEVELS_PER_WORLD));
    const open = total >= info.starsToOpen;

    const tint = `#${info.tint.toString(16).padStart(6, '0')}`;
    this.layer.add(this.label(`World ${this.world + 1}`, cx, 62, 20, '#e9dcc0'));
    this.layer.add(this.label(info.name, cx, 100, 46, tint, true));
    this.layer.add(this.label(info.blurb, cx, 146, 19, '#fff4d6'));
    this.layer.add(
      this.label(
        `★ ${worldStars} / ${LEVELS_PER_WORLD * 3} here   ·   ${total} / ${LEVELS.length * 3} in all`,
        cx,
        184,
        18,
        '#ffe38a',
      ),
    );

    // The next level to play is the first open one without a star.
    this.current =
      LEVELS.slice(first, first + LEVELS_PER_WORLD).find(
        (l) => isUnlocked(l, stars) && (stars[l.id - 1] ?? 0) === 0,
      ) ?? null;

    const g = this.add.graphics();
    this.cellGfx = g;
    this.layer.add(g);

    for (let i = 0; i < LEVELS_PER_WORLD; i += 1) {
      const level = LEVELS[first + i];
      const offset = CELL_OFFSETS[i];
      if (!level || !offset) continue;
      const x = cx + offset[0] * HEX_W;
      const y = CENTRE_Y + offset[1] * R;
      const unlocked = open && isUnlocked(level, stars);

      this.layer.add(
        this.label(String(i + 1), x, y - 10, 34, unlocked ? '#fff4d6' : '#8a7a5a', true),
      );
      if (unlocked) {
        const zone = this.add
          .zone(x, y, HEX_W * 0.9, R * 1.6)
          .setInteractive({ useHandCursor: true });
        zone.on('pointerup', () => this.play(level));
        this.layer.add(zone);
      }
    }

    if (!open) {
      this.layer.add(
        this.label(
          `Collect ${info.starsToOpen} ★ to open — you have ${total}`,
          cx,
          CENTRE_Y,
          26,
          '#fff4d6',
          true,
        ),
      );
    }

    // World arrows.
    if (this.world > 0) {
      this.buttons.push(
        new Button(this, {
          x: cx - 470,
          y: CENTRE_Y,
          width: 90,
          label: '◀',
          tint: 0x8a6a3a,
          onClick: () => this.turn(-1),
        }).setDepth(20),
      );
    }
    if (this.world < WORLDS.length - 1) {
      this.buttons.push(
        new Button(this, {
          x: cx + 470,
          y: CENTRE_Y,
          width: 90,
          label: '▶',
          tint: 0x8a6a3a,
          onClick: () => this.turn(1),
        }).setDepth(20),
      );
    }

    if (this.current) {
      const c = this.current;
      this.buttons.push(
        new Button(this, {
          x: cx,
          y: 672,
          width: 360,
          label: `▶  Play ${this.world + 1}-${((c.id - 1) % LEVELS_PER_WORLD) + 1}  ${c.name}`,
          tint: 0x3aa860,
          onClick: () => this.play(c),
        })
          .setDepth(20)
          .pulse(),
      );
    }
  }

  override update(time: number, delta: number): void {
    super.update(time, delta);
    this.drawCells(time / 1000);
    this.moveBees(time, delta / 1000);
  }

  /** The cells themselves, redrawn each frame so the next one can glow. */
  private drawCells(t: number): void {
    const g = this.cellGfx;
    if (!g) return;
    g.clear();
    const cx = DESIGN_WIDTH / 2;
    const info = WORLDS[this.world];
    if (!info) return;
    const stars = this.save.levelStars;
    const open = totalStars(stars) >= info.starsToOpen;
    const first = this.world * LEVELS_PER_WORLD;

    for (let i = 0; i < LEVELS_PER_WORLD; i += 1) {
      const level = LEVELS[first + i];
      const offset = CELL_OFFSETS[i];
      if (!level || !offset) continue;
      const x = cx + offset[0] * HEX_W;
      const y = CENTRE_Y + offset[1] * R;
      const unlocked = open && isUnlocked(level, stars);
      const earned = stars[level.id - 1] ?? 0;
      const isCurrent = this.current?.id === level.id;

      const corners = hexPoints(x, y, R - 3);
      // Wax.
      g.fillStyle(unlocked ? 0x5a4424 : 0x2e2416, 0.95);
      fillPoly(g, corners);
      // Honey, filling from the bottom by thirds.
      if (earned > 0) {
        const level01 = earned / 3;
        const top = y + (R - 3) - level01 * 2 * (R - 3);
        const honey = clipBelow(corners, top);
        g.fillStyle(earned === 3 ? 0xffc21a : 0xffb61f, 0.95);
        fillPoly(g, honey);
        if (earned < 3) {
          g.lineStyle(3, 0xfff0b0, 0.8);
          const span = honey.filter((p) => Math.abs(p.y - top) < 0.5);
          if (span.length >= 2) {
            g.lineBetween(span[0]!.x, top, span[span.length - 1]!.x, top);
          }
        }
      }
      // Rim.
      const glow = isCurrent ? 0.6 + 0.4 * Math.sin(t * 4) : 0;
      g.lineStyle(
        isCurrent ? 6 : 4,
        isCurrent ? 0xfff4d6 : 0xffd466,
        unlocked ? 0.9 : 0.3,
      );
      strokePoly(g, corners);
      if (isCurrent) {
        g.lineStyle(10, 0xffe38a, 0.25 * glow);
        strokePoly(g, hexPoints(x, y, R + 4));
      }
      // Stars under the number, or a lock.
      if (unlocked) {
        for (let s = 0; s < 3; s += 1) {
          star(g, x + (s - 1) * 22, y + 26, 9, s < earned ? 0xfff7d6 : 0x2a1d08);
        }
      } else {
        g.fillStyle(0x8a7a5a, 1);
        g.fillRoundedRect(x - 11, y + 18, 22, 17, 3);
        g.lineStyle(4, 0x8a7a5a, 1);
        g.beginPath();
        g.arc(x, y + 18, 7, Math.PI, 0, false);
        g.strokePath();
      }
    }
  }

  private turn(direction: number): void {
    this.world = Math.max(0, Math.min(WORLDS.length - 1, this.world + direction));
    this.draw();
  }

  private play(level: LevelDef): void {
    this.scene.start('Game', { mode: 'level', level: level.id });
  }

  /** A few bees drifting round the comb, so the map is alive. */
  private spawnBees(): void {
    this.bees = [];
    const key = this.textures.exists(TEX.beeFlap) ? TEX.beeFlap : TEX.beeDrawn;
    for (let i = 0; i < 6; i += 1) {
      this.bees.push({
        sprite: this.add.image(0, 0, key).setScale(0.38).setDepth(8),
        phase: Math.random() * Math.PI * 2,
        speed: 0.25 + Math.random() * 0.25,
      });
    }
  }

  private moveBees(time: number, dt: number): void {
    const cx = DESIGN_WIDTH / 2;
    for (const [i, bee] of this.bees.entries()) {
      bee.phase += dt * bee.speed;
      const x = cx + Math.cos(bee.phase) * 360 + Math.sin(bee.phase * 2.3) * 40;
      const y = CENTRE_Y + Math.sin(bee.phase * 1.3) * 170;
      bee.sprite.setFlipX(Math.sin(bee.phase) > 0);
      bee.sprite.setPosition(x, y);
      if (bee.sprite.texture.key === TEX.beeFlap) {
        bee.sprite.setFrame(Math.floor(time / 38 + i * 1.7) % FLAP_FRAMES);
      }
    }
  }

  private label(
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
        strokeThickness: bold ? 7 : 4,
      })
      .setOrigin(0.5);
  }
}

interface Point {
  x: number;
  y: number;
}

function hexPoints(cx: number, cy: number, r: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

/** The part of a convex polygon at or below `y` (screen-down). */
function clipBelow(points: Point[], y: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const aIn = a.y >= y;
    const bIn = b.y >= y;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (y - a.y) / (b.y - a.y);
      out.push({ x: a.x + (b.x - a.x) * t, y });
    }
  }
  return out;
}

function fillPoly(g: Phaser.GameObjects.Graphics, points: Point[]): void {
  if (points.length < 3) return;
  g.beginPath();
  g.moveTo(points[0]!.x, points[0]!.y);
  for (const p of points.slice(1)) g.lineTo(p.x, p.y);
  g.closePath();
  g.fillPath();
}

function strokePoly(g: Phaser.GameObjects.Graphics, points: Point[]): void {
  g.beginPath();
  g.moveTo(points[0]!.x, points[0]!.y);
  for (const p of points.slice(1)) g.lineTo(p.x, p.y);
  g.closePath();
  g.strokePath();
}
