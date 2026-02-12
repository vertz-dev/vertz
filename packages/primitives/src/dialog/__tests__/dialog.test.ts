import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from '../dialog';

describe('Dialog', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('creates dialog with correct ARIA attributes', () => {
    const { content, trigger } = Dialog.Root();
    expect(content.getAttribute('role')).toBe('dialog');
    expect(content.getAttribute('aria-modal')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(content.id);
  });

  it('is closed by default', () => {
    const { content, trigger, state } = Dialog.Root();
    expect(state.open.peek()).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(content.getAttribute('aria-hidden')).toBe('true');
    expect(content.getAttribute('data-state')).toBe('closed');
  });

  it('opens when trigger is clicked', () => {
    const { content, trigger, state } = Dialog.Root();
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();

    expect(state.open.peek()).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('closes on Escape key', () => {
    const { content, trigger, state } = Dialog.Root();
    container.appendChild(trigger);
    container.appendChild(content);

    // Open first
    trigger.click();
    expect(state.open.peek()).toBe(true);

    // Press Escape on the content
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(state.open.peek()).toBe(false);
    expect(content.getAttribute('data-state')).toBe('closed');
  });

  it('closes when close button is clicked', () => {
    const { close, content, trigger, state } = Dialog.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    content.appendChild(close);

    trigger.click();
    expect(state.open.peek()).toBe(true);

    close.click();
    expect(state.open.peek()).toBe(false);
  });

  it('calls onOpenChange callback', () => {
    const onOpenChange = vi.fn();
    const { trigger, content } = Dialog.Root({ onOpenChange });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();
    expect(onOpenChange).toHaveBeenCalledWith(true);

    trigger.click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('has title with aria-labelledby link', () => {
    const { content, title } = Dialog.Root();
    expect(content.getAttribute('aria-labelledby')).toBe(title.id);
  });

  it('traps focus when modal', () => {
    const { content, trigger } = Dialog.Root({ modal: true });
    const btn1 = document.createElement('button');
    btn1.textContent = 'First';
    const btn2 = document.createElement('button');
    btn2.textContent = 'Second';
    content.appendChild(btn1);
    content.appendChild(btn2);
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();

    // Simulate Tab from last focusable -> should wrap to first
    btn2.focus();
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(btn1);
  });

  it('supports non-modal mode', () => {
    const { content } = Dialog.Root({ modal: false });
    expect(content.getAttribute('aria-modal')).toBeNull();
  });
});
