import { describe, expect, it } from 'bun:test';
import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
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
    // fn is non-literal so it becomes a getter — but explicit prop still wins over JSX children
    expect(result).toContain('get children()');
    expect(result).toContain('return fn');
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

  it('peek() in component JSX attribute gets getter (semantically fine)', () => {
    // s.peek() is non-literal so it gets a getter. This is semantically fine —
    // the getter defers evaluation but .peek() still doesn't track reactivity.
    const result = transform(`function App() {\n  return <Wrapper val={s.peek()} />;\n}`);
    expect(result).toContain('get val()');
    expect(result).toContain('s.peek()');
  });
});

describe('JSX inside function call arguments (child expressions)', () => {
  it('transforms JSX in arrow function args to a function call (child expression)', () => {
    const result = transform(
      `function App() {
  return <div>{queryMatch(query, { loading: () => <div>Loading</div> })}</div>;
}`,
    );
    expect(result).toContain('__element("div")');
    // The inner <div>Loading</div> must be transformed — no raw JSX
    expect(result).not.toContain('<div>Loading</div>');
  });

  it('transforms JSX in object literal arrow values inside function call', () => {
    const result = transform(
      `function App() {
  return <div>{renderContent({ header: () => <h1>Title</h1>, body: () => <p>Text</p> })}</div>;
}`,
    );
    expect(result).toContain('__element("h1")');
    expect(result).toContain('__element("p")');
    expect(result).not.toContain('<h1>');
    expect(result).not.toContain('<p>');
  });

  it('pipeline: signal transforms + JSX transforms work together in function call args', () => {
    const result = compile(
      `function App() {
  let count = 0;
  return <div>{queryMatch(query, { data: () => <span>{count}</span> })}</div>;
}`,
    );
    expect(result.code).toContain('__element("span")');
    expect(result.code).not.toContain('<span>');
    expect(result.code).toContain('.value');
  });

  it('transforms JSX passed directly as a function argument (not in arrow)', () => {
    const result = transform(
      `function App() {
  return <div>{wrap(<span>hello</span>)}</div>;
}`,
    );
    expect(result).toContain('__element("span")');
    expect(result).not.toContain('<span>');
  });

  it('transforms JSX in ternary inside function call args', () => {
    const result = transform(
      `function App() {
  return <div>{pick(flag ? <span>a</span> : <em>b</em>)}</div>;
}`,
    );
    expect(result).toContain('__element("span")');
    expect(result).toContain('__element("em")');
    expect(result).not.toContain('<span>');
    expect(result).not.toContain('<em>');
  });

  it('transforms component JSX inside function call args', () => {
    const result = transform(
      `function App() {
  return <div>{renderSlot(() => <Card title="hi" />)}</div>;
}`,
    );
    expect(result).toContain('Card(');
    expect(result).not.toContain('<Card');
  });

  it('transforms deeply nested function calls with JSX', () => {
    const result = transform(
      `function App() {
  return <div>{outer(inner(() => <p>deep</p>))}</div>;
}`,
    );
    expect(result).toContain('__element("p")');
    expect(result).not.toContain('<p>');
  });
});

describe('JSX inside function call arguments (component children / transformChildAsValue)', () => {
  it('transforms JSX in function call args inside component children', () => {
    const result = transform(
      `function App() {
  return <Wrapper>{queryMatch(query, { loading: () => <div>Loading</div> })}</Wrapper>;
}`,
    );
    expect(result).toContain('Wrapper(');
    expect(result).toContain('children: () =>');
    expect(result).toContain('__element("div")');
    expect(result).not.toContain('<div>Loading</div>');
  });
});

describe('JSX inside arrow function props', () => {
  it('transforms JSX inside an arrow function prop value', () => {
    const result = transform(
      `function App() {\n  return <RouterView fallback={() => <div>Not found</div>} />;\n}`,
    );
    expect(result).toContain('RouterView(');
    // Arrow function is non-literal so it becomes a getter
    expect(result).toContain('get fallback()');
    expect(result).toContain('__element("div")');
    // Should NOT contain raw JSX
    expect(result).not.toContain('<div>');
  });

  it('transforms JSX inside a block-body arrow function prop', () => {
    const result = transform(
      `function App() {
  return <Comp render={() => {
    return <span>hello</span>;
  }} />;
}`,
    );
    expect(result).toContain('Comp(');
    expect(result).toContain('__element("span")');
    expect(result).not.toContain('<span>');
  });

  it('transforms nested JSX inside arrow function with component children', () => {
    const result = transform(
      `function App() {
  return <Outer>
    <RouterView fallback={() => <div>404</div>} />
  </Outer>;
}`,
    );
    expect(result).toContain('Outer(');
    expect(result).toContain('children: () => RouterView(');
    expect(result).toContain('__element("div")');
    expect(result).not.toContain('<div>');
  });
});
