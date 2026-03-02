import { describe, expect, test } from 'bun:test';
import { endHydration, startHydration } from '../../hydrate/hydration-context';
import { __insert } from '../element';

describe('__insert (static child insertion)', () => {
  test('appends a DOM node directly', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    child.textContent = 'hello';

    __insert(parent, child);

    expect(parent.firstChild).toBe(child);
    expect(parent.innerHTML).toBe('<span>hello</span>');
  });

  test('creates a text node for strings', () => {
    const parent = document.createElement('div');
    __insert(parent, 'hello');
    expect(parent.textContent).toBe('hello');
    expect(parent.firstChild).toBeInstanceOf(Text);
  });

  test('creates a text node for numbers', () => {
    const parent = document.createElement('div');
    __insert(parent, 42);
    expect(parent.textContent).toBe('42');
  });

  test('does nothing for null', () => {
    const parent = document.createElement('div');
    __insert(parent, null);
    expect(parent.childNodes.length).toBe(0);
  });

  test('does nothing for undefined', () => {
    const parent = document.createElement('div');
    __insert(parent, undefined);
    expect(parent.childNodes.length).toBe(0);
  });

  test('does nothing for boolean false', () => {
    const parent = document.createElement('div');
    __insert(parent, false);
    expect(parent.childNodes.length).toBe(0);
  });

  test('does nothing for boolean true', () => {
    const parent = document.createElement('div');
    __insert(parent, true);
    expect(parent.childNodes.length).toBe(0);
  });

  test('handles DocumentFragment correctly', () => {
    const parent = document.createElement('div');
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createElement('p'));
    frag.appendChild(document.createElement('span'));

    __insert(parent, frag);

    expect(parent.children.length).toBe(2);
    expect(parent.children[0]?.tagName).toBe('P');
    expect(parent.children[1]?.tagName).toBe('SPAN');
  });

  describe('hydration', () => {
    test('does not duplicate array children during hydration', () => {
      // Reproduces the dashboard card duplication bug:
      // SSR renders a grid with 4 card divs. During hydration, the .map()
      // callback uses jsxDEV (not __element), creating NEW elements.
      // __insert receives the array and calls resolveAndAppend which
      // appends the new elements — but the SSR cards are still there.
      // Result: 8 cards instead of 4.
      const parent = document.createElement('div');
      parent.innerHTML =
        '<div class="card">A</div>' +
        '<div class="card">B</div>' +
        '<div class="card">C</div>' +
        '<div class="card">D</div>';

      startHydration(parent);

      // Simulate what .map() does during hydration: creates NEW elements
      // (not claimed from SSR) because jsxDEV doesn't use __element.
      const newCards = ['A', 'B', 'C', 'D'].map((text) => {
        const div = document.createElement('div');
        div.className = 'card';
        div.textContent = text;
        return div;
      });

      __insert(parent, newCards);

      endHydration();

      // Should NOT duplicate — SSR cards are already in place
      expect(parent.children.length).toBe(4);
    });

    test('does not duplicate thunk children during hydration', () => {
      // Children passed as thunks (e.g. layout {children} prop) should
      // not be re-appended during hydration.
      const parent = document.createElement('div');
      parent.innerHTML = '<section>content</section>';

      startHydration(parent);

      const thunk = () => {
        const section = document.createElement('section');
        section.textContent = 'content';
        return section;
      };

      __insert(parent, thunk);

      endHydration();

      expect(parent.children.length).toBe(1);
    });
  });
});
