import Phaser from 'phaser';

// Nunito first, system stack behind it. The fallback is load-bearing twice
// over: the face may not have arrived (see main.ts), and the subset is
// deliberately small, so a glyph it lacks — the play triangle and the arrow
// in the night screen — is drawn by the next family along.
const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Minimum tap target, in design units.
 *
 * The canvas scales to fit, so on a phone in landscape one design unit is
 * roughly a third of a CSS pixel — a 44px CSS target therefore needs to be
 * ~145 design units wide and ~50 tall. Anything smaller is reliably missed with
 * a thumb, which reads as an unresponsive game rather than a near miss.
 */
const MIN_HEIGHT = 52;

export interface ButtonOptions {
  x: number;
  y: number;
  width: number;
  label: string;
  sublabel?: string;
  tint: number;
  onClick: () => void;
  enabled?: boolean;
}

/**
 * A rectangular button with a thumb-sized hit area.
 *
 * The interactive object is the background Rectangle, not a Container.
 * Container hit areas were tried first and silently never fired — DOM pointer
 * events reached the canvas but Phaser's hit test never matched. A Rectangle
 * carries its own hit area and needs no special handling, so it is both simpler
 * and the thing that actually works.
 */
export class Button {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly hitZone: Phaser.GameObjects.Zone;
  private readonly labelText: Phaser.GameObjects.Text;
  private readonly subText: Phaser.GameObjects.Text | undefined;
  private tint: number;
  private readonly onClick: () => void;
  private enabled: boolean;

  constructor(scene: Phaser.Scene, options: ButtonOptions) {
    this.tint = options.tint;
    this.enabled = options.enabled ?? true;
    this.onClick = options.onClick;

    const height = options.sublabel ? MIN_HEIGHT + 22 : MIN_HEIGHT;

    this.bg = scene.add
      .rectangle(options.x, options.y, options.width, height, options.tint, 0.14)
      .setStrokeStyle(2, options.tint, 0.8);

    // A Zone carries the input, not the Rectangle. Both a Container hit area
    // and `Rectangle.setInteractive()` were tried first: the scene received
    // POINTER_DOWN and POINTER_UP but GAMEOBJECT_UP never fired, so the hit
    // test simply was not matching the shape. A Zone exists specifically to be
    // an input region and works without any of that ambiguity.
    this.hitZone = scene.add
      .zone(options.x, options.y, options.width, height)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    // Exposed so the automated harness can click buttons where they actually
    // are rather than guessing coordinates that shift with layout.
    this.hitZone.setName(options.label);

    this.labelText = scene.add
      .text(options.x, options.y + (options.sublabel ? -11 : 0), options.label, {
        fontFamily: FONT,
        fontSize: '24px',
        color: '#3c3524',
      })
      .setOrigin(0.5);

    if (options.sublabel) {
      this.subText = scene.add
        .text(options.x, options.y + 15, options.sublabel, {
          fontFamily: FONT,
          fontSize: '17px',
          color: '#7b7358',
        })
        .setOrigin(0.5);
    }

    this.hitZone.on(Phaser.Input.Events.POINTER_OVER, () => {
      if (this.enabled) this.bg.setFillStyle(this.tint, 0.28);
    });
    this.hitZone.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.bg.setFillStyle(this.tint, this.enabled ? 0.14 : 0.05);
    });
    // POINTER_UP rather than DOWN: a press the player drags off should not
    // fire. That is the standard touch contract and it prevents mis-taps.
    this.hitZone.on(Phaser.Input.Events.POINTER_UP, () => {
      if (this.enabled) this.onClick();
    });

    this.setEnabled(this.enabled);
  }

  setDepth(depth: number): this {
    this.bg.setDepth(depth);
    this.labelText.setDepth(depth + 1);
    this.subText?.setDepth(depth + 1);
    this.hitZone.setDepth(depth + 2);
    return this;
  }

  /** Recolours in place, for a button whose meaning changed rather than its text. */
  setTint(tint: number): void {
    this.tint = tint;
    this.setEnabled(this.enabled);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.bg.setFillStyle(this.tint, enabled ? 0.14 : 0.05);
    this.bg.setStrokeStyle(2, this.tint, enabled ? 0.8 : 0.25);
    this.labelText.setColor(enabled ? '#3c3524' : '#a49a80');
    this.subText?.setColor(enabled ? '#7b7358' : '#b0a893');
  }

  setLabel(label: string, sublabel?: string): void {
    this.labelText.setText(label);
    if (sublabel !== undefined) this.subText?.setText(sublabel);
  }

  destroy(): void {
    this.hitZone.destroy();
    this.bg.destroy();
    this.labelText.destroy();
    this.subText?.destroy();
  }
}
