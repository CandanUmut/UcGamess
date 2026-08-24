# Beeline — design document

> Working title. Verify against CrazyGames and Poki catalogues before submission —
> a name confusable with an existing game is a documented rejection cause.

**One sentence:** You draw flight routes from your hive out into a dark field,
and the lines your swarm actually works become roads.

> §18 is the current shape of the game. Sections 1-8 are the original design and
> are still broadly true, but the board is dark now, the hive sits in a corner,
> and a route is something you build up rather than something you replace.

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

**2. Flowers run dry, and stay dry.** A worked patch drains its pollen, wilts,
and does not come back until dawn. The field runs down over the day, so routes
must be redrawn to new targets constantly and early choices compound. Remaining
pollen is shown as a number on each flower, because once it can run out it is a
figure worth reading.

**3. The swarm is finite, and drawing spends it.** Bees split evenly across live
routes, so four routes means each carries a quarter of the swarm. On top of
that, drawing dispatches workers proportional to the length drawn: they fly the
new line once and return empty, so for a few seconds the hive carries less.
Choosing between one strong route and several weak ones is the central decision,
it is available from day two, and it is never gated behind a purchase.

### Route rules

| Rule     | Behaviour                                                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Origin   | Any drag works. Starting near a live route's tip extends it cheaply; starting anywhere else draws a fresh route anchored at the hive. A gesture is never ignored.                   |
| Maximum  | Five simultaneous routes.                                                                                                                                                           |
| Overflow | Drawing a sixth kills the **most-decayed** route and takes its slot, with a brief flash on what was dropped. Drawing always does something — a gesture is never refused mid-motion. |
| Refresh  | A drag starting within `route.refreshSnapRadius` of a live tip extends that route, costing only the piece that decayed — in gesture length and in workers.                          |
| Redraw   | A drag from the hive to a patch that already has a route replaces it at full length.                                                                                                |
| Death    | A route whose live length falls below `route.minLength` dies. Bees on it return to the hive and redistribute.                                                                       |
| Erase    | Press and hold a route for 0.75s to remove it; a ring fills to show progress. Moving more than 18px turns the gesture back into a draw.                                             |

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
- Day one has two flowers, no wind, no wasps, and a quota (60) reachable at
  roughly a quarter of attentive play. Two rather than one because the first
  will run dry inside 45 seconds, and the lesson needs somewhere to move to.
- The hint line reappears only if the player has drawn nothing 8 seconds into
  day one — a stuck-player rescue, not a repeated instruction.

---

## 3. Escalation schedule

One new element every couple of days. **Never two at once.** Odd days after an
introduction are deliberately quiet so the last addition has room to be
understood.

> **Superseded by §15.** Thorns took day 3 and everything after it moved a day
> later. The table below is the original shape; the rule it protects is
> unchanged, and §15 has the current days. §18 adds a second, quieter ramp on
> top of it: the flower band's outer edge moves a little further out every day,
> which is what walks the player off the edge of the hive's light.

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

> **Extended by §15.** These are still the five permanent upgrades. Honey now
> also buys one-use **provisions**, spent on a single day.

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

## 11. Playtest 1 and Stage 3

First real playtest, on desktop and phone. Three findings, two of which changed
the design.

### The refresh gesture was undiscoverable — fixed

> _"the ghost trail i don't know how to revive that i just draw new lines"_

The player who **designed** the retreat mechanic could not find how to refresh a
route, and fell back to drawing new lines from the hive every time. If it is not
discoverable to them, it is not discoverable to anyone.

The old rule was: begin a drag within 120px of a route's tip to extend it,
otherwise you get a new route. That is a second gesture, and nothing on screen
taught it.

**There is no longer a gesture to discover.** Dragging toward a flower always
works:

| Where the drag starts   | What happens          | Cost                   |
| ----------------------- | --------------------- | ---------------------- |
| Near a route's live tip | Extends that route    | only the decayed piece |
| Anywhere else           | Redraws from the hive | the full length        |

