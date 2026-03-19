import { describe, expect, it } from 'bun:test';
import { analyzeFieldSelection } from '../field-selection-analyzer';

describe('analyzeFieldSelection', () => {
  describe('Given a component with query() and .data.items.map()', () => {
    it('Then detects field names accessed in the map callback', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserList() {
          const users = query(api.users.list());
          return <div>{users.data.items.map(u => <span>{u.name}</span>)}</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result).toHaveLength(1);
      expect(result[0].queryVar).toBe('users');
      expect(result[0].fields).toContain('name');
      expect(result[0].hasOpaqueAccess).toBe(false);
    });
  });

  describe('Given a component with multiple field accesses in map callback', () => {
    it('Then collects all accessed fields', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserList() {
          const users = query(api.users.list());
          return <div>{users.data.items.map(u => (
            <div>
              <span>{u.name}</span>
              <span>{u.email}</span>
            </div>
          ))}</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].fields).toContain('name');
      expect(result[0].fields).toContain('email');
      expect(result[0].fields).toHaveLength(2);
    });
  });

  describe('Given a get() query with direct .data.field access', () => {
    it('Then detects direct field access on data', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserDetail() {
          const user = query(api.users.get(id));
          return <div>{user.data.name}</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result).toHaveLength(1);
      expect(result[0].queryVar).toBe('user');
      expect(result[0].fields).toContain('name');
    });
  });

  describe('Given multiple fields accessed directly on .data', () => {
    it('Then collects all direct field accesses', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserDetail() {
          const user = query(api.users.get(id));
          return (
            <div>
              <h1>{user.data.name}</h1>
              <p>{user.data.email}</p>
              <p>{user.data.bio}</p>
            </div>
          );
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].fields).toContain('name');
      expect(result[0].fields).toContain('email');
      expect(result[0].fields).toContain('bio');
      expect(result[0].fields).toHaveLength(3);
    });
  });

  describe('Given opaque access via spread operator', () => {
    it('Then marks hasOpaqueAccess as true', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserList() {
          const users = query(api.users.list());
          const items = users.data.items.map(u => ({ ...u }));
          return <div />;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].hasOpaqueAccess).toBe(true);
    });
  });

  describe('Given no query() calls in the component', () => {
    it('Then returns an empty array', () => {
      const source = `
        function StaticComponent() {
          return <div>Hello</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result).toHaveLength(0);
    });
  });

  describe('Given multiple query() calls in one component', () => {
    it('Then returns separate entries for each query', () => {
      const source = `
        import { query } from '@vertz/ui';

        function Dashboard() {
          const users = query(api.users.list());
          const posts = query(api.posts.list());
          return (
            <div>
              {users.data.items.map(u => <span>{u.name}</span>)}
              {posts.data.items.map(p => <span>{p.title}</span>)}
            </div>
          );
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result).toHaveLength(2);
      expect(result[0].queryVar).toBe('users');
      expect(result[0].fields).toContain('name');
      expect(result[1].queryVar).toBe('posts');
      expect(result[1].fields).toContain('title');
    });
  });

  describe('Given access to signal properties (loading, error)', () => {
    it('Then excludes them from fields (they are not entity fields)', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserList() {
          const users = query(api.users.list());
          if (users.loading) return <div>Loading</div>;
          if (users.error) return <div>Error</div>;
          return <div>{users.data.items.map(u => <span>{u.name}</span>)}</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].fields).toEqual(['name']);
      expect(result[0].fields).not.toContain('loading');
      expect(result[0].fields).not.toContain('error');
    });
  });

  describe('Given a descriptor call that already has an object argument', () => {
    it('Then uses merge-into-object injection kind', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserList() {
          const users = query(api.users.list({ status: 'active' }));
          return <div>{users.data.items.map(u => <span>{u.name}</span>)}</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].injectionKind).toBe('merge-into-object');
    });
  });

  describe('Given a descriptor call with no arguments', () => {
    it('Then uses insert-arg injection kind', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserList() {
          const users = query(api.users.list());
          return <div>{users.data.items.map(u => <span>{u.name}</span>)}</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].injectionKind).toBe('insert-arg');
    });
  });

  describe('Given a get() descriptor call with a non-object argument', () => {
    it('Then uses append-arg injection kind', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserDetail() {
          const user = query(api.users.get(id));
          return <div>{user.data.name}</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].injectionKind).toBe('append-arg');
    });
  });

  describe('Given a // @vertz-select-all pragma', () => {
    it('Then skips field selection for that query', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserList() {
          // @vertz-select-all
          const users = query(api.users.list());
          return <div>{users.data.items.map(u => <span>{u.name}</span>)}</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result).toHaveLength(0);
    });
  });

  describe('Given dynamic key access in callback', () => {
    it('Then marks hasOpaqueAccess as true', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserList() {
          const users = query(api.users.list());
          return <div>{users.data.items.map(u => <span>{u[someKey]}</span>)}</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].hasOpaqueAccess).toBe(true);
    });
  });

  describe('Given a query variable passed to a child component in map callback', () => {
    it('Then detects the prop flow with import source', () => {
      const source = `
        import { query } from '@vertz/ui';
        import { UserCard } from './user-card';

        function UserList() {
          const users = query(api.users.list());
          return <div>{users.data.items.map(u => <UserCard user={u} />)}</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].propFlows).toHaveLength(1);
      expect(result[0].propFlows[0].componentName).toBe('UserCard');
      expect(result[0].propFlows[0].importSource).toBe('./user-card');
      expect(result[0].propFlows[0].propName).toBe('user');
    });
  });

  describe('Given a get query with data passed directly to child component', () => {
    it('Then detects the prop flow', () => {
      const source = `
        import { query } from '@vertz/ui';
        import { UserDetail } from './user-detail';

        function UserPage() {
          const user = query(api.users.get(id));
          return <UserDetail user={user.data} />;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].propFlows).toHaveLength(1);
      expect(result[0].propFlows[0].componentName).toBe('UserDetail');
      expect(result[0].propFlows[0].propName).toBe('user');
    });
  });

  describe('Given two queries passed to the same child component', () => {
    it('Then attributes each prop flow to the correct query', () => {
      const source = `
        import { query } from '@vertz/ui';
        import { TaskCard } from './task-card';

        function TaskPage() {
          const task = query(api.tasks.get(taskId));
          const user = query(api.users.get(userId));
          return <TaskCard task={task.data} assignee={user.data} />;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      const taskQuery = result.find((r) => r.queryVar === 'task');
      const userQuery = result.find((r) => r.queryVar === 'user');

      expect(taskQuery?.propFlows).toHaveLength(1);
      expect(taskQuery?.propFlows[0].propName).toBe('task');
      expect(userQuery?.propFlows).toHaveLength(1);
      expect(userQuery?.propFlows[0].propName).toBe('assignee');
    });
  });

  describe('Nested field access tracking', () => {
    it('tracks single-level nested access (relation.field)', () => {
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
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].fields).toContain('title');
      expect(result[0].fields).toContain('assignee');
      expect(result[0].nestedAccess).toBeDefined();
      expect(result[0].nestedAccess).toContainEqual({
        field: 'assignee',
        nestedPath: ['name'],
      });
    });

    it('tracks multi-level nested access (relation.subfield.deeper)', () => {
      const source = `
        import { query } from '@vertz/ui';

        function TaskDetail() {
          const task = query(api.tasks.get(id));
          return <span>{task.data.project.owner.email}</span>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].fields).toContain('project');
      expect(result[0].nestedAccess).toContainEqual({
        field: 'project',
        nestedPath: ['owner', 'email'],
      });
    });

    it('tracks nested access inside map callbacks', () => {
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
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].fields).toContain('title');
      expect(result[0].fields).toContain('assignee');
      expect(result[0].nestedAccess).toContainEqual({
        field: 'assignee',
        nestedPath: ['name'],
      });
      expect(result[0].nestedAccess).toContainEqual({
        field: 'assignee',
        nestedPath: ['email'],
      });
    });

    it('returns empty nestedAccess for flat-only access', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserDetail() {
          const user = query(api.users.get(id));
          return <div>{user.data.name}{user.data.email}</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].nestedAccess).toEqual([]);
    });

    it('deduplicates nested access entries', () => {
      const source = `
        import { query } from '@vertz/ui';

        function TaskDetail() {
          const task = query(api.tasks.get(id));
          return (
            <div>
              <h1>{task.data.assignee.name}</h1>
              <h2>{task.data.assignee.name}</h2>
            </div>
          );
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      const assigneeAccess = result[0].nestedAccess.filter(
        (n) => n.field === 'assignee' && n.nestedPath[0] === 'name',
      );
      expect(assigneeAccess).toHaveLength(1);
    });
  });

  describe('Given nested relation map callback (parent.field.map)', () => {
    it('Then tracks nested fields under the parent relation field', () => {
      const source = `
        import { query } from '@vertz/ui';

        function TeamPage() {
          const team = query(api.teams.get(id));
          return <div>{team.data.members.map(m => <span>{m.name}</span>)}</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].fields).toContain('members');
      expect(result[0].nestedAccess).toContainEqual({
        field: 'members',
        nestedPath: ['name'],
      });
    });

    it('tracks deeply nested relation map with nested access in callback', () => {
      const source = `
        import { query } from '@vertz/ui';

        function TeamPage() {
          const team = query(api.teams.get(id));
          return <div>{team.data.members.map(m => <span>{m.profile.avatar}</span>)}</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].fields).toContain('members');
      expect(result[0].nestedAccess).toContainEqual({
        field: 'members',
        nestedPath: ['profile'],
      });
    });
  });

  describe('Given spread on a property access chain', () => {
    it('Then marks hasOpaqueAccess for spread on queryVar.data', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserDetail() {
          const user = query(api.users.get(id));
          const props = { ...user.data };
          return <div>{props.name}</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].hasOpaqueAccess).toBe(true);
    });
  });

  describe('Given element access in property chain', () => {
    it('Then handles items[0].field access pattern', () => {
      const source = `
        import { query } from '@vertz/ui';

        function FirstUser() {
          const users = query(api.users.list());
          return <div>{users.data.items[0].name}</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      // Element access should still track the chain
      expect(result[0].fields).toContain('name');
    });
  });

  describe('Given no query data passed to child components', () => {
    it('Then propFlows is empty', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserList() {
          const users = query(api.users.list());
          return <div>{users.data.items.map(u => <span>{u.name}</span>)}</div>;
        }
      `;

      const result = analyzeFieldSelection('test.tsx', source);

      expect(result[0].propFlows).toHaveLength(0);
    });
  });
});
