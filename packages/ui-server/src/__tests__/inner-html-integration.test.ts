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
import { jsx } from '@vertz/ui/jsx-runtime';
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
      // In SSR context the element is an SSRElement; in the browser it is an
      // HTMLElement. Hydration adopts the SSR markup without re-creating nodes.
      const App = () => {
        const el = __element('pre');
        el.setAttribute('class', 'code');
        __html(el, () => '<b>x</b>');
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
      } finally {
        handle.unmount();
      }

      // 3. Reactive update — mutating the signal pushes new markup into the
      //    element's innerHTML via the effect registered by __html.
      const html = signal('<b>x</b>');
      const el = __element('pre');
      __html(el, () => html.value);
      expect(el.innerHTML).toBe('<b>x</b>');
      html.value = '<i>y</i>';
      expect(el.innerHTML).toBe('<i>y</i>');
    });
  });

  describe('Given a component with innerHTML set to undefined', () => {
    it('renders empty content on both server and client', async () => {
      const ServerApp = () => {
        const el = __element('pre');
        __html(el, () => undefined);
        return el;
      };
      const serverHtml = await renderToHTML(() => toVNode(ServerApp()), { url: '/' });
      expect(serverHtml).toContain('<pre></pre>');

      // Client path — the JSX runtime fallback used in dev/test.
      const el = jsx('pre', { innerHTML: undefined }) as HTMLElement;
      expect(el.innerHTML).toBe('');
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
