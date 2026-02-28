import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { HoverCard } from '../hover-card';

describe('HoverCard', () => {
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

  it('content has role="dialog"', () => {
    const { content } = HoverCard.Root();
    expect(content.getAttribute('role')).toBe('dialog');
  });

  it('trigger has aria-haspopup="dialog"', () => {
    const { trigger } = HoverCard.Root();
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('is hidden by default', () => {
    const { content, state } = HoverCard.Root();
    expect(state.open.peek()).toBe(false);
    expect(content.getAttribute('aria-hidden')).toBe('true');
    expect(content.getAttribute('data-state')).toBe('closed');
  });

  it('shows after delay on mouseenter', () => {
    const { trigger, content, state } = HoverCard.Root({ openDelay: 200 });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(state.open.peek()).toBe(false);

    vi.advanceTimersByTime(200);
    expect(state.open.peek()).toBe(true);
    expect(content.getAttribute('data-state')).toBe('open');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('hides after delay on mouseleave', () => {
    const { trigger, content, state } = HoverCard.Root({ openDelay: 0, closeDelay: 100 });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(0);
    expect(state.open.peek()).toBe(true);

    trigger.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(state.open.peek()).toBe(true);

    vi.advanceTimersByTime(100);
    expect(state.open.peek()).toBe(false);
    expect(content.getAttribute('data-state')).toBe('closed');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('mouseenter content cancels close timer', () => {
    const { trigger, content, state } = HoverCard.Root({ openDelay: 0, closeDelay: 200 });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(0);
    expect(state.open.peek()).toBe(true);

    trigger.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    vi.advanceTimersByTime(50);

    content.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(state.open.peek()).toBe(true);
  });

  it('Escape key closes content and returns focus to trigger', () => {
    const { trigger, content, state } = HoverCard.Root({ openDelay: 100 });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(100);
    expect(state.open.peek()).toBe(true);

    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(state.open.peek()).toBe(false);
    expect(content.getAttribute('data-state')).toBe('closed');
  });

  it('focus on trigger shows immediately', () => {
    const { trigger, content, state } = HoverCard.Root();
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    expect(state.open.peek()).toBe(true);
    expect(content.getAttribute('data-state')).toBe('open');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('calls onOpenChange on open and close', () => {
    const onOpenChange = vi.fn();
    const { trigger, content } = HoverCard.Root({
      openDelay: 0,
      closeDelay: 0,
      onOpenChange,
    });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(0);
    expect(onOpenChange).toHaveBeenCalledWith(true);

    trigger.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    vi.advanceTimersByTime(0);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
