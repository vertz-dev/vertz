import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { Command } from '../command';

describe('Command', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('input has role="combobox" and aria-autocomplete="list"', () => {
    const { input } = Command.Root();
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
  });

  it('input has aria-expanded="true"', () => {
    const { input } = Command.Root();
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('list has role="listbox"', () => {
    const { list } = Command.Root();
    expect(list.getAttribute('role')).toBe('listbox');
  });

  it('items have role="option"', () => {
    const { Item } = Command.Root();
    const item = Item('apple', 'Apple');
    expect(item.getAttribute('role')).toBe('option');
    expect(item.getAttribute('data-value')).toBe('apple');
    expect(item.textContent).toBe('Apple');
  });

  it('first item has aria-selected="true" (active by default)', () => {
    const { Item } = Command.Root();
    const item1 = Item('apple', 'Apple');
    Item('banana', 'Banana');
    expect(item1.getAttribute('aria-selected')).toBe('true');
  });

  it('ArrowDown moves to next item', () => {
    const { input, Item } = Command.Root();
    container.appendChild(input);
    const item1 = Item('apple', 'Apple');
    const item2 = Item('banana', 'Banana');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(item1.getAttribute('aria-selected')).toBe('false');
    expect(item2.getAttribute('aria-selected')).toBe('true');
  });

  it('ArrowUp moves to previous item', () => {
    const { input, state, Item } = Command.Root();
    container.appendChild(input);
    const item1 = Item('apple', 'Apple');
    const item2 = Item('banana', 'Banana');

    // Move down first
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(state.activeIndex.peek()).toBe(1);

    // Move back up
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(state.activeIndex.peek()).toBe(0);
    expect(item1.getAttribute('aria-selected')).toBe('true');
    expect(item2.getAttribute('aria-selected')).toBe('false');
  });

  it('Enter fires onSelect with active item value', () => {
    const onSelect = vi.fn();
    const { input, Item } = Command.Root({ onSelect });
    container.appendChild(input);
    Item('apple', 'Apple');
    Item('banana', 'Banana');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('apple');
  });

  it('typing filters items — non-matching are hidden', () => {
    const { input, Item } = Command.Root();
    container.appendChild(input);
    const apple = Item('apple', 'Apple');
    const banana = Item('banana', 'Banana');

    input.value = 'app';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(apple.getAttribute('aria-hidden')).toBe('false');
    expect(banana.getAttribute('aria-hidden')).toBe('true');
  });

  it('ArrowDown skips hidden items', () => {
    const { input, state, Item } = Command.Root();
    container.appendChild(input);
    const apple = Item('apple', 'Apple');
    const banana = Item('banana', 'Banana');
    const cherry = Item('cherry', 'Cherry');

    // Filter to hide banana (only apple and cherry visible)
    input.value = 'e';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // apple and cherry contain 'e', banana does not
    expect(apple.getAttribute('aria-hidden')).toBe('false');
    expect(banana.getAttribute('aria-hidden')).toBe('true');
    expect(cherry.getAttribute('aria-hidden')).toBe('false');

    // Active should be on first visible (apple)
    expect(state.activeIndex.peek()).toBe(0);
    expect(apple.getAttribute('aria-selected')).toBe('true');

    // ArrowDown goes to cherry (next visible, skipping hidden banana)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(state.activeIndex.peek()).toBe(1);
    expect(cherry.getAttribute('aria-selected')).toBe('true');
  });

  it('groups have role="group" and aria-labelledby', () => {
    const { Group } = Command.Root();
    const group = Group('Fruits');

    expect(group.el.getAttribute('role')).toBe('group');
    const labelId = group.el.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();

    const heading = group.el.querySelector(`#${labelId}`);
    expect(heading).toBeTruthy();
    expect(heading?.textContent).toBe('Fruits');
  });

  it('group headings auto-hide when all items filtered out', () => {
    const { input, Group } = Command.Root();
    container.appendChild(input);
    const group = Group('Fruits');
    group.Item('apple', 'Apple');
    group.Item('banana', 'Banana');

    // Filter with something that won't match
    input.value = 'xyz';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const labelId = group.el.getAttribute('aria-labelledby') ?? '';
    const heading = group.el.querySelector(`#${labelId}`);
    expect(heading?.getAttribute('aria-hidden')).toBe('true');
    expect(group.el.style.display).toBe('none');
  });

  it('empty state shown when no matches', () => {
    const { input, empty, Item } = Command.Root();
    container.appendChild(input);
    Item('apple', 'Apple');

    expect(empty.getAttribute('aria-hidden')).toBe('true');

    input.value = 'xyz';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(empty.getAttribute('aria-hidden')).toBe('false');
  });

  it('Escape clears input', () => {
    const onInputChange = vi.fn();
    const { input, state } = Command.Root({ onInputChange });
    container.appendChild(input);

    input.value = 'test';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(state.inputValue.peek()).toBe('test');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(input.value).toBe('');
    expect(state.inputValue.peek()).toBe('');
    expect(onInputChange).toHaveBeenCalledWith('');
  });

  it('keywords match during filter', () => {
    const { input, Item } = Command.Root();
    container.appendChild(input);
    const item = Item('calc', 'Calculator', ['math', 'numbers']);

    input.value = 'math';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(item.getAttribute('aria-hidden')).toBe('false');
  });

  it('click on item fires onSelect', () => {
    const onSelect = vi.fn();
    const { Item } = Command.Root({ onSelect });
    const item = Item('apple', 'Apple');

    item.click();
    expect(onSelect).toHaveBeenCalledWith('apple');
  });

  it('input aria-controls points to list id', () => {
    const { input, list } = Command.Root();
    expect(input.getAttribute('aria-controls')).toBe(list.id);
  });

  it('separator has role="separator"', () => {
    const { Separator } = Command.Root();
    const sep = Separator();
    expect(sep.getAttribute('role')).toBe('separator');
  });

  it('sets placeholder on input when provided', () => {
    const { input } = Command.Root({ placeholder: 'Type a command...' });
    expect(input.placeholder).toBe('Type a command...');
  });

  it('calls onInputChange when typing', () => {
    const onInputChange = vi.fn();
    const { input } = Command.Root({ onInputChange });
    container.appendChild(input);

    input.value = 'hello';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onInputChange).toHaveBeenCalledWith('hello');
  });
});
