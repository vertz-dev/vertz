import { describe, expect, it, vi } from 'vitest';
import { Button } from '../button';

describe('Button', () => {
  it('creates a button with role="button"', () => {
    const { root } = Button.Root();
    expect(root.tagName).toBe('BUTTON');
    expect(root.getAttribute('role')).toBe('button');
    expect(root.getAttribute('type')).toBe('button');
  });

  it('has data-state="idle" by default', () => {
    const { root } = Button.Root();
    expect(root.getAttribute('data-state')).toBe('idle');
  });

  it('calls onPress when clicked', () => {
    const onPress = vi.fn();
    const { root } = Button.Root({ onPress });
    root.click();
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('does not call onPress when disabled', () => {
    const onPress = vi.fn();
    const { root } = Button.Root({ disabled: true, onPress });
    root.click();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('sets aria-disabled when disabled', () => {
    const { root } = Button.Root({ disabled: true });
    expect(root.getAttribute('aria-disabled')).toBe('true');
    expect(root.disabled).toBe(true);
  });

  it('activates on Enter key', () => {
    const onPress = vi.fn();
    const { root } = Button.Root({ onPress });
    document.body.appendChild(root);

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onPress).toHaveBeenCalledOnce();

    document.body.removeChild(root);
  });

  it('activates on Space key', () => {
    const onPress = vi.fn();
    const { root } = Button.Root({ onPress });
    document.body.appendChild(root);

    root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(onPress).toHaveBeenCalledOnce();

    document.body.removeChild(root);
  });
});
