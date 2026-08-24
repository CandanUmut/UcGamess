#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAMES_DIR = join(REPO_ROOT, 'games');

const PORTALS = ['local', 'crazygames', 'poki', 'gamedistribution'] as const;

/**
 * Builds games for a given portal.
 *
 * Exists because `PORTAL=crazygames pnpm build` does not work in cmd.exe or
 * PowerShell, and half this team is on Windows. Setting the variable in Node
 * and spawning vite works identically everywhere, with no cross-env dependency.
 *
 *   node scripts/build.ts                        # all games, local adapter
 *   node scripts/build.ts --portal crazygames    # all games, CrazyGames
 *   node scripts/build.ts --portal poki --game snowball
 */
function main(): void {
  const { values } = parseArgs({
    options: {
      portal: { type: 'string', short: 'p', default: 'local' },
      game: { type: 'string', short: 'g' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(
      [
        'Usage: node scripts/build.ts [--portal <name>] [--game <slug>]',
        '',
        `  --portal  ${PORTALS.join(' | ')}   (default: local)`,
        '  --game    build only this game directory (default: all)',
      ].join('\n'),
    );
    return;
  }

  const portal = String(values.portal);
  if (!(PORTALS as readonly string[]).includes(portal)) {
    console.error(`Unknown portal "${portal}". Expected: ${PORTALS.join(', ')}`);
    process.exit(1);
  }

  const games = values.game
    ? [String(values.game)]
    : readdirSync(GAMES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

  if (games.length === 0) {
    console.error('No games found in games/.');
    process.exit(1);
  }

  let failed = 0;

  for (const game of games) {
    const cwd = join(GAMES_DIR, game);
    if (!existsSync(join(cwd, 'package.json'))) {
      console.warn(`Skipping games/${game} — no package.json`);
      continue;
    }

    console.log(`\n=== Building ${game} for portal "${portal}" ===`);

    const result = spawnSync('pnpm', ['run', 'build'], {
      cwd,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, PORTAL: portal },
    });

    if (result.status !== 0) {
      console.error(`Build failed for ${game}`);
      failed += 1;
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} build(s) failed.`);
    process.exit(1);
  }
}

main();
