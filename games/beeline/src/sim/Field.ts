import { COLORS, TUNING } from '../config/tuning.ts';
import { Bee } from './Bee.ts';
import { Patch, type PatchKind } from './Patch.ts';
import { Route } from './Route.ts';
import { Wasp } from './Wasp.ts';
import { Maze } from './Maze.ts';
import { slideAlongWalls, type WallSlide } from './deflect.ts';
import { Fog } from './Fog.ts';
import {
  coordsLength,
  truncateCoords,
  type Polyline,
  type SamplePoint,
} from './polyline.ts';
import { deriveStats, emptyLevels, type DerivedStats } from '../game/Upgrades.ts';
import type { DayFeatures } from '../game/DayCycle.ts';
import { noModifiers, type DayModifiers } from '../game/Provisions.ts';

const scratch: SamplePoint = { x: 0, y: 0, tx: 0, ty: 0 };

/**
 * The playable board, in design units.
 *
 * Same as the canvas: the map got bigger by moving the hive into a corner
 * rather than by growing the world and zooming out. Zooming would have shrunk a
 * flower's reach ring below what a thumb can reliably hit, which the design
 * rules treat as a rejection cause, and fog makes an unlit 1280x720 board feel
 * far larger than a lit one ever did.
 */
export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 720;
/** Top strip reserved for the HUD; nothing spawns under it. */
const HUD_MARGIN = 110;
/**
 * Gap between the maze and the edge of the board.
 *
 * Sized so a cell centre always has room for a flower's whole reach ring. The
 * ring is what the player aims at, and one running off the edge is unaimable at
 * exactly the moment it matters — with the maze flush to the board, the
 * outermost cell centres sat 80px in and the ring needed 85.
 */
const MAZE_INSET = 30;

/**
 * How far from the hive its own dawn light actually *discovers*, not merely
 * brightens.
 *
 * Reveal falls off linearly to `fog.edgeReveal` at the rim while discovery
 * needs `fog.discoverAt`, so the useful radius is meaningfully smaller than the
 * sight radius — 330 against 420 at the current tuning. Getting these two
 * confused is what once shipped a completely dark day one.
 */
function hiveDiscoveryRadius(): number {
  const { discoverAt, edgeReveal } = TUNING.fog;
  return TUNING.hive.sightRadius * ((1 - discoverAt) / (1 - edgeReveal));
}

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
  /** Where a route was severed by thorns, so the cut is visible and audible. */
  deflected: Array<{ x: number; y: number }>;
  /** Flowers found this step. Discovery is the reward for exploring. */
  found: Array<{ x: number; y: number; honey: number }>;
}

