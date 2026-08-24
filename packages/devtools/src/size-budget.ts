#!/usr/bin/env node
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { parseArgs } from 'node:util';

/**
 * Initial-download budget, in bytes of the compressed payload.
 *
 * These numbers come from the market research, not from taste. Poki's own data
 * (Kasper Mol, W3C Games Workshop "Size Matters") puts a ~10 MB initial
 * download at roughly 80% conversion-to-play in the US, and conversion-to-play
 * maps directly to revenue. Poki targets under 8 MB; the Cannon Clash case
 * study hit 81% conversion at 2.4 MB.
 *
 * So: 5 MB is the number we actually want, 8 MB is the number that fails the
 * build. CrazyGames is far more lenient (50 MB, 20 MB for mobile homepage
 * eligibility) but we hold the stricter line everywhere so a game can move
 * between portals without a re-optimisation project.
 */
const WARN_BYTES = 5 * 1024 * 1024;
const FAIL_BYTES = 8 * 1024 * 1024;

/**
 * What counts toward "initial download".
 *
 * Everything the browser must fetch before the game is playable: the HTML, the
 * JS, the CSS, and every asset in the public directory — because Phaser's
 * preloader pulls those before the menu appears. Source maps and our own
 * .gz/.br siblings are excluded; they are never both downloaded.
 */
const EXCLUDED_EXTENSIONS = new Set(['.map', '.gz', '.br']);
const EXCLUDED_FILES = new Set(['size-report.json', 'stats.html', 'LICENSES.md']);

interface FileSize {
  path: string;
  raw: number;
  /** Bytes actually sent over the wire: the .br sibling if we emitted one. */
  wire: number;
}

function collect(dir: string, base = dir): FileSize[] {
  const results: FileSize[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...collect(full, base));
      continue;
    }

    if (EXCLUDED_EXTENSIONS.has(extname(entry.name))) continue;
    if (EXCLUDED_FILES.has(entry.name)) continue;

    const raw = statSync(full).size;

    // Portals and their CDNs serve the pre-compressed sibling when the browser
    // advertises support, which every browser we target does. Measuring the
    // uncompressed file would overstate the real cost by 3-4x and make the
    // budget meaningless.
    const brotli = `${full}.br`;
    const wire = existsSync(brotli) ? statSync(brotli).size : raw;

    results.push({ path: relative(base, full).replace(/\\/g, '/'), raw, wire });
  }

  return results;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string', short: 'd', default: 'dist' },
      warn: { type: 'string' },
      fail: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
  });

  const dir = String(values.dir);
  const warnLimit = values.warn ? Number(values.warn) : WARN_BYTES;
  const failLimit = values.fail ? Number(values.fail) : FAIL_BYTES;

  if (!existsSync(dir)) {
    console.error(`size-budget: "${dir}" does not exist. Run the build first.`);
    process.exit(1);
  }

  const files = collect(dir).sort((a, b) => b.wire - a.wire);
  const total = files.reduce((sum, f) => sum + f.wire, 0);
  const rawTotal = files.reduce((sum, f) => sum + f.raw, 0);

  if (values.json) {
    console.log(JSON.stringify({ total, rawTotal, files }, null, 2));
  } else {
    console.log('\nInitial download budget');
    console.log('─'.repeat(64));

    for (const file of files.slice(0, 12)) {
      const share = total === 0 ? 0 : (file.wire / total) * 100;
      console.log(
        `  ${formatBytes(file.wire).padStart(10)}  ${share.toFixed(1).padStart(5)}%  ${file.path}`,
      );
    }
    if (files.length > 12) {
      console.log(`  ${' '.repeat(10)}         … and ${files.length - 12} more`);
    }

    console.log('─'.repeat(64));
    console.log(`  Total (brotli):   ${formatBytes(total)}`);
    console.log(`  Total (raw):      ${formatBytes(rawTotal)}`);
    console.log(`  Warn threshold:   ${formatBytes(warnLimit)}`);
    console.log(`  Fail threshold:   ${formatBytes(failLimit)}`);
    console.log('');
  }

  if (total > failLimit) {
    console.error(
      `FAIL: initial download is ${formatBytes(total)}, over the ${formatBytes(failLimit)} hard ceiling.\n` +
        `      Portals reject on load size. Cut assets or split non-essential content\n` +
        `      into a post-menu load before this can ship.\n`,
    );
    process.exit(1);
  }

  if (total > warnLimit) {
    console.warn(
      `WARNING: initial download is ${formatBytes(total)}, over the ${formatBytes(warnLimit)} target.\n` +
        `         Still shippable, but every megabyte costs conversion-to-play.\n` +
        `         Run \`VISUALIZE=1 pnpm build\` in the game directory to see what is big.\n`,
    );
    return;
  }

  console.log(`OK: ${formatBytes(total)} initial download, within budget.\n`);
}

main();
