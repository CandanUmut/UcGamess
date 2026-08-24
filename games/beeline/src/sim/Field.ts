import { TUNING } from '../config/tuning.ts';
import { Bee } from './Bee.ts';
import { Patch } from './Patch.ts';
import { Route } from './Route.ts';
import { coordsLength, type SamplePoint } from './polyline.ts';

const scratch: SamplePoint = { x: 0, y: 0, tx: 0, ty: 0 };

export interface FieldStats {
  honey: number;
  bees: number;
  routes: number;
  laden: number;
  collecting: number;
}

/**
 * The whole simulation: hive, routes, patches, swarm.
 *
 * Deliberately free of any Phaser reference. Everything here is plain numbers
 * advanced by a fixed `dt`, which means it is unit-testable, and — more
 * importantly for this game — it behaves identically on a 60Hz laptop and a
 * 144Hz monitor. Physics breaking on high-refresh displays is a documented
 * portal rejection cause, so the split is not stylistic.
 */
export class Field {
  readonly hiveX = TUNING.hive.x;
  readonly hiveY = TUNING.hive.y;

  routes: Route[] = [];
  patches: Patch[] = [];
  bees: Bee[] = [];

  honey = 0;
  /** Set true to freeze route decay — a debug affordance for the feel test. */
  decayEnabled = true;

  /** Route persistence, in seconds of grace. Raised by the upgrade in Stage 3. */
  holdSeconds = TUNING.route.holdSeconds;

  private elapsed = 0;

  constructor(beeCount = TUNING.bee.baseCount, patchCount = TUNING.patch.baseCount) {
    this.setBeeCount(beeCount);
    for (let i = 0; i < patchCount; i += 1) this.spawnPatch();
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

  private randomPatchPosition(): { x: number; y: number } {
    const { minRadius, maxRadius } = TUNING.patch;
    // sqrt keeps the distribution even by area rather than clustering inward.
    const t = Math.sqrt(Math.random());
    const radius = minRadius + t * (maxRadius - minRadius);
    const angle = Math.random() * Math.PI * 2;

    return {
      x: clamp(this.hiveX + Math.cos(angle) * radius, 70, 1210),
      y: clamp(this.hiveY + Math.sin(angle) * radius * 0.72, 90, 650),
    };
  }

  spawnPatch(): Patch {
    const spot = this.randomPatchPosition();
    const patch = new Patch(spot.x, spot.y, TUNING.patch.basePool);
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

  private nearestPatchTo(x: number, y: number): Patch | null {
    let best: Patch | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

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
   * The live route end nearest to (x, y), if one is within the snap radius.
   *
   * This is what makes a drag a *refresh* rather than a new route. Checking the
   * tip specifically — not the whole path — is deliberate: refreshing has to
   * mean "continue from where it died back to", which is the only place the
   * gesture is genuinely shorter than drawing again.
   */
  routeToRefreshAt(x: number, y: number): Route | null {
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

  /** True when (x, y) is close enough to the hive to begin a new route. */
  isNearHive(x: number, y: number): boolean {
    return Math.hypot(x - this.hiveX, y - this.hiveY) <= TUNING.hive.drawRadius;
  }

  /**
   * Commits a freshly drawn path as a new route.
   *
   * At the route cap, the *most decayed* route is evicted rather than the
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

    const route = new Route(coords, this.holdSeconds);
    route.updateTip();
    route.target = this.nearestPatchTo(route.tipX, route.tipY);
    this.routes.push(route);
    return route;
  }

  /** Retargets a route after it has been drawn or extended. */
  retarget(route: Route): void {
    route.target = this.nearestPatchTo(route.tipX, route.tipY);
  }

  killRoute(route: Route): void {
    route.dead = true;
    const index = this.routes.indexOf(route);
    if (index >= 0) this.routes.splice(index, 1);

    for (const bee of this.bees) {
      if (bee.routeId === route.id) {
        bee.routeId = 0;
        // Bees mid-flight fly home under their own power rather than snapping
        // to the hive — a route vanishing should look like a swarm dispersing.
        // Bees still queueing never left, so they simply go back to idle.
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

    for (const patch of this.patches) {
      patch.step(dt, () => this.randomPatchPosition());
    }

    for (const route of [...this.routes]) {
      if (this.decayEnabled) route.step(dt);
      else route.updateTip();

      if (route.dead) {
        this.killRoute(route);
        continue;
      }
      // A patch can wilt under a live route; re-aim rather than stranding it.
      if (!route.target || !route.target.alive) this.retarget(route);
    }

    for (const bee of this.bees) this.stepBee(bee, dt);
  }

  /**
   * Assigns a bee to whichever live route currently has the fewest bees.
   *
   * Rebalancing happens one bee at a time, as each finishes a trip, rather than
   * by reshuffling the whole swarm when routes change. That produces the
   * gradual redistribution the design calls for — the swarm visibly *flows*
   * toward a new route over a few seconds instead of teleporting.
   */
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

    // Take a slot in the departure queue. Spacing bees out at the hive is what
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

    const speed = TUNING.bee.baseSpeed * bee.speedMul;

    switch (bee.state) {
      case 'idle': {
        this.driftNearHive(bee, dt);
        if (this.routes.length > 0) this.assignBee(bee);
        return;
      }

      case 'queued': {
        // Milling at the hive entrance, waiting for a gap in the traffic.
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
          if (bee.carrying > 0) {
            this.honey += bee.carrying;
            bee.carrying = 0;
          }
          bee.state = 'idle';
        }
        return;
      }

      case 'collect': {
        bee.timer -= dt;
        const patch = this.routeById(bee.routeId)?.target ?? null;
        if (patch) this.driftAround(bee, patch.x, patch.y, 16, dt);
        if (bee.timer <= 0) {
          if (patch) bee.carrying = patch.drain(TUNING.bee.nectarPerTrip);
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

      case 'outbound':
      case 'inbound': {
        const route = this.routeById(bee.routeId);
        if (!route || route.dead) {
          this.releaseBee(bee);
          bee.state = 'homing';
          return;
        }

        if (bee.state === 'outbound') {
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
            if (bee.carrying > 0) {
              this.honey += bee.carrying;
              bee.carrying = 0;
            }
            // Re-pick a route on every return, so the swarm rebalances toward
            // whatever the player has just drawn.
            this.releaseBee(bee);
            this.assignBee(bee);
            return;
          }
        }

        // A bee whose route retreated past it is now beyond the live end.
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

  stats(): FieldStats {
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

  get time(): number {
    return this.elapsed;
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
