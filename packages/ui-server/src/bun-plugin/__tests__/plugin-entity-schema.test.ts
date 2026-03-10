/**
 * Tests for entity schema wiring in the bun plugin.
 *
 * Verifies the full flow:
 * 1. entity-schema.json exists on disk
 * 2. Plugin loads it at construction time
 * 3. injectFieldSelection receives the schema
 * 4. reloadEntitySchema picks up changes
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadEntitySchema } from '../entity-schema-loader';
import type { EntitySchemaManifest } from '../field-selection-inject';
import { injectFieldSelection } from '../field-selection-inject';

let testDir: string;
let generatedDir: string;
let schemaPath: string;

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

beforeEach(() => {
  testDir = resolve(tmpdir(), `vertz-plugin-entity-schema-${Date.now()}-${Math.random()}`);
  generatedDir = resolve(testDir, '.vertz', 'generated');
  schemaPath = resolve(generatedDir, 'entity-schema.json');
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('Plugin entity schema wiring', () => {
  describe('Given entity-schema.json on disk with relations and hidden fields', () => {
    describe('When loading the schema and injecting into a component with relation access', () => {
      it('Then generates include for relation and filters hidden fields', () => {
        const entitySchema = loadEntitySchema(schemaPath);
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
        expect(result.code).toContain('title: true');
        expect(result.code).not.toContain('internalNote: true');
        expect(result.code).toContain('include: { assignee: { select: { name: true } } }');
      });
    });

    describe('When loading the schema and injecting into a multi-entity dashboard', () => {
      it('Then uses per-query entity inference for correct schema lookup', () => {
        const entitySchema = loadEntitySchema(schemaPath);

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
        expect(result.diagnostics[0].queryVar).toBe('tasks');
        expect(result.diagnostics[0].injected).toBe(true);
        expect(result.diagnostics[1].queryVar).toBe('users');
        expect(result.diagnostics[1].injected).toBe(true);
      });
    });
  });

  describe('Given entity-schema.json is updated after initial load', () => {
    it('Then a fresh loadEntitySchema call picks up the new schema', () => {
      const initial = loadEntitySchema(schemaPath);
      expect(initial).toBeDefined();
      expect(Object.keys(initial ?? {})).toContain('tasks');
      expect(Object.keys(initial ?? {})).not.toContain('projects');

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
      writeFileSync(schemaPath, JSON.stringify(updatedSchema, null, 2));

      // Reload from disk
      const reloaded = loadEntitySchema(schemaPath);
      expect(reloaded).toBeDefined();
      expect(Object.keys(reloaded ?? {})).toContain('projects');

      // Verify the new entity works with injection
      const source = `
import { query } from '@vertz/ui';

function ProjectList() {
  const projects = query(api.projects.list());
  return <div>{projects.data.items.map(p => <span>{p.name}</span>)}</div>;
}`;

      const result = injectFieldSelection('test.tsx', source, {
        entitySchema: reloaded,
      });

      expect(result.injected).toBe(true);
      expect(result.code).toContain('name: true');
    });
  });

  describe('Given entity-schema.json does not exist', () => {
    it('Then loadEntitySchema returns undefined and injection falls back to simple select', () => {
      const entitySchema = loadEntitySchema(resolve(testDir, 'nonexistent', 'entity-schema.json'));
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

      const result = injectFieldSelection('test.tsx', source, {
        entitySchema: undefined,
      });

      expect(result.injected).toBe(true);
      expect(result.code).toContain('assignee: true');
      expect(result.code).toContain('title: true');
      expect(result.code).not.toContain('include:');
    });
  });

  describe('Given entity-schema.json contains an empty object', () => {
    it('Then loadEntitySchema returns empty manifest and injection uses simple select', () => {
      writeFileSync(schemaPath, '{}');

      const entitySchema = loadEntitySchema(schemaPath);
      expect(entitySchema).toEqual({});

      const source = `
import { query } from '@vertz/ui';

function TaskDetail() {
  const task = query(api.tasks.get(id));
  return <div>{task.data.title}</div>;
}`;

      // Empty schema means no entity match — falls back to simple select
      const result = injectFieldSelection('test.tsx', source, {
        entitySchema,
      });

      expect(result.injected).toBe(true);
      expect(result.code).toContain('select: { id: true, title: true }');
    });
  });

  describe('Given entity-schema.json contains a JSON array', () => {
    it('Then loadEntitySchema returns undefined', () => {
      writeFileSync(schemaPath, '[]');

      const result = loadEntitySchema(schemaPath);
      expect(result).toBeUndefined();
    });
  });

  describe('Given entity-schema.json is an empty file', () => {
    it('Then loadEntitySchema returns undefined', () => {
      writeFileSync(schemaPath, '');

      const result = loadEntitySchema(schemaPath);
      expect(result).toBeUndefined();
    });
  });
});
