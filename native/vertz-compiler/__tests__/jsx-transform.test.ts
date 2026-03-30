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

  describe('Given a component with destructured props that spreads onto a native element', () => {
    describe('When compiled', () => {
      it('Then emits __spread(el, rest, __props) to preserve reactive getters', () => {
        const code = compileAndGetCode(
          `function ComposedInput({ classes, ...props }: { classes?: Record<string, string>; [key: string]: unknown }) {\n  return <input {...props} />;\n}`,
        );
        expect(code).toContain('__spread(');
        expect(code).toMatch(/__spread\([^,]+,\s*props,\s*__props\)/);
      });

      it('Then does NOT emit __props for non-destructured props', () => {
        const code = compileAndGetCode(
          `function App() {\n  const rest = { 'data-testid': 'btn' };\n  return <input {...rest} />;\n}`,
        );
        expect(code).toContain('__spread(');
        expect(code).toMatch(/__spread\([^,]+,\s*rest\)/);
        expect(code).not.toContain('__props');
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

  // ═══════════════════════════════════════════════════════════════════
  // Map callback expressions — attributes and children must not be empty
  // ═══════════════════════════════════════════════════════════════════

  describe('Given a .map() callback with dynamic attributes and children', () => {
    describe('When compiled', () => {
      it('Then preserves attribute expressions inside the render callback', () => {
        const code = compileAndGetCode(`
          function StatusFilter({ value, onChange }) {
            const items = [{ value: 'a', label: 'A' }];
            return (
              <div>
                {items.map((s) => (
                  <button
                    className={s.value === value ? 'active' : 'default'}
                    onClick={() => onChange(s.value)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            );
          }
        `);
        // Attribute expressions must NOT be empty
        expect(code).not.toMatch(/const __v = ;/);
        // Event handler must NOT be empty
        expect(code).not.toMatch(/__on\([^,]+, [^,]+, \)/);
        // Child insert must NOT be empty
        expect(code).not.toMatch(/__insert\([^,]+, \)/);
        // Should contain the actual expressions
        expect(code).toContain('s.label');
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

  // ═══════════════════════════════════════════════════════════════════
  // Props reactivity — __props.* must be treated as reactive
  // ═══════════════════════════════════════════════════════════════════

  describe('Given a component with props used as children', () => {
    describe('When a prop expression is used in JSX children', () => {
      it('Then uses __child() for reactive tracking, not __insert()', () => {
        const code = compileAndGetCode(`
          function Dialog(__props: { title: string }) {
            return <div>{__props.title}</div>;
          }
        `);
        expect(code).toContain('__child(');
        expect(code).not.toContain('__insert(');
      });
    });
  });

  describe('Given a component with destructured props used as children', () => {
    describe('When the compiler transforms props destructuring to __props access', () => {
      it('Then uses __child() for the prop expression', () => {
        const code = compileAndGetCode(`
          function Dialog({ title, description }: { title: string; description: string }) {
            return <div><h2>{title}</h2><p>{description}</p></div>;
          }
        `);
        // After props destructuring, title → __props.title
        expect(code).toContain('__props');
        expect(code).toContain('__child(');
        expect(code).not.toContain('__insert(');
      });
    });
  });

  describe('Given a component with props used in template literal attribute', () => {
    describe('When a prop expression is used in an attribute value', () => {
      it('Then uses __attr() for reactive tracking', () => {
        const code = compileAndGetCode(`
          function Card({ task }: { task: { id: string } }) {
            return <div data-testid={\`card-\${task.id}\`}>content</div>;
          }
        `);
        // After props destructuring, task → __props.task
        expect(code).toContain('__attr(');
        expect(code).toContain('"data-testid"');
      });
    });
  });

  describe('Given a component with props used in style object attribute', () => {
    describe('When a prop-derived expression is in a style object', () => {
      it('Then uses __attr() for reactive style binding', () => {
        const code = compileAndGetCode(`
          function Card({ task }: { task: { id: string } }) {
            return <div style={{ viewTransitionName: \`task-\${task.id}\` }}>content</div>;
          }
        `);
        expect(code).toContain('__attr(');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Non-JSX ternary conditionals — must still use __conditional()
  // ═══════════════════════════════════════════════════════════════════

  describe('Given a reactive ternary with string-only branches', () => {
    describe('When the condition references a signal variable', () => {
      it('Then wraps in __conditional() even though branches are not JSX', () => {
        const code = compileAndGetCode(`
          function App() {
            let theme = 'light';
            return <div>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</div>;
          }
        `);
        expect(code).toContain('__conditional(');
      });
    });
  });

  describe('Given multiple ternary conditionals (JSX + string branches)', () => {
    describe('When one has JSX branches and another has string branches', () => {
      it('Then both produce __conditional()', () => {
        const code = compileAndGetCode(`
          function App() {
            let theme = 'light';
            return (
              <div>
                {theme === 'light' ? <span>Sun</span> : <span>Moon</span>}
                {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
              </div>
            );
          }
        `);
        const matches = code.match(/__conditional\(/g) || [];
        expect(matches.length).toBe(2);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Double .value prevention
  // ═══════════════════════════════════════════════════════════════════

  describe('Given a form() signal property with explicit .value access', () => {
    describe('When compiled', () => {
      it('Then does not produce double .value (e.g., taskForm.submitting.value.value)', () => {
        const code = compileAndGetCode(`
          import { form } from '@vertz/ui';
          function TaskForm() {
            const taskForm = form(async () => {}, { schema: {} });
            return (
              <button disabled={taskForm.submitting.value}>
                {taskForm.submitting.value ? 'Creating...' : 'Create Task'}
              </button>
            );
          }
        `);
        // Must NOT contain double .value
        expect(code).not.toContain('.value.value');
        // Should still have .value accesses
        expect(code).toContain('taskForm.submitting.value');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Spurious effect import
  // ═══════════════════════════════════════════════════════════════════

  describe('Given a component that does not use effect()', () => {
    describe('When compiled', () => {
      it('Then does not import effect from @vertz/ui', () => {
        const code = compileAndGetCode(`
          function Settings() {
            let showSaved = false;
            let theme = 'light';
            function flashSaved() {
              showSaved = true;
              setTimeout(() => { showSaved = false; }, 2000);
            }
            return <div>{showSaved && <span>Saved!</span>}</div>;
          }
        `);
        expect(code).not.toMatch(/import\s*\{[^}]*\beffect\b[^}]*\}\s*from\s*['"]@vertz\/ui['"]/);
      });
    });
  });
});

// ─── Bug fixes: .map() callback body handling & reactive source APIs ────────

describe('Feature: Reactive source API property access in JSX', () => {
  describe('Given a component using useAuth() (reactive source API)', () => {
    describe('When an attribute references a reactive source property', () => {
      it('Then wraps the attribute in __attr()', () => {
        const code = compileAndGetCode(`
          import { useAuth } from '@vertz/ui/auth';
          function App() {
            const auth = useAuth();
            return <img src={auth.user.avatarUrl} />;
          }
        `);
        expect(code).toContain('__attr(');
        expect(code).toContain('auth.user.avatarUrl');
      });
    });

    describe('When a child expression references a reactive source property', () => {
      it('Then wraps the child in __child() (not __insert())', () => {
        const code = compileAndGetCode(`
          import { useAuth } from '@vertz/ui/auth';
          function App() {
            const auth = useAuth();
            return <span>{auth.user?.name ?? auth.user?.email}</span>;
          }
        `);
        expect(code).toContain('__child(');
        expect(code).not.toMatch(/__insert\([^,]+,\s*auth\.user/);
      });
    });
  });
});

describe('Feature: .map() callback with block body preserves pre-return code', () => {
  describe('Given a .map() callback with const declarations before the return', () => {
    describe('When the callback has reactive local variables referencing props', () => {
      it('Then wraps attributes using those locals in __attr() with inlined prop access', () => {
        const code = compileAndGetCode(`
          function LabelFilter({ labels, selected, onChange }) {
            return (
              <div>
                {labels.map((label) => {
                  const isActive = selected.includes(label.id);
                  return (
                    <button className={isActive ? 'active' : 'inactive'} />
                  );
                })}
              </div>
            );
          }
        `);
        // The attribute should be reactive because isActive depends on props.selected
        expect(code).toContain('__attr(');
        // The inlined expression should reference __props.selected directly
        expect(code).toMatch(/__attr\([^,]+,\s*"class",\s*\(\)\s*=>/);
        expect(code).toContain('__props.selected');
      });
    });

    describe('When the callback has reactive local variables referencing computed .value', () => {
      it('Then wraps attributes using those locals in __attr() with inlined .value access', () => {
        const code = compileAndGetCode(`
          function LabelPicker({ labels, issueLabels, onAdd, onRemove }) {
            const assignedLabelIds = new Set(issueLabels.map((il) => il.labelId));
            return (
              <div>
                {labels.map((label) => {
                  const isAssigned = assignedLabelIds.has(label.id);
                  return (
                    <button className={isAssigned ? 'active' : 'inactive'} />
                  );
                })}
              </div>
            );
          }
        `);
        // assignedLabelIds should be computed() and use .value
        expect(code).toContain('computed(');
        // The attribute should be reactive with __attr
        expect(code).toContain('__attr(');
        expect(code).toMatch(/__attr\([^,]+,\s*"class",\s*\(\)\s*=>/);
      });
    });

    describe('When the callback has a reactive local used in a conditional child', () => {
      it('Then the conditional correctly uses the reactive value', () => {
        const code = compileAndGetCode(`
          function List({ items, selected }) {
            return (
              <div>
                {items.map((item) => {
                  const isActive = selected.includes(item.id);
                  return (
                    <div>
                      {isActive && <span>Active</span>}
                    </div>
                  );
                })}
              </div>
            );
          }
        `);
        // The conditional should reference __props.selected via inlined expression
        expect(code).toContain('__props.selected');
      });
    });
  });
});
