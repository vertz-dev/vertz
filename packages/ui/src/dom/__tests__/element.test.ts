import { describe, expect, it } from 'vitest';
import { signal } from '../../runtime/signal';
import { __element, __text } from '../element';

describe('__text', () => {
  it('creates a text node with initial content', () => {
    const node = __text(() => 'hello');
    expect(node.data).toBe('hello');
  });

  it('updates text when signal changes', () => {
    const name = signal('world');
    const node = __text(() => `hello ${name.value}`);
    expect(node.data).toBe('hello world');
    name.value = 'vertz';
    expect(node.data).toBe('hello vertz');
  });

  it('works with computed expressions', () => {
    const count = signal(0);
    const node = __text(() => `Count: ${count.value}`);
    expect(node.data).toBe('Count: 0');
    count.value = 5;
    expect(node.data).toBe('Count: 5');
  });
});

describe('__element', () => {
  it('creates an element with the given tag', () => {
    const el = __element('div');
    expect(el.tagName).toBe('DIV');
  });

  it('sets static attributes from props', () => {
    const el = __element('input', { type: 'text', placeholder: 'Enter name' });
    expect(el.getAttribute('type')).toBe('text');
    expect(el.getAttribute('placeholder')).toBe('Enter name');
  });

  it('creates an element without props', () => {
    const el = __element('span');
    expect(el.tagName).toBe('SPAN');
    expect(el.attributes.length).toBe(0);
  });
});
