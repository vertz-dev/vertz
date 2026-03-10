import { describe, expect, it } from 'bun:test';
import { injectFieldSelection } from '../field-selection-inject';

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
});
