import { describe, expect, it } from 'bun:test';
import { injectFieldSelection } from '../field-selection-inject';
import { FieldSelectionManifest } from '../field-selection-manifest';

describe('injectFieldSelection', () => {
  describe('Given a query with accessed fields and no existing args', () => {
    it('Then injects select as the argument to the descriptor call', () => {
      const source = `
import { query } from '@vertz/ui';

function UserList() {
  const users = query(api.users.list());
  return <div>{users.data.items.map(u => <span>{u.name}</span>)}</div>;
}`;

      const result = injectFieldSelection('test.tsx', source);

      expect(result.code).toContain('api.users.list({ select: { id: true, name: true } })');
      expect(result.injected).toBe(true);
    });
  });

  describe('Given a query with accessed fields and existing args', () => {
    it('Then merges select into the existing argument object', () => {
      const source = `
import { query } from '@vertz/ui';

function UserList() {
  const users = query(api.users.list({ status: 'active' }));
  return <div>{users.data.items.map(u => <span>{u.name}</span>)}</div>;
}`;

      const result = injectFieldSelection('test.tsx', source);

      // Note: extra whitespace from MagicString insertion is expected
      expect(result.code).toContain('select: { id: true, name: true }');
      expect(result.code).toContain("status: 'active'");
      expect(result.code).toContain('api.users.list(');
      expect(result.injected).toBe(true);
    });
  });

  describe('Given a query with opaque access', () => {
    it('Then does not inject select (fetches all fields)', () => {
      const source = `
import { query } from '@vertz/ui';

function UserList() {
  const users = query(api.users.list());
  const items = users.data.items.map(u => ({ ...u }));
  return <div />;
}`;

      const result = injectFieldSelection('test.tsx', source);

      expect(result.code).toContain('api.users.list()');
      expect(result.injected).toBe(false);
    });
  });

  describe('Given the // @vertz-select-all pragma', () => {
    it('Then does not inject select', () => {
      const source = `
import { query } from '@vertz/ui';

function UserList() {
  // @vertz-select-all
  const users = query(api.users.list());
  return <div>{users.data.items.map(u => <span>{u.name}</span>)}</div>;
}`;

      const result = injectFieldSelection('test.tsx', source);

      expect(result.code).toContain('api.users.list()');
      expect(result.injected).toBe(false);
    });
  });

  describe('Given no query calls in the file', () => {
    it('Then returns the source unchanged', () => {
      const source = `
function StaticComponent() {
  return <div>Hello</div>;
}`;

      const result = injectFieldSelection('test.tsx', source);

      expect(result.code).toBe(source);
      expect(result.injected).toBe(false);
    });
  });

  describe('Given multiple fields accessed', () => {
    it('Then includes all fields plus id in the select', () => {
      const source = `
import { query } from '@vertz/ui';

function UserDetail() {
  const user = query(api.users.get(id));
  return (
    <div>
      <h1>{user.data.name}</h1>
      <p>{user.data.email}</p>
    </div>
  );
}`;

      const result = injectFieldSelection('test.tsx', source);

      // id always included, plus the accessed fields (alphabetically sorted)
      expect(result.code).toContain('select: { email: true, id: true, name: true }');
      expect(result.injected).toBe(true);
    });
  });

  describe('Given a parent passing query data to a child component via map callback', () => {
    it('Then merges child component fields into the parent select', () => {
      const parentSource = `
import { query } from '@vertz/ui';
import { UserCard } from './user-card';

function UserList() {
  const users = query(api.users.list());
  return <div>{users.data.items.map(u => <UserCard user={u} />)}</div>;
}`;

      const manifest = new FieldSelectionManifest();
      manifest.registerFile(
        '/src/user-card.tsx',
        `
        export function UserCard({ user }: Props) {
          return <div>{user.name}<span>{user.email}</span></div>;
        }
      `,
      );

      const resolveImport = (spec: string, _from: string): string | undefined => {
        if (spec === './user-card') return '/src/user-card.tsx';
        return undefined;
      };
      manifest.setImportResolver(resolveImport);

      const result = injectFieldSelection('test.tsx', parentSource, { manifest, resolveImport });

      expect(result.code).toContain('select:');
      expect(result.code).toContain('email: true');
      expect(result.code).toContain('id: true');
      expect(result.code).toContain('name: true');
      expect(result.injected).toBe(true);
    });
  });

  describe('Given a parent passing query data directly to a child component', () => {
    it('Then merges child component fields into the parent select', () => {
      const parentSource = `
import { query } from '@vertz/ui';
import { UserDetail } from './user-detail';

function UserPage() {
  const user = query(api.users.get(id));
  return <UserDetail profile={user.data} />;
}`;

      const manifest = new FieldSelectionManifest();
      manifest.registerFile(
        '/src/user-detail.tsx',
        `
        export function UserDetail({ profile }: Props) {
          return <div>{profile.name}<span>{profile.bio}</span></div>;
        }
      `,
      );

      const resolveImport = (spec: string, _from: string): string | undefined => {
        if (spec === './user-detail') return '/src/user-detail.tsx';
        return undefined;
      };
      manifest.setImportResolver(resolveImport);

      const result = injectFieldSelection('test.tsx', parentSource, { manifest, resolveImport });

      expect(result.code).toContain('bio: true');
      expect(result.code).toContain('id: true');
      expect(result.code).toContain('name: true');
      expect(result.injected).toBe(true);
    });
  });

  describe('Given two queries passed to the same child component', () => {
    it('Then attributes each child field set to the correct query', () => {
      const parentSource = `
import { query } from '@vertz/ui';
import { TaskCard } from './task-card';

function TaskPage() {
  const task = query(api.tasks.get(taskId));
  const user = query(api.users.get(userId));
  return <TaskCard task={task.data} assignee={user.data} />;
}`;

      const manifest = new FieldSelectionManifest();
      manifest.registerFile(
        '/src/task-card.tsx',
        `
        export function TaskCard({ task, assignee }: Props) {
          return <div>{task.title}<span>{assignee.name}</span></div>;
        }
      `,
      );

      const resolveImport = (spec: string, _from: string): string | undefined => {
        if (spec === './task-card') return '/src/task-card.tsx';
        return undefined;
      };
      manifest.setImportResolver(resolveImport);

      const result = injectFieldSelection('test.tsx', parentSource, { manifest, resolveImport });

      // task query should get title + id
      expect(result.code).toContain('title: true');
      // user query should get name + id
      expect(result.code).toContain('name: true');
      expect(result.injected).toBe(true);
    });
  });

  describe('Given a child with opaque access on a forwarded prop', () => {
    it('Then does not inject select for that query', () => {
      const parentSource = `
import { query } from '@vertz/ui';
import { UserCard } from './user-card';

function UserList() {
  const users = query(api.users.list());
  return <div>{users.data.items.map(u => <UserCard user={u} />)}</div>;
}`;

      const manifest = new FieldSelectionManifest();
      manifest.registerFile(
        '/src/user-card.tsx',
        `
        export function UserCard({ user }: Props) {
          const copy = { ...user };
          return <div>{copy.name}</div>;
        }
      `,
      );

      const resolveImport = (spec: string, _from: string): string | undefined => {
        if (spec === './user-card') return '/src/user-card.tsx';
        return undefined;
      };
      manifest.setImportResolver(resolveImport);

      const result = injectFieldSelection('test.tsx', parentSource, { manifest, resolveImport });

      // Opaque in child → no select injection
      expect(result.injected).toBe(false);
    });
  });

  describe('Given queries with mixed opaque and non-opaque access', () => {
    it('Then diagnostics report per-query injection status', () => {
      const source = `
import { query } from '@vertz/ui';

function Dashboard() {
  const users = query(api.users.list());
  const tasks = query(api.tasks.list());
  const items = users.data.items.map(u => ({ ...u }));
  return <div>{tasks.data.items.map(t => <span>{t.title}</span>)}</div>;
}`;

      const result = injectFieldSelection('test.tsx', source);

      expect(result.diagnostics).toHaveLength(2);
      const usersDiag = result.diagnostics.find((d) => d.queryVar === 'users');
      const tasksDiag = result.diagnostics.find((d) => d.queryVar === 'tasks');
      expect(usersDiag?.hasOpaqueAccess).toBe(true);
      expect(usersDiag?.injected).toBe(false);
      expect(tasksDiag?.hasOpaqueAccess).toBe(false);
      expect(tasksDiag?.injected).toBe(true);
      expect(tasksDiag?.singleFileFields).toContain('title');
    });
  });

  describe('Manifest-aware injection with entity schema', () => {
    const entitySchema = {
      tasks: {
        primaryKey: 'id',
        tenantScoped: true,
        hiddenFields: [],
        fields: ['id', 'title', 'status', 'description'],
        relations: {
          assignee: { type: 'one' as const, entity: 'users', selection: 'all' as const },
          tags: { type: 'many' as const, entity: 'tags', selection: 'all' as const },
        },
      },
      users: {
        primaryKey: 'id',
        tenantScoped: true,
        hiddenFields: ['passwordHash'],
        fields: ['id', 'name', 'email'],
        relations: {},
      },
    };

    it('generates include for relation fields with nested access', () => {
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
        entitySchema,
        entityType: 'tasks',
      });

      expect(result.code).toContain('select:');
      expect(result.code).toContain('title: true');
      expect(result.code).toContain('include:');
      expect(result.code).toContain('assignee: { select: { name: true } }');
      expect(result.injected).toBe(true);
    });

    it('generates include for multiple nested relation fields', () => {
      const source = `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query(api.tasks.list());
  return <div>{tasks.data.items.map(t => (
    <div>
      <span>{t.title}</span>
      <span>{t.assignee.name}</span>
      <span>{t.assignee.email}</span>
    </div>
  ))}</div>;
}`;

      const result = injectFieldSelection('test.tsx', source, {
        entitySchema,
        entityType: 'tasks',
      });

      expect(result.code).toContain('select:');
      expect(result.code).toContain('title: true');
      expect(result.code).toContain('include:');
      expect(result.code).toContain('assignee: { select: { email: true, name: true } }');
      expect(result.injected).toBe(true);
    });

    it('does not generate include when no nested access on relation fields', () => {
      const source = `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query(api.tasks.list());
  return <div>{tasks.data.items.map(t => <span>{t.title}</span>)}</div>;
}`;

      const result = injectFieldSelection('test.tsx', source, {
        entitySchema,
        entityType: 'tasks',
      });

      expect(result.code).toContain('select:');
      expect(result.code).toContain('title: true');
      expect(result.code).not.toContain('include:');
      expect(result.injected).toBe(true);
    });

    it('skips injection if user already provided select', () => {
      const source = `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query(api.tasks.list({ select: { id: true, title: true } }));
  return <div>{tasks.data.items.map(t => <span>{t.title}</span>)}</div>;
}`;

      const result = injectFieldSelection('test.tsx', source, {
        entitySchema,
        entityType: 'tasks',
      });

      // User provided select → skip injection
      expect(result.injected).toBe(false);
    });

    it('works without entitySchema (backward compat)', () => {
      const source = `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query(api.tasks.list());
  return <div>{tasks.data.items.map(t => <span>{t.title}</span>)}</div>;
}`;

      const result = injectFieldSelection('test.tsx', source);

      expect(result.code).toContain('select:');
      expect(result.code).toContain('title: true');
      expect(result.injected).toBe(true);
    });

    it('respects relation selection narrowing from entity config', () => {
      const narrowSchema = {
        tasks: {
          primaryKey: 'id',
          tenantScoped: true,
          hiddenFields: [],
          fields: ['id', 'title'],
          relations: {
            assignee: {
              type: 'one' as const,
              entity: 'users',
              selection: ['name', 'email'] as string[],
            },
          },
        },
      };

      const source = `
import { query } from '@vertz/ui';

function TaskDetail() {
  const task = query(api.tasks.get(id));
  return (
    <div>
      <h1>{task.data.title}</h1>
      <span>{task.data.assignee.name}</span>
      <span>{task.data.assignee.avatar}</span>
    </div>
  );
}`;

      const result = injectFieldSelection('test.tsx', source, {
        entitySchema: narrowSchema,
        entityType: 'tasks',
      });

      // avatar is not in the allowed selection, so it should be filtered out
      expect(result.code).toContain('assignee:');
      expect(result.code).toContain('name: true');
      expect(result.code).not.toContain('avatar: true');
      expect(result.injected).toBe(true);
    });
  });

  describe('Given a parent passing data to a child that the manifest cannot resolve', () => {
    it('Then falls back to opaque (no injection) to prevent under-fetching', () => {
      const parentSource = `
import { query } from '@vertz/ui';
import { IssueRow } from './issue-row';

function IssueList() {
  const issues = query(api.issues.list());
  return <div>{issues.data.items.map(issue => <IssueRow issue={issue} key={issue.id} />)}</div>;
}`;

      const manifest = new FieldSelectionManifest();
      // Register the file but with NO matching component (simulates the child
      // file being found but the component not being analyzable)
      manifest.registerFile(
        '/src/issue-row.tsx',
        `
        // Non-exported or non-PascalCase — the analyzer can't track it
        const helper = (x: any) => x;
      `,
      );

      const resolveImport = (spec: string, _from: string): string | undefined => {
        if (spec === './issue-row') return '/src/issue-row.tsx';
        return undefined;
      };
      manifest.setImportResolver(resolveImport);

      const result = injectFieldSelection('test.tsx', parentSource, { manifest, resolveImport });

      // Should NOT inject a narrow select — the child's fields are unknown
      // so we must fall back to opaque (fetch all fields)
      expect(result.injected).toBe(false);
      expect(result.diagnostics[0]?.hasOpaqueAccess).toBe(true);
    });
  });

  describe('Given a parent importing a child via a barrel file', () => {
    it('Then follows re-exports to resolve child component fields', () => {
      const parentSource = `
import { query } from '@vertz/ui';
import { IssueRow } from './components';

function IssueList() {
  const issues = query(api.issues.list());
  return <div>{issues.data.items.map(issue => <IssueRow issue={issue} key={issue.id} />)}</div>;
}`;

      const manifest = new FieldSelectionManifest();
      const resolveImport = (spec: string, from: string): string | undefined => {
        if (spec === './components' && from === 'test.tsx') return '/src/components/index.ts';
        if (spec === './issue-row' && from === '/src/components/index.ts') {
          return '/src/components/issue-row.tsx';
        }
        return undefined;
      };
      manifest.setImportResolver(resolveImport);

      // Barrel file
      manifest.registerFile(
        '/src/components/index.ts',
        `
        export { IssueRow } from './issue-row';
      `,
      );

      // Actual component
      manifest.registerFile(
        '/src/components/issue-row.tsx',
        `
        export function IssueRow({ issue }: Props) {
          return <div>{issue.title}<span>#{issue.number}</span><span>{issue.status}</span></div>;
        }
      `,
      );

      const result = injectFieldSelection('test.tsx', parentSource, { manifest, resolveImport });

      expect(result.code).toContain('select:');
      expect(result.code).toContain('id: true');
      expect(result.code).toContain('number: true');
      expect(result.code).toContain('status: true');
      expect(result.code).toContain('title: true');
      expect(result.injected).toBe(true);
    });
  });

  describe('Given no manifest provided (Phase 1 backward compat)', () => {
    it('Then only uses single-file fields', () => {
      const source = `
import { query } from '@vertz/ui';
import { UserCard } from './user-card';

function UserList() {
  const users = query(api.users.list());
  return <div>{users.data.items.map(u => <UserCard user={u} key={u.id} />)}</div>;
}`;

      // No manifest → only single-file fields (id from key access)
      const result = injectFieldSelection('test.tsx', source);

      expect(result.code).toContain('select: { id: true }');
      expect(result.injected).toBe(true);
    });
  });
});
