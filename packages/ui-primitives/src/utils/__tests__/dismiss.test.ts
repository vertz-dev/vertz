import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createDismiss } from '../dismiss';

describe('createDismiss', () => {
  let insideElement: HTMLElement;
  let outsideElement: HTMLElement;

  beforeEach(() => {
    insideElement = document.createElement('div');
    outsideElement = document.createElement('div');
    document.body.appendChild(insideElement);
    document.body.appendChild(outsideElement);
  });

  afterEach(() => {
    insideElement.remove();
    outsideElement.remove();
  });

  it('calls onDismiss on pointerdown outside', () => {
    const onDismiss = mock(() => {});
    const cleanup = createDismiss({ onDismiss, insideElements: [insideElement] });

    outsideElement.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('does NOT call onDismiss on pointerdown inside insideElements', () => {
    const onDismiss = mock(() => {});
    const cleanup = createDismiss({ onDismiss, insideElements: [insideElement] });

    insideElement.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onDismiss).not.toHaveBeenCalled();

    cleanup();
  });

  it('calls onDismiss on Escape key', () => {
    const onDismiss = mock(() => {});
    const cleanup = createDismiss({ onDismiss, insideElements: [insideElement] });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('cleanup removes all listeners', () => {
    const onDismiss = mock(() => {});
    const cleanup = createDismiss({ onDismiss, insideElements: [insideElement] });

    cleanup();

    outsideElement.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('respects escapeKey: false', () => {
    const onDismiss = mock(() => {});
    const cleanup = createDismiss({
      onDismiss,
      insideElements: [insideElement],
      escapeKey: false,
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onDismiss).not.toHaveBeenCalled();

    // clickOutside still works
    outsideElement.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('respects clickOutside: false', () => {
    const onDismiss = mock(() => {});
    const cleanup = createDismiss({
      onDismiss,
      insideElements: [insideElement],
      clickOutside: false,
    });

    outsideElement.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onDismiss).not.toHaveBeenCalled();

    // escapeKey still works
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
