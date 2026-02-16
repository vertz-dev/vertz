import { deepFreeze } from '../immutability';
import { createRouterDef } from './router-def';
import { createServiceDef } from './service';
export function createModuleDef(config) {
  const def = {
    ...config,
    service: (serviceConfig) => createServiceDef(config.name, serviceConfig),
    router: (routerConfig) => createRouterDef(config.name, routerConfig),
  };
  return deepFreeze(def);
}
//# sourceMappingURL=module-def.js.map
