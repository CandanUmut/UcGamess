import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig, type UserConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { compression, type CompressedAsset } from './plugins/compression.ts';
import { portalAdapter } from './plugins/portal-adapter.ts';

/** Portals we can build for. Selected at build time, never at runtime. */
export const PORTALS = ['local', 'crazygames', 'poki', 'gamedistribution'] as const;
export type PortalName = (typeof PORTALS)[number];

export interface GameConfigOptions {
  /** Directory name of the game, e.g. "game-template". Used for output paths. */
  slug: string;
  /** Extra Vite config merged on top of the base. Rarely needed. */
  overrides?: UserConfig;
}

function resolvePortal(): PortalName {
  const raw = (process.env.PORTAL ?? 'local').toLowerCase();
  if (!(PORTALS as readonly string[]).includes(raw)) {
    throw new Error(
      `Unknown PORTAL="${raw}". Expected one of: ${PORTALS.join(', ')}.\n` +
        `Usage: PORTAL=crazygames pnpm build`,
    );
  }
  return raw as PortalName;
}

/**
 * The shared Vite config every game builds on.
 *
 * Three things here are load-bearing and should not be changed per-game:
 *
 *  1. `base: './'` — portals embed games in an iframe at a path we do not
 *     control. Absolute asset URLs 404 in that context, which reads to a
 *     reviewer as a broken game.
 *  2. `__UCGAMES_PORTAL__` is replaced with a string literal so the adapter
 *     branch collapses at build time and the three unused adapters are
 *     tree-shaken out. Selecting an adapter at runtime would ship all four.
 *  3. The compression plugin's report feeds the CI size budget. Removing it
 *     removes the gate.
 */
export function defineGameConfig(options: GameConfigOptions) {
  const portal = resolvePortal();
  const shouldVisualize = process.env.VISUALIZE === '1';

  return defineConfig(({ command }) => {
    const isBuild = command === 'build';

    const config: UserConfig = {
      base: './',

      define: {
        __UCGAMES_PORTAL__: JSON.stringify(portal),
        __UCGAMES_GAME_SLUG__: JSON.stringify(options.slug),
        __UCGAMES_DEV__: JSON.stringify(!isBuild),
      },

      build: {
        outDir: 'dist',
        emptyOutDir: true,

        // Safari is a documented rejection cause. es2020 + safari14 keeps the
        // output within what every browser we claim to support can parse,
        // without dragging in legacy polyfills we would then have to ship.
        target: ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'],

        minify: 'terser',
        terserOptions: {
          compress: {
            passes: 2,
            drop_debugger: true,
            // Strip chatty logging but keep console.warn/error. Portals check
            // for console errors during review, and when one does fire we want
            // to see it in a real submission build rather than have it silently
            // removed — a stripped error is a bug we cannot reproduce.
            pure_funcs: ['console.log', 'console.debug', 'console.info'],
          },
          format: { comments: false },
        },

        // Fewer requests is a measurable conversion win — the Poki case study
        // for Cannon Clash landed at 76 requests total. Inlining anything
        // under 8 KB trades a round trip for a few hundred bytes of base64.
        assetsInlineLimit: 8192,

        cssCodeSplit: false,
        sourcemap: false,
        reportCompressedSize: true,

        rollupOptions: {
          output: {
            // Phaser changes far less often than game code. A stable vendor
            // chunk means a returning player re-downloads only the game.
            manualChunks(id: string) {
              if (id.includes('node_modules/phaser')) return 'phaser';
              return undefined;
            },
            entryFileNames: 'assets/[name]-[hash].js',
            chunkFileNames: 'assets/[name]-[hash].js',
            assetFileNames: 'assets/[name]-[hash][extname]',
          },
        },
      },

      plugins: [
        portalAdapter(portal),

        compression({
          async onReport(assets: CompressedAsset[]) {
            const report = {
              slug: options.slug,
              portal,
              generatedAt: new Date().toISOString(),
              assets,
              totals: {
                raw: assets.reduce((n, a) => n + a.raw, 0),
                gzip: assets.reduce((n, a) => n + a.gzip, 0),
                brotli: assets.reduce((n, a) => n + a.brotli, 0),
              },
            };
            await writeFile(
              join(process.cwd(), 'dist', 'size-report.json'),
              JSON.stringify(report, null, 2),
              'utf8',
            );
          },
        }),

        ...(shouldVisualize
          ? [
              visualizer({
                filename: 'dist/stats.html',
                gzipSize: true,
                brotliSize: true,
                template: 'treemap' as const,
              }),
            ]
          : []),
      ],

      server: {
        port: 5173,
        host: true, // so a real phone on the LAN can load it
        open: true,
      },

      preview: {
        port: 4173,
        host: true,
      },
    };

    return options.overrides ? mergeShallow(config, options.overrides) : config;
  });
}

/** Small, predictable merge. Vite's mergeConfig pulls in more than we need. */
function mergeShallow(base: UserConfig, extra: UserConfig): UserConfig {
  return {
    ...base,
    ...extra,
    define: { ...base.define, ...extra.define },
    build: { ...base.build, ...extra.build },
    plugins: [...(base.plugins ?? []), ...(extra.plugins ?? [])],
  };
}
