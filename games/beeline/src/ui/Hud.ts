import type Phaser from 'phaser';
import { DESIGN_WIDTH } from '@ucgames/core';

const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const PLATE = 0x2a2114;
const PLATE_ALPHA = 0.72;
const HONEY = 0xffb61f;
const GOOD = 0x6fcf7f;
const STAR_ON = 0xffd84a;
const STAR_OFF = 0x6b5a3a;

/**
 * Honey against the quota, the daylight left, and the lines in hand.
 *
 * Everything sits on dark plates. The board is a bright meadow now, and the
 * old HUD — thin dark text straight on the grass — was legible against the
 * grass and nothing else; over a flower or the mist it simply went away.
 *
 * The honey count is the largest thing on screen and it *moves*: it counts up
 * rather than jumping, and punches on every delivery, because it is the score
 * and the whole loop is built to make it go up.
 */
export class Hud {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly honeyText: Phaser.GameObjects.Text;
  /** A drop of honey beside the count, where the flying drops land. */
  private readonly dropIcon: Phaser.GameObjects.Image | null;
  private readonly quotaText: Phaser.GameObjects.Text;
  private readonly dayText: Phaser.GameObjects.Text;
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly banner: Phaser.GameObjects.Text;
  private readonly alertText: Phaser.GameObjects.Text;
  private readonly linesText: Phaser.GameObjects.Text;
  private readonly idleText: Phaser.GameObjects.Text;

  private safe = { x: 0, y: 0, width: DESIGN_WIDTH, right: DESIGN_WIDTH, centerX: 640 };
  private barWidth = 520;
  /** The count as displayed, easing toward the real one. */
  private shown = 0;
  private target = 0;
  private quota = 1;
  private dayFraction = 1;
  private secondsLeft = 0;
  private lines = { used: 0, owned: 3 };
  private idleBees = 0;
  private alertPhase = 0;
  private starsLit = 0;
  private targets: readonly [number, number, number] = [1, 2, 3];
  private combo: ComboView = { tier: 1, progress: 0, slipping: false };
  private comboPulse = 0;
  private readonly comboText: Phaser.GameObjects.Text;
  private readonly pauseButton: Phaser.GameObjects.Text;
  /** Called with the star number (1-3) the moment it is earned. */
  onStar: ((star: number) => void) | null = null;
  /** Called when the pause button is tapped. */
  onPause: (() => void) | null = null;
  private starPops: number[] = [0, 0, 0];

  // --- level mode: the jar ---------------------------------------------
  /** Set by `updateLevel`; the endless HUD is the default. */
  private levelMode = false;
  private jar: JarView = {
    goal: 1,
    clock: 0,
    starTimes: [20, 35],
    timed: false,
    started: false,
  };
  /** Stars still on offer for speed: 3, 2 or 1. */
  private starsKept = 3;
  private starDrops: number[] = [0, 0, 0];
  private readonly jarText: Phaser.GameObjects.Text;
  private readonly starClockText: Phaser.GameObjects.Text;
  /** 1 just after a line came free, easing to 0: the Lines plate glows. */
  private linesFlash = 0;
  /** Called with the star (2 or 3) the moment it is lost to the clock. */
  onStarLost: ((star: number) => void) | null = null;

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(depth);
    this.root.setScrollFactor(0);
    this.gfx = scene.add.graphics();

