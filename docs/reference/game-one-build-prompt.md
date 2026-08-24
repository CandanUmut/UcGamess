# Claude Code Prompt — Game One: "Beeline" (working title)

> Run this inside the studio monorepo, after the bootstrap prompt has completed.
> Working title only — verify the final name isn't confusable with an existing portal game before submission.

---

## ROLE

You are building UC Games' first shipping title. It targets CrazyGames Basic Launch first, then non-exclusive distribution to other portals.

This is a **staged build with a hard gate after Stage 2**. Do not build the whole game in one pass. Stop where instructed and wait for human playtesting, because the entire game rests on whether one interaction feels good, and no amount of downstream work saves it if it doesn't.

Read `CLAUDE.md`, `docs/design-rules.md`, and `docs/submission-checklist.md` first. Every constraint there applies here. Use `pnpm create-game beeline` to scaffold — do not hand-roll the project structure.

---

## THE GAME

**One sentence:** You draw flight routes from your hive to flower patches, and your swarm follows the lines you draw.

**The core verb is drawing, not tapping upgrade buttons.** This is what separates the game from every idle colony game on these portals. Protect it.

### The loop, in detail

**Moment to moment.** The hive sits on screen. Flower patches appear around it. The player drags a finger or mouse from the hive outward to a patch, leaving a visible route. Bees stream along it, collect nectar, return, and deposit honey. Multiple routes can exist at once.

Three pressures make this a game rather than a screensaver:

1. **Routes decay.** A drawn route fades over time and stops carrying bees when it dies. The player must refresh routes — this is what keeps hands on the screen instead of watching.
2. **Patches deplete.** A worked patch runs dry and a new one blooms elsewhere. Routes must be redrawn to new targets, constantly.
3. **The swarm is finite.** Bees split across active routes. Four routes means each carries a quarter of the swarm. Choosing between one strong route and several weak ones is the central decision.

**Session shape.** The game runs in short "days" of roughly 60–90 seconds, each with a honey quota. When the day ends, night falls: the player sees the day's honey, spends it on hive upgrades, and starts the next day. This structure exists for four reasons — it creates a natural "one more day" hook, it gives upgrades a rhythm, it produces clean ad break points, and it makes sessions measurable against the portal's 3-minute threshold.

**Escalation.** Introduce exactly one new element every couple of days, never two at once:

- Wind that bends routes off course, so straight lines stop being optimal
- Wasps that intercept bees on long routes, making distance a real cost
- Rich patches that sit far away, forcing a risk/reward call
- Night-blooming flowers that only pay during a short window

**Meta progression.** Honey buys: swarm size, bee speed, carry capacity, route persistence (slower decay), and hive capacity. Route persistence should feel like the most valuable upgrade, because it directly buys the player relief from the core pressure.

### First thirty seconds (design this before you design anything else)

- Honey must be earned within about ten seconds of the game becoming interactive.
- No tutorial screen, no text wall. A pulsing hint line from hive to the nearest patch teaches the drag by showing it. It disappears the moment the player drags.
- Day one has one patch, no wind, no wasps, and a quota that is nearly impossible to miss.
- The swarm must look alive from the first frame — bees drifting near the hive before any route exists.

### Retention hooks

- Offline accrual: returning players see honey collected while away, claimable on arrival.
- Day quotas set slightly above comfortable, so most days end in a near miss or a narrow win.
- A visible progression track showing the next unlock two or three days ahead.
- Persistent best-day record.

---

## AD INTEGRATION

Through `packages/portal` only. Never import a portal SDK in game code.

- `loadingFinished()` when the preload scene completes
- `gameplayStart()` when a day begins; `gameplayStop()` when it ends
- `commercialBreak()` before starting the next day — only after the player has pressed the button, since that signals intent to continue
- `rewardedBreak()` for: doubling the day's honey, extending a day by fifteen seconds after a missed quota, and a temporary swarm boost. Every rewarded offer must have a plain "no thanks" path that continues the game.
- No custom ad timer anywhere. The portal controls frequency.
- Audio ducks during ad calls via the core audio manager — do not reimplement.

---

## STAGED BUILD

### Stage 1 — Design document

Write `games/beeline/DESIGN.md` covering: the loop, the day structure, the escalation schedule day by day, the full upgrade list with cost curves, the tuning constants table (bee speed, decay rate, patch yield, swarm size, quota curve) as a single exported config object, and the cut list (see Scope Freeze below). Report back before writing code.

### Stage 2 — The feel prototype **(HARD GATE)**

Build only this, with zero art and zero UI:

- Drag input producing a smooth route, working identically with mouse and touch
- Several hundred bees steering along routes, with natural-looking spread rather than a rigid line
- Route decay and visual fade
- Bees collecting from a patch and returning to the hive
- A frame-rate counter and an on-screen agent count

Everything drawn with Phaser graphics primitives and generated textures. No sprites, no sound, no menu, no upgrades, no day cycle.

