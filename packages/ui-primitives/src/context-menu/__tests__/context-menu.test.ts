import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { ContextMenu } from '../context-menu';

describe('ContextMenu', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('creates trigger as HTMLDivElement', () => {
    const { trigger } = ContextMenu.Root();
    expect(trigger).toBeInstanceOf(HTMLDivElement);
  });

  it('content has role="menu"', () => {
    const { content } = ContextMenu.Root();
    expect(content.getAttribute('role')).toBe('menu');
  });

  it('content is hidden by default', () => {
    const { content, state } = ContextMenu.Root();
    expect(state.open.peek()).toBe(false);
    expect(content.getAttribute('aria-hidden')).toBe('true');
    expect(content.style.display).toBe('none');
  });

  it('contextmenu event on trigger opens content', () => {
    const { trigger, content, state, Item } = ContextMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');

    trigger.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 100, clientY: 200, bubbles: true }),
    );

    expect(state.open.peek()).toBe(true);
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('content is positioned with fixed positioning at cursor coordinates', () => {
    const { trigger, content, Item } = ContextMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');

    trigger.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 150, clientY: 250, bubbles: true }),
    );

    expect(content.style.position).toBe('fixed');
    expect(content.style.left).toBe('150px');
    expect(content.style.top).toBe('250px');
  });

  it('items have role="menuitem"', () => {
    const { trigger, content, Item } = ContextMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    const item = Item('edit', 'Edit');

    expect(item.getAttribute('role')).toBe('menuitem');
    expect(item.getAttribute('data-value')).toBe('edit');
  });

  it('Escape closes the menu', () => {
    const { trigger, content, state, Item } = ContextMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');

    trigger.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 100, clientY: 200, bubbles: true }),
    );
    expect(state.open.peek()).toBe(true);

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(state.open.peek()).toBe(false);
  });

  it('Enter on active item triggers onSelect and closes', () => {
    const onSelect = vi.fn();
    const { trigger, content, state, Item } = ContextMenu.Root({ onSelect });
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');
    Item('b', 'B');

    trigger.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 100, clientY: 200, bubbles: true }),
    );

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('a');
    expect(state.open.peek()).toBe(false);
  });

  it('Space on active item triggers onSelect and closes', () => {
    const onSelect = vi.fn();
    const { trigger, content, state, Item } = ContextMenu.Root({ onSelect });
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');
    Item('b', 'B');

    trigger.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 100, clientY: 200, bubbles: true }),
    );

    content.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('a');
    expect(state.open.peek()).toBe(false);
  });

  it('arrow key navigation works between items', () => {
    const { trigger, content, Item } = ContextMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    const itemA = Item('a', 'A');
    const itemB = Item('b', 'B');

    trigger.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 100, clientY: 200, bubbles: true }),
    );
    itemA.focus();

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(itemB);
  });

  it('click-outside closes the menu', () => {
    const { trigger, content, state, Item } = ContextMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');

    trigger.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 100, clientY: 200, bubbles: true }),
    );
    expect(state.open.peek()).toBe(true);

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(state.open.peek()).toBe(false);
  });

  it('does not close when clicking inside content', () => {
    const { trigger, content, state, Item } = ContextMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');

    trigger.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 100, clientY: 200, bubbles: true }),
    );
    expect(state.open.peek()).toBe(true);

    content.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(state.open.peek()).toBe(true);
  });

  it('calls onSelect when item is clicked', () => {
    const onSelect = vi.fn();
    const { trigger, content, Item } = ContextMenu.Root({ onSelect });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 100, clientY: 200, bubbles: true }),
    );
    const item = Item('edit', 'Edit');
    item.click();

    expect(onSelect).toHaveBeenCalledWith('edit');
  });

  it('Group creates a group with role="group"', () => {
    const { trigger, content, Group } = ContextMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);

    const group = Group('Actions');
    expect(group.el.getAttribute('role')).toBe('group');
    expect(group.el.getAttribute('aria-label')).toBe('Actions');
    expect(content.contains(group.el)).toBe(true);
  });

  it('Separator creates an hr with role="separator"', () => {
    const { trigger, content, Item, Separator } = ContextMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    Item('a', 'A');
    const sep = Separator();
    Item('b', 'B');

    expect(sep.getAttribute('role')).toBe('separator');
    expect(content.contains(sep)).toBe(true);
  });

  it('Label creates a non-interactive label element with role="none"', () => {
    const { trigger, content, Label } = ContextMenu.Root();
    container.appendChild(trigger);
    container.appendChild(content);

    const label = Label('Section');
    expect(label.textContent).toBe('Section');
    expect(label.getAttribute('role')).toBe('none');
    expect(content.contains(label)).toBe(true);
  });
});
