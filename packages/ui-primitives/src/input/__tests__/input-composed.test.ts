import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { ComposedInput } from '../input-composed';

describe('Composed Input', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a ComposedInput with classes', () => {
    describe('When rendered', () => {
      it('Then returns an input element', () => {
        const el = ComposedInput({});
        expect(el.tagName).toBe('INPUT');
      });

      it('Then applies classes.base as className', () => {
        const el = ComposedInput({ classes: { base: 'themed-input' } });
        expect(el.className).toBe('themed-input');
      });

      it('Then merges className prop with classes.base', () => {
        const el = ComposedInput({
          classes: { base: 'themed-input' },
          className: 'custom',
        });
        expect(el.className).toBe('themed-input custom');
      });

      it('Then does not set class when neither classes nor className provided', () => {
        const el = ComposedInput({});
        expect(el.className).toBe('');
      });
    });
  });

  describe('Given a ComposedInput with HTML props', () => {
    describe('When rendered', () => {
      it('Then forwards name prop', () => {
        const el = ComposedInput({ name: 'email' });
        expect(el.name).toBe('email');
      });

      it('Then forwards placeholder prop', () => {
        const el = ComposedInput({ placeholder: 'Enter email' });
        expect(el.placeholder).toBe('Enter email');
      });

      it('Then forwards type prop', () => {
        const el = ComposedInput({ type: 'email' });
        expect(el.type).toBe('email');
      });

      it('Then forwards disabled prop', () => {
        const el = ComposedInput({ disabled: true });
        expect(el.disabled).toBe(true);
      });

      it('Then forwards value prop', () => {
        const el = ComposedInput({ value: 'test@example.com' });
        expect(el.value).toBe('test@example.com');
      });
    });
  });

  describe('Given a ComposedInput with event handlers', () => {
    describe('When the input is interacted with', () => {
      it('Then forwards onFocus handler', () => {
        const onFocus = mock(() => {});
        const el = ComposedInput({ onFocus });
        container.appendChild(el);
        el.focus();
        expect(onFocus).toHaveBeenCalled();
      });
    });
  });

  describe('Given a ComposedInput with deprecated class prop', () => {
    describe('When rendered', () => {
      it('Then uses class prop as fallback for className', () => {
        const el = ComposedInput({
          classes: { base: 'themed' },
          class: 'legacy',
        });
        expect(el.className).toBe('themed legacy');
      });

      it('Then prefers className over class', () => {
        const el = ComposedInput({
          className: 'modern',
          class: 'legacy',
        });
        expect(el.className).toBe('modern');
      });
    });
  });
});
