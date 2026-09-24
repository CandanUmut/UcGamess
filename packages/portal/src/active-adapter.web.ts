import type { PortalAdapter } from './types.ts';
import { WebAdapter } from './adapters/WebAdapter.ts';

/** Built by `PORTAL=web`: self-hosted builds with no SDK and no ads. See active-adapter.ts. */
export function activeAdapter(): PortalAdapter {
  return new WebAdapter();
}
