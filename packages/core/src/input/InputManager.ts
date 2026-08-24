import Phaser from 'phaser';

export type InputDevice = 'touch' | 'mouse' | 'keyboard';

/** Device-neutral actions. Games check these, never raw keys or pointers. */
export interface InputState {
  /** A press began this frame. */
  justPressed: boolean;
  /** Held down right now. */
  pressed: boolean;
  /** A press ended this frame. */
  justReleased: boolean;
  /** Pointer position in game coordinates, or null if there has never been one. */
  pointer: { x: number; y: number } | null;
  /** Horizontal intent in [-1, 1] from arrows/A-D. */
  axisX: number;
  /** Vertical intent in [-1, 1] from arrows/W-S. */
  axisY: number;
}

/**
 * One input API across touch, mouse and keyboard.
 *
 * Portals require both touch and keyboard to work, adapting to the device, and
 * "only works with a mouse" is a rejection. The trap is that writing
 * `pointerdown` handlers plus separate key handlers produces two code paths
 * that drift — the keyboard path gets a feature the touch path does not, and
 * nobody notices until a reviewer opens it on a phone.
 *
 * So gameplay reads a single `InputState` and cannot tell the difference.
 * `lastDevice` exists only so UI can show the right prompt ("Tap" vs "Click"
 * vs "Press Space").
 */
export class InputManager {
  private readonly scene: Phaser.Scene;

  private device: InputDevice = 'mouse';
  private pointerPos: { x: number; y: number } | null = null;

  private isDown = false;
  private pressedThisFrame = false;
  private releasedThisFrame = false;

  private keys:
    | {
        up: Phaser.Input.Keyboard.Key;
        down: Phaser.Input.Keyboard.Key;
        left: Phaser.Input.Keyboard.Key;
        right: Phaser.Input.Keyboard.Key;
        w: Phaser.Input.Keyboard.Key;
        a: Phaser.Input.Keyboard.Key;
        s: Phaser.Input.Keyboard.Key;
        d: Phaser.Input.Keyboard.Key;
        space: Phaser.Input.Keyboard.Key;
      }
    | undefined;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);

    const keyboard = scene.input.keyboard;
    if (keyboard) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.keys = {
        up: keyboard.addKey(K.UP),
        down: keyboard.addKey(K.DOWN),
        left: keyboard.addKey(K.LEFT),
        right: keyboard.addKey(K.RIGHT),
        w: keyboard.addKey(K.W),
        a: keyboard.addKey(K.A),
        s: keyboard.addKey(K.S),
        d: keyboard.addKey(K.D),
        space: keyboard.addKey(K.SPACE),
      };

      keyboard.on('keydown', this.onKeyDown, this);
      keyboard.on('keyup', this.onKeyUp, this);
    }

    // Clean up automatically so a scene restart does not stack listeners —
    // a leak that shows up as inputs firing twice after one replay.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  /** The kind of device last used, for choosing UI prompts. */
  get lastDevice(): InputDevice {
    return this.device;
  }

  /** True when the player is most likely on a touch screen. */
  get isTouch(): boolean {
    return this.scene.sys.game.device.input.touch && this.device === 'touch';
  }

  /**
   * Snapshot for this frame.
   *
   * Call once per update and read from the result — the `just*` flags are
   * cleared by `endFrame()`, so calling this twice and expecting the same
   * answer works, but reading it after `endFrame()` does not.
   */
  read(): InputState {
    const keys = this.keys;

    const leftHeld = Boolean(keys && (keys.left.isDown || keys.a.isDown));
    const rightHeld = Boolean(keys && (keys.right.isDown || keys.d.isDown));
    const upHeld = Boolean(keys && (keys.up.isDown || keys.w.isDown));
    const downHeld = Boolean(keys && (keys.down.isDown || keys.s.isDown));

    return {
      justPressed: this.pressedThisFrame,
      pressed: this.isDown || Boolean(keys?.space.isDown),
      justReleased: this.releasedThisFrame,
      pointer: this.pointerPos,
      axisX: (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0),
      axisY: (downHeld ? 1 : 0) - (upHeld ? 1 : 0),
    };
  }

  /**
   * Clears the edge-triggered flags. The scene base class calls this at the end
   * of every update; games do not need to.
   */
  endFrame(): void {
    this.pressedThisFrame = false;
    this.releasedThisFrame = false;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    this.device = pointer.wasTouch ? 'touch' : 'mouse';
    this.isDown = true;
    this.pressedThisFrame = true;
    this.pointerPos = { x: pointer.worldX, y: pointer.worldY };
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    this.isDown = false;
    this.releasedThisFrame = true;
    this.pointerPos = { x: pointer.worldX, y: pointer.worldY };
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    // A touch "move" without a press is not possible, so only update the
    // device on real movement from a mouse.
    if (!pointer.wasTouch) this.device = 'mouse';
    this.pointerPos = { x: pointer.worldX, y: pointer.worldY };
  }

  private onKeyDown(): void {
    this.device = 'keyboard';
    this.pressedThisFrame = true;
  }

  private onKeyUp(): void {
    this.releasedThisFrame = true;
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);

    const keyboard = this.scene.input.keyboard;
    if (keyboard) {
      keyboard.off('keydown', this.onKeyDown, this);
      keyboard.off('keyup', this.onKeyUp, this);
    }
    this.keys = undefined;
  }
}
