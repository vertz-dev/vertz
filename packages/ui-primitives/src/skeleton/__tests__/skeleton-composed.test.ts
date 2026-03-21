import { describe, expect, it } from 'bun:test';
import { ComposedSkeleton } from '../skeleton-composed';

describe('Composed Skeleton', () => {
  describe('Given a ComposedSkeleton', () => {
    describe('When rendered', () => {
      it('Then returns a div element', () => {
        const el = ComposedSkeleton({});
        expect(el.tagName).toBe('DIV');
      });

      it('Then sets aria-hidden="true"', () => {
        const el = ComposedSkeleton({});
        expect(el.getAttribute('aria-hidden')).toBe('true');
      });

      it('Then applies classes.base as className', () => {
        const el = ComposedSkeleton({ classes: { base: 'skeleton-pulse' } });
        expect(el.className).toBe('skeleton-pulse');
      });
    });
  });

  describe('Given a ComposedSkeleton with dimensions', () => {
    describe('When rendered with width and height', () => {
      it('Then sets width via inline style', () => {
        const el = ComposedSkeleton({ width: '200px' });
        expect(el.style.width).toBe('200px');
      });

      it('Then sets height via inline style', () => {
        const el = ComposedSkeleton({ height: '40px' });
        expect(el.style.height).toBe('40px');
      });
    });

    describe('When rendered without dimensions', () => {
      it('Then does not set width or height styles', () => {
        const el = ComposedSkeleton({});
        expect(el.style.width).toBe('');
        expect(el.style.height).toBe('');
      });
    });
  });

  describe('Given a ComposedSkeleton called with no args', () => {
    describe('When rendered', () => {
      it('Then works with default empty props', () => {
        const el = ComposedSkeleton();
        expect(el.tagName).toBe('DIV');
        expect(el.getAttribute('aria-hidden')).toBe('true');
      });
    });
  });
});
