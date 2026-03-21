import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ComposedLabel } from '../label-composed';

describe('Composed Label', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a ComposedLabel with classes', () => {
    describe('When rendered', () => {
      it('Then returns a label element', () => {
        const el = ComposedLabel({ children: 'Email' });
        expect(el.tagName).toBe('LABEL');
      });

      it('Then applies classes.base as className', () => {
        const el = ComposedLabel({
          classes: { base: 'themed-label' },
          children: 'Email',
        });
        expect(el.className).toBe('themed-label');
      });

      it('Then renders children', () => {
        const el = ComposedLabel({ children: 'Email' });
        container.appendChild(el);
        expect(el.textContent).toBe('Email');
      });
    });
  });

  describe('Given a ComposedLabel with for prop', () => {
    describe('When rendered', () => {
      it('Then sets htmlFor attribute', () => {
        const el = ComposedLabel({ for: 'email-input', children: 'Email' });
        expect(el.htmlFor).toBe('email-input');
      });
    });
  });
});
