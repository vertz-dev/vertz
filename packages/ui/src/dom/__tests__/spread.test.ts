import { describe, expect, it } from 'bun:test';
import { __spread } from '../spread';
import { SVG_NS } from '../svg-tags';

describe('Feature: Intrinsic element spread attributes', () => {
  describe('Given a spread with event handlers', () => {
    describe('When __spread is called', () => {
      it('Then event handlers are attached via addEventListener', () => {
        const el = document.createElement('button');
        let clicked = false;
        __spread(el, {
          onClick: () => {
            clicked = true;
          },
        });
        el.click();
        expect(clicked).toBe(true);
      });

      it('Then onFocus is attached as focus', () => {
        const el = document.createElement('input');
        let focused = false;
        __spread(el, {
          onFocus: () => {
            focused = true;
          },
        });
        el.dispatchEvent(new Event('focus'));
        expect(focused).toBe(true);
      });
    });
  });

  describe('Given a spread with data-* attributes', () => {
    describe('When __spread is called', () => {
      it('Then attributes are set via setAttribute', () => {
        const el = document.createElement('div');
        __spread(el, { 'data-testid': 'my-btn', 'data-value': '42' });
        expect(el.getAttribute('data-testid')).toBe('my-btn');
        expect(el.getAttribute('data-value')).toBe('42');
      });
    });
  });

  describe('Given a spread with aria-* attributes', () => {
    describe('When __spread is called', () => {
      it('Then attributes are set via setAttribute', () => {
        const el = document.createElement('button');
        __spread(el, { 'aria-label': 'Close', 'aria-hidden': 'true' });
        expect(el.getAttribute('aria-label')).toBe('Close');
        expect(el.getAttribute('aria-hidden')).toBe('true');
      });
    });
  });

  describe('Given a spread with style object', () => {
    describe('When __spread is called', () => {
      it('Then style is converted to string and set (replace, not merge)', () => {
        const el = document.createElement('div');
        el.setAttribute('style', 'color: red');
        __spread(el, { style: { backgroundColor: 'blue', padding: 8 } });
        const style = el.getAttribute('style');
        expect(style).toContain('background-color: blue');
        expect(style).toContain('padding: 8px');
        // Replace, not merge — original 'color: red' should be gone
        expect(style).not.toContain('color: red');
      });
    });
  });

  describe('Given a spread with style string', () => {
    describe('When __spread is called', () => {
      it('Then style string is set directly (replace, not merge)', () => {
        const el = document.createElement('div');
        el.setAttribute('style', 'color: red');
        __spread(el, { style: 'font-size: 16px' });
        expect(el.getAttribute('style')).toBe('font-size: 16px');
      });
    });
  });

  describe('Given a spread with className key', () => {
    describe('When __spread is called', () => {
      it('Then className is normalized to class and set (replace, not merge)', () => {
        const el = document.createElement('div');
        el.setAttribute('class', 'existing');
        __spread(el, { className: 'new-class' });
        expect(el.getAttribute('class')).toBe('new-class');
      });
    });
  });

  describe('Given a spread with class key', () => {
    describe('When __spread is called', () => {
      it('Then class is set via setAttribute', () => {
        const el = document.createElement('div');
        __spread(el, { class: 'my-class' });
        expect(el.getAttribute('class')).toBe('my-class');
      });
    });
  });

  describe('Given a spread with htmlFor key', () => {
    describe('When __spread is called', () => {
      it('Then htmlFor is normalized to for', () => {
        const el = document.createElement('label');
        __spread(el, { htmlFor: 'input-id' });
        expect(el.getAttribute('for')).toBe('input-id');
      });
    });
  });

  describe('Given a spread with ref', () => {
    describe('When __spread is called', () => {
      it('Then ref.current is set to the element', () => {
        const el = document.createElement('div');
        const myRef = { current: null as Element | null };
        __spread(el, { ref: myRef });
        expect(myRef.current).toBe(el);
      });
    });
  });

  describe('Given a spread with children or key', () => {
    describe('When __spread is called', () => {
      it('Then children and key are skipped', () => {
        const el = document.createElement('div');
        __spread(el, { children: 'text', key: 'k1', 'data-ok': 'yes' });
        expect(el.getAttribute('children')).toBeNull();
        expect(el.getAttribute('key')).toBeNull();
        expect(el.getAttribute('data-ok')).toBe('yes');
      });
    });
  });

  describe('Given a spread with null/false/undefined values', () => {
    describe('When __spread is called', () => {
      it('Then those keys are skipped', () => {
        const el = document.createElement('div');
        __spread(el, {
          'data-null': null,
          'data-false': false,
          'data-undef': undefined,
        });
        expect(el.getAttribute('data-null')).toBeNull();
        expect(el.getAttribute('data-false')).toBeNull();
        expect(el.getAttribute('data-undef')).toBeNull();
      });
    });
  });

  describe('Given a spread with boolean true value', () => {
    describe('When __spread is called', () => {
      it('Then attribute is set as empty string', () => {
        const el = document.createElement('button');
        __spread(el, { disabled: true });
        expect(el.getAttribute('disabled')).toBe('');
      });
    });
  });

  describe('Given a spread on an SVG element', () => {
    describe('When __spread is called', () => {
      it('Then camelCase attributes are normalized (strokeWidth -> stroke-width)', () => {
        const el = document.createElementNS(SVG_NS, 'circle');
        __spread(el, { strokeWidth: '2', fillOpacity: '0.5', cx: '50' });
        expect(el.getAttribute('stroke-width')).toBe('2');
        expect(el.getAttribute('fill-opacity')).toBe('0.5');
        expect(el.getAttribute('cx')).toBe('50');
      });
    });
  });
});
