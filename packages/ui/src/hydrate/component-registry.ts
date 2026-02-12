/** A function returning a dynamic import of a component module. */
export type ComponentLoader = () => Promise<{ default: ComponentFunction }>;

/** A component function that takes props and an element to mount into. */
export type ComponentFunction = (props: Record<string, unknown>, el: Element) => void;

/** Maps component IDs to their dynamic import loaders. */
export type ComponentRegistry = Record<string, ComponentLoader>;

/**
 * Resolves a component ID to its module's default export.
 *
 * Throws if the component ID is not found in the registry.
 */
export async function resolveComponent(
  registry: ComponentRegistry,
  componentId: string,
): Promise<ComponentFunction> {
  const loader = registry[componentId];
  if (!loader) {
    throw new TypeError(`[hydrate] Component "${componentId}" not found in registry`);
  }

  const mod = await loader();
  return mod.default;
}
