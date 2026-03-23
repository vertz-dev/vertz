import { describe, expect, it } from 'bun:test';
import { Project, ts } from 'ts-morph';
import { compileForSSRAot } from '../compiler';

/** SSR runtime helpers used by generated AOT functions. */
const __esc = (value: unknown): string => {
  if (value == null || value === false) return '';
  if (Array.isArray(value)) return value.map((v) => __esc(v)).join('');
  const s = String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};
const __esc_attr = __esc;
const __ssr_spread = (obj: Record<string, unknown>): string => {
  return Object.entries(obj)
    .map(([k, v]) => ` ${k}="${__esc_attr(v)}"`)
    .join('');
};
const __ssr_style_object = (obj: Record<string, unknown>): string => {
  return Object.entries(obj)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => {
      const cssKey = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      return `${cssKey}: ${v}`;
    })
    .join('; ');
};

/** Create a ts-morph Project for parsing generated code (reused across helpers). */
function parseGeneratedCode(code: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  // .tsx extension is required so ts-morph correctly parses JSX in the original functions
  return project.createSourceFile('output.tsx', code);
}

/** Extract the AOT function text from generated code using AST (no regex). */
function extractAotFn(code: string, fnName: string): string {
  const sf = parseGeneratedCode(code);
  const fn = sf.getFunction(fnName);
  if (!fn) throw new Error(`Function ${fnName} not found in generated code`);
  return fn.getText();
}

/** Strip TS type annotations from a function declaration for JS eval. */
function stripTypeAnnotations(text: string): string {
  return text.replace(/\)\s*:\s*string\s*\{/, ') {').replace(/\(([^)]*)\)/, (_, params: string) => {
    const stripped = params.replace(/:\s*[^,)]+/g, '');
    return `(${stripped})`;
  });
}

/** Evaluate the generated AOT function by running only __ssr_* functions (no regex). */
function evalAot(code: string, fnName: string, args: Record<string, unknown> = {}): string {
  const sf = parseGeneratedCode(code);
  const aotCode = sf
    .getFunctions()
    .filter((fn) => fn.getName()?.startsWith('__ssr_'))
    .map((fn) => stripTypeAnnotations(fn.getText()))
    .join('\n');

  const argNames = Object.keys(args);
  const argValues = Object.values(args);

  const wrapper = new Function(
    '__esc',
    '__esc_attr',
    '__ssr_spread',
    '__ssr_style_object',
    ...argNames,
    `${aotCode}\nreturn ${fnName};`,
  );
  const fn = wrapper(__esc, __esc_attr, __ssr_spread, __ssr_style_object, ...argValues);
  return fn(args.__props ?? {});
}

