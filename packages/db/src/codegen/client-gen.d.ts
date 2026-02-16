/**
 * Client generation for DB client codegen.
 *
 * This module generates the typed database client.
 */
import { type DomainDefinition } from './type-gen';
/**
 * Generate the typed database client from domain definitions.
 * This function should generate:
 * - A db object with entity accessors
 * - Each entity has: list, get, create, update, delete methods
 * - Typed filter/where parameters
 * - Relation accessors
 */
export declare function generateClient(domains: DomainDefinition[]): string;
//# sourceMappingURL=client-gen.d.ts.map
