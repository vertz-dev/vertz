/**
 * Client generation for DB client codegen.
 *
 * This module generates the typed database client.
 */

import { type DomainDefinition, generateTypes } from './type-gen';

/**
 * Generate the typed database client from domain definitions.
 * This function should generate:
 * - A db object with entity accessors
 * - Each entity has: list, get, create, update, delete methods
 * - Typed filter/where parameters
 * - Relation accessors
 */
export function generateClient(domains: DomainDefinition[]): string {
  const lines: string[] = [];

  // Generate all types for all domains first
  for (const domain of domains) {
    const types = generateTypes(domain);
    lines.push(types);
    lines.push('');
  }

  // Generate the main db export
  lines.push('export const db = {');

  for (const domain of domains) {
    const { name, fields, relations } = domain;
    const pascalName = name.charAt(0).toUpperCase() + name.slice(1);

    // Find primary key field name
    let idField = 'id';
    for (const [fieldName, field] of Object.entries(fields)) {
      if (field.primary) {
        idField = fieldName;
        break;
      }
    }

    lines.push(`  ${name}: {`);
    lines.push(`    list: (params?: List${pascalName}Params) => Promise<${pascalName}[]>,`);
    lines.push(`    get: (${idField}: string) => Promise<${pascalName} | null>,`);
    lines.push(`    create: (data: Create${pascalName}Input) => Promise<${pascalName}>,`);
    lines.push(
      `    update: (${idField}: string, data: Update${pascalName}Input) => Promise<${pascalName}>,`,
    );
    lines.push(`    delete: (${idField}: string) => Promise<void>,`);

    // Add relation accessors - use method syntax for relations
    if (relations) {
      for (const [relName, rel] of Object.entries(relations)) {
        if (rel.type === 'belongsTo') {
          const targetPascal = rel.target.charAt(0).toUpperCase() + rel.target.slice(1);
          // Use entity name + 'Id' for relation accessor parameter
          const relParamName = `${name}Id`;
          lines.push(`    ${relName}: {`);
          lines.push(`      get(${relParamName}: string): Promise<${targetPascal} | null>,`);
          lines.push(`    },`);
        }
      }
    }

    lines.push(`  },`);
  }

  lines.push('} as const;');

  return lines.join('\n');
}
