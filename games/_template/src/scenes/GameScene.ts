import Phaser from 'phaser';
import { BaseGameplayScene, DESIGN_HEIGHT, DESIGN_WIDTH } from '@ucgames/core';
import { COLORS, GAME } from '../config.ts';

interface FallingShape {
  view: Phaser.GameObjects.Rectangle;
  /** Simulated position, advanced only in fixedUpdate. */
  y: number;
  /** Position at the end of the previous step, for render interpolation. */
  previousY: number;
  good: boolean;
}

/**
 * The gameplay scene.
 *
 * Note the split that every game in this repo follows:
 *
 *   fixedUpdate(dt)   — all simulation. `dt` is always 1/60s.
 *   renderUpdate(a)   — visuals only, interpolated by `a`.
 *
 * Nothing here reads the real frame delta, so the game behaves identically on a
 * 60 Hz laptop, a 144 Hz monitor and a throttled phone. That is not a style
 * preference — physics breaking on high-refresh displays is a documented
 * rejection cause.
 */
export class GameScene extends BaseGameplayScene {
  private player!: Phaser.GameObjects.Rectangle;
  private playerX = DESIGN_WIDTH / 2;
  private previousPlayerX = DESIGN_WIDTH / 2;

  private shapes: FallingShape[] = [];
  private spawnTimer = 0;

