import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Slider } from '../slider';

describe('Slider', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('creates slider with role="slider"', () => {
    const { thumb } = Slider.Root();
    expect(thumb.getAttribute('role')).toBe('slider');
  });

  it('sets aria-valuenow/min/max', () => {
    const { thumb } = Slider.Root({ defaultValue: 50, min: 0, max: 100 });
    expect(thumb.getAttribute('aria-valuenow')).toBe('50');
    expect(thumb.getAttribute('aria-valuemin')).toBe('0');
    expect(thumb.getAttribute('aria-valuemax')).toBe('100');
  });

  it('increments with ArrowRight', () => {
    const onValueChange = vi.fn();
    const { thumb, state } = Slider.Root({
      defaultValue: 50,
      step: 5,
      onValueChange,
    });
    container.appendChild(thumb);

    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(state.value.peek()).toBe(55);
    expect(thumb.getAttribute('aria-valuenow')).toBe('55');
    expect(onValueChange).toHaveBeenCalledWith(55);
  });

  it('decrements with ArrowLeft', () => {
    const { thumb, state } = Slider.Root({ defaultValue: 50, step: 10 });
    container.appendChild(thumb);

    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(state.value.peek()).toBe(40);
  });

  it('clamps to min/max', () => {
    const { thumb, state } = Slider.Root({
      defaultValue: 99,
      min: 0,
      max: 100,
      step: 5,
    });
    container.appendChild(thumb);

    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(state.value.peek()).toBe(100);

    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(state.value.peek()).toBe(100);
  });

  it('jumps to min with Home', () => {
    const { thumb, state } = Slider.Root({ defaultValue: 50, min: 0, max: 100 });
    container.appendChild(thumb);

    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(state.value.peek()).toBe(0);
  });

  it('jumps to max with End', () => {
    const { thumb, state } = Slider.Root({ defaultValue: 50, min: 0, max: 100 });
    container.appendChild(thumb);

    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(state.value.peek()).toBe(100);
  });

  it('does not respond when disabled', () => {
    const { thumb, state } = Slider.Root({ defaultValue: 50, disabled: true });
    container.appendChild(thumb);

    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(state.value.peek()).toBe(50);
  });

  it('sets data-state', () => {
    const { root } = Slider.Root({ disabled: true });
    expect(root.getAttribute('data-state')).toBe('disabled');
  });
});
