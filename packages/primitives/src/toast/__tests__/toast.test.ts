import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toast } from '../toast';

describe('Toast', () => {
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

  it('creates live region with aria-live="polite"', () => {
    const { region } = Toast.Root();
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
  });

  it('supports assertive politeness', () => {
    const { region } = Toast.Root({ politeness: 'assertive' });
    expect(region.getAttribute('aria-live')).toBe('assertive');
  });

  it('announces a message', () => {
    const { region, state, announce } = Toast.Root();
    container.appendChild(region);

    const msg = announce('Hello');
    expect(msg.content).toBe('Hello');
    expect(state.messages.peek()).toHaveLength(1);
    expect(region.querySelector('[data-toast-id]')).toBeTruthy();
    expect(region.getAttribute('data-state')).toBe('active');
  });

  it('dismisses a message', () => {
    const { region, state, announce, dismiss } = Toast.Root({ duration: 0 });
    container.appendChild(region);

    const msg = announce('Hello');
    dismiss(msg.id);

    expect(state.messages.peek()).toHaveLength(0);
    expect(region.querySelector('[data-toast-id]')).toBeNull();
    expect(region.getAttribute('data-state')).toBe('empty');
  });

  it('auto-dismisses after duration', () => {
    const { region, state, announce } = Toast.Root({ duration: 3000 });
    container.appendChild(region);

    announce('Auto dismiss');
    expect(state.messages.peek()).toHaveLength(1);

    vi.advanceTimersByTime(3000);
    expect(state.messages.peek()).toHaveLength(0);
  });

  it('supports multiple messages', () => {
    const { region, state, announce } = Toast.Root({ duration: 0 });
    container.appendChild(region);

    announce('First');
    announce('Second');
    expect(state.messages.peek()).toHaveLength(2);
  });

  it('sets data-state on toast elements', () => {
    const { region, announce, dismiss } = Toast.Root({ duration: 0 });
    container.appendChild(region);

    const msg = announce('Test');
    const el = region.querySelector(`[data-toast-id="${msg.id}"]`) as HTMLElement;
    expect(el.getAttribute('data-state')).toBe('open');

    dismiss(msg.id);
    // Element is removed, so we just verify the dismiss worked
  });
});
