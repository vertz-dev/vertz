import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const NATIVE_MODULE_PATH = join(
  import.meta.dir,
  '..',
  'vertz-compiler.darwin-arm64.node',
);

interface AotComponentInfo {
  name: string;
  tier: string;
  holes: string[];
  queryKeys: string[];
}

interface AotCompileResult {
  code: string;
  components: AotComponentInfo[];
}

function loadCompiler() {
  return require(NATIVE_MODULE_PATH) as {
    compileForSsrAot: (
      source: string,
      options?: { filename?: string },
    ) => AotCompileResult;
  };
}

function compileAot(source: string, filename = 'input.tsx') {
  const { compileForSsrAot } = loadCompiler();
  return compileForSsrAot(source, { filename });
}

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

/** Evaluate the generated AOT function by extracting and running __ssr_* functions. */
function evalAot(
  code: string,
  fnName: string,
  args: Record<string, unknown> = {},
): string {
  // Extract all __ssr_* function declarations from generated code
  const fnRegex =
    /(?:export\s+)?function\s+(__ssr_\w+)\s*\([^)]*\)\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}/g;
  const fns: string[] = [];
  let match;
  while ((match = fnRegex.exec(code)) !== null) {
    // Strip export keyword and type annotations
    let fn = match[0]
      .replace(/^export\s+/, '')
      .replace(/\)\s*:\s*string\s*\{/, ') {');
    fns.push(fn);
  }

  const aotCode = fns.join('\n');
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
  const fn = wrapper(
    __esc,
    __esc_attr,
    __ssr_spread,
    __ssr_style_object,
    ...argValues,
  );

  if (args.__ctx) {
    return fn(args.__data ?? {}, args.__ctx);
  }
  return fn(args.__props ?? {});
}