Plus **aim assist**: a drag ending within 130px of a flower snaps onto it.
Landing inside the reach ring by thumb is genuinely hard, and a route that stops
a few pixels short looks connected but pays nothing — the most confusing
possible failure.

The economy that justifies decaying from the far end is intact. It is now
something a player _notices_ rather than something they must be _taught_.

### Decay was too fast — retuned

> _"Too fast — felt like nagging"_

At the old tuning, five routes demanded roughly twenty gestures per 45-second
day. Hold time went 6s → 12s and retreat 45px/s → 26px/s:

|                       | Before        | After             |
| --------------------- | ------------- | ----------------- |
| Produces for          | ~7.6s         | **~15s**          |
| Grace before death    | ~3s           | **~7s**           |
| Measured refresh cost | 85px of 267px | **93px of 266px** |

About half the hand traffic, same 2.9× refresh discount.

### The verb survives, but needed feedback

> _"Fine but flat — needs feedback"_

Not a rethink — the drawing works, nothing acknowledged doing it well. Added
collection pops, deposit sparks, scatter puffs, a draw trail, a quota-bar punch,
and **audio synthesised at boot** rather than shipped: six one-shots and a
seamless hive loop generated into Phaser's audio cache, costing **zero bytes of
download** and routing through the core AudioManager so ad ducking and mute work
unchanged.

---

## 12. Bugs found while building Stage 3

Recorded because each was invisible until something specific was tried.

**The save was never loaded.** Beeline has no preload scene, and
`SaveManager.load()` — the call that hydrates the cache from storage — lives in
`BasePreloadScene`. Writes persisted; reads always returned the default. Within
a single session everything looked perfect, and progress silently reset on every
reload. Offline accrual could never have fired. `GameScene.bootstrap()` now
awaits the load before starting day one.

**The Honey Store upgrade did nothing.** Offline accrual had both a window
(2h) and a cap (200) at 90/hour — so the window always ran out at 180 first and
the cap was never reached. Buying the upgrade raised a ceiling nothing touched.
The window is now fixed and generous, and the cap is the single number the
upgrade moves. A test asserts the cap binds at every level.

**Phaser's types are global, so a type-only import still typechecks.**
`import type Phaser from 'phaser'` plus `Phaser.Input.Events.POINTER_UP` compiles
cleanly — the types resolve against the ambient `declare namespace Phaser` — and
then throws `Phaser is not defined` at runtime. TypeScript cannot catch this.
**If you use `Phaser.` as a value, the import must be a value import**, and the
linter will try to "fix" it back the moment the last value use is removed.

**Container and Shape hit areas silently did not fire.** Night-screen buttons
received nothing: the scene got `POINTER_DOWN` and `POINTER_UP`, six interactive
objects were registered, the camera was identity and the pointer's world
coordinates were correct — but `hitTestPointer` returned zero. Both a Container
hit area and `Rectangle.setInteractive()` failed. A `Zone` works. All buttons
now carry their input on a Zone.

---

## 13. Playtest 2 — scarcity, cost, and a real fail state

Seven changes, all from the second playtest. Two of them replaced ideas of mine
that were worse.

### Pollen is finite for the day

Flowers used to rebloom at full pool a few seconds after draining, so pollen was
effectively infinite and the "routes must be redrawn to new targets constantly"
pressure this document claims **did not actually exist**. A drained flower now
stays dead until dawn.

That single change is what makes the rest worth having: remaining pollen becomes
a number worth reading, early routing decisions compound, and the field visibly
runs down as the day goes on. Day one now has two flowers rather than one — the
first _will_ run dry inside 45 seconds, and the lesson only lands if there is
somewhere to move to.

Measured on day one: a flower drains 180 → 150 → 102 → 53 → 4 → **DRY**, the
player moves, and the day still finishes at 247 against a quota of 60.

### Drawing costs worker bees

Free infinite drawing was a hole. The fix came from the team, not from me: I
proposed a regenerating "wax" meter, and **worker bees are strictly better** —
no new currency, no new meter, visible on screen, and it charges the decision
the game is already about (the swarm is finite).

