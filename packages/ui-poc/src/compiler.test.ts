import { describe, expect, it } from 'vitest';
import { transform } from './compiler';

describe('compiler transform', () => {
  describe('let -> signal() transformation', () => {
    it('transforms a simple reactive let to signal()', () => {
      const input = `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}`;

      const result = transform(input);

      expect(result.code).toContain('const __count = __signal(0)');
      expect(result.code).toContain('__count.get()');
      expect(result.code).not.toContain('let count = 0');
    });

    it('does not transform non-reactive let variables', () => {
      const input = `
function Counter() {
  let notUsedInJsx = 0;
  return <div>hello</div>;
}`;

      const result = transform(input);
      expect(result.code).toContain('let notUsedInJsx = 0');
      expect(result.code).not.toContain('__signal');
    });

    it('transforms count++ to signal update', () => {
      const input = `
function Counter() {
  let count = 0;
  return <button onClick={() => count++}>{count}</button>;
}`;

      const result = transform(input);
      expect(result.code).toContain('__count.update(v => v + 1)');
    });

    it('transforms count-- to signal update', () => {
      const input = `
function Counter() {
  let count = 10;
  return <button onClick={() => count--}>{count}</button>;
}`;

      const result = transform(input);
      expect(result.code).toContain('__count.update(v => v - 1)');
    });

    it('transforms assignment operator', () => {
      const input = `
function Toggle() {
  let active = false;
  return <button onClick={() => active = !active}>{active}</button>;
}`;

      const result = transform(input);
      expect(result.code).toContain('__active.set(!__active.get())');
    });

    it('transforms += operator', () => {
      const input = `
function Counter() {
  let count = 0;
  return <button onClick={() => count += 5}>{count}</button>;
}`;

      const result = transform(input);
      expect(result.code).toContain('__count.update(v => v + (5))');
    });
  });

  describe('const -> computed() transformation', () => {
    it('transforms derived const that depends on reactive let', () => {
      const input = `
function PriceDisplay() {
  let quantity = 1;
  const total = quantity * 10;
  return <p>{total}</p>;
}`;

      const result = transform(input);
      expect(result.code).toContain('__computed');
      expect(result.code).toContain('__quantity.get() * 10');
      expect(result.code).toContain('__total.get()');
    });

    it('does not transform const that is not derived from reactive var', () => {
      const input = `
function Greeting() {
  const greeting = "hello";
  return <p>{greeting}</p>;
}`;

      const result = transform(input);
      expect(result.code).not.toContain('__computed');
      expect(result.code).toContain('const greeting = "hello"');
    });

    it('handles transitive computed dependencies', () => {
      const input = `
function Example() {
  let count = 0;
  const doubled = count * 2;
  const message = "Value: " + doubled;
  return <p>{message}</p>;
}`;

      const result = transform(input);
      // doubled depends on count (reactive) -> becomes computed
      expect(result.code).toContain('const __doubled = __computed');
      // message depends on doubled (reactive derived) -> should also become computed
      expect(result.code).toContain('const __message = __computed');
    });
  });

  describe('component detection', () => {
    it('detects function declaration components (PascalCase)', () => {
      const input = `
function MyComponent() {
  let state = 0;
  return <div>{state}</div>;
}`;

      const result = transform(input);
      expect(result.code).toContain('__signal');
    });

    it('ignores non-component functions (camelCase)', () => {
      const input = `
function helperFunction() {
  let state = 0;
  return <div>{state}</div>;
}`;

      const result = transform(input);
      expect(result.code).not.toContain('__signal');
    });

    it('ignores functions without JSX return', () => {
      const input = `
function Helper() {
  let count = 0;
  return count + 1;
}`;

      const result = transform(input);
      expect(result.code).not.toContain('__signal');
    });
  });

  describe('source map generation', () => {
    it('produces a valid source map', () => {
      const input = `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}`;

      const result = transform(input);
      expect(result.map).toBeDefined();
      expect(result.map.mappings).toBeTruthy();
    });
  });

  describe('runtime import injection', () => {
    it('adds runtime import when transforms are applied', () => {
      const input = `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}`;

      const result = transform(input);
      expect(result.code).toContain(
        'import { signal as __signal, computed as __computed } from "@vertz/ui/runtime"',
      );
    });

    it('does not add runtime import when no transforms needed', () => {
      const input = `
function Counter() {
  const message = "hello";
  return <div>{message}</div>;
}`;

      const result = transform(input);
      expect(result.code).not.toContain('@vertz/ui/runtime');
    });
  });

  describe('multiple reactive variables', () => {
    it('transforms multiple lets in the same component', () => {
      const input = `
function Form() {
  let name = "";
  let email = "";
  return (
    <form>
      <input value={name} onInput={(e) => name = e.target.value} />
      <input value={email} onInput={(e) => email = e.target.value} />
    </form>
  );
}`;

      const result = transform(input);
      expect(result.code).toContain('const __name = __signal("")');
      expect(result.code).toContain('const __email = __signal("")');
      expect(result.code).toContain('__name.get()');
      expect(result.code).toContain('__email.get()');
    });
  });
});
