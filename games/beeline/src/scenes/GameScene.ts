import Phaser from 'phaser';
import { BaseGameplayScene, DESIGN_HEIGHT, DESIGN_WIDTH } from '@ucgames/core';
import { COLORS, TUNING } from '../config/tuning.ts';
import { Field } from '../sim/Field.ts';
import { pushIfSpaced } from '../sim/polyline.ts';
import { createGeneratedTextures } from '../render/textures.ts';
import { createBeeRenderer, type BeeRenderer } from '../render/BeeRenderer.ts';
import { RouteRenderer } from '../render/RouteRenderer.ts';
import { FieldRenderer } from '../render/FieldRenderer.ts';
import { Juice } from '../render/Juice.ts';
import { Hud } from '../ui/Hud.ts';
import { Sfx } from '../audio/Sfx.ts';
import {
  dayLength,
  dayQuota,
  patchesForDay,
  featuresForDay,
  dayIntroduction,
  evaluateDay,
} from '../game/DayCycle.ts';
import { deriveStats } from '../game/Upgrades.ts';
import { coerceSave, writeSave, SAVE_KEY, type BeelineSave } from '../game/SaveState.ts';
import { computeOffline, formatAway } from '../game/Offline.ts';
import { commitDrag, resolveDragStart, type DragIntent } from '../game/RouteIntent.ts';
import type { NightData } from './NightScene.ts';

const DEPTH = { patch: 10, hive: 20, route: 30, bee: 40, juice: 50, hud: 100 } as const;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * The game.
 *
 * Structure worth knowing before changing anything here:
 *
 *   fixedUpdate(dt)  — simulation only, constant dt, identical at 60/144Hz
 *   renderUpdate(a)  — interpolated drawing, no game logic
 *   update()         — frame-rate-dependent visuals (juice) and input polling
 *
 * The day is a small state machine: `intro` → `playing` → handoff to NightScene
 * → `beginDay` again. Gameplay lifecycle calls to the portal are paired to
 * those transitions, not scattered through the code.
 */
export class GameScene extends BaseGameplayScene {
  private field!: Field;
  private beeRenderer!: BeeRenderer;
  private routeRenderer!: RouteRenderer;
  private fieldRenderer!: FieldRenderer;
  private juice!: Juice;
  private hud!: Hud;
  private sfx!: Sfx;

  private save!: BeelineSave;
  private day = 1;
  private secondsLeft = 0;
  /** `loading` until the save has been read; the simulation is idle until then. */
  private phase: 'loading' | 'playing' | 'ended' = 'loading';

  // --- drag state -------------------------------------------------------
  private drawing = false;
  private drawCoords: number[] = [];
  private intent: DragIntent | null = null;
  private previewGfx!: Phaser.GameObjects.Graphics;

  // --- first-run teaching ----------------------------------------------
  private hintGfx!: Phaser.GameObjects.Graphics;
  private hasDrawnEver = false;
  private idleSeconds = 0;

  constructor() {
    super({ key: 'Game' });
  }

  preload(): void {
    createGeneratedTextures(this);
  }

  protected build(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);

    // Start from a fresh save so the field can be built immediately; the real
    // one is read a microtask later in bootstrap().
    this.save = coerceSave(null);
    this.day = this.save.day;

    this.field = new Field();
    this.field.setStats(deriveStats(this.save.levels));

    this.fieldRenderer = new FieldRenderer(this, this.field, DEPTH.patch);
    this.routeRenderer = new RouteRenderer(this, DEPTH.route);
    this.previewGfx = this.add.graphics().setDepth(DEPTH.route + 1);
    this.hintGfx = this.add.graphics().setDepth(DEPTH.route + 2);
    this.beeRenderer = createBeeRenderer(this, 'blitter', DEPTH.bee);
    this.juice = new Juice(this, DEPTH.juice);
    this.hud = new Hud(this, DEPTH.hud);
    this.sfx = new Sfx(this);

    this.hud.layout(this.safeArea);
    this.bindInput();