**Then stop and report.** Two humans need to play this before anything else is built. If drawing routes doesn't feel good here, no amount of art or progression will save it, and we would rather learn that in week one than week six.

Performance target at this stage: 60fps on a mid-range phone with 300+ agents. Use a fixed timestep from `packages/core`. If you cannot hit the target with individual sprites, switch to a GPU sprite layer or a custom particle approach and report what you did.

### Stage 3 — The full loop

Day cycle, quotas, night/upgrade screen, save via the portal adapter, offline accrual, the escalation schedule, and the local metrics helper logging session length and day count.

### Stage 4 — Polish and submission readiness

Juice (trail effects, collection pops, screen feedback), audio, portal adapter wiring, full pass on the submission checklist, Safari and real-device testing.

---

## SCOPE FREEZE

In v1 and not negotiable: routes, patches, days, quotas, five upgrades, wind, wasps.

Explicitly **cut** — write these to `docs/backlog.md`, do not build them: multiple hives, a map or world progression, bee types or classes, a story or characters, achievements, leaderboards, daily rewards, a settings menu beyond mute, localisation, and cosmetic unlocks. If you believe something here is essential, say so in your report rather than building it.

---

## ASSET ROADMAP

Produce `games/beeline/ASSETS.md` as a working plan, and follow it. Structure:

```
games/beeline/
├── assets/
│   ├── sprites/        # source images, one texture atlas output
│   ├── audio/          # music and sfx, both formats
│   ├── fonts/          # subsetted woff2 only
│   └── LICENSES.md     # every file, no exceptions
└── src/
```

### Principle: placeholder-first, and placeholders must be shippable

Stage 2 uses **no external assets at all** — Phaser primitives and runtime-generated textures. Every asset below is an upgrade to something that already works, never a blocker. If art never arrives, the game still ships, just plainer.

### Byte budget (design to these, don't discover them)

Allocate against the 5 MB target with the engine bundle taking its share. Proposed split, adjust in `ASSETS.md` if you measure differently and say why:

| Category                        | Budget    |
| ------------------------------- | --------- |
| Engine + game code (compressed) | ~2.5 MB   |
| Sprites (single atlas)          | ≤ 400 KB  |
| Audio (all files)               | ≤ 600 KB  |
| Font (subsetted)                | ≤ 80 KB   |
| Headroom                        | remainder |

Audio is the most common budget killer. Treat 600 KB as real.

### What we actually need

**Sprites** — deliberately tiny, because the visual identity is motion and trails, not illustration:

- Bee: a single small dot or teardrop, 8–16px. Rotation and colour tint do the work.
- Trail/route segment: one soft gradient strip, tiled and faded in code.
- Flower patch: three or four variants, roughly 64px, differing mainly in colour.
- Hive: one sprite, roughly 128px.
- Honey droplet and a small wasp silhouette.
- UI: one nine-slice panel, one button, three or four icons.

All of it in **one texture atlas**, WebP with PNG fallback. Nothing over 128px. Generate the atlas as a build step, not by hand.

**Audio** — five sounds and one loop, mixed quiet:

- Ambient hive hum (short seamless loop, the longest file)
- Nectar collection blip (pitch-varied in code so one file sounds like many)
- Route draw whoosh
- Day end chime
- Upgrade purchase
- Wasp warning

Ship `.webm`/Opus with an `.m4a` fallback for Safari. Unlock audio on first user gesture through the core audio manager.

**Font** — one variable font, OFL or Apache licensed, subsetted to the characters actually used, woff2 only. Google Fonts is the safe default. Numerals must be tabular so counters don't jitter.

### Sourcing order

1. Generated in code (gradients, dots, glows) — free, zero bytes, first choice
2. Kenney CC0 — no attribution required, unrestricted commercial use
3. Other CC0 sources, license verified per file
4. Paid or AI-generated — last resort, and only with provenance recorded

### LICENSES.md is mandatory

Every file in `assets/` needs an entry: filename, source, author, license, URL, and date added. AI-generated assets additionally need the tool and the prompt, since fully AI-generated work has no copyright protection in the US and Poki's AI policy requires provenance. The CI license check fails the build on any unregistered file — do not work around it.

---

## SUCCESS CRITERIA

Before this is considered submission-ready:

- Average session over 3 minutes with at least a quarter of sessions exceeding it, measured with the local metrics helper on real playtesters, not estimated
- Initial download under 5 MB, interactive in under 5 seconds
- 60fps on a mid-range phone; never below 30
- Correct on desktop Chrome, desktop Safari, and at least one real iPhone and one real Android
- Physics and decay behave identically at 60Hz and 144Hz
- Zero console errors
- The full submission checklist passes

---

## REPORT AFTER EACH STAGE

What you built, what you measured (bundle size, frame rate, agent count), what you cut and why, anything you could not verify, and what you need from the humans before continuing.
