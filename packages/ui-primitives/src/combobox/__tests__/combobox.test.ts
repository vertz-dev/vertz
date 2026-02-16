import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Combobox } from '../combobox';

describe('Combobox', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('creates combobox with correct ARIA attributes', () => {
    const { input, listbox } = Combobox.Root();
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-haspopup')).toBe('listbox');
    expect(listbox.getAttribute('role')).toBe('listbox');
    expect(input.getAttribute('aria-controls')).toBe(listbox.id);
  });

  it('is closed by default', () => {
    const { listbox, state } = Combobox.Root();
    expect(state.open.peek()).toBe(false);
    expect(listbox.getAttribute('data-state')).toBe('closed');
  });

  it('creates options with role="option"', () => {
    const { input, listbox, Option } = Combobox.Root();
    container.appendChild(input);
    container.appendChild(listbox);
    const opt = Option('apple', 'Apple');

    expect(opt.getAttribute('role')).toBe('option');
    expect(opt.getAttribute('data-value')).toBe('apple');
  });

  it('opens on input', () => {
    const { input, listbox, state, Option } = Combobox.Root();
    container.appendChild(input);
    container.appendChild(listbox);
    Option('apple', 'Apple');

    input.value = 'a';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(state.open.peek()).toBe(true);
    expect(listbox.getAttribute('data-state')).toBe('open');
  });

  it('navigates options with ArrowDown', () => {
    const { input, listbox, state, Option } = Combobox.Root();
    container.appendChild(input);
    container.appendChild(listbox);
    const optA = Option('apple', 'Apple');
    Option('banana', 'Banana');

    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(state.activeIndex.peek()).toBe(0);
    expect(input.getAttribute('aria-activedescendant')).toBe(optA.id);
  });

  it('selects option with Enter', () => {
    const onValueChange = vi.fn();
    const { input, listbox, state, Option } = Combobox.Root({ onValueChange });
    container.appendChild(input);
    container.appendChild(listbox);
    Option('apple', 'Apple');
    Option('banana', 'Banana');

    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(state.value.peek()).toBe('apple');
    expect(onValueChange).toHaveBeenCalledWith('apple');
    expect(state.open.peek()).toBe(false);
  });

  it('selects option on click', () => {
    const onValueChange = vi.fn();
    const { input, listbox, state, Option } = Combobox.Root({ onValueChange });
    container.appendChild(input);
    container.appendChild(listbox);
    const opt = Option('apple', 'Apple');

    opt.click();
    expect(state.value.peek()).toBe('apple');
    expect(onValueChange).toHaveBeenCalledWith('apple');
  });

  it('closes on Escape', () => {
    const { input, listbox, state, Option } = Combobox.Root();
    container.appendChild(input);
    container.appendChild(listbox);
    Option('apple', 'Apple');

    // Open first
    input.value = 'a';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(state.open.peek()).toBe(true);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(state.open.peek()).toBe(false);
  });

  it('calls onInputChange', () => {
    const onInputChange = vi.fn();
    const { input, listbox } = Combobox.Root({ onInputChange });
    container.appendChild(input);
    container.appendChild(listbox);

    input.value = 'test';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onInputChange).toHaveBeenCalledWith('test');
  });
});
