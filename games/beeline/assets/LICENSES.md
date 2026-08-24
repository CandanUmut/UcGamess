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

**None.** Stage 2 ships no external assets at all.

Everything on screen is drawn with Phaser primitives or from textures generated
at boot in `src/render/textures.ts` — the bee dot and the soft glow are radial
gradients painted to a canvas, tinted and scaled per use.

This is not a placeholder arrangement. Per `ASSETS.md`, code-generated art is
the permanent plan for the bee, the trail and the honey droplet: at 12px a
generated gradient is indistinguishable from a shipped PNG, costs zero bytes of
initial download, and can be re-tinted freely. Real art arrives in Stage 4 for
the flower, hive, wasp and UI — the things the player looks *at* rather than
*through*.

Because nothing is shipped, nothing needs a license entry yet. The first file
added to `assets/` needs a block below before CI will pass.

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
