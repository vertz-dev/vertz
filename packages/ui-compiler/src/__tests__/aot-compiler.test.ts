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

/** Strip TS type annotations and export keyword from a function declaration for JS eval. */
function stripTypeAnnotations(text: string): string {
  return text
    .replace(/^export\s+/, '')
    .replace(/\)\s*:\s*string\s*\{/, ') {')
    .replace(/\(([^)]*)\)/, (_, params: string) => {
      // Handle generic types like Record<string, unknown> by matching angle brackets
      const stripped = params.replace(/:\s*(?:[^,)<]+(?:<[^>]*>)?[^,)]*)/g, '');
      return `(${stripped})`;
    });
}

/** Create a mock SSRAotContext for testing query-based AOT functions. */
function createMockCtx(data: Record<string, unknown> = {}) {
  return { getData: (key: string) => data[key] };
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

  // For query-based functions: (data, ctx) signature
  if (args.__ctx) {
    return fn(args.__data ?? {}, args.__ctx);
  }
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
      // Reactive expression should have both child start and end markers (#1815)
      expect(aotFn).toContain('<!--child-->');
      expect(aotFn).toContain('<!--/child-->');

      const html = evalAot(result.code, '__ssr_Counter', {
        __props: { initial: 42 },
        count: 42,
      });
      expect(html).toContain('data-v-id="Counter"');
      expect(html).toContain('<!--child-->42<!--/child-->');
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

    it('classifies guard pattern (if-return + main return) as conditional', () => {
      const result = compileForSSRAot(
        `
function Comp({ loading }: { loading: boolean }) {
  if (loading) return <div>Loading...</div>;
  return <div>Content</div>;
}
        `.trim(),
      );

      expect(result.components[0]!.tier).toBe('conditional');
      expect(result.code).toContain('__ssr_Comp');
    });

    it('classifies non-guard multiple returns as runtime-fallback', () => {
      const result = compileForSSRAot(
        `
function Comp({ x }: { x: number }) {
  try { return <div>OK</div>; }
  catch { return <div>Error</div>; }
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

    it('handles style objects with __ssr_style_object() for dynamic values', () => {
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

    it('pre-computes static style objects at compile time', () => {
      const result = compileForSSRAot(
        `
function Card() {
  return <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px' }}>content</div>;
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_Card');
      // Should NOT contain __ssr_style_object — pre-computed at compile time
      expect(aotFn).not.toContain('__ssr_style_object');
      // Should contain the pre-computed CSS string
      expect(aotFn).toContain('background-color: white');
      expect(aotFn).toContain('border-radius: 8px');
      expect(aotFn).toContain('padding: 16px');
    });

    it('pre-computes numeric style values with px suffix', () => {
      const result = compileForSSRAot(
        `
function Box() {
  return <div style={{ marginBottom: 16, opacity: 0.9, fontSize: 14 }}>content</div>;
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_Box');
      expect(aotFn).not.toContain('__ssr_style_object');
      // marginBottom and fontSize get px, opacity is unitless
      expect(aotFn).toContain('margin-bottom: 16px');
      expect(aotFn).toContain('opacity: 0.9');
      expect(aotFn).toContain('font-size: 14px');
    });

    it('falls back to __ssr_style_object for mixed static/dynamic styles', () => {
      const result = compileForSSRAot(
        `
function Dynamic({ width }: { width: number }) {
  return <div style={{ backgroundColor: 'red', width: width }}>content</div>;
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_Dynamic');
      // Must fall back — width is dynamic
      expect(aotFn).toContain('__ssr_style_object(');
    });

    it('pre-computes style with zero numeric values without px suffix', () => {
      const result = compileForSSRAot(
        `
function NoMargin() {
  return <div style={{ margin: 0, padding: '4px' }}>content</div>;
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_NoMargin');
      expect(aotFn).not.toContain('__ssr_style_object');
      expect(aotFn).toContain('margin: 0');
      expect(aotFn).not.toContain('margin: 0px');
      expect(aotFn).toContain('padding: 4px');
    });

    it('pre-computes vendor-prefixed style properties', () => {
      const result = compileForSSRAot(
        `
function Prefixed() {
  return <div style={{ WebkitTransform: 'rotate(45deg)', msFlexAlign: 'center' }}>x</div>;
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_Prefixed');
      expect(aotFn).not.toContain('__ssr_style_object');
      expect(aotFn).toContain('-webkit-transform: rotate(45deg)');
      expect(aotFn).toContain('-ms-flex-align: center');
    });

    it('renders pre-computed style correctly in output', () => {
      const result = compileForSSRAot(
        `
function Styled() {
  return <div style={{ fontSize: '20px', fontWeight: 'bold' }}>text</div>;
}
        `.trim(),
      );

      const html = evalAot(result.code, '__ssr_Styled');
      expect(html).toContain('style="font-size: 20px; font-weight: bold"');
      expect(html).toContain('>text</div>');
    });
  });

  describe('query() + conditional return patterns (#1769)', () => {
    describe('Given a component with query() and early-return loading guard', () => {
      describe('When compileForSSRAot processes the file', () => {
        it('Then classifies the component as conditional (not runtime-fallback)', () => {
          const result = compileForSSRAot(
            `
import { query } from '@vertz/ui';
export default function F() {
  const q = query(async () => ({ name: 'x' }), { key: 'x' });
  const d = q.data;
  if (!d) return <div>Loading</div>;
  return <div>{d.name}</div>;
}
            `.trim(),
          );

          expect(result.components).toHaveLength(1);
          expect(result.components[0]!.name).toBe('F');
          expect(result.components[0]!.tier).toBe('conditional');
        });

        it('Then generates an __ssr_ AOT function that handles both branches', () => {
          const result = compileForSSRAot(
            `
import { query } from '@vertz/ui';
export default function F() {
  const q = query(async () => ({ name: 'x' }), { key: 'x' });
  const d = q.data;
  if (!d) return <div>Loading</div>;
  return <div>{d.name}</div>;
}
            `.trim(),
          );

          expect(result.code).toContain('__ssr_F');
          const aotFn = extractAotFn(result.code, '__ssr_F');
          expect(aotFn).toContain('Loading');
          // d is replaced with __q0 from ctx.getData('x')
          expect(aotFn).toContain('__q0');
          expect(aotFn).toContain('<!--conditional-->');

          // Runtime correctness: loading branch
          const loadingHtml = evalAot(result.code, '__ssr_F', {
            __ctx: createMockCtx({ x: null }),
          });
          expect(loadingHtml).toContain('<!--conditional-->');
          expect(loadingHtml).toContain('Loading');

          // Runtime correctness: main branch
          const mainHtml = evalAot(result.code, '__ssr_F', {
            __ctx: createMockCtx({ x: { name: 'Test' } }),
          });
          expect(mainHtml).toContain('Test');
          expect(mainHtml).not.toContain('Loading');
        });
      });
    });

    describe('Given a component with query() and ternary return', () => {
      describe('When compileForSSRAot processes the file', () => {
        it('Then the component appears in the components array (not silently dropped)', () => {
          const result = compileForSSRAot(
            `
import { query } from '@vertz/ui';
export default function F() {
  const q = query(async () => ({ name: 'x' }), { key: 'x' });
  const d = q.data;
  return d ? <div>{d.name}</div> : <div>Loading</div>;
}
            `.trim(),
          );

          expect(result.components).toHaveLength(1);
        });

        it('Then classifies the component as conditional', () => {
          const result = compileForSSRAot(
            `
import { query } from '@vertz/ui';
export default function F() {
  const q = query(async () => ({ name: 'x' }), { key: 'x' });
  const d = q.data;
  return d ? <div>{d.name}</div> : <div>Loading</div>;
}
            `.trim(),
          );

          expect(result.components[0]!.tier).toBe('conditional');
        });

        it('Then generates an __ssr_ AOT function for the ternary', () => {
          const result = compileForSSRAot(
            `
import { query } from '@vertz/ui';
export default function F() {
  const q = query(async () => ({ name: 'x' }), { key: 'x' });
  const d = q.data;
  return d ? <div>{d.name}</div> : <div>Loading</div>;
}
            `.trim(),
          );

          expect(result.code).toContain('__ssr_F');
          const aotFn = extractAotFn(result.code, '__ssr_F');
          expect(aotFn).toContain('<!--conditional-->');
          expect(aotFn).toContain('Loading');
          // d is replaced with __q0 from ctx.getData('x')
          expect(aotFn).toContain('__q0');

          // Runtime correctness: true branch
          const trueHtml = evalAot(result.code, '__ssr_F', {
            __ctx: createMockCtx({ x: { name: 'World' } }),
          });
          expect(trueHtml).toContain('World');
          expect(trueHtml).not.toContain('Loading');

          // Runtime correctness: false branch
          const falseHtml = evalAot(result.code, '__ssr_F', {
            __ctx: createMockCtx({ x: null }),
          });
          expect(falseHtml).toContain('Loading');
        });
      });
    });

    describe('Given a component with query() and .map() in the main return', () => {
      describe('When compileForSSRAot processes the file', () => {
        it('Then classifies as conditional and generates string concatenation for the list', () => {
          const result = compileForSSRAot(
            `
import { query } from '@vertz/ui';
export default function F() {
  const q = query(async () => ({ items: [] as string[] }), { key: 'x' });
  const d = q.data;
  if (!d) return <div>Loading</div>;
  return <ul>{d.items.map(item => <li>{item}</li>)}</ul>;
}
            `.trim(),
          );

          expect(result.components).toHaveLength(1);
          expect(result.components[0]!.tier).toBe('conditional');
          expect(result.code).toContain('__ssr_F');
          const aotFn = extractAotFn(result.code, '__ssr_F');
          expect(aotFn).toContain('<!--list-->');
          expect(aotFn).toContain('Loading');
        });
      });
    });

    describe('Given a component with && and JSX in a return', () => {
      describe('When compileForSSRAot processes the file', () => {
        it('Then classifies as conditional and generates the AOT function', () => {
          const result = compileForSSRAot(
            `
export default function F({ show }: { show: boolean }) {
  return show && <div>Content</div>;
}
            `.trim(),
          );

          expect(result.components).toHaveLength(1);
          expect(result.components[0]!.tier).toBe('conditional');
          expect(result.code).toContain('__ssr_F');

          const htmlShow = evalAot(result.code, '__ssr_F', { __props: { show: true }, show: true });
          expect(htmlShow).toContain('Content');

          const htmlHide = evalAot(result.code, '__ssr_F', {
            __props: { show: false },
            show: false,
          });
          expect(htmlHide).not.toContain('Content');
        });
      });
    });

    describe('Given a guard pattern with props (no query)', () => {
      describe('When compileForSSRAot processes the file', () => {
        it('Then classifies as conditional (not runtime-fallback)', () => {
          const result = compileForSSRAot(
            `
function Comp({ loading }: { loading: boolean }) {
  if (loading) return <div>Loading...</div>;
  return <div>Content</div>;
}
            `.trim(),
          );

          expect(result.components[0]!.tier).toBe('conditional');
          expect(result.code).toContain('__ssr_Comp');

          const loadingHtml = evalAot(result.code, '__ssr_Comp', {
            __props: { loading: true },
            loading: true,
          });
          expect(loadingHtml).toContain('Loading...');

          const contentHtml = evalAot(result.code, '__ssr_Comp', {
            __props: { loading: false },
            loading: false,
          });
          expect(contentHtml).toContain('Content');
        });
      });
    });

    describe('Given multiple guard returns (2+ if-return guards)', () => {
      describe('When compileForSSRAot processes the file', () => {
        it('Then generates a nested ternary for all guards', () => {
          const result = compileForSSRAot(
            `
function Comp({ status }: { status: string }) {
  if (status === 'loading') return <div>Loading...</div>;
  if (status === 'error') return <div>Error!</div>;
  return <div>Content</div>;
}
            `.trim(),
          );

          expect(result.components[0]!.tier).toBe('conditional');
          expect(result.code).toContain('__ssr_Comp');

          const loadingHtml = evalAot(result.code, '__ssr_Comp', {
            __props: { status: 'loading' },
            status: 'loading',
          });
          expect(loadingHtml).toContain('Loading...');

          const errorHtml = evalAot(result.code, '__ssr_Comp', {
            __props: { status: 'error' },
            status: 'error',
          });
          expect(errorHtml).toContain('Error!');

          const contentHtml = evalAot(result.code, '__ssr_Comp', {
            __props: { status: 'ok' },
            status: 'ok',
          });
          expect(contentHtml).toContain('Content');
        });
      });
    });

    describe('Given nested if-guards', () => {
      describe('When compileForSSRAot processes the file', () => {
        it('Then falls back to runtime-fallback (not safe to flatten)', () => {
          const result = compileForSSRAot(
            `
function Comp({ a, b }: { a: boolean; b: boolean }) {
  if (a) {
    if (b) return <div>Both</div>;
    return <div>Only A</div>;
  }
  return <div>None</div>;
}
            `.trim(),
          );

          expect(result.components[0]!.tier).toBe('runtime-fallback');
        });
      });
    });

    describe('Given a guard return in the else-branch', () => {
      describe('When compileForSSRAot processes the file', () => {
        it('Then negates the condition correctly', () => {
          const result = compileForSSRAot(
            `
function Comp({ data }: { data: any }) {
  if (data) {
    // process
  } else {
    return <div>No data</div>;
  }
  return <div>Has data</div>;
}
            `.trim(),
          );

          expect(result.components[0]!.tier).toBe('conditional');

          // data is falsy → "No data"
          const noDataHtml = evalAot(result.code, '__ssr_Comp', {
            __props: { data: null },
            data: null,
          });
          expect(noDataHtml).toContain('No data');

          // data is truthy → "Has data"
          const hasDataHtml = evalAot(result.code, '__ssr_Comp', {
            __props: { data: { x: 1 } },
            data: { x: 1 },
          });
          expect(hasDataHtml).toContain('Has data');
        });
      });
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

  describe('query-sourced variables (standalone page functions)', () => {
    it('emits queryKeys in AotComponentInfo for query() variables', () => {
      const result = compileForSSRAot(
        `
import { query } from '@vertz/ui';

function ProjectsPage() {
  const projects = query(api.projects.list());
  return <div>{projects.data}</div>;
}
        `.trim(),
      );

      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.queryKeys).toEqual(['projects-list']);
    });

    it('generates (data, ctx) signature for components with query()', () => {
      const result = compileForSSRAot(
        `
import { query } from '@vertz/ui';

function ProjectsPage() {
  const projects = query(api.projects.list());
  return <div>{projects.data}</div>;
}
        `.trim(),
      );

      const fnText = extractAotFn(result.code, '__ssr_ProjectsPage');
      expect(fnText).toContain('data');
      expect(fnText).toContain('ctx');
    });

    it('replaces query().data references with ctx.getData(key)', () => {
      const result = compileForSSRAot(
        `
import { query } from '@vertz/ui';

function ProjectsPage() {
  const projects = query(api.projects.list());
  return <div>{projects.data}</div>;
}
        `.trim(),
      );

      const fnText = extractAotFn(result.code, '__ssr_ProjectsPage');
      expect(fnText).toContain("ctx.getData('projects-list')");
      expect(fnText).not.toContain('projects.data');
    });

    it('replaces query().loading with false', () => {
      const result = compileForSSRAot(
        `
import { query } from '@vertz/ui';

function ProjectsPage() {
  const projects = query(api.projects.list());
  return <div>{projects.loading ? 'Loading...' : 'Done'}</div>;
}
        `.trim(),
      );

      const fnText = extractAotFn(result.code, '__ssr_ProjectsPage');
      expect(fnText).not.toContain('projects.loading');
    });

    it('preserves (props) signature for components without query()', () => {
      const result = compileForSSRAot(
        `
function ProjectCard(props) {
  return <div>{props.name}</div>;
}
        `.trim(),
      );

      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.queryKeys).toEqual([]);

      const fnText = extractAotFn(result.code, '__ssr_ProjectCard');
      expect(fnText).toContain('props');
      expect(fnText).not.toContain('ctx');
    });

    it('handles multiple query() calls in a single component', () => {
      const result = compileForSSRAot(
        `
import { query } from '@vertz/ui';

function DashboardPage() {
  const projects = query(api.projects.list());
  const tasks = query(api.tasks.list());
  return <div>{projects.data}{tasks.data}</div>;
}
        `.trim(),
      );

      expect(result.components[0]!.queryKeys).toContain('projects-list');
      expect(result.components[0]!.queryKeys).toContain('tasks-list');

      const fnText = extractAotFn(result.code, '__ssr_DashboardPage');
      expect(fnText).not.toContain('projects.data');
      expect(fnText).not.toContain('tasks.data');
    });

    it('extracts cache key from query() options object { key: "..." }', () => {
      const result = compileForSSRAot(
        `
import { query } from '@vertz/ui';

function GamesPage() {
  const gamesQuery = query(async () => fetchGames(), { key: 'home-games' });
  return <div>{gamesQuery.data}</div>;
}
        `.trim(),
      );

      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.queryKeys).toEqual(['home-games']);

      const fnText = extractAotFn(result.code, '__ssr_GamesPage');
      expect(fnText).toContain("ctx.getData('home-games')");
      expect(fnText).not.toContain('gamesQuery.data');
    });

    it('classifies component with useParams() and api.entity.get(param) as data-driven', () => {
      const result = compileForSSRAot(
        `
import { query } from '@vertz/ui';

function CardDetailPage() {
  const { id } = useParams();
  const card = query(api.cards.get(id));
  return <div>{card.data.name}</div>;
}
        `.trim(),
      );

      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.tier).not.toBe('runtime-fallback');
      expect(result.components[0]!.queryKeys).toEqual(['cards-get']);

      const fnText = extractAotFn(result.code, '__ssr_CardDetailPage');
      expect(fnText).toContain("ctx.getData('cards-get')");
    });

    it('classifies component with useParams() and template-literal query key as data-driven', () => {
      const result = compileForSSRAot(
        `
import { query } from '@vertz/ui';

function GameDetailPage() {
  const { slug } = useParams();
  const game = query(async () => fetchGame(slug), { key: \`game-\${slug}\` });
  return <h1>{game.data.name}</h1>;
}
        `.trim(),
      );

      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.tier).not.toBe('runtime-fallback');
      expect(result.components[0]!.queryKeys).toEqual(['game-${slug}']);
    });

    it('generates ctx.getData with backtick template for parameterized query keys', () => {
      const result = compileForSSRAot(
        `
import { query } from '@vertz/ui';

function GameDetailPage() {
  const { slug } = useParams();
  const game = query(async () => fetchGame(slug), { key: \`game-\${slug}\` });
  return <h1>{game.data.name}</h1>;
}
        `.trim(),
      );

      const fnText = extractAotFn(result.code, '__ssr_GameDetailPage');
      // Should use backtick template with ctx.params, not single-quoted string
      expect(fnText).toContain('ctx.getData(`game-${ctx.params.slug}`)');
      expect(fnText).not.toContain("ctx.getData('game-${slug}')");
    });

    it('handles aliased useParams() destructuring — uses route param name in ctx.params', () => {
      const result = compileForSSRAot(
        `
import { query } from '@vertz/ui';

function GameDetailPage() {
  const { slug: gameSlug } = useParams();
  const game = query(async () => fetchGame(gameSlug), { key: \`game-\${gameSlug}\` });
  return <h1>{game.data.name}</h1>;
}
        `.trim(),
      );

      expect(result.components[0]!.tier).not.toBe('runtime-fallback');
      expect(result.components[0]!.queryKeys).toEqual(['game-${slug}']);

      const fnText = extractAotFn(result.code, '__ssr_GameDetailPage');
      // Should use the route param name 'slug', not the local alias 'gameSlug'
      expect(fnText).toContain('ctx.params.slug');
      expect(fnText).not.toContain('ctx.params.gameSlug');
    });

    it('handles multiple params in template-literal query keys', () => {
      const result = compileForSSRAot(
        `
import { query } from '@vertz/ui';

function OrgProjectPage() {
  const { orgId, projectId } = useParams();
  const project = query(async () => fetchProject(orgId, projectId), { key: \`org-\${orgId}-project-\${projectId}\` });
  return <div>{project.data.name}</div>;
}
        `.trim(),
      );

      expect(result.components[0]!.tier).not.toBe('runtime-fallback');
      expect(result.components[0]!.queryKeys).toEqual(['org-${orgId}-project-${projectId}']);

      const fnText = extractAotFn(result.code, '__ssr_OrgProjectPage');
      expect(fnText).toContain('ctx.params.orgId');
      expect(fnText).toContain('ctx.params.projectId');
    });

    it('falls back to runtime-fallback when template key has non-useParams interpolation', () => {
      const result = compileForSSRAot(
        `
import { query } from '@vertz/ui';

function SearchPage() {
  const { slug } = useParams();
  const computedKey = slug + '-extra';
  const results = query(async () => fetchResults(), { key: \`search-\${computedKey}\` });
  return <div>{results.data}</div>;
}
        `.trim(),
      );

      expect(result.components[0]!.tier).toBe('runtime-fallback');
    });

    it('includes fallbackReason when query key is unresolvable', () => {
      const result = compileForSSRAot(
        `
import { query } from '@vertz/ui';

function SearchPage() {
  const results = query(async () => fetchResults());
  return <div>{results.data}</div>;
}
        `.trim(),
      );

      expect(result.components[0]!.tier).toBe('runtime-fallback');
      expect(result.components[0]!.fallbackReason).toBe(
        'query key is not a static string or template literal with useParams() interpolation',
      );
    });

    it('classifies component with useRouter() search param in template key as AOT-eligible', () => {
      const result = compileForSSRAot(
        `
import { query, useParams, useRouter } from '@vertz/ui';

function SetDetailPage() {
  const { slug } = useParams();
  const router = useRouter();
  const page = parseInt(router.current.value?.searchParams?.get('page') || '1');
  const setQuery = query(async () => fetchSet(slug, page), { key: \`set-\${slug}-\${page}\` });
  return <h1>{setQuery.data.name}</h1>;
}
        `.trim(),
      );

      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.tier).not.toBe('runtime-fallback');
      expect(result.components[0]!.queryKeys).toEqual(['set-${slug}-${sp:page|1}']);
    });

    it('classifies component with intermediate searchParams variable as AOT-eligible', () => {
      const result = compileForSSRAot(
        `
import { query, useParams, useRouter } from '@vertz/ui';

function SellerDetailPage() {
  const { slug } = useParams();
  const router = useRouter();
  const sp = router.current.value?.searchParams;
  const page = parseInt(sp?.get('page') || '1');
  const sellerQuery = query(async () => fetchSeller(slug, page), { key: \`seller-\${slug}-\${page}\` });
  return <h1>{sellerQuery.data.name}</h1>;
}
        `.trim(),
      );

      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.tier).not.toBe('runtime-fallback');
      expect(result.components[0]!.queryKeys).toEqual(['seller-${slug}-${sp:page|1}']);
    });

    it('generates ctx.searchParams?.get() in __ssr_ function for search param keys', () => {
      const result = compileForSSRAot(
        `
import { query, useParams, useRouter } from '@vertz/ui';

function SetDetailPage() {
  const { slug } = useParams();
  const router = useRouter();
  const page = parseInt(router.current.value?.searchParams?.get('page') || '1');
  const setQuery = query(async () => fetchSet(slug, page), { key: \`set-\${slug}-\${page}\` });
  return <h1>{setQuery.data.name}</h1>;
}
        `.trim(),
      );

      // The generated __ssr_ function should use ctx.params for route params
      // and ctx.searchParams?.get() for search params
      // With default value encoding, the getData key uses || 'default' (not ?? '')
      expect(result.code).toContain(
        "ctx.getData(`set-${ctx.params.slug}-${ctx.searchParams?.get('page') || '1'}`)",
      );
    });

    it('rewrites useParams/searchParams vars in __ssr_ preamble to use ctx', () => {
      const result = compileForSSRAot(
        `
import { query, useParams, useRouter } from '@vertz/ui';

function SetDetailPage() {
  const { slug } = useParams();
  const router = useRouter();
  const page = parseInt(router.current.value?.searchParams?.get('page') || '1');
  const setQuery = query(async () => fetchSet(slug, page), { key: \`set-\${slug}-\${page}\` });
  return <h1>{setQuery.data.name}</h1>;
}
        `.trim(),
      );

      const ssrFn = result.code.slice(result.code.indexOf('export function __ssr_SetDetailPage'));
      // useRouter() must NOT appear — excluded entirely
      expect(ssrFn).not.toContain('useRouter()');
      // router.current.value references must be rewritten to ctx.searchParams
      expect(ssrFn).not.toContain('router.current.value');
      // useParams() must be rewritten to ctx.params
      expect(ssrFn).toContain('ctx.params');
      expect(ssrFn).not.toContain('useParams');
      // searchParams references rewritten
      expect(ssrFn).toContain("ctx.searchParams?.get('page')");
    });

    it('emits useParams vars rewritten to ctx.params and search param vars rewritten to ctx.searchParams', () => {
      const result = compileForSSRAot(
        `
import { query, useParams, useRouter } from '@vertz/ui';

function SetDetailPage() {
  const { slug } = useParams();
  const router = useRouter();
  const page = parseInt(router.current.value?.searchParams?.get('page') || '1');
  const setQuery = query(async () => fetchSet(slug, page), { key: \`set-\${slug}-\${page}\` });
  if (!setQuery.data) return <div>Loading...</div>;
  return (
    <div>
      <h1>{setQuery.data.name}</h1>
      <span>Page {page} of {setQuery.data.totalPages}</span>
      <a href={'/sets/' + slug + '?page=' + (page + 1)}>Next</a>
    </div>
  );
}
        `.trim(),
      );

      const ssrFn = result.code.slice(result.code.indexOf('export function __ssr_SetDetailPage'));
      // useParams() must be rewritten to ctx.params
      expect(ssrFn).toContain('ctx.params');
      // useRouter() call must NOT appear
      expect(ssrFn).not.toContain('useRouter()');
      // router.current.value?.searchParams must be rewritten to ctx.searchParams
      expect(ssrFn).toContain('ctx.searchParams');
      // slug and page must be defined (not undefined at runtime)
      expect(ssrFn).toContain('slug');
      expect(ssrFn).toContain('page');
    });

    it('classifies component with search-params-only query key as AOT-eligible', () => {
      const result = compileForSSRAot(
        `
import { query, useRouter } from '@vertz/ui';

function SearchPage() {
  const router = useRouter();
  const q = router.current.value?.searchParams?.get('q') || '';
  const searchResults = query(async () => fetchSearch(q), { key: \`search-\${q}\` });
  return <div>{searchResults.data.length} results</div>;
}
        `.trim(),
      );

      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.tier).not.toBe('runtime-fallback');
      // The source has `|| ''` so default is empty string, encoded as ${sp:q|}
      expect(result.components[0]!.queryKeys).toEqual(['search-${sp:q|}']);
    });

    it('encodes || undefined default as ${sp:name|undefined} in query keys', () => {
      const result = compileForSSRAot(
        `
import { query, useRouter } from '@vertz/ui';

function SearchPage() {
  const router = useRouter();
  const q = router.current.value?.searchParams?.get('q') || undefined;
  const game = router.current.value?.searchParams?.get('game') || undefined;
  const sort = router.current.value?.searchParams?.get('sort') || undefined;
  const order = router.current.value?.searchParams?.get('order') || 'asc';
  const page = parseInt(router.current.value?.searchParams?.get('page') || '1');
  const results = query(async () => fetchSearch(q, game, sort, order, page), {
    key: \`search-\${q}-\${game}-\${sort}-\${order}-\${page}\`,
  });
  return <div>{results.data.length} results</div>;
}
        `.trim(),
      );

      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.tier).not.toBe('runtime-fallback');
      // || undefined produces "undefined" string in template literals
      // || 'asc' and || '1' produce string defaults
      expect(result.components[0]!.queryKeys).toEqual([
        'search-${sp:q|undefined}-${sp:game|undefined}-${sp:sort|undefined}-${sp:order|asc}-${sp:page|1}',
      ]);
    });

    it('generates || "undefined" in getData for search params with || undefined default', () => {
      const result = compileForSSRAot(
        `
import { query, useRouter } from '@vertz/ui';

function SearchPage() {
  const router = useRouter();
  const q = router.current.value?.searchParams?.get('q') || undefined;
  const results = query(async () => fetchSearch(q), { key: \`search-\${q}\` });
  return <div>{results.data.length} results</div>;
}
        `.trim(),
      );

      const ssrFnText = result.code;
      // The generated getData key must use || 'undefined' to match runtime behavior
      // where `${undefined}` produces the string "undefined"
      expect(ssrFnText).toContain("ctx.searchParams?.get('q') || 'undefined'");
    });

    it('falls back to runtime-fallback when query() has no extractable key', () => {
      const result = compileForSSRAot(
        `
import { query } from '@vertz/ui';

function SearchPage() {
  const results = query(async () => fetchResults());
  return <div>{results.data}</div>;
}
        `.trim(),
      );

      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.tier).toBe('runtime-fallback');
    });
  });

  describe('Given a .map() callback with inner variable definitions', () => {
    it('Then falls back to __esc() instead of generating broken arrow function', () => {
      const result = compileForSSRAot(
        `
function CardList({ listings, sellerMap }: { listings: any[]; sellerMap: Map<string, any> }) {
  return (
    <div>
      {listings.map((listing) => {
        const seller = sellerMap.get(listing.sellerId);
        return (
          <tr key={listing.id}>
            <td>{seller?.name || 'Unknown'}</td>
          </tr>
        );
      })}
    </div>
  );
}
        `.trim(),
      );

      expect(result.components).toHaveLength(1);
      const aotFn = extractAotFn(result.code, '__ssr_CardList');
      // The .map() callback now preserves block body with declarations
      expect(aotFn).toContain('<!--list-->');
      expect(aotFn).toContain('const seller');
      // Should NOT have a bare arrow that references `seller` without defining it
      expect(aotFn).not.toMatch(/\.map\(listing\s*=>\s*'<tr>/);
    });

    it('Then still optimizes simple .map() without variable declarations', () => {
      const result = compileForSSRAot(
        `
function SimpleList({ items }: { items: string[] }) {
  return <ul>{items.map(item => <li>{item}</li>)}</ul>;
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_SimpleList');
      // Simple .map() without closure vars should still be optimized with list markers
      expect(aotFn).toContain('<!--list-->');
      expect(aotFn).toContain('.map(');
      expect(aotFn).toContain(".join('')");
    });

    it('Then preserves block body with non-return statements in the generated callback', () => {
      const result = compileForSSRAot(
        `
function ListWithLog({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item) => {
        const upper = item.toUpperCase();
        return <li>{upper}</li>;
      })}
    </ul>
  );
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_ListWithLog');
      // Block body with declarations should now be preserved with list markers
      expect(aotFn).toContain('<!--list-->');
      expect(aotFn).toContain('const upper');
      expect(aotFn).toContain(".join('')");
    });

    it('Then optimizes .map() with block body containing ONLY a return statement', () => {
      const result = compileForSSRAot(
        `
function BlockReturnList({ items }: { items: string[] }) {
  return <ul>{items.map((item) => { return <li>{item}</li>; })}</ul>;
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_BlockReturnList');
      // Block body with only a return is safe to optimize
      expect(aotFn).toContain('<!--list-->');
      expect(aotFn).toContain('.map(');
    });
  });

  describe('Given a component with derived variables from query data (#1951)', () => {
    describe('When a simple query data alias is used', () => {
      it('Then still uses the existing alias replacement (no preamble entry)', () => {
        const result = compileForSSRAot(
          `
import { query } from '@vertz/ui';

export default function Page() {
  const q = query(async () => ({ name: 'x' }), { key: 'items' });
  const d = q.data;
  if (!d) return <div>Loading</div>;
  return <div>{d.name}</div>;
}
          `.trim(),
        );

        expect(result.components).toHaveLength(1);
        expect(result.components[0]!.tier).toBe('conditional');
        const aotFn = extractAotFn(result.code, '__ssr_Page');
        // d should be replaced with __q0 — no separate 'const d' in preamble
        expect(aotFn).not.toContain('const d');
        expect(aotFn).toContain('__q0');
      });
    });

    describe('When a non-query component has intermediate derived variables', () => {
      it('Then includes derived variable assignments referencing props', () => {
        const result = compileForSSRAot(
          `
function UserPage({ users }: { users: any[] }) {
  const userMap = new Map(users.map((u) => [u.id, u]));
  return <div>{userMap.get('abc')?.name}</div>;
}
          `.trim(),
        );

        expect(result.components).toHaveLength(1);
        expect(result.components[0]!.tier).not.toBe('runtime-fallback');
        const aotFn = extractAotFn(result.code, '__ssr_UserPage');
        expect(aotFn).toContain('const userMap');

        // Runtime correctness
        const html = evalAot(result.code, '__ssr_UserPage', {
          __props: { users: [{ id: 'abc', name: 'Alice' }] },
          users: [{ id: 'abc', name: 'Alice' }],
        });
        expect(html).toContain('Alice');
      });
    });

    describe('When a derived variable references another derived variable', () => {
      it('Then emits both in source-order so references resolve correctly', () => {
        const result = compileForSSRAot(
          `
import { query } from '@vertz/ui';

export default function Page() {
  const q = query(async () => ({ sellers: [] as any[] }), { key: 'items' });
  const d = q.data;
  if (!d) return <div>Loading</div>;

  const sellers = d.sellers.filter((s) => s.active);
  const sellerMap = new Map(sellers.map((s) => [s.id, s]));

  return <div>{sellerMap.size}</div>;
}
          `.trim(),
        );

        const aotFn = extractAotFn(result.code, '__ssr_Page');
        // Both derived vars must appear, in source order
        const sellersIdx = aotFn.indexOf('const sellers');
        const sellerMapIdx = aotFn.indexOf('const sellerMap');
        expect(sellersIdx).toBeGreaterThan(-1);
        expect(sellerMapIdx).toBeGreaterThan(sellersIdx);

        // Runtime correctness
        const html = evalAot(result.code, '__ssr_Page', {
          __ctx: createMockCtx({
            items: {
              sellers: [
                { id: '1', active: true },
                { id: '2', active: false },
              ],
            },
          }),
        });
        expect(html).toContain('1'); // Only 1 active seller
      });
    });

    describe('When a derived variable is computed from query data', () => {
      it('Then classifies the component as conditional (AOT-eligible)', () => {
        const result = compileForSSRAot(
          `
import { query } from '@vertz/ui';

export default function Page() {
  const q = query(async () => ({ sellers: [] as any[] }), { key: 'items' });
  const d = q.data;
  if (!d) return <div>Loading</div>;

  const sellerMap = new Map(d.sellers.map((s) => [s.id, s]));

  return <div>{sellerMap.size}</div>;
}
          `.trim(),
        );

        expect(result.components).toHaveLength(1);
        expect(result.components[0]!.tier).not.toBe('runtime-fallback');
      });

      it('Then includes the derived variable assignment in the AOT function preamble', () => {
        const result = compileForSSRAot(
          `
import { query } from '@vertz/ui';

export default function Page() {
  const q = query(async () => ({ sellers: [] as any[] }), { key: 'items' });
  const d = q.data;
  if (!d) return <div>Loading</div>;

  const sellerMap = new Map(d.sellers.map((s) => [s.id, s]));

  return <div>{sellerMap.size}</div>;
}
          `.trim(),
        );

        const aotFn = extractAotFn(result.code, '__ssr_Page');
        // The derived variable must appear in the function body
        expect(aotFn).toContain('const sellerMap');
        // The data alias 'd' must be replaced with __q0
        expect(aotFn).toContain('__q0.sellers.map');
      });

      it('Then the generated AOT function produces correct HTML at runtime', () => {
        const result = compileForSSRAot(
          `
import { query } from '@vertz/ui';

export default function Page() {
  const q = query(async () => ({ sellers: [] as any[] }), { key: 'items' });
  const d = q.data;
  if (!d) return <div>Loading</div>;

  const sellerMap = new Map(d.sellers.map((s) => [s.id, s]));

  return <div>{sellerMap.size}</div>;
}
          `.trim(),
        );

        // Runtime: loading branch
        const loadingHtml = evalAot(result.code, '__ssr_Page', {
          __ctx: createMockCtx({ items: null }),
        });
        expect(loadingHtml).toContain('Loading');

        // Runtime: main branch with data
        const mainHtml = evalAot(result.code, '__ssr_Page', {
          __ctx: createMockCtx({
            items: {
              sellers: [
                { id: '1', name: 'Alice' },
                { id: '2', name: 'Bob' },
              ],
            },
          }),
        });
        expect(mainHtml).toContain('2'); // sellerMap.size === 2
      });
    });
  });

  describe('Phase 2: .map() callback block body preservation', () => {
    describe('When the block body has const declarations before the return', () => {
      it('Then preserves the declarations and converts JSX to string concatenation', () => {
        const result = compileForSSRAot(
          `
function CardList({ listings, sellerMap }: { listings: any[]; sellerMap: Map<string, any> }) {
  return (
    <div>
      {listings.map((listing) => {
        const seller = sellerMap.get(listing.sellerId);
        return (
          <tr key={listing.id}>
            <td>{seller?.name || 'Unknown'}</td>
          </tr>
        );
      })}
    </div>
  );
}
          `.trim(),
        );

        const aotFn = extractAotFn(result.code, '__ssr_CardList');
        // Must have list markers
        expect(aotFn).toContain('<!--list-->');
        expect(aotFn).toContain('<!--/list-->');
        // Must preserve the const declaration (props are rewritten to __props.*)
        expect(aotFn).toContain('const seller');
        expect(aotFn).toContain('.get(listing.sellerId)');
        // Must NOT use __esc() fallback for the whole .map()
        expect(aotFn).not.toMatch(/__esc\(.*\.map/);
      });

      it('Then produces correct HTML at runtime', () => {
        const result = compileForSSRAot(
          `
function CardList({ listings, sellerMap }: { listings: any[]; sellerMap: Map<string, any> }) {
  return (
    <div>
      {listings.map((listing) => {
        const seller = sellerMap.get(listing.sellerId);
        return (
          <tr key={listing.id}>
            <td>{seller?.name || 'Unknown'}</td>
          </tr>
        );
      })}
    </div>
  );
}
          `.trim(),
        );

        const sellerMap = new Map([['s1', { name: 'Alice' }]]);
        const html = evalAot(result.code, '__ssr_CardList', {
          __props: {
            listings: [
              { id: 'L1', sellerId: 's1' },
              { id: 'L2', sellerId: 'nope' },
            ],
            sellerMap,
          },
          listings: [
            { id: 'L1', sellerId: 's1' },
            { id: 'L2', sellerId: 'nope' },
          ],
          sellerMap,
        });
        expect(html).toContain('Alice');
        expect(html).toContain('Unknown');
      });
    });

    describe('When the block body has multiple variable declarations', () => {
      it('Then preserves all declarations in order', () => {
        const result = compileForSSRAot(
          `
function List({ items }: { items: any[] }) {
  return (
    <ul>
      {items.map((item) => {
        const upper = item.name.toUpperCase();
        const label = upper + ' (' + item.id + ')';
        return <li>{label}</li>;
      })}
    </ul>
  );
}
          `.trim(),
        );

        const aotFn = extractAotFn(result.code, '__ssr_List');
        expect(aotFn).toContain('<!--list-->');
        expect(aotFn).toContain('const upper');
        expect(aotFn).toContain('const label');
        // Verify order
        const upperIdx = aotFn.indexOf('const upper');
        const labelIdx = aotFn.indexOf('const label');
        expect(labelIdx).toBeGreaterThan(upperIdx);
      });
    });
  });

  describe('Phase 3: if-else chain flattening', () => {
    describe('When both branches of if-else return JSX', () => {
      it('Then classifies as conditional (not runtime-fallback)', () => {
        const result = compileForSSRAot(
          `
export default function StatusPage({ status }: { status: string }) {
  if (status === 'error') return <div>Error occurred</div>;
  else return <div>All good</div>;
}
          `.trim(),
        );

        expect(result.components).toHaveLength(1);
        expect(result.components[0]!.tier).toBe('conditional');
      });

      it('Then generates a ternary and produces correct HTML at runtime', () => {
        const result = compileForSSRAot(
          `
export default function StatusPage({ status }: { status: string }) {
  if (status === 'error') return <div>Error</div>;
  else return <div>OK</div>;
}
          `.trim(),
        );

        const aotFn = extractAotFn(result.code, '__ssr_StatusPage');
        expect(aotFn).toContain('<!--conditional-->');
        expect(aotFn).toContain('Error');
        expect(aotFn).toContain('OK');

        const errorHtml = evalAot(result.code, '__ssr_StatusPage', {
          __props: { status: 'error' },
          status: 'error',
        });
        expect(errorHtml).toContain('Error');
        expect(errorHtml).not.toContain('OK');

        const okHtml = evalAot(result.code, '__ssr_StatusPage', {
          __props: { status: 'ok' },
          status: 'ok',
        });
        expect(okHtml).toContain('OK');
      });
    });

    describe('When there are if-else-if chains', () => {
      it('Then generates nested ternaries', () => {
        const result = compileForSSRAot(
          `
export default function StatusPage({ status }: { status: string }) {
  if (status === 'error') return <div>Error</div>;
  else if (status === 'loading') return <div>Loading</div>;
  else return <div>Ready</div>;
}
          `.trim(),
        );

        expect(result.components[0]!.tier).toBe('conditional');
        const aotFn = extractAotFn(result.code, '__ssr_StatusPage');
        expect(aotFn).toContain('Error');
        expect(aotFn).toContain('Loading');
        expect(aotFn).toContain('Ready');
      });
    });

    describe('When an if-else has nested ifs inside a branch', () => {
      it('Then falls back to runtime-fallback (unsafe to flatten)', () => {
        const result = compileForSSRAot(
          `
export default function StatusPage({ status, detail }: { status: string; detail: string }) {
  if (status === 'error') {
    if (detail === 'critical') return <div>Critical</div>;
    return <div>Error</div>;
  } else {
    return <div>OK</div>;
  }
}
          `.trim(),
        );

        // Nested ifs inside a branch make flat ternary flattening unsafe.
        // Neither if-else flattening nor guard pattern handles nested ifs,
        // so the component correctly falls back to runtime.
        expect(result.components).toHaveLength(1);
        expect(result.components[0]!.tier).toBe('runtime-fallback');
      });
    });

    describe('When if-else-if branches use block bodies', () => {
      it('Then generates nested ternaries from block-body returns', () => {
        const result = compileForSSRAot(
          `
export default function StatusPage({ status }: { status: string }) {
  if (status === 'error') {
    return <div>Error</div>;
  } else if (status === 'loading') {
    return <div>Loading</div>;
  } else {
    return <div>Ready</div>;
  }
}
          `.trim(),
        );

        expect(result.components[0]!.tier).toBe('conditional');
        const aotFn = extractAotFn(result.code, '__ssr_StatusPage');
        expect(aotFn).toContain('Error');
        expect(aotFn).toContain('Loading');
        expect(aotFn).toContain('Ready');
      });
    });
  });

  describe('Phase 4: || and ?? binary operator support', () => {
    describe('When right operand of || is JSX', () => {
      it('Then generates conditional: truthy shows escaped value, falsy shows JSX', () => {
        const result = compileForSSRAot(
          `
export default function NameDisplay({ name }: { name: string | null }) {
  return <div>{name || <span>Anonymous</span>}</div>;
}
          `.trim(),
        );

        expect(result.components[0]!.tier).toBe('conditional');
        const aotFn = extractAotFn(result.code, '__ssr_NameDisplay');
        expect(aotFn).toContain('<!--conditional-->');
        expect(aotFn).toContain('Anonymous');

        // When name is truthy, show name
        const htmlWithName = evalAot(result.code, '__ssr_NameDisplay', {
          __props: { name: 'Alice' },
          name: 'Alice',
        });
        expect(htmlWithName).toContain('Alice');
        expect(htmlWithName).not.toContain('Anonymous');

        // When name is falsy, show fallback JSX
        const htmlWithout = evalAot(result.code, '__ssr_NameDisplay', {
          __props: { name: '' },
          name: '',
        });
        expect(htmlWithout).toContain('Anonymous');
      });
    });

    describe('When right operand of || is NOT JSX', () => {
      it('Then falls back to __esc() wrapping (existing behavior)', () => {
        const result = compileForSSRAot(
          `
export default function Label({ text }: { text: string | null }) {
  return <div>{text || 'default'}</div>;
}
          `.trim(),
        );

        const aotFn = extractAotFn(result.code, '__ssr_Label');
        // Should use __esc, not conditional markers
        expect(aotFn).toContain('__esc(');
        expect(aotFn).not.toContain('<!--conditional-->');
      });
    });

    describe('When right operand of ?? is JSX', () => {
      it('Then generates conditional: non-nullish shows escaped value, nullish shows JSX', () => {
        const result = compileForSSRAot(
          `
export default function ValueDisplay({ value }: { value: number | null }) {
  return <div>{value ?? <span>N/A</span>}</div>;
}
          `.trim(),
        );

        expect(result.components[0]!.tier).toBe('conditional');
        const aotFn = extractAotFn(result.code, '__ssr_ValueDisplay');
        expect(aotFn).toContain('<!--conditional-->');
        expect(aotFn).toContain('!= null');

        // When value is non-nullish (including 0), show value
        const htmlWithZero = evalAot(result.code, '__ssr_ValueDisplay', {
          __props: { value: 0 },
          value: 0,
        });
        expect(htmlWithZero).toContain('0');
        expect(htmlWithZero).not.toContain('N/A');

        // When value is null, show fallback JSX
        const htmlNull = evalAot(result.code, '__ssr_ValueDisplay', {
          __props: { value: null },
          value: null,
        });
        expect(htmlNull).toContain('N/A');
      });
    });

    describe('When right operand of ?? is NOT JSX', () => {
      it('Then falls back to __esc() wrapping (existing behavior)', () => {
        const result = compileForSSRAot(
          `
export default function Label({ text }: { text: string | null }) {
  return <div>{text ?? 'fallback'}</div>;
}
          `.trim(),
        );

        const aotFn = extractAotFn(result.code, '__ssr_Label');
        expect(aotFn).toContain('__esc(');
        expect(aotFn).not.toContain('<!--conditional-->');
      });
    });
  });

  describe('Imported component holes (#1981)', () => {
    it('generates ctx.holes.* for imported components instead of __ssr_* calls', () => {
      const result = compileForSSRAot(
        `
import { RouterView } from '@vertz/ui';

function App({ router }: { router: unknown }) {
  return <div class="app"><RouterView router={router} /></div>;
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_App');
      // Should use ctx.holes for imported component — NOT __ssr_RouterView
      expect(aotFn).toContain('ctx.holes.RouterView()');
      expect(aotFn).not.toContain('__ssr_RouterView');
    });

    it('keeps __ssr_* calls for locally-defined components in the same file', () => {
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

      const aotFn = extractAotFn(result.code, '__ssr_Card');
      // Badge is local → direct __ssr_ call (preserves props passing)
      expect(aotFn).toContain('__ssr_Badge(');
      expect(aotFn).not.toContain('ctx.holes.Badge');
    });

    it('adds ctx parameter when component has imported holes (even without queries)', () => {
      const result = compileForSSRAot(
        `
import { RouterView } from '@vertz/ui';

function App() {
  return <div><RouterView /></div>;
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_App');
      // Must have ctx parameter to access ctx.holes
      expect(aotFn).toContain('ctx');
      expect(aotFn).toContain('ctx.holes.RouterView()');
    });

    it('distinguishes local vs imported holes in the same component', () => {
      const result = compileForSSRAot(
        `
import { ThemeProvider } from '@vertz/ui';

function Sidebar({ items }: { items: string[] }) {
  return <aside>{items.join(', ')}</aside>;
}

function App() {
  return (
    <div>
      <ThemeProvider />
      <Sidebar items={['a', 'b']} />
    </div>
  );
}
        `.trim(),
      );

      const aotFn = extractAotFn(result.code, '__ssr_App');
      // ThemeProvider is imported → ctx.holes
      expect(aotFn).toContain('ctx.holes.ThemeProvider()');
      // Sidebar is local → direct __ssr_ call
      expect(aotFn).toContain('__ssr_Sidebar(');
    });

    it('tracks only imported components as external holes in metadata', () => {
      const result = compileForSSRAot(
        `
import { RouterView } from '@vertz/ui';

function Badge({ text }: { text: string }) {
  return <span>{text}</span>;
}

function App() {
  return <div><RouterView /><Badge text="hi" /></div>;
}
        `.trim(),
      );

      const appInfo = result.components.find((c) => c.name === 'App');
      // Both are holes, but holes array tracks all referenced components
      expect(appInfo!.holes).toContain('RouterView');
      expect(appInfo!.holes).toContain('Badge');
    });
  });

  describe('CSS class name inlining (#1985)', () => {
    it('inlines css() class names in __ssr_* functions instead of referencing module-level variables', () => {
      const result = compileForSSRAot(
        `
import { css } from '@vertz/ui';

const s = css({
  root: ['bg:background', 'p:6'],
  header: ['font:xl', 'text:foreground'],
});

function App() {
  return (
    <div className={s.root}>
      <h1 className={s.header}>Title</h1>
    </div>
  );
}
        `.trim(),
        { filename: 'src/app.tsx' },
      );

      const appInfo = result.components.find((c) => c.name === 'App');
      expect(appInfo).toBeDefined();
      expect(appInfo!.tier).not.toBe('runtime-fallback');

      // The __ssr_App function should NOT reference s.root or s.header
      const ssrFn = result.code.match(/export function __ssr_App[\s\S]*?\n\}/)?.[0] ?? '';
      expect(ssrFn).not.toContain('s.root');
      expect(ssrFn).not.toContain('s.header');

      // It should contain literal class names (8-hex-char hashes prefixed with _)
      expect(ssrFn).toMatch(/_[0-9a-f]{8}/);
    });

    it('inlines css() class names used in ternary expressions', () => {
      const result = compileForSSRAot(
        `
import { css } from '@vertz/ui';

const s = css({
  active: ['bg:primary'],
  inactive: ['bg:muted'],
});

function Tab({ isActive }: { isActive: boolean }) {
  return <div className={isActive ? s.active : s.inactive}>Tab</div>;
}
        `.trim(),
        { filename: 'src/tab.tsx' },
      );

      const ssrFn = result.code.match(/export function __ssr_Tab[\s\S]*?\n\}/)?.[0] ?? '';
      expect(ssrFn).not.toContain('s.active');
      expect(ssrFn).not.toContain('s.inactive');
    });

    it('handles multiple css() calls in the same file', () => {
      const result = compileForSSRAot(
        `
import { css } from '@vertz/ui';

const card = css({ root: ['p:4'] });
const badge = css({ root: ['m:2'] });

function Card() {
  return <div className={card.root}><span className={badge.root}>New</span></div>;
}
        `.trim(),
        { filename: 'src/card.tsx' },
      );

      const ssrFn = result.code.match(/export function __ssr_Card[\s\S]*?\n\}/)?.[0] ?? '';
      expect(ssrFn).not.toContain('card.root');
      expect(ssrFn).not.toContain('badge.root');
    });

    it('produces self-contained __ssr_* functions that execute without css() imports', () => {
      const result = compileForSSRAot(
        `
import { css } from '@vertz/ui';

const s = css({
  wrapper: ['flex', 'gap:4'],
  title: ['font:lg', 'font:semibold'],
});

function Header({ title }: { title: string }) {
  return (
    <header className={s.wrapper}>
      <h1 className={s.title}>{title}</h1>
    </header>
  );
}
        `.trim(),
        { filename: 'src/header.tsx' },
      );

      // The __ssr_* function should NOT reference the css variable (s.wrapper, s.title)
      const ssrFn = result.code.match(/export function __ssr_Header[\s\S]*?\n\}/)?.[0] ?? '';
      // Use word-boundary regex to avoid matching __props.title as containing 's.title'
      expect(ssrFn).not.toMatch(/\bs\.wrapper\b/);
      expect(ssrFn).not.toMatch(/\bs\.title\b/);

      // Verify the function is self-contained by eval'ing it.
      // Strip TS types and use runtime helpers for the eval context.
      const evalCode = ssrFn
        .replace(/^export /, '')
        // Strip TS return type annotation: ): string { → ) {
        .replace(/\):\s*string\s*\{/, ') {')
        .replace(/__esc_attr\(/g, 'String(')
        .replace(/__esc\(/g, 'String(');
      const fn = new Function(`${evalCode}; return __ssr_Header({ title: 'Hello' });`);
      const html = fn();
      expect(html).toContain('Hello');
      // Should contain an inlined class name, not 's.wrapper'
      expect(html).toMatch(/_[0-9a-f]{8}/);
    });
  });

  describe('CSS extraction for AOT manifest (#1989)', () => {
    it('extracts CSS rule blocks from static css() calls', () => {
      const result = compileForSSRAot(
        `
import { css } from '@vertz/ui';

const s = css({
  root: ['bg:background', 'p:6'],
  header: ['font:xl', 'text:foreground'],
});

function App() {
  return (
    <div className={s.root}>
      <h1 className={s.header}>Title</h1>
    </div>
  );
}
        `.trim(),
        { filename: 'src/app.tsx' },
      );

      // css field should be an array of individual CSS rule blocks
      expect(result.css).toBeDefined();
      expect(Array.isArray(result.css)).toBe(true);
      expect(result.css!.length).toBeGreaterThanOrEqual(2); // at least root + header

      // Each rule block should be a valid CSS rule with class selector and declarations
      for (const rule of result.css!) {
        expect(rule).toMatch(/\._[0-9a-f]{8}/); // class selector
        expect(rule).toContain('{');
        expect(rule).toContain('}');
      }

      // Root rule should contain background-color and padding
      const rootRule = result.css!.find((r) => r.includes('background-color'));
      expect(rootRule).toBeDefined();
      expect(rootRule).toContain('padding');

      // Header rule should contain font-size and color
      const headerRule = result.css!.find((r) => r.includes('font-size'));
      expect(headerRule).toBeDefined();
      expect(headerRule).toContain('color');
    });

    it('extracted CSS class names match inlined class names in __ssr_* functions', () => {
      const result = compileForSSRAot(
        `
import { css } from '@vertz/ui';

const s = css({
  wrapper: ['flex', 'gap:4'],
  title: ['font:lg', 'font:semibold'],
});

function Header({ title }: { title: string }) {
  return (
    <header className={s.wrapper}>
      <h1 className={s.title}>{title}</h1>
    </header>
  );
}
        `.trim(),
        { filename: 'src/header.tsx' },
      );

      expect(result.css).toBeDefined();
      expect(result.css!.length).toBeGreaterThan(0);

      // Extract class names from CSS rules
      const cssClassNames = new Set<string>();
      for (const rule of result.css!) {
        const matches = rule.matchAll(/\.(_[0-9a-f]{8})/g);
        for (const m of matches) cssClassNames.add(m[1]!);
      }

      // Extract class names from __ssr_* function
      const ssrFn = result.code.match(/export function __ssr_Header[\s\S]*?\n\}/)?.[0] ?? '';
      const ssrClassNames = new Set<string>();
      const ssrMatches = ssrFn.matchAll(/(_[0-9a-f]{8})/g);
      for (const m of ssrMatches) ssrClassNames.add(m[1]!);

      // Every class name in the SSR function must have a corresponding CSS rule
      expect(ssrClassNames.size).toBeGreaterThan(0);
      for (const cls of ssrClassNames) {
        expect(cssClassNames.has(cls)).toBe(true);
      }
    });

    it('returns undefined css for files with no css() calls', () => {
      const result = compileForSSRAot(
        `
function Simple() {
  return <div>Hello</div>;
}
        `.trim(),
        { filename: 'src/simple.tsx' },
      );

      expect(result.css).toBeUndefined();
    });

    it('extracts CSS from @vertz-no-aot components', () => {
      const result = compileForSSRAot(
        `
// @vertz-no-aot
import { css } from '@vertz/ui';

const s = css({
  root: ['p:4'],
});

export function Widget() {
  return <div className={s.root}>Widget</div>;
}
        `.trim(),
        { filename: 'src/widget.tsx' },
      );

      expect(result.components[0]!.tier).toBe('runtime-fallback');
      expect(result.css).toBeDefined();
      expect(Array.isArray(result.css)).toBe(true);
      expect(result.css!.length).toBeGreaterThan(0);
      expect(result.css!.some((r) => r.includes('padding'))).toBe(true);
    });
  });
});
