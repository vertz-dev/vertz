/**
 * Domain definition utilities for DB client codegen.
 */
/**
 * Define a domain for DB client codegen.
 * This creates a domain definition that can be used to generate types and client.
 */
export function defineDomain(name, config) {
  return {
    name,
    fields: config.fields,
    relations: config.relations,
  };
}
export { generateClient, generateTypes } from './codegen';
//# sourceMappingURL=domain.js.map
