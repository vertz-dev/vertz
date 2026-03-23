/**
 * AOT Hydration Marker Parity Tests
 *
 * Verifies that compiler-generated AOT string-builder functions emit
 * all four hydration marker types that the DOM shim renderer produces:
 *
 * 1. data-v-id                                    — interactive component root elements
 * 2. <!--conditional--> / <!--/conditional-->      — ternary/&& expressions
 * 3. <!--child-->                                  — reactive text expressions (start anchor only)
 * 4. <!--list--> / <!--/list-->                    — .map() rendering
 *
 * Phase 3 of AOT-compiled SSR (#1745)
 */
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

/** Create a ts-morph Project for parsing generated code. */
function parseGeneratedCode(code: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  return project.createSourceFile('output.tsx', code);
}

/** Strip TS type annotations from a function declaration for JS eval. */
function stripTypeAnnotations(text: string): string {
  return text.replace(/\)\s*:\s*string\s*\{/, ') {').replace(/\(([^)]*)\)/, (_, params: string) => {
    const stripped = params.replace(/:\s*[^,)]+/g, '');
    return `(${stripped})`;
  });
}

/** Evaluate the generated AOT function. */
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

describe('Feature: AOT hydration marker parity', () => {
  describe('Given a static component (no reactive state)', () => {
    describe('When compiled to AOT', () => {
      it('Then no hydration markers are emitted', () => {
        const result = compileForSSRAot(
          `
function StaticCard({ title }: { title: string }) {
  return <div class="card"><h2>{title}</h2></div>;
}
          `.trim(),
        );

        const html = evalAot(result.code, '__ssr_StaticCard', {
          __props: { title: 'Hello' },
        });
        expect(html).toBe('<div class="card"><h2>Hello</h2></div>');
        expect(html).not.toContain('data-v-id');
        expect(html).not.toContain('<!--child-->');
        expect(html).not.toContain('<!--conditional-->');
        expect(html).not.toContain('<!--list-->');
      });
    });
  });

  describe('Given an interactive component (has let/signal)', () => {
    describe('When compiled to AOT', () => {
      it('Then data-v-id is on the root element', () => {
        const result = compileForSSRAot(
          `
function Toggle({ label }: { label: string }) {
  let active = false;
  return <button class={active ? 'on' : 'off'}>{label}</button>;
}
          `.trim(),
        );

        const html = evalAot(result.code, '__ssr_Toggle', {
          __props: { label: 'Click' },
          active: false,
        });
        expect(html).toContain('data-v-id="Toggle"');
      });

      it('Then reactive expressions get a <!--child--> start marker (no end marker)', () => {
        const result = compileForSSRAot(
          `
function Counter({ initial }: { initial: number }) {
  let count = initial;
  return <div><span>{count}</span></div>;
}
          `.trim(),
        );

        // Use different values for initial and count to verify the correct variable is used
        const html = evalAot(result.code, '__ssr_Counter', {
          __props: { initial: 0 },
          count: 7,
        });
        // DOM shim __child() emits only a start anchor, no end marker
        expect(html).toContain('<!--child-->7');
        expect(html).not.toContain('<!--/child-->');
        expect(html).toBe('<div data-v-id="Counter"><span><!--child-->7</span></div>');
      });

      it('Then non-reactive expressions do NOT get child markers', () => {
        const result = compileForSSRAot(
          `
function MixedContent({ label }: { label: string }) {
  let count = 0;
  return <div><span>{label}</span><span>{count}</span></div>;
}
          `.trim(),
        );

        const html = evalAot(result.code, '__ssr_MixedContent', {
          __props: { label: 'Total' },
          count: 42,
        });
        // label is a prop (not reactive) - no child markers
        // count is a signal (reactive) - has child marker
        expect(html).toContain('<span>Total</span>');
        expect(html).toContain('<span><!--child-->42</span>');
      });
    });
  });

  describe('Given a property access with same name as a signal', () => {
    describe('When compiled to AOT', () => {
      it('Then property access does NOT get child markers (no false positive)', () => {
        const result = compileForSSRAot(
          `
function Component({ config }: { config: { count: string } }) {
  let count = 0;
  return <div><span>{config.count}</span><span>{count}</span></div>;
}
          `.trim(),
        );

        const html = evalAot(result.code, '__ssr_Component', {
          __props: { config: { count: 'total' } },
          count: 5,
        });
        // config.count is a property access, NOT a reactive variable reference
        expect(html).toContain('<span>total</span>');
        // count (standalone) IS reactive
        expect(html).toContain('<span><!--child-->5</span>');
      });
    });
  });

  describe('Given a ternary conditional expression', () => {
    describe('When compiled to AOT', () => {
      it('Then wraps the true branch with conditional markers', () => {
        const result = compileForSSRAot(
          `
function Badge({ active }: { active: boolean }) {
  return <div>{active ? <span class="on">Active</span> : <span class="off">Inactive</span>}</div>;
}
          `.trim(),
        );

        const html = evalAot(result.code, '__ssr_Badge', {
          __props: { active: true },
        });
        expect(html).toBe(
          '<div><!--conditional--><span class="on">Active</span><!--/conditional--></div>',
        );
      });

      it('Then wraps the false branch with conditional markers', () => {
        const result = compileForSSRAot(
          `
function Badge({ active }: { active: boolean }) {
  return <div>{active ? <span class="on">Active</span> : <span class="off">Inactive</span>}</div>;
}
          `.trim(),
        );

        const html = evalAot(result.code, '__ssr_Badge', {
          __props: { active: false },
        });
        expect(html).toBe(
          '<div><!--conditional--><span class="off">Inactive</span><!--/conditional--></div>',
        );
      });
    });
  });

  describe('Given an && conditional expression', () => {
    describe('When compiled to AOT', () => {
      it('Then wraps truthy case with conditional markers', () => {
        const result = compileForSSRAot(
          `
function Warning({ show }: { show: boolean }) {
  return <div>{show && <span class="warn">Warning!</span>}</div>;
}
          `.trim(),
        );

        const html = evalAot(result.code, '__ssr_Warning', {
          __props: { show: true },
        });
        expect(html).toBe(
          '<div><!--conditional--><span class="warn">Warning!</span><!--/conditional--></div>',
        );
      });

      it('Then falsy case emits empty conditional markers', () => {
        const result = compileForSSRAot(
          `
function Warning({ show }: { show: boolean }) {
  return <div>{show && <span class="warn">Warning!</span>}</div>;
}
          `.trim(),
        );

        const html = evalAot(result.code, '__ssr_Warning', {
          __props: { show: false },
        });
        expect(html).toBe('<div><!--conditional--><!--/conditional--></div>');
      });
    });
  });

  describe('Given a .map() list expression', () => {
    describe('When compiled to AOT', () => {
      it('Then wraps list output with list markers', () => {
        const result = compileForSSRAot(
          `
function ItemList({ items }: { items: string[] }) {
  return <ul>{items.map(item => <li>{item}</li>)}</ul>;
}
          `.trim(),
        );

        const html = evalAot(result.code, '__ssr_ItemList', {
          __props: { items: ['A', 'B'] },
        });
        expect(html).toBe('<ul><!--list--><li>A</li><li>B</li><!--/list--></ul>');
      });

      it('Then empty list has empty list markers', () => {
        const result = compileForSSRAot(
          `
function ItemList({ items }: { items: string[] }) {
  return <ul>{items.map(item => <li>{item}</li>)}</ul>;
}
          `.trim(),
        );

        const html = evalAot(result.code, '__ssr_ItemList', {
          __props: { items: [] },
        });
        expect(html).toBe('<ul><!--list--><!--/list--></ul>');
      });
    });
  });

  describe('Given a component with nested markers', () => {
    describe('When compiled to AOT', () => {
      it('Then all marker types coexist correctly', () => {
        const result = compileForSSRAot(
          `
function Dashboard({ items, showHeader }: { items: string[]; showHeader: boolean }) {
  return (
    <div>
      {showHeader && <h1>Dashboard</h1>}
      <ul>{items.map(item => <li>{item}</li>)}</ul>
    </div>
  );
}
          `.trim(),
        );

        const html = evalAot(result.code, '__ssr_Dashboard', {
          __props: { items: ['Task 1', 'Task 2'], showHeader: true },
        });

        // Conditional for showHeader &&
        expect(html).toContain('<!--conditional--><h1>Dashboard</h1><!--/conditional-->');
        // List markers for .map()
        expect(html).toContain('<!--list--><li>Task 1</li><li>Task 2</li><!--/list-->');
      });

      it('Then interactive component with conditionals has both data-v-id and markers', () => {
        const result = compileForSSRAot(
          `
function InteractivePanel({ title }: { title: string }) {
  let expanded = false;
  return (
    <div>
      <h2>{title}</h2>
      {expanded && <div class="content">Content</div>}
    </div>
  );
}
          `.trim(),
        );

        const html = evalAot(result.code, '__ssr_InteractivePanel', {
          __props: { title: 'Panel' },
          expanded: false,
        });

        expect(html).toContain('data-v-id="InteractivePanel"');
        expect(html).toContain('<!--conditional--><!--/conditional-->');
        // title is a prop - no child markers
        expect(html).toContain('<h2>Panel</h2>');
      });
    });
  });

  describe('Given a component with nested conditionals', () => {
    describe('When compiled to AOT', () => {
      it('Then nested conditionals each get their own marker pair', () => {
        const result = compileForSSRAot(
          `
function NestedCond({ a, b }: { a: boolean; b: boolean }) {
  return <div>{a ? (b ? <span>Both</span> : <span>A only</span>) : <span>None</span>}</div>;
}
          `.trim(),
        );

        const html = evalAot(result.code, '__ssr_NestedCond', {
          __props: { a: true, b: true },
        });
        // Outer wraps the a ternary, inner wraps the b ternary
        expect(html).toContain('<!--conditional-->');
        expect(html).toContain('<!--/conditional-->');
        expect(html).toContain('<span>Both</span>');
      });

      it('Then the false branch renders with markers', () => {
        const result = compileForSSRAot(
          `
function NestedCond({ a, b }: { a: boolean; b: boolean }) {
  return <div>{a ? (b ? <span>Both</span> : <span>A only</span>) : <span>None</span>}</div>;
}
          `.trim(),
        );

        const html = evalAot(result.code, '__ssr_NestedCond', {
          __props: { a: false, b: false },
        });
        expect(html).toContain('<!--conditional-->');
        expect(html).toContain('<span>None</span>');
        expect(html).toContain('<!--/conditional-->');
      });
    });
  });
});
