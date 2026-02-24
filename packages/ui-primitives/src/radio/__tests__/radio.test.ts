import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { Radio } from '../radio';

describe('Radio', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('creates radiogroup with correct role', () => {
    const { root } = Radio.Root();
    expect(root.getAttribute('role')).toBe('radiogroup');
  });

  it('creates items with role="radio"', () => {
    const { root, Item } = Radio.Root();
    container.appendChild(root);
    const item = Item('opt1', 'Option 1');

    expect(item.getAttribute('role')).toBe('radio');
    expect(item.getAttribute('data-value')).toBe('opt1');
  });

  it('selects item on click', () => {
    const onValueChange = vi.fn();
    const { root, state, Item } = Radio.Root({ onValueChange });
    container.appendChild(root);
    const item = Item('opt1', 'Option 1');
    Item('opt2', 'Option 2');

    item.click();
    expect(state.value.peek()).toBe('opt1');
    expect(item.getAttribute('aria-checked')).toBe('true');
    expect(onValueChange).toHaveBeenCalledWith('opt1');
  });

  it('only one item can be selected', () => {
    const { root, state, Item } = Radio.Root();
    container.appendChild(root);
    const item1 = Item('opt1', 'Option 1');
    const item2 = Item('opt2', 'Option 2');

    item1.click();
    expect(item1.getAttribute('aria-checked')).toBe('true');
    expect(item2.getAttribute('aria-checked')).toBe('false');

    item2.click();
    expect(item1.getAttribute('aria-checked')).toBe('false');
    expect(item2.getAttribute('aria-checked')).toBe('true');
    expect(state.value.peek()).toBe('opt2');
  });

  it('supports defaultValue', () => {
    const { root, Item } = Radio.Root({ defaultValue: 'opt2' });
    container.appendChild(root);
    const item1 = Item('opt1', 'Option 1');
    const item2 = Item('opt2', 'Option 2');

    expect(item1.getAttribute('aria-checked')).toBe('false');
    expect(item2.getAttribute('aria-checked')).toBe('true');
  });

  it('navigates with ArrowDown', () => {
    const { root, Item } = Radio.Root();
    container.appendChild(root);
    const item1 = Item('opt1', 'Option 1');
    const item2 = Item('opt2', 'Option 2');

    item1.focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(item2);
  });

  it('sets data-state on items', () => {
    const { root, Item } = Radio.Root({ defaultValue: 'opt1' });
    container.appendChild(root);
    const item1 = Item('opt1', 'Option 1');
    const item2 = Item('opt2', 'Option 2');

    expect(item1.getAttribute('data-state')).toBe('checked');
    expect(item2.getAttribute('data-state')).toBe('unchecked');
  });
});
