/**
 * Tests for CSS declaration objects in css() object-form selectors.
 *
 * CSS declaration objects allow inline CSS property-value pairs that can't be
 * expressed as shorthand strings (e.g. opacity modifiers, color-mix).
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { css, resetInjectedStyles } from '../css';

describe('css() raw declarations', () => {
  beforeEach(() => {
    resetInjectedStyles();
  });

  it('supports raw declaration objects in nested selectors', () => {
    const styles = css({
      btn: [
        'p:4',
        {
          '&:hover': [
            {
              'background-color': 'color-mix(in oklch, var(--color-primary) 90%, transparent)',
            },
          ],
        },
      ],
    });

    expect(typeof styles.btn).toBe('string');
    expect(styles.css).toContain(
      'background-color: color-mix(in oklch, var(--color-primary) 90%, transparent);',
    );
    expect(styles.css).toContain(':hover');
  });

  it('mixes raw declarations with shorthand strings in nested selectors', () => {
    const styles = css({
      card: [
        'p:4',
        {
          '[data-theme="dark"] &': [
            'text:foreground',
            {
              'background-color': 'color-mix(in oklch, var(--color-input) 30%, transparent)',
            },
          ],
        },
      ],
    });

    expect(styles.css).toContain('color: var(--color-foreground);');
    expect(styles.css).toContain(
      'background-color: color-mix(in oklch, var(--color-input) 30%, transparent);',
    );
  });

  it('supports multiple raw declarations in one selector', () => {
    const styles = css({
      ring: [
        'p:4',
        {
          '&:focus-visible': [
            {
              outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
              'outline-offset': '2px',
            },
          ],
        },
      ],
    });

    expect(styles.css).toContain(
      'outline: 3px solid color-mix(in oklch, var(--color-ring) 50%, transparent);',
    );
    expect(styles.css).toContain('outline-offset: 2px;');
  });
});
