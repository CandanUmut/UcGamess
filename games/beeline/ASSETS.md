# Beeline — asset plan

Working plan, followed as written. Every file that lands in `assets/` needs an
entry in `assets/LICENSES.md` — CI fails the build otherwise, and that gate is
not to be worked around.

---

## What actually shipped

Measured on the production build, not estimated:

| File | Brotli | What it is |
| --- | --- | --- |
| `sprites/meadow.jpg` | 43.3 KB | Seamless grass, tiled as the ground |
| `fonts/nunito.woff2` | 18.1 KB | Variable UI face, subsetted |
| `sprites/flower-*.png` | 11.7 KB × 6 | One daisy per species |
| `audio/meadow.webm` | ~13 KB | Ambient loop, Opus (Safari gets the `.m4a`) |
| `sprites/bee.png` | ~5 KB | Top-down honeybee |
| `particles/*.png` | ~5 KB | Two starbursts |

Total initial download **746 KB** against a 5 MB warn threshold, of which Phaser
is still 275 KB. Every file is CC0 or OFL; see `assets/LICENSES.md` for the
per-file provenance and the modifications made.

## Principle: nothing on this list may block the game

Every asset is an _upgrade to something that already works_. The bee falls back
to a version drawn in code, the flowers and particles fall back to the generated
glow, the ground falls back to the camera's background colour, the font falls
back to the system stack behind a 1.2s timeout, and the music simply does not
play. A dropped request costs looks; it cannot cost a boot.

That is not caution for its own sake. These are the first files this game has
ever fetched — before them the whole thing was primitives and synthesised audio,
and "interactive in well under a second" was free. It is now something that has
to be kept, and a fallback per asset is how.

> **Direction change, day 2026-08-24.** The board used to be near-black with
> unexplored ground rendered as darkness. It is now a lit meadow with unexplored
> ground rendered as mist. Short sight works identically either way — what hides
> the field is cosmetic to the mechanic — and the lit version is both the one
> the game is about and the one with usable free art behind it. Most of what
> follows was written for the dark board; where the two disagree, this section
> and `assets/LICENSES.md` are current.

---

## Byte budget

Against the 5 MB target, with the engine taking its share.

| Category                        | Budget    | Notes                                                                                                            |
| ------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| Engine + game code (compressed) | ~2.5 MB   | Template baseline is 283 KB brotli, of which Phaser is 275 KB. Beeline's own code should land well under 100 KB. |
| Sprites (single atlas)          | ≤ 400 KB  |                                                                                                                  |
| Audio (all files)               | ≤ 600 KB  | **The most common budget killer. Treat as real.**                                                                |
| Font (subsetted woff2)          | ≤ 80 KB   |                                                                                                                  |
| Headroom                        | remainder |                                                                                                                  |

Measured, not assumed: `pnpm --filter @ucgames/game-beeline build` prints the
brotli total, and `VISUALIZE=1` writes `dist/stats.html`.

> The engine line is generous. The template already demonstrates 283 KB total,
> so realistically Beeline lands nearer 1 MB than 5 MB. Budget revisions go here
> with the measurement that prompted them.

---

## Directory layout

```
games/beeline/
├── assets/
│   ├── sprites/        # source images; one atlas is the build output
│   ├── audio/          # two formats per sound
│   ├── fonts/          # subsetted woff2 only
│   └── LICENSES.md     # every file, no exceptions
└── src/
```

`assets/` is the Vite `publicDir` **and** the directory the license checker
scans. Those being the same folder is what makes the gate impossible to route
around.

---

## Sprites

Deliberately tiny. Nothing over 128px.

| Asset               | Size     | Notes                                                                |
| ------------------- | -------- | -------------------------------------------------------------------- |
| Bee                 | 8–16px   | A dot or teardrop. Rotation and tint do all the work.                |
| Trail segment       | 32×8px   | One soft gradient strip, tiled and faded in code.                    |
| Flower patch        | ~64px    | 3–4 variants differing mainly in colour. One extra for rich patches. |
| Hive                | ~128px   | One sprite.                                                          |
| Honey droplet       | ~24px    | Collection pop.                                                      |
| Wasp                | ~24px    | Silhouette only.                                                     |
| UI nine-slice panel | ~48px    | Night screen and buttons.                                            |
| UI button           | ~64×24px |                                                                      |
| Icons               | ~32px ×4 | One per upgrade category.                                            |

