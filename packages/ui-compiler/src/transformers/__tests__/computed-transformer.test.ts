import { describe, expect, it } from 'bun:test';
import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
import { ComponentAnalyzer } from '../../analyzers/component-analyzer';
import type { VariableInfo } from '../../types';
import { ComputedTransformer } from '../computed-transformer';

function transform(code: string, variables: VariableInfo[]) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  const sf = project.createSourceFile('test.tsx', code);
  const components = new ComponentAnalyzer().analyze(sf);
  const s = new MagicString(code);
  const transformer = new ComputedTransformer();

  for (const comp of components) {
    transformer.transform(s, sf, comp, variables);
  }

  return s.toString();
}

describe('ComputedTransformer', () => {
  it('wraps computed initializer in computed()', () => {
    const code = `function Pricing() {\n  const total = 10 * quantity;\n  return <div>{total}</div>;\n}`;
    const result = transform(code, [
      { name: 'quantity', kind: 'signal', start: 0, end: 0 },
      { name: 'total', kind: 'computed', start: 0, end: 0 },
    ]);
    // Note: signal refs (quantity) don't get .value here — that's the signal transformer's job
    expect(result).toContain('const total = computed(() => 10 * quantity)');
  });

  it('transforms chained computeds correctly', () => {
    const code = `function Pricing() {\n  const total = 10 * quantity;\n  const formatted = "$" + total;\n  return <div>{formatted}</div>;\n}`;
    const result = transform(code, [
      { name: 'quantity', kind: 'signal', start: 0, end: 0 },
      { name: 'total', kind: 'computed', start: 0, end: 0 },
      { name: 'formatted', kind: 'computed', start: 0, end: 0 },
    ]);
    expect(result).toContain('computed(() => 10 * quantity)');
    // Computed reads get .value
    expect(result).toContain('computed(() => "$" + total.value)');
  });

  it('transforms destructuring into individual computeds', () => {
    const code = `function Profile() {\n  const { name, age } = user;\n  return <div>{name} - {age}</div>;\n}`;
    const result = transform(code, [
      { name: 'user', kind: 'signal', start: 0, end: 0 },
      { name: 'name', kind: 'computed', start: 0, end: 0 },
      { name: 'age', kind: 'computed', start: 0, end: 0 },
    ]);
    // Note: user doesn't get .value here — that's the signal transformer's job
    expect(result).toContain('const name = computed(() => user.name)');
    expect(result).toContain('const age = computed(() => user.age)');
  });

  it('emits synthetic var + computed bindings with .value for destructured signal API', () => {
    const code = `function TaskList() {\n  const { data, loading } = query('/api/tasks');\n  return <div>{data}</div>;\n}`;
    const result = transform(code, [
      {
        name: '__query_0',
        kind: 'static',
        start: 0,
        end: 0,
        signalProperties: new Set(['data', 'loading', 'error']),
        plainProperties: new Set(['refetch']),
      },
      {
        name: 'data',
        kind: 'computed',
        start: 0,
        end: 0,
        destructuredFrom: '__query_0',
      },
      {
        name: 'loading',
        kind: 'computed',
        start: 0,
        end: 0,
        destructuredFrom: '__query_0',
      },
    ]);
    expect(result).toContain("const __query_0 = query('/api/tasks')");
    expect(result).toContain('const data = computed(() => __query_0.data.value)');
    expect(result).toContain('const loading = computed(() => __query_0.loading.value)');
  });

  it('emits plain bindings without computed or .value for destructured signal API', () => {
    const code = `function TaskList() {\n  const { data, refetch } = query('/api/tasks');\n  return <div>{data}</div>;\n}`;
    const result = transform(code, [
      {
        name: '__query_0',
        kind: 'static',
        start: 0,
        end: 0,
        signalProperties: new Set(['data', 'loading', 'error']),
        plainProperties: new Set(['refetch']),
      },
      {
        name: 'data',
        kind: 'computed',
        start: 0,
        end: 0,
        destructuredFrom: '__query_0',
      },
      {
        name: 'refetch',
        kind: 'static',
        start: 0,
        end: 0,
        destructuredFrom: '__query_0',
      },
    ]);
    expect(result).toContain('const data = computed(() => __query_0.data.value)');
    expect(result).toContain('const refetch = __query_0.refetch');
    expect(result).not.toContain('computed(() => __query_0.refetch');
  });

  it('uses original property name for access and binding name for variable on renamed props', () => {
    const code = `function TaskList() {\n  const { data: tasks } = query('/api/tasks');\n  return <div>{tasks}</div>;\n}`;
    const result = transform(code, [
      {
        name: '__query_0',
        kind: 'static',
        start: 0,
        end: 0,
        signalProperties: new Set(['data', 'loading', 'error']),
        plainProperties: new Set(['refetch']),
      },
      {
        name: 'tasks',
        kind: 'computed',
        start: 0,
        end: 0,
        destructuredFrom: '__query_0',
      },
    ]);
    expect(result).toContain('const tasks = computed(() => __query_0.data.value)');
  });

  it('transforms computed reads in expressions to .value', () => {
    const code = `function Pricing() {\n  const total = 10 * quantity;\n  return <div>{total}</div>;\n}`;
    const result = transform(code, [
      { name: 'quantity', kind: 'signal', start: 0, end: 0 },
      { name: 'total', kind: 'computed', start: 0, end: 0 },
    ]);
    expect(result).toContain('{total.value}');
  });

  it('expands shorthand property to unwrap computed .value (#1858)', () => {
    const code = `function Page() {\n  const offset = (page - 1) * 10;\n  return <div>{query(() => fetch({ offset }))}</div>;\n}`;
    const result = transform(code, [
      { name: 'page', kind: 'signal', start: 0, end: 0 },
      { name: 'offset', kind: 'computed', start: 0, end: 0 },
    ]);
    // Shorthand { offset } → { offset: offset.value }
    expect(result).toContain('{ offset: offset.value }');
  });

  it('expands shorthand property among other properties (#1858)', () => {
    const code = `function Page() {\n  const offset = (page - 1) * 10;\n  return <div>{query(() => fetch({ limit: 20, offset }))}</div>;\n}`;
    const result = transform(code, [
      { name: 'page', kind: 'signal', start: 0, end: 0 },
      { name: 'offset', kind: 'computed', start: 0, end: 0 },
    ]);
    expect(result).toContain('offset: offset.value');
    expect(result).toContain('limit: 20');
  });

  it('transforms array destructuring into individual computed declarations', () => {
    const code = `function Pricing() {\n  const [doubled, tripled] = [quantity * 2, quantity * 3];\n  return <div>{doubled} / {tripled}</div>;\n}`;
    const result = transform(code, [
      { name: 'quantity', kind: 'signal', start: 0, end: 0 },
      { name: 'doubled', kind: 'computed', start: 0, end: 0 },
      { name: 'tripled', kind: 'computed', start: 0, end: 0 },
    ]);
    expect(result).toContain('const doubled = computed(() => [quantity * 2, quantity * 3][0])');
    expect(result).toContain('const tripled = computed(() => [quantity * 2, quantity * 3][1])');
  });

  it('handles array destructuring with mix of computed and static elements', () => {
    const code = `function Example() {\n  const [reactive, stable] = [count * 2, 'hello'];\n  return <div>{reactive}</div>;\n}`;
    const result = transform(code, [
      { name: 'count', kind: 'signal', start: 0, end: 0 },
      { name: 'reactive', kind: 'computed', start: 0, end: 0 },
      { name: 'stable', kind: 'static', start: 0, end: 0 },
    ]);
    expect(result).toContain('const reactive = computed(() => [count * 2, \'hello\'][0])');
    expect(result).toContain('const stable = [count * 2, \'hello\'][1]');
  });

  it('transforms array destructuring preserving default values', () => {
    const code = `function App() {\n  const [first = 0, second = 'default'] = getData(count);\n  return <div>{first}</div>;\n}`;
    const result = transform(code, [
      { name: 'count', kind: 'signal', start: 0, end: 0 },
      { name: 'first', kind: 'computed', start: 0, end: 0 },
      { name: 'second', kind: 'static', start: 0, end: 0 },
    ]);
    expect(result).toContain("const first = computed(() => getData(count)[0] ?? 0)");
    expect(result).toContain("const second = getData(count)[1] ?? 'default'");
  });

  it('transforms array destructuring with skipped element', () => {
    const code = `function App() {\n  const [, second] = [count, count * 2];\n  return <div>{second}</div>;\n}`;
    const result = transform(code, [
      { name: 'count', kind: 'signal', start: 0, end: 0 },
      { name: 'second', kind: 'computed', start: 0, end: 0 },
    ]);
    expect(result).toContain('const second = computed(() => [count, count * 2][1])');
  });

  it('transforms array destructuring with rest element', () => {
    const code = `function App() {\n  const [first, ...rest] = items;\n  return <div>{first}</div>;\n}`;
    const result = transform(code, [
      { name: 'items', kind: 'signal', start: 0, end: 0 },
      { name: 'first', kind: 'computed', start: 0, end: 0 },
      { name: 'rest', kind: 'computed', start: 0, end: 0 },
    ]);
    expect(result).toContain('const first = computed(() => items[0])');
    expect(result).toContain('const rest = computed(() => items.slice(1))');
  });

  it('does NOT expand shorthand when computed name is shadowed by nested scope (#1858)', () => {
    const code = `function Page() {\n  const offset = (page - 1) * 10;\n  const result = items.map((offset) => ({ offset }));\n  return <div>{offset}</div>;\n}`;
    const result = transform(code, [
      { name: 'page', kind: 'signal', start: 0, end: 0 },
      { name: 'offset', kind: 'computed', start: 0, end: 0 },
    ]);
    // The `offset` inside the arrow's shorthand is the callback parameter, not the computed.
    expect(result).not.toContain('offset: offset.value');
    expect(result).toContain('({ offset })');
  });
});
