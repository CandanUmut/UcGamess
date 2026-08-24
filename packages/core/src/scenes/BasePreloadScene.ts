import Phaser from 'phaser';
import { getContext } from '../context.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../scale/viewport.ts';

/**
 * Preload scene with the portal's loading lifecycle already wired.
 *
 * Two things this guarantees so no game has to remember them:
 *
 * 1. `portal.loadingFinished()` fires exactly once, after assets are in memory
 *    and before the first playable scene. Calling it too early inflates the
 *    portal's measured load time; forgetting it entirely means the portal never
 *    hides its own loading overlay, which reads as a hung game.
 *
 * 2. There is always a visible progress indicator. A blank screen during load
 *    is a documented rejection cause — reviewers read it as broken rather than
 *    slow.
 *
 * Subclasses implement `loadAssets()` and `nextScene()`.
 */
export abstract class BasePreloadScene extends Phaser.Scene {
  private barFill?: Phaser.GameObjects.Rectangle;

  /** Queue every asset here. Do not call `super.preload()`. */
  protected abstract loadAssets(): void;

  /** Scene key to start once loading and save hydration are done. */
  protected abstract nextScene(): string;

  preload(): void {
    this.buildProgressUI();
    this.load.on(Phaser.Loader.Events.PROGRESS, this.onProgress, this);
    this.loadAssets();
  }

  async create(): Promise<void> {
    const context = getContext(this);

    // Hydrate saves before the menu so it can show a high score immediately
    // rather than popping one in a frame later.
    await context.save.load();
    context.audio.hydrate(context.save.get(AudioSaveKey, false));

    // Assets are decoded and the first real scene can render: this is the
    // honest moment to say loading is done.
    context.portal.loadingFinished();

    this.scene.start(this.nextScene());
  }

  private onProgress(value: number): void {
    this.barFill?.setScale(value, 1);
  }

  private buildProgressUI(): void {
    const centreX = DESIGN_WIDTH / 2;
    const centreY = DESIGN_HEIGHT / 2;
    const barWidth = 420;
    const barHeight = 28;

    this.add
      .rectangle(centreX, centreY, barWidth, barHeight)
      .setStrokeStyle(2, 0xffffff, 0.6);

    this.barFill = this.add
      .rectangle(
        centreX - barWidth / 2 + 3,
        centreY,
        barWidth - 6,
        barHeight - 6,
        0xffffff,
      )
      .setOrigin(0, 0.5)
      .setScale(0, 1);

    this.add
      .text(centreX, centreY + 46, 'Loading…', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }
}

/** Kept in sync with AudioManager.saveKey; imported as a value to avoid a cycle. */
const AudioSaveKey = 'audio.muted';
