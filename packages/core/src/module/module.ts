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
  for (const service of config.services) {
    if (service.moduleName !== definition.name) {
      throw new Error(
        `Service belongs to module "${service.moduleName}", cannot add to module "${definition.name}"`,
      );
    }
  }

  for (const router of config.routers) {
    if (router.moduleName !== definition.name) {
      throw new Error(
        `Router belongs to module "${router.moduleName}", cannot add to module "${definition.name}"`,
      );
    }
  }

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
