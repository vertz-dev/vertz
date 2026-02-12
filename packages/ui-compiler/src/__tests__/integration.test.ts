import { describe, expect, it } from 'vitest';
import { compile } from '../compiler';
import vertzPlugin from '../vite-plugin';

describe('Integration Tests', () => {
  it('IT-1B-1: Counter component — let count → signal, {count} → subscription', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  return <button onClick={() => count++}>{count}</button>;
}
    `.trim(),
    );

    // Signal transform
    expect(result.code).toContain('const count = signal(0)');
    // Read in JSX becomes .value
    expect(result.code).toContain('count.value');
    // Runtime imports from @vertz/ui
    expect(result.code).toContain('import {');
    expect(result.code).toContain('signal');
    expect(result.code).toContain("from '@vertz/ui'");
    // DOM helpers from @vertz/ui/internals
    expect(result.code).toContain("from '@vertz/ui/internals'");
    expect(result.code).toContain('__element("button")');
    expect(result.code).toContain('__on(');
    expect(result.code).toContain('__text(');
  });

  it('IT-1B-2: Computed chain — let quantity, const total, const formatted', () => {
    const result = compile(
      `
function Pricing() {
  let quantity = 1;
  const total = 10 * quantity;
  const formatted = "$" + total;
  return <div>{formatted}</div>;
}
    `.trim(),
    );

    // Signal
    expect(result.code).toContain('const quantity = signal(1)');
    // Computed chain
    expect(result.code).toContain('computed(() =>');
    // Reads use .value
    expect(result.code).toContain('quantity.value');
    expect(result.code).toContain('total.value');
    // Imports
    expect(result.code).toContain('signal');
    expect(result.code).toContain('computed');
  });

  it('IT-1B-3: Mutation — todos.push() → peek() + notify()', () => {
    const result = compile(
      `
function TodoApp() {
  let todos = [];
  return <div onClick={() => todos.push("new")}>{todos}</div>;
}
    `.trim(),
    );

    expect(result.code).toContain('todos.peek().push');
    expect(result.code).toContain('todos.notify()');
  });

  it('IT-1B-4: Static JSX — no signal or computed in output', () => {
    const result = compile(
      `
function StaticPage() {
  const title = "Hello World";
  const subtitle = "Welcome";
  return <div><h1>{title}</h1><p>{subtitle}</p></div>;
}
    `.trim(),
    );

    // Should NOT contain signal or computed transforms
    expect(result.code).not.toContain('signal(');
    expect(result.code).not.toContain('computed(');
    // But should still transform JSX
    expect(result.code).toContain('__element(');
  });

  it('IT-1B-5: Props — reactive → get value(), static → label: "Count"', () => {
    const result = compile(
      `
function Parent() {
  let count = 0;
  return <Child value={count} label="Count" />;
}
    `.trim(),
    );

    // Reactive prop becomes getter
    expect(result.code).toContain('get value()');
    // Static prop stays plain
    expect(result.code).toContain('label: "Count"');
  });

  it('IT-1B-6: Diagnostic — const mutation → non-reactive-mutation with fix', () => {
    const result = compile(
      `
function App() {
  const items = [];
  items.push("x");
  return <div>{items}</div>;
}
    `.trim(),
    );

    expect(result.diagnostics.length).toBeGreaterThanOrEqual(1);
    const diag = result.diagnostics.find((d) => d.code === 'non-reactive-mutation');
    expect(diag).toBeDefined();
    expect(diag?.fix).toContain('let');
    expect(diag?.severity).toBe('warning');
  });

  it('IT-1B-7: Vite plugin — .tsx → transformed code + source map', () => {
    const plugin = vertzPlugin();

    const code = `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
    `.trim();

    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => { code: string; map: unknown } | undefined;
    const result = transform.call(plugin, code, 'Counter.tsx');

    expect(result).toBeDefined();
    expect(result?.code).toContain('signal(');
    expect(result?.code).toContain('__element(');
    expect(result?.map).toBeDefined();

    // Non-tsx should be skipped
    const skipped = transform.call(plugin, 'const x = 1;', 'file.ts');
    expect(skipped).toBeUndefined();
  });
});
