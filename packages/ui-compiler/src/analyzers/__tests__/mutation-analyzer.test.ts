import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import type { VariableInfo } from '../../types';
import { ComponentAnalyzer } from '../component-analyzer';
import { MutationAnalyzer } from '../mutation-analyzer';

function analyze(code: string, variables: VariableInfo[]) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  const sf = project.createSourceFile('test.tsx', code);
  const components = new ComponentAnalyzer().analyze(sf);
  const analyzer = new MutationAnalyzer();
  return components.map((c) => analyzer.analyze(sf, c, variables));
}

describe('MutationAnalyzer', () => {
  it('detects .push() on signal variable', () => {
    const code = `
      function TodoApp() {
        let items = [];
        return <div onClick={() => items.push("new")}>{items}</div>;
      }
    `;
    const vars: VariableInfo[] = [{ name: 'items', kind: 'signal', start: 0, end: 0 }];
    const [result] = analyze(code, vars);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.kind).toBe('method-call');
    expect(result?.[0]?.variableName).toBe('items');
  });

  it('detects property assignment on signal', () => {
    const code = `
      function Profile() {
        let user = { name: "Alice" };
        return <div onClick={() => { user.name = "Bob"; }}>{user.name}</div>;
      }
    `;
    const vars: VariableInfo[] = [{ name: 'user', kind: 'signal', start: 0, end: 0 }];
    const [result] = analyze(code, vars);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.kind).toBe('property-assignment');
  });

  it('detects index assignment on signal', () => {
    const code = `
      function List() {
        let items = [1, 2, 3];
        return <div onClick={() => { items[0] = 99; }}>{items}</div>;
      }
    `;
    const vars: VariableInfo[] = [{ name: 'items', kind: 'signal', start: 0, end: 0 }];
    const [result] = analyze(code, vars);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.kind).toBe('index-assignment');
  });

  it('detects delete expression on signal', () => {
    const code = `
      function Config() {
        let config = { debug: true };
        return <div onClick={() => { delete config.debug; }}>{config}</div>;
      }
    `;
    const vars: VariableInfo[] = [{ name: 'config', kind: 'signal', start: 0, end: 0 }];
    const [result] = analyze(code, vars);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.kind).toBe('delete');
  });

  it('detects Object.assign on signal', () => {
    const code = `
      function Profile() {
        let user = { name: "Alice" };
        return <div onClick={() => { Object.assign(user, { age: 30 }); }}>{user}</div>;
      }
    `;
    const vars: VariableInfo[] = [{ name: 'user', kind: 'signal', start: 0, end: 0 }];
    const [result] = analyze(code, vars);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.kind).toBe('object-assign');
  });

  it('detects all array mutation methods', () => {
    const methods = ['pop', 'splice', 'sort', 'reverse', 'shift', 'unshift', 'fill'];
    for (const method of methods) {
      const code = `
        function App() {
          let arr = [1, 2, 3];
          return <div onClick={() => arr.${method}()}>{arr}</div>;
        }
      `;
      const vars: VariableInfo[] = [{ name: 'arr', kind: 'signal', start: 0, end: 0 }];
      const [result] = analyze(code, vars);
      expect(result?.length).toBeGreaterThanOrEqual(1);
      expect(result?.[0]?.kind).toBe('method-call');
    }
  });
});
