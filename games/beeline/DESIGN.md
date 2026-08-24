# Beeline — design document

> Working title. Verify against CrazyGames and Poki catalogues before submission —
> a name confusable with an existing game is a documented rejection cause.

**One sentence:** You draw flight routes from your hive to flower patches, and
your swarm follows the lines you draw.

**The core verb is drawing.** Not tapping upgrade buttons, not managing menus.
Every design decision below is checked against one question: does this keep the
player's hand on the screen drawing lines? If a feature moves attention away
from that, it is cut.

---

## 1. The loop

### Moment to moment

The hive sits near the centre of the field. Flower patches bloom around it. The
player drags from the hive outward to a patch, leaving a visible route. Bees
stream along it, collect nectar, return, and deposit honey. Several routes can
exist at once, up to a hard limit of five.

Three pressures make this a game rather than a screensaver:

**1. Routes decay from the far end backward.**

This is the mechanic the whole game hangs on, so it is worth stating precisely.
A route does not fade uniformly. It holds its full length for a few seconds,
then begins _retreating_ — the far end (the end at the patch) dissolves back
toward the hive at a constant speed in pixels per second.

Four things fall out of this, all of them good:

- **The route's health is its shape.** No meter, no colour code, no UI. The
  player sees how much route is left because the line is literally that long.
- **Refreshing is cheaper than creating.** To restore a route you drag from
  where the line currently ends out to the patch — you only redraw the missing
  piece. A route caught early costs a flick; one left to rot costs the full
  gesture again. Hand fatigue drops as the player gets better, instead of rising.
- **The gesture never changes.** Creating and refreshing are the same motion:
  drag outward toward a patch. There is no second verb to learn.
- **Long routes are structurally expensive.** Constant retreat speed means a
  600px route loses its patch connection in exactly the same time as a 200px
  one, but costs three times as much to rebuild from scratch. Distance is a real
  cost before wasps ever appear.

Retreat does not begin immediately — `route.holdSeconds` of grace first. That
grace period is what the Route Persistence upgrade buys, which is why it reads
as the most valuable purchase in the game.

A small `patch.reachRadius` forgives the first moments of retreat, so a route
does not stop paying the instant decay starts. Bees flying to a live end that no
longer reaches a patch mill briefly, find nothing, and return empty — visibly,
so the player can see exactly why honey stopped.

**2. Patches deplete.** A worked patch drains its nectar pool, wilts, and a new
one blooms elsewhere after a delay. Routes must be redrawn to new targets
constantly.

**3. The swarm is finite.** Bees split evenly across live routes. Four routes
means each carries a quarter of the swarm. Choosing between one strong route and
several weak ones is the central decision, and it is available from day two —
never gated behind a purchase.

### Route rules

| Rule     | Behaviour                                                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Origin   | A route must start within `hive.drawRadius` of the hive. A drag beginning elsewhere is ignored (no route is created, nothing is destroyed).                                         |
| Maximum  | Five simultaneous routes.                                                                                                                                                           |
| Overflow | Drawing a sixth kills the **most-decayed** route and takes its slot, with a brief flash on what was dropped. Drawing always does something — a gesture is never refused mid-motion. |
| Refresh  | A drag starting near a live route's current end extends that route instead of creating a new one. Threshold: `route.refreshSnapRadius`.                                             |
| Redraw   | A drag from the hive to a patch that already has a route replaces it at full length.                                                                                                |
| Death    | A route whose live length falls below `route.minLength` dies. Bees on it return to the hive and redistribute.                                                                       |

### Session shape

The game runs in **days** of 45–90 seconds, each with a honey quota. When a day
ends, night falls: the player sees the day's honey, spends it on upgrades, and
starts the next day.

This structure earns its place four times over — it creates a "one more day"
hook, it gives upgrades a rhythm, it produces clean and honest ad break points,
and it makes sessions measurable against the portal's three-minute threshold.

That last point is load-bearing, so here is the arithmetic:

| Days played | Play time | + night screens | Total session |
| ----------- | --------- | --------------- | ------------- |
| 3           | 150s      | ~36s            | **3.1 min**   |
| 4           | 210s      | ~48s            | **4.3 min**   |
| 6           | 345s      | ~72s            | **7.0 min**   |

**A player who reaches day three has already cleared Poki's three-minute
average.** That is why days one and two are short and nearly impossible to fail:
the entire onboarding budget is spent buying the player's third day.

