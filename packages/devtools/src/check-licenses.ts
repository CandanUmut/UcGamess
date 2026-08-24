#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The manifest itself, and files that are not shipped assets. */
const IGNORED = new Set(['LICENSES.md', '.gitkeep', '.DS_Store', 'Thumbs.db']);

interface Problem {
  game: string;
  kind: 'missing-manifest' | 'undocumented-asset' | 'incomplete-entry';
  detail: string;
}

/**
 * Fails if any shipped asset is missing a license entry.
 *
 * Why this is a build gate rather than a checklist item: asset provenance is
 * unrecoverable after the fact. Six months from now, nobody will remember
 * whether a sprite came from a CC0 pack, a paid bundle with an embedding
 * restriction, or an image model — and the question only ever gets asked when
 * something has already gone wrong. Recording it at the moment of adding costs
 * thirty seconds; reconstructing it later can mean re-making the art.
 *
 * The check is deliberately shallow. It verifies that every file is mentioned
 * and that the required fields are present. It cannot verify that what you
 * wrote is true — that is on the person adding the asset.
 */
function listAssets(dir: string, base = dir): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;

    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listAssets(full, base));
    } else {
      files.push(relative(base, full).replace(/\\/g, '/'));
    }
  }

  return files;
}

const REQUIRED_FIELDS = ['Source', 'Author', 'License', 'URL', 'AI'] as const;

function checkGame(gameDir: string, gameName: string): Problem[] {
  const assetsDir = join(gameDir, 'assets');
  if (!existsSync(assetsDir)) return [];

  const assets = listAssets(assetsDir);
  if (assets.length === 0) return [];

  const manifestPath = join(assetsDir, 'LICENSES.md');
  if (!existsSync(manifestPath)) {
    return [
      {
        game: gameName,
        kind: 'missing-manifest',
        detail: `assets/ has ${assets.length} file(s) but no assets/LICENSES.md. Copy the one from games/_template.`,
      },
    ];
  }

  const manifest = readFileSync(manifestPath, 'utf8');
  const problems: Problem[] = [];

  // Split into per-asset sections so a field can be attributed to the right
  // entry. Everything before the first "### " heading is preamble.
  const sections = manifest.split(/^###\s+/m).slice(1);

  for (const asset of assets) {
    if (!manifest.includes(asset)) {
      problems.push({
        game: gameName,
        kind: 'undocumented-asset',
        detail: `assets/${asset} has no entry in assets/LICENSES.md`,
      });
      continue;
    }

    const section = sections.find((s) => s.includes(asset));
    if (!section) continue;

    const missing = REQUIRED_FIELDS.filter(
      (field) => !new RegExp(`\\*\\*${field}:\\*\\*\\s*\\S`).test(section),
    );

    if (missing.length > 0) {
      problems.push({
        game: gameName,
        kind: 'incomplete-entry',
        detail: `assets/${asset} is missing required field(s): ${missing.join(', ')}`,
      });
    }
  }

  return problems;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      games: { type: 'string', default: join(REPO_ROOT, 'games') },
    },
  });

  const gamesDir = String(values.games);
  if (!existsSync(gamesDir)) {
    console.error(`check-licenses: no games directory at ${gamesDir}`);
    process.exit(1);
  }

  const games = readdirSync(gamesDir, { withFileTypes: true }).filter((e) =>
    e.isDirectory(),
  );

  const problems: Problem[] = [];
  let checked = 0;

  for (const game of games) {
    const dir = join(gamesDir, game.name);
    if (!existsSync(join(dir, 'package.json'))) continue;
    checked += 1;
    problems.push(...checkGame(dir, game.name));
  }

  if (problems.length === 0) {
    console.log(`OK: asset licenses documented for ${checked} game(s).`);
    return;
  }

  console.error('\nAsset license check failed\n' + '─'.repeat(64));
  for (const problem of problems) {
    console.error(`  [${problem.game}] ${problem.detail}`);
  }
  console.error('─'.repeat(64));
  console.error(
    '\nEvery shipped asset needs source, author, license, URL, and AI provenance.',
  );
  console.error('See docs/assets.md and games/_template/assets/LICENSES.md.\n');
  process.exit(1);
}

main();
