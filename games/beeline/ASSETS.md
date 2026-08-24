# Beeline — asset plan

Working plan, followed as written. Every file that lands in `assets/` needs an
entry in `assets/LICENSES.md` — CI fails the build otherwise, and that gate is
not to be worked around.

---

## Principle: placeholder-first, and placeholders must be shippable

Stage 2 uses **no external assets at all** — Phaser primitives and textures
generated at runtime. Every asset below is an _upgrade to something that already
works_, never a blocker.

If art never arrives, Beeline still ships. It just looks plainer.

This is not a hedge. The visual identity of this game is **motion and trails**,
not illustration: a few hundred dots streaming along glowing curves reads well
with almost no art, and badly with a lot of mediocre art. Small sprites and
strong motion is the correct art direction here, and it happens to be the cheap
one.

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

| Stage                  | Assets                                                               |
| ---------------------- | -------------------------------------------------------------------- |
| **2 — feel prototype** | **None.** Primitives and generated textures only.                    |
| 3 — full loop          | Still none required. Generated textures for bee, trail, patch, hive. |
| 4 — polish             | Real sprites for flower/hive/wasp/UI, the audio set, font decision.  |

Nothing on this page blocks Stage 2 or Stage 3.
