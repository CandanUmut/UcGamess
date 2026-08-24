# Claude Code Prompt — Bootstrap the Studio Monorepo

> Paste everything below into Claude Code in an empty directory.
> Replace `UC Games` / `ucgames` / `<GITHUB_ORG>` if the naming is different.

---

## ROLE AND OBJECTIVE

You are setting up the engineering foundation for a two-person web game studio called **UC Games**. We publish HTML5 games to browser game portals (CrazyGames first, then GameDistribution/GamePix/Y8 non-exclusively, Poki later and selectively).

Two humans and several AI coding agents will work in this repo simultaneously. Your job is to create a monorepo where a new game can be scaffolded in one command and shipped to a portal without re-solving any infrastructure problem, and where an agent picking up a task can figure out the rules from the repo alone.

Work through this in phases. After each phase, run the verification for that phase and report before continuing.

## HARD CONSTRAINTS (these came from market research — do not renegotiate them)

- **Engine: Phaser 3 with TypeScript.** Not Unity, not Godot, not Three.js for now. Reason: Unity's WebGL runtime alone is 15–25 MB; portals need small builds.
- **Initial download budget: under 5 MB target, 8 MB hard ceiling.** On Poki, download size maps directly to conversion-to-play, and conversion-to-play maps directly to revenue. This budget must be enforced by CI, not by discipline.
- **Time to interactive: under 5 seconds** on a throttled connection.
- **Every game must work on desktop Chrome, desktop Safari, and mobile browsers**, at 16:9 responsive, with touch and keyboard input adapting to the device. Safari breaks on WebGL context, audio autoplay, and touch events differently than Chrome — this is a known rejection cause.
- **Physics must use a fixed timestep.** Games that break on 120 Hz / 144 Hz monitors get rejected. Bake this into the shared game loop so no individual game can get it wrong.
- **Games must never implement their own ad timer.** Portals control ad frequency. The game only signals lifecycle events.
- **No clones, reskins, or asset flips.** Repo docs must state this as a hard rule.

## NON-GOALS (scope discipline — respect these)

We have roughly 10 hours per week. Infrastructure that does not help ship the first game is a liability. Do **not** build: a custom level editor, a custom asset pipeline beyond compression, a backend service, a multiplayer/netcode layer, an analytics dashboard, a launcher, or a shared UI component library beyond what game one actually needs. If you think something is needed but is not listed below, write it into `docs/backlog.md` instead of building it.

---

## PHASE 1 — Local environment

Detect the OS and shell first, then set up:

- Node.js (current LTS) via a version manager, with an `.nvmrc` pinning the version
- `pnpm` as the package manager (workspace support is the reason)
- Git configured, plus GitHub CLI (`gh`) if not present
- Verify the Phaser version currently on npm — **do not assume a version number, check it** — and pin it
- A `.vscode/extensions.json` recommending: ESLint, Prettier, TypeScript, and a live-server/preview extension

Verification: print installed versions of node, pnpm, git, gh. Confirm `pnpm --version` works from a fresh shell.

---

## PHASE 2 — Repository structure

Create a pnpm workspace monorepo:

```
ucgames/
├── packages/
│   ├── core/           # shared runtime: game loop, scaler, input, audio, save, scene base
│   ├── portal/         # portal SDK abstraction — the most important package
│   ├── config/         # shared tsconfig, eslint, prettier, vite base config
│   └── devtools/       # size-budget checker, build reporter, asset license validator
├── games/
│   └── _template/      # the scaffold every new game is cloned from
├── docs/
├── scripts/
├── .github/
└── (root config files)
```

Each game in `games/` is independently buildable and independently deployable. Games depend on `core` and `portal` by workspace reference. Games must **never** import a portal SDK directly — lint rule should enforce this.

---

## PHASE 3 — `packages/portal` (build this carefully)

Define a single interface that all games code against:

```ts
interface PortalAdapter {
  init(): Promise<void>;
  loadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(): Promise<void>; // interstitial, awaited
  rewardedBreak(): Promise<boolean>; // resolves true if reward earned
  saveData(key: string, value: unknown): Promise<void>;
  loadData(key: string): Promise<unknown>;
  getLocale(): string;
  isAdBlocked(): boolean;
}
```

Implement these adapters:

1. `LocalAdapter` — no-op/console-logging implementation used in development. Must simulate ad delays and reward outcomes so the game is testable offline. This is the default in dev.
2. `CrazyGamesAdapter` — our first shipping target.
3. `PokiAdapter` — second target.
4. `GameDistributionAdapter` — stub is acceptable, mark clearly.

**Important:** fetch the real SDK documentation from `docs.crazygames.com` and `sdk.poki.com` before writing the adapters. Do not invent method names from memory. If you cannot reach the docs, write the adapter with clearly marked `TODO: verify against official docs` comments and list them in your final report — do not silently guess.

Adapter selection happens at build time via an env var (`PORTAL=crazygames pnpm build`), so the same game source produces per-portal builds. Audio must automatically duck/mute during `commercialBreak` and `rewardedBreak` at the adapter level, so no game has to remember.

---

## PHASE 4 — `packages/core`

Minimal shared runtime, only what game one needs:

- **Fixed-timestep game loop wrapper** over Phaser, decoupling physics from render rate
- **Responsive scaler**: 16:9 with safe-area handling, correct on mobile portrait/landscape and desktop
- **Input abstraction**: unified pointer/touch/keyboard, auto-detecting device and exposing one API
- **Audio manager**: single mute bus, respects portal ad ducking, handles Safari's autoplay restriction (unlock on first user gesture)
- **Save system**: localStorage with the portal's cloud save as an optional upgrade path, behind one interface
- **Boot/Preload/Menu/Game/GameOver scene base classes**, with the preload scene wired to `loadingFinished()`
- **Metrics helper**: local-only session length and conversion logging so we can self-check against portal thresholds before submitting

