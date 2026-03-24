import { describe, expect, test } from 'bun:test';
import { __child, __element, __insert, __staticText } from '../element';

describe('__child() resolves children thunks', () => {
  test('resolves a function value (thunk) returning a DOM node', () => {
    const parent = document.createElement('div');
    const childEl = document.createElement('span');
    childEl.textContent = 'hello from thunk';

    // Simulates: component receives children as a thunk () => Node
    // and renders {children} in JSX — compiler wraps as __child(() => children)
    // where children is itself a function
    const thunk = () => childEl;
    const result = __child(() => thunk);
    parent.appendChild(result);

    expect(parent.textContent).toBe('hello from thunk');
    expect(parent.innerHTML).not.toContain('[object Object]');
    expect(parent.innerHTML).not.toContain('=>');
    // comment anchor + child element
    expect(parent.childNodes[1]).toBe(childEl);

    result.dispose();
  });

  test('resolves a thunk returning a string', () => {
    const parent = document.createElement('div');
    const thunk = () => 'text from thunk';
    const result = __child(() => thunk);
    parent.appendChild(result);

    expect(parent.textContent).toBe('text from thunk');

    result.dispose();
  });

  test('resolves a thunk returning an array of nodes', () => {
    const parent = document.createElement('div');
    const a = document.createElement('span');
    a.textContent = 'first';
    const b = document.createElement('span');
    b.textContent = 'second';

    // Compiler wraps multiple children as: children: () => [child1, child2]
    const thunk = () => [a, b];
    const result = __child(() => thunk);
    parent.appendChild(result);

    expect(parent.textContent).toBe('firstsecond');
    // comment anchor + 2 child elements + end marker
    expect(parent.childNodes.length).toBe(4);

    result.dispose();
  });

  test('resolves nested thunks', () => {
    const parent = document.createElement('div');
    const el = document.createElement('p');
    el.textContent = 'nested';

    // thunk returning a thunk returning a node
    const inner = () => el;
    const outer = () => inner;
    const result = __child(() => outer);
    parent.appendChild(result);

    expect(parent.textContent).toBe('nested');

    result.dispose();
  });
});

describe('__child() resolves arrays', () => {
  test('resolves an array of DOM nodes returned by fn()', () => {
    const parent = document.createElement('div');
    const a = document.createElement('span');
    a.textContent = 'A';
    const b = document.createElement('span');
    b.textContent = 'B';

    // Simulates: {items.map(i => <span>{i}</span>)} in JSX
    // The compiler wraps this as __child(() => items.map(...)) when reactive
    const result = __child(() => [a, b] as unknown as Node);
    parent.appendChild(result);

    expect(parent.textContent).toBe('AB');
    expect(parent.innerHTML).not.toContain('[object Object]');
    // comment anchor + 2 elements + end marker
    expect(parent.childNodes.length).toBe(4);

    result.dispose();
  });
});

describe('__insert() resolves arrays directly', () => {
  test('resolves an array of DOM nodes', () => {
    const parent = document.createElement('div');
    const a = document.createElement('span');
    a.textContent = 'X';
    const b = document.createElement('span');
    b.textContent = 'Y';

    // Simulates: static .map() result passed to __insert
    __insert(parent, [a, b] as unknown as Node);

    expect(parent.textContent).toBe('XY');
    expect(parent.innerHTML).not.toContain('[object Object]');
    expect(parent.children.length).toBe(2);
  });
});

describe('__insert() resolves children thunks', () => {
  test('resolves a function value (thunk) returning a DOM node', () => {
    const parent = document.createElement('div');
    const childEl = document.createElement('span');
    childEl.textContent = 'inserted from thunk';

    const thunk = () => childEl;
    __insert(parent, thunk);

    expect(parent.textContent).toBe('inserted from thunk');
    expect(parent.innerHTML).not.toContain('[object Object]');
    expect(parent.children[0]).toBe(childEl);
  });

  test('resolves a thunk returning an array of nodes', () => {
    const parent = document.createElement('div');
    const a = document.createElement('span');
    a.textContent = 'A';
    const b = document.createElement('span');
    b.textContent = 'B';

    const thunk = () => [a, b];
    __insert(parent, thunk);

    expect(parent.textContent).toBe('AB');
    expect(parent.children.length).toBe(2);
  });
});
