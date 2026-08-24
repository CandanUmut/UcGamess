# Workflow

Two humans and several AI agents work in this repo at the same time. These
conventions exist so that parallel work does not collide and so that history
stays readable when we need to explain a metrics change six months later.

---

## Branches

Never commit to `main`. It is protected and requires CI to pass.

```
<type>/<short-description>
```

| Prefix    | For                               |
| --------- | --------------------------------- |
| `feat/`   | New player-facing capability      |
| `fix/`    | Bug fix                           |
| `game/`   | Work inside a single game         |
| `portal/` | Portal adapter or SDK integration |
| `perf/`   | Performance or build size         |
| `docs/`   | Documentation                     |
| `chore/`  | Tooling, dependencies, CI         |

Examples: `game/snowball-difficulty-curve`, `portal/verify-gamedistribution`,
`fix/safari-audio-unlock`.

Keep branches short-lived. A branch open longer than a week is a scope problem.

## Commits

[Conventional commits](https://www.conventionalcommits.org), enforced by
commitlint on the `commit-msg` hook.

```
<type>(<scope>): <subject>

[body: why, not what]
```

Types: `feat` `fix` `perf` `refactor` `docs` `test` `build` `ci` `chore` `game`
`portal`

Scope is the package or game: `core`, `portal`, `devtools`, `config`, or a game
slug.

```
feat(core): interpolate render position between fixed steps
fix(portal): restore audio when a rewarded ad errors
game(snowball): slow the difficulty ramp after round 8
perf(template): drop three unused Phaser plugins from the bundle
```

The body should say _why_. The diff already says what.

## Pull requests

Every change goes through a PR, including your own. The PR template embeds the
submission checklist — fill it in honestly; an unchecked box with a note is far
more useful than a checked one that is not true.

- Keep PRs reviewable. Under ~400 changed lines where possible.
- Run `pnpm verify` before opening. It runs exactly what CI runs.
- CI must be green to merge.
- Squash-merge, so `main` gets one clean conventional commit per change.

### Definition of done

A change is done when:

1. **CI is green** — typecheck, lint, format, unit tests, every portal build,
   size budget, license check, browser smoke test
2. **Tested in Safari**, not just Chrome
3. **Tested on a real phone**, not a resized desktop window
4. Player-facing changes have been played, not just compiled
5. Anything deferred is written into `docs/backlog.md`, not left in a comment

Items 2 and 3 cannot be automated and are the two that most often catch real
problems. Do not skip them because CI is green.

## Splitting work between humans and agents

The repo is structured so that work can be parallelised without coordination
overhead, because coordination is the scarcest resource at 10 hours a week.

**Suited to agents** — well-specified, verifiable by tests, contained:

- New adapters in `packages/portal` against documented SDK APIs
- Devtools and build tooling
- Test coverage
- Refactors with clear before/after behaviour
- Documentation

**Humans only** — needs judgement or a physical device:

- Whether a mechanic is fun
- Difficulty and economy tuning
- Art direction and style consistency
- Anything requiring a real phone or a real Safari
- Portal submissions and any commercial decision

**Either** — most feature work in `packages/core` or a game's systems.

### Avoiding collisions

- One agent per package or game at a time. The boundaries in the repo are the
  boundaries of a work item.
- File an issue with the task template before starting anything non-trivial.
  The "explicitly out of scope" field is the one that saves the most time.
- Agents must read `CLAUDE.md` before writing code. It is the architecture
  contract, not a summary.
- If an agent needs to touch both a game and `packages/core`, that is two PRs:
  `core` first, then the game.

## Secrets

**Never commit a secret.** `.gitignore` covers `.env*`, but the real protection
is not putting them in a file in the first place.

Portal credentials go in GitHub Actions secrets:

| Secret         | Used for                                                             |
| -------------- | -------------------------------------------------------------------- |
| `GD_GAME_ID`   | GameDistribution game id, surfaced to the build as `VITE_GD_GAME_ID` |
| `POKI_GAME_ID` | Poki game id, if a future SDK version requires one                   |

Locally, put them in an untracked `.env.local` in the game directory. Anything
prefixed `VITE_` is **embedded in the client bundle and is public** — only game
ids belong there, never an API key or a secret.

Add a new secret at _Settings → Secrets and variables → Actions_, and document
it in the table above in the same PR.

## Releases

1. Merge to `main`; the preview workflow publishes a playable build to GitHub
   Pages automatically
2. Work through `docs/submission-checklist.md` against that build
3. Tag: `git tag <game-slug>-v1.0.0 && git push --tags`
4. Build for the target portal: `node scripts/build.ts --portal crazygames --game <slug>`
5. Submit the artifact from `games/<slug>/dist`
6. Record the submission date and any portal feedback in the game's issue

## Dependencies

Every dependency is bytes in the build, and bytes are revenue. Before adding one:

1. Can this be 40 lines of our own code? (The compression plugin and both
   quality gates were, and are.)
2. Does it ship to the client, or is it dev-only? Dev-only is a much lower bar.
3. How big is it in the bundle? Check with `VISUALIZE=1 pnpm build`.

Runtime dependency versions are pinned in `pnpm-workspace.yaml` under `catalog:`
so a bump happens in one place. Packages reference `"catalog:"`, never a literal
version.