---

## 2. First thirty seconds

Designed before anything else, because nothing downstream matters if this fails.

| Time | What happens                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------- |
| 0s   | Canvas paints. Bees already drifting around the hive — the swarm looks alive before the player does anything.  |
| 0–1s | A single patch blooms. A soft hint line pulses from hive to patch, tracing the gesture the player should make. |
| ~3s  | Player drags. **The hint line disappears on the first pointer-down and never returns.**                        |
| 4–6s | Bees pour along the route and reach the patch.                                                                 |
| ~8s  | First bees return. Honey counter moves for the first time.                                                     |
| 10s  | Player has earned honey and understands the game. No text has been shown.                                      |

Rules enforced by this table:

- **No tutorial screen, no text wall, no modal.** The hint line is the entire
  tutorial and it teaches by demonstrating.
- Day one has one patch, no wind, no wasps, and a quota (60) reachable at
  roughly a third of attentive play.
- The hint line reappears only if the player has drawn nothing 8 seconds into
  day one — a stuck-player rescue, not a repeated instruction.

---

## 3. Escalation schedule

One new element every couple of days. **Never two at once.** Odd days after an
introduction are deliberately quiet so the last addition has room to be
understood.

| Day | New              | Field     | Notes                                                                       |
| --- | ---------------- | --------- | --------------------------------------------------------------------------- |
| 1   | —                | 1 patch   | Hint line. Trivial quota. Teaching day.                                     |
| 2   | **Splitting**    | 2 patches | The central decision arrives. Not a mechanic, just a second target.         |
| 3   | —                | 2 patches | Consolidation. Depletion rate rises so retargeting becomes routine.         |
| 4   | **Wind**         | 3 patches | Gentle. Straight lines stop being optimal.                                  |
| 5   | —                | 3 patches | Consolidation. Wind strengthens.                                            |
| 6   | **Wasps**        | 3 patches | One wasp, slow, hunts the longest route. Distance becomes dangerous.        |
| 7   | —                | 4 patches | Consolidation.                                                              |
| 8   | **Rich patches** | 4 patches | Far, 3x yield, visually distinct. A genuine risk/reward call.               |
| 9   | —                | 4 patches | Consolidation. Second wasp.                                                 |
| 10  | **Night bloom**  | 4 patches | Short high-value window. Forces mid-day reallocation.                       |
| 11+ | —                | up to 6   | **No new mechanics ever.** Intensity scales through counts and speeds only. |

### Element detail

**Wind** — a slowly rotating vector that bows _stored route points_ laterally
over time (not the bees; bending the bees would desync them from the line the
player drew). A straight route becomes an arc, lengthening the trip. Counterplay
is to draw pre-curved routes into the wind, or refresh more aggressively.

**Wasps** — patrol the field. When a wasp intersects a route segment further
than `wasp.safeRadius` from the hive, bees on that segment scatter, drop their
cargo, and fly home. **Bees are never permanently lost in v1** — a 45-second day
is too short for permanent loss to read as anything but unfair.

**Rich patches** — spawn at ≥ `patch.richMinRadius`, pay 3x per trip, hold a
larger pool, and are visually unmistakable.

**Night bloom** — blooms with a visible countdown ring, pays 4x for roughly 12
seconds, then wilts regardless of state.

---

## 4. Upgrades

Five, matching the dimensions agreed with the team: bee count, bee speed, path
stability, more flowers, honey storage.

| #   | Upgrade               | Effect per level                     | Levels | Range             |
| --- | --------------------- | ------------------------------------ | ------ | ----------------- |
| 1   | **Swarm Size**        | +6 bees                              | 8      | 24 → 72           |
| 2   | **Bee Speed**         | +16 px/s                             | 6      | 175 → 271         |
| 3   | **Route Persistence** | +1.6s hold before decay              | 5      | 6.0s → 14.0s      |
| 4   | **Bloom**             | +1 max patch, −12% rebloom delay     | 4      | 2 → 6 patches     |
| 5   | **Honey Store**       | +2h offline window, +300 offline cap | 5      | 2h/200 → 12h/1700 |

**Route Persistence is the flagship.** It is the only upgrade that directly buys
relief from the core pressure, it is priced highest per level so it reads as
premium, and its effect is immediately felt rather than statistical.

