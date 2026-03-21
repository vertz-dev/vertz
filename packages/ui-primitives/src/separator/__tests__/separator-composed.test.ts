import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ComposedSeparator } from '../separator-composed';

describe('Composed Separator', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a ComposedSeparator', () => {
    describe('When rendered with default orientation', () => {
      it('Then returns an hr element', () => {
        const el = ComposedSeparator({});
        expect(el.tagName).toBe('HR');
      });

      it('Then sets role="separator"', () => {
        const el = ComposedSeparator({});
        expect(el.getAttribute('role')).toBe('separator');
      });

      it('Then defaults to horizontal orientation', () => {
        const el = ComposedSeparator({});
        expect(el.getAttribute('aria-orientation')).toBe('horizontal');
      });

      it('Then applies base + horizontal classes', () => {
        const el = ComposedSeparator({
          classes: { base: 'sep-base', horizontal: 'sep-h', vertical: 'sep-v' },
        });
        expect(el.className).toBe('sep-base sep-h');
      });
    });

    describe('When rendered with vertical orientation', () => {
      it('Then sets aria-orientation to vertical', () => {
        const el = ComposedSeparator({ orientation: 'vertical' });
        expect(el.getAttribute('aria-orientation')).toBe('vertical');
      });

      it('Then applies base + vertical classes', () => {
        const el = ComposedSeparator({
          orientation: 'vertical',
          classes: { base: 'sep-base', horizontal: 'sep-h', vertical: 'sep-v' },
        });
        expect(el.className).toBe('sep-base sep-v');
      });
    });

    describe('When rendered with className', () => {
      it('Then merges className with orientation classes', () => {
        const el = ComposedSeparator({
          classes: { base: 'sep-base', horizontal: 'sep-h' },
          className: 'custom',
        });
        expect(el.className).toBe('sep-base sep-h custom');
      });
    });
  });
});
