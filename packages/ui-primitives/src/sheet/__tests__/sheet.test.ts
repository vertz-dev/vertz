import { afterEach, beforeEach, describe, expect, it, mock } from '@vertz/test';
import { Sheet } from '../sheet';

describe('Sheet', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('returns all required elements', () => {
    const result = Sheet.Root();
    expect(result.trigger).toBeInstanceOf(HTMLButtonElement);
    expect(result.overlay).toBeInstanceOf(HTMLDivElement);
    expect(result.content).toBeInstanceOf(HTMLDivElement);
    expect(result.close).toBeInstanceOf(HTMLButtonElement);
    expect(result.state.open).toBeDefined();
    expect(typeof result.show).toBe('function');
    expect(typeof result.hide).toBe('function');
  });

  it('opens when trigger is clicked', () => {
    const { content, overlay, trigger, state } = Sheet.Root();
    container.appendChild(trigger);
    container.appendChild(overlay);
    container.appendChild(content);

    expect(state.open.peek()).toBe(false);
    expect(content.getAttribute('aria-hidden')).toBe('true');
    expect(overlay.getAttribute('aria-hidden')).toBe('true');

    trigger.click();

    expect(state.open.peek()).toBe(true);
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(overlay.getAttribute('aria-hidden')).toBe('false');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes when close button is clicked', () => {
    const { close, content, overlay, trigger, state } = Sheet.Root();
    container.appendChild(trigger);
    container.appendChild(overlay);
    container.appendChild(content);
    content.appendChild(close);

    trigger.click();
    expect(state.open.peek()).toBe(true);

    close.click();
    expect(state.open.peek()).toBe(false);
    expect(content.getAttribute('data-state')).toBe('closed');
    expect(overlay.getAttribute('data-state')).toBe('closed');
  });

  it('closes when overlay is clicked', () => {
    const { content, overlay, trigger, state } = Sheet.Root();
    container.appendChild(trigger);
    container.appendChild(overlay);
    container.appendChild(content);

    trigger.click();
    expect(state.open.peek()).toBe(true);

    overlay.click();
    expect(state.open.peek()).toBe(false);
  });

  it('closes on Escape key', () => {
    const { content, trigger, state } = Sheet.Root();
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();
    expect(state.open.peek()).toBe(true);

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(state.open.peek()).toBe(false);
    expect(content.getAttribute('data-state')).toBe('closed');
  });

  it('content has role dialog', () => {
    const { content } = Sheet.Root();
    expect(content.getAttribute('role')).toBe('dialog');
  });

  it('content has aria-modal true', () => {
    const { content } = Sheet.Root();
    expect(content.getAttribute('aria-modal')).toBe('true');
  });

  it('trigger has aria-controls pointing to content', () => {
    const { trigger, content } = Sheet.Root();
    expect(trigger.getAttribute('aria-controls')).toBe(content.id);
  });

  it('trigger has aria-expanded reflecting open state', () => {
    const { trigger, content } = Sheet.Root();
    container.appendChild(trigger);
    container.appendChild(content);

    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    trigger.click();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    trigger.click();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('traps focus inside sheet when open', () => {
    const { content, trigger } = Sheet.Root();
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

  it('focuses first focusable element on open', async () => {
    const { content, trigger } = Sheet.Root();
    const btn = document.createElement('button');
    btn.textContent = 'Inside';
    content.appendChild(btn);
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();

    // focusFirst is called via queueMicrotask
    await new Promise((resolve) => queueMicrotask(resolve));
    expect(document.activeElement).toBe(btn);
  });

  it('restores focus to trigger on close', () => {
    const { close, content, trigger } = Sheet.Root();
    content.appendChild(close);
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.focus();
    trigger.click();

    close.click();
    expect(document.activeElement).toBe(trigger);
  });

  it('default side is right', () => {
    const { content } = Sheet.Root();
    expect(content.getAttribute('data-side')).toBe('right');
  });

  it('side left sets data-side="left"', () => {
    const { content } = Sheet.Root({ side: 'left' });
    expect(content.getAttribute('data-side')).toBe('left');
  });

  it('side top sets data-side="top"', () => {
    const { content } = Sheet.Root({ side: 'top' });
    expect(content.getAttribute('data-side')).toBe('top');
  });

  it('side bottom sets data-side="bottom"', () => {
    const { content } = Sheet.Root({ side: 'bottom' });
    expect(content.getAttribute('data-side')).toBe('bottom');
  });

  it('sets data-state on trigger, overlay, and content', () => {
    const { trigger, overlay, content } = Sheet.Root();
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
  });

  it('supports defaultOpen option', () => {
    const { trigger, overlay, content, state } = Sheet.Root({ defaultOpen: true });

    expect(state.open.peek()).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('data-state')).toBe('open');
    expect(overlay.getAttribute('data-state')).toBe('open');
    expect(content.getAttribute('data-state')).toBe('open');
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(overlay.getAttribute('aria-hidden')).toBe('false');
  });

  it('calls onOpenChange callback', () => {
    const onOpenChange = mock();
    const { trigger, content } = Sheet.Root({ onOpenChange });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();
    expect(onOpenChange).toHaveBeenCalledWith(true);

    trigger.click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('content has data-side for CSS animation targeting', () => {
    const { content, trigger } = Sheet.Root({ side: 'left' });
    container.appendChild(trigger);
    container.appendChild(content);

    // data-side is always present for CSS targeting
    expect(content.getAttribute('data-side')).toBe('left');

    trigger.click();

    // data-side persists when open for [data-side="left"][data-state="open"] selectors
    expect(content.getAttribute('data-side')).toBe('left');
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('swipe in dismiss direction closes sheet (right side)', () => {
    const { content, trigger, state } = Sheet.Root({ side: 'right' });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();
    expect(state.open.peek()).toBe(true);

    // Swipe right to dismiss (positive X for side="right")
    content.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 100, clientY: 200, bubbles: true }),
    );
    content.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 160, clientY: 200, bubbles: true }),
    );
    content.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 160, clientY: 200, bubbles: true }),
    );

    expect(state.open.peek()).toBe(false);
  });

  it('swipe in dismiss direction closes sheet (left side)', () => {
    const { content, trigger, state } = Sheet.Root({ side: 'left' });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();
    expect(state.open.peek()).toBe(true);

    // Swipe left to dismiss (negative X for side="left")
    content.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 200, clientY: 200, bubbles: true }),
    );
    content.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 140, clientY: 200, bubbles: true }),
    );
    content.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 140, clientY: 200, bubbles: true }),
    );

    expect(state.open.peek()).toBe(false);
  });

  it('swipe below threshold does not close sheet', () => {
    const { content, trigger, state } = Sheet.Root({ side: 'right' });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();
    expect(state.open.peek()).toBe(true);

    // Swipe only 30px (below 50px threshold)
    content.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 100, clientY: 200, bubbles: true }),
    );
    content.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 130, clientY: 200, bubbles: true }),
    );
    content.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 130, clientY: 200, bubbles: true }),
    );

    expect(state.open.peek()).toBe(true);
  });

  it('swipe down dismisses bottom sheet', () => {
    const { content, trigger, state } = Sheet.Root({ side: 'bottom' });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();
    expect(state.open.peek()).toBe(true);

    content.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 200, clientY: 100, bubbles: true }),
    );
    content.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 200, clientY: 160, bubbles: true }),
    );

    expect(state.open.peek()).toBe(false);
  });

  it('swipe up dismisses top sheet', () => {
    const { content, trigger, state } = Sheet.Root({ side: 'top' });
    container.appendChild(trigger);
    container.appendChild(content);

    trigger.click();
    expect(state.open.peek()).toBe(true);

    content.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 200, clientY: 200, bubbles: true }),
    );
    content.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 200, clientY: 140, bubbles: true }),
    );

    expect(state.open.peek()).toBe(false);
  });

  it('show() and hide() control sheet programmatically', () => {
    const { content, overlay, state, show, hide } = Sheet.Root();
    container.appendChild(overlay);
    container.appendChild(content);

    expect(state.open.peek()).toBe(false);

    show();
    expect(state.open.peek()).toBe(true);
    expect(content.getAttribute('data-state')).toBe('open');

    hide();
    expect(state.open.peek()).toBe(false);
    expect(content.getAttribute('data-state')).toBe('closed');
  });
});
