import type { RequestInfo } from '../entity/context';
import type { EntityOperations } from '../entity/entity-operations';
import type { ServiceContext, ServiceRequestInfo } from './types';

/**
 * Creates a ServiceContext from request info and registry proxy.
 * Mirrors createEntityContext() but without the `entity` (self-CRUD) property.
 */
export function createServiceContext(
  request: RequestInfo,
  registryProxy: Record<string, EntityOperations>,
  rawRequest?: ServiceRequestInfo,
): ServiceContext {
  const userId = request.userId ?? null;
  const roles = request.roles ?? [];
  const tenantId = request.tenantId ?? null;
  const tenantLevel = request.tenantLevel ?? null;

  return {
    userId,
    tenantId,
    tenantLevel,
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
    request: rawRequest
      ? { ...rawRequest, params: rawRequest.params ?? {} }
      : { url: '', method: '', headers: new Headers(), body: undefined, params: {} },
  };
}
