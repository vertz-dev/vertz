import { describe, expect, it, vi } from '@vertz/test';
import { Button } from '../button';

describe('Button', () => {
  it('creates a button element with type="button"', () => {
    const root = Button.Root();
    expect(root.tagName).toBe('BUTTON');
    expect(root.getAttribute('type')).toBe('button');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    const root = Button.Root({ onClick });
    root.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    const root = Button.Root({ disabled: true, onClick });
    root.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('sets aria-disabled when disabled', () => {
    const root = Button.Root({ disabled: true });
    expect(root.getAttribute('aria-disabled')).toBe('true');
    expect(root.disabled).toBe(true);
  });

  it('activates on Enter key', () => {
    const onClick = vi.fn();
    const root = Button.Root({ onClick });
    document.body.appendChild(root);

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onClick).toHaveBeenCalledOnce();

    document.body.removeChild(root);
  });

  it('activates on Space key', () => {
    const onClick = vi.fn();
    const root = Button.Root({ onClick });
    document.body.appendChild(root);

    root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(onClick).toHaveBeenCalledOnce();

    document.body.removeChild(root);
  });

  it('passes HTML attributes through to the element', () => {
    const root = Button.Root({
      class: 'my-btn',
      'aria-label': 'Close dialog',
      'data-testid': 'close-btn',
      id: 'custom-id',
    });
    expect(root.getAttribute('class')).toBe('my-btn');
    expect(root.getAttribute('aria-label')).toBe('Close dialog');
    expect(root.getAttribute('data-testid')).toBe('close-btn');
    expect(root.getAttribute('id')).toBe('custom-id');
  });
});
