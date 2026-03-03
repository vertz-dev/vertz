import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { resetInjectedStyles } from '../css/css';
import {
  __append,
  __child,
  __element,
  __enterChildren,
  __exitChildren,
  __insert,
  __staticText,
  __text,
} from '../dom/element';
import { __on } from '../dom/events';
import { mount } from '../mount';
import { popScope, pushScope } from '../runtime/disposal';
import { domEffect, signal, startSignalCollection, stopSignalCollection } from '../runtime/signal';

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

    const handle = mount(App, root);

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

    const handle = mount(App, root);

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

    mount(App, root);

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

    mount(App, root);
    expect(root.textContent).toContain('Count: 0');

    count.value = 42;
    expect(root.textContent).toContain('Count: 42');
  });

  it('renders from scratch on empty root (CSR)', () => {
    // Root has no SSR content — falls through to CSR render
    const App = () => {
      const el = document.createElement('div');
      el.textContent = 'fresh';
      return el;
    };

    mount(App, root);

    expect(root.textContent).toBe('fresh');
  });

  it('bails out to CSR render on hydration error', () => {
    root.innerHTML = '<div>SSR content</div>';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let callCount = 0;
    const App = () => {
      callCount++;
      if (callCount === 1) {
        // Throw on first call (hydration attempt)
        throw new Error('hydration broke');
      }
      // Second call (CSR fallback) succeeds
      const el = document.createElement('div');
      el.textContent = 'fallback';
      return el;
    };

    mount(App, root);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Hydration failed'),
      expect.any(Error),
    );
    // CSR render succeeded
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

    mount(App, root);

    // The effect from the failed hydration ran once during setup
    const runCountAfterMount = effectRunCount;

    // Changing the signal should NOT trigger the stale effect
    count.value = 1;
    expect(effectRunCount).toBe(runCountAfterMount);

    vi.restoreAllMocks();
  });

  it('calls onMount after hydration', () => {
    root.innerHTML = '<div>content</div>';
    const onMount = vi.fn();

    const App = () => {
      const el = __element('div');
      __enterChildren(el);
      __append(el, __staticText('content'));
      __exitChildren();
      return el;
    };

    mount(App, root, { onMount });

    expect(onMount).toHaveBeenCalledTimes(1);
    expect(onMount).toHaveBeenCalledWith(root);
  });

  it('SSR nodes are adopted (same DOM references)', () => {
    root.innerHTML = '<div><h1>Hello</h1><button>Click</button></div>';

    const ssrDiv = root.firstChild as HTMLElement;
    const ssrH1 = ssrDiv.querySelector('h1')!;
    const ssrButton = ssrDiv.querySelector('button')!;

    let clicked = false;
    const App = () => {
      const el = __element('div');
      __enterChildren(el);
      const h1 = __element('h1');
      __enterChildren(h1);
      __append(h1, __staticText('Hello'));
      __exitChildren();
      __append(el, h1);
      const btn = __element('button');
      __on(btn, 'click', () => {
        clicked = true;
      });
      __enterChildren(btn);
      __append(btn, __staticText('Click'));
      __exitChildren();
      __append(el, btn);
      __exitChildren();
      return el;
    };

    mount(App, root);

    // SSR nodes were adopted — same DOM references
    const currentDiv = root.firstChild as HTMLElement;
    expect(currentDiv).toBe(ssrDiv);
    expect(currentDiv.querySelector('h1')).toBe(ssrH1);
    expect(currentDiv.querySelector('button')).toBe(ssrButton);

    // Event handlers are attached to adopted nodes
    ssrButton.click();
    expect(clicked).toBe(true);
  });

  it('onClick works when button follows span with reactive children (Counter pattern)', () => {
    // SSR HTML: span contains static text + reactive __child wrapper span, then sibling button
    root.innerHTML =
      '<div><span>Count: <span style="display: contents">0</span></span><button>+</button></div>';

    const ssrDiv = root.firstChild as HTMLElement;
    const ssrButton = ssrDiv.querySelector('button')!;

    const count = signal(0);
    let clicked = false;

    const App = () => {
      const el = __element('div');
      __enterChildren(el);

      // <span>{label}: {count}</span>
      const span = __element('span');
      __enterChildren(span);
      __insert(span, 'Count');
      __append(span, __staticText(': '));
      const child = __child(() => count.value);
      __append(span, child);
      __exitChildren();
      __append(el, span);

      // <button onClick={handler}>+</button>
      const btn = __element('button');
      __on(btn, 'click', () => {
        clicked = true;
        count.value++;
      });
      __enterChildren(btn);
      __append(btn, __staticText('+'));
      __exitChildren();
      __append(el, btn);

      __exitChildren();
      return el;
    };

    mount(App, root);

    // Button should be the SSR button (adopted, not recreated)
    expect(ssrDiv.querySelector('button')).toBe(ssrButton);

    // Click handler must be attached to the SSR button
    ssrButton.click();
    expect(clicked).toBe(true);
    expect(count.value).toBe(1);

    // Reactive update works
    expect(root.textContent).toContain('1');
  });

  it('onClick works when page content is passed as children function via __insert', () => {
    // Reproduces the DashboardLayout/DashboardSettingsPage pattern:
    // Layout receives children as a function prop, inserts via __insert.
    // During hydration, __insert must call the function so inner elements
    // (including buttons with __on) are claimed from SSR DOM.
    root.innerHTML =
      '<div class="layout"><div class="sidebar">Sidebar</div>' +
      '<div class="content"><div class="page"><h1>Settings</h1>' +
      '<div><span>Saves:<span style="display: contents">0</span></span>' +
      '<button>+</button></div></div></div></div>';

    const ssrButton = root.querySelector('button')!;
    const count = signal(0);
    let clicked = false;

    // Counter component (compiled output pattern)
    const Counter = () => {
      const el = __element('div');
      __enterChildren(el);

      const span = __element('span');
      __enterChildren(span);
      __insert(span, 'Saves');
      __append(span, __staticText(':'));
      __append(
        span,
        __child(() => count.value),
      );
      __exitChildren();
      __append(el, span);

      const btn = __element('button');
      __on(btn, 'click', () => {
        clicked = true;
        count.value++;
      });
      __enterChildren(btn);
      __append(btn, __staticText('+'));
      __exitChildren();
      __append(el, btn);

      __exitChildren();
      return el;
    };

    // Page component (returns the page content element tree)
    const PageContent = () => {
      const el = __element('div');
      el.setAttribute('class', 'page');
      __enterChildren(el);
      __append(
        el,
        (() => {
          const h1 = __element('h1');
          __enterChildren(h1);
          __append(h1, __staticText('Settings'));
          __exitChildren();
          return h1;
        })(),
      );
      __append(el, Counter());
      __exitChildren();
      return el;
    };

    // Layout component: receives children as function, inserts via __insert
    const Layout = ({ children }: { children: () => Node }) => {
      const el = __element('div');
      el.setAttribute('class', 'layout');
      __enterChildren(el);
      __append(
        el,
        (() => {
          const sidebar = __element('div');
          sidebar.setAttribute('class', 'sidebar');
          __enterChildren(sidebar);
          __append(sidebar, __staticText('Sidebar'));
          __exitChildren();
          return sidebar;
        })(),
      );
      __append(
        el,
        (() => {
          const content = __element('div');
          content.setAttribute('class', 'content');
          __enterChildren(content);
          __insert(content, children); // children is a function!
          __exitChildren();
          return content;
        })(),
      );
      __exitChildren();
      return el;
    };

    const App = () => Layout({ children: () => PageContent() });

    mount(App, root);

    // Button should be the SSR button (adopted, not recreated)
    expect(root.querySelector('button')).toBe(ssrButton);

    // Click handler must be attached to the SSR button
    ssrButton.click();
    expect(clicked).toBe(true);
    expect(count.value).toBe(1);
  });

  it('Counter pattern produces no claim verification warnings', () => {
    root.innerHTML =
      '<div><span>Count: <span style="display: contents">0</span></span><button>+</button></div>';

    const count = signal(0);

    const App = () => {
      const el = __element('div');
      __enterChildren(el);

      const span = __element('span');
      __enterChildren(span);
      __insert(span, 'Count');
      __append(span, __staticText(': '));
      const child = __child(() => count.value);
      __append(span, child);
      __exitChildren();
      __append(el, span);

      const btn = __element('button');
      __on(btn, 'click', () => {
        count.value++;
      });
      __enterChildren(btn);
      __append(btn, __staticText('+'));
      __exitChildren();
      __append(el, btn);

      __exitChildren();
      return el;
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(App, root);

    // No claim verification warnings (no false positives)
    const claimWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('not claimed'),
    );
    expect(claimWarns).toHaveLength(0);

    warnSpy.mockRestore();
  });

  it('children-as-function pattern produces no claim verification warnings', () => {
    root.innerHTML =
      '<div class="layout"><div class="sidebar">Sidebar</div>' +
      '<div class="content"><div class="page"><h1>Settings</h1>' +
      '<div><span>Saves:<span style="display: contents">0</span></span>' +
      '<button>+</button></div></div></div></div>';

    const count = signal(0);

    const Counter = () => {
      const el = __element('div');
      __enterChildren(el);
      const span = __element('span');
      __enterChildren(span);
      __insert(span, 'Saves');
      __append(span, __staticText(':'));
      __append(
        span,
        __child(() => count.value),
      );
      __exitChildren();
      __append(el, span);
      const btn = __element('button');
      __on(btn, 'click', () => {
        count.value++;
      });
      __enterChildren(btn);
      __append(btn, __staticText('+'));
      __exitChildren();
      __append(el, btn);
      __exitChildren();
      return el;
    };

    const PageContent = () => {
      const el = __element('div');
      el.setAttribute('class', 'page');
      __enterChildren(el);
      __append(
        el,
        (() => {
          const h1 = __element('h1');
          __enterChildren(h1);
          __append(h1, __staticText('Settings'));
          __exitChildren();
          return h1;
        })(),
      );
      __append(el, Counter());
      __exitChildren();
      return el;
    };

    const Layout = ({ children }: { children: () => Node }) => {
      const el = __element('div');
      el.setAttribute('class', 'layout');
      __enterChildren(el);
      __append(
        el,
        (() => {
          const sidebar = __element('div');
          sidebar.setAttribute('class', 'sidebar');
          __enterChildren(sidebar);
          __append(sidebar, __staticText('Sidebar'));
          __exitChildren();
          return sidebar;
        })(),
      );
      __append(
        el,
        (() => {
          const content = __element('div');
          content.setAttribute('class', 'content');
          __enterChildren(content);
          __insert(content, children);
          __exitChildren();
          return content;
        })(),
      );
      __exitChildren();
      return el;
    };

    const App = () => Layout({ children: () => PageContent() });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(App, root);

    const claimWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('not claimed'),
    );
    expect(claimWarns).toHaveLength(0);

    warnSpy.mockRestore();
  });

  it('deeply nested children wrappers attach events through two function layers', () => {
    // Layout wraps children through TWO function layers:
    // OuterLayout receives children as fn → InnerLayout receives children as fn → content
    root.innerHTML =
      '<div class="outer"><div class="inner"><div><button>click</button></div></div></div>';

    const ssrButton = root.querySelector('button')!;
    let clicked = false;

    const Content = () => {
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

    const InnerLayout = ({ children }: { children: () => Node }) => {
      const el = __element('div');
      el.setAttribute('class', 'inner');
      __enterChildren(el);
      __insert(el, children);
      __exitChildren();
      return el;
    };

    const OuterLayout = ({ children }: { children: () => Node }) => {
      const el = __element('div');
      el.setAttribute('class', 'outer');
      __enterChildren(el);
      __insert(el, children);
      __exitChildren();
      return el;
    };

    const App = () =>
      OuterLayout({
        children: () => InnerLayout({ children: () => Content() }),
      });

    mount(App, root);

    // Button should be the SSR button (adopted via claim)
    expect(root.querySelector('button')).toBe(ssrButton);

    // Click handler must be attached through two function layers
    ssrButton.click();
    expect(clicked).toBe(true);
  });

  it('onClick works with Fast Refresh wrapper on Counter pattern', () => {
    // Same SSR HTML as Counter pattern test
    root.innerHTML =
      '<div><span>Count: <span style="display: contents">0</span></span><button>+</button></div>';

    const ssrButton = (root.firstChild as HTMLElement).querySelector('button')!;

    const count = signal(0);
    let clicked = false;

    // Original component factory (same as Counter pattern)
    const OriginalApp = () => {
      const el = __element('div');
      __enterChildren(el);

      const span = __element('span');
      __enterChildren(span);
      __insert(span, 'Count');
      __append(span, __staticText(': '));
      const child = __child(() => count.value);
      __append(span, child);
      __exitChildren();
      __append(el, span);

      const btn = __element('button');
      __on(btn, 'click', () => {
        clicked = true;
        count.value++;
      });
      __enterChildren(btn);
      __append(btn, __staticText('+'));
      __exitChildren();
      __append(el, btn);

      __exitChildren();
      return el;
    };

    // Fast Refresh wrapper (mirrors generateRefreshWrapper codegen)
    const App = () => {
      const scope = pushScope();
      startSignalCollection();
      const ret = OriginalApp();
      stopSignalCollection();
      popScope();
      // Forward inner cleanups to parent scope (like the real wrapper does)
      if (scope.length > 0) {
        // _tryOnCleanup would register with mount's scope
      }
      // __$refreshTrack returns element unchanged
      return ret;
    };

    mount(App, root);

    // Button should be the SSR button (adopted, not recreated)
    expect((root.firstChild as HTMLElement).querySelector('button')).toBe(ssrButton);

    // Click handler must be attached to the SSR button
    ssrButton.click();
    expect(clicked).toBe(true);
    expect(count.value).toBe(1);
  });
});
