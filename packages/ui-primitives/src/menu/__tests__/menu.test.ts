import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { Menu } from '../menu';

describe('Menu', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('creates menu with correct ARIA roles', () => {
    const { trigger, content } = Menu.Root();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(content.getAttribute('role')).toBe('menu');
  });

  it('creates items with role="menuitem"', () => {
    const { trigger, content, Item } = Menu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    const item = Item('edit', 'Edit');

    expect(item.getAttribute('role')).toBe('menuitem');
    expect(item.getAttribute('data-value')).toBe('edit');
  });

  it('opens on trigger click', () => {
    const { trigger, content, state, Item } = Menu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');

    trigger.click();
    expect(state.open.peek()).toBe(true);
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('calls onSelect when item is clicked', () => {
    const onSelect = vi.fn();
    const { trigger, content, Item } = Menu.Root({ onSelect });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();
    const item = Item('edit', 'Edit');
    item.click();

    expect(onSelect).toHaveBeenCalledWith('edit');
  });

  it('closes on Escape', () => {
    const { trigger, content, state, Item } = Menu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');

    trigger.click();
    expect(state.open.peek()).toBe(true);

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(state.open.peek()).toBe(false);
  });

  it('navigates with ArrowDown', () => {
    const { trigger, content, Item } = Menu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    const itemA = Item('a', 'A');
    const itemB = Item('b', 'B');

    trigger.click();
    itemA.focus();

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(itemB);
  });

  it('activates item with Enter key', () => {
    const onSelect = vi.fn();
    const { trigger, content, Item } = Menu.Root({ onSelect });
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');
    Item('b', 'B');

    trigger.click();

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('closes when clicking outside', () => {
    const { trigger, content, state, Item } = Menu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');

    trigger.click();
    expect(state.open.peek()).toBe(true);

    // Click outside the menu
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(state.open.peek()).toBe(false);
  });

  it('does not close when clicking inside content', () => {
    const { trigger, content, state, Item } = Menu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    const item = Item('a', 'A');

    trigger.click();
    expect(state.open.peek()).toBe(true);

    // Click on content area — should NOT close
    content.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(state.open.peek()).toBe(true);
  });

  it('Group creates a group with role="group"', () => {
    const { trigger, content, Group } = Menu.Root();
    container.appendChild(trigger);
    container.appendChild(content);

    const group = Group('Actions');
    expect(group.el.getAttribute('role')).toBe('group');
    expect(group.el.getAttribute('aria-label')).toBe('Actions');
    expect(content.contains(group.el)).toBe(true);
  });

  it('Separator creates an hr with role="separator"', () => {
    const { trigger, content, Item, Separator } = Menu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');
    const sep = Separator();
    Item('b', 'B');

    expect(sep.getAttribute('role')).toBe('separator');
    expect(content.contains(sep)).toBe(true);
  });

  it('Label creates a non-interactive label element', () => {
    const { trigger, content, Label } = Menu.Root();
    container.appendChild(trigger);
    container.appendChild(content);

    const label = Label('Section');
    expect(label.textContent).toBe('Section');
    expect(content.contains(label)).toBe(true);
  });

  it('type-ahead focuses matching item', () => {
    const { trigger, content, Item } = Menu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('copy', 'Copy');
    const deleteItem = Item('delete', 'Delete');
    Item('edit', 'Edit');

    trigger.click();

    // Type 'd' — should focus 'Delete'
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    expect(document.activeElement).toBe(deleteItem);
  });
});
