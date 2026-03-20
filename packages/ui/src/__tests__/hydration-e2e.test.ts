import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetInjectedStyles } from '../css/css';
import { __conditional } from '../dom/conditional';
import {
  __append,
  __child,
  __element,
  __enterChildren,
  __exitChildren,
  __staticText,
  __text,
} from '../dom/element';
import { __on } from '../dom/events';
import { __list } from '../dom/list';
import { SVG_NS } from '../dom/svg-tags';
import { mount } from '../mount';
import { signal } from '../runtime/signal';

describe('tolerant hydration e2e', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'app';
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

    const handle = mount(App);

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

    mount(App);

    // The SSR span must still be in the DOM (inside the conditional wrapper)
    expect(root.contains(ssrSpan)).toBe(true);
    expect(root.textContent).toContain('visible');
  });

  it('conditional with primitive string branches claims SSR text and switches cleanly', () => {
    // SSR output: button with conditional comment anchor + text "Add Todo"
    // This mirrors the entity-todo form button:
    //   {submitting ? 'Adding...' : 'Add Todo'}
    root.innerHTML = '<button><!--conditional-->Add Todo</button>';

    const submitting = signal(false);
    const App = () => {
      const btn = __element('button');
      __enterChildren(btn);

      const cond = __conditional(
        () => submitting.value,
        () => 'Adding...' as unknown as Node,
        () => 'Add Todo' as unknown as Node,
      );
      __append(btn, cond);

      __exitChildren();
      return btn;
    };

    mount(App);

    // After hydration, button should show "Add Todo" (no duplication)
    const btn = root.querySelector('button')!;
    expect(btn.textContent).toBe('Add Todo');

    // Switch to submitting — should replace, not duplicate
    submitting.value = true;
    expect(btn.textContent).toBe('Adding...');

    // Switch back
    submitting.value = false;
    expect(btn.textContent).toBe('Add Todo');
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

    mount(App);

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

  it('claimElement claims SVG namespace elements with lowercase tagName', () => {
    // SVG elements have lowercase tagName ("svg", "path") in the SVG namespace,
    // unlike HTML elements which are always uppercase ("DIV", "SPAN").
    // Regression: claimElement used strict equality (el.tagName === "SVG")
    // which always failed for SVG elements, causing orphaned SSR nodes.
    root.innerHTML =
      '<button>' +
      '<span>' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<path d="M5 12l5 5L20 7"></path>' +
      '</svg>' +
      '</span>' +
      '</button>';

    const ssrSvg = root.querySelector('svg')!;
    const ssrPath = root.querySelector('path')!;

    // Verify happydom gives lowercase tagName for SVG elements (matching browser behavior)
    expect(ssrSvg.tagName).toBe('svg');
    expect(ssrPath.tagName).toBe('path');

    const App = () => {
      const btn = __element('button');
      __enterChildren(btn);

      const span = __element('span');
      __enterChildren(span);

      const svg = __element('svg', { xmlns: SVG_NS, viewBox: '0 0 24 24' });
      __enterChildren(svg);
      const p = __element('path', { d: 'M5 12l5 5L20 7' });
      __append(svg, p);
      __exitChildren();
      __append(span, svg);

      __exitChildren();
      __append(btn, span);

      __exitChildren();
      return btn;
    };

    mount(App);

    // SSR SVG must be adopted (same reference), not duplicated
    const svgs = root.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toBe(ssrSvg);

    // Path must also be adopted
    const paths = root.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toBe(ssrPath);
  });

  it('checkbox-like conditional SVG: no duplicate after hydration + toggle', () => {
    // Simulates the compiled checkbox pattern:
    //   {checked === 'mixed' ? <svg1> : checked ? <svg2> : null}
    // which compiles to nested __conditional() calls.
    // The SSR output for checked=true (not mixed) has TWO comment anchors:
    // one for the outer conditional (mixed? check) and one for the inner
    // conditional (checked? check), followed by the SVG.
    // Regression: SVG claimElement failure caused duplicate SVGs after
    // hydration — the SSR SVG stayed orphaned while a new empty SVG was created.
    root.innerHTML =
      '<button role="checkbox">' +
      '<span data-part="indicator">' +
      '<!-- conditional -->' +
      '<!-- conditional -->' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<path d="M5 12l5 5L20 7"></path>' +
      '</svg>' +
      '</span>' +
      '</button>';

    const ssrSvg = root.querySelector('svg')!;

    const checked = signal<boolean | 'mixed'>(true);
    const App = () => {
      const btn = __element('button', { role: 'checkbox' });
      __enterChildren(btn);

      const indicator = __element('span', { 'data-part': 'indicator' });
      __enterChildren(indicator);

      // Nested conditional: mixed → svg1, checked → svg2, else → null
      const cond = __conditional(
        () => checked.value === 'mixed',
        () => {
          // "mixed" branch — minus icon SVG
          const svg = __element('svg', { xmlns: SVG_NS, viewBox: '0 0 24 24' });
          __enterChildren(svg);
          const p1 = __element('path', { d: 'M5 12h14' });
          __append(svg, p1);
          __exitChildren();
          return svg;
        },
        () =>
          __conditional(
            () => !!checked.value,
            () => {
              // "checked" branch — checkmark SVG
              const svg = __element('svg', { xmlns: SVG_NS, viewBox: '0 0 24 24' });
              __enterChildren(svg);
              const p2 = __element('path', { d: 'M5 12l5 5L20 7' });
              __append(svg, p2);
              __exitChildren();
              return svg;
            },
            () => null,
          ) as unknown as Node,
      );
      __append(indicator, cond);

      __exitChildren();
      __append(btn, indicator);

      __exitChildren();
      return btn;
    };

    mount(App);

    // SSR SVG must be adopted (same reference), not duplicated
    const svgs = root.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toBe(ssrSvg);
    expect(root.querySelector('path')?.getAttribute('d')).toBe('M5 12l5 5L20 7');

    // Toggle off → no SVG
    checked.value = false;
    expect(root.querySelectorAll('svg')).toHaveLength(0);

    // Toggle back on → exactly one SVG (checkmark)
    checked.value = true;
    expect(root.querySelectorAll('svg')).toHaveLength(1);

    // Toggle to mixed → exactly one SVG (minus)
    checked.value = 'mixed';
    expect(root.querySelectorAll('svg')).toHaveLength(1);
    expect(root.querySelector('path')?.getAttribute('d')).toBe('M5 12h14');

    // Toggle back to checked → exactly one SVG (checkmark)
    checked.value = true;
    expect(root.querySelectorAll('svg')).toHaveLength(1);
    expect(root.querySelector('path')?.getAttribute('d')).toBe('M5 12l5 5L20 7');
  });

  it('__child disposes nested conditional effects on re-evaluation', () => {
    // Regression: __child did not run scope cleanup between evaluations,
    // so nested __conditional effects survived and produced orphaned DOM.
    root.innerHTML =
      '<div>' +
      '<span style="display: contents">' +
      '<!-- conditional -->' +
      '<span>hello</span>' +
      '</span>' +
      '</div>';

    const show = signal(true);
    const label = signal('hello');

    const App = () => {
      const el = __element('div');
      __enterChildren(el);

      const child = __child(() =>
        __conditional(
          () => show.value,
          () => {
            const s = __element('span');
            __enterChildren(s);
            __append(
              s,
              __text(() => label.value),
            );
            __exitChildren();
            return s;
          },
          () => null,
        ),
      );
      __append(el, child);

      __exitChildren();
      return el;
    };

    mount(App);

    const wrapper = root.querySelector('span[style*="contents"]')!;
    expect(wrapper).toBeTruthy();
    expect(wrapper.textContent).toContain('hello');

    // Toggle off
    show.value = false;
    // The span should be gone (replaced by a comment or empty)
    expect(wrapper.querySelectorAll('span')).toHaveLength(0);

    // Toggle back on — should have exactly one span, not duplicates
    show.value = true;
    expect(wrapper.querySelectorAll('span')).toHaveLength(1);
    expect(wrapper.textContent).toContain('hello');

    // Change label — should update, not create extra nodes
    label.value = 'world';
    expect(wrapper.querySelectorAll('span')).toHaveLength(1);
    expect(wrapper.textContent).toContain('world');
  });

  it('hydrateConditional falls back to CSR when no SSR comment anchor', () => {
    // If hydration is active but the SSR output has no comment anchor
    // (e.g., SSR/client route mismatch), __conditional should fall back to
    // CSR path instead of creating an orphaned anchor.
    // We test this at the unit level using startHydration/endHydration directly.
    const container = document.createElement('div');
    // SSR has a <span> but no <!-- conditional --> comment
    container.innerHTML = '<span>existing</span>';
    root.appendChild(container);

    const { startHydration, endHydration } = require('../hydrate/hydration-context');
    startHydration(container);

    const show = signal(true);

    // Claim the <span> so cursor advances past it
    __element('span');

    // This conditional has no comment anchor in SSR — should CSR-fallback
    const cond = __conditional(
      () => show.value,
      () => {
        const p = document.createElement('p');
        p.textContent = 'extra';
        return p;
      },
      () => null,
    );

    endHydration();

    // The CSR-fallback returns a DocumentFragment; append it to verify content
    container.appendChild(cond);

    // The <p> should be rendered (via CSR fallback)
    expect(container.querySelector('p')?.textContent).toBe('extra');

    // Toggle off — content should go away
    show.value = false;
    expect(container.querySelector('p')).toBeNull();

    // Toggle on — should come back
    show.value = true;
    expect(container.querySelector('p')?.textContent).toBe('extra');
  });
});
