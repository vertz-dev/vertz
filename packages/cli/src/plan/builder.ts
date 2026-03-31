import type { EntityIntent, FieldIntent } from './intent';

export interface PlanOperation {
  type: 'create' | 'append' | 'modify';
  path: string;
  content: string;
  description: string;
}

export interface EntityPlan {
  intent: EntityIntent;
  operations: PlanOperation[];
  summary: {
    created: number;
    modified: number;
  };
}

const FIELD_TYPE_MAP: Record<string, string> = {
  uuid: 'd.uuid()',
  text: 'd.text()',
  boolean: 'd.boolean()',
  integer: 'd.integer()',
  timestamp: 'd.timestamp()',
};

function toPascalCase(s: string): string {
  return s.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
}

function fieldToSchema(field: FieldIntent): string {
  const base = FIELD_TYPE_MAP[field.type] ?? `d.text()`;

  const modifiers: string[] = [];

  if (field.name === 'id') {
    modifiers.push(".primary({ generate: 'uuid' })");
  }
  if (field.defaultValue) {
    const val = field.type === 'boolean' || field.type === 'integer'
      ? field.defaultValue
      : `'${field.defaultValue}'`;
    modifiers.push(`.default(${val})`);
  }
  if (field.name === 'createdAt') {
    modifiers.push(".default('now')", '.readOnly()');
  }

  return `${base}${modifiers.join('')}`;
}

/**
 * Builds a plan for adding a new entity to the project.
 * Generates schema additions, entity file, and server.ts modification.
 */
export function buildEntityPlan(intent: EntityIntent): EntityPlan {
  const { name, fields } = intent;
  const tableName = `${name}Table`;
  const modelName = `${name}Model`;
  const entityVarName = name;

  // 1. Schema content (append to existing schema.ts)
  const schemaLines = [
    '',
    `export const ${tableName} = d.table('${name}', {`,
    ...fields.map((f) => `  ${f.name}: ${fieldToSchema(f)},`),
    '});',
    '',
    `export const ${modelName} = d.model(${tableName});`,
    '',
  ];

  const schemaContent = schemaLines.join('\n');

  // 2. Entity file content
  const entityContent = `import { entity } from 'vertz/server';
import { ${modelName} } from '../schema';

export const ${entityVarName} = entity('${name}', {
  model: ${modelName},
  access: {
    list: () => true,
    get: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
});
`;

  const operations: PlanOperation[] = [
    {
      type: 'append',
      path: 'src/api/schema.ts',
      content: schemaContent,
      description: `Add ${tableName} + ${modelName} to schema`,
    },
    {
      type: 'create',
      path: `src/api/entities/${name}.entity.ts`,
      content: entityContent,
      description: `Create ${name} entity with CRUD access`,
    },
    {
      type: 'modify',
      path: 'src/api/server.ts',
      content: '',
      description: `Add import { ${entityVarName} } and register in entities array for ${name}`,
    },
  ];

  return {
    intent,
    operations,
    summary: {
      created: operations.filter((op) => op.type === 'create').length,
      modified: operations.filter((op) => op.type !== 'create').length,
    },
  };
}
