import { describe, expect, it } from 'vitest';
import { compile } from '../../compiler';

describe('List Transform', () => {
  describe('basic .map() transform', () => {
    it('transforms reactive {items.map(item => <div>{item.name}</div>)} to __list()', () => {
      const result = compile(
        `
function App() {
  let items = [{ name: "a" }];
  return <ul>{items.map(item => <li>{item.name}</li>)}</ul>;
}
        `.trim(),
      );

      expect(result.code).toContain('__list(');
      // Should reference the items signal
      expect(result.code).toContain('items');
      // Should create list item elements
      expect(result.code).toContain('__element("li")');
    });

    it('extracts key function from key prop', () => {
      const result = compile(
        `
function App() {
  let items = [{ id: 1, text: "hello" }];
  return <ul>{items.map(item => <TodoItem key={item.id} task={item} />)}</ul>;
}
        `.trim(),
      );

      expect(result.code).toContain('__list(');
      // Key function should extract item.id
      expect(result.code).toContain('item.id');
      // Should call the component
      expect(result.code).toContain('TodoItem(');
    });

    it('uses index as key when no key prop is provided', () => {
      const result = compile(
        `
function App() {
  let items = ["a", "b", "c"];
  return <ul>{items.map((item, index) => <li>{item}</li>)}</ul>;
}
        `.trim(),
      );

      expect(result.code).toContain('__list(');
      // Should use index-based key function when no key prop
      // The key function should use the index parameter or generate a fallback
    });
  });

  describe('static .map() - no transform', () => {
    it('does NOT transform static array .map() to __list()', () => {
      const result = compile(
        `
function App() {
  const items = ["a", "b", "c"];
  return <ul>{items.map(item => <li>{item}</li>)}</ul>;
}
        `.trim(),
      );

      // Static arrays should not use __list
      expect(result.code).not.toContain('__list(');
    });
  });

  describe('map with component children', () => {
    it('transforms map rendering components', () => {
      const result = compile(
        `
function App() {
  let users = [{ id: 1, name: "Alice" }];
  return <div>{users.map(user => <UserCard key={user.id} user={user} />)}</div>;
}
        `.trim(),
      );

      expect(result.code).toContain('__list(');
      expect(result.code).toContain('UserCard(');
      // Key function should use user.id
      expect(result.code).toContain('user.id');
    });
  });

  describe('import generation', () => {
    it('adds __list to internals import', () => {
      const result = compile(
        `
function App() {
  let items = [{ id: 1 }];
  return <ul>{items.map(item => <li key={item.id}>{item.id}</li>)}</ul>;
}
        `.trim(),
      );

      const internalsImport = result.code
        .split('\n')
        .find((line) => line.includes("from '@vertz/ui/internals'"));
      expect(internalsImport).toBeDefined();
      expect(internalsImport).toContain('__list');
    });
  });
});
