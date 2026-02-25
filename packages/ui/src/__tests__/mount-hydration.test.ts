import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { resetInjectedStyles } from '../css/css';
import {
  __append,
  __element,
  __enterChildren,
  __exitChildren,
  __staticText,
  __text,
} from '../dom/element';
import { __on } from '../dom/events';
import { mount } from '../mount';
import { domEffect, signal } from '../runtime/signal';

describe('mount() — tolerant hydration', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    resetInjectedStyles();
  });

  afterEach(() => {
    document.body.removeChild(root);
    resetInjectedStyles();
  });

  it('preserves SSR content, attaches reactivity', () => {
    // Simulate SSR output
    root.innerHTML = '<div><h1>Hello</h1></div>';

    const App = () => {
      const el = __element('div');
      __enterChildren(el);
      const h1 = __element('h1');
      __enterChildren(h1);
      __append(h1, __staticText('Hello'));
      __exitChildren();
      __append(el, h1);
      __exitChildren();
      return el;
    };

    const handle = mount(App, root, { hydration: 'tolerant' });

    // Content preserved (no flash)
    expect(root.innerHTML).toContain('Hello');
    expect(root.querySelector('h1')).not.toBeNull();

    handle.unmount();
  });

  it('handles browser extension nodes', () => {
    root.innerHTML = '<div><p>text</p></div>';
    // Inject a fake extension node
    root.firstChild?.appendChild(document.createElement('grammarly-extension'));

    const App = () => {
      const el = __element('div');
      __enterChildren(el);
      const p = __element('p');
      __enterChildren(p);
      __append(p, __staticText('text'));
      __exitChildren();
      __append(el, p);
      __exitChildren();
      return el;
    };

    const handle = mount(App, root, { hydration: 'tolerant' });

    expect(root.innerHTML).toContain('text');
    expect(root.querySelector('p')).not.toBeNull();

    handle.unmount();
  });

  it('event handlers work on adopted elements', () => {
    root.innerHTML = '<div><button>click</button></div>';

    let clicked = false;
    const App = () => {
      const el = __element('div');
      __enterChildren(el);
      const btn = __element('button');
      __on(btn, 'click', () => {
        clicked = true;
      });
      __enterChildren(btn);
      __append(btn, __staticText('click'));
      __exitChildren();
      __append(el, btn);
      __exitChildren();
      return el;
    };

    mount(App, root, { hydration: 'tolerant' });

    const button = root.querySelector('button')!;
    button.click();
    expect(clicked).toBe(true);
  });

  it('reactive updates work after hydration', () => {
    // SSR output matches what __text would claim: a text node inside the div
    root.innerHTML = '<div>Count: 0</div>';

    const count = signal(0);
    const App = () => {
      const el = __element('div');
      __enterChildren(el);
      const textNode = __text(() => `Count: ${count.value}`);
      __append(el, textNode);
      __exitChildren();
      return el;
    };

    mount(App, root, { hydration: 'tolerant' });
    expect(root.textContent).toContain('Count: 0');

    count.value = 42;
    expect(root.textContent).toContain('Count: 42');
  });

  it('warns and falls back to replace on empty root', () => {
    // Root has no SSR content
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const App = () => {
      const el = document.createElement('div');
      el.textContent = 'fresh';
      return el;
    };

    mount(App, root, { hydration: 'tolerant' });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no SSR content found'));
    // Falls back to replace mode, so fresh content is rendered
    expect(root.textContent).toBe('fresh');

    warnSpy.mockRestore();
  });

  it('bails out to replace mode on hydration error', () => {
    root.innerHTML = '<div>SSR content</div>';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let callCount = 0;
    const App = () => {
      callCount++;
      if (callCount === 1) {
        // Throw on first call (hydration attempt)
        throw new Error('hydration broke');
      }
      // Second call (replace fallback) succeeds
      const el = document.createElement('div');
      el.textContent = 'fallback';
      return el;
    };

    mount(App, root, { hydration: 'tolerant' });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Hydration failed'),
      expect.any(Error),
    );
    // Replace mode rendered successfully
    expect(root.textContent).toBe('fallback');
    warnSpy.mockRestore();
  });

  it('error recovery cleans up effects from failed hydration attempt', () => {
    root.innerHTML = '<div><span>SSR</span></div>';
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    let effectRunCount = 0;
    let callCount = 0;
    const count = signal(0);

    const App = () => {
      callCount++;
      if (callCount === 1) {
        // Register an effect during the failed hydration attempt
        domEffect(() => {
          // Track the signal so we can check if this effect is still alive
          void count.value;
          effectRunCount++;
        });
        throw new Error('hydration broke');
      }
      const el = document.createElement('div');
      el.textContent = 'fallback';
      return el;
    };

    mount(App, root, { hydration: 'tolerant' });

    // The effect from the failed hydration ran once during setup
    const runCountAfterMount = effectRunCount;

    // Changing the signal should NOT trigger the stale effect
    count.value = 1;
    expect(effectRunCount).toBe(runCountAfterMount);

    vi.restoreAllMocks();
  });

  it('auto-detects SSR and uses tolerant hydration when __VERTZ_SSR_DATA__ exists', () => {
    // Simulate SSR: root has content + SSR data marker on window
    root.innerHTML = '<div><h1>SSR Content</h1></div>';
    // biome-ignore lint/suspicious/noExplicitAny: test setup
    (globalThis as any).__VERTZ_SSR_DATA__ = [{ key: 'test', data: 'ok' }];

    // Grab the original SSR <h1> node reference — if hydration is tolerant,
    // this exact DOM node is preserved (adopted). If replace mode runs,
    // the node is destroyed and a new one is created.
    const ssrH1 = root.querySelector('h1')!;

    const App = () => {
      const el = __element('div');
      __enterChildren(el);
      const h1 = __element('h1');
      __enterChildren(h1);
      __append(h1, __staticText('SSR Content'));
      __exitChildren();
      __append(el, h1);
      __exitChildren();
      return el;
    };

    // No hydration option specified — should auto-detect tolerant mode
    const handle = mount(App, root);

    // The SAME DOM node must be preserved (tolerant hydration adopts, replace destroys)
    const currentH1 = root.querySelector('h1')!;
    expect(currentH1).toBe(ssrH1);

    handle.unmount();
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).__VERTZ_SSR_DATA__;
  });

  it('default mode clears and renders when no SSR data exists', () => {
    root.innerHTML = '<span>old content</span>';
    const App = () => {
      const el = document.createElement('div');
      el.textContent = 'new';
      return el;
    };

    mount(App, root);

    expect(root.innerHTML).not.toContain('old content');
    expect(root.textContent).toBe('new');
  });

  it('explicit replace mode same as default', () => {
    root.innerHTML = '<span>old</span>';
    const App = () => {
      const el = document.createElement('div');
      el.textContent = 'new';
      return el;
    };

    mount(App, root, { hydration: 'replace' });

    expect(root.innerHTML).not.toContain('old');
    expect(root.textContent).toBe('new');
  });

  it('strict mode throws an explicit error (reserved, not implemented)', () => {
    const App = () => document.createElement('div');

    expect(() => {
      mount(App, root, { hydration: 'strict' });
    }).toThrow(/not yet implemented/);
  });

  it('calls onMount after tolerant hydration', () => {
    root.innerHTML = '<div>content</div>';
    const onMount = vi.fn();

    const App = () => {
      const el = __element('div');
      __enterChildren(el);
      __append(el, __staticText('content'));
      __exitChildren();
      return el;
    };

    mount(App, root, { hydration: 'tolerant', onMount });

    expect(onMount).toHaveBeenCalledTimes(1);
    expect(onMount).toHaveBeenCalledWith(root);
  });
});
