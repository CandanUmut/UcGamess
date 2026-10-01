import { type Field, WORLD_HEIGHT, WORLD_WIDTH, type LineStart } from '../sim/Field.ts';
import type { Patch } from '../sim/Patch.ts';
import type { Route } from '../sim/Route.ts';

/**
 * How well a forager plays: the same human-factors figures the playtest
 * personas use. The rival colony is one of these; so is every simulated
 * player in the harness.
 */
export interface ForagerSkill {
  /** Mean and spread of the delay between deciding and the input landing, s. */
  reaction: number;
  reactionSd: number;
  /** Spread of where a release lands relative to the intent, design px. */
  aimSd: number;
  /** Decisions per second. */
  thinkRate: number;
  /** Chance per decision of the plainly worse option. */
  sloppiness: number;
}

/** A normally distributed sample, from Math.random. */
function gaussian(mean: number, sd: number): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** One input the bot has decided on, landing after its reaction time. */
interface Pending {
  kind: 'line' | 'swat' | 'cut';
  /** For a cut: the line to take back. */
  route?: Route;
  /** Field time the input lands. */
  at: number;
  /** For a line: where the drag starts from. */
  start?: LineStart;
  /** Where the drag is released, or the tap lands. */
  x: number;
  y: number;
  /** The flower this drag is meant to end on, if it is the last leg. */
  target?: Patch | null;
}

/**
 * A simulated player of the drag-a-line game.
 *
 * It reads the board a few times a second, picks one thing to do, and does it
 * after a human reaction delay and with a human amount of aim error. A drag
 * takes time to perform. Everything it knows, a person looking at the screen
 * would know: it only targets flowers that are drawn, and it scouts into the
 * mist rather than towards flowers it cannot see.
 */
export class Forager {
  inputs = 0;
  wasted = 0;
  private pending: Pending | null = null;
  private thinkIn = 0;
  private dt = 1 / 60;
  private readonly persona: ForagerSkill;

  private readonly glints: boolean;
  /** Whether raiding is on; a rival switches it on for the raid-out. */
  raids: boolean;
  /** Seconds a golden bloom must have been open before this one reacts. */
  private readonly goldenDelay: number;
  private readonly contested: (() => ReadonlySet<Patch>) | null;
  /**
   * Always routes round hedges, however sloppy otherwise. The wasps play
   * slowly when dozy, not blindly: a colony that jammed its lines on every
   * hedge would be no opponent at all.
   */
  private readonly readsMaze: boolean;

  /**
   * `glints`: whether it scouts toward a sparkle in the mist (the player's
   * own bots do; the wasps do not, so they never look like they know where a
   * hidden flower is). `contested`: flowers someone else is working, which
   * it prefers a little — the wasps go where you are.
   */
  constructor(
    persona: ForagerSkill,
    opts: {
      glints?: boolean;
      raids?: boolean;
      goldenDelay?: number;
      contested?: () => ReadonlySet<Patch>;
      readsMaze?: boolean;
    } = {},
  ) {
    this.persona = persona;
    this.raids = opts.raids ?? true;
    this.goldenDelay = opts.goldenDelay ?? 0;
    this.glints = opts.glints ?? true;
    this.contested = opts.contested ?? null;
    this.readsMaze = opts.readsMaze ?? false;
  }

  /** Dark spots already scouted toward, so a dead end is not retried. */
  private tried: Array<{ x: number; y: number }> = [];

  beginDay(): void {
    this.pending = null;
    this.thinkIn = 0.6;
    this.tried = [];
  }

  step(field: Field, dt = 1 / 60): 'acting' | 'idle' {
    this.dt = dt;
    if (this.pending) {
      if (field.time >= this.pending.at) this.perform(field, this.pending);
      return 'acting';
    }

    this.thinkIn -= dt;
    if (this.thinkIn > 0) return 'idle';
    this.thinkIn = 1 / this.persona.thinkRate;

    const next = this.decide(field);
    if (!next) return 'idle';
    this.pending = next;
    return 'acting';
  }

