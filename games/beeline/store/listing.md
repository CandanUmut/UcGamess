# Store listing — Beeline

Copy for CrazyGames, itch.io and anywhere else the game is listed. The title
here must match `src/config/title.ts`. Images and preview videos come from
`node games/beeline/tools/store.mjs`, which writes to `store/out/`.

---

## Title

Beeline

## Short description (one line, ≤ 120 characters)

Drag lines from the hive, send your bees to the flowers, and fill the honey
jar before the sun sets.

## Description

Every bee in the hive is waiting for you to point the way.

Drag a line from the hive to a flower and a crew of bees flies it, bringing
honey home. Fill the jar to win — the faster you fill it, the more stars you
earn.

Each level of the Spring Meadow teaches one new idea with a hand that shows
you how: stack lines on a big flower, bend a line around a hedge, swat a wasp
before it robs the hive, catch a golden bloom before it closes, and scout into
the mist for hidden flowers and the rare Royal Bloom.

All the honey you bring home goes into the hive's bank. Spend it on skills —
a bigger swarm, swifter wings, keener eyes for the mist — and come back for
the stars you missed.

- **30 levels in three worlds.** Spring Meadow, Bramble Maze with hedges to
  route around, and Wasp Summer with raiders after your honey.
- **Learn by playing.** One new idea per level, shown, never a wall of text.
- **Explore.** Mist hides flowers, and finding one tops up your jar.
- **Grow your hive.** Six skills, bought with honey, each opening once you
  have met what it improves.
- **Stars and awards.** Three stars a level for speed, and 17 awards to chase.
- **Endless mode** opens once the first world is done: how many days can your
  hive last?

No sign-up, no downloads. Progress saves automatically.

## Controls

| Action                     | Mouse                            | Touch                    |
| -------------------------- | -------------------------------- | ------------------------ |
| Send bees to a flower      | Drag from the hive to the flower | Drag from the hive       |
| Route around a hedge       | Curve the drag around it         | Same                     |
| Extend a line              | Drag on from the end of a line   | Same                     |
| Swat a wasp                | Click it                         | Tap it                   |
| Recall a line              | Press and hold on the line       | Press and hold           |
| Pause, retry, sound on/off | Pause button (top right) or `P`  | Pause button (top right) |

## Category and tags

- **Category:** Casual (alternatively Puzzle)
- **Tags:** bee, drawing, strategy, puzzle, casual, relaxing, mouse, touch,
  level-based, 2d

## Technical

- HTML5 (Phaser), 16:9, scales to any window; landscape on phones (portrait
  shows a "turn your phone" prompt).
- Works with mouse, touch and keyboard (`P` pauses).
- About 2 MB download (under 1 MB compressed on first load).
- Saves progress through the portal's save system, or in the browser elsewhere.
- Sound: its own synthesized effects plus one CC0 music track; mutes during ads.
- Age rating: suitable for everyone (PEGI 3 content; no violence beyond
  cartoon wasp-swatting, no chat, no purchases).

## Asset files

| File                    | Size      | Use                                  |
| ----------------------- | --------- | ------------------------------------ |
| `cover-landscape.png`   | 1920×1080 | CrazyGames landscape cover           |
| `cover-portrait.png`    | 800×1200  | CrazyGames portrait cover            |
| `cover-square.png`      | 800×800   | CrazyGames square cover              |
| `cover-itch.png`        | 630×500   | itch.io cover image                  |
| `screenshot-*.png`      | 1920×1080 | Screenshots (itch.io, press)         |
| `preview-landscape.mp4` | 1920×1080 | CrazyGames landscape preview, silent |
| `preview-portrait.mp4`  | 720×1080  | CrazyGames 2:3 portrait preview      |
