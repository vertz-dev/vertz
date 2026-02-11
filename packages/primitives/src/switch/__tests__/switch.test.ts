import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Switch } from '../switch';

describe('Switch', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('creates switch with role="switch"', () => {
    const { root } = Switch.Root();
    expect(root.getAttribute('role')).toBe('switch');
  });

  it('is unchecked by default', () => {
    const { root, state } = Switch.Root();
    expect(state.checked.peek()).toBe(false);
    expect(root.getAttribute('aria-checked')).toBe('false');
    expect(root.getAttribute('data-state')).toBe('unchecked');
  });

  it('toggles on click', () => {
    const onCheckedChange = vi.fn();
    const { root, state } = Switch.Root({ onCheckedChange });
    container.appendChild(root);

    root.click();
    expect(state.checked.peek()).toBe(true);
    expect(root.getAttribute('aria-checked')).toBe('true');
    expect(root.getAttribute('data-state')).toBe('checked');
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('toggles on Space key', () => {
    const { root, state } = Switch.Root();
    container.appendChild(root);

    root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(state.checked.peek()).toBe(true);
  });

  it('does not toggle when disabled', () => {
    const { root, state } = Switch.Root({ disabled: true });
    container.appendChild(root);

    root.click();
    expect(state.checked.peek()).toBe(false);
  });

  it('supports defaultChecked', () => {
    const { root, state } = Switch.Root({ defaultChecked: true });
    expect(state.checked.peek()).toBe(true);
    expect(root.getAttribute('aria-checked')).toBe('true');
    expect(root.getAttribute('data-state')).toBe('checked');
  });

  it('sets aria-disabled when disabled', () => {
    const { root } = Switch.Root({ disabled: true });
    expect(root.getAttribute('aria-disabled')).toBe('true');
    expect(root.disabled).toBe(true);
  });
});
