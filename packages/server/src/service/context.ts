import type { RequestInfo } from '../entity/context';
import type { EntityOperations } from '../entity/entity-operations';
import type { ServiceContext } from './types';

/**
 * Creates a ServiceContext from request info and registry proxy.
 * Mirrors createEntityContext() but without the `entity` (self-CRUD) property.
 */
export function createServiceContext(
  request: RequestInfo,
  registryProxy: Record<string, EntityOperations>,
): ServiceContext {
  const userId = request.userId ?? null;
  const roles = request.roles ?? [];
  const tenantId = request.tenantId ?? null;

  return {
    userId,
    authenticated() {
      return userId !== null;
    },
    tenant() {
      return tenantId !== null;
    },
    role(...rolesToCheck: string[]) {
      return rolesToCheck.some((r) => roles.includes(r));
    },
    entities: registryProxy,
  };
}