Drawing dispatches workers proportional to the length actually drawn. They fly
the new line once and return empty, so for a few seconds the swarm carries less.
A ~90px refresh costs about 3 bees; a ~400px redraw costs about 12.

Two things had to be fixed before it worked:

- **The cost was far too steep.** At 0.08 workers/px and a 55% cap, one draw
  took over half a day-one swarm. Honey flatlined and day one — which must be
  unmissable — **failed at 35 against a quota of 60.** Now 0.03 and 35%.
- **It was conscripting in-flight foragers.** Bees 90% of the way to a flower
  were reset to the start of the line on every redraw, so under normal decay
  pressure nobody ever arrived. Only bees at the hive, or already flying home
  empty, can be taken now. That also gives the cost a good shape on its own:
  drawing while the swarm is out is cheap, drawing as a wave lands costs most.

### A real fail state, with meta-progression

Missing the quota ends the run. Upgrades and unspent honey persist, the day
resets to 1, and the furthest day reached is recorded.

The alternative — a full wipe — was rejected on portal grounds: Poki gates
acceptance on average session over three minutes, and losing an hour of upgrades
to one bad day is how players quit permanently. "One more run with a stronger
hive" raises session length; "all of that for nothing" ends it. The rewarded
+15s offer is now a genuine rescue of the run rather than a token.

### The rest

- **Numbers on flowers**, warning in orange below 25%.
- **Wind indicator** — an arrow whose length carries strength. Wasp threat radii
  were already drawn on the field; wind shipped invisible, so it could only be
  reacted to, never planned around. That was inconsistent.
- **Press and hold to erase** a route, with a filling ring. Held for 0.75s;
  moving more than 18px turns the gesture back into a draw. A plain tap was
  considered and rejected as too easy to trigger by accident on a phone.
- **The field widens with the day**, bounded by the canvas. Distance is already
  expensive — constant retreat speed, more workers per draw — so this ramps
  difficulty with pressure that already exists.

---

## 14. Portrait was broken on phones

Reported from a real device: _"the game is on the middle as a rectangle,
basically the middle 1/3 of the screen, the rest is fully empty."_

Fitting a 1280x720 design into a 390x844 portrait viewport produces a 390x219
strip centred in a mostly empty screen. A portal reviewer opening the game on a
phone would have seen exactly that.

There is now a rotate prompt, and it is **DOM rather than a Phaser scene** —
that is the whole trick. The canvas _is_ the strip, so anything drawn inside the
game would sit in the same third of the screen and leave the empty area
unexplained. Only a DOM overlay can cover it.

Gameplay stops while it is up. The first attempt did not: `beginDay()` called
`startGameplay()` unconditionally, so the countdown ran behind the prompt and
the player lost a day to a message meant to help them. Verified frozen at 45s
across three seconds in portrait, resuming on rotate.

Landscape on a 2.16 phone fills 100% of height and 82% of width — correct 16:9
letterboxing, not a bug.

**Still true: no real phone or real Safari has run this build.** Headless WebKit
passes, and headless WebKit is not Safari.

---

## 15. Thorns, provisions, and the forecast

Three additions, from one note: the loop works but the field is empty and the
night screen only sells statistics.

### The problem the field had

Nothing on the board ever made the _shape_ of a route matter. Wind bent lines
and wasps punished long ones, but on any given frame the best line to a flower
was the straight one. That makes the drag a target selection wearing a
gesture's clothes: the player picks a flower, and the hand just carries out the
decision. A game about drawing needs the drawing to be the decision.

### Thorns

Thickets of bramble sit on the field. **A route cannot pass through one** — it is
clipped where it enters, and the piece beyond is discarded.

That single rule does the work:

- **Nothing to read, nothing to teach.** The line visibly stops at the thorns,
  the bees reach a tip that touches no flower, mill, and come home empty. That
  feedback path already existed for decay; thorns reuse it whole.
- **The gesture is unchanged.** Still one drag, still outward toward a flower.
  There is no avoid-verb, no pathfinding, no waypoint mode.
