import { describe, expect, it } from 'bun:test';
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

  describe('static .map() — always uses __list()', () => {
    it('transforms static array .map() to __list() (runtime handles static arrays gracefully)', () => {
      const result = compile(
        `
function App() {
  const items = ["a", "b", "c"];
  return <ul>{items.map(item => <li>{item}</li>)}</ul>;
}
        `.trim(),
      );

      // __list() handles static arrays gracefully — domEffect runs once, never re-fires.
      // Always transforming .map() ensures callback parameters from APIs like queryMatch()
      // (reactive proxies at runtime but opaque to the compiler) get proper list reconciliation.
      expect(result.code).toContain('__list(');
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

  describe('.map() on callback parameters (queryMatch pattern)', () => {
    it('transforms .map() on callback parameter inside function call to __list()', () => {
      const result = compile(
        `
import { query, queryMatch } from '@vertz/ui';
function App() {
  const q = query(() => fetch('/api'));
  return <div>{queryMatch(q, {
    loading: () => <span>Loading</span>,
    error: (e) => <span>Error</span>,
    data: (response) => <ul>{response.items.map(item => <li key={item.id}>{item.name}</li>)}</ul>,
  })}</div>;
}
        `.trim(),
      );

      expect(result.code).toContain('__list(');
      expect(result.code).toContain('item.id');
    });

    it('transforms .map() on const array variable to __list()', () => {
      const result = compile(
        `
function App() {
  const navItems = [{ label: "Home" }, { label: "About" }];
  return <nav>{navItems.map(item => <a key={item.label}>{item.label}</a>)}</nav>;
}
        `.trim(),
      );

      expect(result.code).toContain('__list(');
    });
  });

  describe('block-body .map() callbacks', () => {
    it('preserves intermediate const declarations in block-body callbacks', () => {
      const result = compile(
        `
function App() {
  let selected = 'a';
  const items = ['a', 'b', 'c'];
  return <div>{items.map((v) => {
    const isActive = v === selected;
    return <div data-state={isActive ? 'checked' : 'unchecked'} />;
  })}</div>;
}
        `.trim(),
      );

      expect(result.code).toContain('__list(');
      // The const declaration must be preserved in the render function
      expect(result.code).toContain('const isActive');
    });

    it('preserves multiple intermediate statements in block-body callbacks', () => {
      const result = compile(
        `
function App() {
  let selected = 'a';
  const items = ['a', 'b', 'c'];
  return <div>{items.map((v) => {
    const value = v.toLowerCase();
    const isActive = value === selected;
    return <div data-state={isActive ? 'checked' : 'unchecked'} />;
  })}</div>;
}
        `.trim(),
      );

      expect(result.code).toContain('__list(');
      expect(result.code).toContain('const value');
      expect(result.code).toContain('const isActive');
    });
  });

  describe('callback-local const shadowing component-level names', () => {
    it('does not add .value to callback const that shadows a component-level computed', () => {
      const result = compile(
        `
function App() {
  let count = 0;
  const doubled = count * 2;
  const items = [1, 2, 3];
  return (
    <div>
      <span>{doubled}</span>
      {items.map((v) => {
        const doubled = v * 2;
        return <span>{doubled}</span>;
      })}
    </div>
  );
}
        `.trim(),
      );

      // The component-level doubled should have .value (it's a computed)
      // But the callback-local doubled should NOT have .value
      const renderFn = result.code.slice(result.code.indexOf('(v) =>'));
      expect(renderFn).toContain('const doubled = v * 2');
      expect(renderFn).not.toContain('doubled.value');
    });

    it('does not add .value to callback const that shadows a component-level signal', () => {
      const result = compile(
        `
function App() {
  let status = 'idle';
  const items = ['a', 'b'];
  return (
    <div>
      <span>{status}</span>
      {items.map((item) => {
        const status = item === 'a' ? 'active' : 'inactive';
        return <span>{status}</span>;
      })}
    </div>
  );
}
        `.trim(),
      );

      // The callback-local status should NOT have .value
      const renderFn = result.code.slice(result.code.indexOf('(item) =>'));
      expect(renderFn).not.toContain('status.value');
    });

    it('does not add .value to callback parameter that shadows a component-level signal', () => {
      const result = compile(
        `
function App() {
  let items: string[] = [];
  return (
    <ul>
      {items.map((items) => {
        return <li>{items}</li>;
      })}
    </ul>
  );
}
        `.trim(),
      );

      // The callback parameter 'items' shadows the signal — should NOT get .value inside callback
      const renderFn = result.code.slice(result.code.indexOf('(items) =>'));
      // Inside the render function, 'items' refers to the callback parameter (a string)
      expect(renderFn).not.toContain('items.value');
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
