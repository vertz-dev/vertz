import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ComposedTextarea } from '../textarea-composed';

describe('Composed Textarea', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a ComposedTextarea with classes', () => {
    describe('When rendered', () => {
      it('Then returns a textarea element', () => {
        const el = ComposedTextarea({});
        expect(el.tagName).toBe('TEXTAREA');
      });

      it('Then applies classes.base as className', () => {
        const el = ComposedTextarea({ classes: { base: 'themed-textarea' } });
        expect(el.className).toBe('themed-textarea');
      });

      it('Then merges className prop with classes.base', () => {
        const el = ComposedTextarea({
          classes: { base: 'themed' },
          className: 'custom',
        });
        expect(el.className).toBe('themed custom');
      });
    });
  });

  describe('Given a ComposedTextarea with debounce prop', () => {
    describe('When rendered', () => {
      it('Then sets data-vertz-debounce attribute', () => {
        const el = ComposedTextarea({ debounce: 500 });
        expect(el.getAttribute('data-vertz-debounce')).toBe('500');
      });

      it('Then does NOT set data-vertz-debounce when debounce is not provided', () => {
        const el = ComposedTextarea({ name: 'desc' });
        expect(el.hasAttribute('data-vertz-debounce')).toBe(false);
      });
    });
  });

  describe('Given a ComposedTextarea with HTML props', () => {
    describe('When rendered', () => {
      it('Then forwards name prop', () => {
        const el = ComposedTextarea({ name: 'bio' });
        expect(el.name).toBe('bio');
      });

      it('Then forwards placeholder prop', () => {
        const el = ComposedTextarea({ placeholder: 'Tell us about yourself' });
        expect(el.placeholder).toBe('Tell us about yourself');
      });

      it('Then forwards disabled prop', () => {
        const el = ComposedTextarea({ disabled: true });
        expect(el.disabled).toBe(true);
      });

      it('Then forwards rows prop', () => {
        const el = ComposedTextarea({ rows: 5 });
        expect(el.getAttribute('rows')).toBe('5');
      });

      it('Then forwards value prop', () => {
        const el = ComposedTextarea({ value: 'Hello world' });
        expect(el.value).toBe('Hello world');
      });
    });
  });
});