    void this.bootstrap();
  }

  /**
   * Reads the save, then starts day one.
   *
   * This exists because Beeline has no preload scene — assets are generated at
   * boot, so there is nothing to preload and a loading screen would only delay
   * the first drag. But `SaveManager.load()` is what hydrates the cache from
   * storage, and in the shared runtime that call lives in `BasePreloadScene`.
   * Without it, `save.get()` always returned the default: writes persisted,
   * reads never did, and progress silently reset on every reload while looking
   * perfectly fine within a single session.
   *
   * `load()` resolves in a microtask for localStorage, so the delay is
   * invisible and the game is still interactive immediately.
   */
  private async bootstrap(): Promise<void> {
    try {
      await this.context.save.load();
    } catch (error) {
      console.warn('[beeline] Could not read save; starting fresh.', error);
    }

    this.save = coerceSave(this.context.save.get<unknown>(SAVE_KEY, null));
    this.day = this.save.day;

    this.claimOfflineHoney();
    this.beginDay();
  }

  protected override layout(): void {
    this.hud?.layout(this.safeArea);
  }

  // ------------------------------------------------------------------ day

  private beginDay(extraSeconds = 0): void {
    this.phase = 'playing';
    this.day = this.save.day;

    const features = featuresForDay(this.day);
    const patchCount = patchesForDay(this.day) + this.save.levels.bloom;

    this.field.setStats(deriveStats(this.save.levels));
    this.field.beginDay(this.day, features, patchCount, 1);

    this.secondsLeft = dayLength(this.day) + extraSeconds;
    this.beeRenderer.resize(this.field.bees.length);

    this.hud.resetDay();
    this.hud.setVisible(true);
    this.hud.update(this.day, 0, dayQuota(this.day), this.secondsLeft);

    const intro = dayIntroduction(this.day);
    if (intro) this.hud.showBanner(intro);

    this.idleSeconds = 0;
    this.sfx.startHum();
    this.startGameplay();
  }

  private endDay(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'ended';

    this.stopGameplay();
    this.sfx.play('dayEnd', 0.45);
    this.cameras.main.flash(220, 60, 50, 30);

    const result = evaluateDay(this.day, this.field.honey, this.save.bestDayHoney);

    this.save.honey += Math.floor(result.honey);
    this.save.bestDayHoney = Math.max(this.save.bestDayHoney, Math.floor(result.honey));
    this.save.lastPlayedAt = Date.now();
    // The day only advances when the quota was met. A missed day is replayed,
    // so a bad run costs time rather than locking progression behind a wall.
    if (result.outcome === 'met') this.save.day = this.day + 1;
    this.persist();

    this.hud.setVisible(false);
    this.field.clearRoutes();

    const data: NightData = {
      result,
      save: this.save,
      sfx: this.sfx,
      onExtend: () => this.resumeWithExtraTime(),
      onNextDay: () => this.startNextDay(),
      onChanged: () => this.persist(),
    };

    this.scene.launch('Night', data);
    this.scene.pause();
  }

  /** Rewarded "+15s": resume the same board rather than restarting it. */
  private resumeWithExtraTime(): void {
    this.scene.stop('Night');
    this.scene.resume();

    // Roll back the day-end bookkeeping, since the day is continuing.
    this.save.honey -= Math.floor(this.field.honey);
    if (this.save.day > this.day) this.save.day = this.day;
    this.persist();

    this.phase = 'playing';
    this.secondsLeft = TUNING.ads.extendSeconds;
    this.hud.setVisible(true);
    this.startGameplay();
  }

  private startNextDay(): void {
    this.scene.stop('Night');
    this.scene.resume();
    this.beginDay();
  }

  private persist(): void {
    writeSave(this.context.save, this.save);
  }

  private claimOfflineHoney(): void {
    const stats = deriveStats(this.save.levels);
    const offline = computeOffline(this.save.lastPlayedAt, Date.now(), stats);
    if (offline.honey <= 0) return;

    this.save.honey += offline.honey;
    this.save.lastPlayedAt = Date.now();
    this.persist();

    const text = this.add
      .text(
        DESIGN_WIDTH / 2,
        DESIGN_HEIGHT - 110,
        `+${offline.honey} honey while you were away (${formatAway(offline.hoursAway)})`,
        { fontFamily: FONT, fontSize: '20px', color: '#ffd966' },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);

    this.tweens.add({
      targets: text,
      alpha: 0,
      y: text.y - 40,
      delay: 2600,
      duration: 900,
      onComplete: () => text.destroy(),
    });
  }

  // ---------------------------------------------------------------- input

  /**
   * One pointer path for mouse and touch.
   *
   * Phaser unifies the two, so there is deliberately no device branch — a
   * separate touch path is how the two drift and one of them ships broken.
   */
  private bindInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'playing') return;
      this.intent = resolveDragStart(this.field, p.worldX, p.worldY);
      this.drawing = true;
      this.hasDrawnEver = true;
      this.drawCoords = [this.intent.anchorX, this.intent.anchorY, p.worldX, p.worldY];
      this.sfx.playVaried('draw', 0.22, 180);
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.drawing) return;
      if (pushIfSpaced(this.drawCoords, p.worldX, p.worldY, TUNING.route.pointSpacing)) {
        this.juice.trail(p.worldX, p.worldY);
      }
    });

    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.endDraw());
    // A pointer leaving the canvas mid-drag must commit, not strand the gesture.
    this.input.on(Phaser.Input.Events.GAME_OUT, () => this.endDraw());
  }

  private endDraw(): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.previewGfx.clear();

    const coords = this.drawCoords;
    const intent = this.intent;
    this.drawCoords = [];
    this.intent = null;

    if (!intent || coords.length < 4) return;

    const result = commitDrag(this.field, intent, coords);
    if (result.kind !== 'rejected' && result.connected) {
      this.sfx.playVaried('collect', 0.18, 400);
    }
  }

  // --------------------------------------------------------------- update

  protected fixedUpdate(dt: number): void {
    if (this.phase !== 'playing') return;

    this.field.step(dt);

    this.secondsLeft -= dt;
    if (this.secondsLeft <= 0) {
      this.secondsLeft = 0;
      this.endDay();
      return;
    }

    if (!this.hasDrawnEver) this.idleSeconds += dt;
  }

  protected override renderUpdate(alpha: number): void {
    this.beeRenderer.sync(this.field.bees, alpha);
    this.routeRenderer.draw(this.field.routes, this.field.time);
    this.fieldRenderer.draw(
      this.field,
      alpha,
      this.drawing && this.intent?.kind === 'fresh',
    );
    this.drawPreview();
    this.drawHint();
  }

  override update(time: number, delta: number): void {
    super.update(time, delta);

    const seconds = delta / 1000;
    this.juice.update(seconds);
    this.consumeEvents();

    if (this.phase === 'playing') {
      this.hud.update(this.day, this.field.honey, dayQuota(this.day), this.secondsLeft);
    }
  }

  /** Turns simulation events into sound and particles, once per frame. */
  private consumeEvents(): void {
    const events = this.field.drainEvents();

    for (const hit of events.collected) {
      this.juice.collect(hit.x, hit.y, hit.amount);
    }
    // One sound per frame regardless of how many bees collected, or a large
    // swarm becomes a wall of noise.
    if (events.collected.length > 0) this.sfx.playVaried('collect', 0.16);

    if (events.deposited > 0) {
      this.juice.deposit(this.field.hiveX, this.field.hiveY);
      this.sfx.playVaried('deposit', 0.13);
    }

    for (const hit of events.scattered) this.juice.scatter(hit.x, hit.y);
    if (events.scattered.length > 0) this.sfx.playVaried('wasp', 0.2);
  }

  private drawPreview(): void {
    const g = this.previewGfx;
    g.clear();
    if (!this.drawing || this.drawCoords.length < 4) return;

    // Extending is drawn in the route's own colour and fresh draws slightly
    // dimmer, so the player can see which of the two the game decided on —
    // that feedback is how the cheap gesture gets discovered.
    const extending = this.intent?.kind === 'extend';
    g.lineStyle(extending ? 6 : 4, COLORS.route, extending ? 0.75 : 0.45);
    g.beginPath();
    g.moveTo(this.drawCoords[0] ?? 0, this.drawCoords[1] ?? 0);
    for (let i = 2; i < this.drawCoords.length; i += 2) {
      g.lineTo(this.drawCoords[i] ?? 0, this.drawCoords[i + 1] ?? 0);
    }
    g.strokePath();
  }

  /**
   * The entire tutorial: a pulsing line from the hive to the nearest flower.
   *
   * Shown on day one until the player draws anything, and again if they have
   * stalled for eight seconds. It disappears permanently on the first drag —
   * repeating an instruction the player has already followed is nagging.
   */
  private drawHint(): void {
    const g = this.hintGfx;
    g.clear();

    const show = !this.hasDrawnEver && this.day === 1 && this.phase === 'playing';
    if (!show) return;

    const patch = this.field.nearestPatchTo(this.field.hiveX, this.field.hiveY);
    if (!patch) return;

    const pulse = (this.field.time * 0.9) % 1;
    const alpha = 0.15 + 0.35 * Math.sin(Math.PI * pulse);

    g.lineStyle(5, 0xffffff, alpha);
    g.beginPath();
    g.moveTo(this.field.hiveX, this.field.hiveY);
    g.lineTo(patch.x, patch.y);
    g.strokePath();

    // A dot travelling hive → flower, tracing the gesture to make.
    const travelX = this.field.hiveX + (patch.x - this.field.hiveX) * pulse;
    const travelY = this.field.hiveY + (patch.y - this.field.hiveY) * pulse;
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(travelX, travelY, 7);
  }

  /** Exposed for the automated harness. Removed before submission. */
  debugHandle(): Record<string, unknown> {
    return {
      hive: { x: this.field.hiveX, y: this.field.hiveY },
      patches: () => this.field.patches.map((p) => ({ x: p.x, y: p.y, alive: p.alive })),
      stats: () => this.field.getStats(),
      routes: () =>
        this.field.routes.map((r) => ({
          id: r.id,
          live: Math.round(r.liveLength),
          total: Math.round(r.poly.length),
          tipX: Math.round(r.tipX),
          tipY: Math.round(r.tipY),
          connected: r.reachesTarget(),
        })),
      day: () => ({
        day: this.day,
        secondsLeft: this.secondsLeft,
        quota: dayQuota(this.day),
        honey: this.field.honey,
        phase: this.phase,
      }),
      save: () => this.save,
      endDayNow: () => {
        this.secondsLeft = 0.01;
      },
    };
  }
}
