import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
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
      { name: 'data', kind: 'computed', start: 0, end: 0, destructuredFrom: '__query_0' },
      { name: 'loading', kind: 'computed', start: 0, end: 0, destructuredFrom: '__query_0' },
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
      { name: 'data', kind: 'computed', start: 0, end: 0, destructuredFrom: '__query_0' },
      { name: 'refetch', kind: 'static', start: 0, end: 0, destructuredFrom: '__query_0' },
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
      { name: 'tasks', kind: 'computed', start: 0, end: 0, destructuredFrom: '__query_0' },
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
});
