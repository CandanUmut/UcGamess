import { TUNING } from '../config/tuning.ts';
import type { Field } from '../sim/Field.ts';
import { buildPolyline, truncateCoords } from '../sim/polyline.ts';

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
   * What the gesture covered before thorns took any of it.
   *
   * Equal to `drawnLength` whenever nothing was cut, so the gap between the two
   * is exactly what the thorns cost the player.
   */
  fullLength: number;
  connected: boolean;
  /** The route that was created or changed, 0 if none. */
  routeId: number;
  /** Where thorns cut the drag short, if they did. */
  cutAt: { x: number; y: number } | null;
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

/**
 * Trims a freshly drawn path at the first thorns it enters.
 *
 * The route is not refused and no error is shown — the line simply stops where
 * the thicket starts. That is the entire teaching mechanism for thorns: the
 * player sees their line end at the obstacle, sees the bees reach a tip that
 * touches no flower and come home empty, and draws around it next time. There
 * is nothing to read.
 */
function clipAtThorns(
  field: Field,
  coords: readonly number[],
): { coords: number[]; cutAt: { x: number; y: number } | null } {
  const poly = buildPolyline(coords);
  const hit = field.blockedDistance(poly, poly.length);
  if (!Number.isFinite(hit)) return { coords: [...coords], cutAt: null };

  const clipped = truncateCoords(poly, hit);
  const x = clipped[clipped.length - 2] ?? 0;
  const y = clipped[clipped.length - 1] ?? 0;
  return { coords: clipped, cutAt: { x, y } };
}

/** Applies a completed drag to the field. */
export function commitDrag(
  field: Field,
  intent: DragIntent,
  rawCoords: readonly number[],
): CommitResult {
  const assisted = applyAimAssist(field, rawCoords);
  const clip = clipAtThorns(field, assisted.coords);
  const coords = clip.coords;
  const cutAt = clip.cutAt;

  // Workers are charged on what survived, not on what the finger covered. The
  // player got a shorter route than they drew, so they pay for a shorter route
  // — being billed in full for a line the thorns ate would be the one genuinely
  // unfair reading of this mechanic.
  const drawnLength = pathLength(coords);
  // What the gesture covered before thorns took any of it. Equal to
  // `drawnLength` whenever nothing was cut.
  const gestureLength = pathLength(assisted.coords);

  // A cut left nothing usable. Report it so the snip is still shown; silently
  // doing nothing is what makes a touchscreen game feel broken.
  if (coords.length < 4) {
    return {
      kind: 'rejected',
      drawnLength: 0,
      fullLength: gestureLength,
      connected: false,
      routeId: 0,
      cutAt,
    };
  }

  // Aim assist may have snapped onto a flower that the clip then cut away from.
  const endX = coords[coords.length - 2] ?? 0;
  const endY = coords[coords.length - 1] ?? 0;
  const connected =
    assisted.connected &&
    field.nearestPatchTo(endX, endY, TUNING.patch.reachRadius) !== null;

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
        cutAt,
      };
    }
    // The route died mid-drag. Fall through and treat it as a fresh draw
    // rather than discarding the player's gesture.
  }

  const patch = field.nearestPatchTo(endX, endY, TUNING.patch.aimAssistRadius, true);

  // Drawing again at a flower that already has a route tops that route up
  // rather than spending one of the five slots on a duplicate.
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
      cutAt,
    };
  }

  const route = field.createRoute(coords);
  return {
    kind: route ? 'fresh' : 'rejected',
    drawnLength,
    fullLength: gestureLength,
    connected: route ? connected : false,
    routeId: route ? route.id : 0,
    cutAt,
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
