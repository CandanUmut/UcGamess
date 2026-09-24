import Phaser from 'phaser';

// Nunito first, system stack behind it. The fallback is load-bearing twice
// over: the face may not have arrived (see main.ts), and the subset is
// deliberately small, so a glyph it lacks — the play triangle — is drawn by
// the next family along.
const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Minimum tap target, in design units.
 *
 * The canvas scales to fit, so on a phone in landscape one design unit is
 * roughly a third of a CSS pixel — a 44px CSS target therefore needs to be
 * ~145 design units wide and ~50 tall. Anything smaller is reliably missed with
 * a thumb, which reads as an unresponsive game rather than a near miss.
 */
const MIN_HEIGHT = 58;
/** How far the face sits above its shadow; it drops this far when pressed. */
const LIFT = 6;

export interface ButtonOptions {
  x: number;
  y: number;
  width: number;
  label: string;
  sublabel?: string;
  tint: number;
  onClick: () => void;
  enabled?: boolean;
  icon?: string;
  /** Larger type, for the one button a screen is about. */
  big?: boolean;
}

/**
 * A chunky, solid, pressable button.
 *
 * The old one was a pale outline at 14% fill: on a light meadow it read as a
 * label, not a control, and "looks like a prototype" is the most common
 * CrazyGames rejection. This one has a face, a darker lip under it, drops on
 * press and pops on release — feedback inside one frame, which the design
 * rules require of every input.
 */
export class Button {
  private readonly scene: Phaser.Scene;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly hitZone: Phaser.GameObjects.Zone;
  private readonly labelText: Phaser.GameObjects.Text;
  private readonly iconImage: Phaser.GameObjects.Image | undefined;
  private readonly subText: Phaser.GameObjects.Text | undefined;
  private readonly x: number;
  private readonly y: number;
  private readonly width: number;
  private readonly height: number;
  private readonly textShift: number;
  private tint: number;
  private readonly onClick: () => void;
  private enabled: boolean;
  private pressed = false;
  private hovered = false;

  constructor(scene: Phaser.Scene, options: ButtonOptions) {
    this.scene = scene;
    this.tint = options.tint;
    this.enabled = options.enabled ?? true;
    this.onClick = options.onClick;
    this.x = options.x;
    this.y = options.y;
    this.width = options.width;
    this.height =
      (options.sublabel ? MIN_HEIGHT + 20 : MIN_HEIGHT) + (options.big ? 12 : 0);
    this.textShift = options.icon ? 22 : 0;

    this.gfx = scene.add.graphics();

    this.hitZone = scene.add
      .zone(options.x, options.y, options.width, this.height + LIFT)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.hitZone.setName(options.label);

    if (options.icon && scene.textures.exists(options.icon)) {
      this.iconImage = scene.add
        .image(options.x - options.width / 2 + 34, options.y, options.icon)
        .setOrigin(0.5)
        .setDisplaySize(38, 38);
    }

    this.labelText = scene.add
      .text(options.x + this.textShift, options.y, options.label, {
        fontFamily: FONT,
        fontSize: options.big ? '32px' : '23px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#00000055',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    if (options.sublabel) {
      this.subText = scene.add
        .text(options.x + this.textShift, options.y, options.sublabel, {
          fontFamily: FONT,
          fontSize: '16px',
          color: '#ffffffdd',
        })
        .setOrigin(0.5);
    }

    this.hitZone.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.hovered = true;
      this.redraw();
    });
    this.hitZone.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.hovered = false;
      this.pressed = false;
      this.redraw();
    });
    this.hitZone.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (!this.enabled) return;
      this.pressed = true;
      this.redraw();
    });
    this.hitZone.on(Phaser.Input.Events.POINTER_UP, () => {
      const wasPressed = this.pressed;
      this.pressed = false;
      this.redraw();
      if (this.enabled && wasPressed) this.onClick();
    });

    this.setEnabled(this.enabled);
  }

  private redraw(): void {
    const g = this.gfx;
    g.clear();
    const w = this.width;
    const h = this.height;
    const left = this.x - w / 2;
    const top = this.y - h / 2 - LIFT / 2;
    const drop = this.pressed ? LIFT : 0;
    const face = this.enabled ? this.tint : 0x9a927e;
    const lip = darken(face, 0.55);
    const r = Math.min(20, h / 2);

    g.fillStyle(0x000000, 0.18);
    g.fillRoundedRect(left + 3, top + LIFT + 5, w, h, r);
    g.fillStyle(lip, 1);
    g.fillRoundedRect(left, top + LIFT, w, h, r);
    g.fillStyle(this.hovered && this.enabled ? lighten(face, 0.12) : face, 1);
    g.fillRoundedRect(left, top + drop, w, h, r);
    // A soft highlight across the top half, which is most of what makes a flat
    // shape read as something you can press.
    g.fillStyle(0xffffff, 0.16);
    g.fillRoundedRect(left + 6, top + drop + 4, w - 12, h * 0.42, {
      tl: r - 4,
      tr: r - 4,
      bl: 6,
      br: 6,
    });
    g.lineStyle(3, lip, 1);
    g.strokeRoundedRect(left, top + drop, w, h, r);

    const cy = this.y - LIFT / 2 + drop;
    this.labelText.setY(this.subText ? cy - 11 : cy);
    this.subText?.setY(cy + 15);
    this.iconImage?.setY(cy);
  }

  setDepth(depth: number): this {
    this.gfx.setDepth(depth);
    this.iconImage?.setDepth(depth + 1);
    this.labelText.setDepth(depth + 1);
    this.subText?.setDepth(depth + 1);
    this.hitZone.setDepth(depth + 2);
    return this;
  }

  setTint(tint: number): void {
    this.tint = tint;
    this.redraw();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.labelText.setAlpha(enabled ? 1 : 0.7);
    this.subText?.setAlpha(enabled ? 1 : 0.7);
    this.iconImage?.setAlpha(enabled ? 1 : 0.4);
    this.redraw();
  }

  setLabel(label: string, sublabel?: string): void {
    this.labelText.setText(label);
    if (sublabel !== undefined) this.subText?.setText(sublabel);
  }

  /** A gentle breathing scale, for the one button the screen wants pressed. */
  pulse(): this {
    this.scene.tweens.add({
      targets: [this.labelText],
      scale: 1.06,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    return this;
  }

  destroy(): void {
    this.hitZone.destroy();
    this.gfx.destroy();
    this.labelText.destroy();
    this.subText?.destroy();
    this.iconImage?.destroy();
  }
}

function darken(colour: number, k: number): number {
  const r = ((colour >> 16) & 0xff) * k;
  const g = ((colour >> 8) & 0xff) * k;
  const b = (colour & 0xff) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

function lighten(colour: number, k: number): number {
  const up = (c: number): number => Math.round(c + (255 - c) * k);
  return (
    (up((colour >> 16) & 0xff) << 16) |
    (up((colour >> 8) & 0xff) << 8) |
    up(colour & 0xff)
  );
}
