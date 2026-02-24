import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { Popover } from '../popover';

describe('Popover', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('creates popover with correct ARIA attributes', () => {
    const { trigger, content } = Popover.Root();
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(content.getAttribute('role')).toBe('dialog');
    expect(trigger.getAttribute('aria-controls')).toBe(content.id);
  });

  it('is closed by default', () => {
    const { trigger, content, state } = Popover.Root();
    expect(state.open.peek()).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(content.getAttribute('data-state')).toBe('closed');
  });

  it('opens on trigger click', () => {
    const { trigger, content, state } = Popover.Root();
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();
    expect(state.open.peek()).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('closes on Escape', () => {
    const { trigger, content, state } = Popover.Root();
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();
    expect(state.open.peek()).toBe(true);

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(state.open.peek()).toBe(false);
    expect(content.getAttribute('data-state')).toBe('closed');
  });

  it('toggles on trigger click', () => {
    const { trigger, content, state } = Popover.Root();
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();
    expect(state.open.peek()).toBe(true);

    trigger.click();
    expect(state.open.peek()).toBe(false);
  });

  it('calls onOpenChange', () => {
    const onOpenChange = vi.fn();
    const { trigger, content } = Popover.Root({ onOpenChange });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();
    expect(onOpenChange).toHaveBeenCalledWith(true);

    trigger.click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('supports defaultOpen', () => {
    const { trigger, content, state } = Popover.Root({ defaultOpen: true });
    expect(state.open.peek()).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(content.getAttribute('data-state')).toBe('open');
  });
});
