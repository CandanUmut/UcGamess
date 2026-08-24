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

## Considered while adding thorns and provisions to Beeline (2026-08-24)

The brief was "more challenge, better upgrades, and whatever else is missing —
but do not over-engineer it". Three things were built (see
`games/beeline/DESIGN.md` §15). These were weighed and left out.

### A second obstacle type — shade or cold pockets that slow bees

Zones that do not block a route but make bees crossing them fly at ~55% speed.
It is a genuinely good idea: it turns the thorn decision from binary
(blocked / not blocked) into a judgement call — short and slow, or long and
fast.

**Why deferred:** thorns are one new element and the escalation rule is one at a
time. A soft-cost zone introduced in the same pass would arrive before the hard
blocker has been understood, and it costs a per-bee zone test in the hot path
for a benefit nobody has measured yet.

**Build when:** playtests show thorns being solved once and then ignored — the
signal is players drawing the same arc every day without looking.

### More than three thickets on a day

The board caps out at three. Between the hive draw ring and a flower's reach
ring there is only `distance − 195 − 2 × grown radius` of usable line, and on a
fixed 1280×720 field with a central hive only two or three flowers are ever far
enough out to host one.

**Why deferred:** the honest ceiling is geometric. Raising it means smaller
thickets (which stop reading as terrain), a bigger field (this is not a
scrolling world), or dropping the clearance guarantees that keep every flower
reachable — and that last one is the difference between a puzzle and a dead
flower.

**Build when:** never, at this canvas size. If the field ever scrolls, revisit.

### Stackable provisions, or carrying more than one

**Why cut:** quantities, a screen to manage them, and balance against every
combination — and the night screen becomes bookkeeping. One slot makes the
purchase a read of the forecast, which is a decision worth having. The single
slot is the design, not a limitation of it.

**Build when:** if playtests show players ignoring the shelf entirely, the fix
to try first is better forecast copy, not more slots.

### A streak or combo reward for refreshing before a route stops paying

Rewarding the habit the game wants — catching a route early — with bonus honey
or extra hold time.

**Why cut:** it pays the player for doing the thing the retreat economy already
pays them for, and the obvious implementations reward spamming refreshes rather
than timing them. Two rewards for one behaviour is how a clean economy gets
muddy.

**Build when:** if skilled play turns out to be indistinguishable from average
play in the metrics.

### Rewarded "swarm boost" at day start

`TUNING.ads.rewardedSwarmBoostFromDay` and `rewardedSwarmBoostMultiplier` exist
and nothing reads them. It is specced in DESIGN.md §7 and was never wired up.

**Why deferred:** not part of this brief, and the night screen already has its
one rewarded offer per boundary — a second one at day start needs a decision
about which takes priority, which is a design question rather than a wiring job.

**Build when:** the next pass on ad placement. Either implement it or delete the
two tuning keys, because a constant nothing reads is a lie about the design.

---

## Considered while making the board dark (2026-08-24)

The brief was that the game still did not feel like a game: paths should mean
something, and there was no scarcity or skill in it. Four things were built —
fog, road strength, a corner hive, and distance-scaled yield (see
`games/beeline/DESIGN.md` §18). These were weighed and left out.

### A zoomed-out camera over a larger world

The obvious way to make the map bigger: grow the world to 1920x1080 and zoom the
camera to fit, with a second camera for the HUD.

**Why cut:** at a 1.5x zoom a flower's reach ring lands near 17 CSS pixels on a
phone in landscape, well under the ~44px a thumb reliably hits, and the design
rules treat an unhittable target as a rejection cause. Moving the hive into a
corner doubles the longest route without shrinking anything, and fog makes an
unlit 1280x720 board feel far larger than a lit one ever did.

**Build when:** never at this canvas size. If the game ever gets a scrolling
world, this is moot rather than deferred.

### A minimap

**Why cut:** a minimap is a second place to look, and everything it would show
is already on the field. Worse, it would quietly undo the fog — the value of a
dark board is that the player holds the map in their head, and a minimap holds
it for them.

**Build when:** if the world ever exceeds one screen.

### Live-only vision, where fog closes behind the swarm

More realistic, and a real tension: you would have to keep looking.

**Why cut:** re-scouting ground already paid for is busywork wearing a
mechanic's clothes, and it punishes the player for looking away — on a portal,
where sessions are three minutes and interrupted, that is a quit.

**Build when:** probably never. If exploration turns out to be too cheap, the
lever to try first is the sight radius, not memory.

### A permanent "sight" upgrade

Tempting: it competes well with the other five and reads instantly.

**Why cut:** the upgrade list is five and has been since the scope freeze, and
Scout Bees already sells sight as a one-off. A permanent sight upgrade would
also flatten the ramp the fog gets from the flower band widening each day, which
is doing that job for free.

**Build when:** if playtests show players never exploring at all. Then the first
thing to try is making Scout Bees cheaper, not adding a sixth upgrade.

### Roads that persist between days

Strength is earned and lost within a day. Carrying a road overnight would make
it a genuine long-term investment.

**Why cut:** the field is regenerated at dawn — new flowers, new thorns — so
yesterday's road leads somewhere that no longer exists. Making the field
persistent instead is a much larger change than it looks, and it would remove
the "series of fresh attempts" shape the day cycle is built on.

**Build when:** only alongside a persistent map, which is itself on this list as
map/world progression.

### Rich patches paying 3x on top of the distance ramp

Left in, but flagged rather than cut. A far rich flower now reads around 11x a
near ordinary one, and one turned up holding 7,741 honey against a day-nine
quota of 1,120.

**Why left in:** the pool is trips, not honey, so a 90-second day cannot drain
it — and holding a long route to a rich far flower for a whole day is the
hardest thing in the game. The two multipliers are also conceptually different
axes: distance is position, rich is quality.

**Watch for:** a playtest where finding the rich flower decides the day on its
own. If that happens, drop `richYieldMultiplier` to 2 before touching the
distance ramp, which is load-bearing.

---

## How to add to this list

Anything you were tempted to build but did not. Include what would change your
mind — an entry without that is just a wish, and it will sit here forever
without anyone being able to decide on it.
