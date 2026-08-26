import { TUNING, type BuyerTuning } from '../config/tuning.ts';

export type BuyerId = 'market' | 'apothecary';

/**
 * Somebody who buys honey, at a price that moves.
 *
 * This is the second half of the loop. Flowers make honey and the hive can only
 * hold so much of it; a buyer turns honey into money, and money is what buys
 * everything. Which of the two you sell to, and when, is the decision the whole
 * economy now rests on.
 *
 * ### Why the price is waves and not a random walk
 *
 * A random walk is unreadable. The player sees a number twitch, cannot tell a
 * dip from the start of a slide, and the only strategy it supports is "sell to
 * whoever is higher right now" — which is not a decision, it is a comparison.
 *
 * The price here is the sum of two sine waves with per-day random phases. That
 * gives it three properties a walk does not have:
 *
 *   - it is **smooth**, so a rising price visibly keeps rising for a while and
 *     holding your honey for six more seconds is a judgement you can make;
 *   - it is **bounded**, so no day is decided by one freak number;
 *   - it has a **rhythm** you can learn, while the phases keep the specific
 *     shape of any given day unknown.
 *
 * The two buyers use different periods and amplitudes rather than being pushed
 * into opposition. Anti-correlating them would mean there is always one right
 * answer and the read is trivial; giving one a steady price and the other a
 * wild one makes it a question about appetite for risk, which is a better
 * question and the one Turmoil actually asks.
 *
 * ### Why selling depresses the price
 *
 * Without it, the whole game is "find the peak, dump everything, repeat", and
 * the far buyer's higher base makes the near one pointless. Saturation means a
 * buyer you have just emptied a hive into pays less for the next load and takes
 * time to recover, so alternating is worth something and a huge sale is worth
 * less per unit than two timed ones. It is the one rule that makes both buyers
 * matter for the whole day.
 */
export class Buyer {
  readonly id: BuyerId;
  readonly x: number;
  readonly y: number;
  readonly tuning: BuyerTuning;

  /** How much this buyer has been leaned on lately. 0 is a fresh market. */
  private saturation = 0;
  private phaseA = 0;
  private phaseB = 0;
  private elapsed = 0;
  private lastPrice = 0;

  constructor(id: BuyerId, x: number, y: number) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.tuning = TUNING.buyers[id];
    this.beginDay();
  }

  /** Fresh phases and an empty order book. Called at dawn. */
  beginDay(random: () => number = Math.random): void {
    this.phaseA = random() * Math.PI * 2;
    this.phaseB = random() * Math.PI * 2;
    this.saturation = 0;
    this.elapsed = 0;
    this.lastPrice = this.price;
  }

  /** Money paid per unit of honey, right now. */
  get price(): number {
    const t = this.tuning;
    const wave =
      1 +
      t.swingSlow * Math.sin((this.elapsed / t.periodSlow) * Math.PI * 2 + this.phaseA) +
      t.swingFast * Math.sin((this.elapsed / t.periodFast) * Math.PI * 2 + this.phaseB);

    // Saturation multiplies rather than subtracts, so a buyer whose price is
    // already in a trough is not driven to nothing by one big sale.
    const price = t.basePrice * wave * (1 - this.saturation);
    return Math.max(t.basePrice * t.floorFraction, price);
  }

  /**
   * -1, 0 or 1: which way the price is heading.
   *
   * The single most important number on the screen, and the reason the wave
   * model was chosen — an arrow on a random walk is a lie, an arrow on a smooth
   * curve is a forecast.
   */
  get trend(): -1 | 0 | 1 {
    const delta = this.price - this.lastPrice;
    const threshold = this.tuning.basePrice * 0.004;
    if (delta > threshold) return 1;
    if (delta < -threshold) return -1;
    return 0;
  }

  /** How good this price is against this buyer's own normal. 0..1-ish. */
  get standing(): number {
    return this.price / this.tuning.basePrice;
  }

  step(dt: number): void {
    this.lastPrice = this.price;
    this.elapsed += dt;
    this.saturation = Math.max(
      0,
      this.saturation - this.saturation * this.tuning.saturationRecovery * dt,
    );
  }

  /** Sells `honey` here. Returns the money paid, and moves the price. */
  sell(honey: number): number {
    const paid = honey * this.price;
    this.saturation = Math.min(
      this.tuning.maxSaturation,
      this.saturation + honey * this.tuning.saturationPerHoney,
    );
    return paid;
  }
}
