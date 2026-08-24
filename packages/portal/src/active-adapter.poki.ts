import type { PortalAdapter } from './types.ts';
import { PokiAdapter } from './adapters/PokiAdapter.ts';

/** Built by `PORTAL=poki`. See active-adapter.ts. */
export function activeAdapter(): PortalAdapter {
  return new PokiAdapter();
}
