# 0002. Build-time portal adapter selection

- **Status:** Accepted
- **Date:** 2026-08-23
- **Deciders:** UC Games

## Context

Our strategy depends on writing a game once and shipping it to several portals:
CrazyGames first, then GameDistribution / GamePix / Y8 non-exclusively, and Poki
selectively. The second portal is only cheap if the game itself contains no
portal-specific code.

Each portal's SDK is different in shape, not just in naming:

|                   | CrazyGames                                                         | Poki                                                  |
| ----------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| Ads               | callback-based `requestAd(type, {adStarted, adFinished, adError})` | promise-based `commercialBreak()` / `rewardedBreak()` |
| Cloud save        | yes (`data.*`, localStorage-shaped)                                | **none**                                              |
| Locale            | `user.systemInfo.locale`                                           | **none**                                              |
| Adblock detection | `ad.hasAdblock(): Promise<boolean>`                                | **none**                                              |

A game cannot paper over those differences itself without becoming
portal-specific, which is exactly what we are trying to avoid.

## Decision

Every game codes against a single `PortalAdapter` interface exported from
`packages/portal`. **Which adapter is compiled in is decided at build time** by
the `PORTAL` environment variable, implemented as a Vite plugin that rewrites
module resolution for `active-adapter.ts`.

ESLint forbids games from importing any portal SDK package or touching an SDK
global.

## Alternatives considered

**Runtime detection** (sniff the parent frame's origin and pick an adapter).
Rejected on size: every bundle would contain all four SDK wrappers. It is also
fragile — a portal changing how it embeds games silently breaks ad revenue with
no build-time signal.

**Runtime `switch` on a build-time constant.** This was the first
implementation, on the assumption that Vite's `define` substitution plus
Rollup's dead-code elimination would tree-shake the unused adapters. **We
measured it and it does not.** A `local` build contained the strings `PokiSDK`,
`sdk.crazygames.com` and `gamedistribution` — the switch keeps a live reference
to all four adapter classes, so every SDK wrapper shipped in every bundle. This
is recorded because it is a reasonable-sounding assumption that is simply wrong.

**Dynamic `import()` per adapter.** Correct on size, but produces separate
chunks that all still get emitted, and adds an async boundary to boot — the one
part of startup where latency costs conversion directly.

**A third-party multi-portal layer** (e.g. Playgama Bridge). Would save writing
adapters, but adds a dependency between us and our revenue, and means our ad
behaviour is defined by someone else's release schedule. Four adapters is a few
hundred lines we fully control.

## Consequences

**Good**

- Verified isolation: each portal build contains exactly one adapter and none of
  the others' SDK URLs.
- Adding a portal is one adapter file plus one variant module. **No game
  changes.**
- Portal capability gaps are absorbed in one place — Poki's missing cloud save
  and locale become localStorage and `navigator.language` inside the adapter,
  and no game learns about it.
- Cross-cutting portal requirements are enforced centrally. Audio ducking during
  ads happens in the adapter via `audioBus`, so a game that never thinks about
  it still behaves correctly.
- Adapters degrade rather than throw, so an adblocked player still gets a
  working game.

**Bad**

- Four builds instead of one, and CI has to build each. Currently ~6s per build,
  so this is cheap.
- Module-resolution rewriting is less obvious than a plain `switch`. Mitigated
  by comments in `active-adapter.ts` and the plugin explaining why.
- The interface is a lowest-common-denominator. Portal-specific extras
  (CrazyGames' `happytime()`, invite links, leaderboards) are not exposed. When
  we want one, it goes on the interface as an optional method with a no-op
  default — not as a direct SDK call from a game.

**Reversibility**

- High. The interface is ten methods; a game only ever sees those. Changing the
  selection mechanism touches two files and no game.

## Revisit if

- A portal offers something valuable enough that lowest-common-denominator stops
  being acceptable — likely candidates are leaderboards or IAP.
- Build matrix time becomes a real cost as the number of games grows.
- A portal's SDK requires initialisation before page load, which this design
  cannot currently express.
