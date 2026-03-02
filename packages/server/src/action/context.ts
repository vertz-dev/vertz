import type { RequestInfo } from '../entity/context';
import type { EntityOperations } from '../entity/entity-operations';
import type { ActionContext } from './types';

/**
 * Creates an ActionContext from request info and registry proxy.
 * Mirrors createEntityContext() but without the `entity` (self-CRUD) property.
 */
export function createActionContext(
  request: RequestInfo,
  registryProxy: Record<string, EntityOperations>,
): ActionContext {
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