const NO_FEATURES: DayFeatures = {
  wind: false,
  wasps: 0,
  mazeOpenness: 1,
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
  /**
   * The bramble maze the board is carved into.
   *
   * Replaces the scattered thorn circles. See sim/Maze.ts — the short version
   * is that a few obstacles on an open board leave the straight line correct
   * almost every time, so the shape the player draws almost never matters, and
   * that is fatal for a game whose only verb is drawing a shape.
   */
  readonly maze = new Maze(
    MAZE_INSET,
    HUD_MARGIN,
    WORLD_WIDTH - MAZE_INSET * 2,
    WORLD_HEIGHT - HUD_MARGIN - MAZE_INSET,
    TUNING.maze.cols,
    TUNING.maze.rows,
  );

  /** Steps through the maze from the hive's cell to every other. */
  private cellSteps: Int32Array = new Int32Array(0);
  /** What the player has seen of the board today. */
  readonly fog = new Fog(WORLD_WIDTH, WORLD_HEIGHT);

  honey = 0;
  /** Debug affordance: freeze route decay to feel the contrast. */
  decayEnabled = true;

  stats: DerivedStats = deriveStats(emptyLevels());
  features: DayFeatures = NO_FEATURES;
  /** What the provision carried into today changes. Neutral when none was. */
  modifiers: DayModifiers = noModifiers();

  /** Multiplier on effective swarm size, for the rewarded swarm boost. */
  swarmBoost = 1;

  events: FieldEvents = {
    collected: [],
    deposited: 0,
    scattered: [],
    dispatched: 0,
    deflected: [],
    found: [],
  };

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
    return this.stats.routeHoldSeconds + this.modifiers.extraHoldSeconds;
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
  beginDay(
    day: number,
    features: DayFeatures,
    patchCount: number,
    boost: number,
    modifiers: DayModifiers = noModifiers(),
  ): void {
    this.features = features;
    this.modifiers = modifiers;
    this.swarmBoost = boost;
    this.honey = 0;
    this.elapsed = 0;
    this.day = day;

    this.clearRoutes();
    this.patches = [];
    this.wasps = [];

    this.patchPool = Math.round(
      (TUNING.patch.basePool + (day - 1) * TUNING.patch.poolPerDay) * modifiers.patchPool,
    );

    // The maze is carved *before* the flowers, because a flower's position is
    // chosen by how many corridors away it is, and its yield is derived from
    // that. This is the reverse of the old thorn field, where obstacles were
    // placed relative to flowers that already existed.
    this.maze.generate(Math.min(1, features.mazeOpenness + modifiers.mazeOpennessBonus));
    this.cellSteps = this.maze.distancesFrom(
      this.maze.colAt(this.hiveX),
      this.maze.rowAt(this.hiveY),
    );

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

    this.fog.clear();
    // The hive lights its own neighbourhood, and Scout Bees light a great deal
    // more. Day one's flowers spawn inside the hive's light, so the first
    // thirty seconds are exactly what they were before fog existed.
    this.fog.reveal(this.hiveX, this.hiveY, TUNING.hive.sightRadius);
    if (modifiers.scoutRadius > 0) {
      this.fog.reveal(this.hiveX, this.hiveY, modifiers.scoutRadius);
    }
    this.updateDiscoveries();

    this.applyStats();
    for (const bee of this.bees) {
      bee.reset(this.hiveX, this.hiveY, TUNING.bee.lateralSpread, TUNING.bee.speedJitter);
    }
  }

  // ---------------------------------------------------------------- fog

  /**
   * Promotes anything now standing in lit ground to "found".
   *
   * Discovery is one-way. A flower seen once is remembered for the rest of the
   * day even if nothing goes near it again — re-finding ground you already paid
   * to explore is busywork wearing a mechanic's clothes.
   */
  private updateDiscoveries(): void {
    for (const patch of this.patches) {
      if (patch.discovered || !patch.alive) continue;
      if (!this.fog.isDiscovered(patch.x, patch.y)) continue;
      patch.discovered = true;
      this.events.found.push({
        x: patch.x,
        y: patch.y,
        honey: Math.round(patch.honeyLeft),
      });
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

  /**
   * A spot for a flower, chosen by how far it is **through the maze**.
   *
   * On a maze board the straight-line distance and the flown distance are very
   * different numbers, and the one that matters is the one the bees actually
   * have to cover. Placing by BFS steps means a flower two corridors away is
   * genuinely two corridors away, whatever the crow-flies distance says.
   *
   * Flowers sit near the centre of a cell, jittered slightly so a board does
   * not read as a grid of dots. Never in the hive's own cell, and never twice
   * in the same cell.
   */
  private randomPatchPosition(kind: PatchKind): { x: number; y: number } {
    const { maze } = this;
    const hiveCol = maze.colAt(this.hiveX);
    const hiveRow = maze.rowAt(this.hiveY);

    // The band of maze-steps a flower may sit in. Only the outer edge moves
    // with the day, so a near flower is always available to fall back on and
    // the near-versus-far decision is live on every day of a run.
    const reach = this.stepsBandForDay(kind);

    // Block out the cells around each existing flower, not just the cell it
    // sits in. Two flowers in neighbouring cells put their reach rings on top
    // of each other, which reads as one confusing blob and makes aiming
    // ambiguous — the old field rejected spots within 170px for exactly this
    // reason and the rule was lost in the move to cells.
    const taken = new Set<number>();
    const block = (col: number, row: number, spread: number): void => {
      for (let dr = -spread; dr <= spread; dr += 1) {
        for (let dc = -spread; dc <= spread; dc += 1) {
          const c = col + dc;
          const r = row + dr;
          if (maze.inside(c, r)) taken.add(r * maze.cols + c);
        }
      }
    };

    for (const patch of this.patches) {
      if (!patch.alive) continue;
      block(maze.colAt(patch.x), maze.rowAt(patch.y), 1);
    }
    // Only the hive's own cell, not its neighbours. Day one's flowers are
    // deliberately one corridor out so they sit inside the hive's light, and
    // blocking the ring around the hive would push them straight back out of
    // it and leave the tutorial with nothing to point at.
    taken.add(hiveRow * maze.cols + hiveCol);

    // Spaced and in band; then spaced at any distance; then merely not on top
    // of something. Giving up entirely is never an option — a day short of a
    // flower is recoverable, a flower in the hive is not.
    const inBand: number[] = [];
    const spaced: number[] = [];
    const anywhere: number[] = [];

    for (let index = 0; index < this.cellSteps.length; index += 1) {
      const steps = this.cellSteps[index] ?? -1;
      if (steps < 1) continue;

      const col = index % maze.cols;
      const row = Math.floor(index / maze.cols);
      const onTop =
        this.patches.some(
          (p) => p.alive && maze.colAt(p.x) === col && maze.rowAt(p.y) === row,
        ) ||
        (col === hiveCol && row === hiveRow);
      if (onTop) continue;

      anywhere.push(index);
      if (taken.has(index)) continue;
      spaced.push(index);
      if (steps < reach.min || steps > reach.max) continue;

      // On the teaching days every flower must start lit, or the hint line has
      // nothing to point at and a first-time player gets a black screen. Making
      // it a placement rule rather than a happy consequence of the numbers is
      // the difference between a guarantee and a coincidence.
      if (this.day < TUNING.maze.startDay) {
        const centre = maze.centreOf(col, row);
        const reachable = Math.hypot(centre.x - this.hiveX, centre.y - this.hiveY);
        if (reachable > hiveDiscoveryRadius()) continue;
      }

      inBand.push(index);
    }

    const pool = inBand.length > 0 ? inBand : spaced.length > 0 ? spaced : anywhere;
    if (pool.length === 0) return { x: this.hiveX, y: this.hiveY };

    const index = pool[Math.floor(Math.random() * pool.length)] ?? 0;
    const col = index % maze.cols;
    const row = Math.floor(index / maze.cols);
    const centre = maze.centreOf(col, row);

    const jitterX = (Math.random() * 2 - 1) * maze.cellWidth * 0.14;
    const jitterY = (Math.random() * 2 - 1) * maze.cellHeight * 0.14;

    // The maze is inset far enough that a cell centre always has room for the
    // whole reach ring, so this only has to catch the jitter.
    const margin = TUNING.patch.reachRadius;
    return {
      x: clamp(centre.x + jitterX, margin, WORLD_WIDTH - margin),
      y: clamp(centre.y + jitterY, HUD_MARGIN + margin, WORLD_HEIGHT - margin),
    };
  }

  /** How many maze-steps out a flower of this kind may be placed, for the day. */
  private stepsBandForDay(kind: PatchKind): { min: number; max: number } {
    // Expressed in steps rather than pixels because the maze is what a bee has
    // to fly. Grows slowly: the outer edge of the field is what opens up over a
    // run, and the inner edge never moves.
    const outward = Math.min(6, 1 + Math.floor((this.day - 1) / 2));
    if (kind === 'rich') return { min: Math.max(3, outward), max: 99 };
    // Wide enough that the spacing rule always has somewhere in-band to put the
    // next flower. Too tight and the last flower of the day falls through to
    // "anywhere free", which lands it far out — so a tight early band made the
    // *early* days darker than the later ones, exactly backwards.
    return { min: 1, max: outward + 1 };
  }

  spawnPatch(kind: PatchKind = 'normal'): Patch {
    const spot = this.randomPatchPosition(kind);
    const patch = new Patch(spot.x, spot.y, this.patchPool, kind);
    patch.distanceMultiplier = this.distanceMultiplierAt(spot.x, spot.y);
    patch.species = this.nextSpecies();
    this.patches.push(patch);
    return patch;
  }

  /**
   * A flower colour not already on the board, where one is available.
   *
   * Rolling independently per flower would put two of the same colour on screen
   * often enough to notice — with six species and five flowers that is better
   * than even odds on any given day. Picking from what is currently unused
   * makes the board legible by colour, which is the entire point of having
   * colours. Falls back to a plain roll once every species is in use.
   */
  private nextSpecies(): number {
    const taken = new Set(this.patches.filter((p) => p.alive).map((p) => p.species));
    const free: number[] = [];
    for (let i = 0; i < COLORS.species.length; i += 1) {
      if (!taken.has(i)) free.push(i);
    }
    if (free.length === 0) return Math.floor(Math.random() * COLORS.species.length);
    return free[Math.floor(Math.random() * free.length)] ?? 0;
  }

  /**
   * How much more a flower here pays for being far out. 1 near, up to 3 far.
   *
   * Linear rather than anything curvier, because the player has to be able to
   * read it off the board at a glance: twice as far out, roughly twice the
   * honey in it.
   */
  distanceMultiplierAt(x: number, y: number): number {
    const { distanceYieldNear, distanceYieldFar, distanceYieldMax } = TUNING.patch;
    // Through the maze, not across it. A flower behind three hedges is a long
    // trip however close it looks, and paying by crow-flies distance would make
    // the most awkward flowers on the board also the worst value.
    const distance = Math.max(
      this.pathDistanceTo(x, y),
      Math.hypot(x - this.hiveX, y - this.hiveY),
    );
    const span = Math.max(1, distanceYieldFar - distanceYieldNear);
    const t = (distance - distanceYieldNear) / span;
    return 1 + Math.min(1, Math.max(0, t)) * (distanceYieldMax - 1);
  }

  removePatch(): void {
    const patch = this.patches.pop();
    if (!patch) return;
    for (const route of this.routes) {
      if (route.target === patch) route.target = null;
    }
  }

  /**
   * Nearest living patch to a point, within `limit` if given.
   *
   * `requireDiscovered` is the whole point of the fog. Aim assist and route
   * targeting must only ever consider flowers the player has actually found —
   * snapping a drag onto something invisible would hand back the information
   * the dark was there to take away, and would read as the game aiming for you.
   *
   * The simulation still resolves undiscovered flowers when it needs to: a bee
   * that arrives at a route's tip and finds an unseen flower there collects
   * from it, which is exactly how exploring pays off.
   */
  nearestPatchTo(
    x: number,
    y: number,
    limit = Number.POSITIVE_INFINITY,
    requireDiscovered = false,
  ): Patch | null {
    let best: Patch | null = null;
    let bestDist = limit;

    for (const patch of this.patches) {
      if (!patch.alive) continue;
      if (requireDiscovered && !patch.discovered) continue;
      const dist = Math.hypot(patch.x - x, patch.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = patch;
      }
    }
    return best;
  }

  /** Living flowers the player has actually seen. */
  get knownPatches(): Patch[] {
    return this.patches.filter((p) => p.alive && p.discovered);
  }

  // ---------------------------------------------------------------- maze

  /**
   * Where a path first meets a wall, measured from the start of the path.
   *
   * `Infinity` when it is clear. Everything that needs to know "can bees get
   * along this line" — committing a drag, aim assist, and the per-step recheck
   * that catches wind bending a route into a hedge — goes through here.
   */
  blockedDistance(poly: Polyline, limit: number): number {
    return this.maze.blockedDistanceAlong(poly, limit);
  }

  /** Whether a straight hop from a to b crosses a wall. */
  pathBlocked(ax: number, ay: number, bx: number, by: number): boolean {
    return this.maze.segmentBlocked(ax, ay, bx, by);
  }

  /**
   * Whether a flower can be reached at all.
   *
   * Always true by construction — the maze is carved from a spanning tree, so
   * every cell reaches every other. Kept as a named check because the guarantee
   * is the load-bearing one and a test that asserts it should have something to
   * ask.
   */
  hasClearApproach(px: number, py: number): boolean {
    const col = this.maze.colAt(px);
    const row = this.maze.rowAt(py);
    if (!this.maze.inside(col, row)) return false;
    return (this.cellSteps[row * this.maze.cols + col] ?? -1) >= 0;
  }

  /** How far a point is from the hive *through the maze*, in design units. */
  pathDistanceTo(x: number, y: number): number {
    const col = this.maze.colAt(x);
    const row = this.maze.rowAt(y);
    if (!this.maze.inside(col, row)) return 0;

    const steps = this.cellSteps[row * this.maze.cols + col] ?? 0;
    const cell = (this.maze.cellWidth + this.maze.cellHeight) / 2;
    return Math.max(0, steps) * cell;
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

      this.deflectRouteAtWalls(route);
      if (route.dead) {
        this.killRoute(route);
        continue;
      }

      if (!route.target || !route.target.alive) this.retarget(route);
    }

    for (const bee of this.bees) this.stepBee(bee, dt);

    this.revealFromSwarm();
    this.updateDiscoveries();
  }

  /**
   * Lights the board around every bee that is actually out in the field.
   *
   * Idle bees drifting at the hive are skipped: they are already inside the
   * hive's own light, and sweeping them would be a few hundred wasted disc
   * fills a second for ground that is permanently lit anyway.
   */
  private revealFromSwarm(): void {
    const radius = TUNING.bee.sightRadius;
    for (const bee of this.bees) {
      if (bee.state === 'idle' || bee.state === 'queued') continue;
      this.fog.reveal(bee.x, bee.y, radius);
    }
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
    const basePush = this.windStrength * dt;

    for (const route of this.routes) {
      const poly = route.poly;
      // A beaten track holds its shape. This is the counterplay the player
      // asked for: wind is no longer something that simply happens to you, it
      // is something a road you have invested in resists.
      const push = basePush * route.windExposure;
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

  /**
   * Cuts a route back to where it now meets a wall.
   *
   * Checked every step rather than only on commit, because the wind bows a
   * drawn line sideways over time — a route threaded neatly down a corridor at
   * dawn can be pressed into the hedge beside it by mid-afternoon. That
   * interaction was free: wind and the maze were built for their own reasons
   * and produce it between them, and it is the best pressure in the game
   * because it makes a route something you maintain rather than something you
   * place.
   */
  private deflectRouteAtWalls(route: Route): void {
    const hit = this.blockedDistance(route.poly, route.liveLength);
    if (!Number.isFinite(hit) || hit >= route.liveLength) return;

    const live = truncateCoords(route.poly, route.liveLength);
    const slid = slideAlongWalls(live, this.maze);
    if (!slid.contact) return;

    this.events.deflected.push(slid.contact);
    route.deflectTo(slid.coords);
  }

  /**
   * Slides a path the player just drew clear of the walls it pressed into.
   *
   * Shared with the commit path so a freshly drawn line and a wind-bowed one
   * are deflected by exactly the same rule. Two notions of what a wall does is
   * how an obstacle stops being something a player can predict.
   */
  slidePath(coords: readonly number[]): WallSlide {
    return slideAlongWalls(coords, this.maze);
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

    // A beaten track is faster to fly. Looked up once per bee per step rather
    // than per branch below, since every movement case wants it.
    const route = bee.routeId !== 0 ? this.routeById(bee.routeId) : undefined;
    const speed = this.stats.beeSpeed * bee.speedMul * (route?.speedMultiplier ?? 1);

    // Wasps only threaten bees that are actually out in the field.
    if (
      this.wasps.length > 0 &&
      (bee.state === 'outbound' ||
        bee.state === 'inbound' ||
        bee.state === 'collect' ||
        bee.state === 'building')
    ) {
      for (const wasp of this.wasps) {
        if (
          !wasp.threatens(
            bee.x,
            bee.y,
            this.hiveX,
            this.hiveY,
            this.modifiers.waspIntercept,
            this.modifiers.waspSafeRadius,
          )
        ) {
          continue;
        }
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
        const patch = route?.target ?? null;
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
        if (route) this.driftAround(bee, route.tipX, route.tipY, 20, dt);
        if (bee.timer <= 0) bee.state = 'inbound';
        return;
      }

      case 'building':
      case 'outbound':
      case 'inbound': {
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
            // A delivery beats the path in a little further. Only a laden
            // arrival counts: a builder or a scattered bee coming home empty
            // did not use the road, it merely walked it.
            if (bee.carrying > 0) route.reinforce();
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
    this.events = {
      collected: [],
      deposited: 0,
      scattered: [],
      dispatched: 0,
      deflected: [],
      found: [],
    };
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
