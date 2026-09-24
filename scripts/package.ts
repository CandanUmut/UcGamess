#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { crc32, deflateRawSync } from 'node:zlib';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Builds one game for each portal and zips every build, ready to upload.
 *
 *   node scripts/package.ts --game beeline
 *   node scripts/package.ts --game beeline --portal crazygames,web --out release
 *
 * Writes `<out>/<game>-<portal>.zip`, with `index.html` at the root of the
 * archive — the layout both the CrazyGames developer portal and itch.io expect
 * for an HTML5 upload. Each build still goes through the size budget, so a zip
 * only exists for a build that passed it.
 *
 * The zip writer is hand-rolled (deflate from node:zlib, about forty lines)
 * rather than a dependency or the `zip` binary, which Windows does not have.
 */
function main(): void {
  const { values } = parseArgs({
    options: {
      game: { type: 'string', short: 'g' },
      portal: { type: 'string', short: 'p', default: 'crazygames,web' },
      out: { type: 'string', short: 'o', default: 'release' },
    },
  });
  const game = values.game;
  if (!game) {
    console.error(
      'Usage: node scripts/package.ts --game <slug> [--portal a,b] [--out dir]',
    );
    process.exit(1);
  }

  const out = join(REPO_ROOT, String(values.out));
  mkdirSync(out, { recursive: true });
  const dist = join(REPO_ROOT, 'games', game, 'dist');

  for (const portal of String(values.portal).split(',')) {
    const build = spawnSync(
      process.execPath,
      [join(REPO_ROOT, 'scripts', 'build.ts'), '--portal', portal, '--game', game],
      { stdio: 'inherit' },
    );
    if (build.status !== 0) {
      console.error(`Build of ${game} for ${portal} failed; nothing packaged.`);
      process.exit(build.status ?? 1);
    }
    const target = join(out, `${game}-${portal}.zip`);
    const bytes = zipDirectory(dist);
    writeFileSync(target, bytes);
    console.log(
      `packaged ${relative(REPO_ROOT, target)} (${(bytes.length / 1024).toFixed(0)} KB)`,
    );
  }
}

const SKIP = /\.(br|gz)$|^size-report\.json$/;

function listFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      // Precompressed twins and the size report are for our own server and CI;
      // portals serve exactly what is uploaded.
      else if (entry.isFile() && !SKIP.test(entry.name)) files.push(path);
    }
  };
  walk(root);
  return files.sort();
}

/**
 * A plain PKZIP archive of `root`. Timestamps are fixed at 1980-01-01 so the
 * same build zips to the same bytes.
 */
function zipDirectory(root: string): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of listFiles(root)) {
    const name = Buffer.from(relative(root, file).split(sep).join('/'), 'utf8');
    const data = readFileSync(file);
    const packed = deflateRawSync(data, { level: 9 });
    const stored = packed.length >= data.length;
    const body = stored ? data : packed;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date: 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    local.copy(central, 6, 4, 30); // the shared fields, verbatim
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, body);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

main();
