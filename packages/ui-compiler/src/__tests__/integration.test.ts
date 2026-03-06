import { describe, expect, it } from 'bun:test';
import { compile } from '../compiler';

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
    expect(result.code).toContain("const count = signal(0, 'count')");
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
    // Now uses __child for expression children to handle both Nodes and primitives
    expect(result.code).toContain('__child(');
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
    expect(result.code).toContain("const quantity = signal(1, 'quantity')");
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

  it('IT-1B-8: Signal API auto-unwrap — reactive JSX attribute', () => {
    const result = compile(
      `
import { form } from '@vertz/ui';

function TaskForm() {
  const taskForm = form(someMethod, { schema: someSchema });
  return <button disabled={taskForm.submitting}>Submit</button>;
}
    `.trim(),
    );

    // Signal API property in JSX attribute: .value inserted AND reactive
    expect(result.code).toContain('taskForm.submitting.value');
    expect(result.code).toContain('__attr(');
    expect(result.code).not.toContain('setAttribute("disabled"');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('IT-1B-9: Signal API auto-unwrap — direct JSX child expression', () => {
    const result = compile(
      `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query('/api/tasks');
  return <div>{tasks.loading && <span>Loading...</span>}</div>;
}
    `.trim(),
    );

    // Signal API property in JSX expression: .value inserted
    expect(result.code).toContain('tasks.loading.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('IT-1B-10: Signal API auto-unwrap — mixed direct and indirect usage', () => {
    const result = compile(
      `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query('/api/tasks');
  const data = tasks.data;
  return <div class={tasks.loading ? 'loading' : ''}>{data}</div>;
}
    `.trim(),
    );

    // Direct usage in JSX attribute: .value inserted AND reactive
    expect(result.code).toContain('tasks.loading.value');
    expect(result.code).toContain('__attr(');
    // Indirect usage via variable assignment: .value inserted AND computed wrapping
    expect(result.code).toContain('tasks.data.value');
    expect(result.code).toContain('computed(() =>');
    // data in JSX child should be reactive (__child), not static (__insert)
    expect(result.code).toContain('__child(');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('IT-1B-11: const derived from query signal property → computed + reactive JSX', () => {
    const result = compile(
      `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query('/api/tasks');
  const hasError = tasks.error ? 'yes' : 'no';
  return <div>{hasError}</div>;
}
    `.trim(),
    );

    // hasError should be wrapped in computed()
    expect(result.code).toContain('computed(() =>');
    // Signal auto-unwrap should insert .value
    expect(result.code).toContain('tasks.error.value');
    // JSX usage should be reactive (__child), not static (__insert)
    expect(result.code).toContain('__child(');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('IT-1B-12: const from signal API property AND local signal → computed', () => {
    const result = compile(
      `
import { query } from '@vertz/ui';

function TaskList() {
  let filter = 'all';
  const tasks = query('/api/tasks');
  const filtered = filter === 'all' ? tasks.data : tasks.data?.filter(x => x.status === filter);
  return <div>{filtered}</div>;
}
    `.trim(),
    );

    // filtered should be computed (depends on both signal + signalApiVar)
    expect(result.code).toContain('computed(() =>');
    // Both signal reads should have .value
    expect(result.code).toContain('tasks.data.value');
    expect(result.code).toContain('filter.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('IT-1B-13: const from query in JSX attribute and direct signal property in JSX child', () => {
    const result = compile(
      `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query('/api/tasks');
  const hasError = tasks.error ? 'error' : '';
  return <div class={hasError}>{tasks.data}</div>;
}
    `.trim(),
    );

    // hasError in JSX attribute → reactive (__attr)
    expect(result.code).toContain('__attr(');
    // tasks.data direct in JSX child → reactive
    expect(result.code).toContain('tasks.data.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('IT-1B-14: plain property access stays static (not over-classified)', () => {
    const result = compile(
      `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query('/api/tasks');
  const fn = tasks.refetch;
  return <button onClick={fn}>Refetch</button>;
}
    `.trim(),
    );

    // fn stays static — refetch is a plain property, not a signal property
    expect(result.code).not.toContain('computed(');
    expect(result.code).toContain('const fn = tasks.refetch');
    expect(result.diagnostics).toHaveLength(0);
  });

  // ─── Context signal auto-unwrap ──────────────────────────────────────

  it('Context: signal transformer does NOT add .value to reactive source property access', () => {
    const result = compile(
      `
import { useContext } from '@vertz/ui';
function App() {
  const ctx = useContext(ThemeCtx);
  return <div>{ctx.theme}</div>;
}
    `.trim(),
    );

    // Signal transformer should NOT touch ctx.theme — no .value appended
    expect(result.code).not.toContain('ctx.theme.value');
    expect(result.code).not.toContain('ctx.value');
  });

  it('Context: JSX child with reactive source becomes __child thunk', () => {
    const result = compile(
      `
import { useContext } from '@vertz/ui';
function App() {
  const ctx = useContext(ThemeCtx);
  return <div>{ctx.theme}</div>;
}
    `.trim(),
    );

    // Should wrap in __child(() => ...) for reactive tracking
    expect(result.code).toContain('__child(');
    expect(result.code).toContain('ctx.theme');
  });

  it('Context: JSX attribute with reactive source becomes __attr', () => {
    const result = compile(
      `
import { useContext } from '@vertz/ui';
function App() {
  const ctx = useContext(ThemeCtx);
  return <div data-theme={ctx.theme}>hello</div>;
}
    `.trim(),
    );

    // Should use __attr for reactive attribute binding
    expect(result.code).toContain('__attr(');
    expect(result.code).toContain('ctx.theme');
  });

  it('Context: component prop with reactive source becomes getter', () => {
    const result = compile(
      `
import { useContext } from '@vertz/ui';
function App() {
  const ctx = useContext(ThemeCtx);
  return <ThemeLabel value={ctx.theme} />;
}
    `.trim(),
    );

    // Should generate getter for the reactive prop
    expect(result.code).toContain('get value()');
    expect(result.code).toContain('ctx.theme');
  });

  it('Context: aliased useContext import works', () => {
    const result = compile(
      `
import { useContext as getCtx } from '@vertz/ui';
function App() {
  const ctx = getCtx(ThemeCtx);
  return <div>{ctx.theme}</div>;
}
    `.trim(),
    );

    expect(result.code).toContain('__child(');
    expect(result.code).toContain('ctx.theme');
  });

  it('Context: local function named useContext is not recognized', () => {
    const result = compile(
      `
function App() {
  const useContext = () => ({ theme: 'light' });
  const ctx = useContext();
  return <div>{ctx.theme}</div>;
}
    `.trim(),
    );

    // Without @vertz/ui import, this is NOT a reactive source.
    // ctx.theme is non-literal so it gets __child for runtime tracking,
    // but no .value is inserted (not recognized as signal API).
    expect(result.code).toContain('__child(');
    expect(result.code).not.toContain('.value');
  });

  it('Context: const depending on reactive source is computed', () => {
    const result = compile(
      `
import { useContext } from '@vertz/ui';
function App() {
  const ctx = useContext(ThemeCtx);
  const label = "Theme: " + ctx.theme;
  return <div>{label}</div>;
}
    `.trim(),
    );

    // label should be classified as computed
    expect(result.code).toContain('computed(() =>');
    expect(result.code).toContain('ctx.theme');
  });

  it('IT-1B-16: signal API variable only in property access — no false __child from ref check', () => {
    const result = compile(
      `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query('/api/tasks');
  return <div>{tasks.data}</div>;
}
    `.trim(),
    );

    // tasks.data is a signal property access — should still be __child (reactive)
    // but via containsSignalApiPropertyAccess, not containsSignalApiReference
    expect(result.code).toContain('__child(');
    expect(result.code).toContain('tasks.data.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('preserves inline whitespace between text and JSX expressions', () => {
    const result = compile(
      `
function Greeting({ name }: { name: string }) {
  return <h3>AHOY {name}</h3>;
}
    `.trim(),
    );

    // The space between "AHOY" and {name} must be preserved.
    // __staticText("AHOY ") — trailing space kept.
    expect(result.code).toContain('__staticText("AHOY ")');
  });

  it('preserves leading whitespace after JSX expression', () => {
    const result = compile(
      `
function ItemCount({ count }: { count: number }) {
  return <span>{count} items</span>;
}
    `.trim(),
    );

    // The space between {count} and "items" must be preserved.
    expect(result.code).toContain('__staticText(" items")');
  });

  it('Context: non-null assertion on useContext preserves reactive classification', () => {
    const result = compile(
      `
import { useContext } from '@vertz/ui';
function Sidebar() {
  const settings = useContext(ThemeCtx)!;
  return <div>{settings.theme === 'light' ? <span>Moon</span> : <span>Sun</span>}</div>;
}
    `.trim(),
    );

    // settings should be classified as a reactive source despite the ! operator
    // JSX inside the ternary branches must be fully transformed (no raw JSX remnants)
    expect(result.code).not.toContain('<span>');
    expect(result.code).not.toContain('<Icon');
    // The ternary should use __conditional (reactive), not __insert (static)
    expect(result.code).toContain('__conditional(');
    expect(result.code).toContain('settings.theme');
  });

  it('collapses multi-line JSX text whitespace', () => {
    const result = compile(
      `
function Card() {
  return <div>
    Hello World
  </div>;
}
    `.trim(),
    );

    // Multi-line: indentation/newlines collapsed, content preserved.
    expect(result.code).toContain('__staticText("Hello World")');
    // Should NOT have leading/trailing spaces from indentation.
    expect(result.code).not.toContain('__staticText("\\n');
  });
});
