#!/usr/bin/env node
import {
  cpSync,
  mkdirSync,
  readdirSync,
  existsSync,
  writeFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAMES_DIR = join(REPO_ROOT, 'games');
const OUT_DIR = join(REPO_ROOT, 'preview-site');

/**
 * Collects every built game into one directory with an index page, for
 * GitHub Pages.
 *
 * Each game lands at /<slug>/ and works there without changes because the Vite
 * config sets `base: './'` — the same property that makes builds work inside a
 * portal's iframe. Preview hosting and portal hosting have the same
 * requirement, so testing one tests the other.
 */

interface Entry {
  slug: string;
  sizeBytes: number;
}

function directorySize(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += directorySize(full);
    } else if (!/\.(gz|br|map)$/.test(entry.name)) {
      total += statSync(full).size;
    }
  }
  return total;
}

function main(): void {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const entries: Entry[] = [];

  for (const game of readdirSync(GAMES_DIR, { withFileTypes: true })) {
    if (!game.isDirectory()) continue;

    const dist = join(GAMES_DIR, game.name, 'dist');
    if (!existsSync(dist)) continue;

    // Strip the leading underscore so the template gets a clean URL.
    const slug = game.name.replace(/^_/, '');
    cpSync(dist, join(OUT_DIR, slug), { recursive: true });
    entries.push({ slug, sizeBytes: directorySize(dist) });
  }

  if (entries.length === 0) {
    console.error('No built games found. Run the build before assembling.');
    process.exit(1);
  }

  writeFileSync(join(OUT_DIR, 'index.html'), renderIndex(entries), 'utf8');
  // Tells Pages not to run the output through Jekyll, which would drop files
  // and directories whose names begin with an underscore.
  writeFileSync(join(OUT_DIR, '.nojekyll'), '', 'utf8');

  console.log(`Assembled ${entries.length} game(s) into preview-site/`);
  for (const entry of entries) {
    console.log(`  /${entry.slug}/  (${(entry.sizeBytes / 1024).toFixed(0)} KB)`);
  }
}

function renderIndex(entries: Entry[]): string {
  const cards = entries
    .map(
      (entry) => `      <li>
        <a href="./${entry.slug}/">
          <strong>${entry.slug}</strong>
          <span>${(entry.sizeBytes / 1024).toFixed(0)} KB uncompressed</span>
        </a>
      </li>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>UC Games — Playtest builds</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0; padding: 48px 24px;
        background: #101018; color: #f4f4f8;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        display: flex; justify-content: center;
      }
      main { width: 100%; max-width: 560px; }
      h1 { font-size: 28px; margin: 0 0 8px; }
      p.note { color: #8a8aa0; margin: 0 0 32px; line-height: 1.5; }
      ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
      a {
        display: flex; justify-content: space-between; align-items: baseline;
        gap: 16px; padding: 18px 20px; border: 1px solid #2a2a3a;
        border-radius: 10px; text-decoration: none; color: inherit;
      }
      a:hover { border-color: #4ade80; background: #16162010; }
      span { color: #8a8aa0; font-size: 14px; }
    </style>
  </head>
  <body>
    <main>
      <h1>UC Games — playtest builds</h1>
      <p class="note">
        Built from <code>main</code>. These use the development portal adapter,
        so ads are simulated with a delay rather than served — playtesting here
        never touches a real portal's metrics.
      </p>
      <ul>
${cards}
      </ul>
    </main>
  </body>
</html>
`;
}

main();