  private perform(field: Field, p: Pending): void {
    this.pending = null;
    this.inputs += 1;
    const x = gaussian(p.x, this.persona.aimSd);
    const y = gaussian(p.y, this.persona.aimSd);

    if (p.kind === 'swat') {
      if (!field.swatAt(x, y)) this.wasted += 1;
      return;
    }
    if (p.kind === 'cut') {
      if (p.route && !p.route.dead) field.killRoute(p.route);
      return;
    }

    if (!p.start) return;
    // The start may have moved (a line retired) while the finger was on its way.
    const start = field.lineStartAt(p.start.x, p.start.y);
    if (!start) {
      this.wasted += 1;
      return;
    }
    let plan = field.planLine(start, x, y);
    // A person watches the preview while dragging. If it has snapped onto
    // some other flower — the line ended at a hedge near it — they steer to the
    // corridor corner instead of letting go on the wrong thing. Only a player
    // who reads the maze does this; a first-timer lets go regardless.
    if (
      p.target &&
      plan.target &&
      plan.target !== p.target &&
      this.persona.sloppiness <= 0.4
    ) {
      // Steer to the corridor corner instead. If even that lands on another
      // flower, let go anyway — a line to *a* flower still pays, and a person
      // does not hover over the board forever.
      const corner = waypoint(field, start.x, start.y, p.target.x, p.target.y);
      plan = field.planLine(start, corner.x, corner.y);
    }
    const route = field.commitLine(plan);
    if (!route) this.wasted += 1;
  }

  private delay(): number {
    return Math.max(0.12, gaussian(this.persona.reaction, this.persona.reactionSd));
  }

  private decide(field: Field): Pending | null {
    const sloppy = Math.random() < this.persona.sloppiness;
    const now = field.time;

    // 1. A wasp on the board. Swat it where it will be when the tap lands —
    // a practised player leads the target, a new one taps where it is.
    const wasp = field.wasps.find((w) => w.alive && w.state !== 'fleeing');
    if (wasp && !(sloppy && Math.random() < 0.5)) {
      const rt = this.delay();
      const lead = sloppy ? 0 : rt * (1 - this.persona.sloppiness);
      const vx = (wasp.x - wasp.prevX) / this.dt;
      const vy = (wasp.y - wasp.prevY) / this.dt;
      return {
        kind: 'swat',
        at: now + rt,
        x: wasp.x + vx * lead,
        y: wasp.y + vy * lead,
      };
    }

    // 2. Every line busy: take one back if it is plainly wasted — a raid
    // that no longer pays, or a poor flower while a far richer one sits
    // unworked. Only a player who reads the board does this.
    if (field.routes.length >= field.stats.routeSlots) {
      return sloppy || this.persona.sloppiness > 0.4 ? null : this.replan(field);
    }

    // Lines already on each flower. A rich flower is worth a second or third
    // crew — that is how a big bloom is won — so it stays "open" until it
    // has as many lines as its honey is worth.
    const crews = new Map<Patch, number>();
    for (const r of field.routes)
      if (r.target) crews.set(r.target, (crews.get(r.target) ?? 0) + 1);
    const wants = (p: Patch): number =>
      p.kind === 'nest' || sloppy ? 1 : p.honeyLeft >= 90 ? 3 : p.honeyLeft >= 45 ? 2 : 1;

    // Every flower gets a line before any gets a second: stacking is for
    // spare lines, once nothing else known is worth one.
    // A raid is only worth the stings once there is a jar worth robbing.
    const known = field.knownPatches.filter(
      (p) =>
        (p.kind !== 'nest' ||
          (this.raids && p.honeyLeft >= Math.max(15, field.honey + 10))) &&
        (p.kind !== 'night' || p.windowTotal - p.windowRemaining >= this.goldenDelay),
    );
    const unserved = known.filter((p) => !crews.has(p));
    const open =
      unserved.length > 0
        ? unserved
        : known.filter((p) => (crews.get(p) ?? 0) < wants(p));
    const partial = this.partialLine(field);

    // Scout: push a line into the mist. Everyone does it once nothing known
    // is left; a player who has learned the game does it early, with a line
    // to spare, because flowers are found and not handed over.
    const lineSpare = field.routes.length < field.stats.routeSlots - 1;
    // How many known flowers a player is happy to have in hand before scouting:
    // a practised one keeps a line out in the mist, a regular scouts when
    // running low, a first-timer only once everything known is gone.
    const reserve =
      this.persona.sloppiness <= 0.1 ? 2 : this.persona.sloppiness <= 0.4 ? 1 : -1;
    const scoutEarly = open.length <= reserve && lineSpare;
    if ((open.length === 0 || scoutEarly) && !partial) {
      // A glint in the mist is something a person can see; a practised player
      // scouts toward it, a first-timer just pushes into the nearest dark.
      const glint =
        this.glints && this.persona.sloppiness <= 0.4 ? this.nearestGlint(field) : null;
      const dark = glint ?? this.nearestDark(field);
      if (dark) {
        this.tried.push(dark);
        // Into the dark by the corridors, not straight into a hedge.
        const aim = waypoint(field, field.hiveX, field.hiveY, dark.x, dark.y);
        return this.line(field, { x: field.hiveX, y: field.hiveY, route: null }, aim);
      }
    }
    if (open.length === 0) return null;

    const target = this.pick(field, open, sloppy);
    if (!target) return null;

    // Carry on a line that stopped short, if there is one.
    const from: LineStart = partial
      ? { x: partial.tipX, y: partial.tipY, route: partial }
      : { x: field.hiveX, y: field.hiveY, route: null };

    // Where to aim this leg: straight at the flower, or — for a player who
    // reads the maze — at the furthest corridor corner they can see from here.
    // A person drags straight at the flower first and watches the preview: if
    // it turns green, they let go. Only when it does not do they steer for
    // the corridor corner — and a first-timer does not know to do even that.
    const straightPlan = field.planLine(from, target.x, target.y);
    const aim =
      straightPlan.target === target ||
      (!this.readsMaze && (sloppy || this.persona.sloppiness > 0.4))
        ? { x: target.x, y: target.y }
        : waypoint(field, from.x, from.y, target.x, target.y);
    const pending = this.line(field, from, aim);
    pending.target = target;
    return pending;
  }

