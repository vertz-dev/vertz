import { afterEach, beforeEach, describe, expect, it, vi } from '@vertz/test';
import { AlertDialog } from '../alert-dialog';

describe('AlertDialog', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('returns all required elements', () => {
    const result = AlertDialog.Root();

    expect(result.trigger).toBeInstanceOf(HTMLButtonElement);
    expect(result.overlay).toBeInstanceOf(HTMLDivElement);
    expect(result.content).toBeInstanceOf(HTMLDivElement);
    expect(result.title).toBeInstanceOf(HTMLHeadingElement);
    expect(result.description).toBeInstanceOf(HTMLParagraphElement);
    expect(result.cancel).toBeInstanceOf(HTMLButtonElement);
    expect(result.action).toBeInstanceOf(HTMLButtonElement);
    expect(result.state).toBeDefined();
    expect(result.state.open).toBeDefined();
    expect(typeof result.show).toBe('function');
    expect(typeof result.hide).toBe('function');
  });

  it('opens when trigger is clicked', () => {
    const { trigger, content, state } = AlertDialog.Root();
    container.appendChild(trigger);
    container.appendChild(content);

    expect(state.open.peek()).toBe(false);
    expect(content.getAttribute('aria-hidden')).toBe('true');

    trigger.click();

    expect(state.open.peek()).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('has role alertdialog', () => {
    const { content } = AlertDialog.Root();
    expect(content.getAttribute('role')).toBe('alertdialog');
  });

  it('has aria-modal true', () => {
    const { content } = AlertDialog.Root();
    expect(content.getAttribute('aria-modal')).toBe('true');
  });

  it('has aria-labelledby referencing title', () => {
    const { content, title } = AlertDialog.Root();
    expect(content.getAttribute('aria-labelledby')).toBe(title.id);
  });

  it('has aria-describedby referencing description', () => {
    const { content, description } = AlertDialog.Root();
    expect(content.getAttribute('aria-describedby')).toBe(description.id);
  });

  it('closes when cancel is clicked', () => {
    const { trigger, content, cancel, state } = AlertDialog.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    content.appendChild(cancel);

    trigger.click();
    expect(state.open.peek()).toBe(true);

    cancel.click();
    expect(state.open.peek()).toBe(false);
    expect(content.getAttribute('data-state')).toBe('closed');
  });

  it('closes when action is clicked', () => {
    const { trigger, content, action, state } = AlertDialog.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    content.appendChild(action);

    trigger.click();
    expect(state.open.peek()).toBe(true);

    action.click();
    expect(state.open.peek()).toBe(false);
    expect(content.getAttribute('data-state')).toBe('closed');
  });

  it('fires onAction callback when action is clicked', () => {
    const onAction = vi.fn();
    const { trigger, content, action } = AlertDialog.Root({ onAction });
    container.appendChild(trigger);
    container.appendChild(content);
    content.appendChild(action);

    trigger.click();
    action.click();

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('does NOT close when overlay is clicked', () => {
    const { trigger, content, overlay, state } = AlertDialog.Root();
    container.appendChild(trigger);
    container.appendChild(overlay);
    container.appendChild(content);

    trigger.click();
    expect(state.open.peek()).toBe(true);

    overlay.click();
    expect(state.open.peek()).toBe(true);
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('does NOT close when Escape is pressed', () => {
    const { trigger, content, state } = AlertDialog.Root();
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();
    expect(state.open.peek()).toBe(true);

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(state.open.peek()).toBe(true);
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('traps focus inside dialog', () => {
    const { trigger, content, cancel, action } = AlertDialog.Root();
    content.appendChild(cancel);
    content.appendChild(action);
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();

    // Focus last button, Tab should wrap to first
    action.focus();
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(cancel);
  });

  it('focuses cancel button on open', async () => {
    const { trigger, content, cancel, action } = AlertDialog.Root();
    content.appendChild(cancel);
    content.appendChild(action);
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();

    // queueMicrotask defers the focus, so we need to wait
    await new Promise((resolve) => queueMicrotask(resolve));

    expect(document.activeElement).toBe(cancel);
  });

  it('returns focus to trigger on close', async () => {
    const { trigger, content, cancel } = AlertDialog.Root();
    content.appendChild(cancel);
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.focus();
    trigger.click();

    await new Promise((resolve) => queueMicrotask(resolve));

    cancel.click();

    expect(document.activeElement).toBe(trigger);
  });

  it('sets data-state attributes on trigger, overlay, and content', () => {
    const { trigger, overlay, content, cancel } = AlertDialog.Root();
    content.appendChild(cancel);
    container.appendChild(trigger);
    container.appendChild(overlay);
    container.appendChild(content);

    expect(trigger.getAttribute('data-state')).toBe('closed');
    expect(overlay.getAttribute('data-state')).toBe('closed');
    expect(content.getAttribute('data-state')).toBe('closed');

    trigger.click();

    expect(trigger.getAttribute('data-state')).toBe('open');
    expect(overlay.getAttribute('data-state')).toBe('open');
    expect(content.getAttribute('data-state')).toBe('open');

    cancel.click();

    expect(trigger.getAttribute('data-state')).toBe('closed');
    expect(overlay.getAttribute('data-state')).toBe('closed');
    expect(content.getAttribute('data-state')).toBe('closed');
  });

  it('supports defaultOpen option', () => {
    const { content, trigger, overlay, state } = AlertDialog.Root({ defaultOpen: true });

    expect(state.open.peek()).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('data-state')).toBe('open');
    expect(overlay.getAttribute('data-state')).toBe('open');
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('fires onOpenChange callback', () => {
    const onOpenChange = vi.fn();
    const { trigger, content, cancel } = AlertDialog.Root({ onOpenChange });
    content.appendChild(cancel);
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();
    expect(onOpenChange).toHaveBeenCalledWith(true);

    cancel.click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('show() is idempotent — calling twice only fires onOpenChange(true) once', () => {
    const onOpenChange = vi.fn();
    const { trigger, content, cancel, show } = AlertDialog.Root({ onOpenChange });
    content.appendChild(cancel);
    container.appendChild(trigger);
    container.appendChild(content);

    show();
    show(); // second call should be a no-op

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('show() is a no-op on an already-open dialog (defaultOpen)', () => {
    const onOpenChange = vi.fn();
    AlertDialog.Root({ defaultOpen: true, onOpenChange }).show();

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('hide() is a no-op on a never-opened dialog', () => {
    const onOpenChange = vi.fn();
    AlertDialog.Root({ onOpenChange }).hide();

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('hide() is idempotent — calling twice only fires onOpenChange(false) once', () => {
    const onOpenChange = vi.fn();
    const { trigger, content, cancel, show, hide } = AlertDialog.Root({ onOpenChange });
    content.appendChild(cancel);
    container.appendChild(trigger);
    container.appendChild(content);

    show();
    onOpenChange.mockClear();

    hide();
    hide(); // second call should be a no-op

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
