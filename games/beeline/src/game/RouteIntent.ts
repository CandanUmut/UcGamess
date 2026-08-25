import { TUNING } from '../config/tuning.ts';
import type { Field } from '../sim/Field.ts';

export type IntentKind = 'extend' | 'fresh';

export interface DragIntent {
  kind: IntentKind;
  /** Route being continued, for `extend`. */
  routeId: number;
  /** Where the committed path begins. Snapped, not the raw finger position. */
  anchorX: number;
  anchorY: number;
}

export interface CommitResult {
  kind: IntentKind | 'rejected';
  /** Length the player actually had to draw. Workers are charged on this. */
  drawnLength: number;
  /**
   * What the finger covered, before the walls bent the line.
   *
   * Equal to `drawnLength` whenever the trace was clear. Sliding along a wall
   * is a longer trip than the drag that produced it, so `drawnLength` is the
   * larger of the pair whenever a wall was touched — the inversion that came
   * with deflecting rather than severing.
   */
  fullLength: number;
  connected: boolean;
  /** The route that was created or changed, 0 if none. */
  routeId: number;
  /** Where the drag first met a wall and was turned along it, if it did. */
  deflectedAt: { x: number; y: number } | null;
}

/**
 * Decides what a drag means, from where it started.
 *
 * The first playtest found the old rule — refresh only if you begin within
 * 120px of the tip, otherwise you get a new route — undiscoverable. The player
 * who *designed* the retreat mechanic could not find it and simply drew new
 * lines from the hive every time.
 *
 * So there is no longer a gesture to discover. Dragging toward a flower always
 * works. Starting near a route's tip continues it, which is cheap; starting
 * anywhere else redraws from the hive, which costs the full gesture but is
 * never wrong. The economy that justifies decaying from the far end is intact,
 * but it is now something a player notices rather than something they must be
 * taught.
 */
export function resolveDragStart(field: Field, x: number, y: number): DragIntent {
  const extendable = field.routeToExtendAt(x, y);

  if (extendable) {
    // Anchor at the route's actual tip, not the finger. The player may have
    // grabbed 100px off; the join still has to be seamless.
    return {
      kind: 'extend',
      routeId: extendable.id,
      anchorX: extendable.tipX,
      anchorY: extendable.tipY,
    };
  }

  // Everything else starts a fresh route from the hive, wherever the finger
  // went down. A drag that does nothing is the worst possible response on a
  // touchscreen — it is indistinguishable from a broken game.
  return { kind: 'fresh', routeId: 0, anchorX: field.hiveX, anchorY: field.hiveY };
}

/**
 * Snaps the end of a drag onto a nearby flower.
 *
 * Returns the coordinate list to commit. Landing by hand inside `reachRadius`
 * is genuinely hard with a thumb, and a route that stops a few pixels short
 * looks connected but pays nothing — the most confusing possible failure.
 */
export function applyAimAssist(
  field: Field,
  coords: readonly number[],
): { coords: number[]; connected: boolean } {
  const out = [...coords];
  const endX = out[out.length - 2];
  const endY = out[out.length - 1];
  if (endX === undefined || endY === undefined) return { coords: out, connected: false };

  // A wasp outranks a flower at the same distance.
  //
  // Defending is the reaction the game asks for under time pressure, and a
  // panicked drag at a raider that landed on the marigold behind it would be
  // the worst possible moment to be pedantic about where the thumb went.
  const wasp = field.nearestWaspTo(endX, endY, TUNING.patch.aimAssistRadius);
  if (wasp && !field.pathBlocked(endX, endY, wasp.x, wasp.y)) {
    if (Math.hypot(wasp.x - endX, wasp.y - endY) > TUNING.wasp.reachRadius * 0.5) {
      out.push(wasp.x, wasp.y);
    }
    return { coords: out, connected: true };
  }

  // Only ever snaps to a flower the player has found. Assist exists to make a
  // drag mean what it looks like it means; pulling a line onto something
  // invisible would hand back the information the dark was there to take away.
  const patch = field.nearestPatchTo(endX, endY, TUNING.patch.aimAssistRadius, true);
  if (!patch) return { coords: out, connected: false };

  // Never snap through thorns. Assist exists to make a drag mean what it looks
  // like it means; hopping the line over a thicket the player can plainly see
  // would do the opposite — and the route would only be cut back there anyway.
  if (field.pathBlocked(endX, endY, patch.x, patch.y)) {
    return { coords: out, connected: false };
  }

  // Only extend to the flower's centre if we are not already inside it, so a
  // careful player's line is left exactly as they drew it.
  if (Math.hypot(patch.x - endX, patch.y - endY) > TUNING.patch.reachRadius * 0.5) {
    out.push(patch.x, patch.y);
  }
  return { coords: out, connected: true };
}

