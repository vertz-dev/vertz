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

  describe('signal-object detection', () => {
    it('detects query() call as signal-object', () => {
      const [result] = analyze(`
        function TaskList() {
          const tasks = query('/api/tasks');
          return <div>{tasks.loading}</div>;
        }
      `);
      const v = findVar(result?.variables, 'tasks');
      expect(v?.kind).toBe('signal-object');
      expect(v?.signalProperties).toBeInstanceOf(Set);
      expect(v?.signalProperties?.has('data')).toBe(true);
      expect(v?.signalProperties?.has('loading')).toBe(true);
      expect(v?.signalProperties?.has('error')).toBe(true);
    });

    it('detects form() call as signal-object', () => {
      const [result] = analyze(`
        function UserForm() {
          const userForm = form(schema);
          return <div>{userForm.submitting}</div>;
        }
      `);
      const v = findVar(result?.variables, 'userForm');
      expect(v?.kind).toBe('signal-object');
      expect(v?.signalProperties?.has('submitting')).toBe(true);
      expect(v?.signalProperties?.has('errors')).toBe(true);
      expect(v?.signalProperties?.has('values')).toBe(true);
    });

    it('detects createLoader() call as signal-object', () => {
      const [result] = analyze(`
        function DataView() {
          const loader = createLoader(() => fetchData());
          return <div>{loader.loading}</div>;
        }
      `);
      const v = findVar(result?.variables, 'loader');
      expect(v?.kind).toBe('signal-object');
      expect(v?.signalProperties?.has('data')).toBe(true);
      expect(v?.signalProperties?.has('loading')).toBe(true);
      expect(v?.signalProperties?.has('error')).toBe(true);
    });

    it('ignores non-signal API calls', () => {
      const [result] = analyze(`
        function App() {
          const result = someOtherFunc();
          return <div>{result}</div>;
        }
      `);
      const v = findVar(result?.variables, 'result');
      // Should be static, not signal-object
      expect(v?.kind).toBe('static');
      expect(v?.signalProperties).toBeUndefined();
    });

    it('detects namespaced signal API calls', () => {
      const [result] = analyze(`
        function TaskList() {
          const tasks = UI.query('/api/tasks');
          return <div>{tasks.loading}</div>;
        }
      `);
      const v = findVar(result?.variables, 'tasks');
      expect(v?.kind).toBe('signal-object');
      expect(v?.signalProperties?.has('loading')).toBe(true);
    });

    it('detects vertz.query() pattern', () => {
      const [result] = analyze(`
        function TaskList() {
          const tasks = vertz.query('/api/tasks');
          return <div>{tasks.data}</div>;
        }
      `);
      const v = findVar(result?.variables, 'tasks');
      expect(v?.kind).toBe('signal-object');
      expect(v?.signalProperties?.has('data')).toBe(true);
      expect(v?.signalProperties?.has('loading')).toBe(true);
    });

    it('detects vertz.form() pattern', () => {
      const [result] = analyze(`
        function UserForm() {
          const userForm = vertz.form(schema);
          return <div>{userForm.submitting}</div>;
        }
      `);
      const v = findVar(result?.variables, 'userForm');
      expect(v?.kind).toBe('signal-object');
      expect(v?.signalProperties?.has('submitting')).toBe(true);
      expect(v?.signalProperties?.has('values')).toBe(true);
    });
  });
});
