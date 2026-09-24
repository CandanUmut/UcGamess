import Phaser from 'phaser';
import {
  BaseGameplayScene,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  centerPlayfield,
  viewRect,
} from '@ucgames/core';
import { TUNING } from '../config/tuning.ts';
import {
  Field,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type LinePlan,
  type LineStart,
} from '../sim/Field.ts';
import type { Route } from '../sim/Route.ts';
import { type SamplePoint } from '../sim/polyline.ts';
import { createGeneratedTextures, loadShippedTextures, TEX } from '../render/textures.ts';
import { createItemIcons } from '../render/itemIcons.ts';
import { createBeeRenderer, type BeeRenderer } from '../render/BeeRenderer.ts';
import { RouteRenderer } from '../render/RouteRenderer.ts';
import { FieldRenderer } from '../render/FieldRenderer.ts';
import { FogRenderer } from '../render/FogRenderer.ts';
import { Juice } from '../render/Juice.ts';
import { Hud } from '../ui/Hud.ts';
import { MUSIC_FILES, MUSIC_KEY, Sfx } from '../audio/Sfx.ts';
import {
  dayLength,
  dayQuota,
  patchesForDay,
  featuresForDay,
  dayIntroduction,
  evaluateDay,
  sunsetBonus,
  type DayResult,
} from '../game/DayCycle.ts';
import { deriveStats } from '../game/Upgrades.ts';
import { modifiersFor, rollOffer } from '../game/Items.ts';
import { Tutorial } from '../game/Tutorial.ts';
import { coerceSave, writeSave, SAVE_KEY, type BeelineSave } from '../game/SaveState.ts';
import type { NightData } from './NightScene.ts';

/**
 * Fog sits above the terrain and the routes but below the swarm and the juice.
 *
 * That ordering is deliberate: a bee flying into the dark stays visible while
 * the ground around it is still misted, so the player can see their scouts out
 * ahead of what they know.
 */
const DEPTH = {
  patch: 10,
  hive: 20,
  route: 30,
  fog: 35,
  bee: 40,
  /**
   * Numbers drawn on the board. Above the fog and the swarm: these are the
   * figures the game asks the player to act on, and a count a passing bee can
   * hide is one the player learns not to trust.
   */
  boardLabel: 45,
  juice: 50,
  hud: 100,
} as const;

// Nunito first, system stack behind it. The subset is deliberately small, so a
// glyph it lacks is drawn by the next family along.
const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Shortest gap between two collection notes, in seconds.
 *
 * The collection sound is the one the player hears most, so its *rate* matters
 * as much as its timbre: at sixty a second a pleasant note becomes a drone.
 */
const COLLECT_NOTE_GAP = 0.09;
/** How often honey arriving at the hive is totalled into one floating "+N". */
const DEPOSIT_TALLY_GAP = 0.45;

/** How long between two passing bees, in seconds. Irregular on purpose. */
const BUZZ_GAP_MIN = 5.5;
const BUZZ_GAP_MAX = 13;

/** How long a finger must rest on a line to erase it. */
const ERASE_HOLD_SECONDS = 0.6;
/** Movement beyond this cancels the hold. */
const ERASE_MOVE_TOLERANCE = 18;
/** A press that moves less than this is a tap, not a drag. */
const TAP_SLOP = 24;
/** Seconds of celebration between the last flower going dry and the day card. */
const CLEAR_PAUSE = 1.4;

const eraseSample: SamplePoint = { x: 0, y: 0, tx: 0, ty: 0 };

/**
 * The game.
 *
 *   fixedUpdate(dt)  — simulation only, constant dt, identical at 60/144Hz
 *   renderUpdate(a)  — interpolated drawing, no game logic
 *   update()         — frame-rate-dependent visuals (juice) and input polling
 *
 * The one verb: **drag a beeline from the hive to a flower.** The line is
 * previewed while the finger is down exactly as it will be laid, sliding along
 * any hedge in the way; letting go lays it and the bees start flying at once.
 * Tapping a flower lays a straight line to it, and tapping a wasp swats it.
 */
export class GameScene extends BaseGameplayScene {
  private field!: Field;
  private beeRenderer!: BeeRenderer;
  private routeRenderer!: RouteRenderer;
  private fieldRenderer!: FieldRenderer;
  private fogRenderer!: FogRenderer;
  private juice!: Juice;
  private hud!: Hud;
  private sfx!: Sfx;

