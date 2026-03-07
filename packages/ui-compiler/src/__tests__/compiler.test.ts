import { describe, expect, it } from 'bun:test';
import { compile } from '../compiler';

describe('compile()', () => {
  it('returns transformed code with signals', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
    `.trim(),
    );

    expect(result.code).toContain('signal(');
    expect(result.code).toContain('count.value');
  });

  it('emits variable name as second argument to signal()', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
    `.trim(),
    );

    expect(result.code).toContain("signal(0, 'count')");
  });

  it('emits unique keys for same-named signals in different components', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}

function Other() {
  let count = 0;
  return <div>{count}</div>;
}
    `.trim(),
    );

    // Both should have 'count' key — scoping is per-component
    const matches = result.code.match(/signal\(0, 'count'\)/g);
    expect(matches).toHaveLength(2);
  });

  it('emits suffixed keys for duplicate names within one component', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  let count = 10;
  return <div>{count}</div>;
}
    `.trim(),
    );

    expect(result.code).toContain("signal(0, 'count')");
    expect(result.code).toContain("signal(10, 'count$1')");
  });

  it('returns source map with mappings', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
    `.trim(),
    );

    expect(result.map).toBeDefined();
    expect(result.map.version).toBe(3);
    expect(result.map.mappings).toBeTruthy();
    expect(result.map.sources).toEqual(['input.tsx']);
  });

  it('returns diagnostics for unsupported destructuring patterns', () => {
    // Nested destructuring is not auto-transformed — diagnostic should fire
    const result = compile(
      `
function Card({ style: { color } }: { style: { color: string } }) {
  return <div>{color}</div>;
}
    `.trim(),
    );

    expect(result.diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics[0]?.code).toBe('props-destructuring');
  });

  it('does not emit props-destructuring diagnostic for auto-transformed components', () => {
    const result = compile(
      `
function Card({ title }: { title: string }) {
  return <div>{title}</div>;
}
    `.trim(),
    );

    const propsDestructuringDiags = result.diagnostics.filter(
      (d) => d.code === 'props-destructuring',
    );
    expect(propsDestructuringDiags.length).toBe(0);
  });

  it('adds runtime imports based on used features', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
    `.trim(),
    );

    expect(result.code).toContain('import { ');
    expect(result.code).toContain("from '@vertz/ui'");
    expect(result.code).toContain('signal');
    // DOM helpers import from internals subpath
    expect(result.code).toContain("from '@vertz/ui/internals'");
  });

  it('returns source unchanged when no components found', () => {
    const source = `const x = 42;`;
    const result = compile(source);
    expect(result.code).toBe(source);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('accepts a string as second arg for backward compat (filename)', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
      `.trim(),
      'my-file.tsx',
    );

    expect(result.map.sources).toEqual(['my-file.tsx']);
  });

  it('accepts an options object with filename', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
      `.trim(),
      { filename: 'my-file.tsx' },
    );

    expect(result.map.sources).toEqual(['my-file.tsx']);
  });

  it('imports DOM helpers from @vertz/ui/internals when target is dom (explicit)', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
      `.trim(),
      { target: 'dom' },
    );

    expect(result.code).toContain("from '@vertz/ui/internals'");
    expect(result.code).not.toContain("from '@vertz/tui/internals'");
  });

  it('imports DOM helpers from @vertz/tui/internals when target is tui', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
      `.trim(),
      { target: 'tui' },
    );

    expect(result.code).toContain("from '@vertz/tui/internals'");
    expect(result.code).not.toContain("from '@vertz/ui/internals'");
  });

  it('keeps signal/runtime import as @vertz/ui regardless of target', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
      `.trim(),
      { target: 'tui' },
    );

    // Signal import stays @vertz/ui
    expect(result.code).toContain("from '@vertz/ui'");
    // DOM helpers import is changed to tui
    expect(result.code).toContain("from '@vertz/tui/internals'");
  });

  it('generates internals import for DOM helpers when present in output', () => {
    // The compiler should scan its output for DOM helper calls (__conditional,
    // __list, __show, __classList) and include them in the internals import.
    // This component manually uses these helpers alongside reactive JSX.
    const result = compile(
      `
function App() {
  let count = 0;
  __show(el, () => count);
  __conditional(() => count, () => "yes", () => "no");
  __list(items, (item) => item);
  __classList(el, { active: count });
  return <div>{count}</div>;
}
      `.trim(),
    );

    const internalsImport = result.code
      .split('\n')
      .find((line) => line.includes("from '@vertz/ui/internals'"));
    expect(internalsImport).toBeDefined();
    expect(internalsImport).toContain('__conditional');
    expect(internalsImport).toContain('__list');
    expect(internalsImport).toContain('__show');
    expect(internalsImport).toContain('__classList');
  });

  it('does not wrap form() in computed() when it references a query() variable', () => {
    const result = compile(
      `
import { query, form } from '@vertz/ui';

function TaskPage() {
  const tasksQuery = query(api.tasks.list());
  const taskForm = form(api.tasks.create, {
    onSuccess: () => tasksQuery.refetch(),
    resetOnSuccess: true,
  });
  return (
    <form onSubmit={taskForm.onSubmit}>
      <input name="title" />
      <button disabled={taskForm.submitting}>Add</button>
    </form>
  );
}
      `.trim(),
    );

    // form() should NOT be wrapped in computed()
    expect(result.code).not.toMatch(/computed\(\(\) => form\(/);
    // form() should remain as a direct call
    expect(result.code).toContain('form(api.tasks.create');
    // __bindElement should be generated for the form element
    expect(result.code).toContain('taskForm.__bindElement(');
  });

  it('returns ssr-unsafe-api diagnostics through compile()', () => {
    const result = compile(
      `
function App() {
  localStorage.getItem('key');
  return <div>ok</div>;
}
      `.trim(),
    );
    const ssrDiags = result.diagnostics.filter((d) => d.code === 'ssr-unsafe-api');
    expect(ssrDiags).toHaveLength(1);
    expect(ssrDiags[0]?.message).toContain('localStorage');
    expect(ssrDiags[0]?.severity).toBe('warning');
  });

  // ─── Props-derived computed (#964) ──────────────

  it('wraps const derived from named props in computed()', () => {
    const result = compile(
      `
function Card(props: CardProps) {
  const label = props.title + ' - ' + props.subtitle;
  return <div>{label}</div>;
}
      `.trim(),
    );
    expect(result.code).toContain('computed(() => props.title');
    expect(result.code).toContain('label.value');
  });

  it('wraps const derived from destructured props in computed()', () => {
    const result = compile(
      `
function Card({ title, subtitle }: CardProps) {
  const label = title + ' - ' + subtitle;
  return <div>{label}</div>;
}
      `.trim(),
    );
    expect(result.code).toContain('computed(() => __props.title');
    expect(result.code).toContain('label.value');
  });
});
