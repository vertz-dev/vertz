/**
 * Shared enum registry — define enums once, reuse across tables.
 *
 * @example
 * ```ts
 * const enums = createEnumRegistry({
 *   status: ['active', 'inactive', 'pending'],
 *   role: ['admin', 'editor', 'viewer'],
 * } as const);
 *
 * const orders = d.table('orders', {
 *   status: d.enum('status', enums.status),
 * });
 * const users = d.table('users', {
 *   role: d.enum('role', enums.role),
 * });
 * ```
 */
/**
 * Creates a shared enum registry from a map of enum names to their values.
 * The returned object can be passed directly to `d.enum(name, enums.myEnum)`.
 */
export function createEnumRegistry(definitions) {
  const registry = {};
  for (const [name, values] of Object.entries(definitions)) {
    registry[name] = { name, values };
  }
  return registry;
}
//# sourceMappingURL=enum-registry.js.map
