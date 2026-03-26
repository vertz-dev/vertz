import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const NATIVE_MODULE_PATH = join(
  import.meta.dir,
  '..',
  'vertz-compiler.darwin-arm64.node',
);

function loadCompiler() {
  return require(NATIVE_MODULE_PATH) as {
    compile: (
      source: string,
      options?: { filename?: string },
    ) => { code: string };
  };
}

function compileAndGetCode(source: string): string {
  const { compile } = loadCompiler();
  const result = compile(source, { filename: 'test.tsx' });
  return result.code;
}

describe('Feature: JSX element transform', () => {
  describe('Given a simple HTML element', () => {
    describe('When compiled', () => {
      it('Then produces __element() call', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <div></div>;\n}`,
        );
        expect(code).toContain('__element("div")');
        expect(code).not.toContain('<div>');
      });
    });
  });

  describe('Given a self-closing HTML element', () => {
    describe('When compiled', () => {
      it('Then produces __element() call', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <input />;\n}`,
        );
        expect(code).toContain('__element("input")');
        expect(code).not.toContain('<input');
      });
    });
  });

  describe('Given an element with static string attribute', () => {
    describe('When compiled', () => {
      it('Then sets attribute with setAttribute', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <div title="hello"></div>;\n}`,
        );
        expect(code).toContain('__element("div")');
        expect(code).toContain('.setAttribute("title", "hello")');
      });
    });
  });

  describe('Given an element with className attribute', () => {
    describe('When compiled', () => {
      it('Then maps className to class', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <div className="container"></div>;\n}`,
        );
        expect(code).toContain('.setAttribute("class", "container")');
      });
    });
  });

  describe('Given an element with static text child', () => {
    describe('When compiled', () => {
      it('Then uses __staticText', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <div>hello world</div>;\n}`,
        );
        expect(code).toContain('__staticText("hello world")');
      });
    });
  });

  describe('Given an element with reactive expression child', () => {
    describe('When compiled', () => {
      it('Then wraps in __child(() => ...)', () => {
        const code = compileAndGetCode(
          `function Counter() {\n  let count = 0;\n  return <div>{count}</div>;\n}`,
        );
        expect(code).toContain('__child(');
        expect(code).toContain('count.value');
      });
    });
  });

  describe('Given an element with static expression child', () => {
    describe('When compiled', () => {
      it('Then uses __insert (no effect overhead)', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <div>{"hello"}</div>;\n}`,
        );
        expect(code).toContain('__insert(');
        expect(code).not.toContain('__child(');
      });
    });
  });

  describe('Given an element with event handler', () => {
    describe('When compiled', () => {
      it('Then uses __on', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <button onClick={handler}>click</button>;\n}`,
        );
        expect(code).toContain('__on(');
        expect(code).toContain('"click"');
        expect(code).toContain('handler');
      });
    });
  });

  describe('Given an element with reactive attribute', () => {
    describe('When compiled', () => {
      it('Then uses __attr with getter', () => {
        const code = compileAndGetCode(
          `function App() {\n  let cls = 'active';\n  return <div className={cls}></div>;\n}`,
        );
        expect(code).toContain('__attr(');
        expect(code).toContain('"class"');
        expect(code).toContain('() =>');
      });
    });
  });

  describe('Given nested elements', () => {
    describe('When compiled', () => {
      it('Then uses __enterChildren/__exitChildren and __append', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <div><span>hello</span></div>;\n}`,
        );
        expect(code).toContain('__element("div")');
        expect(code).toContain('__element("span")');
        expect(code).toContain('__enterChildren(');
        expect(code).toContain('__exitChildren()');
        expect(code).toContain('__append(');
      });
    });
  });

  describe('Given a component call (PascalCase)', () => {
    describe('When compiled', () => {
      it('Then calls the component as a function with props object', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <Button label="hi" />;\n}`,
        );
        expect(code).toContain('Button(');
        expect(code).toContain('label: "hi"');
        expect(code).not.toContain('<Button');
      });
    });
  });

  describe('Given a component with reactive prop', () => {
    describe('When compiled', () => {
      it('Then wraps reactive prop in getter', () => {
        const code = compileAndGetCode(
          `function App() {\n  let count = 0;\n  return <Display value={count} />;\n}`,
        );
        expect(code).toContain('Display(');
        expect(code).toContain('get value()');
        expect(code).toContain('count.value');
      });
    });
  });

  describe('Given a component with static non-literal prop', () => {
    describe('When compiled', () => {
      it('Then wraps in getter (all non-literal props use getters for cross-component reactivity)', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <Display value={someVar} />;\n}`,
        );
        expect(code).toContain('Display(');
        expect(code).toContain('get value()');
        expect(code).toContain('someVar');
      });
    });
  });

  describe('Given a component with children', () => {
    describe('When compiled', () => {
      it('Then passes children as thunk', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <Card><span>content</span></Card>;\n}`,
        );
        expect(code).toContain('Card(');
        expect(code).toContain('children:');
      });
    });
  });

  describe('Given a JSX fragment', () => {
    describe('When compiled', () => {
      it('Then creates a DocumentFragment', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <><div>a</div><span>b</span></>;\n}`,
        );
        expect(code).toContain('createDocumentFragment');
        expect(code).toContain('__element("div")');
        expect(code).toContain('__element("span")');
      });
    });
  });

  describe('Given a conditional expression (ternary)', () => {
    describe('When compiled', () => {
      it('Then produces __conditional() call', () => {
        const code = compileAndGetCode(
          `function App() {\n  let show = true;\n  return <div>{show ? <span>yes</span> : <span>no</span>}</div>;\n}`,
        );
        expect(code).toContain('__conditional(');
      });
    });
  });

  describe('Given a logical AND expression', () => {
    describe('When compiled', () => {
      it('Then produces __conditional() call', () => {
        const code = compileAndGetCode(
          `function App() {\n  let loading = true;\n  return <div>{loading && <span>Loading...</span>}</div>;\n}`,
        );
        expect(code).toContain('__conditional(');
      });
    });
  });

  describe('Given a list rendering with .map()', () => {
    describe('When compiled', () => {
      it('Then produces __list() call', () => {
        const code = compileAndGetCode(
          `function App() {\n  let items = [];\n  return <ul>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>;\n}`,
        );
        expect(code).toContain('__list(');
      });
    });
  });

  describe('Given a boolean shorthand attribute', () => {
    describe('When compiled', () => {
      it('Then sets attribute with empty string', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <input disabled />;\n}`,
        );
        expect(code).toContain('.setAttribute("disabled", "")');
      });
    });
  });

  describe('Given an element with spread attributes', () => {
    describe('When compiled', () => {
      it('Then uses __spread', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <div {...props}></div>;\n}`,
        );
        expect(code).toContain('__spread(');
      });
    });
  });

  describe('Given a ref attribute', () => {
    describe('When compiled', () => {
      it('Then assigns .current on the element variable', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <input ref={myRef} />;\n}`,
        );
        expect(code).toContain('myRef.current');
      });
    });
  });

  describe('Given JSX whitespace with newlines', () => {
    describe('When compiled', () => {
      it('Then collapses whitespace per React/Babel rules', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <div>\n    Hello\n    World\n  </div>;\n}`,
        );
        expect(code).toContain('Hello World');
      });
    });
  });

  describe('Given JSX assigned to a variable (not returned)', () => {
    describe('When compiled', () => {
      it('Then transforms the JSX in the assignment', () => {
        const code = compileAndGetCode(
          `function App() {\n  const el = <div>hello</div>;\n  return el;\n}`,
        );
        expect(code).toContain('__element("div")');
        expect(code).toContain('__staticText("hello")');
        expect(code).not.toContain('<div>');
      });
    });
  });

  describe('Given a self-closing element with no attributes', () => {
    describe('When compiled', () => {
      it('Then produces a simple __element call with no children', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <br />;\n}`,
        );
        expect(code).toContain('__element("br")');
        expect(code).not.toContain('__enterChildren');
        expect(code).not.toContain('__exitChildren');
      });
    });
  });

  describe('Given an empty element (no children)', () => {
    describe('When compiled', () => {
      it('Then omits __enterChildren/__exitChildren', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <div></div>;\n}`,
        );
        expect(code).toContain('__element("div")');
        expect(code).not.toContain('__enterChildren');
        expect(code).not.toContain('__exitChildren');
      });
    });
  });

  describe('Given a component with hyphenated prop name', () => {
    describe('When compiled', () => {
      it('Then quotes the prop key', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <Button data-testid="btn" />;\n}`,
        );
        expect(code).toContain('Button(');
        expect(code).toContain('"data-testid": "btn"');
      });
    });
  });

  describe('Given a component with boolean shorthand prop', () => {
    describe('When compiled', () => {
      it('Then passes true as the prop value', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <Button disabled />;\n}`,
        );
        expect(code).toContain('Button(');
        expect(code).toContain('disabled: true');
      });
    });
  });

  describe('Given multiple children of different types', () => {
    describe('When compiled', () => {
      it('Then handles text, elements, and expressions together', () => {
        const code = compileAndGetCode(
          `function App() {\n  let name = "world";\n  return <div>Hello <span>dear</span> {name}!</div>;\n}`,
        );
        expect(code).toContain('__staticText("Hello ")');
        expect(code).toContain('__element("span")');
        expect(code).toContain('__child(');
        expect(code).toContain('name.value');
        expect(code).toContain('__staticText("!")');
      });
    });
  });

  describe('Given a component with single child element', () => {
    describe('When compiled', () => {
      it('Then passes children as a thunk returning the element', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <Card><span>content</span></Card>;\n}`,
        );
        expect(code).toContain('Card(');
        expect(code).toContain('children: () =>');
        expect(code).toContain('__element("span")');
      });
    });
  });

  describe('Given a component with multiple children', () => {
    describe('When compiled', () => {
      it('Then passes children as a thunk returning an array', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <Card><span>a</span><span>b</span></Card>;\n}`,
        );
        expect(code).toContain('Card(');
        expect(code).toContain('children: () => [');
      });
    });
  });

  describe('Given a component with spread attributes', () => {
    describe('When compiled', () => {
      it('Then includes spread in props object', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <Button {...props} label="hi" />;\n}`,
        );
        expect(code).toContain('Button(');
        expect(code).toContain('...props');
        expect(code).toContain('label: "hi"');
      });
    });
  });

  describe('Given a deeply nested JSX structure', () => {
    describe('When compiled', () => {
      it('Then transforms all levels correctly', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <div><ul><li>item</li></ul></div>;\n}`,
        );
        expect(code).toContain('__element("div")');
        expect(code).toContain('__element("ul")');
        expect(code).toContain('__element("li")');
        expect(code).toContain('__staticText("item")');
      });
    });
  });

  describe('Given a component with key prop', () => {
    describe('When compiled', () => {
      it('Then excludes key from the component props object', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <Item key="1" label="test" />;\n}`,
        );
        expect(code).toContain('Item(');
        expect(code).toContain('label: "test"');
        expect(code).not.toContain('key:');
      });
    });
  });

  describe('Given signal transforms interacting with JSX', () => {
    describe('When compiled', () => {
      it('Then picks up .value in reactive attribute expressions', () => {
        const code = compileAndGetCode(
          `function App() {\n  let active = true;\n  return <div className={active ? "on" : "off"}></div>;\n}`,
        );
        expect(code).toContain('__attr(');
        expect(code).toContain('"class"');
        expect(code).toContain('active.value');
      });
    });
  });

  describe('Given a static expression attribute (non-reactive)', () => {
    describe('When compiled', () => {
      it('Then uses guarded setAttribute instead of __attr', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <div className={someVar}></div>;\n}`,
        );
        // Non-literal expressions get guarded setAttribute to handle null/false/true
        expect(code).toContain('const __v = someVar');
        expect(code).toContain('.setAttribute("class"');
        expect(code).not.toContain('__attr(');
      });
    });
  });

  describe('Given a literal expression attribute', () => {
    describe('When compiled', () => {
      it('Then uses guarded setAttribute (guards null/false/true)', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <div tabIndex={0}></div>;\n}`,
        );
        expect(code).toContain('const __v = 0');
        expect(code).toContain('.setAttribute("tabIndex"');
      });
    });
  });

  // ─── S-3/S-4: IDL properties ──────────────────────────────────────────────

  describe('Given an input with IDL value attribute (static)', () => {
    describe('When compiled', () => {
      it('Then uses direct property assignment instead of setAttribute', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <input value={someVar} />;\n}`,
        );
        expect(code).toContain('.value = __v');
        expect(code).not.toContain('.setAttribute("value"');
      });
    });
  });

  describe('Given an input with IDL checked attribute (boolean shorthand)', () => {
    describe('When compiled', () => {
      it('Then uses direct property assignment with true', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <input checked />;\n}`,
        );
        expect(code).toContain('.checked = true');
        expect(code).not.toContain('.setAttribute("checked"');
      });
    });
  });

  describe('Given an input with reactive IDL value attribute', () => {
    describe('When compiled', () => {
      it('Then uses __prop instead of __attr', () => {
        const code = compileAndGetCode(
          `function App() {\n  let val = "";\n  return <input value={val} />;\n}`,
        );
        expect(code).toContain('__prop(');
        expect(code).toContain('"value"');
        expect(code).toContain('val.value');
        expect(code).not.toContain('__attr(');
      });
    });
  });

  describe('Given a textarea with IDL value attribute', () => {
    describe('When compiled', () => {
      it('Then uses direct property assignment', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <textarea value={someVar} />;\n}`,
        );
        expect(code).toContain('.value = __v');
        expect(code).not.toContain('.setAttribute("value"');
      });
    });
  });

  // ─── S-5: Style attribute handling ────────────────────────────────────────

  describe('Given a style attribute with expression', () => {
    describe('When compiled', () => {
      it('Then handles objects via __styleStr', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <div style={myStyle}></div>;\n}`,
        );
        expect(code).toContain('__styleStr');
        expect(code).toContain('typeof __v === "object"');
      });
    });
  });

  // ─── S-7: JSX in prop values ──────────────────────────────────────────────

  describe('Given a component with JSX inside a prop value', () => {
    describe('When compiled', () => {
      it('Then transforms the nested JSX', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <Router fallback={() => <div>Not found</div>} />;\n}`,
        );
        expect(code).toContain('Router(');
        expect(code).toContain('__element("div")');
        expect(code).toContain('__staticText("Not found")');
        expect(code).not.toContain('<div>');
      });
    });
  });

  // ─── S-8: __listValue in component children ──────────────────────────────

  describe('Given a list rendering inside a component child', () => {
    describe('When compiled', () => {
      it('Then uses __listValue instead of __list', () => {
        const code = compileAndGetCode(
          `function App() {\n  let items = [];\n  return <List>{items.map(item => <li key={item.id}>{item.name}</li>)}</List>;\n}`,
        );
        expect(code).toContain('__listValue(');
        expect(code).not.toContain('__list(');
      });
    });
  });

  // ─── S-10: Index parameter in .map() ─────────────────────────────────────

  describe('Given a list rendering with index-based key', () => {
    describe('When compiled', () => {
      it('Then includes index param in key function', () => {
        const code = compileAndGetCode(
          `function App() {\n  let items = [];\n  return <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>;\n}`,
        );
        expect(code).toContain('__list(');
        expect(code).toContain('(item, index) => index');
      });
    });
  });

  describe('Given a list rendering with item-based key (not index)', () => {
    describe('When compiled', () => {
      it('Then does not include index param in key function', () => {
        const code = compileAndGetCode(
          `function App() {\n  let items = [];\n  return <ul>{items.map((item, index) => <li key={item.id}>{item.name}</li>)}</ul>;\n}`,
        );
        expect(code).toContain('__list(');
        expect(code).toContain('(item) => item.id');
        expect(code).not.toContain('(item, index)');
      });
    });
  });

  // ─── S-12: JSX inside non-.map() callbacks (Array.from, etc.) ───────────

  describe('Given JSX inside Array.from() callback', () => {
    describe('When compiled', () => {
      it('Then transforms the JSX inside the callback', () => {
        const code = compileAndGetCode(`
          function Grid() {
            return (
              <div>
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i}>{i}</span>
                ))}
              </div>
            );
          }
        `);

        expect(code).not.toMatch(/<span/);
        expect(code).toContain('__element("span")');
        expect(code).toContain('__element("div")');
      });
    });
  });

  describe('Given JSX inside .filter().map() chain', () => {
    describe('When compiled', () => {
      it('Then transforms JSX in both callbacks', () => {
        const code = compileAndGetCode(`
          function App() {
            let items = [];
            return (
              <ul>
                {items.filter(i => i.active).map(item => (
                  <li key={item.id}>{item.name}</li>
                ))}
              </ul>
            );
          }
        `);

        expect(code).not.toMatch(/<li/);
        expect(code).toContain('__list(');
        expect(code).toContain('__element("li")');
      });
    });
  });

  // ─── Non-IDL disabled stays as setAttribute ──────────────────────────────

  describe('Given a non-IDL boolean shorthand on non-input element', () => {
    describe('When compiled', () => {
      it('Then uses setAttribute (not property assignment)', () => {
        const code = compileAndGetCode(
          `function App() {\n  return <button disabled />;\n}`,
        );
        expect(code).toContain('.setAttribute("disabled", "")');
      });
    });
  });

  // ─── F-10: Signal API properties in JSX must use reactive wrappers ────────

  describe('Given a signal API variable (query) used in JSX children', () => {
    describe('When compiled', () => {
      it('Then wraps signal API property access in __child(() => ...)', () => {
        const { compile } = loadCompiler();
        const result = compile(
          `import { query } from '@vertz/ui';
          function App() {
            const tasks = query(() => fetchTasks());
            return <div>{tasks.data}</div>;
          }`,
          { filename: 'test.tsx' },
        );
        // tasks.data is a signal property → must be reactive
        expect(result.code).toContain('__child(() => tasks.data.value)');
        expect(result.code).not.toMatch(/__insert\([^,]+,\s*tasks\.data/);
      });
    });
  });

  describe('Given a signal API variable used in JSX attribute', () => {
    describe('When compiled', () => {
      it('Then wraps signal API property in __attr(() => ...)', () => {
        const { compile } = loadCompiler();
        const result = compile(
          `import { query } from '@vertz/ui';
          function App() {
            const tasks = query(() => fetchTasks());
            return <div className={tasks.loading ? 'loading' : ''}>content</div>;
          }`,
          { filename: 'test.tsx' },
        );
        // tasks.loading is a signal property → must use reactive __attr
        expect(result.code).toContain('__attr(');
        expect(result.code).toContain('tasks.loading.value');
      });
    });
  });

  describe('Given a signal API plain property in JSX children', () => {
    describe('When compiled', () => {
      it('Then does NOT wrap plain properties in reactive wrappers', () => {
        const { compile } = loadCompiler();
        const result = compile(
          `import { query } from '@vertz/ui';
          function App() {
            const tasks = query(() => fetchTasks());
            return <div>{tasks.refetch}</div>;
          }`,
          { filename: 'test.tsx' },
        );
        // tasks.refetch is a plain property → should NOT be reactive
        expect(result.code).not.toContain('__child(() => tasks.refetch');
        expect(result.code).toContain('__insert(');
      });
    });
  });

  // ─── F-11: Hyphenated reactive prop names on components ───────────────────

  describe('Given a component with hyphenated reactive prop', () => {
    describe('When compiled', () => {
      it('Then produces valid JS getter with computed property key', () => {
        const code = compileAndGetCode(`
          function App() {
            let count = 0;
            return <CustomComp data-testid={count} />;
          }
        `);
        // Hyphenated getter must use computed property syntax
        expect(code).toContain('get ["data-testid"]()');
        expect(code).not.toContain('get data-testid()');
      });
    });
  });

  describe('Given a component with non-hyphenated reactive prop', () => {
    describe('When compiled', () => {
      it('Then produces getter with plain identifier key', () => {
        const code = compileAndGetCode(`
          function App() {
            let count = 0;
            return <CustomComp title={count} />;
          }
        `);
        expect(code).toContain('get title()');
      });
    });
  });
});
