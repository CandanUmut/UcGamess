# Portal requirements

Per-portal technical requirements, revenue terms and payout details.

**Verification note.** Everything marked ✅ was read off official documentation
during repo setup (2026-08-23). Items marked ⚠️ come from secondary sources or
could not be reached and must be confirmed before they matter commercially.
Revenue and payout terms change — re-check before signing anything.

---

## CrazyGames — first target

**Why first:** no exclusivity requirement, 1–2 day response, fast feedback.

### Technical ✅

| Requirement             | Value                                                               |
| ----------------------- | ------------------------------------------------------------------- |
| Initial download        | ≤ 50 MB (≤ 20 MB for mobile homepage eligibility)                   |
| Total size              | 250 MB, 1,500 file limit                                            |
| Externally hosted files | Must reach gameplay within 20 seconds                               |
| Browsers                | Chrome and Edge required; Safari encouraged                         |
| Input                   | Mouse, keyboard **and** touch when mobile is enabled                |
| Orientation             | Landscape expected on desktop; portrait allowed if mobile-optimised |
| Low-end devices         | May be disabled on ChromeOS if it does not run well on 4 GB RAM     |

CrazyGames' size limits are far more permissive than Poki's. **We hold the
stricter 5 MB / 8 MB line anyway** so a game can move between portals without a
re-optimisation project.

The technical requirements page does not state framerate targets or ad audio
rules. ⚠️ Confirm during QA review.

### SDK ✅

Verified against `docs.crazygames.com`:

```
Script:  https://sdk.crazygames.com/crazygames-sdk-v3.js
Init:    await window.CrazyGames.SDK.init()

game.gameplayStart() / gameplayStop()
game.loadingStart()  / loadingStop()
game.happytime()
game.reportGameCompletedPercentage(0-100)

ad.requestAd("midgame" | "rewarded", { adStarted, adFinished, adError })
ad.hasAdblock(): Promise<boolean>

data.getItem / setItem / removeItem / clear   (sync, localStorage-shaped,
                                               cloud-backed when signed in)
user.systemInfo.locale / .countryCode / .device.type
```

Notes that matter for our adapter:

- `requestAd` is callback-based, not promise-based. Rewarded success is
  `adFinished`; grant the reward there and nowhere else.
- `adError` codes include `adsDisabledBasicLaunch`, `unfilled`, `adblock`,
  `adCooldown`, `other`. **During Basic Launch, ads are deliberately off** so
  soft-launch metrics stay clean — `adsDisabledBasicLaunch` is expected, not a
  bug.
- `hasAdblock()` is async but our `isAdBlocked()` is sync, so the adapter probes
  once during `init()` and caches.
- `data` is the only portal cloud save we currently have access to.

### Commercial ⚠️

| Term             | Value                                                                       |
| ---------------- | --------------------------------------------------------------------------- |
| Revenue share    | 60% ads / 70% IAP (after recoup)                                            |
| Exclusivity      | **Not required** (timed web exclusivity only if you take a publisher bonus) |
| Payout threshold | €100                                                                        |
| Payout method    | Tipalti (wire / PayPal / ACH / eCheck), monthly, around the 10th            |
| Review           | 1–2 days response; ~2 week Basic Launch soft-launch → Full Launch           |
| SDK required     | Mandatory at Full Launch, optional at Basic                                 |

Tipalti onboarding collects W-9/W-8 and a VAT ID.

---

## Poki — second target, highest bar

### Technical ⚠️/✅

| Requirement        | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| Initial download   | **Under 8 MB target**                                      |
| Aspect ratio       | 16:9                                                       |
| Framerate          | 30 FPS minimum, 60 target, on 3G                           |
| Conversion-to-play | >70% solid, >80% exceptional ✅                            |
| Player Fit Test    | Average playtime >3 min **and** ≥25% of sessions >3 min ✅ |
| Web Fit Test       | Shown to ~10,000 players; conversion + engagement measured |

### SDK ✅

Verified against `sdk.poki.com/html5` and `sdk.poki.com/sdk-documentation`:

```
Script:  https://game-cdn.poki.com/scripts/v2/poki-sdk.js
Global:  PokiSDK

init(): Promise<void>
gameLoadingFinished(): void
gameplayStart(): void
gameplayStop(): void
commercialBreak(onStart?: () => void): Promise<void>
rewardedBreak(options?): Promise<boolean>
setDebug(enabled: boolean): void
getURLParam(name): string | undefined
getDeviceInfo(): { category: 'mobile' | 'tablet' | 'desktop' }
```

**Two gaps, confirmed absent rather than assumed:**

- **No cloud save API.** `saveData`/`loadData` fall back to localStorage.
- **No locale API.** `getLocale()` falls back to `navigator.language`.

Poki's own integration example resolves the game even when `init()` rejects
("Initialized, something went wrong, load your game anyway"), which is what our
adapter does.

