# Asset licenses — beeline

Every file in this directory must have an entry below. `pnpm check-licenses`
fails the build otherwise, and CI runs it on every PR.

See `docs/assets.md` for approved sources and the full policy, and
`games/beeline/ASSETS.md` for this game's asset plan and byte budget.

## Required fields

| Field | Notes |
| --- | --- |
| `File` | Path relative to this directory |
| `Source` | Where it came from (site, tool, or "original work") |
| `Author` | Person or studio credited |
| `License` | CC0, CC-BY 4.0, OFL, a purchased license, etc. |
| `URL` | Link to the asset or its license terms |
| `AI` | `No`, or the tool + prompt + human editing done |

---

## Assets

The board is a lit meadow, and these are the files that make it one. What is
still generated at boot in `src/render/textures.ts` is the soft glow (a radial
gradient, tinted and scaled per use) and a fallback bee, drawn in code so a
failed fetch costs detail rather than the whole swarm.

**The bee is the studio's own art.** Everything else here is CC0 or OFL and can
be swapped freely; `sprites/bee.png` cannot be treated that way, and if this
game is ever forked or the assets reused elsewhere it is the one file whose
ownership is not "anyone's".

The hive and the wasp are still drawn with Phaser primitives, and are the two
pieces still waiting on hand-drawn art.

### bee.png

- **File:** `sprites/bee.png`
- **Source:** Original work — drawn by hand by the studio (`beeline.png`)
- **Author:** Umut Candan (UC Games)
- **License:** Owned outright by the studio; all rights reserved
- **URL:** n/a — not published anywhere; the source file lives outside the repo
- **Added:** 2026-08-24
- **AI:** No. Drawn by hand.
- **Notes:** Processed, not redrawn. The source is a 2278x3223 drawing on a
  white background with the bee in one corner. Steps: cropped to the drawing;
  the white background removed by **flood-filling inward from the border**
  rather than by keying every white pixel — the eyes are white too, and keying
  by colour alone punches holes through the face; anti-aliased edge pixels
  feathered to partial alpha so no white fringe shows against the meadow; then
  trimmed and scaled to 96x83.

  It faces **nose-right (+x)**, which is the convention `SpriteBeeRenderer`
  depends on — it rotates by `atan2(dy, dx)`. A replacement drawn facing any
  other way will fly backwards.

  This one replaced a CC0 Openclipart bee (`simple bee from above`, id 174161)
  that was never a good fit; nothing of it remains in the build.

### hive.png, wasp.png, wall.png

- **File:** `sprites/hive.png`
- **File:** `sprites/wasp.png`
- **File:** `sprites/wall.png`
- **Source:** Original work — drawn by hand by the studio
  (`beehive.png`, `wasp.png`, `walls.png`)
- **Author:** Umut Candan (UC Games)
- **License:** Owned outright by the studio; all rights reserved
- **URL:** n/a — not published anywhere; the source files live outside the repo
- **Added:** 2026-08-24
- **AI:** No. Drawn by hand.
- **Notes:** Processed, not redrawn, by the same route as `bee.png`: cropped to
  the drawing, white background removed by flood-filling inward from the border
  rather than by keying every white pixel, anti-aliased edges feathered to
  partial alpha, then trimmed and scaled. Sizes 117x128, 72x43 and 256x87.

  The **wasp faces nose-right (+x)**, the same convention the bee follows, and
  is mirrored rather than rotated for the same reason — it is a profile drawing
  and spinning it by heading would fly it upside down.

  The **wall** is drawn as a horizontal length whose thorns overhang the part
  that actually blocks: the solid body is 45 of its 87 pixels, and the body sits
  6.5px below the image centre. Both numbers are measured in
  `FieldRenderer.drawWallBar` — a replacement drawing with different proportions
  needs those two constants updated or every wall in the maze will sit crooked.

  These three replaced the last of the Phaser primitives on the board.

### shop-market.png, shop-apothecary.png

- **File:** `sprites/shop-market.png`
- **File:** `sprites/shop-apothecary.png`
- **Source:** Original work — drawn by hand by the studio (`left.png`,
  `right.png`)