  /** Honey a flower is worth to this player per pixel of trip, roughly. */
  private worth(field: Field, p: Patch): number {
    const dist = Math.max(
      Math.hypot(p.x - field.hiveX, p.y - field.hiveY),
      field.pathDistanceTo(p.x, p.y),
    );
    return ((p.kind === 'night' ? 2 : 1) * p.honeyLeft) / (120 + dist);
  }

  /** A busy line worth taking back, as a 'cut' input, or null. */
  private replan(field: Field): Pending | null {
    const at = field.time + this.delay() + 0.6;
    // A raid on a jar no fuller than ours brings nothing home.
    const deadRaid = field.routes.find(
      (r) => r.target?.kind === 'nest' && r.target.honeyLeft <= field.honey,
    );
    if (deadRaid) return { kind: 'cut', at, route: deadRaid, x: 0, y: 0 };

    const served = new Set<Patch>();
    for (const r of field.routes) if (r.target) served.add(r.target);
    let best = 0;
    for (const p of field.knownPatches) {
      if (served.has(p) || p.kind === 'nest' || !p.alive) continue;
      if (p.kind === 'night' && p.windowTotal - p.windowRemaining < this.goldenDelay)
        continue;
      best = Math.max(best, this.worth(field, p));
    }
    if (best <= 0) return null;
    // The poorest flower line, if the gap is wide enough to be worth a redraw.
    let worst: Route | null = null;
    let worstValue = Number.POSITIVE_INFINITY;
    for (const r of field.routes) {
      if (!r.target || r.target.kind === 'nest' || !r.reachesTarget()) continue;
      const v = this.worth(field, r.target);
      if (v < worstValue) {
        worstValue = v;
        worst = r;
      }
    }
    if (!worst || best < worstValue * 2.5) return null;
    return { kind: 'cut', at, route: worst, x: 0, y: 0 };
  }

  /** A line with no flower under its tip, still young enough to carry on. */
  private partialLine(field: Field): Route | null {
    return field.routes.find((r) => !r.target && !r.hadTarget) ?? null;
  }

