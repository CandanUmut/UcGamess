# Submission checklist

Work through this before submitting to any portal. It is ordered by how often
each item causes a rejection, not by how easy it is to check.

Items marked **[CI]** are verified automatically — if CI is green they are done.
Everything else needs a human with a browser and a phone.

---

## Size and load

- [ ] **[CI]** Initial download under 5 MB (hard fail above 8 MB)
- [ ] Loads in under 5 seconds on a throttled connection
      _(DevTools → Network → Fast 3G, hard reload)_
- [ ] Request count is low — under ~100 for the initial load
- [ ] Something is visible on screen immediately, before the game boots
      _(a blank screen reads as broken, not as loading)_
- [ ] Loading progress is visible and moves

## Compatibility

- [ ] **[CI]** Boots with no console errors in Chromium, WebKit and mobile viewport
- [ ] Tested in **desktop Safari** — WebGL context, audio autoplay and touch all
      behave differently there
- [ ] Tested on a **real phone**, not a resized desktop window
- [ ] Tested on a **high-refresh display (120/144 Hz)** — the game must not run
      fast. If simulation is in `fixedUpdate` this is already true, but verify
- [ ] Touch **and** keyboard both work, and the on-screen prompts match the
      device being used
- [ ] Rotating the device does not break the layout
- [ ] Nothing important sits under a notch or home indicator
- [ ] Holds 60 FPS on desktop, 30+ on mid-range mobile
- [ ] No scrollbars; the page itself does not scroll

## Portal integration

- [ ] **[CI]** No portal SDK imported outside `packages/portal`
- [ ] Built with the right adapter (`node scripts/build.ts --portal <name>`)
- [ ] `loadingFinished()` fires once, after assets are ready
- [ ] `gameplayStart()` / `gameplayStop()` pair on **every** transition —
      including pause, tab-away, menu, and death, not just at session start
- [ ] **No home-grown ad timer anywhere in the game**
- [ ] `commercialBreak()` sits immediately before `gameplayStart()`, after the
      player has shown intent to continue
- [ ] Rewarded video is opt-in, clearly labelled as an ad, and buys something
      obviously worth having
- [ ] A standard non-ad way to continue is always available next to it
- [ ] No chaining of multiple videos for one reward
- [ ] Audio actually goes silent during an ad _(verify; do not assume)_
- [ ] Sound comes back after an ad, including one that errors
- [ ] Rewarded video is not offered when `isAdBlocked()` is true
- [ ] The game still works fully with an ad blocker enabled

## Content and originality

- [ ] Not a clone, reskin or asset flip
- [ ] Name and iconography are not confusable with an existing game
      _(search the portal for your title before submitting)_
- [ ] There is a genuine original twist on any borrowed mechanic
- [ ] No copyrighted characters, names or visual styles

## Legal and assets

- [ ] **[CI]** Every asset has an entry in `assets/LICENSES.md`
- [ ] Every license permits commercial use
- [ ] Every **font** permits commercial use **and embedding**
      _(a web game ships its fonts to the player — "free for personal use" is
      not enough)_
- [ ] Attribution is present in-game where CC-BY requires it
- [ ] AI-assisted assets have tool, prompt and human editing recorded
- [ ] No AI watermarks or leftover prompt text visible anywhere
- [ ] No AI asset was generated from a copyrighted-style prompt

## Feel

- [ ] Reads as finished, not as a prototype
- [ ] Art style is consistent throughout
- [ ] Every input has visible feedback within a frame
- [ ] Nothing snaps into place without a transition
- [ ] Text is legible at the size it actually renders in a 16:9 iframe on a phone
- [ ] Menu, game over and restart are styled consistently
- [ ] No placeholder colours or programmer art left in

## Metrics self-check

Play the game yourself and with a few other people, then run
`ucgames.summary()` in the dev console:

- [ ] Average play time above 3 minutes
- [ ] At least 25% of sessions exceed 3 minutes
- [ ] Conversion-to-play above 70%
- [ ] Time to first play under 5 seconds

If these miss, iterate on the hook and onboarding **before** submitting. Poki
runs the same test with 500 real players and a fail costs weeks.

## Portal-specific

**CrazyGames**

- [ ] Run the CrazyGames QA tool and clear its checklist
- [ ] Expect `adsDisabledBasicLaunch` ad errors during Basic Launch — that is
      correct behaviour, not a bug
- [ ] Mobile orientation set correctly at submission

**Poki**

- [ ] Run Poki Inspector and clear it
- [ ] Under 8 MB initial download
- [ ] Web-first, not a mobile port
- [ ] Ready for Player Fit Test thresholds

---

## Before you hit submit

- [ ] `pnpm verify` passes
- [ ] The exact build being submitted was played end-to-end, on a phone
- [ ] The commit being submitted is tagged
