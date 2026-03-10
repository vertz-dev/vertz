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
});