**All of it in one texture atlas**, WebP with PNG fallback. The atlas is
**generated as a build step**, not assembled by hand — a hand-packed atlas goes
stale the first time someone adds a sprite.

### Which of these are genuinely needed

Honest assessment, because the cheapest asset is the one not shipped:

- **Bee, trail, honey droplet** — generate in code permanently. A radial-gradient
  dot drawn to a `CanvasTexture` at boot is indistinguishable from a shipped PNG
  at 12px, costs zero bytes, and can be re-tinted freely.
- **Flower, hive, wasp, UI** — worth real art. These are the only things the
  player looks _at_ rather than _through_, and they carry whatever charm the
  game has.

Expected atlas after that split: well under 200 KB, so the 400 KB budget has
slack for a second flower set if the game needs visual variety later.

---

## Audio

Five sounds and one loop, **mixed quiet**. Ambient hum sits under everything;
collection blips must not fatigue across a 90-second day where they fire
hundreds of times.

| Sound                  | Type          | Budget                            |
| ---------------------- | ------------- | --------------------------------- |
| Hive ambient hum       | Seamless loop | ~300 KB (the longest file by far) |
| Nectar collection blip | One-shot      | ~15 KB                            |
| Route draw whoosh      | One-shot      | ~20 KB                            |
| Day end chime          | One-shot      | ~40 KB                            |
| Upgrade purchase       | One-shot      | ~30 KB                            |
| Wasp warning           | One-shot      | ~25 KB                            |

**The collection blip is pitch-varied in code** (±15% random detune) so one file
sounds like many. This is the single highest-leverage trick in the audio budget:
it turns 15 KB into apparent variety across the hundreds of collections in a
day.

Ship **`.webm`/Opus with an `.m4a` fallback** for Safari. Audio unlocks on first
user gesture through the core `AudioManager` — not reimplemented here, and the
Safari autoplay restriction is already handled there.

If the budget gets tight, the ambient hum is the first thing cut. It is 80% of
the audio bytes and the least missed.

---

## Font

One variable font, OFL or Apache licensed, subsetted to the characters actually
used, **woff2 only**.

- **Google Fonts is the safe default** — OFL/Apache, so web embedding is
  permitted. A font that is "free for personal use" is not usable here, because
  a web game distributes its fonts to every player.
- **Numerals must be tabular.** The honey counter updates continuously; without
  tabular figures it visibly jitters as digit widths change. This is
  non-negotiable and easy to miss until it is annoying.
- Subset to digits, basic Latin, and the specific glyphs the UI uses. A full
  Latin face is ~40 KB; a real subset is under 10 KB.

The template currently uses a system font stack (`system-ui, …`) which costs
zero bytes and has no license question. **Ship with that until there is a
specific reason not to** — a custom font is a legitimate upgrade, not a
requirement.

---

## Sourcing order

1. **Generated in code** — gradients, dots, glows, trails. Free, zero bytes,
   first choice.
2. **Kenney (CC0)** — no attribution required, unrestricted commercial use.
3. **Other CC0 sources** — license verified per file, not per pack.
4. **Paid or AI-generated** — last resort, provenance recorded.

---

## LICENSES.md is mandatory

Every file needs: filename, source, author, license, URL, date added.

AI-generated assets additionally need **the tool and the exact prompt**. Two
reasons, both real: fully AI-generated work has no copyright protection in the
US, meaning a competitor can legally copy it; and Poki's AI policy requires
provenance.

The scaffolded `assets/LICENSES.md` already carries the entry format and the
generated-in-code precedent from the template.

---

## Stage mapping

| Stage                  | Assets                                                                  |
| ---------------------- | ----------------------------------------------------------------------- |
| **2 — feel prototype** | **None.** Primitives and generated textures only.                       |
| 3 — full loop          | Still none required. Generated textures for bee, trail, patch, hive.    |
| 4 — polish             | **Done:** bee, flowers, ground, font, music, particles. See the top.    |
| Still open             | Hive and wasp, both still Phaser primitives. UI panels stay code-drawn. |

Nothing on this page blocks Stage 2 or Stage 3.

**The UI pack was evaluated and rejected.** Kenney's UI Pack is CC0 and would
have covered the night screen's panels and buttons, but it is bright flat-yellow
cartoon chrome and reads as a different game bolted onto this one. The
code-drawn UI is more coherent than the free art would have been, which is the
one case where "generate it" beats "ship it".
