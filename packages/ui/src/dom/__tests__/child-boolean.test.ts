import { describe, expect, test } from 'bun:test';
import { __child } from '../element';

describe('__child boolean handling', () => {
  test('renders nothing for boolean true', () => {
    const parent = document.createElement('div');
    const result = __child(() => true);
    parent.appendChild(result);
    // Only the comment anchor, no content
    expect(parent.childNodes.length).toBe(1);
    expect(parent.childNodes[0].nodeType).toBe(8); // Comment
    expect(parent.textContent).toBe('');
    result.dispose();
  });

  test('renders nothing for boolean false', () => {
    const parent = document.createElement('div');
    const result = __child(() => false);
    parent.appendChild(result);
    // Only the comment anchor, no content
    expect(parent.childNodes.length).toBe(1);
    expect(parent.childNodes[0].nodeType).toBe(8); // Comment
    expect(parent.textContent).toBe('');
    result.dispose();
  });
});
