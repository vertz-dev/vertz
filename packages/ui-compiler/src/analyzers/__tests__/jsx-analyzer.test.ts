import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
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
});
