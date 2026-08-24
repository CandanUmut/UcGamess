import { TUNING } from '../config/tuning.ts';
import { Bee } from './Bee.ts';
import { Patch, type PatchKind } from './Patch.ts';
import { Route } from './Route.ts';
import { Wasp } from './Wasp.ts';
import { coordsLength, type SamplePoint } from './polyline.ts';
import { deriveStats, emptyLevels, type DerivedStats } from '../game/Upgrades.ts';
import type { DayFeatures } from '../game/DayCycle.ts';

const scratch: SamplePoint = { x: 0, y: 0, tx: 0, ty: 0 };

export interface FieldStats {
  honey: number;
  bees: number;
  routes: number;
  laden: number;
  collecting: number;
}

/** Things worth reacting to visually or audibly. Drained once per frame. */
export interface FieldEvents {
  /** Positions where nectar was picked up this step. */
  collected: Array<{ x: number; y: number; amount: number }>;
  /** How much honey was deposited at the hive this step. */
  deposited: number;
  /** Positions where bees were scattered by a wasp. */
  scattered: Array<{ x: number; y: number }>;
  /** Workers committed to a newly drawn route this step. */
  dispatched: number;
}

const NO_FEATURES: DayFeatures = {
  wind: false,
  wasps: 0,
  richPatches: false,
  nightBloom: false,
};

/**
 * The whole simulation: hive, routes, patches, swarm, hazards.
 *
 * Deliberately free of any Phaser reference. Everything here is plain numbers
 * advanced by a fixed `dt`, which makes it unit-testable and — more importantly
 * for this game — identical at 60Hz and 144Hz. Physics breaking on high-refresh
 * displays is a documented portal rejection cause, so the split is structural,
 * not stylistic.
 */
export class Field {
  readonly hiveX = TUNING.hive.x;
  readonly hiveY = TUNING.hive.y;

  routes: Route[] = [];
  patches: Patch[] = [];
  bees: Bee[] = [];
  wasps: Wasp[] = [];

  honey = 0;
  /** Debug affordance: freeze route decay to feel the contrast. */
  decayEnabled = true;

  stats: DerivedStats = deriveStats(emptyLevels());
  features: DayFeatures = NO_FEATURES;

  /** Multiplier on effective swarm size, for the rewarded swarm boost. */
  swarmBoost = 1;

  events: FieldEvents = { collected: [], deposited: 0, scattered: [], dispatched: 0 };

  private elapsed = 0;
  private windAngle = Math.random() * Math.PI * 2;
  private windStrength = 0;
  private patchPool = TUNING.patch.basePool;
  /** Current day, used to widen the field and size flower pools. */
  private day = 1;

  constructor() {
    this.applyStats();
  }

  get time(): number {
    return this.elapsed;
  }

  get routeHoldSeconds(): number {
    return this.stats.routeHoldSeconds;
  }

  // ---------------------------------------------------------------- setup

  setStats(stats: DerivedStats): void {
    this.stats = stats;
    this.applyStats();
  }

  private applyStats(): void {
    this.setBeeCount(Math.round(this.stats.beeCount * this.swarmBoost));
  }

  /**
   * Rebuilds the field for a day: fresh patches, no routes, hazards per the
   * escalation schedule.
   *
   * Routes are cleared deliberately. Starting each day with an empty field
   * gives the drawing gesture a reason to happen at the top of every day, which
   * is what makes the loop feel like a series of fresh attempts rather than one
   * long session with interruptions.
   */
  beginDay(day: number, features: DayFeatures, patchCount: number, boost: number): void {
    this.features = features;
    this.swarmBoost = boost;
    this.honey = 0;
    this.elapsed = 0;
    this.day = day;

    this.clearRoutes();
    this.patches = [];
    this.wasps = [];

    this.patchPool = TUNING.patch.basePool + (day - 1) * TUNING.patch.poolPerDay;

    for (let i = 0; i < patchCount; i += 1) {
      const kind: PatchKind =
        features.richPatches && i === patchCount - 1 ? 'rich' : 'normal';
      this.spawnPatch(kind);
    }

    this.windStrength = features.wind
      ? Math.min(
          TUNING.wind.baseStrength +
            (day - TUNING.wind.startDay) * TUNING.wind.strengthPerDay,
          TUNING.wind.maxStrength,
        )
      : 0;

    for (let i = 0; i < features.wasps; i += 1) {
      const spot = this.randomPatchPosition('normal');
      this.wasps.push(new Wasp(spot.x, spot.y));
    }

    this.applyStats();
    for (const bee of this.bees) {
      bee.reset(this.hiveX, this.hiveY, TUNING.bee.lateralSpread, TUNING.bee.speedJitter);
    }
  }

