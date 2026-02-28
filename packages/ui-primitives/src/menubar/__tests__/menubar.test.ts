import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { Menubar } from '../menubar';

describe('Menubar', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('root has role="menubar"', () => {
    const { root } = Menubar.Root();
    expect(root.getAttribute('role')).toBe('menubar');
  });

  it('menu triggers have role="menuitem" and aria-haspopup="menu"', () => {
    const { root, Menu } = Menubar.Root();
    container.appendChild(root);
    const file = Menu('file', 'File');
    const edit = Menu('edit', 'Edit');

    expect(file.trigger.getAttribute('role')).toBe('menuitem');
    expect(file.trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(edit.trigger.getAttribute('role')).toBe('menuitem');
    expect(edit.trigger.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('dropdowns have role="menu"', () => {
    const { root, Menu } = Menubar.Root();
    container.appendChild(root);
    const file = Menu('file', 'File');

    expect(file.content.getAttribute('role')).toBe('menu');
  });

  it('click toggle opens and closes menu', () => {
    const { root, state, Menu } = Menubar.Root();
    container.appendChild(root);
    const file = Menu('file', 'File');
    file.Item('new', 'New');

    file.trigger.click();
    expect(state.activeMenu.peek()).toBe('file');
    expect(file.content.getAttribute('data-state')).toBe('open');

    file.trigger.click();
    expect(state.activeMenu.peek()).toBeNull();
    expect(file.content.getAttribute('data-state')).toBe('closed');
  });

  it('ArrowDown opens dropdown from trigger', () => {
    const { root, state, Menu } = Menubar.Root();
    container.appendChild(root);
    const file = Menu('file', 'File');
    container.appendChild(file.content);
    const itemNew = file.Item('new', 'New');
    file.Item('open', 'Open');

    file.trigger.focus();
    file.trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(state.activeMenu.peek()).toBe('file');
    expect(document.activeElement).toBe(itemNew);
  });

  it('Enter selects item and closes', () => {
    const onSelect = vi.fn();
    const { root, state, Menu } = Menubar.Root({ onSelect });
    container.appendChild(root);
    const file = Menu('file', 'File');
    container.appendChild(file.content);
    const itemNew = file.Item('new', 'New');

    file.trigger.click();
    expect(state.activeMenu.peek()).toBe('file');

    itemNew.focus();
    file.content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onSelect).toHaveBeenCalledWith('new');
    expect(state.activeMenu.peek()).toBeNull();
  });

  it('Escape closes menu and returns focus to trigger', () => {
    const { root, state, Menu } = Menubar.Root();
    container.appendChild(root);
    const file = Menu('file', 'File');
    container.appendChild(file.content);
    file.Item('new', 'New');

    file.trigger.click();
    expect(state.activeMenu.peek()).toBe('file');

    file.content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(state.activeMenu.peek()).toBeNull();
    expect(document.activeElement).toBe(file.trigger);
  });

  it('ArrowRight between triggers auto-switches when open', () => {
    const { root, state, Menu } = Menubar.Root();
    container.appendChild(root);
    const file = Menu('file', 'File');
    container.appendChild(file.content);
    file.Item('new', 'New');
    const edit = Menu('edit', 'Edit');
    container.appendChild(edit.content);
    const undo = edit.Item('undo', 'Undo');

    file.trigger.click();
    expect(state.activeMenu.peek()).toBe('file');

    // Navigate to next trigger — auto-switches and focuses first item
    file.trigger.focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(state.activeMenu.peek()).toBe('edit');
    expect(edit.content.getAttribute('data-state')).toBe('open');
    expect(file.content.getAttribute('data-state')).toBe('closed');
    expect(document.activeElement).toBe(undo);
  });

  it('ArrowLeft/Right in dropdown closes current and opens adjacent', () => {
    const { root, state, Menu } = Menubar.Root();
    container.appendChild(root);
    const file = Menu('file', 'File');
    container.appendChild(file.content);
    file.Item('new', 'New');
    const edit = Menu('edit', 'Edit');
    container.appendChild(edit.content);
    const undo = edit.Item('undo', 'Undo');

    // Open file menu and navigate ArrowRight from within content
    file.trigger.click();
    file.content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(state.activeMenu.peek()).toBe('edit');
    expect(document.activeElement).toBe(undo);
  });

  it('only one menu open at a time', () => {
    const { root, state, Menu } = Menubar.Root();
    container.appendChild(root);
    const file = Menu('file', 'File');
    container.appendChild(file.content);
    file.Item('new', 'New');
    const edit = Menu('edit', 'Edit');
    container.appendChild(edit.content);
    edit.Item('undo', 'Undo');

    file.trigger.click();
    expect(state.activeMenu.peek()).toBe('file');
    expect(file.content.getAttribute('data-state')).toBe('open');

    edit.trigger.click();
    expect(state.activeMenu.peek()).toBe('edit');
    expect(edit.content.getAttribute('data-state')).toBe('open');
    expect(file.content.getAttribute('data-state')).toBe('closed');
  });

  it('click outside closes all menus', () => {
    const { root, state, Menu } = Menubar.Root();
    container.appendChild(root);
    const file = Menu('file', 'File');
    container.appendChild(file.content);
    file.Item('new', 'New');

    file.trigger.click();
    expect(state.activeMenu.peek()).toBe('file');

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(state.activeMenu.peek()).toBeNull();
    expect(file.content.getAttribute('data-state')).toBe('closed');
  });
});