**Carry Capacity was cut** from the original spec list. It multiplies throughput
linearly, which is mathematically the same upgrade as Swarm Size — two purchases
that do the same thing make the upgrade screen feel padded. **Bloom** takes its
slot instead: more patches means more route options, which feeds the central
splitting decision rather than duplicating an existing lever.

**Honey Store** is the offline accrual cap. It is the only upgrade that pays out
between sessions, which makes it the natural "come back tomorrow" lever.

### Cost curves

`cost(level) = round(base × growth^level)`, level 0-indexed.

| Upgrade           | Base | Growth | Level costs                             | Total      |
| ----------------- | ---- | ------ | --------------------------------------- | ---------- |
| Swarm Size        | 80   | 1.55   | 80, 124, 192, 298, 462, 716, 1110, 1721 | 4,703      |
| Bee Speed         | 100  | 1.60   | 100, 160, 256, 410, 655, 1049           | 2,630      |
| Route Persistence | 140  | 1.75   | 140, 245, 429, 750, 1313                | 2,877      |
| Bloom             | 120  | 1.80   | 120, 216, 389, 700                      | 1,425      |
| Honey Store       | 70   | 1.50   | 70, 105, 158, 236, 355                  | 924        |
|                   |      |        | **Everything maxed**                    | **12,559** |

Against the quota curve below, maxing every upgrade lands somewhere around day
14–16 for a player earning roughly 1.3x quota. That gives a real progression arc
without an obvious wall.

---

## 5. Day length and quota

`dayLength(d) = min(45 + 5×(d−1), 90)` seconds.

Quotas are a hand-tuned table rather than a formula, because a formula that fits
both a trivial day one and a tightening mid-game needs more shape than a single
exponential has.

| Day | Length | Quota                       | Intent                                    |
| --- | ------ | --------------------------- | ----------------------------------------- |
| 1   | 45s    | 60                          | Cannot be failed. ~⅓ of attentive play.   |
| 2   | 50s    | 110                         | Still generous.                           |
| 3   | 55s    | 170                         | First day that requires paying attention. |
| 4   | 60s    | 240                         | Wind arrives.                             |
| 5   | 65s    | 320                         |                                           |
| 6   | 70s    | 420                         | Wasps arrive.                             |
| 7   | 75s    | 540                         |                                           |
| 8   | 80s    | 680                         | Rich patches arrive.                      |
| 9   | 85s    | 850                         |                                           |
| 10  | 90s    | 1,050                       | Night bloom arrives.                      |
| 11  | 90s    | 1,280                       |                                           |
| 12  | 90s    | 1,550                       |                                           |
| 13+ | 90s    | `round(1550 × 1.22^(d−12))` |                                           |

**Target: most days from day four on should end in a narrow win or a near
miss.** Quotas are set slightly above comfortable on purpose — a near miss is
what makes the rewarded "extend 15 seconds" offer feel like a rescue rather than
a shakedown.

> **Every number in sections 4 and 5 is a pre-playtest estimate.** They are
> derived from the throughput model in section 8, not from anyone playing the
> game. Stage 3 must re-tune them against real sessions. Treat the _shape_ of
> these curves as the design and the _values_ as a starting position.

---

## 6. Retention hooks

- **Offline accrual** — honey collected while away, capped by Honey Store,
  claimable on arrival with a single tap.
- **Near-miss quotas** — see above.
- **Progression track** — the night screen shows the next unlock two or three
  days ahead, so there is always a visible reason to start another day.
- **Best day record** — persistent, shown on the night screen and beaten
  visibly.

---

## 7. Ad integration

Through `packages/portal` only. No portal SDK is imported in game code — lint
enforces this and it is not negotiable.

| Call                | When                                                     |
| ------------------- | -------------------------------------------------------- |
| `loadingFinished()` | Preload scene completes (handled by `BasePreloadScene`). |
| `gameplayStart()`   | A day begins.                                            |
| `gameplayStop()`    | A day ends, the player pauses, or the tab loses focus.   |
| `commercialBreak()` | The player presses **Next Day** on the night screen.     |

**`commercialBreak()` fires on every Next Day press, including day one.** It is
tempting to suppress early breaks so a new player is not interrupted 45 seconds
in — we deliberately do not. Portals control ad frequency, and suppressing calls
to manage that frequency is exactly the home-grown ad timer that both Poki and
CrazyGames reject. The documented contract is to signal every natural
opportunity and let the portal decide; it will not serve an ad to a
45-second-old session.

### Rewarded video

Three offers, each with a plain "No thanks" that continues the game unchanged:

