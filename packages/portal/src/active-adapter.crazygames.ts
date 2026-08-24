import type { PortalAdapter } from './types.ts';
import { CrazyGamesAdapter } from './adapters/CrazyGamesAdapter.ts';

/** Built by `PORTAL=crazygames`. See active-adapter.ts. */
export function activeAdapter(): PortalAdapter {
  return new CrazyGamesAdapter();
}
