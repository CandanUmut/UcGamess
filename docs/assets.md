# Assets

Every shipped asset must have an entry in that game's `assets/LICENSES.md` with
source, author, license, URL and AI provenance. CI fails without it.

This is not bureaucracy. Asset provenance is unrecoverable after the fact —
six months from now nobody will remember whether a sprite came from a CC0 pack,
a paid bundle with an embedding restriction, or an image model. The question
only ever gets asked when something has already gone wrong.

---

## Approved sources

CC0 first. It requires no attribution, permits unlimited commercial use, and
never becomes a problem later.

| Source                                                 | Content                                          | License                                                                |
| ------------------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------- |
| **[Kenney.nl](https://kenney.nl)**                     | 2D/3D sprites, UI, audio, fonts — 30,000+ assets | **CC0** — start here                                                   |
| **[Quaternius](https://quaternius.com)**               | Low-poly 3D                                      | CC0                                                                    |
| **[Poly Haven](https://polyhaven.com)**                | HDRIs, textures, 3D                              | CC0                                                                    |
| **[OpenGameArt](https://opengameart.org)**             | Sprites, music, 3D                               | **Mixed** — check every asset individually; CC-BY requires attribution |
| **[itch.io asset store](https://itch.io/game-assets)** | Everything                                       | Mixed — read each pack's license                                       |
| **GameDev Market / CraftPix**                          | Premium 2D/3D                                    | Paid commercial license — read the terms                               |

**Practical workflow:** ship with Kenney (CC0), and if a game finds an audience,
replace the handful of assets players actually look at with custom or premium
work. One consistent style matters far more than variety — mixing three sources
is what makes a game read as an asset flip, which is an explicit rejection
reason.

## Fonts — the most common trap

A web game **embeds and distributes** its fonts to every player's browser. That
is a different permission from using a font in a design.

**A font needs commercial use _and_ embedding rights.** Many fonts advertised as
"free" are free for personal use only, and some commercial licenses explicitly
exclude web embedding.

**Safe default: [Google Fonts](https://fonts.google.com).** Almost all are
OFL or Apache, both of which permit web embedding.

**Also safe:** Kenney's fonts (CC0), and system font stacks — the template uses
`system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`, which costs zero
bytes and has no license question at all. Consider whether you need a custom
font before adding 40 KB for one.

Never use a font ripped from another game or lifted from a font-sharing site.

## AI-generated assets

AI is allowed, with real constraints.

### The legal position

**Fully AI-generated assets have no copyright protection in the US.** The US
Copyright Office's position is that work without human authorship is not
copyrightable — which means a competitor can legally copy your art and you have
no recourse. This is a business risk, not a compliance detail.

Tools offering indemnification (Adobe Firefly) carry less risk than those that
do not (Midjourney, Stable Diffusion).

### Poki's policy

Poki has a published "Working With AI" policy. The summary is _"AI should
empower, not shortcut"_:

- AI must add value, not replace craft
- Never ship raw model output — edit it
- No visible watermarks or leftover prompt text
- **No prompting for copyrighted characters or styles** ("Mario-style" and
  similar are prohibited)
- Games that are purely AI-generated raise IP ownership questions that can block
  acceptance

### Our rules

1. **Never ship raw output.** Every AI-assisted asset gets human editing —
   recolouring, redrawing, cleanup, composition.
2. **Record everything** in `assets/LICENSES.md`: the tool and version, the
   exact prompt, how many generations, and what a human changed.
3. **Never prompt for a copyrighted style, character or property.**
4. **Never ship an asset with a watermark or visible prompt text.**
5. **Prefer indemnified tools** for anything that ends up load-bearing.
6. **Do not use AI for the game's identity** — logo, key art, main character.
   Those are the assets you most want to actually own.

A complete AI entry looks like:

```markdown
- **AI:** Adobe Firefly (Image 3). Prompt: "flat vector shield icon, mint green,
  no text". Regenerated 4 times, then recoloured and the outline redrawn by hand
  in Affinity Designer. No copyrighted style or character was referenced.
```

itch.io permits AI assets and considers disclosing them good manners. We
disclose everywhere.

## Audio

Same rules. Kenney's audio packs are CC0 and cover most casual game needs.

Two practical notes:

- Audio is often the largest thing in a build. Compress aggressively — OGG at a
  modest bitrate is fine for short effects, and most casual games need under
  200 KB of audio in total.
- Browsers block audio until the player interacts with the page. `AudioManager`
  in `packages/core` handles the unlock; do not work around it per-game.

## Optimisation

Everything in `assets/` counts toward the initial download budget, because
Phaser's preloader fetches it before the menu appears.

- **PNG** — run through [oxipng](https://github.com/shssoichiro/oxipng) or
  ImageOptim. Prefer fewer, larger sprite sheets over many small files: request
  count matters nearly as much as bytes.
- **Consider not using an asset at all.** The template draws entirely with
  Phaser primitives and ships a 477-byte logo. Shapes, tweens and a good palette
  get a long way, cost nothing, and are automatically consistent.
- **Check what is actually big:** `VISUALIZE=1 pnpm build` in a game directory
  writes `dist/stats.html`.

## Adding an asset — the actual steps

1. Confirm the license permits commercial use (and embedding, for fonts)
2. Optimise it
3. Drop it in `games/<slug>/assets/`
4. Add an entry to `games/<slug>/assets/LICENSES.md` — copy the template block
   at the bottom of that file
5. `pnpm check-licenses` to confirm
6. `pnpm build` to confirm you are still inside the size budget
