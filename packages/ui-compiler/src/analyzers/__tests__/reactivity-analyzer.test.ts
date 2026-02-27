import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { ComponentAnalyzer } from '../component-analyzer';
import { ReactivityAnalyzer } from '../reactivity-analyzer';

function analyze(code: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  const sf = project.createSourceFile('test.tsx', code);
  const components = new ComponentAnalyzer().analyze(sf);
  const analyzer = new ReactivityAnalyzer();
  return components.map((c) => ({
    component: c.name,
    variables: analyzer.analyze(sf, c),
  }));
}

function findVar(vars: { name: string; kind: string }[], name: string) {
  return vars.find((v) => v.name === name);
}

describe('ReactivityAnalyzer', () => {
  it('classifies let referenced in JSX as signal', () => {
    const [result] = analyze(`
      function Counter() {
        let count = 0;
        return <div>{count}</div>;
      }
    `);
    const v = findVar(result?.variables, 'count');
    expect(v?.kind).toBe('signal');
  });

  it('classifies let NOT referenced in JSX as static', () => {
    const [result] = analyze(`
      function Counter() {
        let temp = 0;
        const x = temp + 1;
        return <div>hello</div>;
      }
    `);
    const v = findVar(result?.variables, 'temp');
    expect(v?.kind).toBe('static');
  });

  it('classifies const depending on signal used in JSX as computed', () => {
    const [result] = analyze(`
      function Counter() {
        let count = 0;
        const doubled = count * 2;
        return <div>{doubled}</div>;
      }
    `);
    expect(findVar(result?.variables, 'count')?.kind).toBe('signal');
    expect(findVar(result?.variables, 'doubled')?.kind).toBe('computed');
  });

  it('resolves transitive computed chain', () => {
    const [result] = analyze(`
      function Pricing() {
        let quantity = 1;
        const total = 10 * quantity;
        const formatted = "$" + total;
        return <div>{formatted}</div>;
      }
    `);
    expect(findVar(result?.variables, 'quantity')?.kind).toBe('signal');
    expect(findVar(result?.variables, 'total')?.kind).toBe('computed');
    expect(findVar(result?.variables, 'formatted')?.kind).toBe('computed');
  });

  it('classifies const with only static deps as static', () => {
    const [result] = analyze(`
      function App() {
        const title = "Hello";
        const upper = title.toUpperCase();
        return <div>{upper}</div>;
      }
    `);
    expect(findVar(result?.variables, 'title')?.kind).toBe('static');
    expect(findVar(result?.variables, 'upper')?.kind).toBe('static');
  });

  it('handles destructuring into per-binding computed', () => {
    const [result] = analyze(`
      function Profile() {
        let user = { name: "Alice", age: 30 };
        const { name, age } = user;
        return <div>{name} - {age}</div>;
      }
    `);
    expect(findVar(result?.variables, 'user')?.kind).toBe('signal');
    expect(findVar(result?.variables, 'name')?.kind).toBe('computed');
    expect(findVar(result?.variables, 'age')?.kind).toBe('computed');
  });

  it('classifies let used in event handler AND JSX as signal', () => {
    const [result] = analyze(`
      function Counter() {
        let count = 0;
        return <button onClick={() => count++}>{count}</button>;
      }
    `);
    expect(findVar(result?.variables, 'count')?.kind).toBe('signal');
  });

  it('stores plainProperties and fieldSignalProperties from signal API config', () => {
    const [result] = analyze(`
      import { form } from '@vertz/ui';

      function TaskForm() {
        const taskForm = form({ name: '' });
        return <div>{taskForm.submitting}</div>;
      }
    `);
    const v = findVar(result?.variables, 'taskForm');
    expect(v?.kind).toBe('static');
    expect(v?.signalProperties).toEqual(new Set(['submitting', 'dirty', 'valid']));
    expect(v?.plainProperties).toEqual(
      new Set(['action', 'method', 'onSubmit', 'reset', 'setFieldError', 'submit']),
    );
    expect(v?.fieldSignalProperties).toEqual(new Set(['error', 'dirty', 'touched', 'value']));
  });

  it('classifies const derived from query() signal API property as computed', () => {
    const [result] = analyze(`
      import { query } from '@vertz/ui';
      function TaskList() {
        const tasks = query('/api/tasks');
        const errorMsg = tasks.error ? 'error' : '';
        return <div>{errorMsg}</div>;
      }
    `);
    expect(findVar(result?.variables, 'tasks')?.kind).toBe('static');
    expect(findVar(result?.variables, 'errorMsg')?.kind).toBe('computed');
  });

  it('classifies const derived from form() signal API property as computed', () => {
    const [result] = analyze(`
      import { form } from '@vertz/ui';
      function TaskForm() {
        const taskForm = form({ name: '' });
        const isDirty = taskForm.dirty ? 'yes' : 'no';
        return <div>{isDirty}</div>;
      }
    `);
    expect(findVar(result?.variables, 'taskForm')?.kind).toBe('static');
    expect(findVar(result?.variables, 'isDirty')?.kind).toBe('computed');
  });

  it('classifies destructured query() signal properties as computed', () => {
    const [result] = analyze(`
      import { query } from '@vertz/ui';
      function TaskList() {
        const { data, loading, error } = query('/api/tasks');
        return <div>{data}</div>;
      }
    `);
    expect(findVar(result?.variables, 'data')?.kind).toBe('computed');
    expect(findVar(result?.variables, 'loading')?.kind).toBe('computed');
    expect(findVar(result?.variables, 'error')?.kind).toBe('computed');
  });

  it('registers synthetic variable with signal API config for destructured query()', () => {
    const [result] = analyze(`
      import { query } from '@vertz/ui';
      function TaskList() {
        const { data } = query('/api/tasks');
        return <div>{data}</div>;
      }
    `);
    const syntheticVar = findVar(result?.variables, '__query_0');
    expect(syntheticVar).toBeDefined();
    expect(syntheticVar?.kind).toBe('static');
    expect(syntheticVar?.signalProperties).toEqual(new Set(['data', 'loading', 'error']));
    expect(syntheticVar?.plainProperties).toEqual(new Set(['refetch']));
  });

  it('sets destructuredFrom metadata on destructured signal API bindings', () => {
    const [result] = analyze(`
      import { query } from '@vertz/ui';
      function TaskList() {
        const { data, refetch } = query('/api/tasks');
        return <div>{data}</div>;
      }
    `);
    const dataVar = findVar(result?.variables, 'data');
    const refetchVar = findVar(result?.variables, 'refetch');
    expect(dataVar?.destructuredFrom).toBe('__query_0');
    expect(refetchVar?.destructuredFrom).toBe('__query_0');
  });

  it('classifies renamed destructured properties using original property name', () => {
    const [result] = analyze(`
      import { query } from '@vertz/ui';
      function TaskList() {
        const { data: tasks, refetch: reload } = query('/api/tasks');
        return <div>{tasks}</div>;
      }
    `);
    expect(findVar(result?.variables, 'tasks')?.kind).toBe('computed');
    expect(findVar(result?.variables, 'tasks')?.destructuredFrom).toBe('__query_0');
    expect(findVar(result?.variables, 'reload')?.kind).toBe('static');
    expect(findVar(result?.variables, 'reload')?.destructuredFrom).toBe('__query_0');
  });

  it('classifies destructured form() properties per registry', () => {
    const [result] = analyze(`
      import { form } from '@vertz/ui';
      function TaskForm() {
        const { submitting, action } = form({ name: '' });
        return <div>{submitting}</div>;
      }
    `);
    expect(findVar(result?.variables, 'submitting')?.kind).toBe('computed');
    expect(findVar(result?.variables, 'action')?.kind).toBe('static');
    expect(findVar(result?.variables, 'submitting')?.destructuredFrom).toBe('__form_0');
  });

  it('handles aliased signal API imports in destructuring', () => {
    const [result] = analyze(`
      import { query as fetchData } from '@vertz/ui';
      function TaskList() {
        const { data } = fetchData('/api/tasks');
        return <div>{data}</div>;
      }
    `);
    expect(findVar(result?.variables, 'data')?.kind).toBe('computed');
    expect(findVar(result?.variables, 'data')?.destructuredFrom).toBe('__query_0');
  });

  it('classifies destructured query() plain properties as static', () => {
    const [result] = analyze(`
      import { query } from '@vertz/ui';
      function TaskList() {
        const { refetch } = query('/api/tasks');
        return <button onClick={refetch}>Refetch</button>;
      }
    `);
    expect(findVar(result?.variables, 'refetch')?.kind).toBe('static');
  });

  it('does not treat local function named query as signal API', () => {
    const [result] = analyze(`
      function TaskList() {
        const query = (url: string) => ({ data: [], loading: false });
        const tasks = query('/api/tasks');
        return <div>{tasks}</div>;
      }
    `);
    expect(findVar(result?.variables, 'tasks')?.signalProperties).toBeUndefined();
  });

  it('does not treat local function named query as signal API in destructuring', () => {
    const [result] = analyze(`
      function TaskList() {
        const query = (url: string) => ({ data: [], loading: false });
        const { data } = query('/api/tasks');
        return <div>{data}</div>;
      }
    `);
    expect(findVar(result?.variables, '__query_0')).toBeUndefined();
  });

  it('analyzes multiple components independently', () => {
    const results = analyze(`
      function Counter() {
        let count = 0;
        return <div>{count}</div>;
      }
      function Display() {
        const label = "static";
        return <div>{label}</div>;
      }
    `);
    expect(results).toHaveLength(2);
    expect(findVar(results[0]?.variables, 'count')?.kind).toBe('signal');
    expect(findVar(results[1]?.variables, 'label')?.kind).toBe('static');
  });
});
