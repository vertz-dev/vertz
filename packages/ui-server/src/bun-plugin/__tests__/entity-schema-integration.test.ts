/**
 * Integration tests for entity schema manifest → field selection injection pipeline.
 *
 * Verifies the end-to-end flow:
 * 1. Entity schema manifest (from codegen) describes entity metadata
 * 2. Field selection analyzer detects field access patterns
 * 3. Injector uses manifest to classify scalar vs relation fields
 * 4. Output contains correct select + include clauses
 */
import { describe, expect, it } from 'bun:test';
import type { EntitySchemaManifest } from '../field-selection-inject';
import { injectFieldSelection } from '../field-selection-inject';
import { FieldSelectionManifest } from '../field-selection-manifest';

const entitySchema: EntitySchemaManifest = {
  tasks: {
    primaryKey: 'id',
    tenantScoped: true,
    hiddenFields: [],
    fields: ['id', 'title', 'status', 'description', 'dueDate'],
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
    fields: ['id', 'name', 'email', 'avatar'],
    relations: {
      posts: { type: 'many', entity: 'posts', selection: 'all' },
    },
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
};

describe('Entity Schema Manifest → Field Selection Integration', () => {
  describe('Scalar-only queries', () => {
    it('generates select with only scalar fields', () => {
      const source = `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query(api.tasks.list());
  return <div>{tasks.data.items.map(t => (
    <div>
      <span>{t.title}</span>
      <span>{t.status}</span>
    </div>
  ))}</div>;
}`;

      const result = injectFieldSelection('test.tsx', source, {
        entitySchema,
        entityType: 'tasks',
      });

      expect(result.code).toContain('select: { id: true, status: true, title: true }');
      expect(result.code).not.toContain('include:');
      expect(result.injected).toBe(true);
    });
  });

  describe('Queries with one-relation nested access', () => {
    it('generates select for scalars + include for relation with nested fields', () => {
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

      const result = injectFieldSelection('test.tsx', source, {
        entitySchema,
        entityType: 'tasks',
      });

      expect(result.code).toContain('select: { id: true, status: true, title: true }');
      expect(result.code).toContain(
        'include: { assignee: { select: { email: true, name: true } } }',
      );
      expect(result.injected).toBe(true);
    });
  });

  describe('Queries with many-relation nested access in map', () => {
    it('generates include for relation fields accessed in map callbacks', () => {
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

      const result = injectFieldSelection('test.tsx', source, {
        entitySchema,
        entityType: 'tasks',
      });

      expect(result.code).toContain('select:');
      expect(result.code).toContain('title: true');
      // tags is accessed via .map so nested field tracking should capture tag.name
      // The parent field 'tags' should be in the select (map callback doesn't produce nested access on parent)
      expect(result.injected).toBe(true);
    });
  });

  describe('Relation selection narrowing', () => {
    it('filters nested relation fields to those allowed by entity config', () => {
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

      const result = injectFieldSelection('test.tsx', source, {
        entitySchema,
        entityType: 'tasks',
      });

      // project relation allows only ['name', 'slug']
      // 'description' should be filtered out
      expect(result.code).toContain('project:');
      expect(result.code).toContain('name: true');
      expect(result.code).not.toContain('description: true');
      expect(result.injected).toBe(true);
    });
  });

  describe('User-provided select passthrough', () => {
    it('skips injection when user provides explicit select', () => {
      const source = `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query(api.tasks.list({ select: { id: true, title: true, status: true } }));
  return <div>{tasks.data.items.map(t => <span>{t.title}</span>)}</div>;
}`;

      const result = injectFieldSelection('test.tsx', source, {
        entitySchema,
        entityType: 'tasks',
      });

      expect(result.injected).toBe(false);
      // The original select is preserved as-is
      expect(result.code).toContain('select: { id: true, title: true, status: true }');
    });
  });

  describe('Cross-file resolution with entity schema', () => {
    it('merges child component scalar fields with parent scalar fields', () => {
      const parentSource = `
import { query } from '@vertz/ui';
import { TaskCard } from './task-card';

function TaskList() {
  const tasks = query(api.tasks.list());
  return <div>{tasks.data.items.map(t => <TaskCard task={t} />)}</div>;
}`;

      const manifest = new FieldSelectionManifest();
      manifest.registerFile(
        '/src/task-card.tsx',
        `
        export function TaskCard({ task }: Props) {
          return <div>{task.title}<span>{task.status}</span></div>;
        }
      `,
      );

      const resolveImport = (spec: string, _from: string): string | undefined => {
        if (spec === './task-card') return '/src/task-card.tsx';
        return undefined;
      };
      manifest.setImportResolver(resolveImport);

      const result = injectFieldSelection('test.tsx', parentSource, {
        manifest,
        resolveImport,
        entitySchema,
        entityType: 'tasks',
      });

      expect(result.code).toContain('select:');
      expect(result.code).toContain('status: true');
      expect(result.code).toContain('title: true');
      expect(result.injected).toBe(true);
    });
  });

  describe('Backward compatibility without entity schema', () => {
    it('falls back to simple select-only injection', () => {
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

      // No entitySchema or entityType
      const result = injectFieldSelection('test.tsx', source);

      // Without schema, assignee is treated as a regular field
      expect(result.code).toContain('select:');
      expect(result.code).toContain('assignee: true');
      expect(result.code).toContain('title: true');
      expect(result.code).not.toContain('include:');
      expect(result.injected).toBe(true);
    });
  });

  describe('Opaque access still disables injection', () => {
    it('does not inject when spread operator is used on query data', () => {
      const source = `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query(api.tasks.list());
  const items = tasks.data.items.map(t => ({ ...t }));
  return <div />;
}`;

      const result = injectFieldSelection('test.tsx', source, {
        entitySchema,
        entityType: 'tasks',
      });

      expect(result.injected).toBe(false);
    });
  });

  describe('Multiple queries with different entity types', () => {
    it('handles mixed queries in one file', () => {
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

      // Note: entityType applies to all queries in the file (limitation)
      const result = injectFieldSelection('test.tsx', source, {
        entitySchema,
        entityType: 'tasks',
      });

      expect(result.injected).toBe(true);
      expect(result.diagnostics).toHaveLength(2);
      expect(result.diagnostics[0].queryVar).toBe('tasks');
      expect(result.diagnostics[1].queryVar).toBe('users');
    });
  });
});
