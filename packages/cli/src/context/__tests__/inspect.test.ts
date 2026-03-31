import { describe, expect, it } from 'bun:test';
import { formatInspectOutput } from '../inspect';
import type { AppIR, EntityIR } from '@vertz/compiler';

// ── Helpers ─────────────────────────────────────────────────

function makeEntity(name: string, overrides?: Partial<EntityIR>): EntityIR {
  return {
    name,
    modelRef: {
      variableName: `${name}Model`,
      schemaRefs: {
        resolved: true,
        primaryKey: 'id',
        response: {
          kind: 'inline',
          jsonSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
          resolvedFields: [
            { name: 'id', type: 'string' },
            { name: 'title', type: 'string' },
            { name: 'createdAt', type: 'string' },
          ],
        },
      },
    },
    access: {
      list: 'function',
      get: 'function',
      create: 'function',
      update: 'function',
      delete: 'function',
    },
    hooks: { before: [], after: [] },
    actions: [],
    relations: [],
    ...overrides,
  } as EntityIR;
}

function makeAppIR(entities: EntityIR[]): AppIR {
  return {
    app: { basePath: '/api' },
    entities,
    modules: [],
    middleware: [],
    schemas: [],
    databases: [],
    dependencyGraph: { nodes: [], edges: [] },
    diagnostics: [],
  } as unknown as AppIR;
}

// ── formatInspectOutput ─────────────────────────────────────

describe('formatInspectOutput', () => {
  it('lists entities with their fields', () => {
    const ir = makeAppIR([makeEntity('tasks'), makeEntity('users')]);
    const output = formatInspectOutput(ir);

    expect(output.entities).toHaveProperty('tasks');
    expect(output.entities).toHaveProperty('users');
    expect(output.entities.tasks.fields).toContain('id');
    expect(output.entities.tasks.fields).toContain('title');
  });

  it('includes access rules per entity', () => {
    const ir = makeAppIR([makeEntity('tasks')]);
    const output = formatInspectOutput(ir);

    expect(output.entities.tasks.access).toEqual({
      list: true,
      get: true,
      create: true,
      update: true,
      delete: true,
    });
  });

  it('marks entities with no access as restricted', () => {
    const entity = makeEntity('tasks', {
      access: {
        list: 'none',
        get: 'function',
        create: 'none',
        update: 'none',
        delete: 'none',
      },
    });
    const ir = makeAppIR([entity]);
    const output = formatInspectOutput(ir);

    expect(output.entities.tasks.access.list).toBe(false);
    expect(output.entities.tasks.access.get).toBe(true);
  });

  it('includes relations', () => {
    const entity = makeEntity('posts', {
      relations: [
        { name: 'author', type: 'one', entity: 'users', selection: 'all' },
        { name: 'comments', type: 'many', entity: 'comments', selection: 'all' },
      ],
    });
    const ir = makeAppIR([entity]);
    const output = formatInspectOutput(ir);

    expect(output.entities.posts.relations).toEqual([
      { name: 'author', type: 'one', entity: 'users' },
      { name: 'comments', type: 'many', entity: 'comments' },
    ]);
  });

  it('generates suggestions for entities without common patterns', () => {
    const ir = makeAppIR([makeEntity('tasks')]);
    const output = formatInspectOutput(ir);

    expect(output.suggestions).toBeDefined();
    expect(Array.isArray(output.suggestions)).toBe(true);
  });

  it('includes entity count in summary', () => {
    const ir = makeAppIR([makeEntity('tasks'), makeEntity('users')]);
    const output = formatInspectOutput(ir);

    expect(output.summary.entityCount).toBe(2);
  });
});