- **The cost is honest.** Workers are charged on the length that survived the
  cut, not on what the finger covered.
- **They spread through the day**, so a line that was clear at dawn can be in
  the thorns by mid-afternoon — the same pressure shape as flowers running dry.

The best part was free: **wind bows a route sideways, and thorns grow, so
between them a route the player already drew can be severed without the player
touching anything.** Neither system was built for that. It is what turns a route
from something you place into something you maintain.

A cut, unlike decay, shortens the _drawn_ path as well as the live one. Decay
leaves a ghost because refreshing along it is the right move; a cut must not,
because redrawing along it would hit the same thicket.

**Placement is the design, not decoration.** A thicket dropped at random usually
sits where nobody was flying, changes nothing, and reads as scenery. Each one is
placed on the line between the hive and a flower, nudged sideways by up to
0.6× its radius, so it blocks the lazy straight line without walling the flower
off. Three clearances are enforced: away from the hive draw ring, away from the
heart of every flower's reach ring, and away from other thickets. A spot that
cannot satisfy all three is skipped.

The first build of this shipped **with no thorns on the field at all.** Between
the hive ring (110px) and a flower ring (85px) there is only
`distance − 195 − 2 × grown radius` of usable line, and at the original 58px
growing to 1.35× that corridor came out at 412–487px — wider than most flowers
are far. Every candidate was rejected, silently. Two things fixed it: the
thicket was sized against the corridor it has to fit in, and the legal band of
the line is now **computed** rather than sampled at 0.34–0.7 and hoped for.

Two guarantees are tested rather than argued:

- every flower always has a clear route to it — a single dog-leg through one
  waypoint, not an elaborate serpentine;
- the field actually receives the number of thickets the schedule asks for,
  which is the test that fails when a clearance change quietly empties the board.

**Three is the cap**, because that is what a fixed 1280×720 board with a hive in
the middle can honestly hold. A schedule asking for five would have the night
screen forecast thorns the day could not deliver.

### Provisions

One-use purchases, spent on the next day only. Five of them, and **at most one
can be carried.**

That cap is the whole system. A stackable inventory needs quantities, a screen
to manage them, and balance against every combination, and it turns the night
screen into bookkeeping. One slot keeps the question small and sharp: given
what tomorrow holds, what is the single thing that would help most?

| Provision          | Effect                               | Base | Offered when |
| ------------------ | ------------------------------------ | ---- | ------------ |
| **Scout Bees**     | +45% pollen in every flower          | 55   | always       |
| **Waxed Trails**   | +8s route hold                       | 80   | always       |
| **Pruning Shears** | thorns start at half size, no spread | 65   | thorns       |
| **Smoke Pot**      | wasp reach ×0.45, safe zone ×1.9     | 70   | wasps        |
| **Early Rise**     | +12 seconds of daylight              | 45   | always       |

Rules that make it work rather than merely exist:

- **Never offered when it could not help.** Smoke on a day with no wasps is
  selling nothing, and one dud purchase costs the whole row its credibility.
  This also gives the shelf its own ramp: three options early, five once the
  field has thorns and wasps in it.
- **Priced at roughly half a first upgrade level, growing 1.15× per day** and
  capped. Flat pricing would be a real choice on day three and a rounding error
  on day fifteen, at which point the row stops asking anything.
- **Tap the packed one to put it back, at full price.** Nothing here should be a
  decision a misplaced thumb makes permanent. The refund happens before the
  charge, so swapping is one decision rather than a sequence to get right.
- **Spent at dawn and persisted immediately**, so a reload mid-transition gives
  the player the item they paid for exactly once.

Provisions also give honey a second sink. Before, early honey was only ever
"not enough for an upgrade yet".

### The forecast

The night screen now shows what tomorrow holds — flower count, thorns, wind,
wasps, rich blooms — plus its quota and the next unlock a few days out.

The progression track has been in this document since the first draft and was
never built. It earns its place twice over now: buying smoke is a coin flip
unless the player can see there are wasps tomorrow. The forecast turns the shelf
from a gamble into a read, which is the difference between a purchase the player
regrets and one they feel clever about.

