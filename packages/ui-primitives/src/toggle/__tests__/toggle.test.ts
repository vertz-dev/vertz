import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { Toggle } from '../toggle';

describe('Toggle', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('creates with aria-pressed="false" by default', () => {
    const { root } = Toggle.Root();
    expect(root.getAttribute('aria-pressed')).toBe('false');
  });

  it('has data-state="off" by default', () => {
    const { root } = Toggle.Root();
    expect(root.getAttribute('data-state')).toBe('off');
  });

  it('toggles on click', () => {
    const onPressedChange = vi.fn();
    const { root, state } = Toggle.Root({ onPressedChange });
    container.appendChild(root);

    root.click();
    expect(state.pressed.peek()).toBe(true);
    expect(root.getAttribute('aria-pressed')).toBe('true');
    expect(root.getAttribute('data-state')).toBe('on');
    expect(onPressedChange).toHaveBeenCalledWith(true);
  });

  it('toggles on Space key', () => {
    const { root, state } = Toggle.Root();
    container.appendChild(root);

    root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(state.pressed.peek()).toBe(true);
  });

  it('does not toggle when disabled', () => {
    const { root, state } = Toggle.Root({ disabled: true });
    container.appendChild(root);

    root.click();
    expect(state.pressed.peek()).toBe(false);
  });

  it('supports defaultPressed', () => {
    const { root, state } = Toggle.Root({ defaultPressed: true });
    expect(state.pressed.peek()).toBe(true);
    expect(root.getAttribute('aria-pressed')).toBe('true');
    expect(root.getAttribute('data-state')).toBe('on');
  });

  it('calls onPressedChange with correct value', () => {
    const onPressedChange = vi.fn();
    const { root } = Toggle.Root({ onPressedChange });
    container.appendChild(root);

    root.click();
    expect(onPressedChange).toHaveBeenCalledWith(true);

    root.click();
    expect(onPressedChange).toHaveBeenCalledWith(false);
  });

  it('sets aria-disabled when disabled', () => {
    const { root } = Toggle.Root({ disabled: true });
    expect(root.getAttribute('aria-disabled')).toBe('true');
    expect(root.disabled).toBe(true);
  });
});