  private save!: BeelineSave;
  private day = 1;
  private secondsLeft = 0;
  private daySeconds = 0;
  /** `loading` until the save has been read; the simulation is idle until then. */
  private phase: 'loading' | 'playing' | 'clearing' | 'ended' = 'loading';
  private clearTimer = 0;

  // --- the drag --------------------------------------------------------
  private previewGfx!: Phaser.GameObjects.Graphics;
  private dragStart: LineStart | null = null;
  private plan: LinePlan | null = null;

  // --- press-and-hold erase ---------------------------------------------
  private eraseCandidate: Route | null = null;
  private holdSeconds = 0;
  private erasedThisGesture = false;
  private swattedThisGesture = false;
  private pressX = 0;
  private pressY = 0;

  private lastCollectNote = -1;
  private nextBuzzAt = 0;
  private depositTally = 0;
  private depositTallyAt = 0;
  private stolenTally = 0;

  private externallyPaused = false;

  // --- first-run teaching ----------------------------------------------
  private hintGfx!: Phaser.GameObjects.Graphics;
  private tutorial = new Tutorial(false);
  private tutorialText!: Phaser.GameObjects.Text;
  private routesDrawn = 0;

  constructor() {
    super({ key: 'Game' });
  }

  preload(): void {
    createGeneratedTextures(this);
    createItemIcons(this);

    // The only files the game fetches, and nothing depends on them: every
    // sprite falls back to a version drawn in code and the music simply does
    // not play. A portal CDN that drops one of these costs looks, never a boot.
    loadShippedTextures(this);
    if (!this.cache.audio.exists(MUSIC_KEY)) this.load.audio(MUSIC_KEY, MUSIC_FILES);
    this.load.on('loaderror', (file: { key: string }) => {
      console.warn(`[beeline] optional asset "${file.key}" failed to load.`);
    });
  }

