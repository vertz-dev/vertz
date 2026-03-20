/**
 * Factory for creating the appropriate wallet store based on cloud config.
 *
 * - failMode 'cached' → CachedWalletStore(CloudWalletStore)
 * - failMode 'closed' or 'open' → plain CloudWalletStore
 */

import type { WalletStore } from '../wallet-store';
import { CachedWalletStore } from './cached-wallet-store';
import type { CloudConfig } from './cloud-config';
import { CloudWalletStore } from './cloud-wallet-store';

export function createCloudWalletStore(config: CloudConfig): WalletStore {
  const inner = new CloudWalletStore(config);

  if (config.failMode === 'cached') {
    return new CachedWalletStore(inner);
  }

  return inner;
}
