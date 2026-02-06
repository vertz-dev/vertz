import { deepFreeze } from '../immutability';
import type { NamedModuleDef } from './module-def';
import type { NamedRouterDef } from './router-def';
import type { NamedServiceDef } from './service';

export interface NamedModule {
  definition: NamedModuleDef;
  services: NamedServiceDef[];
  routers: NamedRouterDef[];
  exports: NamedServiceDef[];
}

function validateOwnership(
  items: { moduleName: string }[],
  kind: string,
  expectedModule: string,
): void {
  for (const item of items) {
    if (item.moduleName !== expectedModule) {
      throw new Error(
        `${kind} belongs to module "${item.moduleName}", cannot add to module "${expectedModule}"`,
      );
    }
  }
}

export function createModule(
  definition: NamedModuleDef,
  config: {
    services: NamedServiceDef[];
    routers: NamedRouterDef[];
    exports: NamedServiceDef[];
  },
): NamedModule {
  validateOwnership(config.services, 'Service', definition.name);
  validateOwnership(config.routers, 'Router', definition.name);

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
