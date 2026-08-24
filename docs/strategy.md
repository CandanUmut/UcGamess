# Strategy

## The problem

Browser game portals have enormous distribution and a high quality bar.

Poki serves over 100 million players a month and passed a billion monthly
gameplays in June 2025. CrazyGames is above 50 million monthly users. Neither
requires you to buy traffic, run a store page, or pay for user acquisition —
they hand you an audience the day you launch.

The catch is the bar. Both portals curate manually, and both reject for reasons
that have nothing to do with whether a game is fun:

- Load size and load time (a blank screen reads as broken, not slow)
- Broken on Safari or mobile when it works fine in Chrome
- Physics that breaks on a 120/144 Hz display
- Console errors
- Anything that looks like a prototype rather than a finished thing
- Clones, reskins and asset flips
- Text that is illegible at the size it actually renders in a 16:9 iframe

One developer documented a CrazyGames rejection **two hours** after submission
with the note "looks like a prototype". The feedback loop is fast and it is
terse. Most of that list is infrastructure, not design — which is exactly why
this repo enforces it in CI rather than trusting a checklist.

## Our approach

**1. Ship non-exclusive to CrazyGames first.**

CrazyGames does not require exclusivity, responds in one to two days, and runs a
roughly two-week Basic Launch soft-launch that measures session length, return
rate and completion before inviting a game to Full Launch. That makes it a
low-risk place to learn what a portal actually wants, with real metrics attached.
Ads are disabled during Basic Launch specifically so the engagement numbers stay
clean.

**2. Port cheaply to other portals.**

The same build goes to GameDistribution, GamePix and Y8 non-exclusively. This is
only cheap if the game never talks to a portal SDK directly — hence
`packages/portal` and the lint rule that enforces it. The cost of a new portal
should be one adapter, written once, reused by every game.

**3. Evaluate Poki exclusivity only for a proven hit, and only per-game.**

Poki is the biggest audience and pays the best, but its default deal is web
exclusivity — its own docs say 5 years on the "Deal Types" page and 7 years on
the "Bonus Level" page (a genuine contradiction to resolve _before_ signing).
That exclusivity covers Discord and YouTube Playables too, so signing means
pulling the game from every other web surface.

That is a reasonable trade for one game that has already proven it retains
players. It is a bad trade for a catalogue, and a very bad trade for a game
whose numbers we are guessing at. So: never bind more than one game, and never
before we have real metrics.

**4. Treat the first year as learning, not income.**

At 10 hours a week, the realistic first-12-months outcome is a few thousand
dollars across three or four games. A single game that finds an audience is
worth more than three that do not, and finding it is a search problem. The real
return is knowing which formula works, which arrives in year two.

## Why Phaser

**Build size is revenue.** Poki's own data (Kasper Mol, W3C Games Workshop,
"Size Matters") puts a ~10 MB initial download at roughly 80% conversion-to-play
in the US. Smaller is better, linearly. A minimal Phaser build is under 1 MB
compressed and a typical game lands at 2–5 MB. Unity's WebGL runtime alone
starts at 15–25 MB — before any game content. That single fact rules Unity out
for this business, regardless of its other merits.

For reference, our template game currently builds to **283 KB** of compressed
initial download.

**The learning curve is the shortest available.** We are strong in
JavaScript/TypeScript and weak in game engines. Phaser is TypeScript, so the
skills transfer both directions — time spent learning it is also time spent
getting better at web development. GDScript would not do that.

**Official portal support.** Both Poki and CrazyGames publish Phaser integration
guides and have live Phaser games.

**MIT licensed, mature community.**

### Why not the alternatives

| Option                    | Why not                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unity WebGL**           | 15–25 MB runtime before content. Long loads, poor mobile first impression. Many developers hit this wall and migrate to Phaser.                                           |
| **Godot**                 | Clean web builds with GDScript (~5 MB empty, Brotli), but C# web export is still not official, and GDScript investment does not transfer outside game development.        |
| **Three.js / PlayCanvas** | Right answer if we needed 3D. PlayCanvas in particular is proven on portals — the Cannon Clash case study was built with it. We do not need 3D for the first three games. |
| **Defold**                | Very small builds (~1.14 MB) and an official Poki SDK extension. Genuinely viable; loses to Phaser only on ecosystem size and skill transfer.                             |

We chose Phaser 4 rather than Phaser 3 (see
[docs/adr/0001-engine-choice.md](adr/0001-engine-choice.md)) — Phaser 3 is
frozen at 3.90.0 and Phaser 4 is the maintained line.

## What we are betting on

- Distribution is solved by the portals; **quality and load size are ours to
  solve**, and both are largely mechanical.
- Portability is worth building for on day one, because the second portal is
  nearly free if the first was built right, and expensive if it was not.
- The bottleneck is finding a mechanic that holds attention for three minutes —
  so everything that is _not_ that should cost as close to zero as possible.

## What would change our mind

- If two well-executed games both fail the Poki Player Fit Test on playtime,
  the problem is our design instinct, not our infrastructure — and the answer
  is to study what retains, not to build more tooling.
- If CrazyGames revenue at reasonable play counts is far below the sourced
  $200–2,000/month band, the whole portal model is worse than advertised and
  deserves re-evaluation before game three.
