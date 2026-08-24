# Backlog

Ideas we have deliberately **not** built. This file exists so that "we should
also…" has somewhere to go that is not the codebase.

At 10 hours a week, infrastructure that does not help ship the current game is a
liability. Something moves off this list when a real game needs it — not when it
would be nice to have.

Format: what it is, why it was deferred, and **what would make us build it**.

---

## Deferred during repo setup (2026-08-23)

### Portal adapters beyond the first four

GamePix, Y8, Yandex Games, GameMonetize.

**Why deferred:** we have no game to put on them yet, and each adapter is dead
code until we do.

**Build when:** game 1 is live on CrazyGames and we want non-exclusive
distribution. Yandex is the most interesting of these — it reportedly gives
detailed moderation feedback with screenshots, which is genuinely useful for
learning what reviewers look at.

**Cost:** roughly one file each in `packages/portal`, plus an entry in the
portal list. No game changes.

### GameDistribution adapter verification

The adapter exists but is a **marked stub** — `gamedistribution.com` returned
404 for its SDK docs during setup, so the script URL, event name strings and
rewarded flow were reconstructed from the GD-HTML5 wiki and carry
`TODO: verify` markers.

**Build when:** before any GameDistribution submission. Needs someone to read
the live docs or run a real integration.

### Leaderboards

CrazyGames has a leaderboard API; Poki does not.

**Why deferred:** none of the three planned games needs one, and it would be the
first thing to break the lowest-common-denominator `PortalAdapter` interface.

**Build when:** a game's retention would plausibly improve with one. Add as an
optional interface method with a no-op default — never as a direct SDK call from
a game.

### In-app purchases

Both CrazyGames and Poki support IAP through Xsolla, by invitation.

**Why deferred:** invitation-only, and rewarded video plus interstitial is where
the money is for a new developer. IAP is a distraction until a game has an
audience.

**Build when:** a game is earning enough to be invited, and has something worth
selling.

### Asset pipeline beyond compression

Automatic sprite-sheet packing, texture atlases, audio transcoding.

**Why deferred:** the template ships one 477-byte asset. This is a solution
without a problem.

**Build when:** a game's asset directory is genuinely slowing us down, or the
size budget is being missed because of unpacked sprites.

### Shared UI component library

Buttons, dialogs, HUD elements shared across games.

**Why deferred:** premature. We have one game. Two games would let us see what
is _actually_ common, rather than guessing.

**Build when:** game 2 is underway and we find ourselves copying the same UI
code a third time. Copy twice, extract on the third.

### Analytics beyond the local Metrics helper

**Why deferred:** explicitly out of scope. Portals provide the metrics that
matter, and the local `Metrics` helper covers pre-submission self-checking. A
dashboard is a product we would have to maintain.

**Build when:** probably never. If we need more, the portal dashboards are the
answer.

### Localisation

`getLocale()` exists on the adapter and nothing uses it.

**Why deferred:** the first games should be understandable with almost no text.
If a game needs translating to be playable, that is a design smell.

**Build when:** a game finds an audience and portal data shows a large
non-English player base. String extraction is straightforward once there is a
reason.

### Automated visual regression testing

**Why deferred:** the Playwright smoke test covers "boots, reaches the menu, no
console errors", which is the part that maps to rejections. Screenshot diffing
on a game with animation and randomness would mostly generate false positives.

**Build when:** we have a UI that is stable enough for diffs to be meaningful.

### Multiplayer / netcode

**Why deferred:** hard constraint — explicitly out of scope. Server costs plus
netcode complexity is high risk for a two-person team, and `.io` games are the
most saturated category on these portals.

**Build when:** not in the current strategy. Revisit only if the studio is
profitable and can absorb the risk.

---

## Cut from Beeline v1 (2026-08-24)

These come from the game one scope freeze. They are cut from **v1 of Beeline**,
not from the studio — several are reasonable for a later version or a different
game. See `games/beeline/DESIGN.md` §9.

The shared reason: Beeline's core verb is _drawing routes_. Everything below
either adds a second verb, moves attention off the field, or adds surface area
before the one mechanic has proven it holds a player for three minutes.

### Multiple hives

**Why cut:** splits attention across the field and doubles the route-management
load. The interesting decision is already "which patches, with how much swarm" —
a second hive makes that arithmetic without making it deeper.

**Build when:** never for v1. Worth prototyping only if playtests show players
mastering single-hive routing so completely that days stop being tense.

### Map or world progression

**Why cut:** the day cycle is already the progression structure, and it is the
one that produces clean ad breaks and measurable sessions. A map competes with
it and wins nothing.

### Bee types or classes

**Why cut:** this is the most tempting of the cuts and the one worth naming
explicitly — it is the natural way to add depth without adding a verb. It is
still wrong for v1, because it dilutes the single mechanic before that mechanic
has earned it.

**Build when:** Beeline clears the Player Fit Test and the limiting factor on
retention is depth rather than hook. Then this is the first thing to try.

### Story or characters

**Why cut:** portal players start playing within seconds. Narrative is friction
before the hook, and it is the opposite of "playable in five seconds".

### Achievements, leaderboards, daily rewards

**Why cut:** all three are retention scaffolding around a loop that has not yet
proven it retains. Leaderboards additionally break the portal abstraction —
CrazyGames has an API and Poki does not, so they would be the first feature to
force portal-specific game code. See ADR 0002.

**Build when:** the loop retains on its own, and then only via an optional
`PortalAdapter` method with a no-op default.

### Settings menu beyond mute

**Why cut:** mute is the only setting a portal game genuinely needs. Everything
else is a screen the player has to dismiss.

### Localisation

**Why cut:** Beeline is designed to be understood with almost no text. If it
needs translating to be playable, the onboarding is wrong. `getLocale()` already
exists on the adapter for when this changes.

### Cosmetic unlocks

**Why cut:** requires art volume we do not have, and monetises nothing —
rewarded video is the revenue model, not cosmetics.

---

## How to add to this list

Anything you were tempted to build but did not. Include what would change your
mind — an entry without that is just a wish, and it will sit here forever
without anyone being able to decide on it.