  protected build(): void {
    this.cameras.main.setBackgroundColor('#e9f0d6');
    // The canvas matches the device's shape; scrolling the camera centres the
    // 1280x720 playfield inside it, so everything below stays authored
    // against 1280x720.
    centerPlayfield(this);

    this.save = coerceSave(null);
    this.day = this.save.day;

    this.field = new Field();

    this.fieldRenderer = new FieldRenderer(
      this,
      this.field,
      DEPTH.patch,
      DEPTH.boardLabel,
    );
    this.routeRenderer = new RouteRenderer(this, DEPTH.route);
    this.previewGfx = this.add.graphics().setDepth(DEPTH.route + 1);
    this.hintGfx = this.add.graphics().setDepth(DEPTH.juice + 1);
    this.fogRenderer = new FogRenderer(
      this,
      this.field.fog,
      WORLD_WIDTH,
      WORLD_HEIGHT,
      DEPTH.fog,
    );
    this.beeRenderer = createBeeRenderer(this, 'sprite', DEPTH.bee);
    this.juice = new Juice(this, DEPTH.juice);
    this.hud = new Hud(this, DEPTH.hud);
    this.tutorialText = this.add
      .text(DESIGN_WIDTH / 2, 150, '', {
        fontFamily: FONT,
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#ffe38a',
        align: 'center',
        stroke: '#2a1d08',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 1);
    this.sfx = new Sfx(this);

    this.fieldRenderer.setViewRect(viewRect(this));
    this.hud.layout(this.safeArea);
    this.bindInput();

    // The harness handle reads live simulation state. Removed before submission.
    (window as unknown as Record<string, unknown>).__beeline = this.debugHandle();

    void this.bootstrap();
  }

  /**
   * Reads the save, then starts the day it says.
   *
   * `SaveManager.load()` is what hydrates the cache from storage; without it
   * `save.get()` returns the default and progress silently resets on reload.
   * It resolves in a microtask for localStorage, so the game is still
   * interactive immediately.
   */
  private async bootstrap(): Promise<void> {
    try {
      await this.context.save.load();
    } catch (error) {
      console.warn('[beeline] Could not read save; starting fresh.', error);
    }

    this.save = coerceSave(this.context.save.get<unknown>(SAVE_KEY, null));
    this.day = this.save.day;

    // Only ever on a genuinely fresh save. Being taught twice is worse than not
    // being taught at all.
    this.tutorial = new Tutorial(!this.save.tutorialDone && this.save.day === 1);

    // A run saved mid-draft resumes at the draft rather than skipping it.
    if (this.save.offer.length > 0 && this.save.day > 1) {
      this.showNight(null);
      return;
    }
    this.beginDay();
  }

  protected override layout(): void {
    centerPlayfield(this);
    this.fieldRenderer?.setViewRect(viewRect(this));
    this.hud?.layout(this.safeArea);
  }

  // ------------------------------------------------------------------ day

  private beginDay(): void {
    this.phase = 'playing';
    this.day = this.save.day;
    this.scheduleBuzz();

    const modifiers = modifiersFor(this.save.items);
    const stats = deriveStats(modifiers);
    this.field.setStats(stats);
    this.field.beginDay(
      this.day,
      featuresForDay(this.day),
      patchesForDay(this.day) + stats.extraPatches,
      1,
      modifiers,
    );

    this.daySeconds = dayLength(this.day) + modifiers.extraDaySeconds;
    this.secondsLeft = this.daySeconds;
    this.beeRenderer.resize(this.field.bees.length);
    this.cancelDrag();

    this.hud.resetDay();
    this.hud.setVisible(true);
    this.hud.update(
      this.day,
      0,
      dayQuota(this.day),
      this.secondsLeft,
      this.daySeconds,
      0,
    );

    const intro = dayIntroduction(this.day);
    this.hud.showBanner(intro ?? `Day ${this.day} — goal ${dayQuota(this.day)}`);

    this.sfx.startHum();
    this.sfx.startMusic();
    // Respect a pause already in force — the rotate gate can be up before the
    // first day ever starts.
    if (!this.externallyPaused) this.startGameplay();
  }

  /**
   * The day is over: by dusk, or by clearing the meadow.
   *
   * Clearing early pays the sunset bonus for the daylight left, which is what
   * makes speed worth something rather than a way to end the fun sooner.
   */
  private endDay(cleared: boolean): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.cancelDrag();

    this.stopGameplay();
    this.sfx.play('dayEnd', 0.45);

    const bonus = cleared ? sunsetBonus(this.day, this.secondsLeft) : 0;
    const result = evaluateDay(this.day, Math.floor(this.field.honey) + bonus, bonus);

    this.save.runScore += result.score;
    this.save.bestRunDay = Math.max(this.save.bestRunDay, this.day);
    if (this.tutorial.finished) this.save.tutorialDone = true;
    this.tutorial.dismiss();
    this.tutorialText.setText('');

    if (result.outcome === 'met') {
      this.save.day = this.day + 1;
      this.save.offer = rollOffer(
        this.day + 1,
        featuresForDay(this.day + 1),
        Math.random,
        result.stars,
      );
    }
    // A missed day is handled by the night screen, which may still rescue it
    // with extra time before the run is closed.
    this.persist();

    this.hud.setVisible(false);
    this.showNight(result);
  }

  private showNight(result: DayResult | null): void {
    const data: NightData = {
      result,
      save: this.save,
      sfx: this.sfx,
      onExtend: () => this.resumeWithExtraTime(),
      onNextDay: () => this.startNextDay(),
      onRunOver: () => this.closeRun(),
      onChanged: () => this.persist(),
    };
    this.phase = 'ended';
    this.scene.launch('Night', data);
    this.scene.pause();
  }

  /** Banks the run's score into the records and starts the save over. */
  private closeRun(): void {
    this.save.bestScore = Math.max(this.save.bestScore, this.save.runScore);
    this.save.day = 1;
    this.save.runScore = 0;
    this.save.items = [];
    this.save.offer = [];
    this.persist();
  }

  /**
   * Rewarded "+15s": resume the same board rather than restarting it.
   *
   * With a real fail state this is a genuine rescue — it saves the run, not
   * just the day — which is the kind of rewarded offer worth watching an ad
   * for.
   */
  private resumeWithExtraTime(): void {
    this.scene.stop('Night');
    this.scene.resume();

    // Roll back the day-end bookkeeping, since the day is continuing.
    this.save.runScore -= Math.floor(this.field.honey);
    this.save.day = this.day;
    this.save.offer = [];
    this.persist();

    this.phase = 'playing';
    this.secondsLeft = TUNING.ads.extendSeconds;
    this.hud.setVisible(true);
    this.startGameplay();
  }

