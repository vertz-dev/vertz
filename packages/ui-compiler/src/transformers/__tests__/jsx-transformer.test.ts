import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { ComponentAnalyzer } from '../../analyzers/component-analyzer';
import { JsxAnalyzer } from '../../analyzers/jsx-analyzer';
import type { VariableInfo } from '../../types';
import { JsxTransformer } from '../jsx-transformer';

function transform(code: string, variables: VariableInfo[]) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  const sf = project.createSourceFile('test.tsx', code);
  const components = new ComponentAnalyzer().analyze(sf);
  const jsxAnalyzer = new JsxAnalyzer();
  const s = new MagicString(code);
  const transformer = new JsxTransformer();

  for (const comp of components) {
    const jsxExprs = jsxAnalyzer.analyze(sf, comp, variables);
    transformer.transform(s, sf, comp, variables, jsxExprs);
  }

  return s.toString();
}

describe('JsxTransformer', () => {
  it('transforms <div> to __element("div")', () => {
    const result = transform(`function App() {\n  return <div></div>;\n}`, []);
    expect(result).toContain('__element("div")');
  });

  it('wraps reactive expression in __text(() => ...)', () => {
    const result = transform(`function Counter() {\n  return <div>{count}</div>;\n}`, [
      { name: 'count', kind: 'signal', start: 0, end: 0 },
    ]);
    expect(result).toContain('__text(');
    expect(result).toContain('() =>');
  });

  it('passes static expression without wrapper', () => {
    const result = transform(`function App() {\n  return <div>{title}</div>;\n}`, [
      { name: 'title', kind: 'static', start: 0, end: 0 },
    ]);
    expect(result).toContain('createTextNode');
    expect(result).not.toContain('__text');
  });

  it('transforms onClick to __on', () => {
    const result = transform(
      `function App() {\n  return <button onClick={handler}>click</button>;\n}`,
      [],
    );
    expect(result).toContain('__on(');
    expect(result).toContain('"click"');
    expect(result).toContain('handler');
  });

  it('transforms reactive attribute to __attr', () => {
    const result = transform(`function App() {\n  return <div className={cls}></div>;\n}`, [
      { name: 'cls', kind: 'signal', start: 0, end: 0 },
    ]);
    expect(result).toContain('__attr(');
    expect(result).toContain('"className"');
    expect(result).toContain('() =>');
  });

  it('handles nested elements with parent-child append', () => {
    const result = transform(`function App() {\n  return <div><span>hello</span></div>;\n}`, []);
    expect(result).toContain('__element("div")');
    expect(result).toContain('__element("span")');
    expect(result).toContain('appendChild');
  });

  it('handles string literal children as static text', () => {
    const result = transform(`function App() {\n  return <div>hello world</div>;\n}`, []);
    expect(result).toContain('createTextNode');
    expect(result).toContain('"hello world"');
  });

  it('handles self-closing elements', () => {
    const result = transform(`function App() {\n  return <input />;\n}`, []);
    expect(result).toContain('__element("input")');
  });
});
