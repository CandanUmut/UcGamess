#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_DIR = join(REPO_ROOT, 'games', '_template');
const GAMES_DIR = join(REPO_ROOT, 'games');

/** Directories never worth copying into a fresh game. */
const SKIP = new Set(['node_modules', 'dist', '.vite', 'coverage']);

/**
 * Scaffolds a new game from games/_template.
 *
 *   pnpm create-game snowball-rush
 *
 * The template is a working game that already passes every gate, so a fresh
 * scaffold is playable and shippable from the first commit. That is deliberate:
 * the expensive failure mode for a two-person studio is spending week one on
 * infrastructure instead of on whether the mechanic is fun.
 *
 * The workspace itself needs no edit — pnpm-workspace.yaml globs `games/*`.
 */

function toSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toTitle(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function rewriteFile(path: string, replacements: Array<[RegExp, string]>): void {
  let content = readFileSync(path, 'utf8');
  let changed = false;

  for (const [pattern, replacement] of replacements) {
    const next = content.replace(pattern, replacement);
    if (next !== content) {
      content = next;
      changed = true;
    }
  }

  if (changed) writeFileSync(path, content, 'utf8');
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function main(): void {
  const raw = process.argv[2];

  if (!raw || raw === '--help' || raw === '-h') {
    console.log(
      [
        'Usage: pnpm create-game <slug>',
        '',
        'Example:',
        '  pnpm create-game snowball-rush',
        '',
        'Creates games/<slug> from games/_template, renames the package, and',
        'leaves you a playable game. Run `pnpm install` afterwards to link it.',
      ].join('\n'),
    );
    process.exit(raw ? 0 : 1);
  }

  const slug = toSlug(raw);
  if (!slug) {
    console.error(`"${raw}" does not reduce to a usable slug.`);
    process.exit(1);
  }
  if (slug !== raw) {
    console.log(`Normalised "${raw}" to "${slug}".`);
  }
  if (slug.startsWith('_')) {
    console.error('Slugs starting with "_" are reserved for templates.');
    process.exit(1);
  }

  const target = join(GAMES_DIR, slug);
  if (existsSync(target)) {
    console.error(`games/${slug} already exists. Pick another name.`);
    process.exit(1);
  }
  if (!existsSync(TEMPLATE_DIR)) {
    console.error('games/_template is missing — cannot scaffold.');
    process.exit(1);
  }

  cpSync(TEMPLATE_DIR, target, {
    recursive: true,
    filter: (src) => {
      const name = src.split(/[\\/]/).pop() ?? '';
      return !SKIP.has(name);
    },
  });

  const title = toTitle(slug);

  for (const file of walk(target)) {
    // Only rewrite text we control; skip binaries.
    if (!/\.(ts|json|html|md)$/.test(file)) continue;
    if (statSync(file).size > 512 * 1024) continue;

    rewriteFile(file, [
      [/@ucgames\/game-template/g, `@ucgames/game-${slug}`],
      [/game-template/g, slug],
      [/UC Games Template/g, title],
      [/game-template/g, slug],
    ]);
  }

  // The template's license manifest documents the template's own asset; a new
  // game inherits the file (and the logo) but should own the wording.
  const licenses = join(target, 'assets', 'LICENSES.md');
  if (existsSync(licenses)) {
    rewriteFile(licenses, [[/^# Asset licenses — .*$/m, `# Asset licenses — ${slug}`]]);
  }

  console.log(
    [
      '',
      `Created games/${slug}`,
      '',
      'Next:',
      '  pnpm install',
      `  pnpm --filter @ucgames/game-${slug} dev`,
      '',
      'Before you write any gameplay, read:',
      '  docs/design-rules.md        — what makes a game pass a portal review',
      '  docs/submission-checklist.md — the gate it has to clear to ship',
      '',
    ].join('\n'),
  );
}

main();
