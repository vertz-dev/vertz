import { describe, expect, it } from '@vertz/test';
import { signal } from '../../runtime/signal';
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

      it('Then a callback ref is invoked with the element', () => {
        const el = document.createElement('span');
        let captured: Element | null = null;
        __spread(el, {
          ref: (node: Element) => {
            captured = node;
          },
        });
        expect(captured).toBe(el);
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

  describe('Given a spread with multi-word event name', () => {
    describe('When __spread is called', () => {
      it('Then event name is fully lowercased (onDblClick -> dblclick)', () => {
        const el = document.createElement('div');
        let fired = false;
        __spread(el, {
          onDblClick: () => {
            fired = true;
          },
        });
        el.dispatchEvent(new Event('dblclick'));
        expect(fired).toBe(true);
      });
    });
  });

  describe('Given a spread with IDL properties on form elements', () => {
    describe('When __spread sets value on an input', () => {
      it('Then sets the IDL property, not just the HTML attribute', () => {
        const el = document.createElement('input');
        // Simulate user typing (changes IDL property but not attribute)
        el.value = 'user-typed';
        __spread(el, { value: 'programmatic' });
        expect(el.value).toBe('programmatic');
      });

      it('Then checked is set as IDL property on input', () => {
        const el = document.createElement('input');
        el.type = 'checkbox';
        __spread(el, { checked: true });
        expect(el.checked).toBe(true);
      });
    });

    describe('When __spread sets value on a select', () => {
      it('Then sets the IDL property', () => {
        const el = document.createElement('select');
        const opt1 = document.createElement('option');
        opt1.value = 'a';
        const opt2 = document.createElement('option');
        opt2.value = 'b';
        el.appendChild(opt1);
        el.appendChild(opt2);
        __spread(el, { value: 'b' });
        expect(el.value).toBe('b');
      });
    });

    describe('When __spread sets value on a textarea', () => {
      it('Then sets the IDL property', () => {
        const el = document.createElement('textarea');
        __spread(el, { value: 'hello' });
        expect(el.value).toBe('hello');
      });
    });
  });

  describe('Given an empty spread object', () => {
    describe('When __spread is called', () => {
      it('Then no attributes are set (no-op)', () => {
        const el = document.createElement('div');
        el.setAttribute('data-existing', 'keep');
        __spread(el, {});
        expect(el.getAttribute('data-existing')).toBe('keep');
        expect(el.attributes.length).toBe(1);
      });
    });
  });

  describe('Given a spread with a reactive source (getter-based props)', () => {
    describe('When the source has getter descriptors for IDL properties', () => {
      it('Then IDL properties update reactively when the signal changes', () => {
        const el = document.createElement('input');
        const name = signal('initial');

        // Simulate compiler output: rest has the eagerly-evaluated value,
        // source (__props) has the getter that reads the signal
        const source = Object.defineProperties({} as Record<string, unknown>, {
          value: {
            get() {
              return name.value;
            },
            enumerable: true,
            configurable: true,
          },
        });
        const rest = { value: name.value }; // eagerly evaluated

        __spread(el, rest, source);
        expect(el.value).toBe('initial');

        name.value = 'updated';
        expect(el.value).toBe('updated');
      });
    });

    describe('When the source has getter descriptors for regular attributes', () => {
      it('Then attributes update reactively when the signal changes', () => {
        const el = document.createElement('div');
        const label = signal('Close');

        const source = Object.defineProperties({} as Record<string, unknown>, {
          'aria-label': {
            get() {
              return label.value;
            },
            enumerable: true,
            configurable: true,
          },
        });
        const rest = { 'aria-label': label.value };

        __spread(el, rest, source);
        expect(el.getAttribute('aria-label')).toBe('Close');

        label.value = 'Open';
        expect(el.getAttribute('aria-label')).toBe('Open');
      });
    });

    describe('When the source does NOT have a getter for a key', () => {
      it('Then the key is set one-shot from the rest object (no effect)', () => {
        const el = document.createElement('div');
        // Source has a getter only for aria-label, not data-static
        const source = Object.defineProperties({} as Record<string, unknown>, {
          'aria-label': {
            get() {
              return 'reactive';
            },
            enumerable: true,
            configurable: true,
          },
        });
        const rest = { 'aria-label': 'reactive', 'data-static': 'fixed' };

        __spread(el, rest, source);
        expect(el.getAttribute('aria-label')).toBe('reactive');
        expect(el.getAttribute('data-static')).toBe('fixed');
      });
    });
  });
});
