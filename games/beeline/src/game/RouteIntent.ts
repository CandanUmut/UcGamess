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
  /** What drawing it from scratch would have cost. */
  fullLength: number;
  connected: boolean;
  /** The route that was created or changed, 0 if none. */
  routeId: number;
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

  const patch = field.nearestPatchTo(endX, endY, TUNING.patch.aimAssistRadius);
  if (!patch) return { coords: out, connected: false };

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
  const { coords, connected } = applyAimAssist(field, rawCoords);
  const drawnLength = pathLength(coords);

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
      };
    }
    // The route died mid-drag. Fall through and treat it as a fresh draw
    // rather than discarding the player's gesture.
  }

  const endX = coords[coords.length - 2] ?? 0;
  const endY = coords[coords.length - 1] ?? 0;
  const patch = field.nearestPatchTo(endX, endY, TUNING.patch.aimAssistRadius);

  // Drawing again at a flower that already has a route tops that route up
  // rather than spending one of the five slots on a duplicate.
  const existing = patch ? field.routeTargeting(patch) : null;
  if (existing) {
    existing.replaceWith(coords, field.routeHoldSeconds);
    field.retarget(existing);
    return {
      kind: 'fresh',
      drawnLength,
      fullLength: drawnLength,
      connected,
      routeId: existing.id,
    };
  }

  const route = field.createRoute(coords);
  return {
    kind: route ? 'fresh' : 'rejected',
    drawnLength,
    fullLength: drawnLength,
    connected: route ? connected : false,
    routeId: route ? route.id : 0,
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