### Escalation, reshuffled

Thorns took day 3, so everything after it moved a day later. The rule being
protected is one new element at a time with a quiet day after it, not any
particular day number.

| Day | New          | Thickets |
| --- | ------------ | -------- |
| 1   | —            | 0        |
| 2   | Splitting    | 0        |
| 3   | **Thorns**   | 1        |
| 5   | Wind         | 1        |
| 6   | —            | 2        |
| 7   | Wasps        | 2        |
| 9   | Rich patches | 2        |
| 10  | —            | 3        |
| 11  | Second wasp  | 3        |
| 12  | Night bloom  | 3        |

Thicket-count bumps land on days 6 and 10, chosen to miss every day that
introduces something. Count is intensity, not a new thing to learn — the same
reason flower count has never counted against the rule.

### Measured

A scripted competent player, drawing dog-legs around thorns and refreshing on a
timer, against the unchanged quota table:

| Day | Honey | Quota | Ratio |
| --- | ----- | ----- | ----- |
| 1   | 294   | 60    | 4.90  |
| 3   | 391   | 170   | 2.30  |
| 5   | 641   | 320   | 2.00  |
| 7   | 704   | 540   | 1.30  |
| 9   | 1552  | 850   | 1.83  |
| 11  | 998   | 1280  | 0.78  |

The bot refreshes far faster than a person, so a human landing near 1.0 is the
target — narrow wins and near misses from day four on, which is what the quota
table was always aiming for. Days 1 and 2 have no thorns and stay unmissable.
The dips at 7 and 11 are the wasps arriving, as intended.

---

## 16. Still unverified

Everything §10 and §14 flagged is still true — no real phone and no real Safari
has run this build. The additions above were verified in headless Chromium at
1280×720: thorns place and render, a straight drag into one is clipped at the
thicket edge, a full day 6 plays to a met quota, and packing and unpacking a
provision moves honey by exactly the right amount, with zero console errors.

---

## 18. Short sight, roads, and a board worth learning

The verdict on the previous build was that it still did not feel like a game:
_"the paths should mean something"_, and _"it doesn't feel like there is
scarcity or a talent needed"_. Both are correct, and they are the same problem
seen from two ends.

### What was actually wrong

**Information was free and routes were disposable.** The whole field was lit, so
the best flower was visible in the first frame and the drag was the execution of
a decision the eye had already made. And because every route decayed to nothing
in seconds, no route was ever a thing you owned — redrawing was a chore, not a
choice. There was nothing to _learn_ about the board and nothing to _keep_.

Four changes, and the point is that each one only works because of the others.

### 1. Short sight

The board starts dark. The hive lights its own neighbourhood; every bee carries
a small light; what is seen stays seen for the rest of the day.

**There is no scout button, because drawing into the dark already is one.** Bees
fly the line you drew and light it as they go. Find a flower and you have found
something worth having; find thorns and the route is cut, which is how you learn
they were there. The verb does not change.

Three rules keep it fair:

- **Fog only ever retreats within a day.** Re-scouting ground you already paid
  for is busywork wearing a mechanic's clothes.
- **Undiscovered flowers cannot be aimed at.** Aim assist snapping onto
  something invisible would hand back the information the dark was there to
  take away. The simulation still resolves them — a bee that reaches an unseen
  flower collects from it, which is exactly how exploring pays.
- **Day one is fully lit.** The first thirty seconds are untouched.

Implementation is a flat 24px grid — 1620 cells — pushed into a 54x30 canvas
texture stretched over the field with linear filtering, so the GPU's own
interpolation turns the grid into weather for the cost of one quad. It is
redrawn only when a cell actually changes.

### 2. Roads

A route accrues **strength** from traffic. Strength buys three things: it
retreats 75% slower, it takes 85% less of the wind, and bees fly it 35% faster.

That last pair is the direct answer to _"for the wind the path can be stronger
by doing something"_ — the something is using it.

