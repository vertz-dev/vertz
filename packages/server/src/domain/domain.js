// @vertz/server/domain - STUB for TDD red phase
// Minimal stub implementation to allow tests to pass structure/contract tests
// Real implementation will replace this with full business logic.
/**
 * STUB: domain() function for TDD red phase
 * This returns a properly shaped, frozen object that passes all structure tests.
 * Business logic (CRUD generation, access enforcement, etc.) will be implemented next.
 */
export function domain(name, options) {
  // Handle missing parameters gracefully for tests with @ts-expect-error
  // TypeScript will catch these at compile time, but tests may execute at runtime
  if (!name || !options) {
    // Return a minimal valid object to satisfy runtime tests
    return Object.freeze({
      name: name || '',
      type: 'persisted',
      table: null,
      exposedRelations: {},
      access: {},
      handlers: {},
      actions: {},
    });
  }
  // STUB: Build definition object
  const def = {
    name,
    type: options.type,
    table: options.table,
    exposedRelations: options.expose || {},
    access: options.access || {},
    handlers: options.handlers || {},
    actions: options.actions || {},
  };
  // Freeze to make immutable (satisfy immutability tests)
  return Object.freeze(def);
}
//# sourceMappingURL=domain.js.map
