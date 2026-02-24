import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { Checkbox } from '../checkbox';

describe('Checkbox', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('creates checkbox with role="checkbox"', () => {
    const { root } = Checkbox.Root();
    expect(root.getAttribute('role')).toBe('checkbox');
  });

  it('is unchecked by default', () => {
    const { root, state } = Checkbox.Root();
    expect(state.checked.peek()).toBe(false);
    expect(root.getAttribute('aria-checked')).toBe('false');
    expect(root.getAttribute('data-state')).toBe('unchecked');
  });

  it('toggles on click', () => {
    const onCheckedChange = vi.fn();
    const { root, state } = Checkbox.Root({ onCheckedChange });
    container.appendChild(root);

    root.click();
    expect(state.checked.peek()).toBe(true);
    expect(root.getAttribute('aria-checked')).toBe('true');
    expect(root.getAttribute('data-state')).toBe('checked');
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('toggles on Space key', () => {
    const { root, state } = Checkbox.Root();
    container.appendChild(root);

    root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(state.checked.peek()).toBe(true);
  });

  it('supports indeterminate/mixed state', () => {
    const { root, state } = Checkbox.Root({ defaultChecked: 'mixed' });
    expect(state.checked.peek()).toBe('mixed');
    expect(root.getAttribute('aria-checked')).toBe('mixed');
    expect(root.getAttribute('data-state')).toBe('indeterminate');
  });

  it('transitions from mixed to true on click', () => {
    const { root, state } = Checkbox.Root({ defaultChecked: 'mixed' });
    container.appendChild(root);

    root.click();
    expect(state.checked.peek()).toBe(true);
    expect(root.getAttribute('aria-checked')).toBe('true');
  });

  it('does not toggle when disabled', () => {
    const { root, state } = Checkbox.Root({ disabled: true });
    container.appendChild(root);

    root.click();
    expect(state.checked.peek()).toBe(false);
  });

  it('sets aria-disabled when disabled', () => {
    const { root } = Checkbox.Root({ disabled: true });
    expect(root.getAttribute('aria-disabled')).toBe('true');
  });
});
