import { describe, expect, it } from 'bun:test';
import { Project, ts } from 'ts-morph';
import type { VariableInfo } from '../../types';
import { ComponentAnalyzer } from '../component-analyzer';
import { JsxAnalyzer } from '../jsx-analyzer';

function analyze(code: string, variables: VariableInfo[]) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  const sf = project.createSourceFile('test.tsx', code);
  const components = new ComponentAnalyzer().analyze(sf);
  const analyzer = new JsxAnalyzer();
  return components.map((c) => analyzer.analyze(sf, c, variables));
}

describe('JsxAnalyzer', () => {
  it('classifies expression referencing signal as reactive', () => {
    const code = `
      function Counter() {
        let count = 0;
        return <div>{count}</div>;
      }
    `;
    const variables: VariableInfo[] = [{ name: 'count', kind: 'signal', start: 0, end: 0 }];
    const [result] = analyze(code, variables);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.reactive).toBe(true);
    expect(result?.[0]?.deps).toEqual(['count']);
  });

  it('classifies expression referencing static const as static', () => {
    const code = `
      function App() {
        const title = "Hello";
        return <div>{title}</div>;
      }
    `;
    const variables: VariableInfo[] = [{ name: 'title', kind: 'static', start: 0, end: 0 }];
    const [result] = analyze(code, variables);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.reactive).toBe(false);
  });

  it('detects reactive JSX attribute', () => {
    const code = `
      function Button() {
        let cls = "btn";
        return <button className={cls}>click</button>;
      }
    `;
    const variables: VariableInfo[] = [{ name: 'cls', kind: 'signal', start: 0, end: 0 }];
    const [result] = analyze(code, variables);
    const reactiveExprs = result?.filter((e) => e.reactive);
    expect(reactiveExprs).toHaveLength(1);
    expect(reactiveExprs[0]?.deps).toEqual(['cls']);
  });

  it('classifies component prop as reactive or static', () => {
    const code = `
      function Parent() {
        let count = 0;
        const label = "Count";
        return <Child value={count} label={label} />;
      }
    `;
    const variables: VariableInfo[] = [
      { name: 'count', kind: 'signal', start: 0, end: 0 },
      { name: 'label', kind: 'static', start: 0, end: 0 },
    ];
    const [result] = analyze(code, variables);
    const reactive = result?.filter((e) => e.reactive);
    const staticExprs = result?.filter((e) => !e.reactive);
    expect(reactive).toHaveLength(1);
    expect(reactive[0]?.deps).toEqual(['count']);
    expect(staticExprs).toHaveLength(1);
  });

  it('classifies reactive source property access as reactive', () => {
    const code = `
      function App() {
        const ctx = useContext(ThemeCtx);
        return <div>{ctx.theme}</div>;
      }
    `;
    const variables: VariableInfo[] = [
      { name: 'ctx', kind: 'static', start: 0, end: 0, isReactiveSource: true },
    ];
    const [result] = analyze(code, variables);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.reactive).toBe(true);
  });

  it('classifies reactive source in JSX attribute as reactive', () => {
    const code = `
      function App() {
        const ctx = useContext(ThemeCtx);
        return <div data-theme={ctx.theme}>hello</div>;
      }
    `;
    const variables: VariableInfo[] = [
      { name: 'ctx', kind: 'static', start: 0, end: 0, isReactiveSource: true },
    ];
    const [result] = analyze(code, variables);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.reactive).toBe(true);
  });

  it('classifies signal API variable passed as function argument as reactive', () => {
    const code = `
      function TodoList() {
        const todosQuery = query(() => api.todos.list());
        return <div>{queryMatch(todosQuery, { data: (todos) => <ul /> })}</div>;
      }
    `;
    const variables: VariableInfo[] = [
      {
        name: 'todosQuery',
        kind: 'static',
        start: 0,
        end: 0,
        signalProperties: new Set(['data', 'error', 'loading']),
      },
    ];
    const [result] = analyze(code, variables);
    const queryMatchExpr = result?.find((e) => e.reactive);
    expect(queryMatchExpr).toBeDefined();
    expect(queryMatchExpr?.reactive).toBe(true);
  });

  it('does NOT classify signal API variable in property access only as signal API ref', () => {
    const code = `
      function TodoList() {
        const todosQuery = query(() => api.todos.list());
        return <div>{todosQuery.data}</div>;
      }
    `;
    const variables: VariableInfo[] = [
      {
        name: 'todosQuery',
        kind: 'static',
        start: 0,
        end: 0,
        signalProperties: new Set(['data', 'error', 'loading']),
      },
    ];
    const [result] = analyze(code, variables);
    // Should still be reactive (via containsSignalApiPropertyAccess), but not via the ref check
    expect(result?.[0]?.reactive).toBe(true);
  });

  it('classifies bare destructured prop reference as reactive', () => {
    const code = `
      function Badge({ label }: { label: string }) {
        return <span>{label}</span>;
      }
    `;
    const variables: VariableInfo[] = [];
    const [result] = analyze(code, variables);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.reactive).toBe(true);
  });

  it('classifies 4-level field signal chain as reactive', () => {
    const code = `
      function UserForm() {
        const taskForm = form({});
        return <div>{taskForm.address.street.error}</div>;
      }
    `;
    const variables: VariableInfo[] = [
      {
        name: 'taskForm',
        kind: 'static',
        start: 0,
        end: 0,
        signalProperties: new Set(['submitting', 'dirty', 'valid']),
        plainProperties: new Set(['action', 'method']),
        fieldSignalProperties: new Set(['error', 'dirty', 'touched', 'value']),
      },
    ];
    const [result] = analyze(code, variables);
    expect(result?.[0]?.reactive).toBe(true);
  });

  it('classifies ElementAccessExpression field chain as reactive', () => {
    const code = `
      function DynForm() {
        const taskForm = form({});
        const field = 'title';
        return <div>{taskForm[field].error}</div>;
      }
    `;
    const variables: VariableInfo[] = [
      {
        name: 'taskForm',
        kind: 'static',
        start: 0,
        end: 0,
        signalProperties: new Set(['submitting']),
        plainProperties: new Set(['action']),
        fieldSignalProperties: new Set(['error', 'dirty', 'touched', 'value']),
      },
    ];
    const [result] = analyze(code, variables);
    const reactiveExprs = result?.filter((e) => e.reactive);
    expect(reactiveExprs?.length).toBeGreaterThanOrEqual(1);
  });

  describe('callback-local const reactivity', () => {
    it('classifies callback-local const derived from signal as reactive', () => {
      const code = `
        function App() {
          let selected = 0;
          const items = ['a', 'b', 'c'];
          return <ul>{items.map((v) => {
            const isActive = v === selected;
            return <li class={isActive ? 'active' : ''}>item</li>;
          })}</ul>;
        }
      `;
      const variables: VariableInfo[] = [{ name: 'selected', kind: 'signal', start: 0, end: 0 }];
      const [result] = analyze(code, variables);
      // The JSX attribute expression {isActive ? 'active' : ''} should be reactive
      const classExpr = result?.find((e) => !e.reactive === false && e.deps?.length === 0);
      // At least one expression referencing isActive should be reactive
      const reactiveExprs = result?.filter((e) => e.reactive);
      expect(reactiveExprs?.length).toBeGreaterThanOrEqual(1);
      // Find the specific attribute expression
      const attrReactive = result?.find(
        (e) => e.reactive && e.callbackConstInlines?.some((c) => c.name === 'isActive'),
      );
      expect(attrReactive).toBeDefined();
      expect(attrReactive?.callbackConstInlines).toHaveLength(1);
      expect(attrReactive?.callbackConstInlines?.[0]?.name).toBe('isActive');
    });

    it('classifies transitive callback-local const chain as reactive', () => {
      const code = `
        function App() {
          let count = 0;
          return <ul>{items.map((item) => {
            const a = count + 1;
            const b = a * 2;
            return <li data-val={b}>item</li>;
          })}</ul>;
        }
      `;
      const variables: VariableInfo[] = [{ name: 'count', kind: 'signal', start: 0, end: 0 }];
      const [result] = analyze(code, variables);
      const attrReactive = result?.find(
        (e) => e.reactive && e.callbackConstInlines?.some((c) => c.name === 'b'),
      );
      expect(attrReactive).toBeDefined();
    });

    it('does not classify non-reactive callback-local const as reactive', () => {
      const code = `
        function App() {
          let count = 0;
          return <ul>{items.map((item) => {
            const label = "static";
            return <li class={label}>item</li>;
          })}</ul>;
        }
      `;
      const variables: VariableInfo[] = [{ name: 'count', kind: 'signal', start: 0, end: 0 }];
      const [result] = analyze(code, variables);
      const classExpr = result?.find(
        (e) => e.callbackConstInlines && e.callbackConstInlines.length > 0,
      );
      expect(classExpr).toBeUndefined();
    });

    it('respects shadowing when callback param has same name as signal', () => {
      const code = `
        function App() {
          let count = 0;
          return <ul>{items.map((count) => {
            const doubled = count * 2;
            return <li data-val={doubled}>item</li>;
          })}</ul>;
        }
      `;
      const variables: VariableInfo[] = [{ name: 'count', kind: 'signal', start: 0, end: 0 }];
      const [result] = analyze(code, variables);
      // count is shadowed by callback param — doubled is NOT reactive
      const attrReactive = result?.find(
        (e) => e.callbackConstInlines && e.callbackConstInlines.length > 0,
      );
      expect(attrReactive).toBeUndefined();
    });

    it('classifies callback-local const derived from signal API property as reactive', () => {
      const code = `
        function App() {
          const tasks = query('/api');
          return <ul>{items.map((item) => {
            const loading = tasks.loading;
            return <li class={loading ? 'dim' : ''}>item</li>;
          })}</ul>;
        }
      `;
      const variables: VariableInfo[] = [
        {
          name: 'tasks',
          kind: 'static',
          start: 0,
          end: 0,
          signalProperties: new Set(['data', 'loading', 'error']),
        },
      ];
      const [result] = analyze(code, variables);
      const attrReactive = result?.find(
        (e) => e.reactive && e.callbackConstInlines?.some((c) => c.name === 'loading'),
      );
      expect(attrReactive).toBeDefined();
    });

    it('classifies callback-local const derived from reactive source as reactive', () => {
      const code = `
        function App() {
          const ctx = useContext(ThemeCtx);
          return <ul>{items.map((item) => {
            const theme = ctx.theme;
            return <li class={theme}>item</li>;
          })}</ul>;
        }
      `;
      const variables: VariableInfo[] = [
        { name: 'ctx', kind: 'static', start: 0, end: 0, isReactiveSource: true },
      ];
      const [result] = analyze(code, variables);
      const attrReactive = result?.find(
        (e) => e.reactive && e.callbackConstInlines?.some((c) => c.name === 'theme'),
      );
      expect(attrReactive).toBeDefined();
    });

    it('handles nested callbacks — inner inherits outer reactive scope', () => {
      const code = `
        function App() {
          let selected = 'a';
          return <div>{groups.map((group) => {
            const expanded = group.id === selected;
            return <div>{group.items.map((item) => {
              const cls = expanded ? 'bold' : 'normal';
              return <span class={cls}>item</span>;
            })}</div>;
          })}</div>;
        }
      `;
      const variables: VariableInfo[] = [{ name: 'selected', kind: 'signal', start: 0, end: 0 }];
      const [result] = analyze(code, variables);
      const clsReactive = result?.find(
        (e) => e.reactive && e.callbackConstInlines?.some((c) => c.name === 'cls'),
      );
      expect(clsReactive).toBeDefined();
    });
  });

  it('classifies bare reactive source identifier as reactive', () => {
    const code = `
      function App() {
        const ctx = useContext(ThemeCtx);
        return <div>{ctx}</div>;
      }
    `;
    const variables: VariableInfo[] = [
      { name: 'ctx', kind: 'static', start: 0, end: 0, isReactiveSource: true },
    ];
    const [result] = analyze(code, variables);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.reactive).toBe(true);
  });
});
