import { describe, expect, test } from 'bun:test';
import { signal } from '../../runtime/signal';
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

  test('__child() updates text content in-place when fn() returns a string', () => {
    const name = signal('Jane');

    const wrapper = __child(() => `Hello ${name.value}`);

    // Initial render: wrapper has a single text node
    expect(wrapper.textContent).toBe('Hello Jane');
    expect(wrapper.childNodes.length).toBe(1);
    const textNode = wrapper.firstChild!;
    expect(textNode.nodeType).toBe(3); // Text node

    // Update signal — text should update in-place (same text node)
    name.value = 'Bob';
    expect(wrapper.textContent).toBe('Hello Bob');
    expect(wrapper.childNodes.length).toBe(1);
    expect(wrapper.firstChild).toBe(textNode); // Same text node reference

    wrapper.dispose();
  });

  test('__child() updates text in-place for number-to-string transitions', () => {
    const val = signal<string | number>('hello');

    const wrapper = __child(() => val.value);

    expect(wrapper.textContent).toBe('hello');
    const textNode = wrapper.firstChild!;

    // Change to number — should still update in-place
    val.value = 42;
    expect(wrapper.textContent).toBe('42');
    expect(wrapper.firstChild).toBe(textNode); // Same text node

    // Back to string
    val.value = 'world';
    expect(wrapper.textContent).toBe('world');
    expect(wrapper.firstChild).toBe(textNode); // Same text node

    wrapper.dispose();
  });

  test('__child() transitions from text to null correctly', () => {
    const val = signal<string | null>('hello');

    const wrapper = __child(() => val.value);

    expect(wrapper.textContent).toBe('hello');
    expect(wrapper.childNodes.length).toBe(1);

    // Transition to null — should clear the text node
    val.value = null;
    expect(wrapper.textContent).toBe('');
    expect(wrapper.childNodes.length).toBe(0);

    // Back to text — creates a new text node
    val.value = 'world';
    expect(wrapper.textContent).toBe('world');
    expect(wrapper.childNodes.length).toBe(1);

    wrapper.dispose();
  });

  test('__child() transitions from text to Node correctly', () => {
    const node = document.createElement('span');
    node.textContent = 'element';
    const val = signal<string | Node>('text');

    const wrapper = __child(() => val.value);

    expect(wrapper.textContent).toBe('text');
    expect(wrapper.childNodes.length).toBe(1);
    expect(wrapper.firstChild!.nodeType).toBe(3); // Text node

    // Transition to Node — should replace text with the element
    val.value = node;
    expect(wrapper.textContent).toBe('element');
    expect(wrapper.childNodes.length).toBe(1);
    expect(wrapper.firstChild).toBe(node);

    wrapper.dispose();
  });

  test('__child() handles falsy number 0 correctly in text fast-path', () => {
    const val = signal<number>(1);

    const wrapper = __child(() => val.value);

    expect(wrapper.textContent).toBe('1');
    const textNode = wrapper.firstChild!;

    // 0 is falsy but should render as "0", not empty
    val.value = 0;
    expect(wrapper.textContent).toBe('0');
    expect(wrapper.firstChild).toBe(textNode); // Same text node — in-place update

    wrapper.dispose();
  });

  test('__child() skips DOM operations when fn() returns same Node reference', () => {
    const s = signal(0);
    const stableNode = document.createElement('div');
    stableNode.textContent = 'stable';

    const wrapper = __child(() => {
      s.value; // subscribe to signal
      return stableNode;
    });

    // Initial render: stableNode is inside wrapper
    expect(wrapper.children[0]).toBe(stableNode);

    // Spy on removeChild after initial render
    let removeCount = 0;
    const origRemoveChild = wrapper.removeChild.bind(wrapper);
    wrapper.removeChild = <T extends Node>(child: T): T => {
      removeCount++;
      return origRemoveChild(child);
    };

    // Trigger re-evaluation — same node returned
    s.value = 1;

    // Should NOT have removed anything (stable-node optimization)
    expect(removeCount).toBe(0);
    expect(wrapper.children[0]).toBe(stableNode);
    expect(wrapper.children.length).toBe(1);

    wrapper.dispose();
  });
});
