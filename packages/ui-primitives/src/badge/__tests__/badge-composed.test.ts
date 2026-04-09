import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { ComposedBadge } from '../badge-composed';

describe('Composed Badge', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a ComposedBadge', () => {
    describe('When rendered', () => {
      it('Then returns a span element', () => {
        const el = ComposedBadge({ children: 'New' });
        expect(el.tagName).toBe('SPAN');
      });

      it('Then applies classes.base as className', () => {
        const el = ComposedBadge({
          classes: { base: 'badge-default' },
          children: 'New',
        });
        expect(el.className).toBe('badge-default');
      });

      it('Then renders children', () => {
        const el = ComposedBadge({ children: 'Beta' });
        container.appendChild(el);
        expect(el.textContent).toBe('Beta');
      });
    });
  });

  describe('Given a ComposedBadge with inline styles', () => {
    describe('When rendered', () => {
      it('Then applies the style prop', () => {
        const el = ComposedBadge({
          children: 'Status',
          style: { backgroundColor: 'red', color: 'white' },
        });
        expect(el.style.backgroundColor).toBe('red');
        expect(el.style.color).toBe('white');
      });
    });
  });

  describe('Given a ComposedBadge with className', () => {
    describe('When rendered', () => {
      it('Then merges className with classes.base', () => {
        const el = ComposedBadge({
          classes: { base: 'badge' },
          className: 'ml-2',
          children: 'Tag',
        });
        expect(el.className).toBe('badge ml-2');
      });
    });
  });
});
