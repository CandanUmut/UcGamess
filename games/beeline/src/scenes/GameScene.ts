import Phaser from 'phaser';
import {
  BaseGameplayScene,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  centerPlayfield,
  viewRect,
} from '@ucgames/core';
import { COLORS, TUNING } from '../config/tuning.ts';
import { Field, WORLD_HEIGHT, WORLD_WIDTH } from '../sim/Field.ts';
import type { Route } from '../sim/Route.ts';
import { type SamplePoint } from '../sim/polyline.ts';
import { createGeneratedTextures, TEX_FILES } from '../render/textures.ts';
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
} from '../game/DayCycle.ts';
import { deriveStats } from '../game/Upgrades.ts';
import { modifiersFor } from '../game/Items.ts';
import { Tutorial } from '../game/Tutorial.ts';
import { coerceSave, writeSave, SAVE_KEY, type BeelineSave } from '../game/SaveState.ts';
import { computeOffline, formatAway } from '../game/Offline.ts';
import type { NightData } from './NightScene.ts';

/**
 * Fog sits above the terrain and the routes but below the swarm and the juice.
 *
 * That ordering is deliberate: a bee flying into the dark stays visible while
 * the ground around it is still black, so the player can see their scouts out
 * ahead of what they know. Putting fog on top of everything would hide the
 * thing doing the exploring.
 */
const DEPTH = {
  patch: 10,
  hive: 20,
  route: 30,
  fog: 35,
  bee: 40,
  /**
   * Numbers drawn on the board: pollen left, a buyer's price, the hive's store.
   *
   * Above the fog and above the swarm, both deliberately. These are the figures
   * the game asks the player to act on, and a count that a passing bee or a
   * patch of mist can take away is one the player learns not to trust. The
   * things they label still fade under fog, so the board still reads as
   * half-known.
   */
  boardLabel: 45,
  juice: 50,
  hud: 100,
} as const;
// Nunito first, system stack behind it. The fallback is load-bearing twice
// over: the face may not have arrived (see main.ts), and the subset is
// deliberately small, so a glyph it lacks — the play triangle, the arrow — is
// drawn by the next family along.
const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Shortest gap between two collection notes, in seconds.
 *
 * The collection sound is the one the player hears most, so its *rate* matters
 * as much as its timbre — see `Sfx.collectBlip`.
 */
const COLLECT_NOTE_GAP = 0.09;

/**
 * Shortest gap between two sell coins, in seconds.
 *
 * Longer than the collect gap, because a coin is meant to land as a distinct
 * event rather than as texture. A sell line delivers in a stream, so without
 * this a single sale is a burst of overlapping chinks.
 */
const SELL_NOTE_GAP = 0.16;

/**
 * How long between two passing bees, in seconds.
 *
 * Wide, and randomised inside the range. A flyby on a fixed cadence stops being
 * a bee within about three repeats and becomes a metronome — irregularity is
 * most of what makes an ambient sound read as ambience rather than as a cue.
 * At a day of 45 to 90 seconds this lands a handful of times a day.
 */
const BUZZ_GAP_MIN = 5.5;
const BUZZ_GAP_MAX = 13;

/** How long a finger must rest on a route to erase it. */
const ERASE_HOLD_SECONDS = 0.75;
/** Movement beyond this cancels the hold and treats the gesture as a draw. */
const ERASE_MOVE_TOLERANCE = 18;