- **Author:** Umut Candan (UC Games)
- **License:** Owned outright by the studio; all rights reserved
- **URL:** n/a — not published anywhere; the source files live outside the repo
- **Added:** 2026-08-26
- **AI:** No. Drawn by hand.
- **Notes:** Two honey pots with their labels — a magenta **Money Inc.** and a
  cyan **Honey Inc.** Processed by the same route as `bee.png`: the white
  background flood-filled inward from the border rather than keyed out by
  colour, edges feathered to partial alpha, then trimmed from the 2278x3223
  source to the drawing itself and scaled to 224px wide.

  Both are then **quantised to a 64-colour palette**, which takes the pair from
  99 KB to 13 KB with no visible change. That is worth doing here and nowhere
  else on the board: these are flat blocks of colour with hard outlines, which
  is the one thing a small palette reproduces exactly. The photographic ground
  tile would fall apart under the same treatment.

  The **shop names set the fiction**, rather than the other way round — the
  buyers were "The Market" and "The Apothecary" until these arrived. Their two
  colours are read off the drawings into `TUNING.buyers[*].tint`, so a building,
  its price tag and its HUD row are visibly one thing; a redrawn shop in a
  different colour wants that value updated to match.

### pollen.png

- **File:** `sprites/pollen.png`
- **Source:** Openclipart, "pollen 2" (id 252934)
- **Author:** Uploaded to Openclipart by `rejon`
- **License:** CC0 1.0 Universal (all Openclipart submissions are released CC0)
- **URL:** https://openclipart.org/detail/252934/pollen-2
- **Added:** 2026-08-24
- **AI:** No
- **Notes:** Squared and downscaled to 48x48; not otherwise modified. Drawn
  untinted in the collection pop, because the grain already has its own colour
  and multiplying amber over amber only muddies it.

  Worth noting the source appears to be a rendered illustration rather than a
  vector drawing. Openclipart's terms release every submission as CC0 and that
  is what the entry records, but it is a second-hand assurance rather than one
  verified at the origin — `TODO: verify against the uploader if this ever ships
  commercially`.

### flower-*.png

- **File:** `sprites/flower-pink.png`
- **File:** `sprites/flower-violet.png`
- **File:** `sprites/flower-poppy.png`
- **File:** `sprites/flower-buttercup.png`
- **File:** `sprites/flower-daisy.png`
- **File:** `sprites/flower-cornflower.png`
- **Source:** Openclipart, "flower daisy 8 petal colour remix" (id 348493)
- **Author:** Uploaded to Openclipart by `Firkin`
- **License:** CC0 1.0 Universal
- **URL:** https://openclipart.org/detail/348493/flower-daisy-8-petal-colour-remix
- **Added:** 2026-08-24
- **AI:** No
- **Notes:** One source daisy, recoloured six ways — one per entry in
  `COLORS.species`, in that order. Only the petals move: pixels below 35%
  value (the outline) and saturated warm pixels (the centre) are left alone, so
  every flower keeps a dark silhouette against a pale field and a warm middle.
  Squared and downscaled to 96×96 so the sprite's centre is the flower's centre.

### meadow.jpg

- **File:** `sprites/meadow.jpg`
- **Source:** ambientCG, "Grass 005", 1K JPG colour map
- **Author:** Lennart Demes / ambientCG
- **License:** CC0 1.0 Universal
- **URL:** https://ambientcg.com/view?id=Grass005
- **Added:** 2026-08-24
- **AI:** No
- **Notes:** Colour map only; the normal/roughness/displacement maps in the pack
  are not shipped. Modified: downscaled 1024→512, saturation ×0.82, brightness
  ×1.30, contrast ×0.62, then blended 30% toward the meadow cream so the ground
  belongs to the palette instead of sitting on it as a photograph. The source
  tiles seamlessly and the resize preserves that — measured, not assumed: the
  wrap-around edge differs by no more than two neighbouring interior pixels do.
  Drawn as a `TileSprite`, so it repeats at its own scale rather than being
  stretched.

### meadow.webm / meadow.m4a

