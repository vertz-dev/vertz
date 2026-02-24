import { describe, expect, test } from 'bun:test';
import { __child, __text } from '../element';

describe('Child node rendering', () => {
  test('setting text.data to HTMLElement stringifies it', () => {
    const text = document.createTextNode('');
    const span = document.createElement('span');
    span.textContent = 'hello';

    // Setting text.data to an object calls its toString()
    text.data = span as unknown as string;

    // In a real browser (and happy-dom), this converts to string
    expect(typeof text.data).toBe('string');
  });

  test('__text() with HTMLElement stringifies it (regression test)', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    child.textContent = 'child content';

    // This demonstrates the bug: __text calls node.data = fn(), which stringifies HTMLElements
    const textNode = __text(() => child as unknown as string);
    parent.appendChild(textNode);

    // In happy-dom, this renders as HTML. In real browsers, it would be "[object HTMLElement]"
    // The key insight: we should use __child() instead of __text() for expressions that might return Nodes
    expect(parent.textContent).toBeTruthy();
    expect(typeof parent.textContent).toBe('string');
  });

  test('__child() appends HTMLElement directly, not as string', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    child.textContent = 'child content';

    // __child() checks if value is a Node and appends directly (inside a wrapper)
    const wrapper = __child(() => child);
    parent.appendChild(wrapper);

    // The child element should be inside the wrapper (not stringified)
    expect(parent.textContent).toBe('child content');
    expect(parent.innerHTML).not.toContain('[object HTMLElement]');
    expect(wrapper.children.length).toBe(1);
    expect(wrapper.children[0]).toBe(child);

    wrapper.dispose();
  });

  test('__child() converts primitives to text nodes', () => {
    const parent = document.createElement('div');

    // String
    const strMarker = __child(() => 'hello');
    parent.appendChild(strMarker);
    expect(parent.textContent).toBe('hello');
    strMarker.dispose();

    // Number
    parent.textContent = '';
    const numMarker = __child(() => 42);
    parent.appendChild(numMarker);
    expect(parent.textContent).toBe('42');
    numMarker.dispose();
  });

  test('__child() handles null and undefined', () => {
    const parent = document.createElement('div');

    const marker = __child(() => null);
    parent.appendChild(marker);
    expect(parent.textContent).toBe('');

    marker.dispose();
  });
});
