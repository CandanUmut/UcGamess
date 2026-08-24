# Reference

Source material this repo was built from. This is the provenance for decisions
recorded elsewhere — when `docs/strategy.md` or an ADR cites a number, this is
where it came from.

These are **historical documents**. Do not edit them to reflect new information;
update the living docs (`strategy.md`, `portal-requirements.md`, the ADRs) and
leave these as the record of what we knew at the time.

| File | What it is |
| --- | --- |
| [bootstrap-prompt.md](bootstrap-prompt.md) | The specification this monorepo was built to. Useful for understanding why the structure is the way it is, and what was explicitly scoped out. |

## Not in this repository

**`UcGames_document.md`** — the evidence-based market study the studio's
strategy derives from: platform comparison, genre analysis, monetisation
figures, portal thresholds, and the Turkish/US payment and tax situation.
Written in Turkish.

It is **deliberately untracked** (see `.gitignore`) and lives only on local
disk. This repository is public so that GitHub Pages can serve playtest builds,
and the document contains personal tax position, payment routing and income
projections — none of which should be indexable, and git history would preserve
it permanently even after a deletion.

Everything from it that belongs in a shared repo has already been carried across
into `strategy.md`, `design-rules.md`, `portal-requirements.md` and the ADRs,
with the sourcing preserved. If you need the original, ask a teammate directly
rather than committing it.

## Caveats carried forward from the research

- Per-play RPM and Turkey-specific eCPM figures are **estimates**. Portals keep
  the real numbers private.
- Poki's exclusivity term is stated as **5 years** on its "Deal Types" page and
  **7 years** on its "Bonus Level" page. This contradiction is in Poki's own
  documentation and must be resolved with a representative before signing.
- The tax and payment material is general in nature. It needs confirmation from
  an accountant in Turkey (SMMM/YMM) and, if US tax obligations apply, an
  international tax advisor.
