import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { ComposedButton } from '../button-composed';

describe('Composed Button', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a ComposedButton', () => {
    describe('When rendered', () => {
      it('Then returns a button element', () => {
        const el = ComposedButton({ children: 'Click' });
        expect(el.tagName).toBe('BUTTON');
      });

      it('Then defaults type to "button"', () => {
        const el = ComposedButton({ children: 'Click' });
        expect(el.type).toBe('button');
      });

      it('Then applies classes.base as className', () => {
        const el = ComposedButton({
          classes: { base: 'btn-primary' },
          children: 'Click',
        });
        expect(el.className).toBe('btn-primary');
      });

      it('Then renders children', () => {
        const el = ComposedButton({ children: 'Submit' });
        container.appendChild(el);
        expect(el.textContent).toBe('Submit');
      });
    });
  });

  describe('Given a ComposedButton with type override', () => {
    describe('When rendered', () => {
      it('Then uses the specified type', () => {
        const el = ComposedButton({ type: 'submit', children: 'Send' });
        expect(el.type).toBe('submit');
      });
    });
  });

  describe('Given a ComposedButton with disabled', () => {
    describe('When rendered', () => {
      it('Then sets the disabled attribute', () => {
        const el = ComposedButton({ disabled: true, children: 'No click' });
        expect(el.disabled).toBe(true);
      });
    });
  });

  describe('Given a ComposedButton with event handlers', () => {
    describe('When clicked', () => {
      it('Then fires the onClick handler', () => {
        const onClick = mock(() => {});
        const el = ComposedButton({ onClick, children: 'Click me' });
        container.appendChild(el);
        el.click();
        expect(onClick).toHaveBeenCalled();
      });
    });
  });

  describe('Given a ComposedButton with className', () => {
    describe('When rendered', () => {
      it('Then merges className with classes.base', () => {
        const el = ComposedButton({
          classes: { base: 'btn' },
          className: 'extra',
          children: 'Click',
        });
        expect(el.className).toBe('btn extra');
      });
    });
  });
});
