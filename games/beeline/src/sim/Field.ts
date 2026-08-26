import { COLORS, TUNING } from '../config/tuning.ts';
import { Bee } from './Bee.ts';
import { Patch, type PatchKind } from './Patch.ts';
import { Route } from './Route.ts';
import { Wasp, type WaspKind } from './Wasp.ts';
import { RaidClock } from './Raid.ts';
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
import { dayQuota, type DayFeatures } from '../game/DayCycle.ts';
import { noModifiers, type RunModifiers } from '../game/Items.ts';

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
 * The swarm a raid can never take you below.
 *
 * Without a floor a long raid on a bad day leaves the hive with nothing to fly
 * any route at all, and the player is left watching an empty board until dusk.
 * A hive that is badly hurt still has to be a hive that can be played.
 */
const MIN_SWARM = 4;

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
  /** A raid was announced this step, at the edge it will come from. */
  raidWarning: { x: number; y: number; size: number } | null;
  /** Bees landed a hit on a wasp here. */
  struck: Array<{ x: number; y: number }>;
  /** A wasp was beaten off here. */
  waspDown: Array<{ x: number; y: number }>;
  /** Honey taken by raiders this step. */
  stolen: number;
  /** Wasps that arrived on the board this step. */
  raidLanded: number;
  /** Bees driven out of the swarm for the day. */
  beesLost: Array<{ x: number; y: number }>;
  /** Nectar shaken loose where the wind crushed a route into a wall. */
  pollenLost: Array<{ x: number; y: number }>;
}

