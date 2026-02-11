export type { ComponentFunction, ComponentLoader, ComponentRegistry } from './component-registry';
export { resolveComponent } from './component-registry';
export { hydrate } from './hydrate';
export { deserializeProps } from './props-deserializer';
export { eagerStrategy, interactionStrategy, lazyStrategy } from './strategies';