- **File:** `audio/meadow.webm`
- **File:** `audio/meadow.m4a`
- **Source:** OpenGameArt, "Ambient Relaxing Loop"
- **Author:** isaiah658
- **License:** CC0 1.0 Universal ("No attribution required")
- **URL:** https://opengameart.org/content/ambient-relaxing-loop
- **Added:** 2026-08-24
- **AI:** No
- **Notes:** 24.5s seamless ambient loop, made in ZynAddSubFX and Audacity.
  Modified only by re-encoding from the 1.3 MB source OGG: Opus 40k VBR in WebM
  (132 KB) and AAC 56k in MP4 (178 KB). Two formats because Safari plays neither
  Opus nor Vorbis reliably; Phaser fetches only the one the browser reports it
  supports. The loop seam was checked rather than trusted — the first and last
  250 ms match to within 0.6 dB RMS, so a repeat does not lurch. Integrated
  loudness −18.7 LUFS with a 4.8 LU range; played at 0.3 volume under the game.

  **Not listened to by the agent that added it.** The measurements above are
  real; whether the piece is actually pleasant over a long session is a
  judgement only a human can make.

### nunito.woff2

- **File:** `fonts/nunito.woff2`
- **Source:** Google Fonts
- **Author:** Vernon Adams, Cyreal, Jacques Le Bailly
- **License:** SIL Open Font License 1.1
- **URL:** https://fonts.google.com/specimen/Nunito
- **Added:** 2026-08-24
- **AI:** No
- **Notes:** Variable weight axis 200–1000 in a single file, so the one request
  covers every weight the UI uses. Subsetted with `fontTools` to the exact
  characters the UI can render (ASCII plus `− — – × · … °`), and OpenType layout
  features were dropped because Phaser draws text to a 2D canvas, which applies
  none of them. 18.5 KB, against the 80 KB font budget.

  Chosen because its **digits are naturally tabular** — all ten advance widths
  are 600 units, verified with `fontTools` rather than assumed. `ASSETS.md`
  requires tabular numerals so the honey counter does not jitter as it counts,
  and the usual way to get them (the `tnum` OpenType feature) is not reliably
  applied to canvas text. A font whose default figures are already monospaced is
  the only version of that requirement that survives Phaser.

  The subset does not contain `→` (U+2192, absent from Nunito's Latin coverage
  upstream) or `▶` (U+25B6). Both appear in the night screen and fall through to
  the system stack behind Nunito in the `FONT` constants, which is why that
  fallback is not decorative.

### sparkle.png

- **File:** `particles/sparkle.png`
- **Source:** Kenney "Particle Pack", file `PNG (Transparent)/star_09.png`
- **Author:** Kenney (Kenney Vleugels)
- **License:** CC0 1.0 Universal
- **URL:** https://kenney.nl/assets/particle-pack
- **Added:** 2026-08-24
- **AI:** No
- **Notes:** Downscaled 512×512 → 64×64 with Lanczos resampling; not otherwise
  modified. White on transparent, so the game tints it per use exactly as it
  tints the generated textures. Used for the flower-discovery burst.

### glint.png

- **File:** `particles/glint.png`
- **Source:** Kenney "Particle Pack", file `PNG (Transparent)/star_06.png`
- **Author:** Kenney (Kenney Vleugels)
- **License:** CC0 1.0 Universal
- **URL:** https://kenney.nl/assets/particle-pack
- **Added:** 2026-08-24
- **AI:** No
- **Notes:** Downscaled 512×512 → 48×48 with Lanczos resampling; not otherwise
  modified. White on transparent and tinted in code. Used for the honey-deposit
  spark at the hive.

CC0 requires no attribution, so neither PNG needs a credit line in-game. The
OFL does not require in-game attribution either, only that the font is not sold
on its own and that any modified copy is not released under the reserved name —
subsetting for embedding is explicitly permitted and the name is unchanged.

---

## Template for new entries

Copy this block when you add an asset:

```markdown
### <filename>

- **File:** `<path/relative/to/assets>`
- **Source:** <e.g. Kenney.nl "Platformer Pack Redux">
- **Author:** <e.g. Kenney>
- **License:** <e.g. CC0-1.0>
- **URL:** <link>
- **Added:** <YYYY-MM-DD>
- **AI:** No
- **Notes:** <modifications made, restrictions, attribution text required in-game>
```

For an AI-assisted asset, the `AI` field must read like:

```markdown
- **AI:** Adobe Firefly (Image 3). Prompt: "flat vector shield icon, mint green,
  no text". Regenerated 4 times, then recoloured and the outline redrawn by hand
  in Affinity Designer. No copyrighted style or character was referenced.
```

Fully AI-generated work has no copyright protection in the US — meaning a
competitor can legally copy it — and Poki's AI policy requires provenance. Both
are reasons this field is not optional.
