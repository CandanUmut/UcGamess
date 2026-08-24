import Phaser from 'phaser';
import { BaseGameplayScene } from '@ucgames/core';
import { COLORS, TUNING } from '../config/tuning.ts';
import { Field } from '../sim/Field.ts';
import { pushIfSpaced } from '../sim/polyline.ts';
import { createGeneratedTextures, TEX } from '../render/textures.ts';
import {
  createBeeRenderer,
  type BeeRenderer,
  type RendererMode,
} from '../render/BeeRenderer.ts';
import { RouteRenderer } from '../render/RouteRenderer.ts';

const DEPTH = { patch: 10, hive: 20, route: 30, bee: 40, hud: 100 } as const;

/**
 * Stage 2 — the feel prototype.
 *
 * Zero art, zero UI, zero audio, no day cycle, no upgrades. The only question
 * this scene exists to answer is whether drawing and refreshing routes feels
 * good. Everything else in the design rests on that, and if the answer is no we
 * would rather find out now than in week six.
 *
 * Simulation runs in `fixedUpdate` at a constant dt and rendering interpolates
 * in `renderUpdate`, so behaviour is identical at 60Hz and 144Hz.
 */
export class PrototypeScene extends BaseGameplayScene {
  private field!: Field;
  private beeRenderer!: BeeRenderer;
  private routeRenderer!: RouteRenderer;

  private hiveSprite!: Phaser.GameObjects.Image;
  private hiveRing!: Phaser.GameObjects.Graphics;
  private patchLayer!: Phaser.GameObjects.Graphics;

  private hud!: Phaser.GameObjects.Text;
  private help!: Phaser.GameObjects.Text;

  // --- drag state -------------------------------------------------------
  private drawing = false;
  private drawCoords: number[] = [];
  /** Set when the drag started at a live route's tip — a refresh, not a new route. */
  private refreshingRouteId = 0;
  private previewGfx!: Phaser.GameObjects.Graphics;

  // --- debug ------------------------------------------------------------
  private rendererMode: RendererMode = 'blitter';
  private fpsSamples: number[] = [];
  private fpsAvg = 60;
  private fpsMin = 60;
  private hudTimer = 0;

  constructor() {
    super({ key: 'Prototype' });
  }

  preload(): void {
    createGeneratedTextures(this);
  }

  protected build(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);

    this.field = new Field();

    this.patchLayer = this.add.graphics().setDepth(DEPTH.patch);

    this.hiveSprite = this.add
      .image(this.field.hiveX, this.field.hiveY, TEX.glow)
      .setDepth(DEPTH.hive)
      .setTint(COLORS.hive)
      .setScale(1.5);

    this.hiveRing = this.add.graphics().setDepth(DEPTH.hive);

    this.routeRenderer = new RouteRenderer(this, DEPTH.route);
    this.previewGfx = this.add.graphics().setDepth(DEPTH.route + 1);
    this.beeRenderer = createBeeRenderer(this, this.rendererMode, DEPTH.bee);
    this.beeRenderer.resize(this.field.bees.length);

    this.buildHud();
    this.bindInput();
    this.bindDebugKeys();
    this.exposeDebugHandle();

