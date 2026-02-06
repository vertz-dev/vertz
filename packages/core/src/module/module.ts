import { deepFreeze } from '../immutability';
import type { NamedModuleDef } from './module-def';
import type { NamedServiceDef } from './service';
import type { NamedRouterDef } from './router-def';

export interface NamedModule {
  definition: NamedModuleDef;
  services: NamedServiceDef[];
  routers: NamedRouterDef[];
  exports: NamedServiceDef[];
}

export function createModule(
  definition: NamedModuleDef,
  config: {
    services: NamedServiceDef[];
    routers: NamedRouterDef[];
    exports: NamedServiceDef[];
  },
): NamedModule {
  for (const exp of config.exports) {
    if (!config.services.includes(exp)) {
      throw new Error('exports must be a subset of services');
    }
  }

  return deepFreeze({
    definition,
    ...config,
  });
}
