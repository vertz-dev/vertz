import { beforeEach, describe, expect, it } from '@vertz/test';
import { css, resetInjectedStyles } from '../css';
import { token } from '../token';

describe('token.* — used as CSS values in css()', () => {
  beforeEach(() => {
    resetInjectedStyles();
  });

  describe('Given a token at a CSS property position', () => {
    describe('When css() serializes the block', () => {
      it('Then emits the var(--...) string form', () => {
        const styles = css({
          panel: {
            backgroundColor: token.color.background,
            color: token.color.primary[500],
            padding: token.spacing[4],
          },
        });
        expect(styles.css).toContain('background-color: var(--color-background)');
        expect(styles.css).toContain('color: var(--color-primary-500)');
        expect(styles.css).toContain('padding: var(--spacing-4)');
      });
    });
  });

  describe('Given a token inside a nested selector', () => {
    describe('When css() serializes nested rules', () => {
      it('Then emits the var(--...) string inside the nested block', () => {
        const styles = css({
          button: {
            color: 'white',
            '&:hover': { backgroundColor: token.color.primary[700] },
          },
        });
        expect(styles.css).toContain(':hover');
        expect(styles.css).toContain('background-color: var(--color-primary-700)');
      });
    });
  });

  describe('Given the same token used in two css() calls', () => {
    describe('When the runtime fingerprint path is exercised', () => {
      it('Then identical styles produce identical class names', () => {
        const a = css({ x: { color: token.color.primary[500] } });
        const b = css({ x: { color: token.color.primary[500] } });
        expect(a.x).toBe(b.x);
      });

      it('Then different tokens produce different class names', () => {
        const a = css({ x: { color: token.color.primary[500] } });
        const b = css({ x: { color: token.color.primary[700] } });
        expect(a.x).not.toBe(b.x);
      });
    });
  });
});
