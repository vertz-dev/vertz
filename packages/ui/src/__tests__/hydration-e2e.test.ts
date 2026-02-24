import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetInjectedStyles } from '../css/css';
import { __conditional } from '../dom/conditional';
import {
  __append,
  __element,
  __enterChildren,
  __exitChildren,
  __staticText,
  __text,
} from '../dom/element';
import { __on } from '../dom/events';
import { __list } from '../dom/list';
import { mount } from '../mount';
import { signal } from '../runtime/signal';

describe('tolerant hydration e2e', () => {
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

  it('SSR HTML → mount with tolerant → interactive app, no flash', () => {
    // 1. Set up root with SSR-like HTML
    root.innerHTML = '<div><h1>Hello</h1><p>Count: 0</p><button>+1</button></div>';

    // Save references to original SSR nodes
    const ssrDiv = root.firstChild as HTMLElement;
    const ssrH1 = ssrDiv.children[0] as HTMLElement;
    const ssrP = ssrDiv.children[1] as HTMLElement;
    const ssrButton = ssrDiv.children[2] as HTMLElement;

    // 2. Inject a fake browser extension node
    ssrDiv.appendChild(document.createElement('grammarly-extension'));

    // 3. Mount with tolerant hydration — simulating compiler output
    const count = signal(0);
    const App = () => {
      const el = __element('div');
      __enterChildren(el);

      const h1 = __element('h1');
      __enterChildren(h1);
      __append(h1, __staticText('Hello'));
      __exitChildren();
      __append(el, h1);

      const p = __element('p');
      __enterChildren(p);
      __append(
        p,
        __text(() => `Count: ${count.value}`),
      );
      __exitChildren();
      __append(el, p);

      const btn = __element('button');
      __on(btn, 'click', () => {
        count.value++;
      });
      __enterChildren(btn);
      __append(btn, __staticText('+1'));
      __exitChildren();
      __append(el, btn);

      __exitChildren();
      return el;
    };

    const handle = mount(App, root, { hydration: 'tolerant' });

    // 4. Verify: no flash (SSR nodes adopted, not recreated)
    expect(root.innerHTML).toContain('Hello');
    expect(root.innerHTML).toContain('Count: 0');
    expect(root.innerHTML).toContain('+1');

    // SSR nodes were adopted (same references)
    const currentDiv = root.firstChild as HTMLElement;
    expect(currentDiv).toBe(ssrDiv);
    expect(currentDiv.querySelector('h1')).toBe(ssrH1);
    expect(currentDiv.querySelector('p')).toBe(ssrP);
    expect(currentDiv.querySelector('button')).toBe(ssrButton);

    // 5. Verify: interactive (click handler fires, text updates)
    const button = root.querySelector('button')!;
    button.click();
    expect(count.value).toBe(1);
    // The text node inside <p> should update
    expect(root.querySelector('p')?.textContent).toBe('Count: 1');

    // Click again
    button.click();
    expect(count.value).toBe(2);
    expect(root.querySelector('p')?.textContent).toBe('Count: 2');

    // 6. Extension node is still present (not destroyed)
    expect(root.querySelector('grammarly-extension')).not.toBeNull();

    handle.unmount();
  });

  it('conditional content preserved during tolerant hydration', () => {
    // SSR output: div with a conditional comment anchor + visible span
    root.innerHTML = '<div><!-- conditional --><span>visible</span></div>';

    const ssrSpan = root.querySelector('span') as HTMLElement;

    const show = signal(true);
    const App = () => {
      const el = __element('div');
      __enterChildren(el);

      const cond = __conditional(
        () => show.value,
        () => {
          const s = __element('span');
          __enterChildren(s);
          __append(s, __staticText('visible'));
          __exitChildren();
          return s;
        },
        () => null,
      );
      __append(el, cond);

      __exitChildren();
      return el;
    };

    mount(App, root, { hydration: 'tolerant' });

    // The SSR span must still be in the DOM — not ripped out
    expect(root.querySelector('span')).toBe(ssrSpan);
    expect(root.textContent).toContain('visible');
  });

  it('list items preserved and reactive after tolerant hydration', () => {
    // SSR output: ul with 3 li items
    root.innerHTML = '<ul><li>A</li><li>B</li><li>C</li></ul>';

    const ssrItems = Array.from(root.querySelectorAll('li'));
    expect(ssrItems).toHaveLength(3);

    const items = signal(['A', 'B', 'C']);
    const App = () => {
      const ul = __element('ul');
      __enterChildren(ul);

      __list(
        ul,
        () => items.value,
        (item) => item,
        (item) => {
          const li = __element('li');
          __enterChildren(li);
          __append(li, __staticText(item));
          __exitChildren();
          return li;
        },
      );

      __exitChildren();
      return ul;
    };

    mount(App, root, { hydration: 'tolerant' });

    // SSR li nodes were adopted (same references)
    const currentItems = Array.from(root.querySelectorAll('li'));
    expect(currentItems[0]).toBe(ssrItems[0]);
    expect(currentItems[1]).toBe(ssrItems[1]);
    expect(currentItems[2]).toBe(ssrItems[2]);

    // List update works after hydration
    items.value = ['A', 'B', 'C', 'D'];
    const updated = Array.from(root.querySelectorAll('li'));
    expect(updated).toHaveLength(4);
    expect(updated[3]?.textContent).toBe('D');
  });
});
