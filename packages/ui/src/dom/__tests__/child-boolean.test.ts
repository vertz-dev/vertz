import { describe, expect, test } from 'vitest';
import { __child } from '../element';

describe('__child boolean handling', () => {
  test('renders nothing for boolean true', () => {
    const wrapper = __child(() => true);
    expect(wrapper.childNodes.length).toBe(0);
    expect(wrapper.textContent).toBe('');
    wrapper.dispose();
  });

  test('renders nothing for boolean false', () => {
    const wrapper = __child(() => false);
    expect(wrapper.childNodes.length).toBe(0);
    expect(wrapper.textContent).toBe('');
    wrapper.dispose();
  });
});