describe('compileForSSRAot()', () => {
  describe('Tier 1: static components', () => {
    it('compiles static HTML to string concatenation', () => {
      const result = compileForSSRAot(
        `
function Footer() {
  return <footer class="app-footer"><p>Built with Vertz</p></footer>;
}
        `.trim(),
      );

      expect(result.code).toContain('__ssr_Footer');
      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.name).toBe('Footer');
      expect(result.components[0]!.tier).toBe('static');
      expect(result.components[0]!.holes).toEqual([]);

      const html = evalAot(result.code, '__ssr_Footer');
      expect(html).toBe('<footer class="app-footer"><p>Built with Vertz</p></footer>');
    });

    it('handles void elements (no closing tag)', () => {
      const result = compileForSSRAot(
        `
function Form() {
  return <div><input type="text" name="title" disabled /><br /><hr /></div>;
}
        `.trim(),
      );

      const html = evalAot(result.code, '__ssr_Form');
      expect(html).toBe('<div><input type="text" name="title" disabled><br><hr></div>');
    });

    it('handles fragments (no wrapper element)', () => {
      const result = compileForSSRAot(
        `
function Badges() {
  return <><span class="open">Open</span><span class="closed">Closed</span></>;
}
        `.trim(),
      );

      const html = evalAot(result.code, '__ssr_Badges');
      expect(html).toBe('<span class="open">Open</span><span class="closed">Closed</span>');
    });

    it('returns source map', () => {
      const result = compileForSSRAot(
        `
function Footer() {
  return <footer>Hello</footer>;
}
        `.trim(),
      );

      expect(result.map).toBeDefined();
      expect(result.map.version).toBe(3);
      expect(result.map.mappings).toBeTruthy();
    });

    it('returns empty components for non-component files', () => {
      const result = compileForSSRAot('const x = 42;');

      expect(result.components).toHaveLength(0);
      expect(result.code).toBe('const x = 42;');
    });
  });

  describe('Tier 2: data-driven components', () => {
    it('escapes dynamic text content with __esc()', () => {
      const result = compileForSSRAot(
        `
function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}!</h1>;
}
        `.trim(),
      );

      expect(result.code).toContain('__esc(');
      expect(result.components[0]!.tier).toBe('data-driven');

      const html = evalAot(result.code, '__ssr_Greeting', { __props: { name: 'World' } });
      expect(html).toBe('<h1>Hello, World!</h1>');
    });

    it('escapes HTML special characters in text', () => {
      const result = compileForSSRAot(
        `
function Greeting({ name }: { name: string }) {
  return <span>{name}</span>;
}
        `.trim(),
      );

      const html = evalAot(result.code, '__ssr_Greeting', {
        __props: { name: '<script>alert("xss")</script>' },
      });
      expect(html).toBe('<span>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</span>');
    });

    it('escapes dynamic attribute values with __esc_attr()', () => {
      const result = compileForSSRAot(
        `
function Card({ id }: { id: string }) {
  return <div data-testid={id}>card</div>;
}
        `.trim(),
      );

      expect(result.code).toContain('__esc_attr(');

      const html = evalAot(result.code, '__ssr_Card', { __props: { id: 'card-1' } });
      expect(html).toBe('<div data-testid="card-1">card</div>');
    });

    it('maps className to class attribute', () => {
      const result = compileForSSRAot(
        `
function Box({ cls }: { cls: string }) {
  return <div className={cls}>content</div>;
}
        `.trim(),
      );

      // The AOT function should use 'class', not 'className'
      const aotFn = extractAotFn(result.code, '__ssr_Box');
      expect(aotFn).not.toContain('className');
      expect(aotFn).toContain('class="');

      const html = evalAot(result.code, '__ssr_Box', { __props: { cls: 'my-box' } });
      expect(html).toBe('<div class="my-box">content</div>');
    });

    it('maps htmlFor to for attribute', () => {
      const result = compileForSSRAot(
        `
function Field({ fieldId }: { fieldId: string }) {
  return <label htmlFor={fieldId}>Label</label>;
}
        `.trim(),
      );

      // The AOT function should use 'for', not 'htmlFor'
      const aotFn = extractAotFn(result.code, '__ssr_Field');
      expect(aotFn).not.toContain('htmlFor');
      expect(aotFn).toContain('for="');

      const html = evalAot(result.code, '__ssr_Field', { __props: { fieldId: 'name' } });
      expect(html).toBe('<label for="name">Label</label>');
    });

    it('strips event handlers from output', () => {
      const result = compileForSSRAot(
        `
function Button({ label }: { label: string }) {
  return <button onClick={() => {}}>{label}</button>;
}
        `.trim(),
      );

      // The AOT function should not contain any event handler references
      const aotFn = extractAotFn(result.code, '__ssr_Button');
      expect(aotFn).not.toContain('onClick');
      expect(aotFn).not.toContain('onclick');

      const html = evalAot(result.code, '__ssr_Button', { __props: { label: 'Click' } });
      expect(html).toBe('<button>Click</button>');
    });

    it('handles raw text elements (script) without escaping', () => {
      const result = compileForSSRAot(
        `
function JsonData({ data }: { data: string }) {
  return <script type="application/json">{data}</script>;
}
        `.trim(),
      );

      const html = evalAot(result.code, '__ssr_JsonData', {
        __props: { data: '{"key": "<value>"}' },
      });
      // Script content should NOT be escaped
      expect(html).toBe('<script type="application/json">{"key": "<value>"}</script>');
    });
  });

  describe('Tier 3: conditional/dynamic components', () => {
    it('handles ternary conditionals with comment markers', () => {
      const result = compileForSSRAot(
        `
function Status({ isOnline }: { isOnline: boolean }) {
  return <div>{isOnline ? <span class="on">Online</span> : <span class="off">Offline</span>}</div>;
}
        `.trim(),
      );

      expect(result.components[0]!.tier).toBe('conditional');

      const htmlOn = evalAot(result.code, '__ssr_Status', { __props: { isOnline: true } });
      expect(htmlOn).toContain('<!--conditional-->');
      expect(htmlOn).toContain('<!--/conditional-->');
      expect(htmlOn).toContain(
        '<!--conditional--><span class="on">Online</span><!--/conditional-->',
      );

      const htmlOff = evalAot(result.code, '__ssr_Status', { __props: { isOnline: false } });
      expect(htmlOff).toContain(
        '<!--conditional--><span class="off">Offline</span><!--/conditional-->',
      );
    });

    it('handles && conditionals with comment markers', () => {
      const result = compileForSSRAot(
        `
function Alert({ message }: { message: string | null }) {
  return <div>{message && <span class="alert">{message}</span>}</div>;
}
        `.trim(),
      );

      expect(result.components[0]!.tier).toBe('conditional');

      const htmlWith = evalAot(result.code, '__ssr_Alert', { __props: { message: 'Error!' } });
      expect(htmlWith).toContain('<!--conditional-->');
      expect(htmlWith).toContain('<!--/conditional-->');
      expect(htmlWith).toContain(
        '<!--conditional--><span class="alert">Error!</span><!--/conditional-->',
      );

      const htmlWithout = evalAot(result.code, '__ssr_Alert', { __props: { message: null } });
      expect(htmlWithout).toContain('<!--conditional--><!--/conditional-->');
      expect(htmlWithout).not.toContain('<span');
    });

    it('handles list rendering with .map() and list markers', () => {
      const result = compileForSSRAot(
        `
function List({ items }: { items: string[] }) {
  return <ul>{items.map(item => <li>{item}</li>)}</ul>;
}
        `.trim(),
      );

      expect(result.components[0]!.tier).toBe('conditional');

      const html = evalAot(result.code, '__ssr_List', {
        __props: { items: ['A', 'B', 'C'] },
      });
      expect(html).toBe('<ul><!--list--><li>A</li><li>B</li><li>C</li><!--/list--></ul>');
    });

    it('handles empty list with markers', () => {
      const result = compileForSSRAot(
        `
function List({ items }: { items: string[] }) {
  return <ul>{items.map(item => <li>{item}</li>)}</ul>;
}
        `.trim(),
      );

      const html = evalAot(result.code, '__ssr_List', {
        __props: { items: [] },
      });
      expect(html).toBe('<ul><!--list--><!--/list--></ul>');
    });

    it('handles components with interactive state (data-v-id and child markers)', () => {
      const result = compileForSSRAot(
        `
function Counter({ initial }: { initial: number }) {
  let count = initial;
  return <button>{count}</button>;
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_Counter');
      expect(aotFn).toContain('data-v-id="Counter"');
      // Reactive expression should have child start marker (no end marker, matches DOM shim)
      expect(aotFn).toContain('<!--child-->');
      expect(aotFn).not.toContain('<!--/child-->');

      const html = evalAot(result.code, '__ssr_Counter', {
        __props: { initial: 42 },
        count: 42,
      });
      expect(html).toContain('data-v-id="Counter"');
      expect(html).toContain('<!--child-->42');
    });

    it('does NOT emit child markers for non-reactive expressions', () => {
      const result = compileForSSRAot(
        `
function Greeting({ name }: { name: string }) {
  return <span>{name}</span>;
}
        `.trim(),
      );

      // No signal variables → no child markers
      const aotFn = extractAotFn(result.code, '__ssr_Greeting');
      expect(aotFn).not.toContain('<!--child-->');
      expect(aotFn).not.toContain('<!--/child-->');
    });

    it('handles multiple components in one file', () => {
      const result = compileForSSRAot(
        `
function Header() {
  return <header>Title</header>;
}

function Footer() {
  return <footer>Copyright</footer>;
}
        `.trim(),
      );

      expect(result.components).toHaveLength(2);
      expect(result.components[0]!.name).toBe('Header');
      expect(result.components[1]!.name).toBe('Footer');

      const headerHtml = evalAot(result.code, '__ssr_Header');
      expect(headerHtml).toBe('<header>Title</header>');

      const footerHtml = evalAot(result.code, '__ssr_Footer');
      expect(footerHtml).toBe('<footer>Copyright</footer>');
    });

    it('handles nested child components as function calls', () => {
      const result = compileForSSRAot(
        `
function Badge({ text }: { text: string }) {
  return <span class="badge">{text}</span>;
}

function Card({ title }: { title: string }) {
  return <div class="card"><Badge text={title} /></div>;
}
        `.trim(),
      );

      // Badge should be called as a function, not inlined
      const aotFn = extractAotFn(result.code, '__ssr_Card');
      expect(aotFn).toContain('__ssr_Badge(');
    });

    it('handles spread attributes with __ssr_spread()', () => {
      const result = compileForSSRAot(
        `
function Box({ className, ...rest }: { className: string; [key: string]: unknown }) {
  return <div className={className} {...rest}>content</div>;
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_Box');
      expect(aotFn).toContain('__ssr_spread(');
    });

    it('handles self-closing non-void elements', () => {
      const result = compileForSSRAot(
        `
function Empty() {
  return <div />;
}
        `.trim(),
      );

      const html = evalAot(result.code, '__ssr_Empty');
      expect(html).toBe('<div></div>');
    });

    it('handles nested elements with mixed content', () => {
      const result = compileForSSRAot(
        `
function Card({ title, desc }: { title: string; desc: string }) {
  return (
    <div class="card">
      <h2>{title}</h2>
      <p class="desc">{desc}</p>
    </div>
  );
}
        `.trim(),
      );

      const html = evalAot(result.code, '__ssr_Card', {
        __props: { title: 'Hello', desc: 'World' },
      });
      expect(html).toBe('<div class="card"><h2>Hello</h2><p class="desc">World</p></div>');
    });

    it('handles boolean attributes on void elements', () => {
      const result = compileForSSRAot(
        `
function CheckInput() {
  return <input type="checkbox" checked disabled />;
}
        `.trim(),
      );

      const html = evalAot(result.code, '__ssr_CheckInput');
      expect(html).toBe('<input type="checkbox" checked disabled>');
    });
  });

  describe('@vertz-no-aot pragma', () => {
    it('skips AOT compilation when pragma is present', () => {
      const result = compileForSSRAot(
        `
// @vertz-no-aot
function Widget({ data }: { data: string }) {
  return <div>{data}</div>;
}
        `.trim(),
      );

      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.tier).toBe('runtime-fallback');
      expect(result.code).not.toContain('__ssr_Widget');
    });
  });

  describe('edge cases and security', () => {
    it('escapes quotes in static string literal attributes', () => {
      const result = compileForSSRAot(
        `
function Quote() {
  return <div title="it's a &quot;test&quot;">content</div>;
}
        `.trim(),
      );

      const html = evalAot(result.code, '__ssr_Quote');
      // Single quotes and escaped entities must survive in the output
      expect(html).toContain('title="');
      expect(html).toContain('content');
      // Should not break the JS string literal
      expect(() => evalAot(result.code, '__ssr_Quote')).not.toThrow();
    });

    it('classifies components with multiple returns as runtime-fallback', () => {
      const result = compileForSSRAot(
        `
function Comp({ loading }: { loading: boolean }) {
  if (loading) return <div>Loading...</div>;
  return <div>Content</div>;
}
        `.trim(),
      );

      expect(result.components[0]!.tier).toBe('runtime-fallback');
      expect(result.code).not.toContain('__ssr_Comp');
    });

    it('strips key prop from HTML output', () => {
      const result = compileForSSRAot(
        `
function List({ items }: { items: string[] }) {
  return <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>;
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_List');
      expect(aotFn).not.toContain('key=');
    });

    it('strips ref prop from HTML output', () => {
      const result = compileForSSRAot(
        `
function Input() {
  return <input type="text" ref={() => {}} />;
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_Input');
      expect(aotFn).not.toContain('ref');
    });

    it('handles dangerouslySetInnerHTML as raw child content', () => {
      const result = compileForSSRAot(
        `
function RawContent({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_RawContent');
      expect(aotFn).not.toContain('dangerouslySetInnerHTML');

      const output = evalAot(result.code, '__ssr_RawContent', {
        __props: { html: '<strong>bold</strong>' },
      });
      expect(output).toBe('<div><strong>bold</strong></div>');
    });

    it('handles dynamic boolean attributes correctly', () => {
      const result = compileForSSRAot(
        `
function Toggle({ isDisabled }: { isDisabled: boolean }) {
  return <button disabled={isDisabled}>Click</button>;
}
        `.trim(),
      );

      const htmlEnabled = evalAot(result.code, '__ssr_Toggle', {
        __props: { isDisabled: false },
      });
      expect(htmlEnabled).toBe('<button>Click</button>');

      const htmlDisabled = evalAot(result.code, '__ssr_Toggle', {
        __props: { isDisabled: true },
      });
      expect(htmlDisabled).toBe('<button disabled>Click</button>');
    });

    it('populates holes array with referenced component names', () => {
      const result = compileForSSRAot(
        `
function Badge({ text }: { text: string }) {
  return <span class="badge">{text}</span>;
}

function Card({ title }: { title: string }) {
  return <div class="card"><Badge text={title} /><Badge text="extra" /></div>;
}
        `.trim(),
      );

      const cardInfo = result.components.find((c) => c.name === 'Card');
      expect(cardInfo!.holes).toContain('Badge');
      // No duplicates
      expect(cardInfo!.holes.filter((h) => h === 'Badge')).toHaveLength(1);
    });

    it('handles style objects with __ssr_style_object()', () => {
      const result = compileForSSRAot(
        `
function Styled({ bg }: { bg: string }) {
  return <div style={{ backgroundColor: bg }}>content</div>;
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_Styled');
      expect(aotFn).toContain('__ssr_style_object(');
      expect(aotFn).not.toContain('[object Object]');
    });
  });

  describe('diagnostics', () => {
    it('returns diagnostics array', () => {
      const result = compileForSSRAot(
        `
function Comp() {
  return <div>Hello</div>;
}
        `.trim(),
      );

      expect(result.diagnostics).toBeDefined();
      expect(Array.isArray(result.diagnostics)).toBe(true);
    });
  });
});
