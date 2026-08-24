import type { PortalAdapter } from './types.ts';
import { GameDistributionAdapter } from './adapters/GameDistributionAdapter.ts';

/** Built by `PORTAL=gamedistribution`. See active-adapter.ts. */
export function activeAdapter(): PortalAdapter {
  return new GameDistributionAdapter();
}