  // ---------------------------------------------------------------- swarm

  setBeeCount(count: number): void {
    const target = Math.max(0, Math.floor(count));

    while (this.bees.length > target) {
      const bee = this.bees.pop();
      if (bee && bee.routeId !== 0) {
        const route = this.routeById(bee.routeId);
        if (route) route.beeCount -= 1;
      }
    }

    while (this.bees.length < target) {
      const bee = new Bee();
      bee.reset(this.hiveX, this.hiveY, TUNING.bee.lateralSpread, TUNING.bee.speedJitter);
      this.bees.push(bee);
    }
  }

  // ---------------------------------------------------------------- patches

  private randomPatchPosition(kind: PatchKind): { x: number; y: number } {
    // The field widens as days pass. Distance is already expensive — constant
    // retreat speed, more workers to draw — so spreading the flowers ramps
    // difficulty using pressure that already exists rather than adding a new
    // one. Bounded by the canvas: this is a fixed 16:9 view, not a scrolling
    // world, so "larger map" means the flowers use more of it.
    const spread = (this.day - 1) * TUNING.patch.radiusPerDay;
    const minRadius = Math.min(
      (kind === 'rich' ? TUNING.patch.richMinRadius : TUNING.patch.minRadius) +
        spread * 0.5,
      340,
    );
    const maxRadius = Math.min(TUNING.patch.maxRadius + spread, 560);

    // Bounds leave room for the reach ring, which is the thing the player aims
    // at — a patch whose ring runs off the edge is unaimable at exactly the
    // moment it matters. The top margin also clears the HUD.
    const margin = TUNING.patch.reachRadius + 20;
    const minX = margin;
    const maxX = 1280 - margin;
    const minY = 110 + margin;
    const maxY = 720 - margin;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      // sqrt keeps the distribution even by area rather than clustering inward.
      const t = Math.sqrt(Math.random());
      const radius = minRadius + t * (maxRadius - minRadius);
      const angle = Math.random() * Math.PI * 2;
      const x = clamp(this.hiveX + Math.cos(angle) * radius, minX, maxX);
      const y = clamp(this.hiveY + Math.sin(angle) * radius * 0.72, minY, maxY);

      // Reject spots that overlap an existing patch — overlapping bloom circles
      // read as one confusing blob and make aiming ambiguous.
      const tooClose = this.patches.some(
        (p) => p.alive && Math.hypot(p.x - x, p.y - y) < 150,
      );
      if (!tooClose) return { x, y };
    }

