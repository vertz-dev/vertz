import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { ComponentAnalyzer } from '../../analyzers/component-analyzer';
import { JsxAnalyzer } from '../../analyzers/jsx-analyzer';
import { compile } from '../../compiler';
import type { VariableInfo } from '../../types';
import { JsxTransformer } from '../jsx-transformer';

function transform(code: string, variables: VariableInfo[] = []) {
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

describe('JSX children thunks for components', () => {
  it('wraps single text child in a children thunk with __staticText', () => {
    const result = transform(`function App() {\n  return <MyComp>text</MyComp>;\n}`);
    expect(result).toContain('MyComp(');
    expect(result).toContain('children: () => __staticText("text")');
  });

  it('wraps single element child in a children thunk', () => {
    const result = transform(`function App() {\n  return <MyComp><div>hello</div></MyComp>;\n}`);
    expect(result).toContain('MyComp(');
    expect(result).toContain('children: () =>');
    expect(result).toContain('__element("div")');
  });

  it('wraps single component child in a children thunk', () => {
    const result = transform(`function App() {\n  return <Outer><Inner /></Outer>;\n}`);
    expect(result).toContain('Outer(');
    expect(result).toContain('children: () => Inner({})');
  });

  it('wraps multiple children in a thunk returning an array', () => {
    const result = transform(
      `function App() {\n  return <MyComp><div>a</div><span>b</span></MyComp>;\n}`,
    );
    expect(result).toContain('children: () => [');
    expect(result).toContain('__element("div")');
    expect(result).toContain('__element("span")');
  });

  it('passes both props and children thunk', () => {
    const result = transform(`function App() {\n  return <MyComp prop="val">text</MyComp>;\n}`);
    expect(result).toContain('prop: "val"');
    expect(result).toContain('children: () => __staticText("text")');
  });

  it('self-closing component has no children', () => {
    const result = transform(`function App() {\n  return <MyComp />;\n}`);
    expect(result).toContain('MyComp({})');
    expect(result).not.toContain('children');
  });

  it('handles dotted component name with children', () => {
    const result = transform(
      `function App() {\n  return <Ctx.Provider value={v}><Inner /></Ctx.Provider>;\n}`,
      [],
    );
    expect(result).toContain('Ctx.Provider(');
    expect(result).toContain('children: () => Inner({})');
  });

  it('handles conditional inside component children', () => {
    const result = transform(
      `function App() {\n  return <Wrapper>{flag && <Inner />}</Wrapper>;\n}`,
      [{ name: 'flag', kind: 'signal', start: 0, end: 0 }],
    );
    expect(result).toContain('children: () =>');
    expect(result).toContain('__conditional(');
  });

  it('explicit children prop wins over JSX children', () => {
    const result = transform(`function App() {\n  return <MyComp children={fn}>text</MyComp>;\n}`);
    expect(result).toContain('children: fn');
    // Should NOT contain a thunk — explicit prop wins
    expect(result).not.toContain('children: () =>');
  });

  it('handles fragment inside component children', () => {
    const result = transform(
      `function App() {\n  return <Wrapper><><Inner /><Other /></></Wrapper>;\n}`,
    );
    expect(result).toContain('children: () =>');
    expect(result).toContain('document.createDocumentFragment()');
  });
});

describe('JSX children thunks — pipeline integration', () => {
  it('reactive expression child gets .value inside thunk via full pipeline', () => {
    const result = compile(`function App() {\n  let x = 0;\n  return <Wrapper>{x}</Wrapper>;\n}`);
    // The full pipeline transforms `x` to `x.value` AND wraps in a thunk
    expect(result.code).toContain('children: () =>');
    expect(result.code).toContain('.value');
  });

  it('reactive .map() inside component children falls through to __child, not __list', () => {
    const result = compile(
      `function App() {\n  let items = [];\n  return <Wrapper>{items.map(i => <div>{i}</div>)}</Wrapper>;\n}`,
    );
    // Should NOT use __list (no persistent parent inside thunk)
    // Should fall through to __child(() => ...) wrapper
    expect(result.code).not.toContain('__list(');
    expect(result.code).toContain('children: () =>');
  });

  it('peek() in component JSX attribute is not reactive', () => {
    // Use the unit-level transform to test JSX transform in isolation.
    // When jsxExpressions marks peek() as non-reactive, it should NOT
    // produce a reactive getter.
    const result = transform(`function App() {\n  return <Wrapper val={s.peek()} />;\n}`);
    // .peek() should be a static prop, not a reactive getter
    expect(result).toContain('val: s.peek()');
    expect(result).not.toContain('get val()');
  });
});
