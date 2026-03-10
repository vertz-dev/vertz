/**
 * Tests for entity schema wiring in the bun plugin.
 *
 * Verifies the full flow:
 * 1. entity-schema.json exists on disk
 * 2. Plugin loads it at construction time
 * 3. injectFieldSelection receives the schema
 * 4. reloadEntitySchema picks up changes
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadEntitySchema } from '../entity-schema-loader';
import type { EntitySchemaManifest } from '../field-selection-inject';
import { injectFieldSelection } from '../field-selection-inject';

const TEST_DIR = resolve(tmpdir(), `vertz-plugin-entity-schema-${Date.now()}`);
const GENERATED_DIR = resolve(TEST_DIR, '.vertz', 'generated');
const SCHEMA_PATH = resolve(GENERATED_DIR, 'entity-schema.json');

const schema: EntitySchemaManifest = {
  tasks: {
    primaryKey: 'id',
    tenantScoped: true,
    hiddenFields: ['internalNote'],
    fields: ['id', 'title', 'status', 'internalNote'],
    relations: {
      assignee: { type: 'one', entity: 'users', selection: 'all' },
    },
  },
  users: {
    primaryKey: 'id',
    tenantScoped: true,
    hiddenFields: ['passwordHash'],
    fields: ['id', 'name', 'email', 'passwordHash'],
    relations: {},
  },
};

beforeAll(() => {
  mkdirSync(GENERATED_DIR, { recursive: true });
  writeFileSync(SCHEMA_PATH, JSON.stringify(schema, null, 2));
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('Plugin entity schema wiring', () => {
  describe('Given entity-schema.json on disk with relations and hidden fields', () => {
    describe('When loading the schema and injecting into a component with relation access', () => {
      it('Then generates include for relation and filters hidden fields', () => {
        const entitySchema = loadEntitySchema(SCHEMA_PATH);
        expect(entitySchema).toBeDefined();

        const source = `
import { query } from '@vertz/ui';

function TaskDetail() {
  const task = query(api.tasks.get(id));
  return (
    <div>
      <h1>{task.data.title}</h1>
      <span>{task.data.internalNote}</span>
      <span>{task.data.assignee.name}</span>
    </div>
  );
}`;

        const result = injectFieldSelection('test.tsx', source, {
          entitySchema,
        });

        expect(result.injected).toBe(true);
        // title should be in select
        expect(result.code).toContain('title: true');
        // internalNote is a hidden field — should NOT be in select
        expect(result.code).not.toContain('internalNote: true');
        // assignee is a relation with nested access — should produce include
        expect(result.code).toContain('include: { assignee: { select: { name: true } } }');
      });
    });

    describe('When loading the schema and injecting into a multi-entity dashboard', () => {
      it('Then uses per-query entity inference for correct schema lookup', () => {
        const entitySchema = loadEntitySchema(SCHEMA_PATH);

        const source = `
import { query } from '@vertz/ui';

function Dashboard() {
  const tasks = query(api.tasks.list());
  const users = query(api.users.list());
  return (
    <div>
      {tasks.data.items.map(t => <span>{t.title}</span>)}
      {users.data.items.map(u => <span>{u.name}</span>)}
    </div>
  );
}`;

        const result = injectFieldSelection('test.tsx', source, {
          entitySchema,
        });

        expect(result.injected).toBe(true);
        expect(result.diagnostics).toHaveLength(2);

        // Both queries should be injected with their respective entity schemas
        expect(result.diagnostics[0].queryVar).toBe('tasks');
        expect(result.diagnostics[0].injected).toBe(true);
        expect(result.diagnostics[1].queryVar).toBe('users');
        expect(result.diagnostics[1].injected).toBe(true);
      });
    });
  });

  describe('Given entity-schema.json is updated after initial load', () => {
    it('Then reloadEntitySchema picks up the new schema', () => {
      // Initial load
      const initial = loadEntitySchema(SCHEMA_PATH);
      expect(initial).toBeDefined();
      const initialKeys = Object.keys(initial ?? {});
      expect(initialKeys).toContain('tasks');
      expect(initialKeys).not.toContain('projects');

      // Write updated schema with new entity
      const updatedSchema: EntitySchemaManifest = {
        ...schema,
        projects: {
          primaryKey: 'id',
          tenantScoped: true,
          hiddenFields: [],
          fields: ['id', 'name', 'slug'],
          relations: {},
        },
      };
      writeFileSync(SCHEMA_PATH, JSON.stringify(updatedSchema, null, 2));

      // Reload
      const reloaded = loadEntitySchema(SCHEMA_PATH);
      expect(reloaded).toBeDefined();
      expect(Object.keys(reloaded ?? {})).toContain('projects');

      // Restore original for other tests
      writeFileSync(SCHEMA_PATH, JSON.stringify(schema, null, 2));
    });
  });

  describe('Given entity-schema.json does not exist', () => {
    it('Then loadEntitySchema returns undefined and injection falls back to simple select', () => {
      const entitySchema = loadEntitySchema(resolve(TEST_DIR, 'nonexistent', 'entity-schema.json'));
      expect(entitySchema).toBeUndefined();

      const source = `
import { query } from '@vertz/ui';

function TaskDetail() {
  const task = query(api.tasks.get(id));
  return (
    <div>
      <h1>{task.data.title}</h1>
      <span>{task.data.assignee.name}</span>
    </div>
  );
}`;

      // Without schema, falls back to simple select (assignee as scalar)
      const result = injectFieldSelection('test.tsx', source, {
        entitySchema: undefined,
      });

      expect(result.injected).toBe(true);
      expect(result.code).toContain('assignee: true');
      expect(result.code).toContain('title: true');
      expect(result.code).not.toContain('include:');
    });
  });
});
