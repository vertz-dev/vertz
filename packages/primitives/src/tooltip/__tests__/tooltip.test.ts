import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from '../tooltip';

describe('Tooltip', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  it('creates tooltip with correct ARIA attributes', () => {
    const { trigger, content } = Tooltip.Root();
    expect(content.getAttribute('role')).toBe('tooltip');
    expect(trigger.getAttribute('aria-describedby')).toBe(content.id);
  });

  it('is hidden by default', () => {
    const { content, state } = Tooltip.Root();
    expect(state.open.peek()).toBe(false);
    expect(content.getAttribute('aria-hidden')).toBe('true');
    expect(content.getAttribute('data-state')).toBe('closed');
  });

  it('shows after delay on mouseenter', () => {
    const { trigger, content, state } = Tooltip.Root({ delay: 100 });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(state.open.peek()).toBe(false);

    vi.advanceTimersByTime(100);
    expect(state.open.peek()).toBe(true);
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('hides on mouseleave', () => {
    const { trigger, content, state } = Tooltip.Root({ delay: 0 });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(0);
    expect(state.open.peek()).toBe(true);

    trigger.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(state.open.peek()).toBe(false);
  });

  it('hides on Escape key', () => {
    const { trigger, content, state } = Tooltip.Root({ delay: 0 });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(0);

    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(state.open.peek()).toBe(false);
  });

  it('calls onOpenChange', () => {
    const onOpenChange = vi.fn();
    const { trigger, content } = Tooltip.Root({ delay: 0, onOpenChange });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(0);
    expect(onOpenChange).toHaveBeenCalledWith(true);

    trigger.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