| Offer              | Trigger               | Reward                   |
| ------------------ | --------------------- | ------------------------ |
| **Double honey**   | Night screen          | +100% of the day's honey |
| **Extend the day** | Quota missed by ≤25%  | +15 seconds, same board  |
| **Swarm boost**    | Day start, from day 3 | +50% bees for that day   |

Rules:

- **At most one rewarded offer per day boundary.** Never chained — multiple
  videos for one reward is explicitly disallowed.
- Offers are suppressed entirely when `portal.isAdBlocked()` is true. A button
  that visibly does nothing is worse than no button.
- Audio ducks during every ad call via the core audio manager. Not reimplemented
  here.

---

## 8. Tuning constants

Single exported config object, `src/config/tuning.ts`. Everything a designer
would want to change lives here and nowhere else.

> **Typing note:** this object is explicitly typed rather than declared
> `as const`. A const assertion gives numeric fields literal types (`3` instead
> of `number`), which then fails to assign to a mutable runtime field — a trap
> already hit once in this repo.

```ts
export interface Tuning {
  /* … one interface per section … */
}

export const TUNING: Tuning = {
  hive: {
    x: 640,
    y: 400, // below centre, leaving room for the HUD
    drawRadius: 110, // a route must start within this of the hive
    depositSeconds: 0.15,
  },

  bee: {
    baseSpeed: 175, // px/s
    speedJitter: 0.12, // ±12% per bee, so the stream is not a rigid line
    baseCount: 24,
    collectSeconds: 0.35,
    nectarPerTrip: 1,
    idleDriftRadius: 90, // how far unassigned bees wander from the hive
    lateralSpread: 14, // px offset from the route centreline
    steerLerp: 0.16, // how hard a bee corrects toward its target point
  },

  route: {
    maxCount: 5,
    holdSeconds: 6.0, // full length before retreat begins
    decaySpeed: 45, // px/s of retreat once decay starts
    minLength: 40, // below this the route dies
    refreshSnapRadius: 120, // drag starting within this of a live end extends it
    pointSpacing: 12, // resample distance when capturing the drag
    maxLength: 900,
  },

  patch: {
    baseCount: 2,
    minRadius: 180, // from the hive
    maxRadius: 520,
    reachRadius: 70, // forgiveness for early decay
    basePool: 200, // nectar before the patch wilts
    poolPerDay: 45, // pool growth per day
    rebloomSeconds: 3.5,
    richMinRadius: 400,
    richYieldMultiplier: 3,
    nightBloomMultiplier: 4,
    nightBloomWindowSeconds: 12,
  },

  day: {
    baseSeconds: 45,
    secondsPerDay: 5,
    maxSeconds: 90,
    nightScreenMinSeconds: 6,
    quotas: [60, 110, 170, 240, 320, 420, 540, 680, 850, 1050, 1280, 1550],
    quotaGrowthAfterTable: 1.22,
  },

  wind: {
    startDay: 4,
    baseStrength: 9, // px/s lateral drift applied to route points
    strengthPerDay: 1.6,
    maxStrength: 34,
    rotationSpeed: 0.12, // radians/s
  },

  wasp: {
    startDay: 6,
    secondWaspDay: 9,
    speed: 95,
    safeRadius: 160, // bees inside this radius of the hive are safe
    interceptRadius: 34,
    scatterSeconds: 1.2,
  },

  upgrades: {
    swarmSize: { base: 80, growth: 1.55, levels: 8, perLevel: 6 },
    beeSpeed: { base: 100, growth: 1.6, levels: 6, perLevel: 16 },
    routePersistence: { base: 140, growth: 1.75, levels: 5, perLevel: 1.6 },
    bloom: { base: 120, growth: 1.8, levels: 4, perLevel: 1 },
    honeyStore: { base: 70, growth: 1.5, levels: 5, perLevel: 300 },
  },

  offline: {
    baseCapHoney: 200,
    baseWindowHours: 2,
    honeyPerHour: 90,
  },

  ads: {
    rewardedSwarmBoostFromDay: 3,
    rewardedSwarmBoostMultiplier: 1.5,
    extendSeconds: 15,
    extendOfferMissThreshold: 0.25, // offer only within 25% of quota
  },
};
```

### The throughput model these numbers came from

For one route of length `L` with `N` bees:

```
roundTrip = 2L/speed + collectSeconds + depositSeconds
honeyPerSecond = N / roundTrip
```