const NO_FEATURES: DayFeatures = {
  wind: false,
  raidSize: 0,
  wave: [],
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
  /** What the run's items change about today. Neutral on a run with none. */
  modifiers: RunModifiers = noModifiers();

  /** Multiplier on effective swarm size, for the rewarded swarm boost. */
  swarmBoost = 1;

  events: FieldEvents = {
    collected: [],
    deposited: 0,
    scattered: [],
    dispatched: 0,
    deflected: [],
    found: [],
    raidWarning: null,
    struck: [],
    waspDown: [],
    stolen: 0,
    raidLanded: 0,
    beesLost: [],
    pollenLost: [],
  };

  /** Decides when the next raid lands. See sim/Raid.ts. */
  readonly raid = new RaidClock();
  /**
   * Bees driven out of the swarm by raiders, for today only.
   *
   * Held as a count rather than by removing them permanently: a raid that
   * shrank the hive for the rest of the run would compound one bad day into an
   * unrecoverable one, which is the failure mode the original wasp rules were
   * written to avoid. Losing a third of your workers *this afternoon* is
   * already a real blow.
   */
  beesLost = 0;
  /** Wasps brought down today, for the HUD and the end-of-day report. */
  waspsDowned = 0;
  /** Where the next raid will come in, so the warning can point at it. */
  private raidEntry: { x: number; y: number } | null = null;
  /** Counts down to the next blow the hive's guards land. */
  private guardTimer = TUNING.wasp.guardInterval;

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
    const full = this.fullSwarm;
    this.setBeeCount(Math.max(MIN_SWARM, full - this.beesLost));
  }

  /** The swarm the hive would have today if no raid had landed. */
  get fullSwarm(): number {
    return Math.round(this.stats.beeCount * this.swarmBoost) + this.modifiers.extraBees;
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
    modifiers: RunModifiers = noModifiers(),
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
    this.beesLost = 0;
    this.waspsDowned = 0;
    this.raidEntry = null;
    this.raid.begin(features.raidSize, modifiers.extraWarningSeconds);

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

    // The band *widens* rather than marching outward.
    //
    // The report was that flowers are usually too close, and the cause was the
    // ceiling rather than the floor: with `max` at outward+1 the band topped
    // out around six steps on a board whose far corner is eleven, so the outer
    // half was decoration and every flower was drawn from the near half.
    //
    // Pushing the *floor* out was the obvious fix and the wrong one — a play
    // simulation showed it cost enough travel time to drop the mid-game clear
    // rate by half, because every flower got further away rather than the
    // choice of flowers getting wider. Raising the ceiling instead keeps a near
    // flower on offer and puts genuinely distant ones next to it, which is the
    // near-versus-far decision the distance multiplier exists to price.
    //
    // The widening itself comes in over the first few days rather than landing
    // at once. Day one's flowers have to spawn inside the hive's own light or
    // the first-time player opens to a dark board with nothing for the hint
    // line to point at — the whole onboarding budget spent on nothing. A wide
    // band on day one put them out past it, which a test caught.
    const spread = Math.min(4, Math.max(1, this.day - 1));
    return { min: 1, max: outward + spread };
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
   * from it, which is exactly how exploring pays off. That exception lives in
   * `retarget`, bounded to the tip's own reach — see the note there.
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
    this.retarget(route);
    this.routes.push(route);
    return route;
  }

  /**
   * Decides what a route is currently for, from where its tip is.
   *
   * A wasp wins over a flower, and not only because it is usually closer: the
   * player who drags a line onto a raider has said something unambiguous, and
   * a route that quietly reverted to nectar-gathering because a flower happened
   * to sit behind the wasp would be the game ignoring them at the exact moment
   * they were reacting to it.
   */
  /**
   * Points a route at the wasp the player's drag actually landed on.
   *
   * Called with what aim assist decided, which is the only reading of intent
   * taken while the gesture was still happening. `retarget` re-derives a target
   * from where the tip *is*, and a wasp covers most of a corridor in the time a
   * slow drag takes — so on its own it loses the gesture that was aimed
   * squarely at one. Intent captured at the drag wins over geometry read after
   * it.
   */
  aimRouteAt(route: Route, wasp: Wasp | null): void {
    if (!wasp || !wasp.alive) return;
    route.targetWasp = wasp;
    route.target = null;
    route.guard = true;
  }

  retarget(route: Route): void {
    // Targeted on the assist radius, not the strike radius. Striking is a
    // question of where a bee is; targeting is a question of what the player
    // meant, and a wasp that moved 80px during the drag is still plainly what
    // they were pointing at. Matching the two radii made the gesture fail
    // silently whenever the raider was quick, which is every raider.
    const wasp = this.nearestWaspTo(route.tipX, route.tipY, TUNING.wasp.aimRadius);
    if (wasp) {
      route.targetWasp = wasp;
      route.target = null;
      route.guard = true;
      return;
    }

    route.targetWasp = null;

    // Two ways a route may end up pointed at a flower, and only two.
    //
    // A flower the player has **found** — anywhere on the board. And a flower
    // the tip is genuinely standing on, seen or not, which is the case the fog
    // exists to pay off: you drew a line into the dark, it landed on something,
    // and the bees you sent find it.
    //
    // What is excluded is the one in between, and it was quietly undoing the
    // whole mechanic. When a route's flower ran dry the retarget picked the
    // nearest flower *anywhere*, unseen ones included; the bees flew to it,
    // lit it, and the game announced a discovery the player had not gone
    // looking for. A dead flower became a free map of the next one.
    const underTip = this.nearestPatchTo(
      route.tipX,
      route.tipY,
      TUNING.patch.reachRadius,
    );
    route.target =
      underTip ?? this.nearestPatchTo(route.tipX, route.tipY, Infinity, true);
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

    this.stepRaid(dt);

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

      if (route.targetWasp) {
        // A route pointed at a wasp follows it. The wasp is moving — usually
        // straight at the hive — so a line that only knew where it *was* would
        // be pointing at empty grass by the time the bees got there.
        if (!route.targetWasp.alive || route.targetWasp.state === 'fleeing') {
          this.retarget(route);
        }
      } else if (!route.target || !route.target.alive) {
        this.retarget(route);
      }
    }

    for (const bee of this.bees) this.stepBee(bee, dt);

    this.revealFromSwarm();
    this.updateDiscoveries();
  }

  // ---------------------------------------------------------------- raids

  /**
   * Advances the raid clock and everything already on the board.
   *
   * The order matters: the clock can spawn wasps this step, and a wasp that
   * spawned this step should not also move this step — it should appear at the
   * edge, be seen, and start crossing next step.
   */
  private stepRaid(dt: number): void {
    const signal = this.raid.step(dt);

    if (signal === 'warning') {
      this.raidEntry = this.pickRaidEntry();
      this.events.raidWarning = {
        x: this.raidEntry.x,
        y: this.raidEntry.y,
        size: this.raid.size,
      };
    } else if (signal === 'arrive') {
      this.spawnRaid();
    }

    for (const wasp of this.wasps) this.stepWasp(wasp, dt);
    this.stepGuards(dt);

    // Wasps are swept after stepping rather than during, so a wasp beaten off
    // on the same step another one arrives is not skipped by the loop.
    if (this.wasps.some((w) => !w.alive)) {
      this.wasps = this.wasps.filter((w) => w.alive);
      for (const route of this.routes) {
        if (route.targetWasp && !route.targetWasp.alive) route.targetWasp = null;
      }
    }
  }

  /**
   * The hive's own defence: Guard Bees fighting whatever is at the door.
   *
   * The one part of the raid answer that does not need the player's attention,
   * and that is the point of it. Every other defence costs a drag at the exact
   * moment they were doing something else; guards are what you buy so that a
   * raid arriving mid-gesture is survivable rather than a disaster.
   */
  private stepGuards(dt: number): void {
    const guards = this.modifiers.hiveGuards;
    if (guards <= 0) return;

    const target = this.wasps.find((w) => w.isRaiding);
    if (!target) {
      // Reset rather than bank the timer. Otherwise the guards store up a
      // whole day of idleness and delete the first wasp that lands.
      this.guardTimer = TUNING.wasp.guardInterval;
      return;
    }

    this.guardTimer -= dt * guards;
    while (this.guardTimer <= 0) {
      this.guardTimer += TUNING.wasp.guardInterval;
      const downed = target.hit(1);
      this.events.struck.push({ x: target.x, y: target.y });
      if (downed) {
        this.events.waspDown.push({ x: target.x, y: target.y });
        break;
      }
    }
  }

  /**
   * Where a raid comes in from.
   *
   * The far rim of the maze, measured in corridors rather than pixels: the
   * point of walking the wasps in through the labyrinth is that the maze is
   * suddenly working *for* the player as well as against them, and a wasp that
   * entered next door would never touch a wall.
   */
  private pickRaidEntry(): { x: number; y: number } {
    const hiveCol = this.maze.colAt(this.hiveX);
    const hiveRow = this.maze.rowAt(this.hiveY);

    let best = { col: this.maze.cols - 1, row: 0 };
    let bestSteps = -1;

    for (let col = 0; col < this.maze.cols; col += 1) {
      for (let row = 0; row < this.maze.rows; row += 1) {
        const rim =
          col === 0 ||
          row === 0 ||
          col === this.maze.cols - 1 ||
          row === this.maze.rows - 1;
        if (!rim) continue;
        if (col === hiveCol && row === hiveRow) continue;

        const steps = this.cellSteps[row * this.maze.cols + col] ?? -1;
        // A rim cell the maze has walled off from the hive entirely is no
        // entrance at all — a wasp starting there would never arrive.
        if (steps < 0) continue;
        // Ties broken at random so the raids do not all come from the same
        // corner of a given maze.
        if (steps > bestSteps || (steps === bestSteps && Math.random() < 0.4)) {
          bestSteps = steps;
          best = { col, row };
        }
      }
    }

    return this.maze.centreOf(best.col, best.row);
  }

  /**
   * Lands a raid immediately, and reports what arrived.
   *
   * Exists so a test can exercise the crossing without waiting out a random
   * clock — the alternative is a test that samples the same randomness the
   * feature is built on and is therefore flaky by construction.
   */
  spawnRaidNow(): Wasp[] {
    const before = this.wasps.length;
    this.spawnRaid();
    return this.wasps.slice(before);
  }

  private spawnRaid(): void {
    const entry = this.raidEntry ?? this.pickRaidEntry();
    this.raidEntry = null;

    const wave: WaspKind[] =
      this.features.wave.length > 0 ? this.features.wave : ['raider'];

    for (const kind of wave) {
      // Spread inside the entry corridor, never outside it: a wasp nudged
      // through a wall would start on the wrong side of the maze it is
      // supposed to have to cross.
      const spreadX = (Math.random() - 0.5) * this.maze.cellWidth * 0.6;
      const spreadY = (Math.random() - 0.5) * this.maze.cellHeight * 0.6;
      this.wasps.push(new Wasp(entry.x + spreadX, entry.y + spreadY, kind));
    }
    this.events.raidLanded += wave.length;
  }

  private stepWasp(wasp: Wasp, dt: number): void {
    wasp.beginStep();

    switch (wasp.state) {
      case 'approaching': {
        const next = this.waspWaypoint(wasp);
        wasp.moveToward(next.x, next.y, dt);
        if (
          Math.hypot(wasp.x - this.hiveX, wasp.y - this.hiveY) <= TUNING.wasp.arriveRadius
        ) {
          wasp.beginRaid();
        }
        return;
      }

      case 'raiding': {
        wasp.hover(this.hiveX, this.hiveY, dt);

        // Against the day's quota, not a flat rate. A fixed number of honey a
        // second was six percent of a day-ten quota and literal noise by day
        // fifteen, which is why letting one in felt like nothing happened.
        const take = Math.min(
          this.honey,
          wasp.stealRate(dayQuota(this.day)) * this.modifiers.stealResist * dt,
        );
        this.honey -= take;
        this.events.stolen += take;

        const driven = wasp.tickRaid(dt);
        for (let i = 0; i < driven; i += 1) this.loseBee();
        return;
      }

      case 'fleeing': {
        wasp.moveToward(wasp.homeX, wasp.homeY, dt);
        if (Math.hypot(wasp.x - wasp.homeX, wasp.y - wasp.homeY) < 24) {
          wasp.state = 'gone';
        }
        return;
      }

      default:
        return;
    }
  }

  /**
   * The next point an approaching wasp should fly to.
   *
   * Gradient descent over the same BFS distance field the flower placement
   * uses, so wasps respect the walls without a pathfinder of their own. Once
   * they are in the hive's own cell they make straight for it.
   */
  private waspWaypoint(wasp: Wasp): { x: number; y: number } {
    const col = this.maze.colAt(wasp.x);
    const row = this.maze.rowAt(wasp.y);
    const here = this.cellSteps[row * this.maze.cols + col] ?? 0;
    if (here <= 0) return { x: this.hiveX, y: this.hiveY };

    const steps: Array<[number, number]> = [
      [col - 1, row],
      [col + 1, row],
      [col, row - 1],
      [col, row + 1],
    ];

    for (const [nc, nr] of steps) {
      if (!this.maze.inside(nc, nr)) continue;
      if (!this.maze.canStep(col, row, nc, nr)) continue;
      const there = this.cellSteps[nr * this.maze.cols + nc] ?? -1;
      if (there >= 0 && there < here) return this.maze.centreOf(nc, nr);
    }

    // Walled in — which the generator's spanning tree makes impossible, but a
    // wasp frozen mid-board is a worse bug than one that cuts the corner.
    return { x: this.hiveX, y: this.hiveY };
  }

  /**
   * Drives one bee out of the day's swarm.
   *
   * Takes an idle bee where it can find one, so a raid does not preferentially
   * strip the routes the player is actively working — the honey it steals is
   * already the punishment for ignoring it, and losing the line you were
   * halfway through drawing on top of that reads as spite.
   */
  private loseBee(): void {
    if (this.bees.length <= MIN_SWARM) return;

    let index = this.bees.findIndex((b) => b.state === 'idle' || b.state === 'queued');
    if (index < 0) index = this.bees.length - 1;

    const bee = this.bees[index];
    if (!bee) return;

    this.dropBee(bee);
    this.events.beesLost.push({ x: bee.x, y: bee.y });
  }

  /**
   * Removes one specific bee from the day's swarm.
   *
   * Split out from `loseBee` because retaliation has to take *the bee that
   * threw the punch*, not whichever one happened to be idle — the cost of a
   * fight has to land on the fight.
   */
  private dropBee(bee: Bee): void {
    const index = this.bees.indexOf(bee);
    if (index < 0) return;

    if (bee.routeId !== 0) {
      const route = this.routeById(bee.routeId);
      if (route) route.beeCount -= 1;
    }
    this.bees.splice(index, 1);
    this.beesLost += 1;
  }

  /** The nearest wasp worth pointing a route at. */
  nearestWaspTo(x: number, y: number, limit = Number.POSITIVE_INFINITY): Wasp | null {
    let best: Wasp | null = null;
    let bestDist = limit;
    for (const wasp of this.wasps) {
      if (!wasp.alive || wasp.state === 'fleeing') continue;
      const dist = Math.hypot(wasp.x - x, wasp.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = wasp;
      }
    }
    return best;
  }

  /**
   * Where the announced raid will come in, while the warning is up.
   *
   * The warning is the whole fairness budget for making raid timing random, so
   * it has to say *where* as well as *when* — "wasps are coming" with no
   * direction is not a chance to prepare, it is a chance to panic.
   */
  get raidWarningAt(): { x: number; y: number } | null {
    return this.raid.incoming ? this.raidEntry : null;
  }

  /** True while at least one wasp is actually robbing the hive. */
  get underAttack(): boolean {
    return this.wasps.some((w) => w.isRaiding);
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
    const basePush = this.windStrength * dt * this.modifiers.windResist;

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
    route.markPinch(hit);
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
    const speed =
      this.stats.beeSpeed *
      bee.speedMul *
      (route?.speedMultiplier ?? 1) *
      (1 + this.modifiers.beeSpeedBonus);

    // A bee on a guard line strikes any wasp that comes within reach of it,
    // anywhere along the line.
    //
    // Two deliberate choices, and both are where the skill lives. **Anywhere
    // along the line**, because wasps move — a rule that only fired at the
    // tip would work solely against a target that stood still, which a raider
    // never is. **Any wasp, not only the one aimed at**, because a wave comes
    // down the corridors the maze leaves open: a line laid across the corridor
    // they must use is worth several laid on top of individual wasps, and
    // reading the board for that corridor is a decision made under a clock.
    if (
      route?.guard &&
      (bee.state === 'outbound' || bee.state === 'building' || bee.state === 'hunting')
    ) {
      const foe = this.nearestWaspTo(bee.x, bee.y, TUNING.wasp.reachRadius);
      if (foe) {
        const downed = foe.hit(TUNING.wasp.beeDamage + this.modifiers.beeDamageBonus);
        this.events.struck.push({ x: foe.x, y: foe.y });
        if (downed) {
          this.events.waspDown.push({ x: foe.x, y: foe.y });
          this.waspsDowned += 1;
        }

        // And the wasp hits back. This is the trade the whole system was
        // missing: striking used to be free, so a defence was a button rather
        // than a decision. A drone is nearly free to swat; a hornet takes more
        // than half the bees that touch it, which is what makes "cover the
        // door and let that one through" a real option.
        if (foe.strikesBack() && this.bees.length > MIN_SWARM) {
          this.dropBee(bee);
          this.events.beesLost.push({ x: bee.x, y: bee.y });
          return;
        }

        // Survived it, and goes home rather than lingering. A swarm pinned in
        // a brawl is a swarm the player can no longer redirect.
        this.releaseBee(bee);
        bee.carrying = 0;
        bee.state = 'homing';
        return;
      }
    }

    // Wasps only threaten bees that are actually out in the field.
    if (
      this.wasps.length > 0 &&
      (bee.state === 'outbound' ||
        bee.state === 'inbound' ||
        bee.state === 'collect' ||
        bee.state === 'building')
    ) {
      for (const wasp of this.wasps) {
        // A bee sent to fight *this* wasp is not scattered by it.
        //
        // Without the exemption the defence gesture cannot work at all: the
        // scatter radius is smaller than the strike radius, so every attacker
        // would be turned back a moment before it could land a hit, and the
        // wasp would be untouchable by the one answer the game offers.
        if (route?.targetWasp === wasp) continue;
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

      case 'hunting': {
        const quarry = route?.targetWasp;
        bee.timer -= dt;
        if (!quarry || !quarry.alive || bee.timer <= 0) {
          // Gives up rather than chasing across the board. A bee that never
          // came back would be a permanent loss for a mis-aimed drag, which is
          // a far harsher tax than the trip this is meant to cost.
          this.releaseBee(bee);
          bee.state = 'homing';
          return;
        }
        this.flyToward(bee, quarry.x, quarry.y, speed, dt);
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
            if (route.targetWasp?.alive) {
              // Leaves the road to run the wasp down. The route said where the
              // fight was when it was drawn; by the time the bees get there the
              // wasp has moved, and stopping at the tip would mean the defence
              // only ever worked on a target that stood still.
              bee.state = 'hunting';
              bee.timer = TUNING.wasp.huntSeconds;
            } else if (route.reachesTarget()) {
              bee.state = 'collect';
              bee.timer = TUNING.bee.collectSeconds;
            } else {
              bee.state = 'confused';
              bee.timer = TUNING.bee.confusedSeconds;
            }
          }
        } else {
          bee.s -= speed * dt;

          // Where the wind is crushing this road into a hedge, a laden bee
          // loses what it is carrying. Only the wind can put a route in that
          // state — a line the player drew is slid clear of the walls before
          // it exists — so the tax is on neglecting a road, never on an
          // imprecise thumb.
          if (
            bee.carrying > 0 &&
            route.isPinched &&
            Math.abs(bee.s - route.pinchAt) <= TUNING.route.pinchRadius
          ) {
            bee.carrying = 0;
            this.events.pollenLost.push({ x: bee.x, y: bee.y });
          }

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
    // Comb Wax is paid here, at the hive, rather than at the flower: what it
    // buys is a better yield from honey the swarm has actually brought home,
    // so nectar lost to a wasp on the way back is not paid for.
    this.honey +=
      bee.carrying * this.stats.honeyMultiplier * (1 + this.modifiers.honeyBonus);
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
      raidWarning: null,
      struck: [],
      waspDown: [],
      stolen: 0,
      raidLanded: 0,
      beesLost: [],
      pollenLost: [],
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
