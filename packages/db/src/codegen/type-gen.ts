/**
 * Type generation for DB client codegen.
 *
 * This module generates TypeScript types from domain definitions.
 */

// Define the shape of a domain definition
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
 * Map domain field type to TypeScript type
 */
function fieldTypeToTs(field: DomainField): string {
  switch (field.type) {
    case 'string':
    case 'uuid':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'Date';
    case 'json':
      return 'unknown';
    case 'enum':
      return field.enumName || 'string';
    default:
      return 'unknown';
  }
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
export function generateTypes(domain: DomainDefinition): string {
  const { name, fields, relations } = domain;
  const pascalName = name.charAt(0).toUpperCase() + name.slice(1);

  const lines: string[] = [];

  // Generate enum types first
  for (const field of Object.values(fields)) {
    if (field.type === 'enum' && field.enumName && field.enumValues) {
      lines.push(`enum ${field.enumName} {`);
      for (const value of field.enumValues) {
        lines.push(`  ${value.toUpperCase()} = '${value}',`);
      }
      lines.push('}');
      lines.push('');
    }
  }

  // Generate main entity interface
  lines.push(`interface ${pascalName} {`);
  for (const [fieldName, field] of Object.entries(fields)) {
    const tsType = fieldTypeToTs(field);
    const optional = field.required === false ? '?' : '';
    lines.push(`  ${fieldName}${optional}: ${tsType};`);
  }

  // Add relation accessors
  if (relations) {
    for (const [relName, rel] of Object.entries(relations)) {
      if (rel.type === 'belongsTo') {
        const targetPascal = rel.target.charAt(0).toUpperCase() + rel.target.slice(1);
        lines.push(`  ${relName}: () => Promise<${targetPascal} | null>;`);
      } else if (rel.type === 'hasMany') {
        const targetPascal = rel.target.charAt(0).toUpperCase() + rel.target.slice(1);
        lines.push(`  ${relName}: () => Promise<${targetPascal}[]>;`);
      }
    }
  }
  lines.push('}');
  lines.push('');

  // Generate CreateInput (required fields only)
  lines.push(`interface Create${pascalName}Input {`);
  for (const [fieldName, field] of Object.entries(fields)) {
    // Skip primary key for create
    if (field.primary) continue;
    const tsType = fieldTypeToTs(field);
    if (field.required !== false) {
      lines.push(`  ${fieldName}: ${tsType};`);
    }
  }
  lines.push('}');
  lines.push('');

  // Generate UpdateInput (all fields optional)
  lines.push(`interface Update${pascalName}Input {`);
  for (const [fieldName, field] of Object.entries(fields)) {
    // Skip primary key for update
    if (field.primary) continue;
    const tsType = fieldTypeToTs(field);
    lines.push(`  ${fieldName}?: ${tsType};`);
  }
  lines.push('}');
  lines.push('');

  // Generate Where type
  lines.push(`interface ${pascalName}Where {`);
  for (const [fieldName, field] of Object.entries(fields)) {
    const tsType = fieldTypeToTs(field);
    lines.push(`  ${fieldName}?: ${tsType};`);
  }
  lines.push('}');
  lines.push('');

  // Generate OrderBy type
  lines.push(`interface ${pascalName}OrderBy {`);
  for (const fieldName of Object.keys(fields)) {
    lines.push(`  ${fieldName}?: 'asc' | 'desc';`);
  }
  lines.push('}');
  lines.push('');

  // Generate ListParams type
  lines.push(`interface List${pascalName}Params {`);
  lines.push(`  where?: ${pascalName}Where;`);
  lines.push(`  orderBy?: ${pascalName}OrderBy;`);
  lines.push(`  limit?: number;`);
  lines.push(`  offset?: number;`);
  lines.push('}');
  lines.push('');

  // Generate CRUD method signatures with both simple and params versions
  lines.push(`interface ${pascalName}Client {`);
  // Include both simple list() and parameterized list(params?) versions for overloads
  lines.push(`  list(): Promise<${pascalName}[]>;`);
  lines.push(`  list(params?: List${pascalName}Params): Promise<${pascalName}[]>;`);
  
  // Find primary key field name
  let idField = 'id';
  for (const [fieldName, field] of Object.entries(fields)) {
    if (field.primary) {
      idField = fieldName;
      break;
    }
  }
  
  lines.push(`  get(${idField}: string): Promise<${pascalName} | null>;`);
  lines.push(`  create(data: Create${pascalName}Input): Promise<${pascalName}>;`);
  lines.push(`  update(${idField}: string, data: Update${pascalName}Input): Promise<${pascalName}>;`);
  lines.push(`  delete(${idField}: string): Promise<void>;`);
  lines.push('}');

  return lines.join('\n');
}