**Extending a route keeps its strength; redrawing from the hive halves it.**
This is the first thing that gives the refresh gesture a _price_ rather than
just a shorter drag, which the design has wanted since the first playtest.

Two mistakes were worth the finding:

- **Strength must decay proportionally, not by a flat amount.** With both gain
  and loss constant there is no stable middle — a route either out-earns its
  decay and pegs at full or falls to nothing. Strength would have been a hidden
  boolean. Decaying a fraction of what is there gives a real equilibrium at
  `deliveries/s x perDelivery / decay`.
- **It has to be tuned as that equilibrium, not as a delivery count.** The first
  pass pegged any working route at full in about thirteen seconds, which made
  the road free rather than earned.

Tuned so a thin far line settles around a third strength, a middling one around
six tenths, and a short line carrying the whole swarm at full. **That is what
makes the split decision bite: three routes give three half-roads, one route
gives one real road.**

### 3. A bigger board, by moving the hive

The hive was in the middle, which caps a route at about 560px on a 1280x720
field. It now sits in the lower left, and the longest route is about 1100.

**Zooming a larger world out to fit was considered and rejected.** A 1.5x zoom
puts a flower's reach ring near 17 CSS pixels on a phone, well under what a
thumb reliably hits, and the design rules treat that as a rejection cause. A
corner hive doubles the depth without shrinking anything, and gives the board a
direction: there is a home and there is a frontier.

Only the **outer** edge of the flower band moves with the day. The inner edge
stays put, so there is always a near flower to fall back on — and that is also
what paces the fog, since day one's band sits inside the hive's light and each
day pushes a little more of the field past it. Roughly: everything lit on days
one and two, a third of the board by day four, one flower in five by day nine.

### 4. Distance pays

Yield ramps linearly with distance from the hive, 1x to 3.8x.

The arithmetic is the point, and it is worth stating exactly because it is what
turns distance from a cost into a decision. A round trip is `2L/speed`, so a
flower 3.8x further takes 3.8x as long to work and pays 3.8x per trip —
**identical honey per second**. What differs is that the same pool lasts 3.8x
longer. A far flower is not a better flower; it is a longer-lived one that costs
more to reach and more to hold. A near flower is the fallback that runs dry
fast.

The multiplier has to match the _distance ratio_, not a pleasing round number.
At 3x over a 3.85x span a far flower paid 22% less per second than a near one —
and with thorns, wasps and a bigger draw cost on top, nobody would ever have
gone out there and the whole map would have been decoration. A test pins the
rate flat across the whole ramp.

The flower's label is now **honey left** (`pool x yield`) rather than pollen.
Two flowers reading "180" can be worth 180 and 690, and asking the player to
multiply two figures mid-drag is arithmetic, not a decision.

The HUD also says how many flowers are **still out there**. Without it the
player cannot tell an unexplored corner from an empty one, and exploring becomes
superstition. It says there is something to find and never says where.

### Scout Bees changed jobs

The provision used to be "+45% pollen", which had nothing to do with scouting
and was the least interesting thing honey could buy. It now lights a wide radius
at dawn. On a dark board that is the most valuable one-off there is, and the
name finally describes what the item does.

### Bugs this pass found

- **A `maxCount: 5` retune landed on `route` instead of `bramble`**, silently
  capping simultaneous routes at three for a whole release. Both are restored.
- **Day one started completely dark.** Flowers spawned at 230-300 while the
  hive lit 340 — but reveal falls off to `edgeReveal` at the rim, so the
  _discovery_ radius was only 267. Sight is now sized against the threshold,
  not the radius.
- **A rich flower worth 2200 honey spawned seventy pixels from the hive.** The
  placement fallback walked out at a random angle and clamped onto the board,
  which with a corner hive drags the point back to an edge near home. Placement
  now degrades in stages and never gives up the inner bound — distance is what
  every other number on a flower is derived from.
- **Thickets could box a flower against the board edge.** A prune pass after
  placement drops any thicket that leaves a flower with no clear dog-leg, so the
  guarantee is structural rather than statistical.

### Measured

