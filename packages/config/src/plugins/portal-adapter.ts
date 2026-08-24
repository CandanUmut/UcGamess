import type { Plugin } from 'vite';

/** Module every game reaches the portal through. Swapped at build time. */
const ACTIVE_ADAPTER_SUFFIX = 'portal/src/active-adapter.ts';

export type PortalTarget = 'local' | 'crazygames' | 'poki' | 'gamedistribution';

/**
 * Replaces `@ucgames/portal`'s active-adapter module with the variant for the
 * portal being built.
 *
 * The obvious implementation — a `switch` on a build-time constant — does not
 * work. Vite substitutes the constant, but the switch still references all four
 * adapter classes, so Rollup keeps every one of them and the CrazyGames build
 * ships Poki's SDK wrapper. That was measured, not assumed: before this plugin,
 * a `local` build contained the strings "PokiSDK", "crazygames-sdk" and
 * "gamedistribution".
 *
 * Rewriting the module resolution instead means only the chosen adapter is ever
 * in the module graph, so the others cannot be included whatever the minifier
 * decides to do. Each variant is a real file that typechecks on its own.
 */
export function portalAdapter(portal: PortalTarget): Plugin {
  return {
    name: 'ucgames:portal-adapter',
    enforce: 'pre',

    async resolveId(source, importer, options) {
      // Only the canonical module is redirected; the variants resolve normally.
      if (!source.includes('active-adapter')) return null;

      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (!resolved) return null;

      const id = resolved.id.replace(/\\/g, '/');
      if (!id.endsWith(ACTIVE_ADAPTER_SUFFIX)) return null;

      // 'local' is what the canonical file already contains.
      if (portal === 'local') return resolved.id;

      return id.replace(/active-adapter\.ts$/, `active-adapter.${portal}.ts`);
    },
  };
}
