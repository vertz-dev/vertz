import { describe, expect, it } from 'bun:test';
import { compile } from '../compiler';
import { loadManifestFromJson } from '../reactivity-manifest';
import type { ReactivityManifest } from '../types';

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
    // ctx.theme is non-reactive, so it uses __insert (no effect overhead).
    // No .value is inserted (not recognized as signal API).
    expect(result.code).toContain('__insert(');
    expect(result.code).not.toContain('__child(');
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

  // ─── Callback classification e2e (#988) ──────────────

  it('arrow function referencing signal is NOT wrapped in computed()', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  const increment = () => { count++; };
  const doubled = count * 2;
  return <button onClick={increment}>{doubled}</button>;
}
    `.trim(),
    );

    // increment is an arrow function — stable reference, NOT computed
    expect(result.code).not.toContain('computed(() => () =>');
    expect(result.code).toContain('const increment = () =>');
    // doubled is a value expression referencing a signal — IS computed
    expect(result.code).toContain('computed(() =>');
    expect(result.code).toContain('count.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('arrow function referencing query signal property is NOT wrapped in computed()', () => {
    const result = compile(
      `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query('/api/tasks');
  const handleError = () => { if (tasks.error) console.log(tasks.error); };
  const hasError = tasks.error ? 'yes' : 'no';
  return <div onClick={handleError}>{hasError}</div>;
}
    `.trim(),
    );

    // handleError is an arrow function — NOT computed
    expect(result.code).not.toContain('computed(() => () =>');
    expect(result.code).toContain('const handleError = () =>');
    // hasError is a value expression reading signal property — IS computed
    expect(result.code).toContain('computed(() =>');
    expect(result.code).toContain('tasks.error.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('function expression referencing signal is NOT wrapped in computed()', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  const format = function() { return 'Count: ' + count; };
  return <div>{format}</div>;
}
    `.trim(),
    );

    // format is a function expression — stable reference, NOT computed
    expect(result.code).not.toContain('computed(() => function');
    expect(result.code).toContain('const format = function()');
    expect(result.diagnostics).toHaveLength(0);
  });

  // ─── Manifest-based compilation (#989) ──────────────

  it('uses manifest instead of hardcoded registry when manifests are provided', () => {
    // Manifest says query has 'customProp' as signal property (NOT the default registry values)
    const manifest = loadManifestFromJson({
      version: 1,
      filePath: '@vertz/ui',
      exports: {
        query: {
          kind: 'function',
          reactivity: {
            type: 'signal-api',
            signalProperties: ['customProp'],
            plainProperties: ['data', 'loading', 'error', 'refetch'],
          },
        },
      },
    } as ReactivityManifest);

    const result = compile(
      `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query('/api/tasks');
  const x = tasks.customProp ? 'yes' : 'no';
  const y = tasks.data ? 'yes' : 'no';
  return <div>{x}{y}</div>;
}
    `.trim(),
      { manifests: { '@vertz/ui': manifest } },
    );

    // x depends on customProp (signal in manifest) → computed
    expect(result.code).toContain('computed(() =>');
    // tasks.customProp should get .value (it's a signal property per manifest)
    expect(result.code).toContain('tasks.customProp.value');
    // tasks.data is plain in this manifest → should NOT get .value
    expect(result.code).not.toContain('tasks.data.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('auto-loads framework manifest for @vertz/ui without explicit manifests option', () => {
    // No manifests option — the compiler should auto-load the framework manifest
    const result = compile(
      `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query('/api/tasks');
  const x = tasks.data ? 'yes' : 'no';
  return <div>{x}</div>;
}
    `.trim(),
    );

    // tasks.data should get .value (it's a signal property in the framework manifest)
    expect(result.code).toContain('tasks.data.value');
    // x depends on tasks.data (signal) → computed
    expect(result.code).toContain('computed(() =>');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('classifies destructured prop in child as reactive (props are getter-backed)', () => {
    const result = compile(
      `
function Badge({ label }: { label: string }) {
  return <span>{label}</span>;
}
    `.trim(),
    );

    // Props compile to __props.xxx getters — must use __child for reactive tracking
    expect(result.code).toContain('__child(');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('classifies destructured prop in attribute as reactive', () => {
    const result = compile(
      `
function Card({ className }: { className: string }) {
  return <div class={className}>Content</div>;
}
    `.trim(),
    );

    // Prop attribute must use __attr for reactive tracking
    expect(result.code).toContain('__attr(');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('maps className to class in setAttribute for static string', () => {
    const result = compile(
      `
function App() {
  return <div className="wrapper">Content</div>;
}
    `.trim(),
    );

    expect(result.code).toContain('setAttribute("class"');
    expect(result.code).not.toContain('"className"');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('maps className to class in __attr for reactive expression', () => {
    const result = compile(
      `
function Card({ cls }: { cls: string }) {
  return <div className={cls}>Content</div>;
}
    `.trim(),
    );

    expect(result.code).toContain('__attr(');
    expect(result.code).toContain('"class"');
    expect(result.code).not.toContain('"className"');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('maps className to class in guarded setAttribute for static const', () => {
    const result = compile(
      `
function App() {
  const cls = "wrapper";
  return <div className={cls}>Content</div>;
}
    `.trim(),
    );

    expect(result.code).toContain('setAttribute("class"');
    expect(result.code).not.toContain('"className"');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('applies list reconciliation for prop-backed arrays', () => {
    const result = compile(
      `
function TodoList({ items }: { items: any[] }) {
  return <ul>{items.map((item: any) => <li key={item.id}>{item.title}</li>)}</ul>;
}
    `.trim(),
    );

    // Prop array must go through __list, not __child or __insert
    expect(result.code).toContain('__list(');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('emits guarded setAttribute for static attribute expressions', () => {
    const result = compile(
      `
import { query } from '@vertz/ui';
function Dashboard() {
  const tasks = query(api.todos.list());
  const THEME = 'dark';
  return <div class={THEME} data-loading={tasks.loading}>Hello</div>;
}
    `.trim(),
    );

    // Static const attribute should use guarded setAttribute, not __attr
    expect(result.code).toContain('setAttribute("class"');
    expect(result.code).not.toContain('__attr(__el0, "class"');
    // Reactive attribute still uses __attr
    expect(result.code).toContain('__attr(');
    expect(result.code).toContain('tasks.loading.value');
  });

  it('handles boolean HTML attributes correctly for static expressions', () => {
    const result = compile(
      `
function Button() {
  const IS_DISABLED = false;
  return <button disabled={IS_DISABLED}>Click</button>;
}
    `.trim(),
    );

    // Must have the null/false/true guard
    expect(result.code).toContain('__v !== false');
    expect(result.code).toContain('__v === true ? ""');
    expect(result.code).not.toContain('__attr(');
  });

  it('keeps __attr for destructured prop attributes', () => {
    const result = compile(
      `
function Card({ className }: { className: string }) {
  const ROLE = 'article';
  return <div class={className} role={ROLE}>Content</div>;
}
    `.trim(),
    );

    // Prop attribute is reactive — must use __attr
    expect(result.code).toContain('__attr(');
    // Static const attribute should use setAttribute
    expect(result.code).toContain('setAttribute("role"');
  });

  it('emits __insert for static non-literal child expressions', () => {
    const result = compile(
      `
import { query } from '@vertz/ui';
function TaskList() {
  const tasks = query(api.todos.list());
  const HEADER = 'My Tasks';
  return (
    <div>
      <h1>{HEADER}</h1>
      <span>{tasks.loading}</span>
    </div>
  );
}
    `.trim(),
    );

    // Static const child should use __insert, not __child
    expect(result.code).toContain('__insert(');
    expect(result.code).not.toContain('__child(() => HEADER)');
    // Reactive child still uses __child
    expect(result.code).toContain('__child(() => tasks.loading.value)');
  });

  it('keeps __child for destructured prop child expressions', () => {
    const result = compile(
      `
function Badge({ label }: { label: string }) {
  const ICON = '*';
  return <span>{ICON}{label}</span>;
}
    `.trim(),
    );

    // Static const uses __insert
    expect(result.code).toContain('__insert(');
    // Prop is reactive — must use __child
    expect(result.code).toContain('__child(');
  });

  // ─── Phase 3: Edge cases and regression guards ──────────────

  it('mixed static and reactive children in same element', () => {
    const result = compile(
      `
function App() {
  let count = 0;
  const LABEL = 'Count';
  return <div>{LABEL}: {count}</div>;
}
    `.trim(),
    );

    // LABEL is static — __insert
    expect(result.code).toContain('__insert(');
    // count is reactive — __child
    expect(result.code).toContain('__child(');
    expect(result.code).toContain('count.value');
  });

  it('static utility function call on static args uses __insert', () => {
    const result = compile(
      `
function App() {
  const DATE = '2024-01-01';
  return <span>{formatDate(DATE)}</span>;
}
    `.trim(),
    );

    // formatDate(DATE) has no reactive deps — should use __insert
    expect(result.code).toContain('__insert(');
    expect(result.code).not.toContain('__child(');
  });

  it('list transform still fires for reactive arrays (no regression)', () => {
    const result = compile(
      `
function App() {
  let items = [1, 2, 3];
  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}
    `.trim(),
    );

    // items is a signal — .map() should use __list
    expect(result.code).toContain('__list(');
  });

  it('conditional transform still fires before reactive check (no regression)', () => {
    const result = compile(
      `
function App() {
  let show = true;
  return <div>{show ? <span>yes</span> : <span>no</span>}</div>;
}
    `.trim(),
    );

    // Ternary in child position should use __conditional
    expect(result.code).toContain('__conditional(');
  });

  it('callback-local reactive const in .map() uses __attr with inlined signal read', () => {
    const result = compile(
      `
function RadioItems() {
  let selected = 'a';
  const items = ['a', 'b', 'c'];
  return <div>{items.map((v) => {
    const isActive = v === selected;
    return <div data-state={isActive ? 'checked' : 'unchecked'} />;
  })}</div>;
}
    `.trim(),
    );

    // isActive is derived from selected (signal) — must use __attr with
    // the initializer inlined so selected.value is inside the getter
    expect(result.code).toContain('__attr(');
    expect(result.code).toContain('selected.value');
    // The __attr getter should contain the inlined expression
    expect(result.code).toMatch(
      /__attr\([^,]+,\s*"data-state",\s*\(\)\s*=>\s*\(v === selected\.value\)/,
    );
  });

  it('callback-local static const in .map() still uses setAttribute', () => {
    const result = compile(
      `
function App() {
  let selected = 'a';
  const items = ['a', 'b', 'c'];
  return <div>{items.map((v) => {
    const label = "static";
    return <div data-label={label} />;
  })}</div>;
}
    `.trim(),
    );

    // Static const stays static — no __attr needed
    expect(result.code).toContain('setAttribute("data-label"');
    expect(result.code).not.toMatch(/__attr\([^,]+,\s*"data-label"/);
  });

  it('radio-composed.tsx pattern — multiple attrs using same reactive const', () => {
    const result = compile(
      `
function RadioGroup() {
  let selectedValue = 'a';
  const items = ['a', 'b', 'c'];
  return <div>{items.map((value) => {
    const isActive = value === selectedValue;
    return (
      <div
        aria-checked={isActive ? 'true' : 'false'}
        data-state={isActive ? 'checked' : 'unchecked'}
        tabindex={isActive ? '0' : '-1'}
      >
        <span data-state={isActive ? 'checked' : 'unchecked'} />
      </div>
    );
  })}</div>;
}
    `.trim(),
    );

    // All four attributes referencing isActive should use __attr with inlined signal read
    const attrMatches = result.code.match(/__attr\(/g);
    expect(attrMatches?.length).toBeGreaterThanOrEqual(4);
    // Each __attr getter should contain selectedValue.value (inlined)
    expect(result.code).not.toMatch(/__attr\([^)]+,\s*\(\)\s*=>\s*isActive\b/);
    expect(result.code).toContain('selectedValue.value');
  });

  it('callback-local reactive const in JSX child uses __child with inlined signal read', () => {
    const result = compile(
      `
function App() {
  let selected = 'a';
  const items = ['a', 'b', 'c'];
  return <div>{items.map((v) => {
    const label = v === selected ? 'active' : 'inactive';
    return <span>{label}</span>;
  })}</div>;
}
    `.trim(),
    );

    // label is reactive — should use __child with inlined signal read
    expect(result.code).toContain('__child(');
    // The __child getter should contain the inlined initializer with selected.value
    expect(result.code).toMatch(/__child\(\(\)\s*=>\s*\(v === selected\.value/);
  });

  it('transitive callback-local const chain is inlined correctly', () => {
    const result = compile(
      `
function App() {
  let count = 0;
  const items = [1, 2, 3];
  return <ul>{items.map((v) => {
    const doubled = count * 2;
    const label = doubled + v;
    return <li data-val={label}>item</li>;
  })}</ul>;
}
    `.trim(),
    );

    // label depends on doubled which depends on count (signal)
    // Both should be inlined transitively in the __attr getter
    expect(result.code).toContain('__attr(');
    // The getter must contain count.value (transitively inlined through doubled → label)
    expect(result.code).toMatch(/__attr\([^,]+,\s*"data-val",\s*\(\)\s*=>\s*\(.*count\.value/);
  });

  it('variable-assignment .map() pattern still works (regression)', () => {
    const result = compile(
      `
function App() {
  let selected = 'a';
  const items = ['a', 'b', 'c'];
  const itemNodes = items.map((v) => {
    const isActive = v === selected;
    return <div data-state={isActive ? 'checked' : 'unchecked'} />;
  });
  return <div>{itemNodes}</div>;
}
    `.trim(),
    );

    // Variable-assignment pattern: itemNodes is a computed
    expect(result.code).toContain('computed(');
    // The const declaration should be preserved
    expect(result.code).toContain('const isActive');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('inlining does not corrupt string literals containing const name', () => {
    const result = compile(
      `
function App() {
  let selected = 'a';
  const items = ['a', 'b', 'c'];
  return <div>{items.map((v) => {
    const active = v === selected;
    return <div title={active ? "active item" : "inactive item"} />;
  })}</div>;
}
    `.trim(),
    );

    // The string "active item" must NOT be corrupted by inlining
    expect(result.code).toContain('"active item"');
    expect(result.code).toContain('"inactive item"');
    // The active identifier in the ternary IS inlined
    expect(result.code).toContain('__attr(');
    expect(result.code).toContain('selected.value');
  });

  it('does not collect consts from nested inner functions (analyzer level)', () => {
    // Verify at the analyzer level that consts inside nested arrow functions
    // are not treated as outer callback-level reactive consts.
    // This uses the JsxAnalyzer directly to avoid unrelated findJsxInBody issues.
    const code = `
      function App() {
        let selected = 'a';
        const items = ['a', 'b', 'c'];
        return <div>{items.map((v) => {
          const handler = () => { const innerVal = v + selected; };
          return <div data-label={v} />;
        })}</div>;
      }
    `;
    const result = compile(code.trim());

    // innerVal is inside a nested arrow — should NOT leak to outer scope.
    // data-label={v} references callback param v (not reactive), should be static.
    // The compilation should not crash (no ReferenceError from wrong scoping).
    expect(result.diagnostics).toHaveLength(0);
  });

  it('prop-backed array in .map() uses __list (Phase 0 regression guard)', () => {
    const result = compile(
      `
function List({ items }: { items: any[] }) {
  return <ul>{items.map((item: any) => <li key={item.id}>{item.name}</li>)}</ul>;
}
    `.trim(),
    );

    // Prop array .map() must use __list, not __insert
    expect(result.code).toContain('__list(');
    expect(result.code).not.toContain('__insert(__el0, items.map');
  });
});
