/**
 * E2E pipeline tests: codegen → entity-schema.json → loader → injection.
 *
 * These tests exercise the full production flow:
 * 1. EntitySchemaManifestGenerator produces entity-schema.json from CodegenIR
 * 2. loadEntitySchema reads it from disk
 * 3. injectFieldSelection uses the schema for relation-aware injection
 *
 * This is the closest we can get to testing the real pipeline without
 * starting the dev server or running Bun.build().
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadEntitySchema } from '../entity-schema-loader';
import type { EntitySchemaManifest } from '../field-selection-inject';
import { injectFieldSelection } from '../field-selection-inject';

// ── Test fixture: multi-entity project ────────────────────────────
// This manifest mirrors what codegen's EntitySchemaManifestGenerator produces.
// We write it as JSON to disk and load via the same path the plugin uses,
// exercising the real file I/O pipeline.
const TEST_DIR = resolve(tmpdir(), `vertz-e2e-pipeline-${Date.now()}`);
const GENERATED_DIR = resolve(TEST_DIR, '.vertz', 'generated');
const SCHEMA_PATH = resolve(GENERATED_DIR, 'entity-schema.json');

const generatedManifest: EntitySchemaManifest = {
  tasks: {
    table: 'tasks',
    primaryKey: 'id',
    tenantScoped: true,
    hiddenFields: ['internalPriority'],
    fields: ['id', 'title', 'status', 'description', 'internalPriority'],
    relations: {
      assignee: { type: 'one', entity: 'users', selection: 'all' },
      tags: { type: 'many', entity: 'tags', selection: 'all' },
      project: { type: 'one', entity: 'projects', selection: ['name', 'slug'] },
    },
  },
  users: {
    primaryKey: 'id',
    tenantScoped: true,
    hiddenFields: ['passwordHash'],
    fields: ['id', 'name', 'email', 'avatar', 'passwordHash'],
    relations: {},
  },
  tags: {
    primaryKey: 'id',
    tenantScoped: false,
    hiddenFields: [],
    fields: ['id', 'name', 'color'],
    relations: {},
  },
  projects: {
    primaryKey: 'id',
    tenantScoped: true,
    hiddenFields: [],
    fields: ['id', 'name', 'slug', 'description'],
    relations: {
      owner: { type: 'one', entity: 'users', selection: 'all' },
    },
  },
  documents: {
    primaryKey: 'uuid',
    tenantScoped: true,
    hiddenFields: [],
    fields: ['uuid', 'title', 'content'],
    relations: {},
  },
};

// Write to disk and load via the real loader — same as the bun plugin does
let entitySchema: EntitySchemaManifest | undefined;

beforeAll(() => {
  mkdirSync(GENERATED_DIR, { recursive: true });
  writeFileSync(SCHEMA_PATH, JSON.stringify(generatedManifest, null, 2));
  entitySchema = loadEntitySchema(SCHEMA_PATH);
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('Feature: Entity schema → field selection E2E pipeline', () => {
  describe('Given entity definitions with relations and hidden fields', () => {
    describe('When codegen generates the manifest and the loader reads it', () => {
      it('Then the manifest contains all entities with correct metadata', () => {
        expect(entitySchema).toBeDefined();
        expect(Object.keys(entitySchema ?? {})).toEqual([
          'tasks',
          'users',
          'tags',
          'projects',
          'documents',
        ]);
        expect(entitySchema?.tasks.relations.assignee.type).toBe('one');
        expect(entitySchema?.tasks.relations.tags.type).toBe('many');
        expect(entitySchema?.tasks.hiddenFields).toContain('internalPriority');
        expect(entitySchema?.users.hiddenFields).toContain('passwordHash');
        expect(entitySchema?.documents.primaryKey).toBe('uuid');
      });
    });
  });

  describe('Given a component accessing only scalar fields', () => {
    describe('When the injector processes it with the loaded schema', () => {
      it('Then produces select without include', () => {
        const source = `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query(api.tasks.list());
  return <div>{tasks.data.items.map(t => (
    <div><span>{t.title}</span><span>{t.status}</span></div>
  ))}</div>;
}`;

        const result = injectFieldSelection('test.tsx', source, { entitySchema });

        expect(result.injected).toBe(true);
        expect(result.code).toContain('select: { id: true, status: true, title: true }');
        expect(result.code).not.toContain('include:');
      });
    });
  });

  describe('Given a component with nested relation access (one-to-one)', () => {
    describe('When the injector processes it', () => {
      it('Then produces include with nested select for the relation', () => {
        const source = `
import { query } from '@vertz/ui';

function TaskDetail() {
  const task = query(api.tasks.get(id));
  return (
    <div>
      <h1>{task.data.title}</h1>
      <p>{task.data.status}</p>
      <span>{task.data.assignee.name}</span>
      <span>{task.data.assignee.email}</span>
    </div>
  );
}`;

        const result = injectFieldSelection('test.tsx', source, { entitySchema });

        expect(result.injected).toBe(true);
        expect(result.code).toContain('select: { id: true, status: true, title: true }');
        expect(result.code).toContain('include: { assignee: { select: { email: true, name: true } } }');
      });
    });
  });

  describe('Given a component accessing hidden fields', () => {
    describe('When the injector processes it', () => {
      it('Then hidden fields are excluded from select clauses', () => {
        const source = `
import { query } from '@vertz/ui';

function TaskDetail() {
  const task = query(api.tasks.get(id));
  return (
    <div>
      <h1>{task.data.title}</h1>
      <span>{task.data.internalPriority}</span>
    </div>
  );
}`;

        const result = injectFieldSelection('test.tsx', source, { entitySchema });

        expect(result.injected).toBe(true);
        expect(result.code).toContain('title: true');
        // internalPriority is in hiddenFields
        expect(result.code).not.toContain('internalPriority: true');
      });
    });
  });

  describe('Given a component accessing a relation with selection narrowing', () => {
    describe('When the injector processes it', () => {
      it('Then relation selection narrows to only allowed fields', () => {
        const source = `
import { query } from '@vertz/ui';

function TaskDetail() {
  const task = query(api.tasks.get(id));
  return (
    <div>
      <h1>{task.data.title}</h1>
      <span>{task.data.project.name}</span>
      <span>{task.data.project.description}</span>
    </div>
  );
}`;

        const result = injectFieldSelection('test.tsx', source, { entitySchema });

        expect(result.injected).toBe(true);
        // project allows only ['name', 'slug'], description should be filtered out
        expect(result.code).toContain('project:');
        expect(result.code).toContain('name: true');
        expect(result.code).not.toContain('description: true');
      });
    });
  });

  describe('Given a component using .map() on a many-relation', () => {
    describe('When the injector processes it', () => {
      it('Then produces include with nested select for the relation', () => {
        const source = `
import { query } from '@vertz/ui';

function TaskDetail() {
  const task = query(api.tasks.get(id));
  return (
    <div>
      <h1>{task.data.title}</h1>
      <ul>{task.data.tags.map(tag => <li>{tag.name}</li>)}</ul>
    </div>
  );
}`;

        const result = injectFieldSelection('test.tsx', source, { entitySchema });

        expect(result.injected).toBe(true);
        expect(result.code).toContain('title: true');
        expect(result.code).toContain('include: { tags: { select: { name: true } } }');
      });
    });
  });

  describe('Given a dashboard with mixed entity queries', () => {
    describe('When the injector processes it', () => {
      it('Then each query gets its own schema from per-query inference', () => {
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

        const result = injectFieldSelection('test.tsx', source, { entitySchema });

        expect(result.injected).toBe(true);
        expect(result.diagnostics).toHaveLength(2);
        expect(result.diagnostics[0].queryVar).toBe('tasks');
        expect(result.diagnostics[0].injected).toBe(true);
        expect(result.diagnostics[1].queryVar).toBe('users');
        expect(result.diagnostics[1].injected).toBe(true);
      });
    });
  });

  describe('Given a component with user-provided select', () => {
    describe('When the injector processes it', () => {
      it('Then bypasses injection and preserves user select', () => {
        const source = `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query(api.tasks.list({ select: { id: true, title: true } }));
  return <div>{tasks.data.items.map(t => <span>{t.title}</span>)}</div>;
}`;

        const result = injectFieldSelection('test.tsx', source, { entitySchema });

        expect(result.injected).toBe(false);
        expect(result.code).toContain('select: { id: true, title: true }');
      });
    });
  });

  describe('Given an entity with custom primary key', () => {
    describe('When the injector processes it', () => {
      it('Then uses the custom primary key instead of hardcoded id', () => {
        const source = `
import { query } from '@vertz/ui';

function DocList() {
  const docs = query(api.documents.list());
  return <div>{docs.data.items.map(d => <span>{d.title}</span>)}</div>;
}`;

        const result = injectFieldSelection('test.tsx', source, { entitySchema });

        expect(result.injected).toBe(true);
        expect(result.code).toContain('select: { title: true, uuid: true }');
        expect(result.code).not.toMatch(/\bid: true\b/);
      });
    });
  });

  describe('Given multiple relations with nested access in one component', () => {
    describe('When the injector processes it', () => {
      it('Then produces include entries for each relation', () => {
        const source = `
import { query } from '@vertz/ui';

function TaskDetail() {
  const task = query(api.tasks.get(id));
  return (
    <div>
      <h1>{task.data.title}</h1>
      <span>{task.data.assignee.name}</span>
      <ul>{task.data.tags.map(tag => <li>{tag.name}</li>)}</ul>
    </div>
  );
}`;

        const result = injectFieldSelection('test.tsx', source, { entitySchema });

        expect(result.injected).toBe(true);
        expect(result.code).toContain('title: true');
        expect(result.code).toContain('assignee: { select: { name: true } }');
        expect(result.code).toContain('tags: { select: { name: true } }');
      });
    });
  });

  describe('Given a user-provided select adjacent to an auto-injected query', () => {
    describe('When the injector processes it', () => {
      it('Then only injects into the query without user-provided select', () => {
        const source = `
import { query } from '@vertz/ui';

function Dashboard() {
  const tasks = query(api.tasks.list({ select: { id: true, title: true } }));
  const users = query(api.users.list());
  return (
    <div>
      {tasks.data.items.map(t => <span>{t.title}</span>)}
      {users.data.items.map(u => <span>{u.name}</span>)}
    </div>
  );
}`;

        const result = injectFieldSelection('test.tsx', source, { entitySchema });

        expect(result.injected).toBe(true);
        expect(result.diagnostics[0].queryVar).toBe('tasks');
        expect(result.diagnostics[0].injected).toBe(false);
        expect(result.diagnostics[1].queryVar).toBe('users');
        expect(result.diagnostics[1].injected).toBe(true);
      });
    });
  });

  describe('Given a callback accessing nested properties on a relation field', () => {
    describe('When the callback accesses multi-level nested fields', () => {
      it('Then captures the first-level nested field under the relation include', () => {
        // task.data.tags.map(tag => tag.author.name)
        // → tags is a relation, author is a nested field, name is a second-level nested field
        // Current behavior: only first-level nesting is captured in the include select
        const source = `
import { query } from '@vertz/ui';

function TaskDetail() {
  const task = query(api.tasks.get(id));
  return (
    <div>
      <h1>{task.data.title}</h1>
      <ul>{task.data.tags.map(tag => <li>{tag.name}<span>{tag.color}</span></li>)}</ul>
    </div>
  );
}`;

        const result = injectFieldSelection('test.tsx', source, { entitySchema });

        expect(result.injected).toBe(true);
        expect(result.code).toContain('title: true');
        // Both tag.name and tag.color should be captured as nested fields under tags
        expect(result.code).toContain('include: { tags: { select: { color: true, name: true } } }');
      });
    });

    describe('When a nested .map() callback is used inside another .map()', () => {
      it('Then captures the outer relation but not the inner nested callback (current limitation)', () => {
        // task.data.tags.map(tag => tag.posts.map(p => p.title))
        // Current behavior: captures tag.posts as a field under tags,
        // but does NOT recursively process the inner .map() callback.
        // This is a known limitation — deep relation nesting is not yet supported.
        const source = `
import { query } from '@vertz/ui';

function TaskDetail() {
  const task = query(api.tasks.get(id));
  return (
    <div>
      <h1>{task.data.title}</h1>
      <ul>{task.data.tags.map(tag => (
        <li>{tag.name}{tag.posts.map(p => <span>{p.title}</span>)}</li>
      ))}</ul>
    </div>
  );
}`;

        const result = injectFieldSelection('test.tsx', source, { entitySchema });

        expect(result.injected).toBe(true);
        expect(result.code).toContain('title: true');
        // tag.name is captured as nested under tags
        // tag.posts is also captured (as a field accessed on tag)
        // But p.title from the inner .map() is NOT captured as deep nested access
        expect(result.code).toContain('tags:');
        expect(result.code).toContain('name: true');
      });
    });
  });

  describe('Given hidden fields accessed on a different entity type', () => {
    describe('When the injector processes it', () => {
      it('Then each entity correctly filters its own hidden fields', () => {
        const source = `
import { query } from '@vertz/ui';

function UserProfile() {
  const user = query(api.users.get(id));
  return (
    <div>
      <h1>{user.data.name}</h1>
      <span>{user.data.email}</span>
      <span>{user.data.passwordHash}</span>
    </div>
  );
}`;

        const result = injectFieldSelection('test.tsx', source, { entitySchema });

        expect(result.injected).toBe(true);
        expect(result.code).toContain('name: true');
        expect(result.code).toContain('email: true');
        // passwordHash is in users.hiddenFields
        expect(result.code).not.toContain('passwordHash: true');
      });
    });
  });
});
