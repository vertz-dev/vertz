import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { ToggleGroup } from '../toggle-group';

describe('ToggleGroup', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('root has role="group"', () => {
    const { root } = ToggleGroup.Root();
    expect(root.getAttribute('role')).toBe('group');
  });

  it('sets data-orientation attribute', () => {
    const horizontal = ToggleGroup.Root();
    expect(horizontal.root.getAttribute('data-orientation')).toBe('horizontal');

    const vertical = ToggleGroup.Root({ orientation: 'vertical' });
    expect(vertical.root.getAttribute('data-orientation')).toBe('vertical');
  });

  it('items have aria-pressed="false" by default', () => {
    const { Item } = ToggleGroup.Root();
    const item = Item('a');
    expect(item.getAttribute('aria-pressed')).toBe('false');
  });

  it('items have data-state="off" by default', () => {
    const { Item } = ToggleGroup.Root();
    const item = Item('a');
    expect(item.getAttribute('data-state')).toBe('off');
  });

  it('single mode: click item selects it', () => {
    const { Item } = ToggleGroup.Root();
    const item = Item('a');
    container.appendChild(item);

    item.click();
    expect(item.getAttribute('aria-pressed')).toBe('true');
    expect(item.getAttribute('data-state')).toBe('on');
  });

  it('single mode: click different item deselects first, selects second', () => {
    const { root, Item } = ToggleGroup.Root();
    const itemA = Item('a');
    const itemB = Item('b');
    container.appendChild(root);

    itemA.click();
    expect(itemA.getAttribute('aria-pressed')).toBe('true');

    itemB.click();
    expect(itemA.getAttribute('aria-pressed')).toBe('false');
    expect(itemA.getAttribute('data-state')).toBe('off');
    expect(itemB.getAttribute('aria-pressed')).toBe('true');
    expect(itemB.getAttribute('data-state')).toBe('on');
  });

  it('multiple mode: click multiple items selects all', () => {
    const { root, Item, state } = ToggleGroup.Root({ type: 'multiple' });
    const itemA = Item('a');
    const itemB = Item('b');
    container.appendChild(root);

    itemA.click();
    itemB.click();
    expect(itemA.getAttribute('aria-pressed')).toBe('true');
    expect(itemB.getAttribute('aria-pressed')).toBe('true');
    expect(state.value.peek()).toEqual(['a', 'b']);
  });

  it('multiple mode: click selected item deselects it', () => {
    const { root, Item, state } = ToggleGroup.Root({ type: 'multiple' });
    const itemA = Item('a');
    Item('b');
    container.appendChild(root);

    itemA.click();
    expect(state.value.peek()).toEqual(['a']);

    itemA.click();
    expect(itemA.getAttribute('aria-pressed')).toBe('false');
    expect(itemA.getAttribute('data-state')).toBe('off');
    expect(state.value.peek()).toEqual([]);
  });

  it('applies roving tabindex to items', () => {
    const { Item } = ToggleGroup.Root();
    const itemA = Item('a');
    const itemB = Item('b');

    expect(itemA.getAttribute('tabindex')).toBe('0');
    expect(itemB.getAttribute('tabindex')).toBe('-1');
  });

  it('arrow key navigation moves focus between items', () => {
    const { root, Item } = ToggleGroup.Root();
    const itemA = Item('a');
    const itemB = Item('b');
    container.appendChild(root);

    itemA.focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(document.activeElement).toBe(itemB);
    expect(itemB.getAttribute('tabindex')).toBe('0');
    expect(itemA.getAttribute('tabindex')).toBe('-1');
  });

  it('calls onValueChange when value changes', () => {
    const onValueChange = vi.fn();
    const { root, Item } = ToggleGroup.Root({ onValueChange });
    const item = Item('a');
    container.appendChild(root);

    item.click();
    expect(onValueChange).toHaveBeenCalledWith(['a']);

    item.click();
    expect(onValueChange).toHaveBeenCalledWith([]);
  });

  it('supports defaultValue: items start selected', () => {
    const { Item, state } = ToggleGroup.Root({ defaultValue: ['b'] });
    const itemA = Item('a');
    const itemB = Item('b');

    expect(itemA.getAttribute('aria-pressed')).toBe('false');
    expect(itemB.getAttribute('aria-pressed')).toBe('true');
    expect(itemB.getAttribute('data-state')).toBe('on');
    expect(state.value.peek()).toEqual(['b']);
  });

  it('disabled: does not toggle on click', () => {
    const { root, Item, state } = ToggleGroup.Root({ disabled: true });
    const item = Item('a');
    container.appendChild(root);

    expect(item.disabled).toBe(true);
    expect(item.getAttribute('aria-disabled')).toBe('true');

    item.click();
    expect(state.value.peek()).toEqual([]);
    expect(item.getAttribute('aria-pressed')).toBe('false');
  });
});