---

## PHASE 5 — `games/_template` and the scaffold command

A complete, playable-but-trivial game that already passes every quality gate. It should demonstrate the full lifecycle: preload → menu → gameplay → game over → restart, with one interstitial and one rewarded call in correct positions.

Add `scripts/create-game.ts` wired to `pnpm create-game <slug>` that copies the template, renames the package, and registers it in the workspace.

Build tooling: Vite + TypeScript, Terser minification, asset compression, brotli/gzip output, bundle visualization on demand.

---

## PHASE 6 — Quality gates

Write `packages/devtools/size-budget.ts` that measures the compressed initial payload and **fails with a non-zero exit code** above 5 MB (warn) and 8 MB (fail). Wire it into the build so it cannot be skipped.

Write `packages/devtools/check-licenses.ts` that scans each game's `assets/` directory and fails if any asset is missing an entry in that game's `assets/LICENSES.md`. Every asset needs: source, author, license, URL, and — if AI-generated — the tool and prompt used. This matters legally: fully AI-generated assets have no copyright protection in the US, and Poki's AI policy requires provenance.

GitHub Actions workflows:

- `ci.yml` — typecheck, lint, unit tests (Vitest), build all games, size budget, license check
- `preview.yml` — deploy each game's build to GitHub Pages for playtesting and sharing with the teammate
- Playwright smoke test: game boots, reaches the menu, no console errors

---

## PHASE 7 — Documentation (write real content, not placeholders)

- `README.md` — what the studio is, how to clone-install-run in under five minutes
- `CLAUDE.md` (root) — the operating manual for AI agents: architecture, the hard constraints above, what is out of scope, where to put new code, and the rule that portal SDKs are only touched inside `packages/portal`
- `docs/strategy.md` — the problem (browser game portals have huge distribution but a high quality bar), our approach (ship non-exclusive to CrazyGames first, port cheaply to other portals, evaluate Poki exclusivity only for a proven hit), and why Phaser
- `docs/design-rules.md` — one core mechanic per game; playable within 5 seconds of load; the first 30 seconds must teach without a tutorial wall; target average session over 3 minutes with at least 25% of sessions exceeding 3 minutes; target conversion-to-play above 70%; consistent art style beats asset variety
- `docs/portal-requirements.md` — per-portal technical requirements, revenue split, exclusivity terms, payout thresholds
- `docs/submission-checklist.md` — the pre-submission rejection-risk checklist, as markdown checkboxes
- `docs/workflow.md` — branch naming, conventional commits, PR rules, how work is split between two humans and multiple agents, definition of done (includes: passes CI, passes submission checklist, tested on Safari and a real phone)
- `docs/assets.md` — approved sources (Kenney and other CC0 first), font rules (embedding rights required, Google Fonts as the safe default), AI asset policy and provenance requirements
- `docs/roadmap.md` — see below
- `docs/adr/0001-engine-choice.md` — architecture decision record template plus the first entry
- `docs/backlog.md` — where deferred ideas go

`.github/` — PR template that includes the submission checklist, plus issue templates for `game-idea`, `bug`, and `task`.

---

## PHASE 8 — Roadmap

Write `docs/roadmap.md` with three planned games and a 90-day plan:

- **Game 1 — physics-based casual skill game.** One clear mechanic, short session loop, touch-friendly. Chosen for lowest risk and the cleanest "finished" feel. Target ~120–180 hours.
- **Game 2 — trend-driven puzzle/merge.** Fast production, rides a current trend, requires an original twist rather than a clone. Target ~100–150 hours.
- **Game 3 — idle/incremental.** Code-heavy, art-light, high retention, natural fit for rewarded video. Target ~150–250 hours.

90-day plan: weeks 1–2 environment and Phaser fundamentals plus developer accounts; weeks 3–4 freeze game 1 scope and build the core loop; weeks 5–6 polish to "finished," mobile and responsive; week 7 integrate the CrazyGames adapter and submit to Basic Launch; week 8 read soft-launch metrics and push the same build to non-exclusive portals; weeks 9–12 iterate on metrics, set up the payout pipeline; week 13 game 1 live, start game 2 concept.

Include a "kill criteria" section: what metric result means we stop iterating on a game and move to the next one.

---

## PHASE 9 — Git and GitHub

Initialize the repo, sensible `.gitignore`, conventional-commit setup, and an initial commit. Then create the GitHub repository under `<GITHUB_ORG>` as **private**, push, enable Actions, and set up branch protection on `main` requiring CI to pass.

Do not commit any secrets. If a portal SDK key is needed later, document it as a GitHub Actions secret in `docs/workflow.md`.

---

## RULES FOR YOU (the agent)

- **Verify, don't assume.** Check current package versions on npm and read the actual portal SDK docs. Where you could not verify something, say so explicitly in your final report rather than producing confident-looking wrong code.
- **Prefer fewer dependencies.** Every dependency is bytes in the build, and bytes are revenue.
- **Working code over scaffolding.** At the end, `pnpm install && pnpm dev` must open a playable template game in the browser, and `pnpm build` must produce a size-checked artifact. If you have to choose between finishing the docs and making the build actually work, make the build work.
- Ask before installing anything global or modifying shell config outside a version manager.

## FINAL REPORT

When done, report: (1) what was installed and the versions, (2) the commands to run dev, build, test, and scaffold a new game, (3) every `TODO: verify` you left and why, (4) anything you deliberately deferred to `docs/backlog.md`, (5) the repo URL.
