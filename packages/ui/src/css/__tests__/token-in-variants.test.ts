import { beforeEach, describe, expect, it } from '@vertz/test';
import { getInjectedCSS, resetInjectedStyles } from '../css';
import { token } from '../token';
import { variants } from '../variants';

describe('token.* — used in variants()', () => {
  beforeEach(() => {
    resetInjectedStyles();
  });

  describe('Given a token at a variant option style block', () => {
    describe('When the variant is resolved', () => {
      it('Then the generated CSS contains the var(--...) form', () => {
        const button = variants({
          base: { display: 'inline-flex' },
          variants: {
            tone: {
              soft: { color: token.color.primary[500] },
              strong: { color: token.color.primary[700] },
            },
          },
        });
        void button({ tone: 'soft' });
        void button({ tone: 'strong' });
        const css = getInjectedCSS().join('\n');
        expect(css).toContain('color: var(--color-primary-500)');
        expect(css).toContain('color: var(--color-primary-700)');
      });
    });
  });

  describe('Given two options that differ only by token shade', () => {
    describe('When each option is resolved', () => {
      it('Then the resolved class names differ', () => {
        const button = variants({
          base: {},
          variants: {
            tone: {
              soft: { color: token.color.primary[500] },
              strong: { color: token.color.primary[700] },
            },
          },
        });
        const soft = button({ tone: 'soft' });
        const strong = button({ tone: 'strong' });
        expect(soft).not.toBe(strong);
      });
    });
  });

  describe('Given identical configs in two variants() calls', () => {
    describe('When the same option is resolved in each', () => {
      it('Then class names are identical (stable hash across calls)', () => {
        const a = variants({
          base: {},
          variants: { tone: { soft: { color: token.color.primary[500] } } },
        });
        const b = variants({
          base: {},
          variants: { tone: { soft: { color: token.color.primary[500] } } },
        });
        expect(a({ tone: 'soft' })).toBe(b({ tone: 'soft' }));
      });
    });
  });

  describe('Given two variants() calls that differ ONLY by token value', () => {
    describe('When the same option key is resolved in each', () => {
      it('Then class names are different (no fingerprint collision)', () => {
        const a = variants({
          base: {},
          variants: { tone: { soft: { color: token.color.primary[500] } } },
        });
        const b = variants({
          base: {},
          variants: { tone: { soft: { color: token.color.primary[700] } } },
        });
        expect(a({ tone: 'soft' })).not.toBe(b({ tone: 'soft' }));
      });
    });
  });

  describe('Given a token inside compoundVariants styles', () => {
    describe('When the matching compound is resolved', () => {
      it('Then the generated CSS contains the var(--...) form', () => {
        const button = variants({
          base: {},
          variants: {
            tone: { primary: { color: 'white' } },
            size: { sm: { fontSize: '12px' } },
          },
          compoundVariants: [
            {
              tone: 'primary',
              size: 'sm',
              styles: { backgroundColor: token.color.primary[500] },
            },
          ],
        });
        void button({ tone: 'primary', size: 'sm' });
        const css = getInjectedCSS().join('\n');
        expect(css).toContain('background-color: var(--color-primary-500)');
      });
    });
  });
});