Day one, at defaults, one route at L≈250: round trip ≈ 3.36s, 24 bees →
**7.1 honey/s**, so 45 seconds of perfect play yields ≈320. At the ~50% uptime
a first-time player achieves while learning, ≈160 against a quota of 60.

That is the safety margin day one is supposed to have. Every other quota was
derived by the same model and then adjusted by feel — which is precisely why
they need playtest data before they can be trusted.

---

## 9. Scope freeze

**In v1, not negotiable:** routes, patches, days, quotas, five upgrades, wind,
wasps.

**Cut — written to `docs/backlog.md`, not built:** multiple hives, map or world
progression, bee types or classes, story or characters, achievements,
leaderboards, daily rewards, a settings menu beyond mute, localisation,
cosmetic unlocks.

Nothing on the cut list is essential to v1. The one I would flag for a _later_
version is bee types, because it is the most natural way to add depth without
adding a second verb — but it would dilute the single mechanic before that
mechanic has proven itself, which is the wrong order.

---

## 10. Measured in Stage 2

Numbers from the feel prototype, replacing the corresponding estimates above.
Everything else in this document is still unvalidated.

### Route lifetime at default tuning

A 267px route, drawn at t=0:

| Event                 | When      | Why                                                           |
| --------------------- | --------- | ------------------------------------------------------------- |
| Holds full length     | 0 → 6.0s  | `route.holdSeconds`                                           |
| Tip starts retreating | 6.0s      |                                                               |
| **Stops paying**      | **~7.9s** | tip retreats past `patch.reachRadius` (70px at 45px/s ≈ 1.6s) |
| Route dies            | ~11.0s    | 267px at 45px/s                                               |

So the player gets roughly **8 seconds of production and a 3-second grace
window** to refresh before the route is lost entirely. Whether that window is
tense or exhausting is exactly what the playtest has to answer — it is the
single most likely number to need changing.

### The refresh economy holds

The central claim of the retreat-from-the-tip design, measured directly:

> Refreshing a route that had just stopped paying required a **85px** drag,
> against **267px** to redraw it from scratch. **3.1× cheaper.**

And the cost scales with neglect — a route left to rot longer costs
proportionally more to restore, without any explicit penalty system.

### Performance

Desktop (vsync-capped at 60Hz), five live routes, both renderers:

| Bees  | Blitter  | Sprite   |
| ----- | -------- | -------- |
| 300   | 60.3 fps | 60.0 fps |
| 1,000 | 60.0     | 60.1     |
| 3,000 | 60.4     | 60.2     |
| 6,000 | 60.2     | 60.3     |
| 9,000 | 60.2     | 60.4     |

**Individual sprites are fine.** No GPU sprite layer or custom particle system
is needed — the brief's fallback plan is unnecessary. 300 bees is 30× inside
what this machine sustains, so even a mid-range phone at a fifth of the
throughput has ample margin.

The `Blitter` path is kept anyway, switchable with `R`. It costs about 40 lines
and is the escape hatch if a real phone disagrees.

> **Not yet verified on real hardware.** These are desktop numbers. The
> prototype runs clean in headless WebKit (full collect-and-deposit loop, zero
> console errors), but headless WebKit is not Safari and no phone has been
> tested. That is the first thing the playtest should check.

### Input: use `JustDown`, not `keydown-X`

Binding actions to Phaser's `keydown-X` event fires them more than once per
press — three rapid presses ran the handler eleven times, with only three DOM
keydowns and a single `build()`. Filtering `event.repeat` does not suppress it.

Polling `Phaser.Input.Keyboard.JustDown()` on a `Key` object gives exactly-once
semantics and ignores OS key-repeat (verified: a 1.5-second hold fires once).
**Every discrete key action in this game must use that pattern** — the event
form on a "buy upgrade" or "next day" button would fire several times per press.

---

## 11. Success criteria

Not submission-ready until all of these hold:

- Average session over 3 minutes, with ≥25% of sessions exceeding it —
  **measured with the local metrics helper on real playtesters, not estimated**
- Initial download under 5 MB; interactive in under 5 seconds
- 60fps on a mid-range phone with 300+ bees; never below 30
- Correct on desktop Chrome, desktop Safari, at least one real iPhone and one
  real Android
- Route decay and bee movement identical at 60Hz and 144Hz
- Zero console errors
- `docs/submission-checklist.md` passes in full