describe('compileForSsrAot() — native AOT SSR', () => {
  describe('Tier 1: static components', () => {
    it('Then compiles static HTML to string concatenation', () => {
      const result = compileAot(`
function Footer() {
  return <footer class="app-footer"><p>Built with Vertz</p></footer>;
}
      `.trim());

      expect(result.code).toContain('__ssr_Footer');
      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.name).toBe('Footer');
      expect(result.components[0]!.tier).toBe('static');
      expect(result.components[0]!.holes).toEqual([]);

      const html = evalAot(result.code, '__ssr_Footer');
      expect(html).toBe(
        '<footer class="app-footer"><p>Built with Vertz</p></footer>',
      );
    });

    it('Then handles void elements (no closing tag)', () => {
      const result = compileAot(`
function Form() {
  return <div><input type="text" name="title" disabled /><br /><hr /></div>;
}
      `.trim());

      const html = evalAot(result.code, '__ssr_Form');
      expect(html).toBe(
        '<div><input type="text" name="title" disabled><br><hr></div>',
      );
    });

    it('Then handles fragments', () => {
      const result = compileAot(`
function Badges() {
  return <><span class="open">Open</span><span class="closed">Closed</span></>;
}
      `.trim());

      const html = evalAot(result.code, '__ssr_Badges');
      expect(html).toBe(
        '<span class="open">Open</span><span class="closed">Closed</span>',
      );
    });

    it('Then returns empty components for non-component files', () => {
      const result = compileAot('const x = 42;');
      expect(result.components).toHaveLength(0);
      expect(result.code).toBe('const x = 42;');
    });
  });

  describe('Tier 2: data-driven components', () => {
    it('Then escapes dynamic text content with __esc()', () => {
      const result = compileAot(`
function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}!</h1>;
}
      `.trim());

      expect(result.code).toContain('__esc(');
      expect(result.components[0]!.tier).toBe('data-driven');

      const html = evalAot(result.code, '__ssr_Greeting', {
        __props: { name: 'World' },
      });
      expect(html).toBe('<h1>Hello, World!</h1>');
    });

    it('Then escapes HTML special characters in text', () => {
      const result = compileAot(`
function Greeting({ name }: { name: string }) {
  return <span>{name}</span>;
}
      `.trim());

      const html = evalAot(result.code, '__ssr_Greeting', {
        __props: { name: '<script>alert("xss")</script>' },
      });
      expect(html).toBe(
        '<span>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</span>',
      );
    });

    it('Then escapes dynamic attribute values with __esc_attr()', () => {
      const result = compileAot(`
function Card({ id }: { id: string }) {
  return <div data-testid={id}>card</div>;
}
      `.trim());

      expect(result.code).toContain('__esc_attr(');

      const html = evalAot(result.code, '__ssr_Card', {
        __props: { id: 'card-1' },
      });
      expect(html).toBe('<div data-testid="card-1">card</div>');
    });

    it('Then maps className to class attribute', () => {
      const result = compileAot(`
function Box({ cls }: { cls: string }) {
  return <div className={cls}>content</div>;
}
      `.trim());

      expect(result.code).not.toMatch(/__ssr_Box[^]*className/);
      const html = evalAot(result.code, '__ssr_Box', {
        __props: { cls: 'my-box' },
      });
      expect(html).toBe('<div class="my-box">content</div>');
    });

    it('Then maps htmlFor to for attribute', () => {
      const result = compileAot(`
function Field({ fieldId }: { fieldId: string }) {
  return <label htmlFor={fieldId}>Label</label>;
}
      `.trim());

      expect(result.code).not.toMatch(/__ssr_Field[^]*htmlFor/);
      const html = evalAot(result.code, '__ssr_Field', {
        __props: { fieldId: 'name' },
      });
      expect(html).toBe('<label for="name">Label</label>');
    });

    it('Then strips event handlers from output', () => {
      const result = compileAot(`
function Button({ label }: { label: string }) {
  return <button onClick={() => {}}>{label}</button>;
}
      `.trim());

      expect(result.code).not.toMatch(/__ssr_Button[^]*onClick/);
      const html = evalAot(result.code, '__ssr_Button', {
        __props: { label: 'Click' },
      });
      expect(html).toBe('<button>Click</button>');
    });
  });

  describe('Tier 3: conditional/dynamic components', () => {
    it('Then handles ternary conditionals with markers', () => {
      const result = compileAot(`
function Status({ isOnline }: { isOnline: boolean }) {
  return <div>{isOnline ? <span class="on">Online</span> : <span class="off">Offline</span>}</div>;
}
      `.trim());

      expect(result.components[0]!.tier).toBe('conditional');

      const htmlOn = evalAot(result.code, '__ssr_Status', {
        __props: { isOnline: true },
      });
      expect(htmlOn).toContain(
        '<!--conditional--><span class="on">Online</span><!--/conditional-->',
      );

      const htmlOff = evalAot(result.code, '__ssr_Status', {
        __props: { isOnline: false },
      });
      expect(htmlOff).toContain(
        '<!--conditional--><span class="off">Offline</span><!--/conditional-->',
      );
    });

    it('Then handles && conditionals with markers', () => {
      const result = compileAot(`
function Alert({ message }: { message: string | null }) {
  return <div>{message && <span class="alert">{message}</span>}</div>;
}
      `.trim());

      expect(result.components[0]!.tier).toBe('conditional');

      const htmlWith = evalAot(result.code, '__ssr_Alert', {
        __props: { message: 'Error!' },
      });
      expect(htmlWith).toContain(
        '<!--conditional--><span class="alert">Error!</span><!--/conditional-->',
      );

      const htmlWithout = evalAot(result.code, '__ssr_Alert', {
        __props: { message: null },
      });
      expect(htmlWithout).toContain('<!--conditional--><!--/conditional-->');
    });

    it('Then handles list rendering with .map()', () => {
      const result = compileAot(`
function List({ items }: { items: string[] }) {
  return <ul>{items.map(item => <li>{item}</li>)}</ul>;
}
      `.trim());

      expect(result.components[0]!.tier).toBe('conditional');

      const html = evalAot(result.code, '__ssr_List', {
        __props: { items: ['A', 'B', 'C'] },
      });
      expect(html).toBe(
        '<ul><!--list--><li>A</li><li>B</li><li>C</li><!--/list--></ul>',
      );
    });

    it('Then handles interactive components with data-v-id and child markers', () => {
      const result = compileAot(`
function Counter({ initial }: { initial: number }) {
  let count = initial;
  return <button>{count}</button>;
}
      `.trim());

      expect(result.code).toContain('data-v-id="Counter"');
      expect(result.code).toContain('<!--child-->');
      expect(result.code).toContain('<!--/child-->');
    });
  });

  describe('Component calls and holes', () => {
    it('Then calls child components as __ssr_* functions', () => {
      const result = compileAot(`
function Badge({ text }: { text: string }) {
  return <span class="badge">{text}</span>;
}

function Card({ title }: { title: string }) {
  return <div class="card"><Badge text={title} /></div>;
}
      `.trim());

      expect(result.code).toContain('__ssr_Badge(');
      const cardInfo = result.components.find((c) => c.name === 'Card');
      expect(cardInfo!.holes).toContain('Badge');
    });
  });

  describe('Spread attributes', () => {
    it('Then handles spread attributes with __ssr_spread()', () => {
      const result = compileAot(`
function Box({ className, ...rest }: { className: string; [key: string]: unknown }) {
  return <div className={className} {...rest}>content</div>;
}
      `.trim());

      expect(result.code).toContain('__ssr_spread(');
    });
  });

  describe('Boolean attributes', () => {
    it('Then handles dynamic boolean attributes correctly', () => {
      const result = compileAot(`
function Toggle({ isDisabled }: { isDisabled: boolean }) {
  return <button disabled={isDisabled}>Click</button>;
}
      `.trim());

      const htmlEnabled = evalAot(result.code, '__ssr_Toggle', {
        __props: { isDisabled: false },
      });
      expect(htmlEnabled).toBe('<button>Click</button>');

      const htmlDisabled = evalAot(result.code, '__ssr_Toggle', {
        __props: { isDisabled: true },
      });
      expect(htmlDisabled).toBe('<button disabled>Click</button>');
    });
  });

  describe('Guard patterns', () => {
    it('Then classifies guard pattern (if-return + main return) as conditional', () => {
      const result = compileAot(`
function Comp({ loading }: { loading: boolean }) {
  if (loading) return <div>Loading...</div>;
  return <div>Content</div>;
}
      `.trim());

      expect(result.components[0]!.tier).toBe('conditional');
      expect(result.code).toContain('__ssr_Comp');
    });

    it('Then classifies non-guard multiple returns as runtime-fallback', () => {
      const result = compileAot(`
function Comp({ x }: { x: number }) {
  try { return <div>OK</div>; }
  catch { return <div>Error</div>; }
}
      `.trim());

      expect(result.components[0]!.tier).toBe('runtime-fallback');
      expect(result.code).not.toContain('__ssr_Comp');
    });
  });

  describe('@vertz-no-aot pragma', () => {
    it('Then skips AOT compilation when pragma is present', () => {
      const result = compileAot(`
// @vertz-no-aot
function Widget({ data }: { data: string }) {
  return <div>{data}</div>;
}
      `.trim());

      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.tier).toBe('runtime-fallback');
      expect(result.code).not.toContain('__ssr_Widget');
    });
  });

  describe('Style objects and dangerouslySetInnerHTML', () => {
    it('Then handles style objects with __ssr_style_object()', () => {
      const result = compileAot(`
function Styled({ bg }: { bg: string }) {
  return <div style={{ backgroundColor: bg }}>content</div>;
}
      `.trim());

      expect(result.code).toContain('__ssr_style_object(');
    });

    it('Then handles dangerouslySetInnerHTML as raw child content', () => {
      const result = compileAot(`
function RawContent({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
      `.trim());

      expect(result.code).not.toMatch(
        /__ssr_RawContent[^]*dangerouslySetInnerHTML/,
      );
      const output = evalAot(result.code, '__ssr_RawContent', {
        __props: { html: '<strong>bold</strong>' },
      });
      expect(output).toBe('<div><strong>bold</strong></div>');
    });
  });

  describe('Query-sourced variables', () => {
    it('Then emits queryKeys for query() variables', () => {
      const result = compileAot(`
import { query } from '@vertz/ui';

function ProjectsPage() {
  const projects = query(api.projects.list());
  return <div>{projects.data}</div>;
}
      `.trim());

      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.queryKeys).toEqual(['projects-list']);
    });

    it('Then replaces query().data with ctx.getData(key)', () => {
      const result = compileAot(`
import { query } from '@vertz/ui';

function ProjectsPage() {
  const projects = query(api.projects.list());
  return <div>{projects.data}</div>;
}
      `.trim());

      expect(result.code).toContain("ctx.getData('projects-list')");
      expect(result.code).not.toMatch(/__ssr_ProjectsPage[^]*projects\.data/);
    });

    it('Then falls back to runtime-fallback when query() has no extractable key', () => {
      const result = compileAot(`
import { query } from '@vertz/ui';

function SearchPage() {
  const results = query(async () => fetchResults());
  return <div>{results.data}</div>;
}
      `.trim());

      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.tier).toBe('runtime-fallback');
    });
  });

  describe('Multiple components', () => {
    it('Then handles multiple components in one file', () => {
      const result = compileAot(`
function Header() {
  return <header>Title</header>;
}

function Footer() {
  return <footer>Copyright</footer>;
}
      `.trim());

      expect(result.components).toHaveLength(2);
      expect(result.components[0]!.name).toBe('Header');
      expect(result.components[1]!.name).toBe('Footer');

      const headerHtml = evalAot(result.code, '__ssr_Header');
      expect(headerHtml).toBe('<header>Title</header>');

      const footerHtml = evalAot(result.code, '__ssr_Footer');
      expect(footerHtml).toBe('<footer>Copyright</footer>');
    });
  });

  describe('Self-closing non-void elements', () => {
    it('Then renders closing tags for non-void self-closing elements', () => {
      const result = compileAot(`
function Empty() {
  return <div />;
}
      `.trim());

      const html = evalAot(result.code, '__ssr_Empty');
      expect(html).toBe('<div></div>');
    });
  });

  describe('.map() with closure variables (#1936)', () => {
    it('Then falls back to __esc() when block body has variable declarations', () => {
      const result = compileAot(`
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
      `.trim());

      expect(result.components).toHaveLength(1);
      expect(result.code).toContain('__esc(');
      // Should NOT generate list markers (which imply inlined JSX)
      expect(result.code).not.toMatch(/__ssr_CardList[^]*<!--list-->/);
    });

    it('Then still optimizes simple .map() with expression body', () => {
      const result = compileAot(`
function List({ items }: { items: string[] }) {
  return <ul>{items.map(item => <li>{item}</li>)}</ul>;
}
      `.trim());

      expect(result.code).toContain('<!--list-->');
    });

    it('Then still optimizes .map() with block body containing only return', () => {
      const result = compileAot(`
function List({ items }: { items: string[] }) {
  return <ul>{items.map((item) => { return <li>{item}</li>; })}</ul>;
}
      `.trim());

      expect(result.code).toContain('<!--list-->');
    });

    it('Then falls back for any non-return statement in block body', () => {
      const result = compileAot(`
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
      `.trim());

      expect(result.code).toContain('__esc(');
      expect(result.code).not.toMatch(/__ssr_ListWithLog[^]*<!--list-->/);
    });
  });
});
