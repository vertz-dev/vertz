import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { ComposedSlider } from '../slider-composed';

describe('Composed Slider', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a ComposedSlider with classes', () => {
    describe('When rendered', () => {
      it('Then applies root, track, range, and thumb classes', () => {
        const root = ComposedSlider({
          classes: { root: 'sl-root', track: 'sl-track', range: 'sl-range', thumb: 'sl-thumb' },
        });
        container.appendChild(root);

        expect(root.className).toContain('sl-root');

        const track = root.querySelector('[data-part="track"]') as HTMLElement;
        expect(track).not.toBeNull();
        expect(track?.className).toContain('sl-track');

        const fill = track?.querySelector('[data-part="fill"]') as HTMLElement;
        expect(fill).not.toBeNull();
        expect(fill?.className).toContain('sl-range');

        const thumb = root.querySelector('[data-part="thumb"]') as HTMLElement;
        expect(thumb).not.toBeNull();
        expect(thumb?.className).toContain('sl-thumb');
      });
    });
  });

  describe('Given a ComposedSlider with onValueChange', () => {
    describe('When thumb is moved via keyboard', () => {
      it('Then fires onValueChange with the new value', () => {
        let lastValue: unknown;
        const root = ComposedSlider({
          defaultValue: 50,
          min: 0,
          max: 100,
          step: 10,
          onValueChange: (v) => {
            lastValue = v;
          },
        });
        container.appendChild(root);

        const thumb = root.querySelector('[role="slider"]') as HTMLElement;
        // Simulate ArrowRight key
        const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
        thumb.dispatchEvent(event);
        expect(lastValue).toBe(60);
      });
    });
  });
});
