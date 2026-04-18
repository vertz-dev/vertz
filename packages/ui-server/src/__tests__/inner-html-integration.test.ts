import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@vertz/test';

beforeAll(() => {
  GlobalRegistrator.register({ url: 'http://localhost/' });
});
afterAll(() => {
  GlobalRegistrator.unregister();
});

// Imports must follow happy-dom registration so that @vertz/ui's auto-detected
// DOM adapter picks up the real DOM rather than failing.
import { mount, signal } from '@vertz/ui';
import { __element, __html } from '@vertz/ui/internals';
import { compile } from '../compiler/native-compiler';
import { toVNode } from '../dom-shim';
import { renderToHTML } from '../render-to-html';

describe('Feature: innerHTML across SSR + hydration + reactive update', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'app';
    document.body.appendChild(root);
  });

  afterEach(() => {
    if (root.parentNode) document.body.removeChild(root);
  });

  describe('Given a component with static innerHTML', () => {
    it('renders raw HTML on the server, preserves node identity on hydration, and applies reactive updates', async () => {
      // App simulates compiler output: __element() + __html() + className.
      // The reactive signal is declared outside so step 3 can mutate it and
      // observe the change on the already-hydrated node.
      const html = signal('<b>x</b>');
      const App = () => {
        const el = __element('pre');
        el.setAttribute('class', 'code');
        __html(el, () => html.value);
        return el;
      };

      // 1. Server render — __html inside SSR runs synchronously and the SSR
      //    element's _innerHTML is serialized as raw HTML (no escaping).
      const serverHtml = await renderToHTML(() => toVNode(App()), { url: '/' });
      expect(serverHtml).toContain('<pre class="code"><b>x</b></pre>');

      // 2. Place SSR markup at #app and hydrate. The <pre> node must not be
      //    re-created — hydration should adopt it.
      root.innerHTML = '<pre class="code"><b>x</b></pre>';
      const preBeforeHydrate = root.querySelector('pre');
      expect(preBeforeHydrate).not.toBeNull();

      const handle = mount(App);
      try {
        expect(root.querySelector('pre')).toBe(preBeforeHydrate);
        // __html runs after hydration and replaces the <pre>'s children with
        // the markup returned from the effect. The outer node identity is
        // preserved; inner content matches the source string byte-for-byte.
        expect(preBeforeHydrate!.innerHTML).toBe('<b>x</b>');
        expect(preBeforeHydrate!.className).toBe('code');

        // 3. Reactive update on the hydrated node — mutating the signal pushes
        //    new markup into the same <pre> via the deferred effect that
        //    rebound tracking at endHydration.
        html.value = '<i>y</i>';
        expect(preBeforeHydrate!.innerHTML).toBe('<i>y</i>');
      } finally {
        handle.unmount();
      }
    });
  });

  describe('Given a component with innerHTML set to undefined', () => {
    it('renders empty content on the server', async () => {
      const ServerApp = () => {
        const el = __element('pre');
        __html(el, () => undefined);
        return el;
      };
      const serverHtml = await renderToHTML(() => toVNode(ServerApp()), { url: '/' });
      expect(serverHtml).toContain('<pre></pre>');
    });
  });

  const hasNativeCompiler = !!(globalThis as Record<string, unknown>).__NATIVE_COMPILER_AVAILABLE__;
  describe.skipIf(!hasNativeCompiler)(
    'Given JSX source with innerHTML compiled through the native compiler',
    () => {
      it('emits __html() and preserves sibling attribute ordering (attr before __html)', () => {
        const source = `
        export function App() {
          return <pre className="code" innerHTML={'<b>x</b>'} />;
        }
      `;
        const result = compile(source, { filename: 'app.tsx', target: 'dom' });
        expect(result.diagnostics).toEqual([]);

        // Seam between Phase 2 (emission) and Phase 1 (runtime): the compiler
        // must emit `__html(` for innerHTML and must NOT emit `setAttribute(
        // "innerHTML", …)` or pass innerHTML through as an attribute.
        expect(result.code).toContain('__html(');
        expect(result.code).not.toContain('"innerHTML"');
        expect(result.code).not.toContain("'innerHTML'");

        // Attribute ordering: className must be set BEFORE __html so that the
        // element carries its class while innerHTML is still empty during SSR.
        const htmlIdx = result.code.indexOf('__html(');
        const classIdx = result.code.search(/setAttribute\(\s*["']class["']/);
        expect(classIdx).toBeGreaterThan(-1);
        expect(htmlIdx).toBeGreaterThan(-1);
        expect(classIdx).toBeLessThan(htmlIdx);
      });
    },
  );

  describe('Given dangerous markup (script tag, event handler attributes)', () => {
    it('passes through on SSR without entity escaping or sanitizer stripping', async () => {
      const dangerous = '<img src="x" onerror="alert(1)"><script>window.__x=1</script>';
      const App = () => {
        const el = __element('div');
        __html(el, () => dangerous);
        return el;
      };
      const serverHtml = await renderToHTML(() => toVNode(App()), { url: '/' });
      // Raw pass-through: neither sanitizer stripping nor entity escaping.
      expect(serverHtml).toContain(dangerous);

      // Client path: __html assigns to innerHTML directly — the browser
      // parses the string, so attribute order/quoting may normalize but the
      // structurally dangerous bits (onerror handler, <script> tag) survive.
      root.innerHTML = `<div>${dangerous}</div>`;
      const handle = mount(App);
      try {
        const div = root.querySelector('div')!;
        const img = div.querySelector('img')!;
        expect(img).not.toBeNull();
        expect(img.getAttribute('onerror')).toBe('alert(1)');
        expect(div.querySelector('script')).not.toBeNull();
      } finally {
        handle.unmount();
      }
    });
  });

  describe('Given innerHTML markup equivalent to SSR output', () => {
    it('hydration does not emit console warnings about content mismatch', async () => {
      const App = () => {
        const el = __element('pre');
        __html(el, () => '<b>x</b>');
        return el;
      };
      const serverHtml = await renderToHTML(() => toVNode(App()), { url: '/' });
      expect(serverHtml).toContain('<pre><b>x</b></pre>');

      root.innerHTML = '<pre><b>x</b></pre>';
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnings.push(args.map((a) => String(a)).join(' '));
      };
      try {
        const handle = mount(App);
        try {
          expect(warnings.join('\n')).toBe('');
          expect(root.querySelector('pre')!.innerHTML).toBe('<b>x</b>');
        } finally {
          handle.unmount();
        }
      } finally {
        console.warn = originalWarn;
      }
    });
  });
});
