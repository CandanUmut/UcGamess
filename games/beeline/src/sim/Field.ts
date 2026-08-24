import { TUNING } from '../config/tuning.ts';
import { Bee } from './Bee.ts';
import { Patch, type PatchKind } from './Patch.ts';
import { Route } from './Route.ts';
import { Wasp } from './Wasp.ts';
import { Bramble, blockedDistanceAlong, segmentBlocked } from './Bramble.ts';
import { Fog } from './Fog.ts';
import { coordsLength, type Polyline, type SamplePoint } from './polyline.ts';
import { deriveStats, emptyLevels, type DerivedStats } from '../game/Upgrades.ts';
import { brambleRadiusForDay, type DayFeatures } from '../game/DayCycle.ts';
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
  cut: Array<{ x: number; y: number }>;
  /** Flowers found this step. Discovery is the reward for exploring. */
  found: Array<{ x: number; y: number; honey: number }>;
}

const NO_FEATURES: DayFeatures = {
  wind: false,
  wasps: 0,
  brambles: 0,
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
  brambles: Bramble[] = [];
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
    cut: [],
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
    this.brambles = [];

    this.patchPool = Math.round(
      (TUNING.patch.basePool + (day - 1) * TUNING.patch.poolPerDay) * modifiers.patchPool,
    );

    for (let i = 0; i < patchCount; i += 1) {
      const kind: PatchKind =
        features.richPatches && i === patchCount - 1 ? 'rich' : 'normal';
      this.spawnPatch(kind);
    }

    // Thorns go down after the flowers, because every thicket is placed
    // relative to a flower it is meant to complicate.
    this.spawnBrambles(day, features.brambles);

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

    for (const bramble of this.brambles) {
      if (bramble.discovered) continue;
      if (this.fog.isDiscovered(bramble.x, bramble.y)) bramble.discovered = true;
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
    // The hive sits in a corner, so "further out" is most of the board rather
    // than a ring around the middle. That is where the extra map came from: the
    // longest route went from about 560px to about 1100 without the camera
    // moving or anything on screen getting smaller.
    // Only the outer edge moves with the day. Keeping the inner edge fixed
    // means a near flower is always available as a fallback, so choosing
    // between a cheap short route and a lucrative long one is a decision on
    // every day of a run rather than only the late ones.
    const maxRadius = Math.min(
      TUNING.patch.maxRadius + (this.day - 1) * TUNING.patch.radiusPerDay,
      1120,
    );
    const minRadius =
      kind === 'rich'
        ? Math.min(TUNING.patch.richMinRadius, maxRadius * 0.75)
        : TUNING.patch.minRadius;

    // Bounds leave room for the reach ring, which is the thing the player aims
    // at — a flower whose ring runs off the edge is unaimable at exactly the
    // moment it matters. The top margin also clears the HUD.
    const margin = TUNING.patch.reachRadius + 20;
    const minX = margin;
    const maxX = WORLD_WIDTH - margin;
    const minY = HUD_MARGIN + margin;
    const maxY = WORLD_HEIGHT - margin;

    // Rejection-sample the whole board rather than sampling an angle and a
    // radius. With the hive in a corner most of a circle around it is off the
    // board, so polar sampling would pile flowers along the two edges the
    // circle still intersects.
    const sample = (): { x: number; y: number; distance: number } => {
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * (maxY - minY);
      return { x, y, distance: Math.hypot(x - this.hiveX, y - this.hiveY) };
    };

    // Overlapping bloom circles read as one confusing blob and make aiming
    // ambiguous, so spacing is preferred — but it is the first thing given up.
    const spaced = (x: number, y: number): boolean =>
      !this.patches.some((p) => p.alive && Math.hypot(p.x - x, p.y - y) < 170);

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const spot = sample();
      if (spot.distance < minRadius || spot.distance > maxRadius) continue;
      if (spaced(spot.x, spot.y)) return { x: spot.x, y: spot.y };
    }

    // Crowded board: keep the band, drop the spacing.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const spot = sample();
      if (spot.distance >= minRadius && spot.distance <= maxRadius) {
        return { x: spot.x, y: spot.y };
      }
    }

    // Still nothing. Give up the *outer* bound and take the spot closest to it,
    // never the inner one.
    //
    // Which bound is negotiable is the whole point. Distance is what yield,
    // honey value and the entire near-versus-far decision are derived from, so
    // a flower inside its floor is not a slightly-off flower, it is a broken
    // one — a rich patch worth 2200 honey once landed seventy pixels from the
    // hive because the old fallback clamped a far point onto the board edge.
    // Overshooting the ceiling only ever makes a flower a longer trip away.
    let best: { x: number; y: number } | null = null;
    let bestError = Number.POSITIVE_INFINITY;

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const spot = sample();
      if (spot.distance < minRadius) continue;
      const error = Math.abs(spot.distance - maxRadius);
      if (error >= bestError) continue;
      bestError = error;
      best = { x: spot.x, y: spot.y };
    }
    if (best) return best;

    // Nowhere on the board is far enough: take the furthest point there is.
    let furthest = { x: maxX, y: minY };
    let furthestDistance = Math.hypot(maxX - this.hiveX, minY - this.hiveY);
    for (const corner of [
      { x: minX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ]) {
      const distance = Math.hypot(corner.x - this.hiveX, corner.y - this.hiveY);
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthest = corner;
      }
    }
    return furthest;
  }

  spawnPatch(kind: PatchKind = 'normal'): Patch {
    const spot = this.randomPatchPosition(kind);
    const patch = new Patch(spot.x, spot.y, this.patchPool, kind);
    patch.distanceMultiplier = this.distanceMultiplierAt(spot.x, spot.y);
    this.patches.push(patch);
    return patch;
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
    const distance = Math.hypot(x - this.hiveX, y - this.hiveY);
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

  // ---------------------------------------------------------------- brambles

  /**
   * Places thorn thickets across the field.
   *
   * Placement is the whole design here, not decoration. A thicket dropped at
   * random is usually somewhere nobody was going to fly, so it changes nothing
   * and reads as scenery. Each one is instead placed **on the line between the
   * hive and a flower**, pushed sideways by up to two thirds of its own radius,
   * so it blocks the lazy straight line without walling the flower off. Every
   * flower ends up asking a routing question, and the answer is always a curve
   * that exists.
   *
   * Three clearances are enforced and none of them is optional:
   *
   *  - away from the hive draw ring, so a route can always be started;
   *  - away from every flower's reach ring, so a route can always be finished;
   *  - away from other thickets, so two never fuse into a wall.
   *
   * A spot that cannot satisfy all three is simply skipped. Fewer thorns is a
   * fine outcome; an unplayable field is not.
   */
  private spawnBrambles(day: number, count: number): void {
    if (count <= 0) return;

    const radius = brambleRadiusForDay(day) * this.modifiers.brambleScale;
    if (radius <= 1) return;

    const growth = this.modifiers.brambleGrows ? TUNING.bramble.growthPerSecond : 0;

    // Furthest flowers first. A thicket needs a corridor of roughly the hive
    // ring plus the flower ring plus twice its own grown radius to sit between
    // them, and only the long routes have that much room — which is exactly
    // where thorns belong. Distance is already the risk axis of this game, and
    // this sharpens it rather than adding a second one. The short flower stays
    // clean, so there is always a safe option to fall back to.
    const targets = this.patches
      .filter((p) => p.alive)
      .sort(
        (a, b) =>
          Math.hypot(b.x - this.hiveX, b.y - this.hiveY) -
          Math.hypot(a.x - this.hiveX, a.y - this.hiveY),
      );
    if (targets.length === 0) return;

    const grown = radius * TUNING.bramble.growthFactor;
    const { hiveClearance, patchClearance, minLineFraction, maxLineFraction } =
      TUNING.bramble;

    // The band of the line a thicket can legally sit on, worked out rather than
    // guessed at. It has to clear the hive draw ring at one end and the
    // flower's reach ring at the other, both at its grown size, which leaves
    // only `span - 195 - 2 × grown` of usable line. Sampling a fixed 0.34-0.7
    // of the line and hoping found the legal band about one try in ten, so most
    // slots quietly went unfilled and the field came out nearly bare.
    const minFromHive = TUNING.hive.drawRadius + grown + hiveClearance;
    const minFromPatch =
      TUNING.patch.reachRadius * TUNING.bramble.patchRingFraction +
      grown +
      patchClearance;

    for (let slot = 0; slot < count; slot += 1) {
      let placed = false;

      // Walk the whole flower list for each slot rather than giving up on the
      // one flower this slot was offered. A short line genuinely has no room,
      // and abandoning the slot there is how the field ends up bare.
      for (let step = 0; step < targets.length && !placed; step += 1) {
        const patch = targets[(slot + step) % targets.length];
        if (!patch) continue;

        const dx = patch.x - this.hiveX;
        const dy = patch.y - this.hiveY;
        const span = Math.hypot(dx, dy) || 1;

        const lo = Math.max(minLineFraction, minFromHive / span);
        const hi = Math.min(maxLineFraction, 1 - minFromPatch / span);
        if (lo >= hi) continue; // this flower is simply too near the hive

        const nx = -dy / span;
        const ny = dx / span;

        for (let attempt = 0; attempt < 8; attempt += 1) {
          const along = lo + Math.random() * (hi - lo);
          // The sideways nudge only ever increases distance from both rings, so
          // it can loosen the placement but never break it.
          const offset = (Math.random() * 2 - 1) * radius * 0.6;
          const x = this.hiveX + dx * along + nx * offset;
          const y = this.hiveY + dy * along + ny * offset;

          if (!this.brambleSpotIsClear(x, y, radius)) continue;

          this.brambles.push(new Bramble(x, y, radius, growth));
          placed = true;
          break;
        }
      }

      // No flower line had room. Fall back to anywhere legal on the field:
      // thorns are terrain, and a thicket that does not sit on a particular
      // line still shapes the curves the player can draw around it. Without
      // this the late field tops out at about two thickets no matter what the
      // schedule asks for, because only the two longest routes have the span to
      // host one.
      if (!placed) this.placeFreeBramble(radius, growth);
    }

    this.pruneUnreachableBrambles();
  }

  /**
   * Removes any thicket that leaves a flower with no way in.
   *
   * The clearance rules make this rare rather than impossible: they keep each
   * thicket off the hive ring and off the heart of every reach ring, but two
   * thickets placed legally can still box a flower against the edge of the
   * board — which the corner hive made more likely, because flowers now spawn
   * much closer to the corners.
   *
   * A walled-off flower is not difficulty, it is a flower the player wastes a
   * drag on and cannot ever use. Checking after placement and dropping the
   * offender makes the guarantee structural rather than a statistical property
   * we hope holds, and it costs one sweep a day.
   */
  private pruneUnreachableBrambles(): void {
    for (const patch of this.patches) {
      if (!patch.alive) continue;

      let guard = 0;
      while (!this.hasClearApproach(patch.x, patch.y) && guard < this.brambles.length) {
        guard += 1;

        // Drop the thicket nearest the straight line in, which is the one most
        // likely to be doing the boxing in.
        let worst = -1;
        let worstDistance = Number.POSITIVE_INFINITY;
        for (let i = 0; i < this.brambles.length; i += 1) {
          const bramble = this.brambles[i];
          if (!bramble) continue;
          const distance = Math.hypot(bramble.x - patch.x, bramble.y - patch.y);
          if (distance < worstDistance) {
            worstDistance = distance;
            worst = i;
          }
        }
        if (worst < 0) break;
        this.brambles.splice(worst, 1);
      }
    }
  }

  /**
   * Whether a flower can be reached by a single dog-leg through one waypoint.
   *
   * Deliberately a modest bar: one bend is one flick of a thumb. A flower that
   * needed an elaborate serpentine would technically pass a looser check and
   * still feel unfair.
   */
  hasClearApproach(px: number, py: number): boolean {
    if (!this.pathBlocked(this.hiveX, this.hiveY, px, py)) return true;

    const dx = px - this.hiveX;
    const dy = py - this.hiveY;
    const span = Math.hypot(dx, dy) || 1;
    const nx = -dy / span;
    const ny = dx / span;

    // Offsets scale with the route: a 190px sidestep is a sharp dodge on a
    // 300px line and barely a lean on a 900px one, and the board now has both.
    for (const fraction of [0.14, 0.22, 0.3, 0.4, 0.5]) {
      const offset = Math.max(90, span * fraction);
      for (const side of [-1, 1]) {
        for (const along of [0.35, 0.5, 0.65]) {
          const wx = this.hiveX + dx * along + nx * offset * side;
          const wy = this.hiveY + dy * along + ny * offset * side;
          if (
            !this.pathBlocked(this.hiveX, this.hiveY, wx, wy) &&
            !this.pathBlocked(wx, wy, px, py)
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private placeFreeBramble(radius: number, growth: number): void {
    // Rejection-sample the whole board rather than a ring around the hive. With
    // the hive in a corner most of such a ring is off the board, which is how
    // this quietly stopped placing anything when the map changed shape.
    const margin = radius * TUNING.bramble.growthFactor;
    const minX = margin;
    const maxX = WORLD_WIDTH - margin;
    const minY = HUD_MARGIN + margin;
    const maxY = WORLD_HEIGHT - margin;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * (maxY - minY);
      if (!this.brambleSpotIsClear(x, y, radius)) continue;

      this.brambles.push(new Bramble(x, y, radius, growth));
      return;
    }
  }

  private brambleSpotIsClear(x: number, y: number, radius: number): boolean {
    const { hiveClearance, patchClearance, siblingClearance } = TUNING.bramble;
    // A thicket grows, so every clearance is checked against the size it will
    // reach, not the size it starts at. Otherwise the field is legal at dawn
    // and illegal by mid-afternoon.
    const grown = radius * TUNING.bramble.growthFactor;

    if (
      Math.hypot(x - this.hiveX, y - this.hiveY) <
      TUNING.hive.drawRadius + grown + hiveClearance
    ) {
      return false;
    }

    // Stay inside the canvas, or half a thicket sits off-screen and the gap it
    // leaves is one the player cannot see to aim at.
    if (x < grown || x > 1280 - grown || y < 110 + grown || y > 720 - grown) return false;

    for (const other of this.patches) {
      if (!other.alive) continue;
      const gap =
        TUNING.patch.reachRadius * TUNING.bramble.patchRingFraction +
        grown +
        patchClearance;
      if (Math.hypot(other.x - x, other.y - y) < gap) return false;
    }

    for (const other of this.brambles) {
      if (
        Math.hypot(other.x - x, other.y - y) <
        other.maxRadius + grown + siblingClearance
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Where a path first meets thorns, measured from the start of the path.
   *
   * `Infinity` when it is clear. Everything that needs to know "can bees get
   * along this line" — committing a drag, aim assist, and the per-step recheck
   * that catches wind bending a route into a thicket — goes through here.
   */
  blockedDistance(poly: Polyline, limit: number): number {
    return blockedDistanceAlong(poly, limit, this.brambles);
  }

  /**
   * Whether a straight hop from a to b passes through thorns.
   *
   * `knownOnly` distinguishes the two callers. Aim assist must reason from what
   * the player can see, so it asks about discovered thickets — refusing to snap
   * because of an invisible one would look like a bug. The route clip asks
   * about all of them, because an unseen thicket is still there, and being cut
   * by it is how the player finds out.
   */
  pathBlocked(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    knownOnly = false,
  ): boolean {
    const obstacles = knownOnly
      ? this.brambles.filter((b) => b.discovered)
      : this.brambles;
    return segmentBlocked(ax, ay, bx, by, obstacles);
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
    for (const bramble of this.brambles) bramble.step(dt);

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

      this.clipRouteAtThorns(route);
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
   * Cuts a route back to where it now meets thorns.
   *
   * Checked every step rather than only on commit, because two things move
   * under a route the player already drew: the wind bows it sideways, and
   * thickets spread. A line that was clear at dawn can be in the brambles by
   * mid-afternoon, and the honest answer is that it stops working there.
   *
   * That interaction was free — wind and growing thorns were built for their
   * own reasons and produce it between them — and it is the best pressure in
   * the game, because it makes a route something you maintain rather than
   * something you place.
   */
  private clipRouteAtThorns(route: Route): void {
    if (this.brambles.length === 0) return;

    const hit = this.blockedDistance(route.poly, route.liveLength);
    if (!Number.isFinite(hit) || hit >= route.liveLength) return;

    this.events.cut.push({ x: route.tipX, y: route.tipY });
    route.cutAt(hit);
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
      cut: [],
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
