import { deepFreeze } from '../immutability';
export function createServiceDef(moduleName, config) {
  return deepFreeze({
    ...config,
    moduleName,
  });
}
//# sourceMappingURL=service.js.map
