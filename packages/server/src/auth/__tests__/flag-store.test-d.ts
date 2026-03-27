import type { FlagStore } from '../flag-store';

declare const store: FlagStore;

// Positive: new 4-arg API compiles
store.setFlag('tenant', 'org-1', 'beta', true);
store.getFlag('tenant', 'org-1', 'beta');
store.getFlags('tenant', 'org-1');

// Negative: old 3-arg API should not compile
// @ts-expect-error — old setFlag(tenantId, flag, enabled) signature
store.setFlag('org-1', 'beta', true);

// @ts-expect-error — old getFlag(tenantId, flag) signature
store.getFlag('org-1', 'beta');

// @ts-expect-error — old getFlags(tenantId) signature
store.getFlags('org-1');
