import { beforeEach, describe, expect, it } from '@vertz/test';
import { css, resetInjectedStyles } from '../css';

describe('css() — object form (StyleBlock input)', () => {
  beforeEach(() => {
    resetInjectedStyles();
  });

  describe('Given a flat block with camelCase properties', () => {
    describe('When called with an object-form block', () => {
      it('Then returns a class name and renders kebab-case CSS', () => {
        const styles = css({
          panel: { backgroundColor: 'var(--color-background)', padding: 24 },
        });
        expect(typeof styles.panel).toBe('string');
        expect(styles.css).toContain(`.${styles.panel} {`);
        expect(styles.css).toContain('background-color: var(--color-background)');
        expect(styles.css).toContain('padding: 24px');
      });
    });
  });

  describe('Given numeric values', () => {
    describe('When the property is dimensional', () => {
      it('Then appends px to non-zero numeric values', () => {
        const styles = css({ a: { padding: 16, margin: 0 } });
        expect(styles.css).toContain('padding: 16px');
        expect(styles.css).toContain('margin: 0');
        expect(styles.css).not.toContain('margin: 0px');
      });
    });

    describe('When the property is unitless', () => {
      it('Then does NOT append px', () => {
        const styles = css({
          a: { opacity: 0.5, zIndex: 10, lineHeight: 1.4, fontWeight: 600 },
        });
        expect(styles.css).toContain('opacity: 0.5');
        expect(styles.css).toContain('z-index: 10');
        expect(styles.css).toContain('line-height: 1.4');
        expect(styles.css).toContain('font-weight: 600');
        expect(styles.css).not.toMatch(/opacity: 0\.5px/);
      });
    });
  });

  describe('Given CSS custom properties', () => {
    describe('When the key starts with --', () => {
      it('Then passes through without kebab conversion or px suffix', () => {
        const styles = css({ a: { '--my-var': 'red', color: 'var(--my-var)' } });
        expect(styles.css).toContain('--my-var: red');
        expect(styles.css).toContain('color: var(--my-var)');
      });
    });
  });

  describe('Given vendor-prefixed properties', () => {
    describe('When the key uses WebkitX/MozX/MsX naming', () => {
      it('Then emits the -prefix-kebab form', () => {
        const styles = css({
          a: { WebkitBackdropFilter: 'blur(8px)', MozAppearance: 'none' },
        });
        expect(styles.css).toContain('-webkit-backdrop-filter: blur(8px)');
        expect(styles.css).toContain('-moz-appearance: none');
      });
    });
  });

  describe('Given a nested & selector', () => {
    describe('When the block contains &:hover', () => {
      it('Then emits a base rule and a hover rule sharing the class', () => {
        const styles = css({
          btn: { color: 'white', '&:hover': { color: 'blue' } },
        });
        expect(styles.css).toContain(`.${styles.btn} {`);
        expect(styles.css).toContain('color: white');
        expect(styles.css).toContain(`.${styles.btn}:hover {`);
        expect(styles.css).toContain('color: blue');
      });
    });
  });

  describe('Given a nested @media selector', () => {
    describe('When the block contains @media (min-width: 768px)', () => {
      it('Then wraps the class selector inside the at-rule', () => {
        const styles = css({
          panel: {
            padding: 8,
            '@media (min-width: 768px)': { padding: 16 },
          },
        });
        expect(styles.css).toContain('@media (min-width: 768px)');
        expect(styles.css).toContain(`.${styles.panel} {`);
        // base
        expect(styles.css).toMatch(/padding: 8px/);
        // media-scoped
        expect(styles.css).toMatch(/@media.*\{[\s\S]*padding: 16px[\s\S]*\}/);
      });
    });
  });

  describe('Given deeply nested selectors', () => {
    describe('When & is nested inside & inside &', () => {
      it('Then resolves both class tokens in the final selector', () => {
        const styles = css({
          x: {
            color: 'red',
            '&:hover': {
              color: 'blue',
              '&[data-state="open"]': { color: 'green' },
            },
          },
        });
        expect(styles.css).toContain(`.${styles.x}:hover {`);
        expect(styles.css).toContain(`.${styles.x}:hover[data-state="open"] {`);
      });
    });
  });

  describe('Given two calls with reordered keys', () => {
    describe('When the same properties are listed in a different order', () => {
      it('Then produces the same class name (hash stable)', () => {
        const a = css({ x: { padding: 16, color: 'red' } });
        const b = css({ x: { color: 'red', padding: 16 } });
        expect(a.x).toBe(b.x);
      });
    });
  });

  describe('Given mixed array and object blocks in one call', () => {
    describe('When some blocks are arrays and others are objects', () => {
      it('Then both shapes work (transient back-compat)', () => {
        const styles = css({
          withArray: ['p:4'],
          withObject: { padding: 16 },
        });
        expect(styles.css).toContain('padding: 16px');
        expect(typeof styles.withArray).toBe('string');
        expect(typeof styles.withObject).toBe('string');
      });
    });
  });
});
