import { describe, expect, it } from 'bun:test';
import { compileForSSRAot } from '../compiler';

/** Extract the AOT function text from generated code. */
function extractAotFn(code: string, fnName: string): string {
  const fnMatch = code.match(new RegExp(`function ${fnName}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`));
  if (!fnMatch) throw new Error(`Function ${fnName} not found in generated code`);
  return fnMatch[0]!;
}

/** Evaluate the generated AOT function by extracting and running it. */
function evalAot(code: string, fnName: string, args: Record<string, unknown> = {}): string {
  // Extract the function body from the generated code
  const fnMatch = code.match(new RegExp(`function ${fnName}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`));
  if (!fnMatch) throw new Error(`Function ${fnName} not found in generated code`);

  // Provide helper functions
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

  const argNames = Object.keys(args);
  const argValues = Object.values(args);

  // biome-ignore lint/security/noGlobalEval: test helper
  const fn = new Function('__esc', '__esc_attr', ...argNames, fnMatch[1]!);
  return fn(__esc, __esc_attr, ...argValues);
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
      expect(htmlOn).toContain('<span class="on">Online</span>');

      const htmlOff = evalAot(result.code, '__ssr_Status', { __props: { isOnline: false } });
      expect(htmlOff).toContain('<span class="off">Offline</span>');
    });

    it('handles && conditionals', () => {
      const result = compileForSSRAot(
        `
function Alert({ message }: { message: string | null }) {
  return <div>{message && <span class="alert">{message}</span>}</div>;
}
        `.trim(),
      );

      expect(result.components[0]!.tier).toBe('conditional');

      const htmlWith = evalAot(result.code, '__ssr_Alert', { __props: { message: 'Error!' } });
      expect(htmlWith).toContain('<span class="alert">Error!</span>');

      const htmlWithout = evalAot(result.code, '__ssr_Alert', { __props: { message: null } });
      expect(htmlWithout).not.toContain('<span');
    });

    it('handles list rendering with .map()', () => {
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
      expect(html).toBe('<ul><li>A</li><li>B</li><li>C</li></ul>');
    });

    it('handles empty list', () => {
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
      expect(html).toBe('<ul></ul>');
    });

    it('handles components with interactive state (data-v-id marker)', () => {
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

      // The AOT function references `count` (the local variable).
      // In a real AOT pipeline, local variable initialization would be
      // included in the function body. For eval, we provide count directly.
      const html = evalAot(result.code, '__ssr_Counter', {
        __props: { initial: 42 },
        count: 42,
      });
      expect(html).toContain('data-v-id="Counter"');
      expect(html).toContain('42');
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
