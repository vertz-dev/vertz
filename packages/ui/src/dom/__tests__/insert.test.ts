import { describe, expect, test } from 'vitest';
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
    expect(parent.children[0]!.tagName).toBe('P');
    expect(parent.children[1]!.tagName).toBe('SPAN');
  });
});
