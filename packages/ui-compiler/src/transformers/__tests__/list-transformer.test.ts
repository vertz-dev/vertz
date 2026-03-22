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

    it('emits null keyFn when no key prop is provided', () => {
      const result = compile(
        `
function App() {
  let items = ["a", "b", "c"];
  return <ul>{items.map((item, index) => <li>{item}</li>)}</ul>;
}
        `.trim(),
      );

      expect(result.code).toContain('__list(');
      // Should emit null (not an index-based fallback) for safe full-replacement mode
      expect(result.code).toMatch(/__list\([^,]+,\s*\(\)\s*=>[^,]+,\s*null\s*,/);
    });

    it('includes index param in key function when key={i} uses the index', () => {
      const result = compile(
        `
function App() {
  const paragraphs = ["a", "b", "c"];
  return <div>{paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>;
}
        `.trim(),
      );

      expect(result.code).toContain('__list(');
      // Key function must include index param: (p, i) => i or (_p, i) => i
      // NOT (p) => i which would leave i undefined
      expect(result.code).toMatch(/\(_?\w+,\s*i\)\s*=>\s*i/);
    });

    it('does not render key prop as a DOM attribute', () => {
      const result = compile(
        `
function App() {
  const items = ["a", "b", "c"];
  return <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>;
}
        `.trim(),
      );

      expect(result.code).toContain('__list(');
      // key should be extracted for __list, not set as a DOM attribute
      expect(result.code).not.toContain('setAttribute("key"');
      expect(result.code).not.toContain("setAttribute('key'");
      // key attribute should not generate __attr call in the render body
      expect(result.code).not.toMatch(/__attr\([^,]+,\s*"key"/);
      expect(result.code).not.toMatch(/"key"/);
    });

    it('does not include index param in key function when key uses item property', () => {
      const result = compile(
        `
function App() {
  let items = [{ id: 1, name: "a" }];
  return <ul>{items.map((item, i) => <li key={item.id}>{item.name}</li>)}</ul>;
}
        `.trim(),
      );

      expect(result.code).toContain('__list(');
      // key={item.id} does not reference the index param i — should be (item) => item.id
      expect(result.code).toMatch(/\(item\)\s*=>\s*item\.id/);
      // Should NOT include index param since key doesn't use it
      expect(result.code).not.toMatch(/\(item,\s*i\)\s*=>\s*item\.id/);
    });

    it('does not extract key from nested child JSX element', () => {
      const result = compile(
        `
function App() {
  let items = [{ id: 1, name: "hello" }];
  return <ul>{items.map(item => <div><span key={item.id}>{item.name}</span></div>)}</ul>;
}
        `.trim(),
      );

      expect(result.code).toContain('__list(');
      // The outer <div> has no key prop — key is on the nested <span>
      // Should fallback to null (not extract item.id from nested <span>)
      expect(result.code).not.toMatch(/\(item\)\s*=>\s*item\.id/);
      // Should use null keyFn for safe full-replacement mode
      expect(result.code).toMatch(/__list\([^,]+,\s*\(\)\s*=>[^,]+,\s*null\s*,/);
    });

    it('does not pass key as a component prop', () => {
      const result = compile(
        `
function App() {
  let items = [{ id: 1, text: "hello" }];
  return <ul>{items.map(item => <TodoItem key={item.id} task={item} />)}</ul>;
}
        `.trim(),
      );

      expect(result.code).toContain('__list(');
      // key should be used in the key function, not passed as a prop
      expect(result.code).toContain('item.id');
      // Component call should not include key in props
      expect(result.code).not.toMatch(/TodoItem\(\{[^}]*key/);
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

  describe('.map() in component children (__listValue)', () => {
    it('transforms .map() inside component children to __listValue()', () => {
      const result = compile(
        `
function Card({ children }) {
  return <div>{children}</div>;
}
function App() {
  let items = [{ id: 1, name: "a" }];
  return <Card>{items.map(item => <li key={item.id}>{item.name}</li>)}</Card>;
}
        `.trim(),
      );

      expect(result.code).toContain('__listValue(');
      expect(result.code).toContain('__element("li")');
    });

    it('extracts key function from JSX key prop in component children', () => {
      const result = compile(
        `
function Wrapper({ children }) {
  return <div>{children}</div>;
}
function App() {
  let items = [{ id: 1, text: "hello" }];
  return <Wrapper>{items.map(item => <span key={item.id}>{item.text}</span>)}</Wrapper>;
}
        `.trim(),
      );

      expect(result.code).toContain('__listValue(');
      expect(result.code).toMatch(/\(item\)\s*=>\s*item\.id/);
    });

    it('wraps source array in getter for reactivity', () => {
      const result = compile(
        `
function Wrapper({ children }) {
  return <div>{children}</div>;
}
function App() {
  let items = [{ id: 1 }];
  return <Wrapper>{items.map(item => <div key={item.id} />)}</Wrapper>;
}
        `.trim(),
      );

      expect(result.code).toContain('__listValue(');
      expect(result.code).toMatch(/\(\)\s*=>\s*items\.value/);
    });

    it('emits null keyFn when no key prop in component children', () => {
      const result = compile(
        `
function Wrapper({ children }) {
  return <div>{children}</div>;
}
function App() {
  let items = ["a", "b"];
  return <Wrapper>{items.map(item => <li>{item}</li>)}</Wrapper>;
}
        `.trim(),
      );

      expect(result.code).toContain('__listValue(');
      expect(result.code).toMatch(/__listValue\(\s*\(\)\s*=>[^,]+,\s*null\s*,/);
    });

    it('adds __listValue to internals import', () => {
      const result = compile(
        `
function Wrapper({ children }) {
  return <div>{children}</div>;
}
function App() {
  let items = [{ id: 1 }];
  return <Wrapper>{items.map(item => <div key={item.id} />)}</Wrapper>;
}
        `.trim(),
      );

      const internalsImport = result.code
        .split('\n')
        .find((line) => line.includes("from '@vertz/ui/internals'"));
      expect(internalsImport).toBeDefined();
      expect(internalsImport).toContain('__listValue');
    });
  });
});