    const angle = Math.random() * Math.PI * 2;
    return {
      x: clamp(this.hiveX + Math.cos(angle) * minRadius, minX, maxX),
      y: clamp(this.hiveY + Math.sin(angle) * minRadius * 0.72, minY, maxY),
    };
  }

  spawnPatch(kind: PatchKind = 'normal'): Patch {
    const spot = this.randomPatchPosition(kind);
    const patch = new Patch(spot.x, spot.y, this.patchPool, kind);
    this.patches.push(patch);
    return patch;
  }

  removePatch(): void {
    const patch = this.patches.pop();
    if (!patch) return;
    for (const route of this.routes) {
      if (route.target === patch) route.target = null;
    }
  }

  /** Nearest living patch to a point, within `limit` if given. */
  nearestPatchTo(x: number, y: number, limit = Number.POSITIVE_INFINITY): Patch | null {
    let best: Patch | null = null;
    let bestDist = limit;

    for (const patch of this.patches) {
      if (!patch.alive) continue;
      const dist = Math.hypot(patch.x - x, patch.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = patch;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- routes

  routeById(id: number): Route | undefined {
    return this.routes.find((r) => r.id === id);
  }

  /**
   * The route whose live tip is nearest to (x, y), within the snap radius.
   *
   * Used to decide whether a drag is a cheap extension or a fresh draw. The
   * radius is generous on purpose: the first playtest found the tip-only
   * gesture undiscoverable, so the rule is now "if you started anywhere near
   * the end of a route, you probably meant to continue it".
   */
  routeToExtendAt(x: number, y: number): Route | null {
    let best: Route | null = null;
    let bestDist = TUNING.route.refreshSnapRadius;

    for (const route of this.routes) {
      if (route.dead) continue;
      const dist = Math.hypot(route.tipX - x, route.tipY - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = route;
      }
    }
    return best;
  }

  /**
   * The live route passing nearest to (x, y), for press-and-hold erase.
   *
   * Tests the whole path rather than just the tip: the player is pointing at a
   * line they can see, and asking them to find one specific end of it is the
   * mistake that made the old refresh gesture undiscoverable.
   */
  routeNear(x: number, y: number, tolerance = 34): Route | null {
    let best: Route | null = null;
    let bestDist = tolerance;

    for (const route of this.routes) {
      if (route.dead) continue;
      // Sampling every 14px is finer than the tolerance, so no gap is missed.
      for (let s = 0; s <= route.liveLength; s += 14) {
        route.sample(s, scratch);
        const dist = Math.hypot(scratch.x - x, scratch.y - y);
        if (dist < bestDist) {
          bestDist = dist;
          best = route;
        }
      }
    }
    return best;
  }

  /** The live route already serving `patch`, if any. */
  routeTargeting(patch: Patch): Route | null {
    return this.routes.find((r) => !r.dead && r.target === patch) ?? null;
  }

  isNearHive(x: number, y: number): boolean {
    return Math.hypot(x - this.hiveX, y - this.hiveY) <= TUNING.hive.drawRadius;
  }

  /**
   * Commits a freshly drawn path as a new route.
   *
   * At the route cap the *most decayed* route is evicted rather than the
   * oldest. A gesture is never refused mid-motion — being told "no" at the end
   * of a drag on a touchscreen reads as a bug, not a rule — and evicting the
   * weakest is the choice the player would have made anyway.
   */
  createRoute(coords: readonly number[]): Route | null {
    if (coordsLength(coords) < TUNING.route.minLength) return null;

    if (this.routes.length >= TUNING.route.maxCount) {
      let weakest = this.routes[0];
      for (const route of this.routes) {
        if (weakest && route.vitality < weakest.vitality) weakest = route;
      }
      if (weakest) this.killRoute(weakest);
    }

    const route = new Route(coords, this.routeHoldSeconds);
    route.updateTip();
    route.target = this.nearestPatchTo(route.tipX, route.tipY);
    this.routes.push(route);
    return route;
  }

  retarget(route: Route): void {
    route.target = this.nearestPatchTo(route.tipX, route.tipY);
  }

  /**
   * Commits workers to open a freshly drawn stretch of route.
   *
   * This is the price of drawing. `drawnLength` is what the player's gesture
   * actually covered — the piece that was missing, not the whole route — so
   * refreshing a stub costs a handful of bees and redrawing from the hive costs
   * a crowd. The cost is paid in throughput: a worker flies the line once and
   * comes back empty, so for a few seconds the swarm carries less.
   *
   * Never refuses. If the swarm is already stretched, fewer workers go and the
   * route simply opens with less fanfare — a drag that silently does nothing is
   * the worst thing a touchscreen game can do.
   */
  dispatchBuilders(route: Route, drawnLength: number): number {
    const wanted = Math.ceil(drawnLength * TUNING.bee.workersPerPixel);
    const ceiling = Math.floor(this.bees.length * TUNING.bee.maxWorkerFraction);
    const budget = Math.max(0, Math.min(wanted, ceiling));
    if (budget === 0) return 0;

    let sent = 0;

    /**
     * Only bees that are at the hive or already heading back to it can be
     * conscripted. Never one that is outbound or on a flower.
     *
     * Taking an in-flight forager was measured as a disaster: with a redraw
     * every couple of seconds, bees 90% of the way to a flower were repeatedly
     * reset to the start of the line and nobody ever arrived. Honey flatlined
     * and day one — which must be unmissable — failed.
     *
     * The rule also gives the cost a nice shape on its own: drawing while the
     * swarm is out in the field is cheap, and drawing just as a wave lands
     * costs the most. It is never destructive, only an opportunity cost.
     */
    const conscriptable = (bee: Bee): boolean => {
      if (bee.state === 'idle' || bee.state === 'queued') return true;
      return bee.state === 'inbound' && bee.carrying === 0;
    };

    for (const bee of this.bees) {
      if (sent >= budget) break;
      if (!conscriptable(bee)) continue;

      this.releaseBee(bee);
      route.beeCount += 1;
      bee.routeId = route.id;
      bee.s = 0;
      bee.carrying = 0;
      bee.state = 'building';
      sent += 1;
    }

    this.events.dispatched += sent;
    return sent;
  }

  /** Bees currently opening a route rather than carrying nectar. */
  countBuilders(): number {
    let building = 0;
    for (const bee of this.bees) if (bee.state === 'building') building += 1;
    return building;
  }

  killRoute(route: Route): void {
    route.dead = true;
    const index = this.routes.indexOf(route);
    if (index >= 0) this.routes.splice(index, 1);

    for (const bee of this.bees) {
      if (bee.routeId === route.id) {
        bee.routeId = 0;
        bee.state = bee.state === 'idle' || bee.state === 'queued' ? 'idle' : 'homing';
      }
    }
    route.beeCount = 0;
  }

  clearRoutes(): void {
    for (const route of [...this.routes]) this.killRoute(route);
  }

  // ---------------------------------------------------------------- stepping

  step(dt: number): void {
    this.elapsed += dt;

    for (const patch of this.patches) patch.step(dt);

    if (this.windStrength > 0) this.stepWind(dt);

    for (const wasp of this.wasps) {
      wasp.step(dt, () => this.randomPatchPosition('normal'));
    }

    for (const route of [...this.routes]) {
      if (this.decayEnabled) route.step(dt);
      else route.updateTip();

      if (route.dead) {
        this.killRoute(route);
        continue;
      }
      if (!route.target || !route.target.alive) this.retarget(route);
    }

    for (const bee of this.bees) this.stepBee(bee, dt);
  }

  /**
   * Bends stored route points sideways.
   *
   * The wind moves the *line the player drew*, not the bees. Pushing the bees
   * off the line instead would desynchronise them from the visible route, and
   * the player would have no way to see or counter what was happening. Bending
   * the route keeps cause and effect on screen: your straight line becomes an
   * arc, so it gets longer, so throughput drops.
   */
  private stepWind(dt: number): void {
    this.windAngle += TUNING.wind.rotationSpeed * dt;
    const nx = Math.cos(this.windAngle);
    const ny = Math.sin(this.windAngle);
    const push = this.windStrength * dt;

    for (const route of this.routes) {
      const poly = route.poly;
      for (let i = 1; i < poly.count; i += 1) {
        // Points further from the hive bend more, so the route bows rather
        // than sliding sideways as a rigid whole.
        const influence = i / poly.count;
        poly.pts[i * 2] = (poly.pts[i * 2] ?? 0) + nx * push * influence;
        poly.pts[i * 2 + 1] = (poly.pts[i * 2 + 1] ?? 0) + ny * push * influence;
      }
      route.rebuildLengths();
    }
  }

  get windVector(): { x: number; y: number; strength: number } {
    return {
      x: Math.cos(this.windAngle),
      y: Math.sin(this.windAngle),
      strength: this.windStrength,
    };
  }

  private assignBee(bee: Bee): void {
    let best: Route | null = null;
    for (const route of this.routes) {
      if (route.dead) continue;
      if (!best || route.beeCount < best.beeCount) best = route;
    }

    if (!best) {
      bee.routeId = 0;
      bee.state = 'idle';
      return;
    }

    best.beeCount += 1;
    bee.routeId = best.id;
    bee.s = 0;

    // Take a slot in the departure queue. Spacing bees at the hive is what
    // turns a travelling clump into a stream — without it, everyone assigned in
    // the same frame flies the whole route shoulder to shoulder.
    const departAt = Math.max(this.elapsed, best.nextDepartAt);
    best.nextDepartAt = departAt + TUNING.bee.departIntervalSeconds;
    bee.timer = departAt - this.elapsed;
    bee.state = bee.timer > 0 ? 'queued' : 'outbound';
  }

  private releaseBee(bee: Bee): void {
    if (bee.routeId === 0) return;
    const route = this.routeById(bee.routeId);
    if (route) route.beeCount -= 1;
    bee.routeId = 0;
  }

  private stepBee(bee: Bee, dt: number): void {
    bee.prevX = bee.x;
    bee.prevY = bee.y;

    const speed = this.stats.beeSpeed * bee.speedMul;

    // Wasps only threaten bees that are actually out in the field.
    if (
      this.wasps.length > 0 &&
      (bee.state === 'outbound' ||
        bee.state === 'inbound' ||
        bee.state === 'collect' ||
        bee.state === 'building')
    ) {
      for (const wasp of this.wasps) {
        if (!wasp.threatens(bee.x, bee.y, this.hiveX, this.hiveY)) continue;
        this.events.scattered.push({ x: bee.x, y: bee.y });
        this.releaseBee(bee);
        bee.carrying = 0;
        bee.state = 'homing';
        return;
      }
    }

    switch (bee.state) {
      case 'idle': {
        this.driftNearHive(bee, dt);
        if (this.routes.length > 0) this.assignBee(bee);
        return;
      }

      case 'queued': {
        this.driftNearHive(bee, dt);
        bee.timer -= dt;
        if (bee.timer <= 0) {
          const route = this.routeById(bee.routeId);
          if (!route || route.dead) {
            this.releaseBee(bee);
            bee.state = 'idle';
          } else {
            bee.s = 0;
            bee.state = 'outbound';
          }
        }
        return;
      }

      case 'homing': {
        this.flyToward(bee, this.hiveX, this.hiveY, speed, dt);
        if (Math.hypot(bee.x - this.hiveX, bee.y - this.hiveY) < 26) {
          this.deposit(bee);
          bee.state = 'idle';
        }
        return;
      }

      case 'collect': {
        bee.timer -= dt;
        const patch = this.routeById(bee.routeId)?.target ?? null;
        if (patch) this.driftAround(bee, patch.x, patch.y, 16, dt);
        if (bee.timer <= 0) {
          if (patch) {
            bee.carrying = patch.drain(TUNING.bee.nectarPerTrip);
            if (bee.carrying > 0) {
              this.events.collected.push({
                x: patch.x,
                y: patch.y,
                amount: bee.carrying,
              });
            }
          }
          bee.state = 'inbound';
        }
        return;
      }

      case 'confused': {
        // Visibly mills at the dead tip, then gives up and returns empty. The
        // player should be able to see *why* honey stopped arriving.
        bee.timer -= dt;
        const route = this.routeById(bee.routeId);
        if (route) this.driftAround(bee, route.tipX, route.tipY, 20, dt);
        if (bee.timer <= 0) bee.state = 'inbound';
        return;
      }

      case 'building':
      case 'outbound':
      case 'inbound': {
        const route = this.routeById(bee.routeId);
        if (!route || route.dead) {
          this.releaseBee(bee);
          bee.state = 'homing';
          return;
        }

        if (bee.state === 'building') {
          // Flies the new line once to open it, then comes home empty. The lost
          // round trip is the cost of the draw.
          bee.s += speed * dt;
          if (bee.s >= route.liveLength) {
            bee.s = route.liveLength;
            bee.state = 'inbound';
          }
        } else if (bee.state === 'outbound') {
          bee.s += speed * dt;
          if (bee.s >= route.liveLength) {
            bee.s = route.liveLength;
            if (route.reachesTarget()) {
              bee.state = 'collect';
              bee.timer = TUNING.bee.collectSeconds;
            } else {
              bee.state = 'confused';
              bee.timer = TUNING.bee.confusedSeconds;
            }
          }
        } else {
          bee.s -= speed * dt;
          if (bee.s <= 0) {
            bee.s = 0;
            this.deposit(bee);
            this.releaseBee(bee);
            this.assignBee(bee);
            return;
          }
        }

        if (bee.s > route.liveLength) bee.s = route.liveLength;

        route.sample(bee.s, scratch);
        // Fade the sideways offset out near both ends so the stream converges
        // tidily at the hive and the flower instead of arriving as a smear.
        const endFade = Math.min(
          1,
          Math.min(bee.s, Math.max(route.liveLength - bee.s, 0)) / 60,
        );
        const targetX = scratch.x - scratch.ty * bee.lateral * endFade;
        const targetY = scratch.y + scratch.tx * bee.lateral * endFade;

        this.easeToward(bee, targetX, targetY);
        return;
      }

      default:
        return;
    }
  }

  private deposit(bee: Bee): void {
    if (bee.carrying <= 0) return;
    this.honey += bee.carrying;
    this.events.deposited += bee.carrying;
    bee.carrying = 0;
  }

  private easeToward(bee: Bee, targetX: number, targetY: number): void {
    const k = TUNING.bee.steerLerp;
    bee.x += (targetX - bee.x) * k;
    bee.y += (targetY - bee.y) * k;
  }

  private flyToward(
    bee: Bee,
    targetX: number,
    targetY: number,
    speed: number,
    dt: number,
  ): void {
    const dx = targetX - bee.x;
    const dy = targetY - bee.y;
    const dist = Math.hypot(dx, dy) || 1;
    const step = Math.min(speed * dt, dist);
    bee.x += (dx / dist) * step;
    bee.y += (dy / dist) * step;
  }

  private driftNearHive(bee: Bee, dt: number): void {
    bee.wanderPhase += dt * bee.wanderSpeed;
    const radius =
      TUNING.bee.idleDriftRadius *
      (0.35 + 0.65 * Math.abs(Math.sin(bee.wanderPhase * 0.6)));
    const targetX = this.hiveX + Math.cos(bee.wanderPhase) * radius;
    const targetY = this.hiveY + Math.sin(bee.wanderPhase * 1.3) * radius * 0.6;
    bee.x += (targetX - bee.x) * 0.035;
    bee.y += (targetY - bee.y) * 0.035;
  }

  private driftAround(
    bee: Bee,
    cx: number,
    cy: number,
    radius: number,
    dt: number,
  ): void {
    bee.wanderPhase += dt * 5 * bee.wanderSpeed;
    const targetX = cx + Math.cos(bee.wanderPhase) * radius;
    const targetY = cy + Math.sin(bee.wanderPhase * 1.4) * radius;
    bee.x += (targetX - bee.x) * 0.25;
    bee.y += (targetY - bee.y) * 0.25;
  }

  /** Returns and clears this frame's events. */
  drainEvents(): FieldEvents {
    const out = this.events;
    this.events = { collected: [], deposited: 0, scattered: [], dispatched: 0 };
    return out;
  }

  getStats(): FieldStats {
    let laden = 0;
    let collecting = 0;
    for (const bee of this.bees) {
      if (bee.carrying > 0) laden += 1;
      if (bee.state === 'collect') collecting += 1;
    }
    return {
      honey: this.honey,
      bees: this.bees.length,
      routes: this.routes.length,
      laden,
      collecting,
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
