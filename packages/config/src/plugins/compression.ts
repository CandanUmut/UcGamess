import { brotliCompress, gzip, constants as zlibConstants } from 'node:zlib';
import { promisify } from 'node:util';
import type { Plugin } from 'vite';

const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

/** Extensions worth compressing. Images and audio are already compressed. */
const COMPRESSIBLE = /\.(js|mjs|css|html|json|svg|wasm|txt|xml)$/i;

/** Below this, the compressed file plus its request overhead is not a win. */
const MIN_BYTES = 1024;

export interface CompressedAsset {
  fileName: string;
  raw: number;
  gzip: number;
  brotli: number;
}

export interface CompressionPluginOptions {
  /**
   * Called once after the bundle is written, with the size of every emitted
   * asset. packages/devtools/size-budget.ts consumes this to enforce the
   * download budget without having to re-compress anything.
   */
  onReport?: (assets: CompressedAsset[]) => void | Promise<void>;
}

/**
 * Emits .gz and .br siblings for every compressible build asset and reports
 * exact byte counts.
 *
 * We write our own rather than pulling a plugin dependency because the logic is
 * ~40 lines of node:zlib and because the size report is the input to our CI
 * budget gate — we want to own that number end to end. Portals and their CDNs
 * serve the pre-compressed sibling when the browser advertises support, so
 * brotli size is the number that actually maps to conversion-to-play.
 */
export function compression(options: CompressionPluginOptions = {}): Plugin {
  return {
    name: 'ucgames:compression',
    apply: 'build',
    enforce: 'post',

    async writeBundle(outputOptions, bundle) {
      const outDir = outputOptions.dir;
      if (!outDir) return;

      const { writeFile } = await import('node:fs/promises');
      const { join } = await import('node:path');

      const assets: CompressedAsset[] = [];

      for (const [fileName, chunk] of Object.entries(bundle)) {
        const source =
          chunk.type === 'chunk'
            ? Buffer.from(chunk.code)
            : Buffer.from(typeof chunk.source === 'string' ? chunk.source : chunk.source);

        const raw = source.byteLength;

        if (!COMPRESSIBLE.test(fileName) || raw < MIN_BYTES) {
          assets.push({ fileName, raw, gzip: raw, brotli: raw });
          continue;
        }

        const [gz, br] = await Promise.all([
          gzipAsync(source, { level: 9 }),
          brotliAsync(source, {
            params: {
              [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
              [zlibConstants.BROTLI_PARAM_SIZE_HINT]: raw,
            },
          }),
        ]);

        await Promise.all([
          writeFile(join(outDir, `${fileName}.gz`), gz),
          writeFile(join(outDir, `${fileName}.br`), br),
        ]);

        assets.push({
          fileName,
          raw,
          gzip: gz.byteLength,
          brotli: br.byteLength,
        });
      }

      await options.onReport?.(assets);
    },
  };
}
