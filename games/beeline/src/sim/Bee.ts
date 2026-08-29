export type BeeState =
  /** No route assigned; drifting near the hive. */
  | 'idle'
  /** Assigned, waiting its turn to leave the hive. Keeps the stream even. */
  | 'queued'
  /**
   * Flying a newly drawn route to open it. Carries nothing and collects
   * nothing — this is what drawing costs.
   */
  | 'building'
  /** Flying outward along a route. */
  | 'outbound'
  /** Stopped at a patch, filling up. */
  | 'collect'
  /** Reached the route's live end but found no patch there. */
  | 'confused'
  /** Flying back along a route. */
  | 'inbound'
  /** Route died underneath it; flying straight home. */
  | 'homing';

/**
 * One bee.
 *
 * Position is stored twice — `x/y` for the current fixed step and `prevX/prevY`
 * for the previous one — so the renderer can interpolate between them. Without
 * that, a 60Hz simulation drawn on a 144Hz display visibly stutters.
 *
 * A bee's progress along its route is a single scalar `s` (arc distance).
 * Steering is then "sample the route at `s`, offset sideways by `lateral`, and
 * ease toward that point" rather than real force-based flocking. That is
 * roughly a hundred times cheaper, is perfectly stable, and — because every bee
 * has a different `lateral` and `speedMul` — still reads as a loose organic
 * stream rather than beads on a wire.
 */
export class Bee {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;

  state: BeeState = 'idle';
  /**
   * What `carrying` currently holds.
   *
   * A bee on a sell line leaves the hive loaded with honey and comes back with
   * money, so the amount alone is no longer enough to know what to do with it
   * on arrival. One field rather than three, because a bee only ever carries
   * one thing at a time and three would only ever disagree.
   */
  payload: 'nectar' | 'honey' | 'money' = 'nectar';
  /** Route id, or 0 when unassigned. */
  routeId = 0;
  /** Arc distance along the assigned route. */
  s = 0;
  /** Sideways offset from the route centreline. Fixed per bee. */
  lateral = 0;
  /**
   * Where this bee is in its own weave, and how long a full weave takes.
   *
   * The sideways offset used to be `lateral` alone, which is a constant — so
   * the swarm flew the route as two dead-straight lanes, beads on a wire. The
   * offset is now `lateral` plus a sine of **arc distance**, which is the part
   * that matters: a wave in `s` rather than in time is a shape fixed in
   * *space*, so a bee traces a serpentine through the world and the stream
   * reads as a braided ribbon. A wave in time would make every bee wobble
   * where it stood, which looks like a wire vibrating, not like flight.
   *
   * Phase and wavelength vary per bee so the swarm never falls into step —
   * dozens of bees weaving in unison would read as one thick snake.
   */
  wavePhase = 0;
  waveLength = 90;
  /** Per-bee speed multiplier, so the stream spreads out naturally. */
  speedMul = 1;
  carrying = 0;
  timer = 0;

  /** Wander phase for idle drift, so idle bees do not move in lockstep. */
  wanderPhase = 0;
  wanderSpeed = 1;

  reset(
    hiveX: number,
    hiveY: number,
    lateralSpread: number,
    jitter: number,
    waveLength = 90,
    waveLengthJitter = 0,
  ): void {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 40;
    this.x = hiveX + Math.cos(angle) * radius;
    this.y = hiveY + Math.sin(angle) * radius;
    this.prevX = this.x;
    this.prevY = this.y;

    this.state = 'idle';
    this.payload = 'nectar';
    this.routeId = 0;
    this.s = 0;
    this.carrying = 0;
    this.timer = 0;

    // Signed offset, biased away from dead centre so the stream reads as two
    // loose lanes rather than one dense line.
    const sign = Math.random() < 0.5 ? -1 : 1;
    this.lateral = sign * (0.35 + Math.random() * 0.65) * lateralSpread;
    this.speedMul = 1 + (Math.random() * 2 - 1) * jitter;

    this.wavePhase = Math.random() * Math.PI * 2;
    this.waveLength = Math.max(
      20,
      waveLength * (1 + (Math.random() * 2 - 1) * waveLengthJitter),
    );

    this.wanderPhase = Math.random() * Math.PI * 2;
    this.wanderSpeed = 0.6 + Math.random() * 0.8;
  }
}
