import type { PortalAdapter } from './types.ts';
import { activeAdapter } from './active-adapter.ts';

export type { PortalAdapter, PortalName, AdapterOptions } from './types.ts';
export { audioBus } from './audio-bus.ts';
export { LocalAdapter } from './adapters/LocalAdapter.ts';

/**
 * Builds the adapter for the portal this bundle was built for.
 *
 * The selection happens in module resolution, not here: the
 * `ucgames:portal-adapter` Vite plugin swaps `./active-adapter.ts` for the
 * variant matching the PORTAL env var, so only that adapter enters the module
 * graph. A CrazyGames build contains no Poki code at all.
 *
 * This has to be a build-time decision rather than a runtime `switch`, because
 * a switch keeps a live reference to all four adapter classes and ships every
 * SDK wrapper in every bundle — verified by inspecting the output, not assumed.
 * Bytes are conversion, and conversion is revenue.
 */
export function createPortalAdapter(): PortalAdapter {
  return activeAdapter();
}

/**
 * Creates the adapter and initialises it.
 *
 * Resolves even when the SDK fails to load — see PortalAdapter.init(). Games
 * should await this once, before the preload scene finishes, and then never
 * think about portals again.
 */
export async function initPortal(): Promise<PortalAdapter> {
  const adapter = createPortalAdapter();
  await adapter.init();
  return adapter;
}
