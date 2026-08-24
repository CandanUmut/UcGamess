# Architecture decision records

An ADR records a decision that was expensive to make and would be expensive to
re-litigate. It captures the context and the reasoning, so that when someone
later asks "why is it like this?", the answer is written down rather than
reconstructed.

Write one when a decision:

- constrains what we can build later (engine, architecture boundary), or
- was contested and someone will reasonably question it again, or
- looks wrong without its context

Do **not** write one for routine choices. A library picked in ten minutes does
not need a record.

## Format

Copy `template.md`, number it sequentially, and name it
`NNNN-short-title.md`.

Statuses: `Proposed` → `Accepted` → `Superseded by NNNN` / `Deprecated`.
Never delete or rewrite an accepted ADR — supersede it with a new one, so the
history of the thinking survives.

## Index

| ADR                                | Title                               | Status   |
| ---------------------------------- | ----------------------------------- | -------- |
| [0001](0001-engine-choice.md)      | Phaser 4 as the game engine         | Accepted |
| [0002](0002-portal-abstraction.md) | Build-time portal adapter selection | Accepted |
