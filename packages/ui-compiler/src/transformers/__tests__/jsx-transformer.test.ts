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

  it('wraps reactive expression in __child(() => ...)', () => {
    const result = transform(`function Counter() {\n  return <div>{count}</div>;\n}`, [
      { name: 'count', kind: 'signal', start: 0, end: 0 },
    ]);
    expect(result).toContain('__child(');
    expect(result).toContain('() =>');
  });

  it('wraps static expression in __child(() => ...)', () => {
    const result = transform(`function App() {\n  return <div>{title}</div>;\n}`, [
      { name: 'title', kind: 'static', start: 0, end: 0 },
    ]);
    // Now uses __child for all expression children to handle both Nodes and primitives
    expect(result).toContain('__child(');
    expect(result).not.toContain('createTextNode(String');
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

  it('transforms JSX assigned to a variable', () => {
    const code = `function App() {
  const el = <div>hello</div>;
  return el;
}`;
    const result = transform(code, []);
    expect(result).toContain('__element("div")');
    expect(result).not.toContain('<div>');
  });

  it('transforms JSX in a for-loop body', () => {
    const code = `function App() {
  const items = [];
  for (const x of data) {
    const btn = <button>{x}</button>;
    items.push(btn);
  }
  return <div>{items}</div>;
}`;
    const result = transform(code, []);
    expect(result).toContain('__element("button")');
    expect(result).toContain('__element("div")');
    expect(result).not.toContain('<button>');
  });

  it('transforms JSX in if-block', () => {
    const code = `function App() {
  let el;
  if (condition) {
    el = <span>yes</span>;
  } else {
    el = <span>no</span>;
  }
  return el;
}`;
    const result = transform(code, []);
    expect(result).toContain('__element("span")');
    expect(result).not.toContain('<span>');
  });

  it('transforms JSX used as function argument', () => {
    const code = `function App() {
  container.appendChild(<div>child</div>);
  return <div>parent</div>;
}`;
    const result = transform(code, []);
    // Both JSX nodes should be transformed
    expect(result).not.toContain('<div>child</div>');
    expect(result).not.toContain('<div>parent</div>');
    expect(result).toContain('__element("div")');
  });

  it('transforms JSX with `as` type assertion', () => {
    const code = `function App() {
  const el = (<div>hello</div>) as HTMLElement;
  return el;
}`;
    const result = transform(code, []);
    expect(result).toContain('__element("div")');
    expect(result).not.toContain('<div>');
  });

  it('transforms JSX inside ternary expressions (variable assignment)', () => {
    const code = `function App() {\n  const el = cond ? <div>yes</div> : <span>no</span>;\n  return el;\n}`;
    const result = transform(code, [{ name: 'cond', kind: 'signal', start: 0, end: 0 }]);
    expect(result).toContain('__element("div")');
    expect(result).toContain('__element("span")');
    expect(result).not.toContain('<div>');
    expect(result).not.toContain('<span>');
  });

  it('transforms JSX inside array literals (variable assignment)', () => {
    const code = `function App() {\n  const els = [<div>a</div>, <span>b</span>];\n  return els;\n}`;
    const result = transform(code, []);
    expect(result).toContain('__element("div")');
    expect(result).toContain('__element("span")');
    expect(result).not.toContain('<div>');
    expect(result).not.toContain('<span>');
  });
});
