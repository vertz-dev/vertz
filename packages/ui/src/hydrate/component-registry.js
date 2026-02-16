/**
 * Resolves a component ID to its module's default export.
 *
 * Throws if the component ID is not found in the registry.
 */
export async function resolveComponent(registry, componentId) {
  const loader = registry[componentId];
  if (!loader) {
    throw new TypeError(`[hydrate] Component "${componentId}" not found in registry`);
  }
  const mod = await loader();
  return mod.default;
}
//# sourceMappingURL=component-registry.js.map
