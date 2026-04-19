import { describe, expect, it } from '@vertz/test';
import { jsx } from '../index';

describe('JSX runtime IDL property handling', () => {
  describe('Given a <select> with value prop and option children', () => {
    describe('When rendered via jsx()', () => {
      it('Then sets value via property assignment after children are appended', () => {
        const opt1 = jsx('option', { value: 'a', children: 'A' });
        const opt2 = jsx('option', { value: 'b', children: 'B' });
        const select = jsx('select', { value: 'b', children: [opt1, opt2] }) as HTMLSelectElement;

        expect(select.value).toBe('b');
      });
    });
  });

  describe('Given an <input> with value prop', () => {
    describe('When rendered via jsx()', () => {
      it('Then sets value via property assignment', () => {
        const input = jsx('input', { value: 'hello' }) as HTMLInputElement;
        expect(input.value).toBe('hello');
      });
    });
  });

  describe('Given an <input type="checkbox"> with checked prop', () => {
    describe('When rendered via jsx()', () => {
      it('Then sets checked via property assignment', () => {
        const input = jsx('input', { type: 'checkbox', checked: true }) as HTMLInputElement;
        expect(input.checked).toBe(true);
      });
    });
  });

  describe('Given a <textarea> with value prop', () => {
    describe('When rendered via jsx()', () => {
      it('Then sets value via property assignment', () => {
        const textarea = jsx('textarea', { value: 'content' }) as HTMLTextAreaElement;
        expect(textarea.value).toBe('content');
      });
    });
  });

  describe('Given a <select> with null value', () => {
    describe('When rendered via jsx()', () => {
      it('Then does not set value property', () => {
        const opt = jsx('option', { value: 'a', children: 'A' });
        const select = jsx('select', { value: null, children: [opt] }) as HTMLSelectElement;

        // null value should not be set — select defaults to first option
        expect(select.value).toBe('a');
      });
    });
  });

  describe('Given an <input> with defaultValue prop', () => {
    describe('When rendered via jsx()', () => {
      it('Then sets defaultValue via property assignment', () => {
        const input = jsx('input', { defaultValue: 'hello' }) as HTMLInputElement;
        expect(input.defaultValue).toBe('hello');
        expect(input.value).toBe('hello');
      });
    });
  });

  describe('Given a <textarea> with defaultValue prop', () => {
    describe('When rendered via jsx()', () => {
      it('Then sets defaultValue via property assignment', () => {
        const textarea = jsx('textarea', { defaultValue: 'Hello world' }) as HTMLTextAreaElement;
        expect(textarea.defaultValue).toBe('Hello world');
        expect(textarea.value).toBe('Hello world');
      });
    });
  });

  describe('Given an <input type="checkbox"> with defaultChecked prop', () => {
    describe('When rendered via jsx()', () => {
      it('Then sets defaultChecked via property assignment', () => {
        const input = jsx('input', { type: 'checkbox', defaultChecked: true }) as HTMLInputElement;
        expect(input.defaultChecked).toBe(true);
        expect(input.checked).toBe(true);
      });
    });
  });
});
