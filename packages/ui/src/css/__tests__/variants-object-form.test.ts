import { beforeEach, describe, expect, it } from '@vertz/test';
import { resetInjectedStyles } from '../css';
import { variants } from '../variants';

describe('variants() — object form', () => {
  beforeEach(() => {
    resetInjectedStyles();
  });

  describe('Given a base + variant options all in object form', () => {
    describe('When calling the variant function', () => {
      it('Then merges base and option classes and renders their CSS', () => {
        const button = variants({
          base: { display: 'flex', fontWeight: 500 },
          variants: {
            intent: {
              primary: { backgroundColor: 'red', color: 'white' },
              ghost: { backgroundColor: 'transparent', color: 'black' },
            },
          },
        });
        const primaryClass = button({ intent: 'primary' });
        expect(primaryClass.split(' ').length).toBe(2);
        expect(button.css).toContain('display: flex');
        expect(button.css).toContain('font-weight: 500');
        expect(button.css).toContain('background-color: red');
        expect(button.css).toContain('color: white');
      });
    });
  });

  describe('Given a compound variant with object styles', () => {
    describe('When all compound conditions match', () => {
      it('Then applies the compound class with its styles', () => {
        const badge = variants({
          base: { display: 'inline-flex' },
          variants: {
            intent: { danger: { color: 'red' } },
            size: { sm: { fontSize: 12 } },
          },
          compoundVariants: [{ intent: 'danger', size: 'sm', styles: { padding: 4 } }],
        });
        const cls = badge({ intent: 'danger', size: 'sm' });
        // base + intent + size + compound = 4 classes
        expect(cls.split(' ').length).toBe(4);
        expect(badge.css).toContain('padding: 4px');
      });
    });
  });

  describe('Given a mix of array base and object variants (transient interop)', () => {
    describe('When both shapes appear in the same config', () => {
      it('Then each block compiles via its own path', () => {
        const card = variants({
          base: ['p:4'],
          variants: {
            tone: { muted: { color: 'var(--color-muted-foreground)' } },
          },
        });
        expect(typeof card({ tone: 'muted' })).toBe('string');
        expect(card.css).toContain('color: var(--color-muted-foreground)');
      });
    });
  });

  describe('Given two variants() calls with reordered keys in the block', () => {
    describe('When the object has the same properties in different order', () => {
      it('Then produces equivalent class names (hash stable)', () => {
        const a = variants({
          base: { color: 'red', padding: 4 },
          variants: { intent: { primary: { opacity: 1, fontWeight: 500 } } },
        });
        const b = variants({
          base: { padding: 4, color: 'red' },
          variants: { intent: { primary: { fontWeight: 500, opacity: 1 } } },
        });
        expect(a({ intent: 'primary' })).toBe(b({ intent: 'primary' }));
      });
    });
  });
});
