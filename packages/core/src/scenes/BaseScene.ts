import Phaser from 'phaser';
import { getContext, type GameContext } from '../context.ts';
import { InputManager } from '../input/InputManager.ts';
import { safeAreaRect } from '../scale/viewport.ts';

/**
 * Shared base for every scene.
 *
 * Provides the context, an InputManager, and the safe-area rect. Subclasses
 * override `build()` instead of `create()` so the base can guarantee its own
 * setup runs first — a subclass that forgets `super.create()` is a bug class we
 * would rather not have.
 */
export abstract class BaseScene extends Phaser.Scene {
  protected context!: GameContext;
  protected input2!: InputManager;

  /** Visible, touchable area in game coordinates. Anchor HUD to this. */
  protected safeArea!: Phaser.Geom.Rectangle;

  // Not `override`: Phaser.Scene declares only `update()`; `create`, `preload`
  // and `init` are looked up dynamically by the scene manager.
  create(): void {
    this.context = getContext(this);
    this.input2 = new InputManager(this);
    this.safeArea = safeAreaRect(this);

    // Recompute on rotate/resize so a HUD pinned to a corner stays pinned.
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    });

    this.build();
  }

  /** Subclass setup. Called after the base has wired everything up. */
  protected abstract build(): void;

  /** Override to re-layout when the viewport changes. */
  protected onResize(): void {
    this.safeArea = safeAreaRect(this);
    this.layout();
  }

  /** Override to position elements relative to `safeArea`. */
  protected layout(): void {}
}