  private startNextDay(): void {
    this.scene.stop('Night');
    this.scene.resume();
    if (this.save.day === 1) this.field.clearRoutes();
    this.beginDay();
  }

  private persist(): void {
    writeSave(this.context.save, this.save);
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
      if (this.phase !== 'playing' || this.externallyPaused) return;

      this.pressX = p.worldX;
      this.pressY = p.worldY;
      this.holdSeconds = 0;
      this.erasedThisGesture = false;
      this.swattedThisGesture = false;

      // A wasp under the finger wins everything: it is the only thing on the
      // board that needs an answer this second.
      if (this.field.swatAt(p.worldX, p.worldY)) {
        this.swattedThisGesture = true;
        return;
      }

      const start = this.field.lineStartAt(p.worldX, p.worldY);
      if (start) {
        this.dragStart = start;
        this.plan = null;
        this.sfx.playVaried('draw', 0.14, 300);
        return;
      }

      // A press on a line might be an erase, if the finger stays put.
      this.eraseCandidate = this.field.routeNear(p.worldX, p.worldY);
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.dragStart && p.isDown) {
        this.plan = this.field.planLine(this.dragStart, p.worldX, p.worldY);
        return;
      }
      if (!this.eraseCandidate) return;
      if (
        Math.hypot(p.worldX - this.pressX, p.worldY - this.pressY) > ERASE_MOVE_TOLERANCE
      ) {
        this.eraseCandidate = null;
        this.holdSeconds = 0;
      }
    });

    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'playing') {
        this.cancelDrag();
        return;
      }
      this.eraseCandidate = null;
      this.holdSeconds = 0;

      if (this.swattedThisGesture || this.erasedThisGesture) {
        this.swattedThisGesture = false;
        this.erasedThisGesture = false;
        return;
      }

      const moved = Math.hypot(p.worldX - this.pressX, p.worldY - this.pressY);

      if (this.dragStart && moved > TAP_SLOP) {
        const plan = this.field.planLine(this.dragStart, p.worldX, p.worldY);
        this.layLine(plan);
        this.cancelDrag();
        return;
      }
      this.cancelDrag();

      // A tap. On a flower, lay a beeline to it; anywhere else, nothing —
      // except a gentle reminder of where lines come from.
      const route = this.field.tapFlower(p.worldX, p.worldY);
      if (route) {
        this.routesDrawn += 1;
        this.sfx.playVaried('draw', 0.3, 120);
      } else if (moved <= TAP_SLOP) {
        this.fieldRenderer.pingHive();
      }
    });

    // A pointer leaving the canvas mid-drag should not strand the preview.
    this.input.on(Phaser.Input.Events.GAME_OUT, () => {
      this.cancelDrag();
      this.eraseCandidate = null;
      this.holdSeconds = 0;
    });
  }

  private layLine(plan: LinePlan): void {
    const route = this.field.commitLine(plan);
    if (!route) return;
    this.routesDrawn += 1;
    this.sfx.playVaried('draw', plan.target ? 0.34 : 0.22, plan.target ? 90 : 260);
  }

  private cancelDrag(): void {
    this.dragStart = null;
    this.plan = null;
    this.previewGfx?.clear();
  }

  /** Advances the press-and-hold that erases a line. */
  private updateEraseHold(dt: number): void {
    const route = this.eraseCandidate;
    if (!route || route.dead) {
      this.eraseCandidate = null;
      return;
    }

    this.holdSeconds += dt;
    if (this.holdSeconds < ERASE_HOLD_SECONDS) return;

    this.field.killRoute(route);
    this.sfx.playVaried('deposit', 0.25, 300);
    for (let i = 0; i < 6; i += 1) this.juice.scatter(route.tipX, route.tipY);

    this.erasedThisGesture = true;
    this.eraseCandidate = null;
    this.holdSeconds = 0;
  }

  /**
   * Pauses gameplay for a reason outside the game — currently the portrait
   * rotate prompt. The day timer must not run while the player physically
   * cannot play.
   */
  setExternallyPaused(paused: boolean): void {
    this.externallyPaused = paused;
    if (paused) {
      this.cancelDrag();
      this.stopGameplay();
    } else if (this.phase === 'playing') this.startGameplay();
  }

  // --------------------------------------------------------------- update

  protected fixedUpdate(dt: number): void {
    if (this.externallyPaused) return;

    if (this.phase === 'clearing') {
      // The bees keep flying home while the meadow celebrates.
      this.field.step(dt);
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) this.endDay(true);
      return;
    }
    if (this.phase !== 'playing') return;

    this.updateEraseHold(dt);
    this.field.step(dt);

    this.secondsLeft -= dt;
    if (this.secondsLeft <= 0) {
      this.secondsLeft = 0;
      this.endDay(false);
    }
  }

  protected override renderUpdate(alpha: number): void {
    this.beeRenderer.sync(this.field.bees, alpha);
    this.routeRenderer.draw(this.field.routes, this.field.time);
    this.fieldRenderer.draw(this.field, alpha, this.dragStart !== null);
    this.fogRenderer.draw(this.field.fog);
    this.drawPreview();
    this.drawHint();
    this.drawEraseHold();
  }

  override update(time: number, delta: number): void {
    super.update(time, delta);

    const seconds = delta / 1000;
    this.juice.update(seconds);
    this.consumeEvents();

    if (this.phase === 'playing' || this.phase === 'clearing') {
      this.hud.update(
        this.day,
        this.field.honey,
        dayQuota(this.day),
        this.secondsLeft,
        this.daySeconds,
        seconds,
      );

      if (this.field.time >= this.nextBuzzAt && this.field.bees.length > 0) {
        this.scheduleBuzz();
        this.sfx.playVaried('buzz', 0.1, 260);
      }

      this.tutorial.update({
        routesDrawn: this.routesDrawn,
        honey: this.field.honey,
        lines: this.field.routes.length,
      });
      this.tutorialText.setText(this.tutorial.current?.text ?? '');

      const slots = this.field.stats.routeSlots;
      this.hud.setLines(this.field.routes.length, slots);
      this.hud.setIdle(this.field.idleBees, this.field.routes.length < slots);

      const crossing = this.field.wasps.filter((w) => w.state === 'approaching').length;
      this.hud.setAlert(
        this.field.underAttack
          ? 'The hive is being robbed — tap the wasps!'
          : this.field.raidWarningAt
            ? 'Wasps incoming!'
            : crossing > 0
              ? `${crossing} wasp${crossing > 1 ? 's' : ''} — tap to swat`
              : null,
        seconds,
      );
    }
  }

  /** Turns simulation events into sound and particles, once per frame. */
  private consumeEvents(): void {
    const events = this.field.drainEvents();
    const now = this.field.time;

    for (const hit of events.collected) this.juice.collect(hit.x, hit.y, hit.amount);
    if (events.collected.length > 0 && now - this.lastCollectNote >= COLLECT_NOTE_GAP) {
      this.lastCollectNote = now;
      this.sfx.playNote('collect', 0.13);
    }

    // Honey arriving is the score arriving, so it gets a number at the hive —
    // totalled over a short window so a stream reads as a rhythm of "+6 +7 +5"
    // rather than a smear of "+1"s.
    if (events.deposited > 0) {
      this.depositTally += events.deposited;
      this.juice.deposit(this.field.hiveX, this.field.hiveY);
      this.fieldRenderer.bumpHive();
    }
    if (this.depositTally >= 1 && now - this.depositTallyAt >= DEPOSIT_TALLY_GAP) {
      this.depositTallyAt = now;
      const amount = Math.floor(this.depositTally);
      this.depositTally -= amount;
      this.floatText(
        this.field.hiveX + (Math.random() - 0.5) * 50,
        this.field.hiveY - 70,
        `+${amount}`,
        '#ffd466',
        18 + Math.min(14, amount),
      );
      this.sfx.playNote('sell', 0.16);
      this.flyDrop();
    }

    for (const hit of events.scattered) this.juice.scatter(hit.x, hit.y);
    if (events.scattered.length > 0) this.sfx.playVaried('wasp', 0.2);

    for (const hit of events.deflected) {
      this.juice.scatter(hit.x, hit.y);
      this.sfx.playVaried('draw', 0.08, 520);
    }

    for (const found of events.found) {
      for (let i = 0; i < 8; i += 1) this.juice.collect(found.x, found.y, 3);
      this.sfx.play('upgrade', 0.26);
      this.floatText(found.x, found.y - 70, 'found!', '#fff4d6', 20);
    }

    if (events.raidWarning) {
      this.sfx.playVaried('wasp', 0.34, 90);
      this.hud.showBanner(
        events.raidWarning.size > 1
          ? `${events.raidWarning.size} wasps incoming — tap to swat!`
          : 'A wasp is coming — tap to swat!',
        '#ffb09c',
      );
    }

    for (const hit of events.struck) {
      for (let i = 0; i < 6; i += 1) this.juice.scatter(hit.x, hit.y);
      this.fieldRenderer.splat(hit.x, hit.y);
      this.cameras.main.shake(70, 0.0025);
    }
    if (events.struck.length > 0) this.sfx.playVaried('swat', 0.55, 180);

    for (const down of events.waspDown) {
      for (let i = 0; i < 14; i += 1) this.juice.scatter(down.x, down.y);
      this.floatText(
        down.x,
        down.y - 30,
        down.bounty > 0 ? `swatted! +${down.bounty}` : 'swatted!',
        '#b8f0a0',
        24,
      );
      this.sfx.play('upgrade', 0.36);
      this.cameras.main.shake(140, 0.005);
    }

    if (events.stolen > 0) {
      this.stolenTally += events.stolen;
      this.juice.scatter(this.field.hiveX, this.field.hiveY);
    }
    if (this.stolenTally >= 3) {
      this.floatText(
        this.field.hiveX + 60,
        this.field.hiveY - 50,
        `-${Math.floor(this.stolenTally)}`,
        '#ff8a70',
        22,
      );
      this.stolenTally = 0;
    }

    for (const lost of events.beesLost) this.juice.scatter(lost.x, lost.y);

    for (const spot of events.lineLaid) {
      for (let i = 0; i < 6; i += 1) this.juice.collect(spot.x, spot.y, 2);
      if (spot.connected) this.sfx.playVaried('pop', 0.35, 150);
    }

    for (const spot of events.drained) {
      for (let i = 0; i < 8; i += 1) this.juice.collect(spot.x, spot.y, 3);
      this.floatText(spot.x, spot.y - 50, 'all gathered!', '#fff4d6', 18);
      this.sfx.playVaried('deposit', 0.22, 200);
    }

    for (const spot of events.fizzled) {
      this.floatText(spot.x, spot.y - 30, 'nothing here', '#e9dcc0', 16);
    }

    for (const bloom of events.bloomed) {
      for (let i = 0; i < 12; i += 1) this.juice.collect(bloom.x, bloom.y, 4);
      this.sfx.play('sparkle', 0.45);
      this.hud.showBanner('A golden bloom! Quick — it closes soon', '#ffe38a');
    }

    for (const gone of events.wilted) {
      this.floatText(gone.x, gone.y - 40, 'closed', '#ff8a70', 18);
    }

    if (events.cleared && this.phase === 'playing') {
      this.phase = 'clearing';
      this.clearTimer = CLEAR_PAUSE;
      this.cancelDrag();
      this.hud.showBanner(
        `Meadow cleared! +${sunsetBonus(this.day, this.secondsLeft)} sunset bonus`,
        '#ffe38a',
      );
      this.sfx.play('fanfare', 0.55);
      this.cameras.main.flash(260, 255, 230, 150);
    }
  }

  /**
   * A drop of honey flies from the hive up into the counter.
   *
   * Ties the two halves of the reward together: the swarm is doing it down
   * there, and it is adding up up here. In screen space, since the counter is
   * part of the HUD and the HUD does not scroll.
   */
  private flyDrop(): void {
    if (!this.textures.exists(TEX.honeyDrop) || !this.hud) return;
    const cam = this.cameras.main;
    const from = {
      x: this.field.hiveX - cam.scrollX,
      y: this.field.hiveY - cam.scrollY - 30,
    };
    const to = this.hud.honeyAnchor;
    const drop = this.add
      .image(from.x, from.y, TEX.honeyDrop)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 2)
      .setDisplaySize(26, 26);
    // Up first, then over — an arc reads as thrown, a straight line as slid.
    const lift = 60 + Math.random() * 40;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 620,
      ease: 'Sine.easeIn',
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * lift;
        drop.setPosition(x, y).setRotation(t * 1.5);
      },
      onComplete: () => {
        drop.destroy();
        this.hud.catchDrop();
      },
    });
  }

  private scheduleBuzz(): void {
    this.nextBuzzAt =
      this.field.time + BUZZ_GAP_MIN + Math.random() * (BUZZ_GAP_MAX - BUZZ_GAP_MIN);
  }

  /** A word or number that rises and fades where something happened. */
  private floatText(
    x: number,
    y: number,
    text: string,
    colour: string,
    size: number,
  ): void {
    const label = this.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: `${Math.round(size)}px`,
        fontStyle: 'bold',
        color: colour,
        stroke: '#1d160c',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.juice)
      .setScale(0.6);

    this.tweens.add({ targets: label, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: label,
      y: y - 36,
      alpha: 0,
      delay: 380,
      duration: 700,
      ease: 'Quad.easeIn',
      onComplete: () => label.destroy(),
    });
  }

  /**
   * The line under the finger, exactly as letting go would lay it.
   *
   * Green and ringed when it ends on a flower, pale and open when it does
   * not, so "will this connect?" is answered before the finger lifts.
   */
  private drawPreview(): void {
    const g = this.previewGfx;
    g.clear();
    const plan = this.plan;
    if (!this.dragStart || !plan || plan.coords.length < 4) {
      if (this.dragStart) {
        // Pressed but not moved yet: show where the line starts from.
        g.lineStyle(4, 0xffe38a, 0.9);
        g.strokeCircle(
          this.dragStart.x,
          this.dragStart.y,
          26 + Math.sin(this.field.time * 8) * 3,
        );
      }
      return;
    }

    const hit = plan.target !== null;
    const tint = hit ? 0x7ee08a : 0xfff4d6;
    const coords = plan.coords;

    g.lineStyle(12, 0x1d160c, 0.25);
    g.beginPath();
    g.moveTo(coords[0] ?? 0, coords[1] ?? 0);
    for (let i = 2; i < coords.length; i += 2)
      g.lineTo(coords[i] ?? 0, coords[i + 1] ?? 0);
    g.strokePath();

    // Dashes that march outward, so the preview reads as "bees will go this way".
    const dash = 16;
    const offset = (this.field.time * 90) % (dash * 2);
    let run = -offset;
    g.lineStyle(7, tint, 0.95);
    for (let i = 2; i < coords.length; i += 2) {
      const ax = coords[i - 2] ?? 0;
      const ay = coords[i - 1] ?? 0;
      const bx = coords[i] ?? 0;
      const by = coords[i + 1] ?? 0;
      const len = Math.hypot(bx - ax, by - ay);
      let s = 0;
      while (s < len) {
        const phase = (((run + s) % (dash * 2)) + dash * 2) % (dash * 2);
        const inDash = phase < dash;
        const step = Math.min(len - s, inDash ? dash - phase : dash * 2 - phase);
        if (inDash) {
          const t0 = s / len;
          const t1 = (s + step) / len;
          g.beginPath();
          g.moveTo(ax + (bx - ax) * t0, ay + (by - ay) * t0);
          g.lineTo(ax + (bx - ax) * t1, ay + (by - ay) * t1);
          g.strokePath();
        }
        s += Math.max(step, 0.5);
      }
      run += len;
    }

    const tipX = coords[coords.length - 2] ?? 0;
    const tipY = coords[coords.length - 1] ?? 0;
    if (hit && plan.target) {
      const pulse = 1 + Math.sin(this.field.time * 10) * 0.08;
      g.lineStyle(5, tint, 1);
      g.strokeCircle(
        plan.target.x,
        plan.target.y,
        TUNING.patch.reachRadius * 0.6 * pulse,
      );
    } else {
      g.fillStyle(tint, 0.9);
      g.fillCircle(tipX, tipY, 8);
    }
    if (plan.contact) {
      g.fillStyle(0xff9a5c, 0.9);
      g.fillCircle(plan.contact.x, plan.contact.y, 6);
    }
  }

  /** The filling ring that shows a hold is about to erase a line. */
  private drawEraseHold(): void {
    const route = this.eraseCandidate;
    if (!route || this.holdSeconds <= 0.08) return;

    const progress = Math.min(1, this.holdSeconds / ERASE_HOLD_SECONDS);
    const g = this.previewGfx;

    g.lineStyle(4, 0xff7043, 0.6 * progress);
    g.beginPath();
    for (let s = 0; s <= route.liveLength; s += 12) {
      route.sample(s, eraseSample);
      if (s === 0) g.moveTo(eraseSample.x, eraseSample.y);
      else g.lineTo(eraseSample.x, eraseSample.y);
    }
    g.strokePath();

    const radius = 26;
    g.lineStyle(5, 0x000000, 0.35);
    g.strokeCircle(this.pressX, this.pressY, radius);
    g.lineStyle(5, 0xff7043, 0.95);
    g.beginPath();
    g.arc(
      this.pressX,
      this.pressY,
      radius,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * progress,
      false,
    );
    g.strokePath();
  }

  /**
   * The tutorial hand: a finger that drags from the hive to the best nearby
   * flower, over and over, until the player does it themselves.
   */
  private drawHint(): void {
    const g = this.hintGfx;
    g.clear();

    if (!this.tutorial.wantsHintLine || this.phase !== 'playing' || this.dragStart)
      return;
    const served = new Set(this.field.routes.map((r) => r.target));
    const patch = this.field.knownPatches
      .filter((p) => !served.has(p))
      .sort(
        (a, b) =>
          Math.hypot(a.x - this.field.hiveX, a.y - this.field.hiveY) -
          Math.hypot(b.x - this.field.hiveX, b.y - this.field.hiveY),
      )[0];
    if (!patch) return;

    const cycle = (this.field.time * 0.55) % 1;
    // Rest at the hive, glide to the flower, rest there, fade.
    const t = Math.min(1, Math.max(0, (cycle - 0.15) / 0.55));
    const ease = t * t * (3 - 2 * t);
    const fx = this.field.hiveX + (patch.x - this.field.hiveX) * ease;
    const fy = this.field.hiveY + (patch.y - this.field.hiveY) * ease;
    const alpha = cycle > 0.85 ? (1 - cycle) / 0.15 : 1;

    g.lineStyle(6, 0xffffff, 0.55 * alpha);
    g.beginPath();
    g.moveTo(this.field.hiveX, this.field.hiveY);
    g.lineTo(fx, fy);
    g.strokePath();

    // The finger: a pale disc with a dark rim, pressed a little while dragging.
    const pressed = t > 0 && t < 1;
    g.fillStyle(0x000000, 0.25 * alpha);
    g.fillCircle(fx + 4, fy + 6, 20);
    g.fillStyle(0xfff4d6, 0.95 * alpha);
    g.fillCircle(fx, fy, pressed ? 17 : 20);
    g.lineStyle(3, 0x2a1d08, 0.9 * alpha);
    g.strokeCircle(fx, fy, pressed ? 17 : 20);
  }

  /** Exposed for the automated harness. Removed before submission. */
  debugHandle(): Record<string, unknown> {
    return {
      hive: { x: this.field.hiveX, y: this.field.hiveY },
      patches: () =>
        this.field.patches.map((p) => ({
          x: Math.round(p.x),
          y: Math.round(p.y),
          alive: p.alive,
          pool: Math.round(p.pool),
          honeyLeft: Math.round(p.honeyLeft),
          discovered: p.discovered,
          kind: p.kind,
        })),
      routes: () =>
        this.field.routes.map((r) => ({
          id: r.id,
          bees: r.beeCount,
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
        idle: this.field.idleBees,
      }),
      wasps: () =>
        this.field.wasps.map((w) => ({
          x: Math.round(w.x),
          y: Math.round(w.y),
          state: w.state,
          health: w.health,
        })),
      screenOf: (x: number, y: number) => {
        const cam = this.cameras.main;
        const canvas = this.game.canvas.getBoundingClientRect();
        const scale = canvas.width / this.scale.gameSize.width;
        return {
          x: canvas.left + (x - cam.scrollX) * scale,
          y: canvas.top + (y - cam.scrollY) * scale,
        };
      },
      revealAll: () => {
        this.field.fog.cells.fill(1);
        this.field.fog.dirty = true;
      },
      save: () => this.save,
      raidNow: () => this.field.spawnRaidNow().length,
      endDayNow: () => {
        this.secondsLeft = 0.01;
      },
      jumpToDay: (day: number) => {
        this.save.day = day;
        this.beginDay();
      },
      size: { width: DESIGN_WIDTH, height: DESIGN_HEIGHT },
    };
  }
}
