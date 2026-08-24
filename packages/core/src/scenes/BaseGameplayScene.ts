import Phaser from 'phaser';
import { BaseScene } from './BaseScene.ts';
import { FixedTimestep, type FixedTimestepOptions } from '../loop/FixedTimestep.ts';

/**
 * Base for the scene where actual play happens.
 *
 * Owns two things games would otherwise get wrong:
 *
 * **The fixed timestep.** `update()` is final here. Simulation goes in
 * `fixedUpdate(dt)`, which always receives the same `dt` regardless of the
 * display's refresh rate. Visual-only work (interpolation, particles, camera
 * shake) goes in `renderUpdate(alpha)`. This is what stops the game running at
 * 2.4x speed on a 144 Hz monitor — a documented CrazyGames rejection cause.
 *
 * **The gameplay lifecycle.** `startGameplay()` / `stopGameplay()` signal the
 * portal and the metrics helper together, and are idempotent. Portals expect
 * these to pair on every pause, resume, death and menu — not just at the start
 * of a session.
 */
export abstract class BaseGameplayScene extends BaseScene {
  protected timestep!: FixedTimestep;

  private gameplayActive = false;

  /** Override to change simulation rate. Default 60 Hz. */
  protected timestepOptions(): FixedTimestepOptions {
    return {};
  }

  override create(): void {
    this.timestep = new FixedTimestep(this.timestepOptions());
    super.create();

    // Pausing must tell the portal — an ad shown while the player is "in
    // gameplay" according to the SDK skews the portal's engagement metrics.
    this.events.on(Phaser.Scenes.Events.PAUSE, this.stopGameplay, this);
    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.stopGameplay, this);

    // Tab-away is a pause the scene system does not see.
    this.game.events.on(Phaser.Core.Events.BLUR, this.stopGameplay, this);
    this.game.events.on(Phaser.Core.Events.FOCUS, this.onResume, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.stopGameplay, this);
      this.game.events.off(Phaser.Core.Events.FOCUS, this.onResume, this);
    });
  }

  /**
   * Final. Simulation belongs in `fixedUpdate`.
   *
   * If you find yourself wanting to override this, you almost certainly want
   * `renderUpdate` — and if you genuinely need raw frame timing, you are about
   * to introduce the 144 Hz bug.
   */
  override update(_time: number, delta: number): void {
    if (this.gameplayActive) {
      const alpha = this.timestep.step(delta, (dt) => this.fixedUpdate(dt));
      this.renderUpdate(alpha);
    }
    this.input2.endFrame();
  }

  /**
   * Simulation. `dt` is constant (1/60s by default) no matter the refresh rate.
   * All movement, physics and timers belong here.
   */
  protected abstract fixedUpdate(dt: number): void;

  /**
   * Visual-only work. `alpha` is the fraction of a step already elapsed — use
   * it to interpolate sprite positions between simulation states for smooth
   * motion on displays that do not match the simulation rate.
   */
  protected renderUpdate(_alpha: number): void {}

  /** Signals the portal and metrics that play has begun. Safe to call twice. */
  protected startGameplay(): void {
    if (this.gameplayActive) return;
    this.gameplayActive = true;

    // Drop time banked while paused, or the first frame back tries to simulate
    // the whole gap at once.
    this.timestep.reset();

    this.context.portal.gameplayStart();
    this.context.metrics.markGameplayStart();
  }

  /** Signals the portal and metrics that play has stopped. Safe to call twice. */
  protected stopGameplay(): void {
    if (!this.gameplayActive) return;
    this.gameplayActive = false;
    this.context.portal.gameplayStop();
    this.context.metrics.markGameplayStop();
  }

  protected get isGameplayActive(): boolean {
    return this.gameplayActive;
  }

  /**
   * Shows an interstitial and resumes cleanly.
   *
   * Wraps the portal call in the stop/start pair the portals expect, and resets
   * the timestep afterwards so the seconds spent watching an ad are not
   * simulated in one frame when play resumes. Games call this instead of
   * touching `portal.commercialBreak()` directly.
   *
   * Never gate this behind your own timer — the portal decides whether an ad
   * actually plays.
   */
  protected async showCommercialBreak(): Promise<void> {
    const wasActive = this.gameplayActive;
    this.stopGameplay();

    await this.context.save.flush();
    await this.context.portal.commercialBreak();

    this.timestep.reset();
    if (wasActive) this.startGameplay();
  }

  /**
   * Shows a rewarded video the player opted into. Resolves true only if the
   * reward was earned.
   *
   * Callers must always offer a way to continue without watching — required by
   * both Poki and CrazyGames.
   */
  protected async showRewardedBreak(): Promise<boolean> {
    const wasActive = this.gameplayActive;
    this.stopGameplay();

    await this.context.save.flush();
    const earned = await this.context.portal.rewardedBreak();

    this.timestep.reset();
    if (wasActive) this.startGameplay();
    return earned;
  }

  private onResume(): void {
    this.timestep.reset();
  }
}
