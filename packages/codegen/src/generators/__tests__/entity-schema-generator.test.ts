import { describe, expect, it } from 'bun:test';
import type { CodegenEntityModule, CodegenIR } from '../../types';
import { EntitySchemaGenerator } from '../entity-schema-generator';

describe('EntitySchemaGenerator', () => {
  const generator = new EntitySchemaGenerator();

  function createBasicIR(entities: CodegenEntityModule[]): CodegenIR {
    return {
      basePath: '/api',
      modules: [],
      schemas: [],
      entities,
      auth: { schemes: [] },
    };
  }

  it('generates schema file for entity with resolved fields', () => {
    const ir = createBasicIR([
      {
        entityName: 'todos',
        operations: [
          {
            kind: 'create',
            method: 'POST',
            path: '/todos',
            operationId: 'createTodos',
            inputSchema: 'CreateTodosInput',
            outputSchema: 'TodosResponse',
            resolvedFields: [
              { name: 'title', tsType: 'string', optional: false },
              { name: 'completed', tsType: 'boolean', optional: true },
            ],
          },
          {
            kind: 'update',
            method: 'PATCH',
            path: '/todos/:id',
            operationId: 'updateTodos',
            inputSchema: 'UpdateTodosInput',
            outputSchema: 'TodosResponse',
            resolvedFields: [
              { name: 'title', tsType: 'string', optional: true },
              { name: 'completed', tsType: 'boolean', optional: true },
            ],
          },
        ],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const schemaFile = files.find((f) => f.path === 'schemas/todos.ts');

    expect(schemaFile).toBeDefined();
    expect(schemaFile?.content).toContain("import { s } from '@vertz/schema'");
    expect(schemaFile?.content).toContain('export const createTodosInputSchema');
    expect(schemaFile?.content).toContain('title: s.string()');
    expect(schemaFile?.content).toContain('completed: s.boolean().optional()');
    expect(schemaFile?.content).toContain('export const updateTodosInputSchema');
  });

  it('does not generate schema file when resolvedFields is undefined', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [
          {
            kind: 'create',
            method: 'POST',
            path: '/user',
            operationId: 'createUser',
            inputSchema: 'CreateUserInput',
            outputSchema: 'UserResponse',
            // No resolvedFields
          },
        ],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const schemaFile = files.find((f) => f.path === 'schemas/user.ts');

    expect(schemaFile).toBeUndefined();
  });

  it('generates barrel index file', () => {
    const ir = createBasicIR([
      {
        entityName: 'todos',
        operations: [
          {
            kind: 'create',
            method: 'POST',
            path: '/todos',
            operationId: 'createTodos',
            inputSchema: 'CreateTodosInput',
            outputSchema: 'TodosResponse',
            resolvedFields: [{ name: 'title', tsType: 'string', optional: false }],
          },
        ],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const indexFile = files.find((f) => f.path === 'schemas/index.ts');

    expect(indexFile).toBeDefined();
    expect(indexFile?.content).toContain("export { createTodosInputSchema } from './todos'");
  });

  it('maps type correctly: string, number, boolean, date, unknown', () => {
    const ir = createBasicIR([
      {
        entityName: 'item',
        operations: [
          {
            kind: 'create',
            method: 'POST',
            path: '/item',
            operationId: 'createItem',
            inputSchema: 'CreateItemInput',
            resolvedFields: [
              { name: 'name', tsType: 'string', optional: false },
              { name: 'count', tsType: 'number', optional: false },
              { name: 'active', tsType: 'boolean', optional: false },
              { name: 'createdAt', tsType: 'date', optional: false },
              { name: 'meta', tsType: 'unknown', optional: true },
            ],
          },
        ],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const schemaFile = files.find((f) => f.path === 'schemas/item.ts');

    expect(schemaFile?.content).toContain('name: s.string()');
    expect(schemaFile?.content).toContain('count: s.number()');
    expect(schemaFile?.content).toContain('active: s.boolean()');
    expect(schemaFile?.content).toContain('createdAt: s.string()'); // date → s.string() for JSON
    expect(schemaFile?.content).toContain('meta: s.unknown().optional()');
  });

  it('includes correct file header', () => {
    const ir = createBasicIR([
      {
        entityName: 'todos',
        operations: [
          {
            kind: 'create',
            method: 'POST',
            path: '/todos',
            operationId: 'createTodos',
            inputSchema: 'CreateTodosInput',
            resolvedFields: [{ name: 'title', tsType: 'string', optional: false }],
          },
        ],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const schemaFile = files.find((f) => f.path === 'schemas/todos.ts');

    expect(schemaFile?.content).toMatch(/^\/\/ Generated by @vertz\/codegen/);
  });

  it('returns empty array when no entities', () => {
    const ir = createBasicIR([]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });

    expect(files).toEqual([]);
  });
});