A simulated player who keeps three earning routes, runs at most one scout at a
time, refreshes by extending, and spends roughly what the run earns:

| Day | Honey | Quota | Ratio |
| --- | ----- | ----- | ----- |
| 1   | 297   | 60    | 4.95  |
| 2   | 405   | 110   | 3.68  |
| 4   | 954   | 470   | 2.03  |
| 6   | 1371  | 630   | 2.18  |
| 8   | 1886  | 920   | 2.05  |
| 10  | 2876  | 1400  | 2.05  |
| 12  | 2283  | 1900  | 1.20  |

Days one and two remain unmissable. A human at roughly 60% of this model lands
near quota from day four on, which is the narrow-win band the table exists for.

Two notes on the model, because both changed the answer:

- An earlier bot opened a scout route every quarter second and starved at almost
  zero honey. That is a **true fact about the game** — bees split evenly across
  live routes, so four lines into the dark means most of the swarm flying to
  nowhere — but it is not what a competent player does.
- An earlier bot banked more than half the honey it earned, which made the late
  game look unclearable when the real problem was that the model was not buying
  anything. Quotas are set against a player who spends; one who under-invests
  now stalls around day eight, which is the meta-progression working.

### Still unverified

Everything §10, §14 and §16 flagged. The additions above were verified in
headless Chromium at 1280x720: day one is fully lit with the hint line intact, a
day-nine board starts with one flower of six visible and the four richest in the
dark, a scouted line finds a flower worth 2220 against near ones worth 574 and
786, and three concurrent routes settle at visibly different strengths (1.0,
0.47, 0.16) — with zero console errors.

---

---

## 20. The screen, and a hive worth managing

Two reports from a real phone: the game did not fill the screen in landscape,
and the hive never felt like something being grown.

### The screen was wasting a third of the display

Reported as "lots of empty space on the sides" in landscape. §14 recorded this
as correct 16:9 letterboxing and measured 82% of width — that measurement
assumed Safari's chrome was hidden.

With the tab bar and toolbar showing, a landscape iPhone is roughly **2.8:1**,
not the 2.17:1 the raw screen suggests. Measured across real viewport shapes:

| Viewport                        | Aspect   | Screen used, before |
| ------------------------------- | -------- | ------------------- |
| Desktop 1920x1080               | 1.78     | 100%                |
| iPhone, no browser bars         | 2.17     | 82%                 |
| **iPhone, Safari bars showing** | **2.82** | **63%**             |
| iPad landscape                  | 1.54     | 87%                 |

**The canvas now takes the device's aspect** (clamped to 1.2–3.2) instead of
being locked to 16:9, and the **playfield stays a fixed 1280x720 centred inside
it**. Every viewport above now measures 100%.

Three things made this the right shape of fix rather than the obvious one:

- **Zooming a larger world out to fit was rejected.** At 1.5x a flower's reach
  ring lands near 17 CSS pixels on a phone, well under what a thumb reliably
  hits, and the design rules treat that as a rejection cause.
- **The playfield must not change size with the device.** This game balances on
  distance — yield, pool value and the whole near-versus-far decision are
  derived from it — so a bigger board on a wider phone would be a different
  game, not a better view of the same one. The extra space is background and
  HUD, never play area.
- **The HUD moved to the canvas edges** (`setScrollFactor(0)`), so on a wide
  screen it sits in the margin instead of over the board.

The camera is scrolled to centre the playfield rather than every object being
moved, so scenes stay authored against 1280x720 and nothing else had to know the
canvas grew. Pointer input is unaffected — `worldX/worldY` already account for
camera scroll, verified to within 1px on 2.82:1, 1.54:1 and 16:9.

Two details worth keeping:

- `trackViewportSize` re-derives the canvas on rotate. Its recursion guard is
  load-bearing: `setGameSize` emits RESIZE, so reacting to RESIZE by calling it
  again blows the stack.
- The geometry lives in a **Phaser-free** `canvasSize.ts`, so it unit tests in
  plain node — the same split the games use between simulation and renderer.
  The first version lived next to Phaser and could not be tested at all.

