import { deepFreeze } from '../immutability';

function validateOwnership(items, kind, expectedModule) {
  for (const item of items) {
    if (item.moduleName !== expectedModule) {
      throw new Error(
        `${kind} belongs to module "${item.moduleName}", cannot add to module "${expectedModule}"`,
      );
    }
  }
}
export function createModule(definition, config) {
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
//# sourceMappingURL=module.js.map
