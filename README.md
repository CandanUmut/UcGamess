# UC Games

A two-person studio building HTML5 games for browser game portals — CrazyGames
first, then GameDistribution / GamePix / Y8 non-exclusively, and Poki later and
selectively.

This is the studio monorepo. A new game is one command away, and shipping it to
a portal does not require re-solving any infrastructure problem.

**Stack:** Phaser 4 · TypeScript · Vite · pnpm workspaces

---

## Running it in under five minutes

You need [Node 24](https://nodejs.org) (the version in `.nvmrc`) and
[pnpm 11](https://pnpm.io).

```bash
git clone https://github.com/CandanUmut/UcGamess.git
cd UcGamess

# If you use nvm / fnm:
nvm use            # or: fnm use

# Enable pnpm (ships with Node, no install needed):
corepack enable pnpm

pnpm install
pnpm dev
```

That opens the template game at <http://localhost:5173> — a complete, playable
game with the full lifecycle wired up: preload → menu → gameplay → game over →
restart, with an interstitial and a rewarded video in the correct positions.

The dev server binds to your LAN, so you can open the same URL on a phone. Do
that early and often — most of what portals reject shows up on mobile first.

## Commands

| Command                                     | What it does                                               |
| ------------------------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                                  | Run the template game with hot reload                      |
| `pnpm build`                                | Build every game (development portal adapter)              |
| `node scripts/build.ts --portal crazygames` | Build every game for a specific portal                     |
| `pnpm preview`                              | Serve the built game locally                               |
| `pnpm test`                                 | Unit tests (Vitest)                                        |
| `pnpm test:e2e`                             | Browser smoke tests (Playwright: Chromium, WebKit, mobile) |
| `pnpm typecheck`                            | TypeScript across the workspace                            |
| `pnpm lint`                                 | ESLint, including the portal-SDK firewall                  |
| `pnpm verify`                               | Everything CI runs — do this before opening a PR           |
| `pnpm create-game <slug>`                   | Scaffold a new game from the template                      |

### Making a new game

```bash
pnpm create-game snowball-rush
pnpm install
pnpm --filter @ucgames/game-snowball-rush dev
```

You get a playable game that already passes every quality gate. Start by
replacing the mechanic in `src/scenes/GameScene.ts`.

## How it fits together

```
packages/
  core/       game loop, responsive scaler, input, audio, save, scene bases
  portal/     the portal SDK abstraction — one interface, four adapters
  config/     shared tsconfig, eslint, prettier, vite config
  devtools/   size budget and asset license gates
games/
  _template/  the scaffold
docs/         strategy, design rules, portal requirements, workflow
```

Two things are worth knowing up front:

**Games never touch a portal SDK.** They code against one `PortalAdapter`
interface; which adapter gets compiled in is decided by the `PORTAL` env var at
build time. That is what makes the same game source shippable to four portals.
ESLint fails the build if a game imports an SDK directly.

**Physics runs on a fixed timestep.** Simulation lives in `fixedUpdate(dt)`
where `dt` never varies, so a game behaves identically on a 60 Hz laptop, a
144 Hz monitor and a throttled phone. Games that break on high-refresh displays
are a documented portal rejection cause.

## Quality gates

CI blocks a merge on all of these:

- **Size budget** — warns over 5 MB, fails over 8 MB of compressed initial
  download. Every megabyte costs conversion-to-play, which costs revenue.
- **Asset licenses** — every shipped asset needs source, author, license, URL,
  and AI provenance in that game's `assets/LICENSES.md`.
- **Typecheck, lint, format, unit tests**
- **Builds for every portal** — a break that only appears under `PORTAL=poki`
  should not wait until submission week to be found.
- **Browser smoke test** — boots, reaches the menu, no console errors, in
  Chromium, WebKit and a mobile viewport.

## Documentation

| Document                                                     | What it covers                                            |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| [CLAUDE.md](CLAUDE.md)                                       | Operating manual for AI agents and the architecture rules |
| [docs/strategy.md](docs/strategy.md)                         | The market, our approach, why Phaser                      |
| [docs/design-rules.md](docs/design-rules.md)                 | What makes a game pass a portal review                    |
| [docs/portal-requirements.md](docs/portal-requirements.md)   | Per-portal specs, revenue splits, payout terms            |
| [docs/submission-checklist.md](docs/submission-checklist.md) | Pre-submission rejection-risk checklist                   |
| [docs/workflow.md](docs/workflow.md)                         | Branches, commits, PRs, how work is split                 |
| [docs/assets.md](docs/assets.md)                             | Approved sources, font rules, AI asset policy             |
| [docs/roadmap.md](docs/roadmap.md)                           | Three games, the 90-day plan, kill criteria               |
| [docs/backlog.md](docs/backlog.md)                           | Deferred ideas                                            |
| [docs/adr/](docs/adr/)                                       | Architecture decision records                             |

## License

Private. All rights reserved.
