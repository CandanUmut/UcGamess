# Design rules

These are the rules a game has to satisfy to be worth building. They are derived
from what portals actually measure, not from taste. Where a number appears, it
is a published portal threshold.

---

## One core mechanic per game

One verb. Fling, stack, merge, dodge, time. Everything else in the game exists
to make that verb more interesting.

The test: can you describe the game in one sentence without using "and"? If not,
the scope is too big for a 100–180 hour build, and the game will read as
unfocused to a reviewer.

This is a resource constraint as much as a design one. Two mechanics is not
twice the work — it is roughly four times, because they interact.

## Playable within 5 seconds of load

From clicking the game to controlling something: five seconds. That covers the
download, the boot, and the menu.

- Initial download under 5 MB (hard ceiling 8 MB — CI enforces it)
- No splash sequence, no logo animation, no settings gate
- The menu is one obvious action

Every second here costs conversion-to-play, and conversion-to-play is the
metric that most directly becomes revenue. The template's menu is a single
"tap to play" for exactly this reason.

## The first 30 seconds teach without a tutorial wall

No modal explaining the controls. No forced tutorial level. The player should
understand the game by playing it.

Ways that actually work:

- Make the first obstacle trivially survivable, so the mechanic is discovered by
  doing it
- Show the control prompt on the thing being controlled, not in a corner
- Let the first failure be cheap and immediate — losing teaches faster than text
- Adapt the prompt to the device ("Tap" vs "Click or press any key"); telling a
  phone player to press A/D reads as a lazy desktop port, which is itself a
  rejection reason

If the game genuinely cannot be understood without instructions, the mechanic is
too complicated. Simplify the mechanic rather than adding a tutorial.

## Session length: over 3 minutes average, with 25% of sessions over 3 minutes

This is Poki's Player Fit Test threshold, measured over 500 players:

- **Average playtime above 3 minutes**, and
- **At least 25% of sessions exceeding 3 minutes**

Both must hold. A game where everyone plays exactly three minutes passes the
first and fails the second — the second is really asking "does anyone get
absorbed by this?"

What produces it:

- A short loop (20–60 seconds) that ends in a decision to go again, not in a
  menu
- Visible progress across rounds — a high score, an unlock, a streak
- Difficulty that rises fast enough to stay interesting and slow enough that
  round five is still reachable

Use the local `Metrics` helper (`ucgames.summary()` in the dev console) to check
this during playtesting. Finding out from a rejection email costs weeks.

## Conversion-to-play above 70%

Poki calls above 70% "solid" and above 80% "exceptional". Cannon Clash reached
81% after getting its download to 2.4 MB across only 76 requests.

Conversion-to-play is mostly a technical number, not a design one:

- Download size (the dominant factor)
- Number of requests
- Whether something is visible immediately — a blank screen while loading reads
  as broken, and the player leaves before the game exists

The `#boot` placeholder in the template's HTML exists for the last point: it
paints before any JavaScript runs.

## Consistent art style beats asset variety

A game drawn entirely in one free CC0 pack looks finished. A game mixing three
sources looks like an asset flip, and "inconsistent graphics" is explicitly
listed in Poki's quality guidelines as a rejection reason.

Practical approach: ship with one source (Kenney is CC0 and enormous). If a game
finds an audience, replace the handful of assets the player looks at most with
custom or premium work. See [assets.md](assets.md).

The template deliberately draws with Phaser primitives and a single 477-byte
logo — a consistent, deliberate look costs nothing.

## It has to feel finished

The most common CrazyGames rejection is "looks like a prototype". Concretely:

- Nothing snaps into place without a tween
- Every input has visible feedback within one frame
- There is a sound for the main verb (audio ducks during ads automatically)
- Text is legible at the size it renders inside a 16:9 iframe on a phone —
  check this on an actual phone, not a resized browser window
- Menus, game over and restart are all styled the same way
- Nothing is placeholder-coloured

Polish is roughly the last 20% of the schedule and it is not optional. A
mechanically better game that looks unfinished loses to a simpler one that
does not.

## Ads are placed by the portal, not by us

- **Never write an ad timer.** Portals decide frequency. This is a hard
  constraint and lint enforces the common ways of breaking it.
- `commercialBreak()` goes immediately before `gameplayStart()`, once the player
  has shown intent to continue — the "Play again" button, not the death moment.
  Signal as many opportunities as the game naturally has; the portal will ignore
  the ones it does not want.
- **Rewarded video is always opt-in**, buys something the player visibly wants,
  and always has a standard non-ad alternative next to it. Never chain multiple
  videos for one reward.
- Audio ducks automatically at the adapter level. Do not add per-game muting.
- Do not offer a rewarded video when `isAdBlocked()` is true — a button that
  does nothing is worse than no button.

## Design for the web, not a mobile port

Poki rejects games that feel like mobile ports. That means:

- Landscape 16:9 is the primary orientation
- Mouse and keyboard are first-class, not an afterthought
- No fake energy systems, no daily-login mechanics, no IAP-shaped friction
- Instant restart — the player is one click from another round, always

---

## Quick self-check before building

- [ ] One verb, describable in one sentence with no "and"
- [ ] Playable in under 5 seconds
- [ ] Teaches itself in 30 seconds with no tutorial screen
- [ ] A loop that plausibly holds a player for 3+ minutes
- [ ] Under 5 MB
- [ ] One art source, one consistent style
- [ ] Not confusable with an existing game by name or iconography
- [ ] Rewarded video has an obvious, wanted reward and a non-ad alternative
