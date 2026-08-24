# CLAUDE.md — operating manual for agents working in this repo

You are working in the monorepo of **UC Games**, a two-person studio that
publishes HTML5 games to browser game portals. Several AI agents and two humans
work here in parallel. This file is the contract; everything below is enforced
by lint, CI, or code review.

Read `docs/strategy.md` for _why_ the studio makes these choices, and
`docs/design-rules.md` for what makes a game pass a portal review.

---

## Hard constraints — do not renegotiate these

These came from market research, not preference. They are recorded with their
reasons in `docs/adr/`.

1. **Engine: Phaser 4 with TypeScript.** Not Unity (its WebGL runtime alone is
   15–25 MB), not Godot, not Three.js.
2. **Initial download under 5 MB, hard ceiling 8 MB.** Enforced by CI, not by
   discipline. Download size maps directly to conversion-to-play, and
   conversion-to-play maps directly to revenue.
3. **Time to interactive under 5 seconds** on a throttled connection.
4. **Desktop Chrome, desktop Safari, and mobile browsers all work**, at 16:9
   responsive, with touch and keyboard adapting to the device. Safari breaks on
   WebGL context, audio autoplay and touch events differently from Chrome — this
   is a known rejection cause, not a nice-to-have.
5. **Physics uses a fixed timestep.** Games that break on 120/144 Hz displays
   get rejected. This is baked into `BaseGameplayScene` so no game can get it
   wrong — see "The fixed timestep" below.
6. **Games never implement their own ad timer.** Portals control ad frequency.
   The game only signals lifecycle events.
7. **No clones, reskins, or asset flips.** Both major portals reject these
   outright. Take a mechanic and make it original; do not ship something
   confusable with an existing game by name or iconography.

---

## Architecture

```
packages/
  core/       shared runtime — game loop, scaler, input, audio, save, scene bases
  portal/     portal SDK abstraction — the most important package
  config/     shared tsconfig, eslint, prettier, vite base config
  devtools/   size-budget checker, license validator
games/
  _template/  the scaffold every new game is cloned from
  <slug>/     one directory per game, independently buildable and deployable
docs/         strategy, design rules, portal requirements, workflow, ADRs
scripts/      create-game, build, preview assembly
```

Games depend on `core` and `portal` by workspace reference. Each game builds and
deploys independently.

### The portal boundary — the rule that matters most

**A game must never import or reference a portal SDK.** Not `@poki/sdk`, not
`window.CrazyGames`, not `window.PokiSDK`. ESLint enforces this
(`packages/config/eslint.config.js`) and the rule exists because the whole
business model depends on it: one game source produces per-portal builds, so a
game that ships on CrazyGames can go to Poki and GameDistribution for almost no
work. A direct SDK reference silently breaks that, and it does not fail until a
build for a _different_ portal reaches submission.

Games talk to portals through one interface:

```ts
interface PortalAdapter {
  init(): Promise<void>;
  loadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(): Promise<void>;
  rewardedBreak(): Promise<boolean>;
  saveData(key: string, value: unknown): Promise<void>;
  loadData(key: string): Promise<unknown>;
  getLocale(): string;
  isAdBlocked(): boolean;
}
```

Adapter selection happens **at build time**, via the `PORTAL` env var. A Vite
plugin swaps the adapter module during resolution, so only one adapter ends up
in the bundle. Do not replace this with a runtime switch — a switch keeps a live
reference to all four adapter classes and ships every SDK wrapper in every
bundle. (This was measured, not assumed.)

**If you are adding portal support, everything you touch is inside
`packages/portal`.** Nothing else.

### The fixed timestep

`BaseGameplayScene.update()` is effectively final. Simulation goes in
`fixedUpdate(dt)`, which always receives the same `dt` regardless of display
refresh rate. Visual-only work goes in `renderUpdate(alpha)`.

Any code shaped like `x += speed` inside a raw `update()` has the 144 Hz bug: it
looks perfect on the author's 60 Hz laptop and runs at 2.4x on a reviewer's
high-refresh monitor. `setInterval` and `requestAnimationFrame` are banned in
games by lint for the same reason.

### Audio ducking

Portals require game audio to be silent while an ad plays. Adapters flip
`audioBus` around every ad call, and `AudioManager` in core subscribes to it. A
game that never thinks about audio during ads still behaves correctly. Do not
add per-game muting logic around ad calls.

---

## Where new code goes

| What you are adding                   | Where it goes                          |
| ------------------------------------- | -------------------------------------- |
| Anything touching a portal SDK        | `packages/portal` — nowhere else, ever |
| Runtime a second game would also need | `packages/core`                        |
| Something only this game needs        | that game's `src/`                     |
| A build gate or check                 | `packages/devtools`                    |
| Shared lint/tsconfig/vite settings    | `packages/config`                      |
| An idea we are not building now       | `docs/backlog.md`                      |

When unsure between `core` and a game: put it in the game. Moving code into
`core` later is easy; removing a premature abstraction that two games have
already bent around is not.

---

## Out of scope — do not build these

We have roughly 10 hours a week between two people. Infrastructure that does not
help ship the current game is a liability. Do **not** build:

- a custom level editor
- an asset pipeline beyond compression
- a backend service of any kind
- a multiplayer or netcode layer
- an analytics dashboard (the local `Metrics` helper is the whole scope)
- a launcher
- a shared UI component library beyond what the current game actually needs

If you believe one of these is needed, write it into `docs/backlog.md` with the
reasoning. Do not build it.

---

## Working agreements

- **Verify, don't assume.** Check package versions against npm and read the
  actual portal SDK docs before writing an adapter. Where something could not be
  verified, mark it `TODO: verify against official docs` and say so in your
  summary rather than producing confident-looking wrong code. The
  GameDistribution adapter is currently in this state — read its header.
- **Prefer fewer dependencies.** Every dependency is bytes in the build, and
  bytes are revenue. The compression plugin and both quality gates are
  hand-written for this reason.
- **Working code over scaffolding.** `pnpm install && pnpm dev` must open a
  playable game. `pnpm build` must produce a size-checked artifact. If you have
  to choose between finishing documentation and making the build work, make the
  build work.
- **Run `pnpm verify` before opening a PR.** It runs typecheck, lint, tests,
  builds, and the license check — the same gates CI runs.
- **Conventional commits.** See `docs/workflow.md`.

## Commands

```bash
pnpm install                      # set up
pnpm dev                          # run the template game
pnpm build                        # build every game (local adapter)
node scripts/build.ts -p poki     # build every game for a specific portal
pnpm test                         # unit tests
pnpm test:e2e                     # browser smoke tests
pnpm verify                       # everything CI runs
pnpm create-game <slug>           # scaffold a new game
```
