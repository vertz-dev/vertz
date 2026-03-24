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

  test('__child() returns a DocumentFragment containing a comment anchor', () => {
    const result = __child(() => 'hello');
    const parent = document.createElement('div');
    parent.appendChild(result);

    // The parent should contain a comment anchor followed by a text node
    const comment = parent.childNodes[0];
    expect(comment.nodeType).toBe(8); // Comment node
    expect((comment as Comment).data).toBe('child');

    // Content is a sibling of the comment, not inside a span
    const content = parent.childNodes[1];
    expect(content.nodeType).toBe(3); // Text node
    expect(content.textContent).toBe('hello');

    // No span wrapper in the DOM
    expect(parent.querySelector('span')).toBeNull();

    result.dispose();
  });

  test('__child() appends HTMLElement directly, not as string', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    child.textContent = 'child content';

    // __child() inserts the Node as a sibling after the comment anchor
    const result = __child(() => child);
    parent.appendChild(result);

    // The child element should be after the comment anchor (not stringified)
    expect(parent.textContent).toBe('child content');
    expect(parent.innerHTML).not.toContain('[object HTMLElement]');
    // comment anchor + child element + end marker
    expect(parent.childNodes.length).toBe(3);
    expect(parent.childNodes[1]).toBe(child);

    result.dispose();
  });

  test('__child() converts primitives to text nodes', () => {
    const parent = document.createElement('div');

    // String
    const strResult = __child(() => 'hello');
    parent.appendChild(strResult);
    expect(parent.textContent).toBe('hello');
    strResult.dispose();

    // Number
    parent.textContent = '';
    const numResult = __child(() => 42);
    parent.appendChild(numResult);
    expect(parent.textContent).toBe('42');
    numResult.dispose();
  });

  test('__child() handles null and undefined', () => {
    const parent = document.createElement('div');

    const result = __child(() => null);
    parent.appendChild(result);
    // Comment anchor + end marker, no content
    expect(parent.childNodes.length).toBe(2);
    expect(parent.childNodes[0]?.nodeType).toBe(8); // Comment anchor
    expect(parent.childNodes[1]?.nodeType).toBe(8); // End marker
    expect(parent.textContent).toBe('');

    result.dispose();
  });

  test('__child() updates text content in-place when fn() returns a string', () => {
    const name = signal('Jane');
    const parent = document.createElement('div');

    const result = __child(() => `Hello ${name.value}`);
    parent.appendChild(result);

    // Initial render: comment + text node
    expect(parent.textContent).toBe('Hello Jane');
    const textNode = parent.childNodes[1]; // after comment
    expect(textNode.nodeType).toBe(3); // Text node

    // Update signal — text should update in-place (same text node)
    name.value = 'Bob';
    expect(parent.textContent).toBe('Hello Bob');
    expect(parent.childNodes[1]).toBe(textNode); // Same text node reference

    result.dispose();
  });

  test('__child() updates text in-place for number-to-string transitions', () => {
    const val = signal<string | number>('hello');
    const parent = document.createElement('div');

    const result = __child(() => val.value);
    parent.appendChild(result);

    expect(parent.textContent).toBe('hello');
    const textNode = parent.childNodes[1]; // after comment

    // Change to number — should still update in-place
    val.value = 42;
    expect(parent.textContent).toBe('42');
    expect(parent.childNodes[1]).toBe(textNode); // Same text node

    // Back to string
    val.value = 'world';
    expect(parent.textContent).toBe('world');
    expect(parent.childNodes[1]).toBe(textNode); // Same text node

    result.dispose();
  });

  test('__child() transitions from text to null correctly', () => {
    const val = signal<string | null>('hello');
    const parent = document.createElement('div');

    const result = __child(() => val.value);
    parent.appendChild(result);

    expect(parent.textContent).toBe('hello');
    expect(parent.childNodes.length).toBe(3); // comment + text + end marker

    // Transition to null — should remove the text node
    val.value = null;
    expect(parent.textContent).toBe('');
    expect(parent.childNodes.length).toBe(2); // comment + end marker

    // Back to text — creates a new text node
    val.value = 'world';
    expect(parent.textContent).toBe('world');
    expect(parent.childNodes.length).toBe(3); // comment + text + end marker

    result.dispose();
  });

  test('__child() transitions from text to Node correctly', () => {
    const node = document.createElement('span');
    node.textContent = 'element';
    const val = signal<string | Node>('text');
    const parent = document.createElement('div');

    const result = __child(() => val.value);
    parent.appendChild(result);

    expect(parent.textContent).toBe('text');
    expect(parent.childNodes.length).toBe(3); // comment + text + end marker
    expect(parent.childNodes[1]?.nodeType).toBe(3); // Text node

    // Transition to Node — should replace text with the element
    val.value = node;
    expect(parent.textContent).toBe('element');
    expect(parent.childNodes.length).toBe(3); // comment + element + end marker
    expect(parent.childNodes[1]).toBe(node);

    result.dispose();
  });

  test('__child() handles falsy number 0 correctly in text fast-path', () => {
    const val = signal<number>(1);
    const parent = document.createElement('div');

    const result = __child(() => val.value);
    parent.appendChild(result);

    expect(parent.textContent).toBe('1');
    const textNode = parent.childNodes[1]; // after comment

    // 0 is falsy but should render as "0", not empty
    val.value = 0;
    expect(parent.textContent).toBe('0');
    expect(parent.childNodes[1]).toBe(textNode); // Same text node — in-place update

    result.dispose();
  });

  test('__child() skips DOM operations when fn() returns same Node reference', () => {
    const s = signal(0);
    const stableNode = document.createElement('div');
    stableNode.textContent = 'stable';
    const parent = document.createElement('div');

    const result = __child(() => {
      s.value; // subscribe to signal
      return stableNode;
    });
    parent.appendChild(result);

    // Initial render: stableNode is after the comment anchor
    expect(parent.childNodes[1]).toBe(stableNode);

    // Spy on removeChild after initial render
    let removeCount = 0;
    const origRemoveChild = parent.removeChild.bind(parent);
    parent.removeChild = <T extends Node>(child: T): T => {
      removeCount++;
      return origRemoveChild(child);
    };

    // Trigger re-evaluation — same node returned
    s.value = 1;

    // Should NOT have removed anything (stable-node optimization)
    expect(removeCount).toBe(0);
    expect(parent.childNodes[1]).toBe(stableNode);
    expect(parent.childNodes.length).toBe(3); // comment + stableNode + end marker

    result.dispose();
  });

  test('__child() handles array containing DocumentFragment children', () => {
    const parent = document.createElement('div');

    // Simulate what happens when children include a __child() result (DocumentFragment)
    // followed by other nodes — the bug was that inserting a DocumentFragment empties it
    // and leaves parentNode = null, crashing the next sibling insertion.
    const innerChild = __child(() => 'inner content');
    const span = document.createElement('span');
    span.textContent = 'after fragment';

    const result = __child(() => [innerChild, span]);
    parent.appendChild(result);

    // Both the inner content and the span should be present
    expect(parent.textContent).toContain('inner content');
    expect(parent.textContent).toContain('after fragment');

    result.dispose();
  });

  test('__child() re-renders correctly when value changes from DocumentFragment array', () => {
    const parent = document.createElement('div');
    const s = signal(0);

    const result = __child(() => {
      if (s.value === 0) {
        const inner = __child(() => 'fragment content');
        const span = document.createElement('span');
        span.textContent = 'after';
        return [inner, span];
      }
      return 'simple text';
    });
    parent.appendChild(result);

    expect(parent.textContent).toContain('fragment content');
    expect(parent.textContent).toContain('after');

    // Re-render: old DocumentFragment children should be cleaned up
    s.value = 1;
    expect(parent.textContent).toBe('simple text');

    result.dispose();
  });

  test('__child() handles array with multiple DocumentFragment children', () => {
    const parent = document.createElement('div');

    const child1 = __child(() => 'first');
    const child2 = __child(() => 'second');
    const child3 = __child(() => 'third');

    const result = __child(() => [child1, child2, child3]);
    parent.appendChild(result);

    expect(parent.textContent).toContain('first');
    expect(parent.textContent).toContain('second');
    expect(parent.textContent).toContain('third');

    result.dispose();
  });
});
