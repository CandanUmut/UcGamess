# Publishing

How a game gets from this repo onto a portal. Some of it is automated; some of
it cannot be, because the portal has no upload API or needs an account holder
to accept terms.

| Where           | Build                  | How it gets there                                 |
| --------------- | ---------------------- | ------------------------------------------------- |
| GitHub Pages    | `local` (fake ads)     | Automatic on every push to `main` (`preview.yml`) |
| GitHub Releases | `crazygames`, `web`    | Automatic on a tag (`release.yml`)                |
| itch.io         | `web` (no ads, no SDK) | Automatic on a tag, once set up below             |
| CrazyGames      | `crazygames`           | **Manual** upload in the developer portal         |
| Poki            | `poki`                 | Invite-only; apply at developers.poki.com first   |

## Cutting a release

```bash
git tag beeline-v1.0.0
git push origin beeline-v1.0.0
```

Or run **Actions → Release → Run workflow** with a game and a version. The run
typechecks, lints and tests, builds both zips through the size budget, renders
the store images and preview videos (`games/<slug>/tools/store.mjs`), and
attaches all of it to a GitHub Release named after the tag. Locally, the same
pieces are:

```bash
node scripts/package.ts --game beeline          # release/beeline-{crazygames,web}.zip
node games/beeline/tools/store.mjs              # games/beeline/store/out/
```

The store tool needs `ffmpeg` on PATH for MP4 previews; without it it keeps the
raw `.webm`.

## itch.io — one-time setup

1. Create an itch.io account, then **Dashboard → Create new project**:
   - _Kind of project:_ **HTML**
   - _Pricing:_ free (or "No payments")
   - _Embed options:_ **Embed in page**, viewport **1280 × 720**, tick
     **Mobile friendly** (orientation **landscape**) and **Fullscreen button**
   - Title, description, tags and cover: from `games/<slug>/store/listing.md`
     and the release's `cover-itch.png` and screenshots.
   - Save as **Draft** for now. Note the project URL: `https://<user>.itch.io/<project>`.
2. **Settings → API keys → Generate new API key.**
3. In GitHub, **Settings → Secrets and variables → Actions**:
   - Secret **`BUTLER_API_KEY`** = that key.
   - Variable **`ITCH_PROJECT`** = `<user>/<project>` (e.g. `ucgames/beeline`).
4. Cut a release. The workflow pushes the web build to the `html5` channel.
5. **Once, after the first push:** on the project's edit page, tick **"This
   file will be played in the browser"** on the uploaded `html5` file, then set
   the page to **Public**. Later pushes replace the file in place.

Until the secret and variable exist, the release still happens and the itch.io
step is skipped with a notice.

## CrazyGames — every release

CrazyGames takes uploads through its developer portal, and its QA reviews each
one. Its docs (docs.crazygames.com, checked 2026-09) describe no upload API, so
this step stays manual.

1. Sign in at developer.crazygames.com and **Submit a game** (or open the
   existing one and upload a new version).
2. Upload `<slug>-crazygames.zip` from the GitHub Release. It is built with the
   CrazyGames SDK v3 adapter and `index.html` at the zip root.
3. Covers: `cover-landscape.png` (1920×1080), `cover-portrait.png` (800×1200),
   `cover-square.png` (800×800). Title only, as they require.
4. Preview videos: `preview-landscape.mp4` and `preview-portrait.mp4` — silent,
   18 s, opening on the cover.
5. Description, controls and tags: `listing.md`.
6. Use their **preview tool** to test the upload (ads, pause, save) before
   sending it for review. Work through `docs/submission-checklist.md` first.

New games start in CrazyGames' "Basic Launch": a limited test audience whose
play time and retention decide whether the game goes to "Full Launch". Their
docs are explicit that during Basic Launch "Monetization (video ads, banners,
in-game purchases) is disabled"; revenue share starts at Full Launch.

## The `web` build

`PORTAL=web` swaps in `WebAdapter`: no SDK, no ads (every ad call resolves
immediately and rewarded offers are hidden), saves in `localStorage`. It is the
build for itch.io and any plain static host. Never ship the `local` build
publicly — it simulates ads as multi-second freezes for testing.
