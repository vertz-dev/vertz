/**
 * Entity Access — computes per-entity access metadata.
 *
 * Used by handlers to pre-compute entitlement checks for entities,
 * enabling client-side can(entitlement, entity) without network requests.
 * This is opt-in: developers choose which entitlements to pre-compute
 * per entity, avoiding N+1 patterns.
 */

import type { AccessContext } from './access-context';
import type { AccessCheckData } from './access-set';

/**
 * Compute access metadata for a specific entity.
 *
 * @param entitlements - Entitlement names to check
 * @param entity - The resource to check against
 * @param accessContext - The server-side access context
 * @returns Record of entitlement name to AccessCheckData (client-compatible shape)
 */
export async function computeEntityAccess(
  entitlements: string[],
  entity: { type: string; id: string },
  accessContext: AccessContext,
): Promise<Record<string, AccessCheckData>> {
  const results: Record<string, AccessCheckData> = {};

  for (const entitlement of entitlements) {
    results[entitlement] = await accessContext.check(entitlement, {
      type: entity.type,
      id: entity.id,
    });
  }

  return results;
}
