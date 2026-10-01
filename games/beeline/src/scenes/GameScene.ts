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
import { applyUpgrades } from '../game/HiveUpgrades.ts';
import { unlockAchievements, type AchievementDef } from '../game/Achievements.ts';
import { Tutorial } from '../game/Tutorial.ts';
import { Lesson, type LessonState } from '../game/Lessons.ts';
import { clearRival, Rivalry } from '../game/Rival.ts';
import { RivalRenderer } from '../render/RivalRenderer.ts';
import { coerceSave, writeSave, SAVE_KEY, type BeelineSave } from '../game/SaveState.ts';
import type { NightData } from './NightScene.ts';
import type { LevelDoneData } from './LevelDoneScene.ts';
import type { PauseData } from './PauseScene.ts';
import {
  LEVELS_PER_WORLD,
  levelById,
  levelFeatures,
  levelModifiers,
  levelStarsForTime,
  withSeed,
  type LevelDef,
} from '../game/Levels.ts';

/** What the Game scene was started to play. */
export type GameStart = { mode: 'endless' } | { mode: 'level'; level: number };

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
const ERASE_HOLD_SECONDS = 0.8;
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
  /** Endless run, or one campaign level. Set by `init` from the start data. */
  private start: GameStart = { mode: 'endless' };
  /** The campaign level being played, or null in the endless run. */
  private level: LevelDef | null = null;
  private day = 1;
  private secondsLeft = 0;
  private daySeconds = 0;
  /**
   * `loading` until the save has been read; the simulation is idle until then.
   * `intro` is a level's goal card, up until the first touch.
   */
  private phase: 'loading' | 'intro' | 'playing' | 'clearing' | 'ended' = 'loading';
  /** The level clock: runs from the first line, and only while playing. */
  private clockStarted = false;
  private levelClock = 0;
  /** When the jar filled, on the level clock; null until it does. */
  private filledAt: number | null = null;
  private lesson = new Lesson(undefined);
  private lessonDrained = 0;
  private goalCard: Phaser.GameObjects.Container | null = null;
  /** Throttle for "lines start at the hive" nudges. */
  private lastNudgeAt = -99;
  /** Words floating over the board, cleared when a new board starts. */
  private floating = new Set<Phaser.GameObjects.Text>();
  private clearTimer = 0;

  // --- the drag --------------------------------------------------------
  private previewGfx!: Phaser.GameObjects.Graphics;
  private dragStart: LineStart | null = null;
  private plan: LinePlan | null = null;
  /**
   * Legs already fixed in this drag. A drag that bends round a hedge is laid
   * as straight legs: when the straight line to the finger would hit a
   * hedge, the leg so far is pinned where the finger last had a clear line,
   * and the next leg starts there.
   */
  private legs: LinePlan[] = [];
  private lastClear: { x: number; y: number } | null = null;

  // --- press-and-hold erase ---------------------------------------------
  private eraseCandidate: Route | null = null;
  /** Whose line the hold would erase: yours, or a wasp raid on your hive. */
  private eraseField: Field | null = null;
  /** The raid-out banner has been shown this board. */
  private raidOutAnnounced = false;
  /** Wasp raid lines the player has cut, for the lesson. */
  private raidCuts = 0;
  /** Raided honey not yet shown as a floating number, each way. */
  private raidTally = { lost: 0, gained: 0, at: 0 };
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
  /** The race was won on the fuller jar when the meadow ran dry. */
  private wonDry = false;
  /** The race ended because the meadow ran dry (either way). */
  private raceDry = false;
  /** Both jars at the moment the race was decided. */
  private finalScore: { me: number; rival: number } | null = null;
  /** The wasp colony racing for the same flowers, on boards that have one. */
  private rival: Rivalry | null = null;
  private rivalRenderer!: RivalRenderer;

  // --- first-run teaching ----------------------------------------------
  private hintGfx!: Phaser.GameObjects.Graphics;
  private tutorial = new Tutorial(false);
  private tutorialText!: Phaser.GameObjects.Text;
  private routesDrawn = 0;
  /** Achievements the last endless day unlocked, for the night screen. */
  private nightAchievements: AchievementDef[] = [];
  /** Today's finds, for the bank's tally and the level card. */
  private finds = { flowers: 0, pots: 0, royals: 0, bees: 0 };

  constructor() {
    super({ key: 'Game' });
  }

  init(data: Partial<GameStart> | undefined): void {
    if (
      data?.mode === 'level' &&
      typeof (data as { level?: unknown }).level === 'number'
    ) {
      this.start = { mode: 'level', level: (data as { level: number }).level };
    } else {
      this.start = { mode: 'endless' };
    }
    this.phase = 'loading';
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
    this.rivalRenderer = new RivalRenderer(
      this,
      DEPTH.route,
      DEPTH.bee,
      DEPTH.boardLabel,
    );
    this.juice = new Juice(this, DEPTH.juice);
    this.hud = new Hud(this, DEPTH.hud);
    this.tutorialText = this.add
      .text(DESIGN_WIDTH / 2, DESIGN_HEIGHT - 22, '', {
        fontFamily: FONT,
        fontSize: '21px',
        fontStyle: 'bold',
        color: '#ffe38a',
        align: 'center',
        stroke: '#2a1d08',
        strokeThickness: 5,
        backgroundColor: 'rgba(42, 33, 20, 0.82)',
        padding: { x: 16, y: 5 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 1);
    this.sfx = new Sfx(this);

    this.fieldRenderer.setViewRect(viewRect(this));
    this.hud.layout(this.safeArea);
    this.hud.onPause = () => this.openPause();
    this.input.keyboard?.on('keydown-P', () => this.openPause());
    // Losing focus pauses with the card up, so a player who clicked outside
    // the portal frame comes back to "Paused", not to a day half gone.
    this.game.events.on(Phaser.Core.Events.BLUR, this.openPause, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.game.events.off(Phaser.Core.Events.BLUR, this.openPause, this),
    );
    // A star earned mid-level is the best moment in it: a chime that climbs
    // with each one, and a flash of gold.
    this.hud.onStar = (star) => {
      this.sfx.play('sparkle', 0.4, (star - 1) * 300);
      this.cameras.main.flash(160, 255, 220, 120);
    };
    this.bindInput();

    // The harness handle reads live simulation state. Dev and `local` builds only.
    if (__UCGAMES_DEV__ || __UCGAMES_PORTAL__ === 'local') {
      (window as unknown as Record<string, unknown>).__beeline = this.debugHandle();
    }

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

    if (this.start.mode === 'level') {
      this.level = levelById(this.start.level) ?? levelById(1) ?? null;
      // The tutorial belongs to the very first level of a fresh save.
      this.tutorial = new Tutorial(!this.save.tutorialDone && this.level?.id === 1);
      this.beginDay();
      return;
    }
    this.level = null;

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
    if (this.level) {
      this.beginLevel(this.level);
      return;
    }
    this.phase = 'playing';
    this.day = this.save.day;
    this.scheduleBuzz();
    // Endless has no rival colony.
    this.rival = null;
    clearRival(this.field);
    this.rivalRenderer.setNest(null);
    this.routeRenderer.tint = null;
    this.resetFinds();

    const modifiers = applyUpgrades(modifiersFor(this.save.items), this.save.upgrades);
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
    this.hud.setPauseVisible(true);
    this.refreshHud(0);

    const intro = dayIntroduction(this.day);
    this.hud.showBanner(intro ?? `Day ${this.day} — goal ${dayQuota(this.day)}`);

    this.sfx.startHum();
    this.sfx.startMusic();
    // Respect a pause already in force — the rotate gate can be up before the
    // first day ever starts.
    if (!this.externallyPaused) this.startGameplay();
  }

  /**
   * Sets up one campaign level: its own seeded board, hive and clock.
   *
   * The board is built under a fixed seed so a level is the same meadow every
   * time — something to learn and replay for the third star. The simulation
   * itself runs on the ordinary random source afterwards, so golden blooms
   * and wasps still keep a player honest.
   */
  private beginLevel(level: LevelDef): void {
    this.resetFinds();
    for (const label of this.floating) label.destroy();
    this.floating.clear();
    this.hud.clearBanner();
    this.phase = 'playing';
    this.day = level.difficulty;
    this.scheduleBuzz();

    const modifiers = applyUpgrades(levelModifiers(level), this.save.upgrades);
    this.field.setStats(deriveStats(modifiers));
    withSeed(level.seed, () =>
      this.field.beginDay(
        level.difficulty,
        levelFeatures(level),
        level.flowers,
        1,
        modifiers,
      ),
    );

    // Open already, so the board is readable behind the goal card.
    for (const patch of this.field.patches) patch.bloomT = 1;
    clearRival(this.field);
    this.rival = level.rival ? new Rivalry(level.rival) : null;
    this.rival?.begin(this.field, {
      fog: level.fog,
      beeSpeedBonus: modifiers.beeSpeedBonus,
    });
    this.rivalRenderer.setNest(level.rival ?? null);
    this.wonDry = false;
    this.raceDry = false;
    this.raidCuts = 0;
    this.raidOutAnnounced = false;
    this.hud.setAlert(null);
    this.finalScore = null;
    // Against the wasps, your lines are all honey-gold: red is theirs.
    this.routeRenderer.tint = level.rival ? 0xffc93c : null;
    // Flowers seen at dawn are not finds; drop the events beginDay raised.
    this.field.drainEvents();
    this.daySeconds = level.seconds;
    this.secondsLeft = level.timed ? level.seconds : 0;
    this.clockStarted = false;
    this.levelClock = 0;
    this.filledAt = null;
    this.routesDrawn = 0;
    this.lesson = new Lesson(level.lesson, level.lessonPoints);
    this.lessonDrained = 0;
    this.beeRenderer.resize(this.field.bees.length);
    this.cancelDrag();

    this.hud.resetDay();
    this.hud.setVisible(true);
    this.hud.setPauseVisible(true);
    this.refreshHud(0);

    this.sfx.startHum();
    this.sfx.startMusic();
    this.showGoalCard(level);
  }

  /**
   * The goal, said once and big before anything moves: what fills the jar,
   * and whether the sun is up. The first touch anywhere puts it away.
   */
  private showGoalCard(level: LevelDef): void {
    this.phase = 'intro';
    this.goalCard?.destroy();
    const cx = DESIGN_WIDTH / 2;
    const cy = DESIGN_HEIGHT / 2 - 10;
    const card = this.add
      .container(cx, cy)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 5);
    const g = this.add.graphics();
    g.fillStyle(0x2a2114, 0.94);
    g.fillRoundedRect(-300, -120, 600, 240, 26);
    g.lineStyle(4, 0xffc93c, 0.9);
    g.strokeRoundedRect(-300, -120, 600, 240, 26);
    const say = (y: number, text: string, size: number, colour: string, bold = true) =>
      this.add
        .text(0, y, text, {
          fontFamily: FONT,
          fontSize: `${size}px`,
          fontStyle: bold ? 'bold' : 'normal',
          color: colour,
          align: 'center',
          stroke: '#1d160c',
          strokeThickness: bold ? 6 : 0,
        })
        .setOrigin(0.5);
    const number = `${level.world + 1}-${((level.id - 1) % LEVELS_PER_WORLD) + 1}`;
    card.add([
      g,
      say(-84, `${number}  ${level.name}`, 22, '#c9b98f', false),
      say(-34, `Fill the jar with ${level.goal} honey`, 38, '#ffe38a'),
      say(
        14,
        (level.rival
          ? 'before the wasps fill theirs'
          : level.timed
            ? `before the sun sets in ${level.seconds}s`
            : 'No time limit') + `   ·   ${this.field.stats.routeSlots} lines`,
        22,
        '#fff4d6',
        false,
      ),
      say(
        56,
        `★★★ within ${level.starTimes[0]}s   ·   ★★ within ${level.starTimes[1]}s   ·   ★ any time`,
        19,
        '#ffd466',
        false,
      ),
      say(96, 'Tap to start', 20, '#a8f0b4'),
    ]);
    card.setScale(0.8).setAlpha(0);
    this.tweens.add({
      targets: card,
      scale: 1,
      alpha: 1,
      duration: 260,
      ease: 'Back.easeOut',
    });
    this.goalCard = card;
  }

  /** Puts the goal card away and lets the board run. */
  private dismissGoalCard(): void {
    if (this.phase !== 'intro') return;
    const card = this.goalCard;
    this.goalCard = null;
    if (card) {
      this.tweens.add({
        targets: card,
        alpha: 0,
        scale: 0.9,
        duration: 160,
        onComplete: () => card.destroy(),
      });
    }
    this.phase = 'playing';
    // Against a rival the race starts when the card goes, not at the first
    // line: the wasps do not wait for you.
    if (this.level?.rival) this.clockStarted = true;
    if (!this.externallyPaused) this.startGameplay();
  }

  /** Honey for one, two and three stars on whatever is being played. */
  private get targets(): readonly [number, number, number] {
    if (this.level) return this.level.stars;
    const quota = dayQuota(this.day);
    return [
      quota,
      Math.round(quota * TUNING.score.twoStars),
      Math.round(quota * TUNING.score.threeStars),
    ];
  }

  /** The sunset bonus the daylight left would pay right now (endless only). */
  private get bonusNow(): number {
    return sunsetBonus(this.day, this.secondsLeft);
  }

  private refreshHud(deltaSeconds: number): void {
    if (this.level) {
      const level = this.level;
      this.hud.updateLevel(
        `${level.world + 1}-${((level.id - 1) % LEVELS_PER_WORLD) + 1}  ${level.name}`,
        this.field.honey,
        {
          goal: level.goal,
          clock: this.filledAt ?? this.levelClock,
          starTimes: level.starTimes,
          timed: level.timed,
          started: this.clockStarted,
          secondsLeft: this.secondsLeft,
          daySeconds: this.daySeconds,
          ...(this.rival ? { rival: this.rival.field.honey } : {}),
        },
        deltaSeconds,
      );
      return;
    }
    this.hud.update(
      `Day ${this.day}`,
      this.field.honey,
      this.targets,
      this.secondsLeft,
      this.daySeconds,
      deltaSeconds,
      {
        tier: this.field.comboTier,
        progress: this.field.comboProgress,
        slipping: this.field.comboSlipping,
      },
    );
  }

  /**
   * A campaign level is over. Stars are kept at their best, the honey at its
   * best, and the result goes to the level card.
   */
  private resetFinds(): void {
    this.finds = { flowers: 0, pots: 0, royals: 0, bees: 0 };
  }

  /** Treasures on today's board, and how many were found. */
  private treasureCount(): { found: number; total: number } {
    const royal = this.field.patches.filter((p) => p.kind === 'royal');
    const total = this.field.treasures.length + royal.length;
    const found =
      this.field.treasures.filter((t) => t.found).length +
      royal.filter((p) => p.discovered).length;
    return { found, total };
  }

  /**
   * Puts the day's honey in the bank and counts what was found and fought
   * toward the achievements. Returns any achievements this unlocked.
   */
  private bankDay(honey: number): AchievementDef[] {
    const banked = Math.max(0, Math.floor(honey));
    this.save.honeyBank += banked;
    this.save.lifetimeHoney += banked;
    const t = this.save.tally;
    t.wasps += this.field.waspsDowned;
    t.pots += this.finds.pots;
    t.royals += this.finds.royals;
    t.flowersFound += this.finds.flowers;
    t.bestCombo = Math.max(t.bestCombo, this.field.bestCombo);
    return unlockAchievements(this.save);
  }

  /**
   * A campaign level is over: the jar filled, or it could not be. Stars come
   * from how fast it filled; the honey goes to the bank either way, so even a
   * miss buys something.
   */
  private endLevel(level: LevelDef, why: 'filled' | 'sunset' | 'empty' | 'beaten'): void {
    this.phase = 'ended';
    this.cancelDrag();
    this.stopGameplay();
    this.sfx.play('dayEnd', 0.45);

    this.hud.setAlert(null);
    const filled = why === 'filled';
    const seconds = filled
      ? Math.max(1, Math.ceil(this.filledAt ?? this.levelClock))
      : null;
    const honey = Math.floor(this.field.honey);
    // A dry-meadow win never filled the jar: two stars at most.
    const stars = Math.min(levelStarsForTime(level, seconds), this.wonDry ? 2 : 3);
    const index = level.id - 1;
    const prevStars = this.save.levelStars[index] ?? 0;
    const prevBest = this.save.levelBest[index] ?? 0;
    const prevTime = this.save.levelTime[index] ?? 0;

    while (this.save.levelStars.length <= index) this.save.levelStars.push(0);
    while (this.save.levelBest.length <= index) this.save.levelBest.push(0);
    while (this.save.levelTime.length <= index) this.save.levelTime.push(0);
    this.save.levelStars[index] = Math.max(prevStars, stars);
    this.save.levelBest[index] = Math.max(prevBest, honey);
    if (seconds !== null && (prevTime === 0 || seconds < prevTime)) {
      this.save.levelTime[index] = seconds;
    }

    // A world is complete the first time all ten of its levels are passed.
    const first = level.world * LEVELS_PER_WORLD;
    const worldDone = Array.from(
      { length: LEVELS_PER_WORLD },
      (_, i) => (this.save.levelStars[first + i] ?? 0) >= 1,
    ).every(Boolean);
    const celebrateWorld = worldDone && !this.save.worldsCelebrated.includes(level.world);
    if (celebrateWorld) this.save.worldsCelebrated.push(level.world);

    const treasure = this.treasureCount();
    if (treasure.total > 0 && treasure.found >= treasure.total) {
      while (this.save.levelExplored.length <= index) this.save.levelExplored.push(0);
      this.save.levelExplored[index] = 1;
    }
    const unlocked = this.bankDay(honey);

    if (this.tutorial.finished || stars > 0) this.save.tutorialDone = true;
    // The portal's own celebration cue, for a star gained or a world finished —
    // not for every pass, or it stops meaning anything.
    if (stars > prevStars || celebrateWorld) this.context.portal.happyTime();
    this.tutorial.dismiss();
    this.tutorialText.setText('');
    this.hintGfx.clear();
    this.persist();
    this.hud.setVisible(false);

    const data: LevelDoneData = {
      ...(this.rival
        ? { rivalHoney: this.finalScore?.rival ?? Math.floor(this.rival.field.honey) }
        : {}),
      ...(this.raceDry ? { dry: true } : {}),
      level,
      honey: this.finalScore?.me ?? honey,
      stars,
      prevStars,
      seconds,
      prevTime,
      why,
      worldComplete: celebrateWorld ? level.world : null,
      treasure,
      foundHoney: Math.round(this.field.foundHoney),
      bank: this.save.honeyBank,
      achievements: unlocked,
      sfx: this.sfx,
      onRetry: () => this.replayLevel(level.id),
      onNext: () => this.replayLevel(level.id + 1),
      onMap: () => this.toMap(),
      onHive: () => this.toHive(),
    };
    this.scene.launch('LevelDone', data);
    this.scene.pause();
  }

  private replayLevel(id: number): void {
    this.scene.stop('LevelDone');
    this.scene.stop('Pause');
    this.tutorialText.setVisible(true);
    this.scene.resume();
    const next = levelById(id);
    if (!next) {
      this.toMap();
      return;
    }
    this.level = next;
    this.beginDay();
  }

  /**
   * The pause card. Only mid-day: between days there is nothing running to
   * pause, and the result screens have their own way out.
   */
  private openPause(): void {
    if ((this.phase !== 'playing' && this.phase !== 'intro') || this.externallyPaused)
      return;
    if (!this.scene.isActive() || this.scene.isActive('Pause')) return;
    this.cancelDrag();
    this.sfx.stopHumOnly();
    this.tutorialText.setVisible(false);
    const level = this.level;
    const data: PauseData = {
      title: level
        ? `${level.world + 1}-${((level.id - 1) % LEVELS_PER_WORLD) + 1}  ${level.name}`
        : `Day ${this.day}`,
      quitLabel: level ? 'Map' : 'Menu',
      onResume: () => this.closePause(),
      onQuit: () => {
        this.scene.stop('Pause');
        this.scene.resume();
        this.goHome();
      },
      ...(level ? { onRetry: () => this.replayLevel(level.id) } : {}),
    };
    this.scene.launch('Pause', data);
    this.scene.pause();
  }

  private closePause(): void {
    this.tutorialText.setVisible(true);
    this.scene.stop('Pause');
    this.scene.resume();
    this.sfx.startHum();
    if (this.phase === 'playing') this.startGameplay();
  }

  /** Leaves the board: the map in the campaign, the menu otherwise. */
  private goHome(): void {
    if (this.phase === 'loading') return;
    if (this.level) {
      this.toMap();
      return;
    }
    this.scene.stop('Night');
    this.sfx.stopHumOnly();
    this.stopGameplay();
    this.scene.start('Menu');
  }

  /** To the hive's skill shop; it returns to the map. */
  private toHive(): void {
    this.scene.stop('LevelDone');
    this.sfx.stopHumOnly();
    this.stopGameplay();
    this.scene.start('Hive', { back: 'Map', world: this.level?.world ?? 0 });
  }

  /** Back to the honeycomb. Anything unfinished on this board is dropped. */
  private toMap(): void {
    this.scene.stop('LevelDone');
    this.sfx.stopHumOnly();
    this.stopGameplay();
    this.scene.start('Map', { world: this.level?.world ?? 0 });
  }

  /**
   * The day is over: by dusk, or by clearing the meadow.
   *
   * Clearing early pays the sunset bonus for the daylight left, which is what
   * makes speed worth something rather than a way to end the fun sooner.
   */
  private endDay(cleared: boolean): void {
    if (this.phase === 'ended') return;
    if (this.level) {
      this.endLevel(this.level, 'filled');
      return;
    }
    this.phase = 'ended';
    this.cancelDrag();

    this.stopGameplay();
    this.sfx.play('dayEnd', 0.45);

    const bonus = cleared ? sunsetBonus(this.day, this.secondsLeft) : 0;
    const result = evaluateDay(this.day, Math.floor(this.field.honey) + bonus, bonus);

    this.save.runScore += result.score;
    this.nightAchievements = this.bankDay(Math.floor(this.field.honey) + bonus);
    // Surviving further than ever before is endless mode's celebration.
    if (result.outcome === 'met' && this.day > this.save.bestRunDay && this.day > 1) {
      this.context.portal.happyTime();
    }
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
      achievements: this.nightAchievements,
    };
    this.nightAchievements = [];
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
      if (this.phase === 'intro' && !this.externallyPaused) {
        this.dismissGoalCard();
        this.swattedThisGesture = true; // the touch that closed the card does nothing else
        return;
      }
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
        this.legs = [];
        this.lastClear = null;
        this.sfx.playVaried('draw', 0.14, 300);
        return;
      }

      // A press on a line might be an erase, if the finger stays put.
      this.eraseCandidate = this.field.routeNear(p.worldX, p.worldY);
      this.eraseField = this.field;
      // A wasp raid line into your hive can be cut the same way: press and
      // hold it. Their flower lines are theirs to keep.
      if (!this.eraseCandidate && this.rival) {
        const raid = this.rival.field.routeNear(p.worldX, p.worldY);
        if (raid?.target?.kind === 'nest') {
          this.eraseCandidate = raid;
          this.eraseField = this.rival.field;
        }
      }
    });

    // A drag that starts away from the hive does nothing — so say why, and
    // where to start instead, rather than leaving the player to guess.
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'playing' || !p.isDown || this.dragStart || this.eraseCandidate)
        return;
      if (this.swattedThisGesture || this.erasedThisGesture) return;
      if (Math.hypot(p.worldX - this.pressX, p.worldY - this.pressY) < TAP_SLOP * 1.5)
        return;
      this.nudge('Lines start at the hive — drag from there', this.pressX, this.pressY);
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.dragStart && p.isDown) {
        this.plan = this.followFinger(p.worldX, p.worldY);
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
        const last = this.field.planLine(this.legStart(), p.worldX, p.worldY);
        this.layLegs(last.valid ? [...this.legs, last] : this.legs, last);
        this.cancelDrag();
        return;
      }
      this.cancelDrag();

      // A tap never lays a line: lines are drawn from the hive, by hand.
      // A tap on the board points back at where they start.
      if (moved <= TAP_SLOP) {
        this.fieldRenderer.pingHive();
        if (this.field.nearestPatchTo(p.worldX, p.worldY, 70, true)) {
          this.nudge('Drag from the hive to this flower', p.worldX, p.worldY);
        }
      }
    });

    // A pointer leaving the canvas mid-drag should not strand the preview.
    this.input.on(Phaser.Input.Events.GAME_OUT, () => {
      this.cancelDrag();
      this.eraseCandidate = null;
      this.holdSeconds = 0;
    });
  }

  /** Where the next leg of the drag begins. */
  private legStart(): LineStart {
    const leg = this.legs[this.legs.length - 1];
    if (!leg)
      return this.dragStart ?? { x: this.field.hiveX, y: this.field.hiveY, route: null };
    return {
      x: leg.coords[leg.coords.length - 2] ?? 0,
      y: leg.coords[leg.coords.length - 1] ?? 0,
      route: null,
    };
  }

  /** The leg under the finger, pinning a bend first if it would hit a hedge. */
  private followFinger(x: number, y: number): LinePlan {
    const from = this.legStart();
    let plan = this.field.planLine(from, x, y);
    // Pin a bend only where the finger has actually turned. A drag straight
    // into a hedge is not a bend — it is a line the hedge stops.
    const clear = this.lastClear;
    let turned = false;
    if (clear) {
      const d =
        Math.atan2(clear.y - from.y, clear.x - from.x) -
        Math.atan2(y - clear.y, x - clear.x);
      turned = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) > 0.45;
    }
    if (plan.contact && clear && turned && this.legs.length < 5) {
      const leg = this.field.planLine(this.legStart(), clear.x, clear.y);
      if (leg.valid && !leg.contact && !leg.target) {
        this.legs.push(leg);
        this.sfx.playVaried('draw', 0.12, 420);
        plan = this.field.planLine(this.legStart(), x, y);
      }
    }
    if (!plan.contact) this.lastClear = { x, y };
    return plan;
  }

  /** Lays a drag's legs as one line: the first, then each on from its tip. */
  private layLegs(legs: LinePlan[], last: LinePlan): void {
    const first = legs[0];
    if (!first) {
      this.nudge('Too short — drag further', last.start.x, last.start.y);
      return;
    }
    // Into a hedge and stopped there: a line that cannot reach anything.
    // On a lit board that is never what was meant, so say why instead.
    const stopped = last.contact && !last.target ? last.contact : null;
    if (stopped && this.level && !this.level.fog) {
      this.nudge(
        'A hedge is in the way — curve your drag around it',
        stopped.x,
        stopped.y,
      );
      return;
    }
    // Every line in use: replace one only if it has nothing left to do.
    // Taking a working line without asking read as the game stealing it.
    if (!first.start.route && this.field.routes.length >= this.field.stats.routeSlots) {
      const spare = this.field.routes.find((r) => !r.target || !r.target.alive);
      // A line with nothing left to do makes room; a working one is never
      // taken without asking.
      if (spare) this.field.killRoute(spare);
      else {
        const tip = last.coords;
        this.nudge(
          `All ${this.field.stats.routeSlots} lines are busy — press and hold one to free it`,
          tip[tip.length - 2] ?? last.start.x,
          tip[tip.length - 1] ?? last.start.y,
        );
        this.hud.flashLines();
        return;
      }
    }
    const route = this.layLine(first);
    if (!route) return;
    for (let i = 1; i < legs.length; i += 1) {
      const leg = legs[i];
      if (!leg) continue;
      const endX = leg.coords[leg.coords.length - 2] ?? route.tipX;
      const endY = leg.coords[leg.coords.length - 1] ?? route.tipY;
      const next = this.field.planLine(
        { x: route.tipX, y: route.tipY, route },
        endX,
        endY,
      );
      if (next.valid) this.field.commitLine(next);
    }
  }

  private layLine(plan: LinePlan): Route | null {
    const full =
      !plan.start.route && this.field.routes.length >= this.field.stats.routeSlots;
    const route = this.field.commitLine(plan);
    if (!route) {
      this.nudge('Too short — drag further', plan.start.x, plan.start.y);
      return null;
    }
    if (full) {
      this.nudge('An idle line moved here', route.tipX, route.tipY);
    }
    this.routesDrawn += 1;
    if (this.level && !this.clockStarted) this.clockStarted = true;
    this.sfx.playVaried('draw', plan.target ? 0.34 : 0.22, plan.target ? 90 : 260);
    return route;
  }

  /**
   * A short explanation where the player just touched, at most every couple
   * of seconds — the answer to a gesture that did not do what they meant.
   */
  private nudge(text: string, x: number, y: number): void {
    if (this.field.time - this.lastNudgeAt < 2.2) return;
    this.lastNudgeAt = this.field.time;
    this.floatText(x, y - 40, text, '#fff4d6', 20);
    this.fieldRenderer.pingHive();
  }

  private cancelDrag(): void {
    this.dragStart = null;
    this.plan = null;
    this.legs = [];
    this.lastClear = null;
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

    (this.eraseField ?? this.field).killRoute(route);
    if (this.eraseField && this.eraseField !== this.field) {
      this.raidCuts += 1;
      this.floatText(route.tipX, route.tipY - 40, 'raid cut!', '#b8f0a0', 22);
    }
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

    const level = this.level;
    if (level) {
      if (this.clockStarted) {
        this.levelClock += dt;
        if (level.timed) this.secondsLeft = Math.max(0, this.secondsLeft - dt);
      }
      if (this.rival && this.clockStarted) {
        this.rival.step(dt);
        const verdict = this.rival.verdict(this.field, level.goal);
        if (verdict) {
          // The score at the moment the race was decided. Honey still in
          // the air keeps landing afterwards and is banked, but a jar shown
          // at 127 of 100 makes the margin meaningless.
          this.finalScore = {
            me: Math.min(level.goal, Math.floor(this.field.honey)),
            rival: Math.min(level.goal, Math.floor(this.rival.field.honey)),
          };
          this.raceDry =
            this.field.honey < level.goal && this.rival.field.honey < level.goal;
        }
        if (verdict === 'won') this.jarFull(this.raceDry);
        else if (verdict === 'beaten') this.endLevel(level, 'beaten');
        return;
      }
      if (this.field.honey >= level.goal) {
        this.jarFull();
      } else if (level.timed && this.clockStarted && this.secondsLeft <= 0) {
        this.endLevel(level, 'sunset');
      } else if (this.field.exhausted) {
        this.endLevel(level, 'empty');
      }
      return;
    }

    this.secondsLeft -= dt;
    if (this.secondsLeft <= 0) {
      this.secondsLeft = 0;
      this.endDay(false);
    }
  }

  /** The jar is full: the level is won, this instant. */
  private jarFull(byDryMeadow = false): void {
    this.filledAt = this.levelClock;
    this.wonDry = byDryMeadow;
    this.phase = 'clearing';
    this.clearTimer = CLEAR_PAUSE;
    this.cancelDrag();
    this.hud.showBanner(
      byDryMeadow
        ? 'The meadow is dry — your jar is fuller!'
        : this.rival
          ? 'Your jar filled first!'
          : 'The jar is full!',
      '#ffe38a',
    );
    this.sfx.play('fanfare', 0.55);
    this.cameras.main.flash(260, 255, 230, 150);
  }

  protected override renderUpdate(alpha: number): void {
    this.beeRenderer.sync(this.field.bees, alpha);
    this.routeRenderer.draw(this.field.routes, this.field.time);
    this.rivalRenderer.draw(this.rival?.field ?? null, this.level?.goal ?? 0, alpha);
    this.fieldRenderer.draw(this.field, alpha, this.dragStart !== null);
    this.fogRenderer.draw(this.field.fog);
    this.drawPreview();
    this.drawHint();
    this.drawEraseHold();
  }

  override update(time: number, delta: number): void {
    super.update(time, delta);
    // The board is drawn under the goal card, though nothing on it moves yet.
    if (this.phase === 'intro') {
      this.renderUpdate(1);
      this.tutorialText.setVisible(false);
      this.hud.setLines(this.field.routes.length, this.field.stats.routeSlots);
      this.refreshHud(0);
    }

    const seconds = delta / 1000;
    this.juice.update(seconds);
    this.consumeEvents();
    if (this.phase === 'playing') this.showRaids();

    if (this.phase === 'playing' || this.phase === 'clearing') {
      this.refreshHud(seconds);

      if (this.field.time >= this.nextBuzzAt && this.field.bees.length > 0) {
        this.scheduleBuzz();
        this.sfx.playVaried('buzz', 0.1, 260);
      }

      if (this.level) {
        this.lesson.update(this.lessonState());
        this.tutorialText.setText(this.phase === 'playing' ? this.lesson.text : '');
      } else {
        this.tutorial.update({
          routesDrawn: this.routesDrawn,
          honey: this.field.honey,
          lines: this.field.routes.length,
        });
        this.tutorialText.setText(this.tutorial.current?.text ?? '');
      }
      this.tutorialText.setVisible(this.tutorialText.text !== '');

      const slots = this.field.stats.routeSlots;
      this.hud.setLines(this.field.routes.length, slots);
      this.hud.setIdle(this.field.idleBees, this.field.routes.length < slots);

      const crossing = this.field.wasps.filter((w) => w.state === 'approaching').length;
      const raidOut = this.rival?.raidOutLeft ?? null;
      if (raidOut !== null && !this.raidOutAnnounced) {
        this.raidOutAnnounced = true;
        this.hud.showBanner(
          'The meadow is dry — RAID-OUT! Steal their honey, guard yours',
          '#ffb09c',
        );
        this.sfx.play('fanfare', 0.4, -300);
      }
      this.hud.setAlert(
        raidOut !== null
          ? `RAID-OUT  ${Math.ceil(raidOut)}s — the fuller jar wins`
          : this.field.underAttack
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

  /** Raided honey as floating numbers: red over your hive, gold over theirs. */
  private showRaids(): void {
    const rival = this.rival;
    if (!rival) return;
    this.raidTally.lost += rival.raided.fromPlayer;
    this.raidTally.gained += rival.raided.fromWasps;
    rival.raided = { fromWasps: 0, fromPlayer: 0 };
    if (this.field.time - this.raidTally.at < 1.2) return;
    this.raidTally.at = this.field.time;
    if (this.raidTally.lost >= 1) {
      this.floatText(
        this.field.hiveX + 50,
        this.field.hiveY - 70,
        `-${Math.floor(this.raidTally.lost)} raided!`,
        '#ff8a70',
        22,
      );
      this.raidTally.lost -= Math.floor(this.raidTally.lost);
    }
    if (this.raidTally.gained >= 1) {
      this.floatText(
        rival.spec.x,
        rival.spec.y - 110,
        `+${Math.floor(this.raidTally.gained)} stolen`,
        '#ffd466',
        22,
      );
      this.raidTally.gained -= Math.floor(this.raidTally.gained);
    }
  }

  /** What the lesson needs to know about the board. */
  private lessonState(): LessonState {
    const golden = this.field.patches.find((p) => p.kind === 'night' && p.alive);
    let connected = 0;
    let goldenServed = false;
    for (const r of this.field.routes) {
      if (r.dead || !r.target || !r.reachesTarget()) continue;
      connected += 1;
      if (r.target === golden) goldenServed = true;
    }
    return {
      time: this.field.time,
      routesDrawn: this.routesDrawn,
      lines: this.field.routes.length,
      honey: this.field.honey,
      drained: this.lessonDrained,
      wasps: this.field.wasps.length,
      waspsDowned: this.field.waspsDowned,
      discovered: this.field.knownPatches.length,
      golden: golden !== undefined,
      goldenServed,
      connected,
      raiding: this.field.routes.some((r) => r.target?.kind === 'nest'),
      underRaid: this.rival?.field.routes.some((r) => r.target?.kind === 'nest') ?? false,
      raidCuts: this.raidCuts,
    };
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
      if (found.bonus > 0) this.finds.flowers += 1;
      if (found.royal) this.finds.royals += 1;
      for (let i = 0; i < (found.royal ? 24 : 8); i += 1) {
        this.juice.collect(found.x, found.y, 3);
      }
      if (found.royal) {
        this.sfx.play('fanfare', 0.4);
        this.hud.showBanner('A Royal Bloom! Its honey counts four times', '#e6c8ff');
      } else {
        this.sfx.play('upgrade', 0.26);
      }
      this.floatText(
        found.x,
        found.y - 70,
        found.bonus > 0 ? `found! +${found.bonus}` : 'found!',
        found.royal ? '#e6c8ff' : '#fff4d6',
        found.royal ? 30 : 22,
      );
    }
    for (const t of events.treasure) {
      if (t.kind === 'honey') this.finds.pots += 1;
      else this.finds.bees += 1;
      for (let i = 0; i < 16; i += 1) this.juice.collect(t.x, t.y, 3);
      this.sfx.play('sparkle', 0.4);
      this.floatText(
        t.x,
        t.y - 40,
        t.kind === 'honey' ? `honey pot! +${t.amount}` : `lost swarm! +${t.amount} bees`,
        t.kind === 'honey' ? '#ffd466' : '#fff4d6',
        28,
      );
      if (t.kind === 'bees') this.beeRenderer.resize(this.field.bees.length);
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

    this.lessonDrained += events.drained.length;
    for (const spot of events.drained) {
      for (let i = 0; i < 8; i += 1) this.juice.collect(spot.x, spot.y, 3);
      this.floatText(spot.x, spot.y - 50, 'empty — line freed', '#fff4d6', 20);
      this.hud.flashLines();
      this.sfx.playVaried('deposit', 0.22, 200);
    }

    for (const spot of events.fizzled) {
      this.floatText(spot.x, spot.y - 30, 'reached nothing — line freed', '#e9dcc0', 20);
      this.hud.flashLines();
    }

    for (const bloom of events.bloomed) {
      for (let i = 0; i < 12; i += 1) this.juice.collect(bloom.x, bloom.y, 4);
      this.sfx.play('sparkle', 0.45);
      this.hud.showBanner('A golden bloom! Quick — it closes soon', '#ffe38a');
    }

    for (const gone of events.wilted) {
      this.floatText(gone.x, gone.y - 40, 'closed', '#ff8a70', 18);
    }

    if (events.comboUp > 0) {
      this.hud.comboPop(events.comboUp);
      this.sfx.play('upgrade', 0.3 + events.comboUp * 0.04, (events.comboUp - 2) * 200);
    }
    if (events.comboDown > 0) {
      this.sfx.playVaried('deposit', 0.3, 80);
    }

    if (events.cleared && this.phase === 'playing' && !this.level) {
      this.phase = 'clearing';
      this.clearTimer = CLEAR_PAUSE;
      this.cancelDrag();
      this.hud.showBanner(`Meadow cleared! +${this.bonusNow} sunset bonus`, '#ffe38a');
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
    this.floating.add(label);
    label.once(Phaser.GameObjects.Events.DESTROY, () => this.floating.delete(label));

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
    const coords = this.legs.flatMap((leg) => leg.coords).concat(plan.coords);

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
   * The teaching hand: a finger that shows the move — a drag from the hive to
   * a flower, around a hedge, into the mist, or a tap on a wasp — over and
   * over until the player does it themselves.
   */
  private drawHint(): void {
    const g = this.hintGfx;
    g.clear();
    if (this.phase !== 'playing' || this.dragStart) return;

    const move = this.hintMove();
    if (!move) return;

    if (move.tap) {
      // A finger that presses down on the target, with a ring where it lands.
      const cycle = (this.field.time * 1.4) % 1;
      const pressed = cycle > 0.4 && cycle < 0.7;
      g.lineStyle(4, 0xfff4d6, 0.9 * (1 - cycle));
      g.strokeCircle(move.to.x, move.to.y, 30 + cycle * 30);
      // Beside the target, not on it: the wasp itself must stay visible.
      this.finger(g, move.to.x + 30, move.to.y + 34, pressed, 1);
      return;
    }

    const points = [move.from, ...(move.via ? [move.via] : []), move.to];
    const to = move.to;
    const cycle = (this.field.time * (move.via ? 0.4 : 0.55)) % 1;
    // Rest at the start, glide to the end, rest there, fade.
    const t = Math.min(1, Math.max(0, (cycle - 0.15) / 0.55));
    const ease = t * t * (3 - 2 * t);
    const alpha = cycle > 0.85 ? (1 - cycle) / 0.15 : 1;

    // Walk the path to `ease` of its length.
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]!;
      const b = points[i]!;
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    let left = total * ease;
    g.lineStyle(6, 0xffffff, 0.55 * alpha);
    g.beginPath();
    g.moveTo(points[0]!.x, points[0]!.y);
    let fx = points[0]!.x;
    let fy = points[0]!.y;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const k = len > 0 ? Math.min(1, left / len) : 1;
      fx = a.x + (b.x - a.x) * k;
      fy = a.y + (b.y - a.y) * k;
      g.lineTo(fx, fy);
      left -= len;
      if (left <= 0) break;
    }
    g.strokePath();
    // Where it is headed, ringed, so the goal of the gesture is plain too.
    g.lineStyle(4, 0xfff4d6, 0.6 * alpha);
    g.strokeCircle(to.x, to.y, 34);
    this.finger(g, fx, fy, t > 0 && t < 1, alpha);
  }

  private finger(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    pressed: boolean,
    alpha: number,
  ): void {
    const r = pressed ? 17 : 20;
    g.fillStyle(0x000000, 0.25 * alpha);
    g.fillCircle(x + 4, y + 6, 20);
    g.fillStyle(0xfff4d6, 0.95 * alpha);
    g.fillCircle(x, y, r);
    g.lineStyle(3, 0x2a1d08, 0.9 * alpha);
    g.strokeCircle(x, y, r);
  }

  /** The move the hand should show right now, or null for none. */
  private hintMove(): {
    from: { x: number; y: number };
    via?: { x: number; y: number };
    to: { x: number; y: number };
    tap?: boolean;
  } | null {
    const hive = { x: this.field.hiveX, y: this.field.hiveY };
    const hint = this.level
      ? this.lesson.hint
      : this.tutorial.wantsHintLine
        ? ({ kind: 'drag-to-flower' } as const)
        : null;
    if (!hint) return null;

    switch (hint.kind) {
      case 'drag-to-flower': {
        const served = new Set(this.field.routes.map((r) => r.target));
        const patch = this.field.knownPatches
          .filter(
            (p) => !served.has(p) && p.alive && p.kind !== 'night' && p.kind !== 'nest',
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x - hive.x, a.y - hive.y) -
              Math.hypot(b.x - hive.x, b.y - hive.y),
          )[0];
        return patch ? { from: hive, to: patch } : null;
      }
      case 'drag-to':
        return { from: hive, to: hint };
      case 'drag-around':
        return { from: hive, via: hint.via, to: hint.to };
      case 'drag-from-tip': {
        const route = this.field.routes[this.field.routes.length - 1];
        return route ? { from: { x: route.tipX, y: route.tipY }, to: hint } : null;
      }
      case 'tap-wasp': {
        const wasp = this.field.wasps[0];
        return wasp ? { from: wasp, to: wasp, tap: true } : null;
      }
      case 'hold-raid': {
        const rival = this.rival;
        const raid = rival?.field.routes.find((r) => r.target?.kind === 'nest');
        if (!rival || !raid) return null;
        const p = {
          x: (raid.tipX + rival.spec.x) / 2,
          y: (raid.tipY + rival.spec.y) / 2,
        };
        return { from: p, to: p, tap: true };
      }
      case 'drag-to-golden': {
        const bloom = this.field.patches.find((p) => p.kind === 'night' && p.alive);
        return bloom ? { from: hive, to: bloom } : null;
      }
    }
  }

  /** Exposed for the automated harness, in dev and `local` builds only. */
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
