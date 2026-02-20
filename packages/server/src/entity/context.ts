import type { ModelDef } from '@vertz/db';
import type { EntityOperations } from './entity-operations';
import type { EntityContext } from './types';

/**
 * Request info extracted from HTTP context / auth middleware.
 */
export interface RequestInfo {
  readonly userId?: string | null;
  readonly tenantId?: string | null;
  readonly roles?: readonly string[];
}

/**
 * Creates an EntityContext from request info, entity operations, and registry proxy.
 */
export function createEntityContext<TModel extends ModelDef = ModelDef>(
  request: RequestInfo,
  entityOps: EntityOperations<TModel>,
  registryProxy: Record<string, EntityOperations>,
): EntityContext<TModel> {
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
    entity: entityOps,
    entities: registryProxy,
  };
}
