# Roadmap

Three games and a 90-day plan, at roughly 10 hours a week between two people.

The sequence is deliberate: lowest-risk game first to learn the portal pipeline
with something that can actually finish, then a fast trend attempt, then a
retention play once we know what our audience stays for.

---

## Game 1 — physics-based casual skill game

**Target: 120–180 hours** (roughly weeks 3–13)

One clear mechanic, a short session loop, touch-friendly. This is the lowest-risk
option and the one most likely to produce a genuinely _finished_ feel, which
matters more than ambition for a first submission.

**Why first.** It maps directly onto what portals measure. A short loop drives
conversion-to-play; a skill mechanic drives replay, which drives session length.
It is also the genre with the clearest proof point: Poki's own case study,
Cannon Clash, reached **81% conversion-to-play at a 2.4 MB download across 76
requests**. That is the target shape.

**Design constraints**

- One verb, describable in a sentence with no "and"
- Round length 20–60 seconds
- Instant restart, always one input away
- Interstitial on "play again", rewarded video for a continue
- Under 3 MB

**Main risk.** The mechanic has to be satisfying on its own. If it is shallow,
the 3-minute playtime threshold is unreachable no matter how much polish goes on
top. **Mitigation: build a grey-box prototype of just the verb in week 3 and
play it before committing to anything else.** If it is not fun as a grey box, it
will not be fun with art.

---

## Game 2 — trend-driven puzzle / merge

**Target: 100–150 hours**

Fast production, rides a current trend, requires an original twist rather than
being a clone. Art-light, mostly tweens and simple state.

**Why second.** Trend-riding is a real, demonstrated lever — a solo developer hit
1 million plays in a single day and ~17k concurrent players by catching the
"brainrot" trend in May 2025. Poki actively encourages trend content and
publishes documentation about it. But it only works if the pipeline is already
fast, which is what game 1 buys us.

**Main risks.** Trends expire — if the build takes longer than the trend lasts,
the whole premise is gone. And clone-similarity rejection is a live danger in
this genre specifically: portals reject games confusable with an existing one by
name or iconography. **An original twist is mandatory, not a nice-to-have.**

**Mitigation:** do not start until game 1 is submitted and the pipeline is
proven. Pick the trend at the start of the build, not two months earlier.

---

## Game 3 — idle / incremental

**Target: 150–250 hours**

Code-heavy, art-light, high retention. The best fit for our actual skills —
strong TypeScript, limited art.

**Why third.** Idle games clear the 3-minute playtime threshold comfortably by
construction, and rewarded video fits naturally (2x coins, speed boost) rather
than being bolted on. That combination is the best long-term revenue shape of
the three.

**Why not first.** Economy balance is genuinely hard and takes iteration we have
not earned yet. And the hook problem is severe: if the first 30 seconds are not
compelling, players leave before the retention mechanics ever engage.

**Main risk.** Balance iteration eats the schedule. Budget explicit time for it
rather than treating it as polish.

---

## 90-day plan

| Weeks           | Focus                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1–2**         | Environment and Phaser fundamentals. Complete the official Phaser tutorial. Open CrazyGames and Poki developer accounts. Look at Poki Inspector and the CrazyGames QA tool so we know what they check _before_ building against them. |
| **3–4**         | **Freeze game 1 scope** — one mechanic, one scene. Grey-box the core loop and play it. Pick Kenney CC0 assets. Do not proceed until the grey box is fun.                                                                              |
| **5–6**         | Polish to "finished". Mobile touch, 16:9 responsive, safe areas. Load under 5s, size under 5 MB. This is where the prototype feeling gets removed.                                                                                    |
| **7**           | Integrate the CrazyGames adapter. Run the QA tool. **Submit to Basic Launch** — no exclusivity, fast feedback.                                                                                                                        |
| **8**           | Read Basic Launch metrics (session length, return rate, completion). Fix what they show. Push the same build to GameDistribution and GamePix non-exclusively.                                                                         |
| **9–10**        | Apply to Poki. If accepted: Playtest → Player Fit Test, targeting 3min+ average and 25%+ of sessions over 3 minutes. If metrics are weak, iterate on onboarding and hook — not on content.                                            |
| **11–12**       | Run the Web Fit Test (Poki) / Full Launch (CrazyGames) process. **Set up the payment pipeline: Payoneer plus a Turkish bank account. Talk to an accountant about registration.**                                                      |
| **13 (day 90)** | Game 1 live. Start game 2 concept and current-trend research. Evaluate metrics — if there is a signal, put everything into iterating on game 1 instead.                                                                               |

The infrastructure work that would normally sit in weeks 1–2 is already done —
this repo is the output of it. That time goes into Phaser fundamentals and
developer accounts instead.

---

## Kill criteria

Deciding to stop is the hardest and most valuable discipline here. Sunk cost in
a game that will not find an audience is the main way a small studio wastes a
year. **Write down the number before you see it.**

### Stop iterating on a game when:

**During development**

- The grey-box prototype is not fun after **two** redesigns of the core verb.
  The mechanic is the problem, and art will not fix it.
- The build passes **150% of its hour estimate** with the core loop still not
  finished. Scope was wrong; cut or stop.

**After soft launch**

- Average session length stays **under 2 minutes** after two rounds of
  onboarding and hook iteration. That is far enough below the 3-minute threshold
  that it is a design problem, not a tuning problem.
- Conversion-to-play stays **under 60%** when the build is already under 5 MB.
  Size is the usual cause; if size is not the cause, the first impression is,
  and that is expensive to fix.
- **Return rate is near zero** after a week of real traffic. Nobody comes back —
  no amount of monetisation work matters.

**After launch**

- Revenue stays **under $50/month** three months after Full Launch, with no
  upward trend. The audience has spoken.

### When to double down instead

- Session length is over 3 minutes but conversion is weak → **fix the size and
  the first impression.** The game is good; the packaging is not. Highest-value
  work available.
- Conversion is strong but sessions are short → the hook lands and the loop does
  not. **One** focused attempt at deepening the loop; if that fails, ship it and
  move on.
- Any single metric is unusually strong → find out why and build game 2 around
  that, rather than starting from a genre guess.

### The meta rule

**One game at a time.** Do not start game 2 to escape a problem in game 1.
Either game 1's problem is worth solving or the game is killed — but the
decision gets made explicitly, not by drifting onto something new.
