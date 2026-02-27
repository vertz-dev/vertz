/**
 * Tests for raw CSS declarations in css() object-form selectors.
 *
 * Raw declarations allow inline CSS property-value pairs that can't be
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
              property: 'background-color',
              value: 'color-mix(in oklch, var(--color-primary) 90%, transparent)',
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
              property: 'background-color',
              value: 'color-mix(in oklch, var(--color-input) 30%, transparent)',
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
              property: 'outline',
              value: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
            },
            { property: 'outline-offset', value: '2px' },
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
