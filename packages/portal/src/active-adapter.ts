import type { PortalAdapter } from './types.ts';
import { LocalAdapter } from './adapters/LocalAdapter.ts';

/**
 * The adapter this build uses.
 *
 * This file is the `local` variant and the default. At build time the
 * `ucgames:portal-adapter` Vite plugin swaps it for `active-adapter.<portal>.ts`
 * based on the PORTAL env var, so exactly one adapter ends up in the bundle.
 *
 * Do not add a runtime switch here. Every adapter referenced from this module
 * ships in every build, which is how a CrazyGames build ends up carrying Poki's
 * SDK wrapper.
 */
export function activeAdapter(): PortalAdapter {
  return new LocalAdapter();
}
