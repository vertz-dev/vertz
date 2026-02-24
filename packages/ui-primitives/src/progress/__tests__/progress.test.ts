import { describe, expect, it } from 'bun:test';
import { Progress } from '../progress';

describe('Progress', () => {
  it('creates progress with role="progressbar"', () => {
    const { root } = Progress.Root();
    expect(root.getAttribute('role')).toBe('progressbar');
  });

  it('sets aria-valuenow/min/max', () => {
    const { root } = Progress.Root({ defaultValue: 30, min: 0, max: 100 });
    expect(root.getAttribute('aria-valuenow')).toBe('30');
    expect(root.getAttribute('aria-valuemin')).toBe('0');
    expect(root.getAttribute('aria-valuemax')).toBe('100');
  });

  it('has data-state="idle" when at 0', () => {
    const { root } = Progress.Root({ defaultValue: 0 });
    expect(root.getAttribute('data-state')).toBe('idle');
  });

  it('has data-state="loading" when in progress', () => {
    const { root } = Progress.Root({ defaultValue: 50 });
    expect(root.getAttribute('data-state')).toBe('loading');
  });

  it('has data-state="complete" when at 100%', () => {
    const { root } = Progress.Root({ defaultValue: 100 });
    expect(root.getAttribute('data-state')).toBe('complete');
  });

  it('updates value with setValue', () => {
    const { root, state, setValue } = Progress.Root({ defaultValue: 0 });
    setValue(75);

    expect(state.value.peek()).toBe(75);
    expect(root.getAttribute('aria-valuenow')).toBe('75');
    expect(root.getAttribute('data-state')).toBe('loading');
  });

  it('clamps value to range', () => {
    const { state, setValue } = Progress.Root({ min: 0, max: 100 });
    setValue(150);
    expect(state.value.peek()).toBe(100);

    setValue(-10);
    expect(state.value.peek()).toBe(0);
  });

  it('updates indicator width', () => {
    const { indicator, setValue } = Progress.Root({ defaultValue: 0 });
    expect(indicator.style.width).toBe('0%');

    setValue(50);
    expect(indicator.style.width).toBe('50%');

    setValue(100);
    expect(indicator.style.width).toBe('100%');
  });

  it('has indicator with data-part="indicator"', () => {
    const { indicator } = Progress.Root();
    expect(indicator.getAttribute('data-part')).toBe('indicator');
  });
});
