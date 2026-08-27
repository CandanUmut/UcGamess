import { TUNING } from '../config/tuning.ts';

export type AimMode = 'idle' | 'aiming' | 'flying';

/**
 * The dial: aim by timing rather than by dragging.
 *
 * Drawing a line freehand was the game's oldest verb and it never stopped
 * causing trouble. It made the board a chore list — every flower needed a
 * gesture traced to it — and every attempt to make it *demanding* (decay, wind)
 * made it worse rather than harder, because the difficulty landed on the
 * player's thumb instead of on their judgement.
 *
 * The dial moves the difficulty somewhere a player can get good at: **timing**.
 *
 *   1. Tap the hive, or the end of a line you already own. A dial opens there
 *      with an arrow sweeping round it.
 *   2. Tap again. The path fires off in whatever direction the arrow was
 *      pointing, and keeps going.
 *   3. Tap once more and it stops where it is. Tap that end again and the dial
 *      re-opens there, so a long route is built in shots rather than traced.
 *
 * The arrow accelerates the longer you leave the dial open, and its base speed
 * climbs every day. Hesitating is what costs you, which is exactly the pressure
 * an arcade game wants: easy to understand in one second, never fully mastered.
 *
 * Phaser-free on purpose, like the rest of `sim/` — the whole mechanic is one
 * small state machine and it is worth being able to test it as one.
 */
export class Aimer {
  mode: AimMode = 'idle';

  /** Where the dial sits, and where the next shot starts from. */
  anchorX = 0;
  anchorY = 0;
  /** Which way the arrow points, in radians. */
  angle = 0;
  /** The head of the shot in flight. */
  headX = 0;
  headY = 0;
  /** The path this shot has laid so far. */
  coords: number[] = [];
  /** The line being carried on, or 0 for a fresh one. */
  routeId = 0;

  /** How long the dial has been open, which is what makes it accelerate. */
  private openFor = 0;
  /** How far this shot has flown. */
  private flown = 0;
  /** Base spin for the day. */
  private daySpin = TUNING.aim.spinBase;

  /** Sets the day's base spin. Later days start faster. */
  beginDay(day: number): void {
    this.daySpin = Math.min(
      TUNING.aim.maxSpin,
      TUNING.aim.spinBase + TUNING.aim.spinPerDay * (day - 1),
    );
    this.cancel();
  }

  /** Radians per second right now. Grows while the dial is open. */
  get spinSpeed(): number {
    return Math.min(
      TUNING.aim.maxSpin,
      this.daySpin + TUNING.aim.spinAccel * this.openFor,
    );
  }

  /** 0..1, how wound-up the dial is. Drives the colour of the arrow. */
  get tension(): number {
    const span = TUNING.aim.maxSpin - this.daySpin;
    return span <= 0 ? 1 : Math.min(1, (this.spinSpeed - this.daySpin) / span);
  }

  /** How far this shot has already flown. */
  get flownLength(): number {
    return this.flown;
  }

  /** How far this shot may still travel. */
  get flightLeft(): number {
    return Math.max(0, TUNING.aim.maxFlightLength - this.flown);
  }

  open(
    x: number,
    y: number,
    routeId: number,
    startAngle = Math.random() * Math.PI * 2,
  ): void {
    this.mode = 'aiming';
    this.anchorX = x;
    this.anchorY = y;
    this.headX = x;
    this.headY = y;
    this.routeId = routeId;
    this.angle = startAngle;
    this.openFor = 0;
    this.flown = 0;
    this.coords = [x, y];
  }

  /** Fires. Returns false if there was nothing to fire. */
  launch(): boolean {
    if (this.mode !== 'aiming') return false;
    this.mode = 'flying';
    this.coords = [this.anchorX, this.anchorY];
    return true;
  }

  cancel(): void {
    this.mode = 'idle';
    this.coords = [];
    this.routeId = 0;
    this.openFor = 0;
    this.flown = 0;
  }

  /** Spins the arrow. Only meaningful while aiming. */
  spin(dt: number): void {
    if (this.mode !== 'aiming') return;
    this.openFor += dt;
    this.angle = (this.angle + this.spinSpeed * dt) % (Math.PI * 2);
  }

  /**
   * Advances the shot by one step, and reports where it wants to go.
   *
   * The caller decides whether that point is legal — the aimer knows nothing
   * about walls, flowers or the edge of the board, and keeping it that way is
   * what makes it testable without a field around it.
   */
  nextStep(dt: number): { x: number; y: number; distance: number } {
    const step = Math.min(TUNING.aim.launchSpeed * dt, this.flightLeft);
    return {
      x: this.headX + Math.cos(this.angle) * step,
      y: this.headY + Math.sin(this.angle) * step,
      distance: step,
    };
  }

  /** Accepts a step the caller has judged legal. */
  advanceTo(x: number, y: number, distance: number): void {
    this.headX = x;
    this.headY = y;
    this.flown += distance;
    this.coords.push(x, y);
  }
}
