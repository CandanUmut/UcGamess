# 0001. Phaser 4 as the game engine

- **Status:** Accepted
- **Date:** 2026-08-23
- **Deciders:** UC Games

## Context

We are a two-person studio with roughly 10 hours a week, publishing 2D HTML5
games to browser portals. We are strong in JavaScript/TypeScript and have
limited game engine experience.

The constraint that dominates every other consideration is **initial download
size**, because on these portals it converts directly into revenue:

- Poki's own data (Kasper Mol, W3C Games Workshop, "Size Matters") puts a
  ~10 MB initial download at roughly 80% conversion-to-play in the US.
- Poki targets **under 8 MB**.
- The Cannon Clash case study reached **81% conversion at 2.4 MB** across 76
  requests.

Secondary constraints: the engine must produce games that work correctly on
desktop Safari and mobile browsers, and the learning curve has to fit 10 hours a
week.

At decision time, npm showed Phaser **4.2.1** as `latest`, with the Phaser 3
line frozen at **3.90.0**.

## Decision

**Phaser 4 (4.2.1) with TypeScript**, pinned in `pnpm-workspace.yaml` under
`catalog:`.

## Alternatives considered

**Unity WebGL.** Rejected outright. The WebGL runtime alone starts at 15–25 MB
before any game content — roughly triple Poki's entire budget. Given that
download size maps linearly to conversion, this is disqualifying regardless of
Unity's other strengths. Many developers hit this wall and migrate to Phaser.

**Godot.** Clean web builds via GDScript (~5 MB for an empty project with
Brotli), but: C# web export is still not official as of 2026, and GDScript
investment does not transfer to anything else we do. For a team whose main
strength is web development, that is a real cost.

**Three.js / PlayCanvas.** The right answer if we needed 3D. PlayCanvas has a
1–2 MB runtime, a mature WebGPU path, and portal proof (Cannon Clash was built
with it). Our first three planned games are all 2D, so this is solving a problem
we do not have.

**Defold.** Genuinely strong: ~1.14 MB builds and an official Poki SDK
extension. Loses to Phaser only on ecosystem size and skill transfer — closer
than the others, and worth reconsidering if build size ever becomes the binding
constraint.

**Phaser 3 (3.90.0).** The obvious conservative choice, and it has a much larger
tutorial ecosystem — the official "Making your first Phaser game" tutorial and
both portals' integration guides target v3. It lost because the line is frozen
at 3.90.0 and receives maintenance only. Choosing a frozen major for a codebase
intended to run for years means planning a migration we would rather not
schedule. Phaser 4 also has a rewritten renderer with better tree-shaking, which
serves the constraint that decided this ADR in the first place.

We verified that the v4 API surface we depend on — `Phaser.Game`, `Scene`,
`Scale.FIT`, `Scale.CENTER_BOTH`, `GameConfig`, `FPSConfig` — is
compatible with the v3 shape those tutorials teach, so the ecosystem penalty is
smaller than the version number suggests.

## Consequences

**Good**

- Template game builds to **283 KB** of compressed initial download, leaving
  essentially the entire 5 MB budget for actual game content.
- TypeScript throughout; skills transfer both directions with our web work.
- Both Poki and CrazyGames publish Phaser integration guides and host live
  Phaser games.
- MIT licensed, mature community.
- On the maintained line, so no migration is scheduled.

**Bad**

- Fewer Phaser 4 tutorials than Phaser 3. Where a v3 tutorial differs, we have
  to read the v4 types — mitigated by the API compatibility noted above.
- Phaser 4 is newer, so we may hit engine bugs that a v3 user would not.
- 2D only. A 3D idea requires a second engine and a second set of portal
  integrations.

**Reversibility**

- Moving to another 2D engine means rewriting every game's scenes, but
  `packages/portal` is engine-independent and survives intact. `packages/core`
  is roughly half engine-independent — `FixedTimestep`, `SaveManager`,
  `Metrics` and the audio bus would all port.
- Moving from Phaser 4 back to 3, or forward to 5, is a much smaller change
  contained to `packages/core` and each game's scenes.

## Revisit if

- A game concept genuinely requires 3D → evaluate PlayCanvas for that game
  specifically, not for the studio.
- Build size becomes the binding constraint on a game we believe in → Defold is
  the credible alternative.
- Phaser 4 turns out to have stability problems that cost more time than the
  frozen-version risk of Phaser 3 would have.