    // No menu in the prototype — the point is to be drawing within a second.
    this.startGameplay();
  }

  // ------------------------------------------------------------------ input

  /**
   * One pointer path for mouse and touch.
   *
   * Phaser's pointer events already unify the two, so there is deliberately no
   * branch on device here — a separate touch path is how the two input methods
   * drift out of sync and one of them ships broken.
   */
  private bindInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.beginDraw(p.worldX, p.worldY);
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.drawing) return;
      pushIfSpaced(this.drawCoords, p.worldX, p.worldY, TUNING.route.pointSpacing);
    });

    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.endDraw());
    // A pointer leaving the canvas mid-drag must commit, not strand the gesture.
    this.input.on(Phaser.Input.Events.GAME_OUT, () => this.endDraw());
  }

  private beginDraw(x: number, y: number): void {
    const refreshTarget = this.field.routeToRefreshAt(x, y);

    if (refreshTarget) {
      // Continue from the tip: the drag only has to cover what decayed away.
      this.drawing = true;
      this.refreshingRouteId = refreshTarget.id;
      this.drawCoords = [x, y];
      return;
    }

    if (this.field.isNearHive(x, y)) {
      this.drawing = true;
      this.refreshingRouteId = 0;
      // Anchor at the hive centre so bees always depart from the same place.
      this.drawCoords = [this.field.hiveX, this.field.hiveY, x, y];
      return;
    }

    // Started nowhere meaningful — ignore rather than creating a stray route.
    this.drawing = false;
  }

  private endDraw(): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.previewGfx.clear();

    const coords = this.drawCoords;
    this.drawCoords = [];

    if (coords.length < 4) {
      this.refreshingRouteId = 0;
      return;
    }

    if (this.refreshingRouteId !== 0) {
      const route = this.field.routeById(this.refreshingRouteId);
      this.refreshingRouteId = 0;
      if (route && !route.dead) {
        route.extendWith(coords, this.field.holdSeconds);
        this.field.retarget(route);
        return;
      }
    }

    this.field.createRoute(coords);
  }

  // ------------------------------------------------------------- debug keys

  /**
   * Discrete key actions, polled with JustDown rather than bound to `keydown-X`.
   *
   * The event form fires more than once per physical press: measured here,
   * three rapid presses of P spawned eleven patches, with only three DOM
   * keydowns and a single `build()`. Phaser's plugin re-emits from its queue,
   * and filtering `event.repeat` does not suppress it.
   *
   * `Key` objects polled with `JustDown` give exactly-once semantics regardless
   * of what the event queue does, and are immune to OS key-repeat while held.
   * Any Stage 3 key bound to "buy upgrade" or "next day" must use this pattern
   * — the event form would fire that action several times per press.
   */
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};

  private bindDebugKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      renderer: keyboard.addKey(K.R),
      decay: keyboard.addKey(K.D),
      ghosts: keyboard.addKey(K.G),
      clear: keyboard.addKey(K.C),
      addPatch: keyboard.addKey(K.P),
      removePatch: keyboard.addKey(K.O),
      help: keyboard.addKey(K.H),
      // PLUS is the '=' / '+' key on a standard layout; MINUS is '-'.
      more: keyboard.addKey(K.PLUS),
      less: keyboard.addKey(K.MINUS),
      reset: keyboard.addKey(K.ZERO),
    };
  }

  private pollDebugKeys(): void {
    const k = this.keys;
    if (!k.renderer) return;

    const justDown = (key: Phaser.Input.Keyboard.Key | undefined): boolean =>
      key !== undefined && Phaser.Input.Keyboard.JustDown(key);

    if (justDown(k.renderer)) this.swapRenderer();
    if (justDown(k.decay)) this.field.decayEnabled = !this.field.decayEnabled;
    if (justDown(k.ghosts))
      this.routeRenderer.showGhosts = !this.routeRenderer.showGhosts;
    if (justDown(k.clear)) this.field.clearRoutes();
    if (justDown(k.addPatch)) this.field.spawnPatch();
    if (justDown(k.removePatch)) this.field.removePatch();
    if (justDown(k.help)) this.help.setVisible(!this.help.visible);

    const bump = (delta: number) => {
      this.field.setBeeCount(this.field.bees.length + delta);
      this.beeRenderer.resize(this.field.bees.length);
      this.fpsSamples = [];
      this.fpsMin = 60;
    };
    if (justDown(k.more)) bump(50);
    if (justDown(k.less)) bump(-50);
    if (justDown(k.reset)) bump(300 - this.field.bees.length);
  }

  /**
   * Exposes patch positions and stats for automated measurement.
   *
   * Unconditional rather than dev-only because the perf and functional harness
   * runs against a production build — measuring a dev build would report the
   * wrong frame cost. Patches spawn at random positions, so without this a
   * scripted drag cannot reliably aim at one, and "does collection work" would
   * go untested.
   *
   * Stage 3 removes this. It exists to answer the Stage 2 gate, nothing more.
   */
  private exposeDebugHandle(): void {
    (window as unknown as Record<string, unknown>).__beeline = {
      patches: () => this.field.patches.map((p) => ({ x: p.x, y: p.y, alive: p.alive })),
      stats: () => this.field.stats(),
      routes: () =>
        this.field.routes.map((r) => ({
          id: r.id,
          live: Math.round(r.liveLength),
          total: Math.round(r.poly.length),
          tipX: Math.round(r.tipX),
          tipY: Math.round(r.tipY),
          connected: r.reachesTarget(),
        })),
      hive: { x: this.field.hiveX, y: this.field.hiveY },
    };
  }

  private swapRenderer(): void {
    this.rendererMode = this.rendererMode === 'blitter' ? 'sprite' : 'blitter';
    this.beeRenderer.destroy();
    this.beeRenderer = createBeeRenderer(this, this.rendererMode, DEPTH.bee);
    this.beeRenderer.resize(this.field.bees.length);
    this.fpsSamples = [];
    this.fpsMin = 60;
  }

  // ----------------------------------------------------------------- update

  protected fixedUpdate(dt: number): void {
    this.field.step(dt);
  }

  protected override renderUpdate(alpha: number): void {
    this.beeRenderer.sync(this.field.bees, alpha);
    this.routeRenderer.draw(this.field.routes, this.field.time);
    this.drawPatches();
    this.drawHive();
    this.drawPreview();
  }

  override update(time: number, delta: number): void {
    super.update(time, delta);
    this.pollDebugKeys();
    this.trackFps(delta);
  }

  private trackFps(delta: number): void {
    const fps = delta > 0 ? 1000 / delta : 60;
    this.fpsSamples.push(fps);
    if (this.fpsSamples.length > 60) this.fpsSamples.shift();

    this.hudTimer += delta;
    if (this.hudTimer < 200) return;
    this.hudTimer = 0;

    let sum = 0;
    let min = Number.POSITIVE_INFINITY;
    for (const sample of this.fpsSamples) {
      sum += sample;
      if (sample < min) min = sample;
    }
    this.fpsAvg = sum / Math.max(this.fpsSamples.length, 1);
    // Ignore the first frames after a renderer swap, which are always spiky.
    if (this.fpsSamples.length >= 30) this.fpsMin = Math.min(this.fpsMin, min);

    this.refreshHud();
  }

  // --------------------------------------------------------------- drawing

  private drawPatches(): void {
    const g = this.patchLayer;
    g.clear();

    for (const patch of this.field.patches) {
      const scale = patch.bloomT;
      if (scale <= 0.01) continue;

      const tint = patch.alive ? COLORS.patch : COLORS.patchDry;
      const radius = 26 * scale;

      g.fillStyle(tint, 0.07);
      g.fillCircle(patch.x, patch.y, radius * 1.8);

      // The inner disc shrinks with the remaining pool, so a patch running dry
      // is visible from across the field without a number on it.
      g.fillStyle(tint, 0.8);
      g.fillCircle(patch.x, patch.y, radius * (0.42 + 0.58 * patch.fullness));

      g.lineStyle(2, tint, 0.5);
      g.strokeCircle(patch.x, patch.y, TUNING.patch.reachRadius * scale);
    }
  }

  private drawHive(): void {
    const g = this.hiveRing;
    g.clear();

    // The area a new route can be started from. Brightening it while drawing
    // is the only "UI" in the prototype.
    const active = this.drawing && this.refreshingRouteId === 0;
    g.lineStyle(2, COLORS.hive, active ? 0.55 : 0.22);
    g.strokeCircle(this.field.hiveX, this.field.hiveY, TUNING.hive.drawRadius);

    const pulse = 1 + Math.sin(this.field.time * 2) * 0.04;
    this.hiveSprite.setScale(1.5 * pulse);
  }

  private drawPreview(): void {
    const g = this.previewGfx;
    g.clear();
    if (!this.drawing || this.drawCoords.length < 4) return;

    g.lineStyle(4, COLORS.route, 0.5);
    g.beginPath();
    g.moveTo(this.drawCoords[0] ?? 0, this.drawCoords[1] ?? 0);
    for (let i = 2; i < this.drawCoords.length; i += 2) {
      g.lineTo(this.drawCoords[i] ?? 0, this.drawCoords[i + 1] ?? 0);
    }
    g.strokePath();
  }

  // ------------------------------------------------------------------- hud

  private buildHud(): void {
    this.hud = this.add
      .text(16, 12, '', {
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        fontSize: '17px',
        color: '#ffe08a',
      })
      .setDepth(DEPTH.hud);

    this.help = this.add
      .text(
        16,
        560,
        [
          'drag from the hive  → new route',
          'drag from a route tip → refresh (shorter gesture)',
          '',
          '+/-  bees      0  reset to 300',
          'R    renderer  D  decay on/off',
          'G    ghosts    C  clear routes',
          'P/O  add/remove patch      H  hide help',
        ].join('\n'),
        {
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          fontSize: '14px',
          color: '#6f6a5c',
          lineSpacing: 3,
        },
      )
      .setDepth(DEPTH.hud);

    this.refreshHud();
  }

  private refreshHud(): void {
    const stats = this.field.stats();
    const warn = this.fpsAvg < 55 ? '  ⚠' : '';

    this.hud.setText(
      [
        `fps ${this.fpsAvg.toFixed(0).padStart(3)}  (min ${this.fpsMin.toFixed(0)})${warn}`,
        `bees ${String(stats.bees).padStart(4)}   renderer ${this.beeRenderer.mode}`,
        `routes ${stats.routes}/${TUNING.route.maxCount}   patches ${this.field.patches.length}`,
        `honey ${stats.honey.toFixed(0)}   laden ${stats.laden}`,
        this.field.decayEnabled ? '' : 'DECAY OFF',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
}