/** Applies a completed drag to the field. */
export function commitDrag(
  field: Field,
  intent: DragIntent,
  rawCoords: readonly number[],
): CommitResult {
  const assisted = applyAimAssist(field, rawCoords);
  const slid = field.slidePath(assisted.coords);
  const coords = slid.coords;
  const deflectedAt = slid.contact;

  // Workers are charged on the line the swarm will actually fly, which after a
  // slide is a little longer than the finger's path. That is what a wall costs
  // now: the extra road needed to go along it rather than through it, billed at
  // the ordinary per-pixel rate. It stays fair because the player still gets
  // the route — they are paying for road, not for road taken away.
  const drawnLength = pathLength(coords);
  // The raw gesture, before the walls bent it.
  const gestureLength = pathLength(assisted.coords);

  // The drag jammed in a corner with nothing usable behind it. Report it so the
  // contact still shows; silently doing nothing is what makes a touchscreen
  // game feel broken.
  if (coords.length < 4) {
    return {
      kind: 'rejected',
      drawnLength: 0,
      fullLength: gestureLength,
      connected: false,
      routeId: 0,
      deflectedAt,
    };
  }

  // Aim assist may have snapped onto a flower the slide then led away from.
  const endX = coords[coords.length - 2] ?? 0;
  const endY = coords[coords.length - 1] ?? 0;
  const connected =
    assisted.connected &&
    (field.nearestPatchTo(endX, endY, TUNING.patch.reachRadius) !== null ||
      field.nearestWaspTo(endX, endY, TUNING.wasp.reachRadius) !== null);

  if (intent.kind === 'extend') {
    const route = field.routeById(intent.routeId);
    if (route && !route.dead) {
      const before = route.poly.length;
      route.extendWith(coords, field.routeHoldSeconds);
      field.retarget(route);
      return {
        kind: 'extend',
        drawnLength,
        fullLength: Math.max(before, route.poly.length),
        connected,
        routeId: route.id,
        deflectedAt,
      };
    }
    // The route died mid-drag. Fall through and treat it as a fresh draw
    // rather than discarding the player's gesture.
  }

  const patch = field.nearestPatchTo(endX, endY, TUNING.patch.aimAssistRadius, true);

  // Drawing again at a flower that already has a route tops that route up
  // rather than spending one of the five slots on a duplicate. Wasps are
  // deliberately excluded: piling a second line onto a raider is a legitimate
  // thing to want, and it is how a big raid is actually beaten.
  const existing = patch ? field.routeTargeting(patch) : null;
  if (existing) {
    existing.replaceWith(coords, field.routeHoldSeconds);
    field.retarget(existing);
    return {
      kind: 'fresh',
      drawnLength,
      fullLength: gestureLength,
      connected,
      routeId: existing.id,
      deflectedAt,
    };
  }

  const route = field.createRoute(coords);
  return {
    kind: route ? 'fresh' : 'rejected',
    drawnLength,
    fullLength: gestureLength,
    connected: route ? connected : false,
    routeId: route ? route.id : 0,
    deflectedAt,
  };
}

function pathLength(coords: readonly number[]): number {
  let total = 0;
  for (let i = 2; i < coords.length; i += 2) {
    const dx = (coords[i] ?? 0) - (coords[i - 2] ?? 0);
    const dy = (coords[i + 1] ?? 0) - (coords[i - 1] ?? 0);
    total += Math.hypot(dx, dy);
  }
  return total;
}
