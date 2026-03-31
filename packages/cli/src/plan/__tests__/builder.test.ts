import { describe, expect, it } from 'bun:test';
import { buildEntityPlan } from '../builder';
import type { EntityIntent } from '../intent';

const basicIntent: EntityIntent = {
  name: 'posts',
  fields: [
    { name: 'id', type: 'uuid' },
    { name: 'title', type: 'text' },
    { name: 'body', type: 'text' },
    { name: 'createdAt', type: 'timestamp' },
  ],
  belongsTo: [],
};

describe('buildEntityPlan', () => {
  it('generates schema file content with table + model', () => {
    const plan = buildEntityPlan(basicIntent);
    const schemaOp = plan.operations.find((op) => op.path.includes('schema'));

    expect(schemaOp).toBeDefined();
    expect(schemaOp!.type).toBe('append');
    expect(schemaOp!.content).toContain("d.table('posts'");
    expect(schemaOp!.content).toContain('d.model(postsTable)');
    expect(schemaOp!.content).toContain('d.text()');
  });

  it('generates entity file', () => {
    const plan = buildEntityPlan(basicIntent);
    const entityOp = plan.operations.find((op) => op.path.includes('entity'));

    expect(entityOp).toBeDefined();
    expect(entityOp!.type).toBe('create');
    expect(entityOp!.content).toContain("entity('posts'");
    expect(entityOp!.content).toContain('postsModel');
  });

  it('generates server.ts modification (import + entities array)', () => {
    const plan = buildEntityPlan(basicIntent);
    const serverOp = plan.operations.find((op) => op.path.includes('server'));

    expect(serverOp).toBeDefined();
    expect(serverOp!.type).toBe('modify');
    expect(serverOp!.description).toContain('posts');
  });

  it('uses correct field type mappings', () => {
    const intent: EntityIntent = {
      name: 'tasks',
      fields: [
        { name: 'id', type: 'uuid' },
        { name: 'title', type: 'text' },
        { name: 'count', type: 'integer' },
        { name: 'active', type: 'boolean' },
        { name: 'createdAt', type: 'timestamp' },
      ],
      belongsTo: [],
    };

    const plan = buildEntityPlan(intent);
    const schemaOp = plan.operations.find((op) => op.path.includes('schema'));

    expect(schemaOp!.content).toContain('d.uuid()');
    expect(schemaOp!.content).toContain('d.text()');
    expect(schemaOp!.content).toContain('d.integer()');
    expect(schemaOp!.content).toContain('d.boolean()');
    expect(schemaOp!.content).toContain('d.timestamp()');
  });

  it('adds .default() for fields with default values', () => {
    const intent: EntityIntent = {
      name: 'tasks',
      fields: [
        { name: 'id', type: 'uuid' },
        { name: 'status', type: 'text', defaultValue: 'todo' },
        { name: 'createdAt', type: 'timestamp' },
      ],
      belongsTo: [],
    };

    const plan = buildEntityPlan(intent);
    const schemaOp = plan.operations.find((op) => op.path.includes('schema'));

    expect(schemaOp!.content).toContain("d.text().default('todo')");
  });

  it('adds FK field + primary generate for belongs-to', () => {
    const intent: EntityIntent = {
      name: 'posts',
      fields: [
        { name: 'id', type: 'uuid' },
        { name: 'title', type: 'text' },
        { name: 'userId', type: 'uuid' },
        { name: 'createdAt', type: 'timestamp' },
      ],
      belongsTo: ['users'],
    };

    const plan = buildEntityPlan(intent);
    const schemaOp = plan.operations.find((op) => op.path.includes('schema'));

    expect(schemaOp!.content).toContain('userId: d.uuid()');
  });

  it('includes summary in plan', () => {
    const plan = buildEntityPlan(basicIntent);

    expect(plan.summary.created).toBeGreaterThan(0);
    expect(plan.summary.modified).toBeGreaterThan(0);
  });
});