const eraseSample: SamplePoint = { x: 0, y: 0, tx: 0, ty: 0 };

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
  private fogRenderer!: FogRenderer;
  private juice!: Juice;
  private hud!: Hud;
  private sfx!: Sfx;

  private save!: BeelineSave;
  private day = 1;
  private secondsLeft = 0;
  /** `loading` until the save has been read; the simulation is idle until then. */
  private phase: 'loading' | 'playing' | 'ended' = 'loading';

  // --- drag state -------------------------------------------------------
  private previewGfx!: Phaser.GameObjects.Graphics;

  // --- press-and-hold erase ---------------------------------------------
  private eraseCandidate: Route | null = null;
  private holdSeconds = 0;
  /**
   * Set when a hold has just erased a line, and cleared when the finger lifts.
   *
   * The erase clears `eraseCandidate` and `holdSeconds` the instant it fires,
   * so by the time the pointer comes up there is nothing left to tell the tap
   * handler what happened — and it would helpfully open the dial on top of the
   * line the player had only just removed. This flag is the one piece of that
   * gesture that has to outlive it.
   */
  private erasedThisGesture = false;
  private pressX = 0;
  private pressY = 0;

  /** Sim time of the last collection note, for the rate limit. */
  private lastCollectNote = -1;
  private lastSellNote = -1;
  /** Field time of the next passing bee. Rolled forward on every buzz. */
  private nextBuzzAt = 0;
  private lastSpillNote = -1;

  private externallyPaused = false;

  // --- first-run teaching ----------------------------------------------
  private hintGfx!: Phaser.GameObjects.Graphics;
  private hasDrawnEver = false;
  private idleSeconds = 0;
  private tutorial = new Tutorial(false);
  private tutorialText!: Phaser.GameObjects.Text;
  private routesDrawn = 0;

  constructor() {
    super({ key: 'Game' });
  }

  preload(): void {
    createGeneratedTextures(this);
    // Built here rather than in the night scene: textures live on the game's
    // texture manager, not a scene's, and the night scene is launched and
    // stopped repeatedly. Generating them once at boot means the shop never
    // waits and never rebuilds fifteen canvases between days.
    createItemIcons(this);

    // The only files the game fetches, and nothing depends on them: the bee
    // falls back to a version drawn in code, the flowers and the ground fall
    // back to primitives, and the music simply does not play. A portal CDN that
    // drops one of these costs looks, never a boot.
    for (const [key, path] of TEX_FILES) this.load.image(key, path);
    this.load.audio(MUSIC_KEY, MUSIC_FILES);
    this.load.on('loaderror', (file: { key: string }) => {
      console.warn(`[beeline] optional asset "${file.key}" failed to load.`);
    });
  }

  protected build(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    // The canvas matches the device's shape, so it is usually wider (or taller)
    // than the 1280x720 playfield. Scrolling the camera centres the playfield
    // inside it, which means everything below stays authored against 1280x720
    // and none of it has to know the canvas grew.
    centerPlayfield(this);

    // Start from a fresh save so the field can be built immediately; the real
    // one is read a microtask later in bootstrap().
    this.save = coerceSave(null);
    this.day = this.save.day;

    this.field = new Field();
    this.field.setStats(deriveStats(this.save.levels));

    this.fieldRenderer = new FieldRenderer(
      this,
      this.field,
      DEPTH.patch,
      DEPTH.boardLabel,
    );
    this.routeRenderer = new RouteRenderer(this, DEPTH.route);
    this.previewGfx = this.add.graphics().setDepth(DEPTH.route + 1);
    this.hintGfx = this.add.graphics().setDepth(DEPTH.route + 2);
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
      .text(DESIGN_WIDTH / 2, 96, '', {
        fontFamily: FONT,
        fontSize: '23px',
        color: '#ffd966',
        align: 'center',
        stroke: '#12100c',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 1);
    this.sfx = new Sfx(this);

    this.fieldRenderer.setViewRect(viewRect(this));
    this.hud.layout(this.safeArea);
    this.bindInput();

    // Installed here rather than at boot: the harness handle reads live
    // simulation state, and until this point there is no simulation to read.
    // Removed before submission.
    (window as unknown as Record<string, unknown>).__beeline = this.debugHandle();

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

    // Only ever on a genuinely fresh save. A returning player has already been
    // taught, and being taught twice is worse than not being taught at all.
    this.tutorial = new Tutorial(!this.save.tutorialDone && this.save.day === 1);

    this.claimOfflineHoney();
    this.beginDay();
  }

  protected override layout(): void {
    // Re-centre first: a rotate changes the canvas shape, and the HUD anchors
    // to the new edges rather than to the playfield's.
    centerPlayfield(this);
    this.fieldRenderer?.setViewRect(viewRect(this));
    this.hud?.layout(this.safeArea);
  }

  // ------------------------------------------------------------------ day

  private beginDay(extraSeconds = 0): void {
    this.phase = 'playing';
    this.day = this.save.day;
    // Field time restarts at dawn, so the buzz clock has to as well — without
    // this the first bee of every day goes past on frame one.
    this.scheduleBuzz();

    const features = featuresForDay(this.day);
    const patchCount = patchesForDay(this.day) + this.save.levels.bloom;

    // The run's items are read fresh every dawn and never consumed. That is
    // the whole difference from the provisions they replace: a purchase is
    // something the hive now *is*, for as long as the run lasts.
    const modifiers = modifiersFor(this.save.items);

    this.field.setStats(deriveStats(this.save.levels));
    this.field.beginDay(this.day, features, patchCount, 1, modifiers);

    this.secondsLeft = dayLength(this.day) + extraSeconds + modifiers.extraDaySeconds;
    this.beeRenderer.resize(this.field.bees.length);

    this.hud.resetDay();
    this.hud.setVisible(true);
    this.hud.update(this.day, 0, dayQuota(this.day), this.secondsLeft);

    const intro = dayIntroduction(this.day);
    if (intro) this.hud.showBanner(intro);

    this.idleSeconds = 0;
    this.sfx.startHum();
    this.sfx.startMusic();
    // Respect a pause that is already in force — the rotate gate can be up
    // before the first day ever starts, and starting gameplay here anyway was
    // measured to let the countdown run behind the prompt.
    if (!this.externallyPaused) this.startGameplay();
  }

  private endDay(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'ended';

    this.stopGameplay();
    this.sfx.play('dayEnd', 0.45);
    this.cameras.main.flash(220, 60, 50, 30);

    const result = evaluateDay(this.day, this.field.money, this.save.bestDayMoney);

    this.save.money += Math.floor(result.money);
    this.save.bestDayMoney = Math.max(this.save.bestDayMoney, Math.floor(result.money));
    this.save.bestRunDay = Math.max(this.save.bestRunDay, this.day);
    this.save.lastPlayedAt = Date.now();
    if (this.tutorial.finished) this.save.tutorialDone = true;
    this.tutorial.dismiss();
    this.tutorialText.setText('');

    // Missing the quota ends the run, but never the progress. Upgrades and
    // unspent honey persist and the next run starts at day one — which is now
    // easy, because the swarm is bigger than it was. That is what keeps a fail
    // state from ending the session: "one more run" with a stronger hive,
    // rather than "all of that for nothing".
    if (result.outcome === 'met') {
      this.save.day = this.day + 1;
    } else {
      this.save.day = 1;
      // The run's items go with the run. Keeping them would collapse the two
      // tracks into one and take the roguelite shape out of the shop: what
      // makes a night interesting is that this hive is not last hive.
      this.save.items = [];
    }

    // A fresh table every night, and the reroll price starts over. Stored
    // rather than rolled in the night scene so a reload does not hand the
    // player a free reroll.
    this.save.offer = [];
    this.save.rerolls = 0;
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

  /**
   * Rewarded "+15s": resume the same board rather than restarting it.
   *
   * With a real fail state this is now a genuine rescue — it saves the run, not
   * just the day — which is exactly the kind of rewarded offer that is worth
   * watching an ad for and does not feel like a shakedown.
   */
  private resumeWithExtraTime(): void {
    this.scene.stop('Night');
    this.scene.resume();

    // Roll back the day-end bookkeeping, since the day is continuing.
    this.save.money -= Math.floor(this.field.money);
    this.save.day = this.day;
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
    if (offline.money <= 0) return;

    this.save.money += offline.money;
    this.save.lastPlayedAt = Date.now();
    this.persist();

    const text = this.add
      .text(
        DESIGN_WIDTH / 2,
        DESIGN_HEIGHT - 110,
        `+${offline.money} honey while you were away (${formatAway(offline.hoursAway)})`,
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

      this.pressX = p.worldX;
      this.pressY = p.worldY;
      this.holdSeconds = 0;
      this.erasedThisGesture = false;

      // A press that lands on an existing line *might* be an erase. It only
      // becomes one if the finger stays put; lifting turns it back into a tap.
      this.eraseCandidate = this.field.routeNear(p.worldX, p.worldY);
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.eraseCandidate) return;
      if (
        Math.hypot(p.worldX - this.pressX, p.worldY - this.pressY) > ERASE_MOVE_TOLERANCE
      ) {
        this.eraseCandidate = null;
        this.holdSeconds = 0;
      }
    });

    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'playing') return;

      this.eraseCandidate = null;
      this.holdSeconds = 0;

      // The hold already erased a line; do not also open the dial on top of it.
      if (this.erasedThisGesture) {
        this.erasedThisGesture = false;
        return;
      }

      this.hasDrawnEver = true;
      const before = this.field.aim.mode;
      this.field.tap(p.worldX, p.worldY);

      // One sound per step of the ritual, each a little different, so the
      // three taps are audibly three different things.
      if (before === 'idle') this.sfx.playVaried('draw', 0.2, 180);
      else if (before === 'aiming') this.sfx.playVaried('draw', 0.3, 60);
    });

    // A pointer leaving the canvas mid-aim should not strand the dial.
    this.input.on(Phaser.Input.Events.GAME_OUT, () => {
      this.eraseCandidate = null;
      this.holdSeconds = 0;
      this.erasedThisGesture = false;
    });
  }

  /**
   * The moment a scout finds a flower.
   *
   * Worth more fanfare than anything else in the game. Exploring costs workers,
   * costs time, and can end in a thicket — if the discovery itself is not
   * satisfying then the whole loop of pushing into the dark has no payoff at
   * its end, and the player will simply stop doing it.
   */
  private showDiscovery(x: number, y: number, honey: number): void {
    for (let i = 0; i < 10; i += 1) this.juice.collect(x, y, 3);
    this.sfx.play('upgrade', 0.32);

    const label = this.add
      .text(x, y - 84, `+${honey}`, {
        fontFamily: FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#ffd966',
        stroke: '#12100c',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.juice);

    this.tweens.add({
      targets: label,
      y: label.y - 34,
      alpha: 0,
      duration: 1100,
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /**
   * The brush where a route met a wall and ran along it.
   *
   * Quieter and smaller than the snip it replaces, deliberately. A severed
   * route was a loss and wanted to land like one; a slide costs the player a
   * little length and nothing else. On a maze board a line touches a wall
   * constantly, so dressing each contact up as a catastrophe would make the
   * game feel like it was scolding you for playing it.
   */
  private showDeflect(x: number, y: number): void {
    this.juice.scatter(x, y);
    this.sfx.playVaried('draw', 0.1, 520);
  }

  /** Advances the press-and-hold that erases a route. */
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
    for (let i = 0; i < 6; i += 1) {
      this.juice.scatter(route.tipX, route.tipY);
    }

    // Consume the whole gesture so releasing does not also open the dial.
    this.erasedThisGesture = true;
    this.eraseCandidate = null;
    this.holdSeconds = 0;
    this.previewGfx.clear();
  }

  /**
   * Pauses gameplay for a reason outside the game — currently the portrait
   * rotate prompt. The day timer must not run while the player physically
   * cannot play, or they lose a day to a message meant to help them.
   */
  setExternallyPaused(paused: boolean): void {
    this.externallyPaused = paused;
    if (paused) this.stopGameplay();
    else if (this.phase === 'playing') this.startGameplay();
  }

  // --------------------------------------------------------------- update

  protected fixedUpdate(dt: number): void {
    if (this.phase !== 'playing' || this.externallyPaused) return;

    this.updateEraseHold(dt);
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
    this.fieldRenderer.draw(this.field, alpha, this.field.aim.mode !== 'idle');
    this.fogRenderer.draw(this.field.fog);
    this.drawPreview();
    this.drawHint();
    this.drawEraseHold();
  }

  /** The filling ring that shows a hold is about to erase a route. */
  private drawEraseHold(): void {
    const route = this.eraseCandidate;
    if (!route || this.holdSeconds <= 0) return;

    const progress = Math.min(1, this.holdSeconds / ERASE_HOLD_SECONDS);
    const g = this.previewGfx;
    g.clear();

    // Dim the route it will remove, so there is no doubt which one is going.
    g.lineStyle(3, 0xff7043, 0.5 * progress);
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

  override update(time: number, delta: number): void {
    super.update(time, delta);

    const seconds = delta / 1000;
    this.juice.update(seconds);
    this.consumeEvents();

    if (this.phase === 'playing') {
      this.hud.update(this.day, this.field.money, dayQuota(this.day), this.secondsLeft);

      // A bee goes past now and then. Only while there is a swarm to hear —
      // a buzz over an empty board is a sound with nothing making it.
      if (this.field.time >= this.nextBuzzAt && this.field.bees.length > 0) {
        this.scheduleBuzz();
        this.sfx.playVaried('buzz', 0.1, 260);
      }

      this.hud.setPrices(
        this.field.buyers.map((b) => ({
          name: b.tuning.name,
          price: b.price,
          trend: b.trend,
          tint: b.tuning.tint,
        })),
      );

      this.tutorial.update({
        routesDrawn: this.routesDrawn,
        honey: this.field.honey,
        money: this.field.money,
      });
      this.tutorialText.setText(this.tutorial.current?.text ?? '');

      const building = this.field.countBuilders();
      this.hud.setSwarm(this.field.bees.length - building, building, this.field.beesLost);
      this.hud.setLines(this.field.routes.length, this.field.stats.routeSlots);
      this.hud.setUnfound(
        this.field.patches.filter((p) => p.alive && !p.discovered).length,
      );

      // Three states, in the order that matters most: being robbed right now
      // beats an incoming raid, which beats wasps still crossing the field.
      const crossing = this.field.wasps.filter((w) => w.state === 'approaching').length;
      this.hud.setAlert(
        this.field.underAttack
          ? 'The hive is being robbed!'
          : this.field.raidWarningAt
            ? 'Wasps incoming'
            : crossing > 0
              ? `${crossing} wasp${crossing > 1 ? 's' : ''} closing in`
              : null,
        seconds,
      );
    }
  }

  /** Turns simulation events into sound and particles, once per frame. */
  private consumeEvents(): void {
    const events = this.field.drainEvents();

    for (const hit of events.collected) {
      this.juice.collect(hit.x, hit.y, hit.amount);
    }
    // At most one note every COLLECT_NOTE_GAP seconds, however many bees
    // collected.
    //
    // One per *frame* was the old rule and it is not enough: at sixty frames a
    // second a working swarm turns a pleasant note into a drone, and the nicer
    // the note the more it drones. Roughly eleven a second is the point where
    // the ear still hears individual notes and reads them as a phrase.
    if (
      events.collected.length > 0 &&
      this.field.time - this.lastCollectNote >= COLLECT_NOTE_GAP
    ) {
      this.lastCollectNote = this.field.time;
      this.sfx.playNote('collect', 0.15);
    }

    if (events.deposited > 0) {
      this.juice.deposit(this.field.hiveX, this.field.hiveY);
      this.sfx.playVaried('deposit', 0.13);
    }

    for (const hit of events.scattered) this.juice.scatter(hit.x, hit.y);
    if (events.scattered.length > 0) this.sfx.playVaried('wasp', 0.2);

    // A route severed by thorns gets the same acknowledgement as anything else
    // that happened to the player. Losing a line silently is the difference
    // between "the thorns cut me off" and "the game ate my drag".
    for (const hit of events.deflected) this.showDeflect(hit.x, hit.y);

    // Finding a flower is the payoff for exploring, so it gets the biggest
    // one-off in the game: a burst, a rising chime, and the honey it holds
    // floating up off it.
    for (const found of events.found) this.showDiscovery(found.x, found.y, found.honey);

    if (events.raidWarning) {
      this.sfx.playVaried('wasp', 0.34, 90);
      this.hud.showBanner(
        events.raidWarning.size > 1
          ? `${events.raidWarning.size} wasps incoming — draw a line at them`
          : 'A wasp is coming — draw a line at it',
      );
    }

    for (const hit of events.struck) this.juice.scatter(hit.x, hit.y);
    if (events.struck.length > 0) this.sfx.playVaried('draw', 0.22, 400);

    // Standing a guard line down is a success, not a loss, and the player has
    // to be told it happened or the line simply vanishes on them.
    for (const spot of events.stoodDown) {
      this.showGain(spot.x, spot.y, 'all clear', '#9bd3a0');
    }

    for (const down of events.waspDown) {
      for (let i = 0; i < 8; i += 1) this.juice.scatter(down.x, down.y);
      this.sfx.play('upgrade', 0.3);
    }

    // Honey draining out of the hive is the one loss the player must never
    // have to infer from a number going down.
    if (events.stolen > 0) {
      this.juice.scatter(this.field.hiveX, this.field.hiveY);
    }

    for (const lost of events.beesLost) {
      this.showLoss(lost.x, lost.y, 'bee lost');
      this.sfx.playVaried('wasp', 0.24);
    }

    for (const lost of events.pollenLost) this.showLoss(lost.x, lost.y, 'pollen!');

    // A bloom nobody reached. The clearest possible statement of what the game
    // wants from the player, and the only loss they can always have prevented.
    for (const gone of events.wilted) {
      this.showLoss(gone.x, gone.y, 'wilted');
      this.juice.scatter(gone.x, gone.y);
    }
    if (events.wilted.length > 0) this.sfx.playVaried('wasp', 0.16, 420);

    // A new bloom, where the last one is not.
    for (const bloom of events.bloomed) {
      for (let i = 0; i < 4; i += 1) this.juice.collect(bloom.x, bloom.y, 2);
    }
    if (events.bloomed.length > 0) this.sfx.playNote('collect', 0.11);

    for (const gone of events.replaced) this.showLoss(gone.x, gone.y, 'line dropped');

    // A sale is the payoff of the whole loop, so it lands where it happened —
    // at the buyer, in that buyer's colour, with the money it made.
    for (const sale of events.sold) {
      for (let i = 0; i < 5; i += 1) this.juice.collect(sale.x, sale.y, 4);
      this.showGain(sale.x, sale.y, `+${Math.round(sale.money)}`, '#ffe9a8');
    }
    // One coin per frame at most, however many bees landed together. A sell
    // line delivers in a stream, and a stream of chinks stacking on the same
    // frame is a rattle rather than a payday — the same rate limit the collect
    // blip needed, for the same reason.
    if (events.sold.length > 0 && this.field.time - this.lastSellNote >= SELL_NOTE_GAP) {
      this.lastSellNote = this.field.time;
      // On the scale rather than at a random detune, so consecutive sales in a
      // good run land as an arpeggio instead of as noise.
      this.sfx.playNote('sell', 0.3);
    }

    // Spilling is the one loss the player is meant to feel as urgency rather
    // than as damage: it is not the wasps taking your honey, it is you failing
    // to sell it. Rate-limited to one word a second so a brimming hive nags
    // rather than screams.
    // A sell line was dropped because the player pointed at the other shop.
    // Said out loud at the shop that lost the business: a route vanishing on
    // its own is exactly the kind of thing a player reads as a bug unless the
    // game tells them it meant to.
    const dropped = events.droppedBuyer;
    if (dropped) {
      // A floating word rather than `showLoss`, which scatters particles: the
      // player did not lose anything here, they chose somewhere else.
      this.showGain(dropped.x, dropped.y - 108, `${dropped.name} closed`, '#cfc6ae');
    }

    if (events.spilled > 0 && this.field.time - this.lastSpillNote >= 1) {
      this.lastSpillNote = this.field.time;
      this.showLoss(this.field.hiveX, this.field.hiveY - 40, 'spilling!');
    }
  }

  /**
   * Sets when the next bee goes past.
   *
   * Rolled forward from the current time rather than accumulated, so a paused
   * or a fast-forwarded day cannot leave a backlog of buzzes to fire at once.
   */
  private scheduleBuzz(): void {
    this.nextBuzzAt =
      this.field.time + BUZZ_GAP_MIN + Math.random() * (BUZZ_GAP_MAX - BUZZ_GAP_MIN);
  }

  /** A small bright word where the player gained something. */
  private showGain(x: number, y: number, text: string, colour: string): void {
    const label = this.add
      .text(x, y - 30, text, {
        fontFamily: FONT,
        fontSize: '20px',
        fontStyle: 'bold',
        color: colour,
        stroke: '#12100c',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.juice);

    this.tweens.add({
      targets: label,
      y: label.y - 30,
      alpha: 0,
      duration: 900,
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /** A small red word where something was taken from the player. */
  private showLoss(x: number, y: number, text: string): void {
    this.juice.scatter(x, y);
    const label = this.add
      .text(x, y - 26, text, {
        fontFamily: FONT,
        fontSize: '17px',
        color: '#ff8a70',
        stroke: '#12100c',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.juice);

    this.tweens.add({
      targets: label,
      y: label.y - 26,
      alpha: 0,
      duration: 780,
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /**
   * The dial, and the shot in flight.
   *
   * Drawn on the preview layer because that is exactly what it is: the thing
   * the player is about to commit. The arrow reddens as the dial winds up, so
   * "it is getting away from me" is visible before it is felt.
   */
  private drawPreview(): void {
    const g = this.previewGfx;
    g.clear();
    if (this.eraseCandidate) return;

    const aim = this.field.aim;
    if (aim.mode === 'idle') return;

    if (aim.mode === 'aiming') {
      const r = TUNING.aim.dialRadius;
      const heat = aim.tension;
      const tint = blendTint(0xffd166, 0xff5a3c, heat);

      g.lineStyle(3, tint, 0.35);
      g.strokeCircle(aim.anchorX, aim.anchorY, r);
      g.lineStyle(2, tint, 0.16);
      g.strokeCircle(aim.anchorX, aim.anchorY, r * 0.55);

      // The arrow. Drawn as a stalk with a head so the direction reads at a
      // glance rather than having to be inferred from a line's far end.
      const tipX = aim.anchorX + Math.cos(aim.angle) * (r + 26);
      const tipY = aim.anchorY + Math.sin(aim.angle) * (r + 26);
      g.lineStyle(6, tint, 0.95);
      g.beginPath();
      g.moveTo(aim.anchorX, aim.anchorY);
      g.lineTo(tipX, tipY);
      g.strokePath();

      const wing = 0.42;
      g.fillStyle(tint, 0.95);
      g.beginPath();
      g.moveTo(tipX, tipY);
      g.lineTo(
        tipX - Math.cos(aim.angle - wing) * 22,
        tipY - Math.sin(aim.angle - wing) * 22,
      );
      g.lineTo(
        tipX - Math.cos(aim.angle + wing) * 22,
        tipY - Math.sin(aim.angle + wing) * 22,
      );
      g.closePath();
      g.fillPath();
      return;
    }

    // In flight: the road so far, plus how much of the shot is left.
    const coords = aim.coords;
    if (coords.length >= 4) {
      g.lineStyle(7, 0xffd166, 0.9);
      g.beginPath();
      g.moveTo(coords[0] ?? 0, coords[1] ?? 0);
      for (let i = 2; i < coords.length; i += 2) {
        g.lineTo(coords[i] ?? 0, coords[i + 1] ?? 0);
      }
      g.strokePath();
    }

    // A ghost of the distance still available, so stopping early is an
    // informed choice rather than a guess.
    const leftX = aim.headX + Math.cos(aim.angle) * aim.flightLeft;
    const leftY = aim.headY + Math.sin(aim.angle) * aim.flightLeft;
    g.lineStyle(2, 0xffffff, 0.18);
    g.beginPath();
    g.moveTo(aim.headX, aim.headY);
    g.lineTo(leftX, leftY);
    g.strokePath();

    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(aim.headX, aim.headY, 6);
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

    const show = this.tutorial.wantsHintLine && this.phase === 'playing';
    if (!show) return;

    const patch = this.field.nearestPatchTo(
      this.field.hiveX,
      this.field.hiveY,
      Number.POSITIVE_INFINITY,
      true,
    );
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
      patches: () =>
        this.field.patches.map((p) => ({
          x: Math.round(p.x),
          y: Math.round(p.y),
          alive: p.alive,
          pool: Math.round(p.pool),
          honeyLeft: Math.round(p.honeyLeft),
          multiplier: Number(p.distanceMultiplier.toFixed(2)),
          discovered: p.discovered,
          kind: p.kind,
        })),
      builders: () => this.field.countBuilders(),
      beeStates: () => {
        const out: Record<string, number> = {};
        for (const b of this.field.bees) out[b.state] = (out[b.state] ?? 0) + 1;
        return out;
      },
      maze: () => ({
        cols: this.field.maze.cols,
        rows: this.field.maze.rows,
        openWalls: (() => {
          const m = this.field.maze;
          let open = 0;
          for (let r = 0; r < m.rows; r += 1) {
            for (let c = 1; c < m.cols; c += 1) if (!m.wallLeft(c, r)) open += 1;
          }
          for (let r = 1; r < m.rows; r += 1) {
            for (let c = 0; c < m.cols; c += 1) if (!m.wallAbove(c, r)) open += 1;
          }
          return open;
        })(),
      }),
      explored: () => this.field.fog.exploredFraction(),
      // Lights the whole board, for inspecting a generated maze without having
      // to fly it. Part of the harness handle, removed before submission.
      revealAll: () => {
        this.field.fog.cells.fill(1);
        this.field.fog.dirty = true;
      },
      stats: () => this.field.getStats(),
      routes: () =>
        this.field.routes.map((r) => ({
          id: r.id,
          live: Math.round(r.liveLength),
          total: Math.round(r.poly.length),
          tipX: Math.round(r.tipX),
          tipY: Math.round(r.tipY),
          strength: Number(r.strength.toFixed(2)),
          connected: r.reachesTarget(),
          buyer: r.targetBuyer ? r.targetBuyer.id : null,
          guard: r.guard,
          wasp: r.targetWasp ? 1 : 0,
        })),
      day: () => ({
        day: this.day,
        secondsLeft: this.secondsLeft,
        quota: dayQuota(this.day),
        honey: this.field.honey,
        money: this.field.money,
        phase: this.phase,
      }),
      buyers: () =>
        this.field.buyers.map((b) => ({
          id: b.id,
          x: b.x,
          y: b.y,
          price: Number(b.price.toFixed(2)),
        })),
      aim: () => ({
        mode: this.field.aim.mode,
        angle: Number(this.field.aim.angle.toFixed(2)),
        spin: Number(this.field.aim.spinSpeed.toFixed(2)),
      }),
      routeNear: (x: number, y: number) => !!this.field.routeNear(x, y),
      hold: () => ({
        candidate: !!this.eraseCandidate,
        held: Number(this.holdSeconds.toFixed(2)),
        phase: this.phase,
      }),
      screenOf: (x: number, y: number) => {
        const cam = this.cameras.main;
        const canvas = this.game.canvas.getBoundingClientRect();
        const scale = canvas.width / this.scale.gameSize.width;
        return {
          x: canvas.left + (x - cam.scrollX) * scale,
          y: canvas.top + (y - cam.scrollY) * scale,
        };
      },
      save: () => this.save,
      // Lands a raid on demand. The clock is deliberately random, so without
      // this a harness check of the raid would be a check of the dice.
      raidNow: () => this.field.spawnRaidNow().length,
      wasps: () =>
        this.field.wasps.map((w) => ({
          x: Math.round(w.x),
          y: Math.round(w.y),
          state: w.state,
          health: w.health,
        })),
      endDayNow: () => {
        this.secondsLeft = 0.01;
      },
    };
  }
}

/** Linear blend between two packed RGB colours, for the dial's heat. */
function blendTint(from: number, to: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(
    ((from >> 16) & 0xff) + (((to >> 16) & 0xff) - ((from >> 16) & 0xff)) * k,
  );
  const g = Math.round(
    ((from >> 8) & 0xff) + (((to >> 8) & 0xff) - ((from >> 8) & 0xff)) * k,
  );
  const b = Math.round((from & 0xff) + ((to & 0xff) - (from & 0xff)) * k);
  return (r << 16) | (g << 8) | b;
}
