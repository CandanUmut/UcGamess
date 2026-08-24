## What and why

<!-- One paragraph. What changes for the player, or for us? -->

## How to verify

<!-- Exact steps. "pnpm dev, play a round, lose, tap Play again" beats "tested it". -->

---

## Definition of done

- [ ] CI is green (typecheck, lint, format, unit tests, all portal builds, licenses, smoke test)
- [ ] Tested in **Safari** (not just Chrome)
- [ ] Tested on a **real phone**, not just a resized desktop window

## Submission checklist

Required for any PR that changes a game. Skip for docs- and tooling-only PRs.
The full version with reasoning lives in `docs/submission-checklist.md`.

### Size and performance

- [ ] Initial download under 5 MB (hard ceiling 8 MB — CI enforces this)
- [ ] Playable within 5 seconds of load on a throttled connection
- [ ] Holds 60 FPS on desktop, at least 30 FPS on mid-range mobile
- [ ] Physics unaffected by refresh rate — simulation is in `fixedUpdate`, not `update`

### Compatibility

- [ ] Works in Chrome, Safari, and mobile browsers
- [ ] Touch **and** keyboard both work, adapting to the device
- [ ] 16:9 responsive; nothing important falls outside the safe area
- [ ] No console errors or uncaught exceptions

### Portal integration

- [ ] No portal SDK imported outside `packages/portal` (lint enforces this)
- [ ] `loadingFinished()`, `gameplayStart()`, `gameplayStop()` fire in the right places
- [ ] **No home-grown ad timer** — the portal controls ad frequency
- [ ] Audio ducks during ads (handled by the adapter; verify it actually happens)
- [ ] Rewarded video is opt-in and always has a non-ad alternative

### Content and legal

- [ ] Not a clone, reskin, or asset flip; name and iconography are distinct
- [ ] Every asset has an entry in `assets/LICENSES.md` with source, author, license, URL, AI provenance
- [ ] Fonts permit commercial use **and** embedding
- [ ] Any AI-assisted asset has its tool, prompt and human editing recorded

### Feel

- [ ] Reads as finished, not as a prototype
- [ ] Consistent art style
- [ ] Text is legible at the size it actually renders in a 16:9 iframe

## Notes for the reviewer

<!-- Anything you are unsure about, deliberately deferred, or want a second opinion on. -->
