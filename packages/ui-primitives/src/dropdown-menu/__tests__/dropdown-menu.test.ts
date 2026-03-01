import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { DropdownMenu } from '../dropdown-menu';

describe('DropdownMenu', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('creates dropdown menu with correct ARIA roles', () => {
    const { trigger, content } = DropdownMenu.Root();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-controls')).toBeTruthy();
    expect(content.getAttribute('role')).toBe('menu');
    expect(content.getAttribute('tabindex')).toBe('-1');
    expect(content.id).toBe(trigger.getAttribute('aria-controls'));
  });

  it('opens on trigger click', () => {
    const { trigger, content, state, Item } = DropdownMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');

    trigger.click();
    expect(state.open.peek()).toBe(true);
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('closes on trigger click when open', () => {
    const { trigger, content, state, Item } = DropdownMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');

    trigger.click();
    expect(state.open.peek()).toBe(true);

    trigger.click();
    expect(state.open.peek()).toBe(false);
  });

  it('navigates items with ArrowDown/ArrowUp', () => {
    const { trigger, content, Item } = DropdownMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    const itemA = Item('a', 'A');
    const itemB = Item('b', 'B');

    trigger.click();

    // First ArrowDown activates first item
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(itemA);

    // Second ArrowDown moves to next
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(itemB);

    // ArrowUp moves back
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(itemA);
  });

  it('activates item with Enter key and calls onSelect', () => {
    const onSelect = vi.fn();
    const { trigger, content, Item } = DropdownMenu.Root({ onSelect });
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');
    Item('b', 'B');

    trigger.click();

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('closes on Escape and returns focus to trigger', () => {
    const { trigger, content, state, Item } = DropdownMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');

    trigger.click();
    expect(state.open.peek()).toBe(true);

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(state.open.peek()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('opens with ArrowDown on trigger, activating first item', () => {
    const { trigger, content, state, Item } = DropdownMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    const itemA = Item('a', 'A');

    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(state.open.peek()).toBe(true);
    expect(document.activeElement).toBe(itemA);
  });

  it('closes when clicking outside', () => {
    const { trigger, content, state, Item } = DropdownMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');

    trigger.click();
    expect(state.open.peek()).toBe(true);

    // pointerdown outside — dismiss uses pointerdown via createDismiss
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(state.open.peek()).toBe(false);
  });

  it('does not close when clicking inside content', () => {
    const { trigger, content, state, Item } = DropdownMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');

    trigger.click();
    expect(state.open.peek()).toBe(true);

    // pointerdown inside content — should NOT close
    content.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(state.open.peek()).toBe(true);
  });

  it('Item creates menuitem with data-value', () => {
    const { trigger, content, Item } = DropdownMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    const item = Item('edit', 'Edit');

    expect(item.getAttribute('role')).toBe('menuitem');
    expect(item.getAttribute('data-value')).toBe('edit');
    expect(item.textContent).toBe('Edit');
  });

  it('Group creates group with aria-label', () => {
    const { trigger, content, Group } = DropdownMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);

    const group = Group('Actions');
    expect(group.el.getAttribute('role')).toBe('group');
    expect(group.el.getAttribute('aria-label')).toBe('Actions');
    expect(content.contains(group.el)).toBe(true);
  });

  it('Separator creates hr with role="separator"', () => {
    const { trigger, content, Item, Separator } = DropdownMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');
    const sep = Separator();
    Item('b', 'B');

    expect(sep.getAttribute('role')).toBe('separator');
    expect(content.contains(sep)).toBe(true);
  });

  it('Label creates non-interactive label with role="none"', () => {
    const { trigger, content, Label } = DropdownMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);

    const label = Label('Section');
    expect(label.textContent).toBe('Section');
    expect(label.getAttribute('role')).toBe('none');
    expect(content.contains(label)).toBe(true);
  });

  it('type-ahead focuses matching item', () => {
    const { trigger, content, Item } = DropdownMenu.Root();
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
