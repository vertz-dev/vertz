import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const NATIVE_MODULE_PATH = join(
  import.meta.dir,
  '..',
  'vertz-compiler.darwin-arm64.node',
);

interface NestedFieldAccess {
  field: string;
  nestedPath: string[];
}

interface FieldSelection {
  queryVar: string;
  injectionPos: number;
  injectionKind: string;
  fields: string[];
  hasOpaqueAccess: boolean;
  nestedAccess: NestedFieldAccess[];
  inferredEntityName: string | null;
}

interface CompileResult {
  code: string;
  fieldSelections?: FieldSelection[];
}

function loadCompiler() {
  return require(NATIVE_MODULE_PATH) as {
    compile: (
      source: string,
      options?: { filename?: string; fieldSelection?: boolean },
    ) => CompileResult;
  };
}

function analyzeFields(source: string): FieldSelection[] {
  const { compile } = loadCompiler();
  const result = compile(source, {
    filename: 'src/component.tsx',
    fieldSelection: true,
  });
  return result.fieldSelections ?? [];
}

describe('Feature: Field selection analyzer (#1910)', () => {
  describe('Given a component with query() and .data.items.map()', () => {
    it('Then detects field names accessed in the map callback', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserList() {
          const users = query(api.users.list());
          return <div>{users.data.items.map(u => <span>{u.name}</span>)}</div>;
        }
      `;

      const result = analyzeFields(source);

      expect(result).toHaveLength(1);
      expect(result[0].queryVar).toBe('users');
      expect(result[0].fields).toContain('name');
      expect(result[0].hasOpaqueAccess).toBe(false);
    });
  });

  describe('Given multiple field accesses in map callback', () => {
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

      const result = analyzeFields(source);

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

      const result = analyzeFields(source);

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

      const result = analyzeFields(source);

      expect(result[0].fields).toContain('name');
      expect(result[0].fields).toContain('email');
      expect(result[0].fields).toContain('bio');
      expect(result[0].fields).toHaveLength(3);
    });
  });

  describe('Given opaque access via spread operator in callback', () => {
    it('Then marks hasOpaqueAccess as true', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserList() {
          const users = query(api.users.list());
          const items = users.data.items.map(u => ({ ...u }));
          return <div />;
        }
      `;

      const result = analyzeFields(source);

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

      const result = analyzeFields(source);

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

      const result = analyzeFields(source);

      expect(result).toHaveLength(2);
      expect(result[0].queryVar).toBe('users');
      expect(result[0].fields).toContain('name');
      expect(result[1].queryVar).toBe('posts');
      expect(result[1].fields).toContain('title');
    });
  });

  describe('Given access to signal properties (loading, error)', () => {
    it('Then excludes them from fields', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserList() {
          const users = query(api.users.list());
          if (users.loading) return <div>Loading</div>;
          if (users.error) return <div>Error</div>;
          return <div>{users.data.items.map(u => <span>{u.name}</span>)}</div>;
        }
      `;

      const result = analyzeFields(source);

      expect(result[0].fields).toEqual(['name']);
      expect(result[0].fields).not.toContain('loading');
      expect(result[0].fields).not.toContain('error');
    });
  });

  describe('Given injection kind detection', () => {
    it('Then uses insert-arg for no-argument descriptor call', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserList() {
          const users = query(api.users.list());
          return <div>{users.data.items.map(u => <span>{u.name}</span>)}</div>;
        }
      `;

      const result = analyzeFields(source);
      expect(result[0].injectionKind).toBe('insert-arg');
    });

    it('Then uses merge-into-object for object literal arg', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserList() {
          const users = query(api.users.list({ status: 'active' }));
          return <div>{users.data.items.map(u => <span>{u.name}</span>)}</div>;
        }
      `;

      const result = analyzeFields(source);
      expect(result[0].injectionKind).toBe('merge-into-object');
    });

    it('Then uses append-arg for non-object argument', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserDetail() {
          const user = query(api.users.get(id));
          return <div>{user.data.name}</div>;
        }
      `;

      const result = analyzeFields(source);
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

      const result = analyzeFields(source);

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

      const result = analyzeFields(source);
      expect(result[0].hasOpaqueAccess).toBe(true);
    });
  });

  describe('Given nested field access tracking', () => {
    it('Then tracks single-level nested access (relation.field)', () => {
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

      const result = analyzeFields(source);

      expect(result[0].fields).toContain('title');
      expect(result[0].fields).toContain('assignee');
      expect(result[0].nestedAccess).toContainEqual({
        field: 'assignee',
        nestedPath: ['name'],
      });
    });

    it('Then tracks multi-level nested access', () => {
      const source = `
        import { query } from '@vertz/ui';

        function TaskDetail() {
          const task = query(api.tasks.get(id));
          return <span>{task.data.project.owner.email}</span>;
        }
      `;

      const result = analyzeFields(source);

      expect(result[0].fields).toContain('project');
      expect(result[0].nestedAccess).toContainEqual({
        field: 'project',
        nestedPath: ['owner', 'email'],
      });
    });

    it('Then returns empty nestedAccess for flat-only access', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserDetail() {
          const user = query(api.users.get(id));
          return <div>{user.data.name}{user.data.email}</div>;
        }
      `;

      const result = analyzeFields(source);
      expect(result[0].nestedAccess).toEqual([]);
    });

    it('Then deduplicates nested access entries', () => {
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

      const result = analyzeFields(source);

      const assigneeAccess = result[0].nestedAccess.filter(
        (n) => n.field === 'assignee' && n.nestedPath[0] === 'name',
      );
      expect(assigneeAccess).toHaveLength(1);
    });
  });

  describe('Given entity name inference', () => {
    it('Then infers entity name from descriptor chain', () => {
      const source = `
        import { query } from '@vertz/ui';

        function TaskList() {
          const tasks = query(api.tasks.list());
          return <div>{tasks.data.items.map(t => <span>{t.title}</span>)}</div>;
        }
      `;

      const result = analyzeFields(source);
      expect(result[0].inferredEntityName).toBe('tasks');
    });
  });

  describe('Given fieldSelection is disabled', () => {
    it('Then does not return field selections', () => {
      const source = `
        import { query } from '@vertz/ui';

        function UserList() {
          const users = query(api.users.list());
          return <div>{users.data.items.map(u => <span>{u.name}</span>)}</div>;
        }
      `;

      const { compile } = loadCompiler();
      const result = compile(source, {
        filename: 'src/component.tsx',
      });
      expect(result.fieldSelections).toBeUndefined();
    });
  });
});