  private line(field: Field, start: LineStart, to: { x: number; y: number }): Pending {
    // Reaction, then the drag itself — longer for a longer drag.
    const dist = Math.hypot(to.x - start.x, to.y - start.y);
    const gesture = 0.18 + dist / 2400 + this.persona.sloppiness * 0.2;
    return {
      kind: 'line',
      at: field.time + this.delay() + gesture,
      start,
      x: to.x,
      y: to.y,
    };
  }

  private pick(field: Field, open: Patch[], sloppy: boolean): Patch | null {
    const contested = this.contested?.() ?? null;
    const scored = open.map((p) => {
      const straightLine = Math.hypot(p.x - field.hiveX, p.y - field.hiveY);
      // A player who reads the maze judges distance by the corridors; a
      // first-timer judges it by eye.
      const dist = sloppy
        ? straightLine
        : Math.max(straightLine, field.pathDistanceTo(p.x, p.y));
      const golden = p.kind === 'night' ? 4 : 1;
      const contest = contested?.has(p) ? 1.35 : 1;
      return {
        p,
        value: sloppy ? -straightLine : (contest * golden * p.honeyLeft) / (120 + dist),
      };
    });
    scored.sort((a, b) => b.value - a.value);
    return scored[0]?.p ?? null;
  }

  /** The nearest glint of hidden treasure, as drawn over the mist. */
  private nearestGlint(field: Field): { x: number; y: number } | null {
    const spots = [
      ...field.treasures.filter((t) => !t.found),
      ...field.patches.filter((p) => p.kind === 'royal' && !field.knows(p) && p.alive),
    ];
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const s of spots) {
      const d = Math.hypot(s.x - field.hiveX, s.y - field.hiveY);
      if (d < bestDist) {
        bestDist = d;
        best = { x: s.x, y: s.y };
      }
    }
    return best;
  }

  /** The nearest unlit ground to the hive, as a person would see the mist. */
  private nearestDark(field: Field): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (let y = 140; y < WORLD_HEIGHT - 30; y += 40) {
      for (let x = 40; x < WORLD_WIDTH - 30; x += 40) {
        if (field.fog.isDiscovered(x, y)) continue;
        if (this.tried.some((t) => Math.hypot(t.x - x, t.y - y) < 120)) continue;
        // Not into the other colony's hive: a scout that lands there is a raid.
        if (
          !this.raids &&
          field.patches.some(
            (p) => p.kind === 'nest' && Math.hypot(p.x - x, p.y - y) < 140,
          )
        )
          continue;
        // Judged by the corridors: the dark just behind a hedge is far away.
        const d = Math.hypot(x - field.hiveX, y - field.hiveY);
        if (d < bestDist) {
          bestDist = d;
          best = { x, y };
        }
      }
    }
    return best;
  }
}

/**
 * The furthest point along the maze path to (tx, ty) that is in plain view
 * from (fx, fy) — the corner a person would drag to.
 */
export function waypoint(
  field: Field,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
): { x: number; y: number } {
  if (!field.pathBlocked(fx, fy, tx, ty)) return { x: tx, y: ty };
  const { maze } = field;
  const dist = maze.distancesFrom(maze.colAt(tx), maze.rowAt(ty));
  let col = maze.colAt(fx);
  let row = maze.rowAt(fy);
  let best = { x: tx, y: ty };
  let found = false;
  for (let guard = 0; guard < 80; guard += 1) {
    const here = dist[row * maze.cols + col] ?? -1;
    if (here <= 0) break;
    let moved = false;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nc = col + dc;
      const nr = row + dr;
      if (!maze.inside(nc, nr) || !maze.canStep(col, row, nc, nr)) continue;
      if ((dist[nr * maze.cols + nc] ?? -1) === here - 1) {
        col = nc;
        row = nr;
        moved = true;
        break;
      }
    }
    if (!moved) break;
    const c = maze.centreOf(col, row);
    if (!field.pathBlocked(fx, fy, c.x, c.y)) {
      best = c;
      found = true;
    } else if (found) {
      break;
    }
  }
  return best;
}
