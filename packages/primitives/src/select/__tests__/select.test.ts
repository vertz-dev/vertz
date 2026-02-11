import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Select } from '../select';

describe('Select', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('creates select with correct ARIA roles', () => {
    const { trigger, content } = Select.Root();
    expect(trigger.getAttribute('role')).toBe('combobox');
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(content.getAttribute('role')).toBe('listbox');
  });

  it('is closed by default', () => {
    const { trigger, content, state } = Select.Root();
    expect(state.open.peek()).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(content.getAttribute('data-state')).toBe('closed');
  });

  it('opens on trigger click', () => {
    const { trigger, content, state, Item } = Select.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'Option A');
    Item('b', 'Option B');

    trigger.click();
    expect(state.open.peek()).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('creates items with role="option"', () => {
    const { trigger, content, Item } = Select.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    const itemA = Item('a', 'Option A');

    expect(itemA.getAttribute('role')).toBe('option');
    expect(itemA.getAttribute('data-value')).toBe('a');
    expect(itemA.textContent).toBe('Option A');
  });

  it('selects item on click', () => {
    const onValueChange = vi.fn();
    const { trigger, content, state, Item } = Select.Root({ onValueChange });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();
    const itemB = Item('b', 'Option B');
    itemB.click();

    expect(state.value.peek()).toBe('b');
    expect(onValueChange).toHaveBeenCalledWith('b');
    expect(state.open.peek()).toBe(false);
  });

  it('navigates with ArrowDown key', () => {
    const { trigger, content, Item } = Select.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    const itemA = Item('a', 'A');
    const itemB = Item('b', 'B');

    trigger.click();
    itemA.focus();

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(itemB);
  });

  it('selects with Enter key', () => {
    const onValueChange = vi.fn();
    const { trigger, content, state, Item } = Select.Root({ onValueChange });
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');
    Item('b', 'B');

    trigger.click();

    // Navigate down then press Enter
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(state.value.peek()).toBe('b');
  });

  it('closes on Escape', () => {
    const { trigger, content, state, Item } = Select.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');

    trigger.click();
    expect(state.open.peek()).toBe(true);

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(state.open.peek()).toBe(false);
  });

  it('sets data-state on items', () => {
    const { trigger, content, Item } = Select.Root({ defaultValue: 'a' });
    container.appendChild(trigger);
    container.appendChild(content);
    const itemA = Item('a', 'A');
    const itemB = Item('b', 'B');

    expect(itemA.getAttribute('data-state')).toBe('active');
    expect(itemB.getAttribute('data-state')).toBe('inactive');
  });
});
