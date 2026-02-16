/**
 * Type generation for DB client codegen.
 *
 * This module generates TypeScript types from domain definitions.
 */
export interface DomainField {
  type: 'string' | 'number' | 'boolean' | 'date' | 'json' | 'uuid' | 'enum';
  primary?: boolean;
  required?: boolean;
  references?: string;
  enumName?: string;
  enumValues?: string[];
}
export interface DomainRelation {
  type: 'belongsTo' | 'hasMany';
  target: string;
  foreignKey: string;
}
export interface DomainDefinition {
  name: string;
  fields: Record<string, DomainField>;
  relations?: Record<string, DomainRelation>;
}
/**
 * Generate TypeScript types from a domain definition.
 * This function should generate:
 * - Entity interface (e.g., interface User { ... })
 * - Create input type (required fields only)
 * - Update input type (all fields optional)
 * - Where/filter type
 * - OrderBy type
 * - CRUD method signatures
 */
export declare function generateTypes(domain: DomainDefinition): string;
//# sourceMappingURL=type-gen.d.ts.map