    const text = (size: number, colour: string, bold = false): Phaser.GameObjects.Text =>
      scene.add.text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color: colour,
        fontStyle: bold ? 'bold' : 'normal',
        stroke: '#1d160c',
        strokeThickness: bold ? 5 : 3,
      });

    this.dayText = text(22, '#fff4d6', true).setOrigin(0, 0.5);
    this.comboText = text(24, '#ffe38a', true).setOrigin(0.5, 0.5);
    // Pause (and from there Retry, Map, Sound). A zone-less text with its own
    // hit area, so it does not fight the board's own pointer handling for the
    // rest of the screen; padded out to a thumb-sized target.
    this.pauseButton = text(30, '#fff4d6', true)
      .setText('II')
      .setOrigin(0.5)
      .setPadding(26, 10, 26, 10)
      .setInteractive({ useHandCursor: true });
    this.pauseButton.on('pointerup', () => this.onPause?.());
    this.timerText = text(22, '#fff4d6', true).setOrigin(0.5, 0.5);
    this.honeyText = text(34, '#ffd466', true).setOrigin(0.5, 0.5);
    this.quotaText = text(16, '#e9dcc0').setOrigin(0.5, 0.5);
    this.linesText = text(17, '#fff4d6', true).setOrigin(0, 0.5);
    this.idleText = text(17, '#ffd466', true).setOrigin(0, 0.5);
    this.alertText = text(22, '#ff8a70', true).setOrigin(0.5, 0.5).setAlpha(0);
    this.jarText = text(30, '#fff4d6', true).setOrigin(0.5, 0.5);
    this.starClockText = text(17, '#fff4d6', true).setOrigin(0, 0.5);
    this.banner = text(28, '#fff4d6', true)
      .setOrigin(0.5)
      .setAlign('center')
      .setAlpha(0)
      .setWordWrapWidth(900);

    this.dropIcon = scene.textures.exists('honey-drop')
      ? scene.add.image(0, 0, 'honey-drop').setDisplaySize(30, 30)
      : null;

    this.root.add([
      this.gfx,
      this.comboText,
      this.pauseButton,
      ...(this.dropIcon ? [this.dropIcon] : []),
      this.dayText,
      this.timerText,
      this.honeyText,
      this.quotaText,
      this.linesText,
      this.idleText,
      this.alertText,
      this.jarText,
      this.starClockText,
      this.banner,
    ]);
  }

  layout(safe: Phaser.Geom.Rectangle): void {
    this.safe = {
      x: safe.x,
      y: safe.y,
      width: safe.width,
      right: safe.right,
      centerX: safe.centerX,
    };
    this.barWidth = Math.min(520, safe.width - 420);
    const top = safe.y + 34;

    this.dayText.setPosition(safe.x + 30, top);
    this.timerText.setPosition(safe.right - 52, top + 2);
    this.pauseButton.setPosition(safe.right - 52, top + 62);
    this.honeyText.setPosition(safe.centerX, top - 4);
    this.quotaText.setPosition(safe.centerX, top + 44);
    this.linesText.setPosition(safe.x + 30, top + 50);
    this.idleText.setPosition(safe.x + 30, top + 80);
    this.alertText.setPosition(safe.centerX, top + 86);
    this.banner.setPosition(safe.centerX, safe.y + 236);
    this.jarText.setPosition(safe.centerX + 24, top - 6);
    this.starClockText.setPosition(safe.centerX + 30, top + 34);
  }

  /**
   * The campaign HUD: one jar to fill, and three stars that each stay lit
   * only while the jar could still be filled in time for them.
   *
   * Replaces the endless HUD's bar, multiplier badge and "next star" line.
   * Every number on it answers one question — how full, how fast — so a
   * player new to the game can read the whole of it at a glance.
   */
  updateLevel(label: string, honey: number, view: JarView, deltaSeconds: number): void {
    if (!this.levelMode) this.setLevelMode(true);
    this.dayText.setText(label);
    this.jar = view;
    this.quota = Math.max(1, view.goal);

    if (honey > this.target + 0.5) this.punch(this.jarText, 1.1);
    this.target = honey;
    const k = Math.min(1, deltaSeconds * 9);
    this.shown += (this.target - this.shown) * k;
    if (Math.abs(this.target - this.shown) < 0.5) this.shown = this.target;
    const shown = Math.min(view.goal, Math.floor(this.shown));
    this.jarText.setText(`${shown} / ${view.goal}`);
    this.jarText.setColor(shown >= view.goal ? '#a8f0b4' : '#ffd466');
    const left = this.safe.centerX - this.barWidth / 2;
    this.starClockText.setPosition(left + 140, this.safe.y + 68);

    // Stars go out as their time passes.
    const [three, two] = view.starTimes;
    const kept = view.clock > two ? 1 : view.clock > three ? 2 : 3;
    for (let s = this.starsKept; s > kept; s -= 1) {
      this.starDrops[s - 1] = 1;
      this.onStarLost?.(s);
    }
    this.starsKept = kept;
    for (let i = 0; i < 3; i += 1) {
      this.starDrops[i] = Math.max(0, (this.starDrops[i] ?? 0) - deltaSeconds * 2);
    }
    this.linesFlash = Math.max(0, this.linesFlash - deltaSeconds * 0.8);

    const next = kept === 3 ? three : kept === 2 ? two : 0;
    this.starClockText.setText(
      !view.started
        ? 'Stars for speed — the clock starts with your first line'
        : next > 0
          ? `${Math.max(0, Math.ceil(next - view.clock))}s left for ${kept} stars`
          : 'Fill the jar for a star',
    );
    this.starClockText.setColor(
      view.started && next > 0 && next - view.clock <= 5 ? '#ffb09c' : '#e9dcc0',
    );

    this.secondsLeft = view.secondsLeft ?? 0;
    this.dayFraction =
      view.timed && view.daySeconds ? Math.max(0, this.secondsLeft / view.daySeconds) : 1;
    const seconds = Math.max(0, Math.ceil(this.secondsLeft));
    this.timerText.setVisible(view.timed).setText(String(seconds));
    this.timerText.setColor(seconds <= 10 ? '#ff8a70' : '#fff4d6');

    this.drawLevel();
  }

  /** A line came free: draw the eye to the Lines plate. */
  flashLines(): void {
    this.linesFlash = 1;
  }

  private setLevelMode(on: boolean): void {
    this.levelMode = on;
    this.honeyText.setVisible(!on);
    this.quotaText.setVisible(!on);
    this.comboText.setVisible(!on);
    this.idleText.setVisible(!on);
    this.dropIcon?.setVisible(!on);
    this.jarText.setVisible(on);
    this.starClockText.setVisible(on);
    this.timerText.setVisible(true);
  }

  /** The jar, its stars, the lines in hand and — on a timed board — the sun. */
  private drawLevel(): void {
    const g = this.gfx;
    g.clear();
    const { x, y, right, centerX } = this.safe;
    const top = y + 34;

    plate(g, x + 14, top - 24, Math.max(150, this.dayText.displayWidth + 34), 48);
    plate(g, x + 14, top + 30, 96 + this.lines.owned * 24, 40);
    if (this.linesFlash > 0) {
      g.lineStyle(4, 0xfff4d6, this.linesFlash);
      g.strokeRoundedRect(x + 14, top + 30, 96 + this.lines.owned * 24, 40, 14);
    }
    for (let i = 0; i < this.lines.owned; i += 1) {
      const cx = x + 100 + i * 24;
      const cy = top + 50;
      const used = i < this.lines.used;
      g.fillStyle(used ? HONEY : 0x000000, used ? 1 : 0.35);
      g.fillCircle(cx, cy, 8);
      g.lineStyle(2, HONEY, 0.9);
      g.strokeCircle(cx, cy, 8);
    }

    // The jar: a plate with a honey level that rises to the brim.
    const w = this.barWidth;
    const left = centerX - w / 2;
    plate(g, left - 20, top - 30, w + 40, 96);
    const fill = Math.min(1, this.shown / Math.max(1, this.jar.goal));
    const barY = top - 26;
    const barH = 40;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(left + 34, barY + 4, w - 40, barH - 8, 14);
    if (fill > 0) {
      g.fillStyle(fill >= 1 ? GOOD : HONEY, 1);
      g.fillRoundedRect(
        left + 34,
        barY + 4,
        Math.max(28, (w - 40) * fill),
        barH - 8,
        14,
      );
      // A highlight along the top, so it reads as honey rather than a bar.
      g.fillStyle(0xffffff, 0.22);
      g.fillRoundedRect(left + 40, barY + 8, Math.max(16, (w - 52) * fill), 6, 3);
    }
    this.jarGlyph(g, left + 8, top - 6, fill);

    // Stars for speed, each lit while it can still be had.
    for (let i = 0; i < 3; i += 1) {
      const lit = i < this.starsKept;
      const drop = this.starDrops[i] ?? 0;
      star(
        g,
        left + 60 + i * 28,
        top + 34 + drop * 10,
        11 * (1 + drop * 0.5),
        lit ? STAR_ON : STAR_OFF,
      );
    }

    if (!this.jar.timed) return;
    const sx = right - 52;
    const sy = top + 2;
    g.fillStyle(PLATE, PLATE_ALPHA);
    g.fillCircle(sx, sy, 34);
    g.lineStyle(6, 0x000000, 0.35);
    g.strokeCircle(sx, sy, 26);
    const low = this.secondsLeft <= 10;
    g.lineStyle(6, low ? 0xff7043 : 0xffc94a, 1);
    g.beginPath();
    g.arc(sx, sy, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.dayFraction, false);
    g.strokePath();
  }

  /** A little honey jar, filled to `fill`. */
  private jarGlyph(g: Phaser.GameObjects.Graphics, cx: number, cy: number, fill: number): void {
    const w = 34;
    const h = 40;
    g.fillStyle(0xfff4d6, 0.25);
    g.fillRoundedRect(cx - w / 2, cy - h / 2 + 6, w, h - 6, 8);
    if (fill > 0) {
      const fh = (h - 10) * fill;
      g.fillStyle(fill >= 1 ? GOOD : HONEY, 1);
      g.fillRoundedRect(cx - w / 2 + 3, cy + h / 2 - 3 - fh, w - 6, fh, 6);
    }
    g.lineStyle(3, 0xfff4d6, 0.9);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2 + 6, w, h - 6, 8);
    g.fillStyle(0xc98a2b, 1);
    g.fillRoundedRect(cx - w / 2 - 3, cy - h / 2, w + 6, 9, 3);
  }

  /** Called every frame with the day's numbers. */
  update(
    label: string,
    honey: number,
    targets: readonly [number, number, number],
    secondsLeft: number,
    daySeconds: number,
    deltaSeconds: number,
    combo: ComboView = { tier: 1, progress: 0, slipping: false },
  ): void {
    this.dayText.setText(label);
    this.targets = targets;
    this.quota = Math.max(1, targets[0]);
    this.secondsLeft = secondsLeft;
    this.dayFraction = daySeconds > 0 ? Math.max(0, secondsLeft / daySeconds) : 0;
    this.combo = combo;

    if (honey > this.target + 0.5) this.punch(this.honeyText, 1.12);
    this.target = honey;
    // Counts up rather than jumping. Fast enough to keep pace with a busy
    // hive, slow enough that a big delivery visibly rolls over.
    const k = Math.min(1, deltaSeconds * 9);
    this.shown += (this.target - this.shown) * k;
    if (Math.abs(this.target - this.shown) < 0.5) this.shown = this.target;
    this.honeyText.setText(Math.floor(this.shown).toLocaleString('en-US'));
    this.dropIcon?.setPosition(
      this.honeyText.x - this.honeyText.displayWidth / 2 - 22,
      this.honeyText.y,
    );
    this.comboText
      .setText(`x${combo.tier}`)
      .setPosition(
        this.honeyText.x + this.honeyText.displayWidth / 2 + 44,
        this.honeyText.y,
      )
      .setColor(combo.slipping ? '#ff9b80' : combo.tier > 1 ? '#ffe38a' : '#c9b98f');

    const [one, two, three] = targets;
    const stars = honey >= three ? 3 : honey >= two ? 2 : honey >= one ? 1 : 0;
    const next = stars === 0 ? one : stars === 1 ? two : stars === 2 ? three : 0;
    this.quotaText.setText(
      next > 0
        ? `${stars === 0 ? 'goal' : 'next star'} ${next.toLocaleString('en-US')}`
        : 'three stars!',
    );
    this.quotaText.setColor(stars > 0 ? '#a8f0b4' : '#e9dcc0');

    const seconds = Math.max(0, Math.ceil(secondsLeft));
    this.timerText.setText(String(seconds));
    this.timerText.setColor(seconds <= 10 ? '#ff8a70' : '#fff4d6');

    // Stars light as the thresholds are crossed, each with a pop and a chime.
    for (let i = this.starsLit; i < stars; i += 1) {
      this.starPops[i] = 1;
      this.onStar?.(i + 1);
    }
    this.starsLit = Math.max(this.starsLit, stars);
    for (let i = 0; i < 3; i += 1) {
      this.starPops[i] = Math.max(0, (this.starPops[i] ?? 0) - deltaSeconds * 2.5);
    }
    this.comboPulse = Math.max(0, this.comboPulse - deltaSeconds * 2);

    this.draw();
  }

  setLines(used: number, owned: number): void {
    this.lines = { used, owned };
    this.linesText.setText('Lines');
  }

  /** Bees with nothing to fly. The nudge to lay another line. */
  setIdle(idle: number, canLay: boolean): void {
    this.idleBees = idle;
    const show = idle >= 3 && canLay;
    this.idleText.setText(show ? `${idle} bees waiting — lay a line!` : '');
    this.idleText.setAlpha(show ? 0.75 + 0.25 * Math.sin(this.scene.time.now / 160) : 0);
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    const { x, y, right, centerX } = this.safe;
    const top = y + 34;

    // Day (or level) plate, sized to what it says.
    plate(g, x + 14, top - 24, Math.max(150, this.dayText.displayWidth + 34), 48);
    // Lines plate: one pip per line owned, filled for each in use.
    plate(g, x + 14, top + 30, 96 + this.lines.owned * 24, 40);
    for (let i = 0; i < this.lines.owned; i += 1) {
      const cx = x + 100 + i * 24;
      const cy = top + 50;
      const used = i < this.lines.used;
      g.fillStyle(used ? HONEY : 0x000000, used ? 1 : 0.35);
      g.fillCircle(cx, cy, 8);
      g.lineStyle(2, HONEY, 0.9);
      g.strokeCircle(cx, cy, 8);
    }

    // Honey plate and bar.
    const barX = centerX - this.barWidth / 2;
    plate(g, barX - 20, top - 30, this.barWidth + 40, 92);
    const barY = top + 22;
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(barX, barY - 7, this.barWidth, 14, 7);
    // The bar spans to three stars' worth, so there is always somewhere to go.
    const span = Math.max(1, this.targets[2]);
    const fill = Math.min(1, this.shown / span);
    if (fill > 0) {
      g.fillStyle(this.shown >= this.quota ? GOOD : HONEY, 1);
      g.fillRoundedRect(barX, barY - 7, Math.max(14, this.barWidth * fill), 14, 7);
    }
    this.targets.forEach((m, i) => {
      const mx = barX + (this.barWidth * m) / span;
      const lit = i < this.starsLit;
      const pop = 1 + (this.starPops[i] ?? 0) * 0.8;
      star(
        g,
        Math.min(mx, barX + this.barWidth - 4),
        barY,
        11 * pop,
        lit ? STAR_ON : STAR_OFF,
      );
    });

    // The Busy Hive multiplier: a ring round its badge that fills toward the
    // next tier, red and shrinking while bees wait.
    const cx = this.comboText.x;
    const cy = this.comboText.y;
    const r = 24 + this.comboPulse * 10;
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(cx, cy, r);
    g.lineStyle(5, 0x000000, 0.35);
    g.strokeCircle(cx, cy, r);
    g.lineStyle(5, this.combo.slipping ? 0xff7043 : 0xffd23f, 1);
    g.beginPath();
    g.arc(
      cx,
      cy,
      r,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * this.combo.progress,
      false,
    );
    g.strokePath();

    // Daylight: a sun dial that empties.
    const sx = right - 52;
    const sy = top + 2;
    g.fillStyle(PLATE, PLATE_ALPHA);
    g.fillCircle(sx, sy, 34);
    g.lineStyle(6, 0x000000, 0.35);
    g.strokeCircle(sx, sy, 26);
    const low = this.secondsLeft <= 10;
    g.lineStyle(6, low ? 0xff7043 : 0xffc94a, 1);
    g.beginPath();
    g.arc(sx, sy, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.dayFraction, false);
    g.strokePath();
  }

  /** Where a flying drop of honey should land, in screen space. */
  get honeyAnchor(): { x: number; y: number } {
    if (this.levelMode) {
      return { x: this.safe.centerX - this.barWidth / 2 + 8, y: this.safe.y + 28 };
    }
    const target = this.dropIcon ?? this.honeyText;
    return { x: target.x, y: target.y };
  }

  /** The multiplier reached a new tier: say it big, in the middle. */
  comboPop(tier: number): void {
    this.comboPulse = 1;
    const label = this.scene.add
      .text(this.safe.centerX, this.safe.y + 150, `BUSY HIVE  x${tier}!`, {
        fontFamily: FONT,
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ffe38a',
        stroke: '#2a1d08',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(this.root.depth + 2)
      .setScale(0.4);
    this.scene.tweens.add({
      targets: label,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: label,
      alpha: 0,
      y: label.y - 30,
      delay: 700,
      duration: 400,
      onComplete: () => label.destroy(),
    });
  }

  setPauseVisible(visible: boolean): void {
    this.pauseButton.setVisible(visible);
  }

  /** A drop just landed in the counter. */
  catchDrop(): void {
    if (this.levelMode) {
      this.punch(this.jarText, 1.08);
      return;
    }
    if (!this.dropIcon) return;
    this.scene.tweens.killTweensOf(this.dropIcon);
    this.dropIcon.setDisplaySize(40, 40);
    this.scene.tweens.add({
      targets: this.dropIcon,
      displayWidth: 30,
      displayHeight: 30,
      duration: 180,
      ease: 'Quad.easeOut',
    });
  }

  private punch(target: Phaser.GameObjects.Text, scale: number): void {
    this.scene.tweens.killTweensOf(target);
    target.setScale(scale);
    this.scene.tweens.add({
      targets: target,
      scale: 1,
      duration: 160,
      ease: 'Quad.easeOut',
    });
  }

  /**
   * The live raid line: null clears it, a string keeps it up and pulsing.
   *
   * Driven every frame rather than tweened, because the thing it describes can
   * end at any moment and a tween that outlives its cause is how a HUD starts
   * lying to the player.
   */
  setAlert(text: string | null, deltaSeconds = 0): void {
    if (!text) {
      this.alertText.setAlpha(0);
      this.alertPhase = 0;
      return;
    }
    this.alertPhase += deltaSeconds * 6;
    this.alertText.setText(text);
    this.alertText.setAlpha(0.72 + 0.28 * Math.abs(Math.sin(this.alertPhase)));
  }

  /** Takes any announcement off the screen at once. */
  clearBanner(): void {
    this.scene.tweens.killTweensOf(this.banner);
    this.banner.setAlpha(0);
  }

  /** One-line announcement: a new day's twist, a bloom, a clear. */
  showBanner(text: string, colour = '#fff4d6'): void {
    this.scene.tweens.killTweensOf(this.banner);
    this.banner.setText(text).setColor(colour).setAlpha(0).setScale(0.8);
    this.scene.tweens.add({
      targets: this.banner,
      alpha: 1,
      scale: 1,
      duration: 320,
      ease: 'Back.easeOut',
      hold: 2000,
      yoyo: true,
    });
  }

  resetDay(): void {
    this.comboPulse = 0;
    this.starsKept = 3;
    this.starDrops = [0, 0, 0];
    this.jarText.setScale(1);
    if (this.levelMode) this.setLevelMode(false);
    this.shown = 0;
    this.target = 0;
    this.starsLit = 0;
    this.starPops = [0, 0, 0];
    this.honeyText.setScale(1);
  }

  get idle(): number {
    return this.idleBees;
  }

  setVisible(visible: boolean): void {
    this.root.setVisible(visible);
  }

  destroy(): void {
    this.root.destroy(true);
  }
}

export interface JarView {
  goal: number;
  /** Seconds since the first line, on the clock that awards the stars. */
  clock: number;
  starTimes: readonly [three: number, two: number];
  timed: boolean;
  /** False until the first line: the clock has not started. */
  started: boolean;
  secondsLeft?: number;
  daySeconds?: number;
}

export interface ComboView {
  tier: number;
  /** 0..1 toward the next tier. */
  progress: number;
  slipping: boolean;
}

function plate(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  g.fillStyle(PLATE, PLATE_ALPHA);
  g.fillRoundedRect(x, y, w, h, 14);
  g.lineStyle(2, 0xffd466, 0.25);
  g.strokeRoundedRect(x, y, w, h, 14);
}

/** A five-pointed star, filled, with a dark rim. */
export function star(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  colour: number,
): void {
  g.fillStyle(colour, 1);
  g.lineStyle(2, 0x2a1d08, 0.9);
  g.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fillPath();
  g.strokePath();
}