Poki guidance: call `commercialBreak()` before every `gameplayStart()` where the
player has shown intent to continue. Not every call plays an ad — Poki decides —
so signalling more opportunities is correct.

### Commercial ⚠️

| Term                 | Value                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| Revenue share        | 50/50 on Poki traffic; **100% to developer** on your own traffic (bookmarks, search, social)           |
| Exclusivity          | **Web exclusive by default** — 5 years on the "Deal Types" page, **7 years** on the "Bonus Level" page |
| Exclusivity scope    | Includes Discord and YouTube Playables                                                                 |
| Non-exclusive option | One-time flat fee (kills upside)                                                                       |
| Payout               | Wire transfer / PayPal                                                                                 |
| Process              | Web Fit Test 3–5 days → soft release 1–2 weeks; manually curated, closed beta                          |
| Post-launch target   | At least 1 ad per DAU                                                                                  |

> **The 5-vs-7-year contradiction is real and comes from Poki's own
> documentation.** Resolve it with a Poki representative in writing before
> signing. Signing means pulling the game from Discord, YouTube Playables and
> every other web portal.

Never bind more than one game. Never bind a game whose metrics we are guessing at.

---

## GameDistribution (Azerion) — third, non-exclusive

⚠️ **Our adapter is a marked stub.** `gamedistribution.com` returned 404 for its
SDK documentation URLs during setup, so `GameDistributionAdapter.ts` was
reconstructed from the GD-HTML5 wiki and carries `TODO: verify` markers on the
script URL, the event name strings, and the rewarded flow. **Do not ship a
GameDistribution build until someone has verified it against a live
integration.**

| Term          | Value                                                         |
| ------------- | ------------------------------------------------------------- |
| Revenue share | Revenue-share on preroll/midroll/rewarded; exact rate in T&Cs |
| Exclusivity   | None                                                          |
| Payout        | PayPal €50 / bank €100; VAT declaration required              |
| Review        | Automatic and fast; distributes to a wide partner network     |
| SDK           | Mandatory                                                     |

Reconstructed API shape (unverified): set `window.GD_OPTIONS = { gameId, onEvent }`
_before_ appending the script, load the SDK exactly once, then use
`gdsdk.showAd()` for interstitials and `gdsdk.preloadAd('rewarded')` +
`gdsdk.showAd('rewarded')` for rewarded. Grant the reward only on
`SDK_REWARDED_WATCH_COMPLETE`, never on the promise alone.

Rewarded ads must be enabled per-game on developer.gamedistribution.com.

---

## Others (no adapter yet)

| Portal                     | Revenue                   | Exclusivity                          | Payout               | Notes                                                                                            |
| -------------------------- | ------------------------- | ------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------ |
| **GamePix**                | Revenue-share             | None                                 | Dashboard            | Lightweight SDK, QA performed                                                                    |
| **Y8**                     | Revenue-share / licensing | Usually none                         | —                    | Older, broad audience                                                                            |
| **Yandex Games**           | 50%                       | None                                 | 3000 RUB / $150      | Gives **detailed** moderation feedback with screenshots — genuinely useful for learning          |
| **itch.io**                | ~90% developer            | None                                 | PayPal/Stripe direct | No SDK, minimal ad revenue, indie-friendly                                                       |
| **GameMonetize**           | ~45% developer            | None                                 | —                    | Wide distribution                                                                                |
| **Facebook Instant Games** | Ads/IAP                   | None                                 | —                    | **Declining** — creator program support ended 31 Oct 2025, closing in 2026. Not worth targeting. |
| **Discord Activities**     | Experimental, IAP-focused | Counts as "web" for Poki exclusivity | —                    | Conflicts with a Poki exclusive deal                                                             |

Adding one of these is one adapter in `packages/portal` plus an entry in the
build script's portal list. Nothing in any game changes.

---

## Monetisation reference ⚠️

Sourced figures, useful for expectation-setting rather than planning:

- **Rewarded video** — highest performing format. $15–40 eCPM in tier-1 game
  markets, $3–10 in tier-2/3. Completion rates above 90%.
- **Interstitial** — roughly $5–15 eCPM (US Android ~$11).
- **Banner** — $0.50–2 eCPM, near 100% fill.
- **HTML5 portals generally** — independent sources put CPM at $1–5.
- **Country spread is about 4x** between top-20 markets. Turkey and developing
  markets sit well below the US figures; portals do not publish country-level
  numbers.
- **Watch out for fill rate.** Session RPM can land far below eCPM — $5 eCPM at
  60% fill is about $1 session RPM.
- A well-performing casual game on a major portal earns roughly **$200–2,000 a
  month**.

## Audience and compliance

Portal audiences skew young. Under COPPA, games that _appear_ directed at
under-13s cannot serve personalised ads, which materially lowers eCPM. Portals
manage this setting through the SDK. Designing for a general audience rather
than an obviously child-targeted one protects revenue.