### Standing roads

The automation the brief asked for, and it is the payoff the strength system was
always pointing at: **a road worked hard enough stops decaying entirely.**

It needed no new state and no timer. Decay speed already scaled with strength;
past the threshold it is simply zero. And it is not immunity — strength still
decays without traffic, so a road abandoned for a flower that ran dry drops back
under the threshold and dies like anything else.

What it changes is the shape of a day: **build your arteries early, then spend
your hands on the frontier.** Tuned so roughly one or two roads can stand at
once and never all of them — if every route could stand there would be no
decision left, and if none could the dial would have no destination. Measured at
100-160 seconds of standing road per day by the mid-game.

A standing road gets the one binary readout in a system of gradients: a hard
bright edge. "This one no longer needs you" is a binary fact and the player has
to see it at a glance to decide where their hands go next.

### The hive charges rent

Standing roads remove work, so the difficulty had to move somewhere. It moved
into economics, which is where the brief wanted it: _"think about the hive as a
management style we should be improving"_.

**Every bee beyond the starting swarm costs honey per day.** The hive you were
given is free; the hive you built has to be fed. That single line turns Brood
Chamber from an auto-buy into a decision — six more bees is more throughput
every day _and_ a bill every day.

Two rules keep it a decision rather than a punishment:

- **It is charged against the day's honey, never against the quota.** Quota asks
  "did you work hard enough today"; upkeep asks "can you afford the hive you
  have built". If upkeep counted against quota, buying bees would make the day
  itself harder to pass, which is the opposite of what buying bees is for.
- **It can never exceed what the day earned.** Over-expanding costs progress,
  not a debt to climb out of.

It is shown as a line item — `2004 gathered − 240 to keep the hive = 1764` —
because a cost the player cannot see is a cost they cannot manage.

### Deeper Comb

A sixth upgrade, and deliberately **the only one that buys no output at all**:
it cuts the standing bill and raises the level cap on everything else.

That is what gives the night screen a spine. Five cards that all make the swarm
bigger or faster is a shopping list; a sixth that trades immediate output for
the ceiling to afford more output later is an allocation question, which is what
a management game is made of. At some point the only way forward is to stop
buying output and invest in the hive that can hold it.

The hive also visibly grows — glow and comb rings scale with total investment.
It was the thing the whole run is about and it never changed appearance no
matter how much was poured into it.

### Measured

Re-tuned against a simulated player who keeps three earning routes, scouts with
one, **refreshes from the tip** (keeping strength) and spends what the run earns:

| Day | Honey | Quota | Ratio | Upkeep | Standing |
| --- | ----- | ----- | ----- | ------ | -------- |
| 1   | 257   | 60    | 4.28  | 0      | 0s       |
| 3   | 364   | 300   | 1.21  | 53     | 12s      |
| 5   | 781   | 600   | 1.30  | 158    | 53s      |
| 7   | 1006  | 880   | 1.14  | 228    | 47s      |
| 9   | 1739  | 1220  | 1.43  | 269    | 125s     |
| 11  | 1924  | 1650  | 1.17  | 307    | 134s     |
| 12  | 2008  | 1900  | 1.06  | 250    | 163s     |

Days one and two remain unmissable. **Every day from three on is now genuinely
in doubt** even for the model — which is the "harder" the brief asked for, and
the difficulty is economic rather than manual.

One note on the model, because it changed the answer twice: an earlier version
refreshed by feeding `extendWith` a path from the _hive_ rather than from the
route's tip, which builds a zigzag out and back and halved the measured honey.
The bug was in the probe, not the game, but it would have driven a bad tuning.

### Still unverified

Everything §10, §14, §16 and §18 flagged. This pass was verified in headless
Chromium at 2.82:1, 2.17:1, 2.08:1, 1.54:1 and 16:9: every one uses 100% of the
viewport, input lands within 1px of the intended world point on all of them, a
road reaches standing and holds its length, the hive's bill appears as a line
item, and all six upgrade cards lay out without collision — with zero console
errors.

---

---

## 21. Success criteria

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