  private score = 0;
  // Annotated because GAME is `as const`, so the initialiser's type is the
  // literal 3 rather than number.
  private lives: number = GAME.startingLives;

  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'Game' });
  }

  protected build(): void {
    this.score = 0;
    this.lives = GAME.startingLives;
    this.shapes = [];
    this.spawnTimer = 0;
    this.playerX = DESIGN_WIDTH / 2;
    this.previousPlayerX = this.playerX;

    this.player = this.add
      .rectangle(
        this.playerX,
        DESIGN_HEIGHT - 90,
        GAME.playerWidth,
        GAME.playerHeight,
        COLORS.player,
      )
      .setOrigin(0.5);

    this.scoreText = this.add.text(0, 0, 'Score 0', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '30px',
      color: COLORS.text,
    });

    this.livesText = this.add
      .text(0, 0, this.livesLabel(), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '30px',
        color: COLORS.text,
      })
      .setOrigin(1, 0);

    this.layout();

    // Gameplay is live the moment the scene is up: no countdown, because every
    // second before the first interaction costs conversion.
    this.startGameplay();
  }

  /** HUD is anchored to the safe area so it survives notches and rotation. */
  protected override layout(): void {
    if (!this.scoreText) return;
    this.scoreText.setPosition(this.safeArea.x + 24, this.safeArea.y + 20);
    this.livesText.setPosition(this.safeArea.right - 24, this.safeArea.y + 20);
  }

  protected fixedUpdate(dt: number): void {
    this.previousPlayerX = this.playerX;
    this.movePlayer(dt);
    this.spawnShapes(dt);
    this.advanceShapes(dt);
  }

  protected override renderUpdate(alpha: number): void {
    // Draw between the last two simulated states. Without this the game looks
    // subtly stuttery on any display whose refresh rate is not exactly 60 Hz.
    this.player.x = lerp(this.previousPlayerX, this.playerX, alpha);
    for (const shape of this.shapes) {
      shape.view.y = lerp(shape.previousY, shape.y, alpha);
    }
  }

  private movePlayer(dt: number): void {
    const input = this.input2.read();
    const half = GAME.playerWidth / 2;

    if (input.pointer && (input.pressed || this.input2.isTouch)) {
      // Direct positioning feels better than acceleration for a paddle, but
      // clamp the per-step distance so a touch on the far side of the screen
      // does not teleport through a falling shape.
      const maxStep = GAME.playerSpeed * dt * 1.6;
      const target = Phaser.Math.Clamp(input.pointer.x, half, DESIGN_WIDTH - half);
      const delta = Phaser.Math.Clamp(target - this.playerX, -maxStep, maxStep);
      this.playerX += delta;
    } else if (input.axisX !== 0) {
      this.playerX += input.axisX * GAME.playerSpeed * dt;
    }

    this.playerX = Phaser.Math.Clamp(this.playerX, half, DESIGN_WIDTH - half);
  }

  private spawnShapes(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    const interval = Math.max(
      GAME.minSpawnInterval,
      GAME.baseSpawnInterval - this.score * 0.012,
    );
    this.spawnTimer = interval;

    // Slightly favour catchable shapes so the game feels fair rather than
    // punishing — this ratio is the main difficulty knob worth tuning.
    const good = Math.random() < 0.68;
    const x = Phaser.Math.Between(GAME.shapeSize, DESIGN_WIDTH - GAME.shapeSize);

    const view = this.add
      .rectangle(
        x,
        -GAME.shapeSize,
        GAME.shapeSize,
        GAME.shapeSize,
        good ? COLORS.good : COLORS.bad,
      )
      .setOrigin(0.5);

    this.shapes.push({ view, y: -GAME.shapeSize, previousY: -GAME.shapeSize, good });
  }

  private advanceShapes(dt: number): void {
    const speed = Math.min(
      GAME.maxFallSpeed,
      GAME.baseFallSpeed + this.score * GAME.fallSpeedPerPoint,
    );
    const playerTop = DESIGN_HEIGHT - 90 - GAME.playerHeight / 2;
    const playerBottom = DESIGN_HEIGHT - 90 + GAME.playerHeight / 2;
    const half = GAME.playerWidth / 2;

    // Iterate backwards so removing an element does not skip the next one.
    for (let i = this.shapes.length - 1; i >= 0; i -= 1) {
      const shape = this.shapes[i];
      if (!shape) continue;

      shape.previousY = shape.y;
      shape.y += speed * dt;

      const withinPaddleRow =
        shape.y + GAME.shapeSize / 2 >= playerTop &&
        shape.y - GAME.shapeSize / 2 <= playerBottom;
      const withinPaddleSpan =
        Math.abs(shape.view.x - this.playerX) <= half + GAME.shapeSize / 2;

      if (withinPaddleRow && withinPaddleSpan) {
        this.resolveCatch(shape);
        shape.view.destroy();
        this.shapes.splice(i, 1);
        continue;
      }

      if (shape.y - GAME.shapeSize > DESIGN_HEIGHT) {
        // Missing a blue shape costs a life; letting a red one fall is correct
        // play and costs nothing.
        if (shape.good) this.loseLife();
        shape.view.destroy();
        this.shapes.splice(i, 1);
      }
    }
  }

  private resolveCatch(shape: FallingShape): void {
    if (shape.good) {
      this.score += 1;
      this.scoreText.setText(`Score ${this.score}`);
    } else {
      this.loseLife();
    }
  }

  private loseLife(): void {
    if (!this.isGameplayActive) return;

    this.lives -= 1;
    this.livesText.setText(this.livesLabel());
    this.cameras.main.shake(180, 0.006);

    if (this.lives <= 0) this.endRound();
  }

  private livesLabel(): string {
    return `Lives ${'♥'.repeat(Math.max(this.lives, 0))}`;
  }

  private endRound(): void {
    this.stopGameplay();

    const best = this.context.save.get('highScore', 0);
    if (this.score > best) this.context.save.set('highScore', this.score);

    // GameOver runs as an overlay so a rewarded continue can resume this exact
    // board rather than restarting it.
    this.scene.pause();
    this.scene.launch('GameOver', {
      score: this.score,
      best: Math.max(best, this.score),
    });
  }

  /**
   * Called by GameOverScene when a rewarded video was watched to completion.
   * Grants one life and clears the board so the player is not immediately
   * killed by shapes already mid-fall.
   */
  continueWithExtraLife(): void {
    this.lives = 1;
    this.livesText.setText(this.livesLabel());

    for (const shape of this.shapes) shape.view.destroy();
    this.shapes = [];
    this.spawnTimer = 0.8;

    this.scene.resume();
    this.startGameplay();
  }
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}
