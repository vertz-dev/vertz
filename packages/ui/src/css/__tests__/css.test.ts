import { describe, expect, it } from 'vitest';
import { css } from '../css';

describe('css()', () => {
  it('returns class names for each block', () => {
    const result = css(
      {
        card: ['p:4'],
        title: ['font:xl'],
      },
      'test.tsx',
    );

    expect(result.classNames.card).toBeDefined();
    expect(result.classNames.title).toBeDefined();
    expect(result.classNames.card).not.toBe(result.classNames.title);
  });

  it('produces valid CSS with class selectors', () => {
    const result = css(
      {
        card: ['p:4', 'bg:background'],
      },
      'test.tsx',
    );

    expect(result.css).toContain(`.${result.classNames.card}`);
    expect(result.css).toContain('padding: 1rem');
    expect(result.css).toContain('background-color: var(--color-background)');
  });

  it('produces deterministic class names', () => {
    const a = css({ card: ['p:4'] }, 'test.tsx');
    const b = css({ card: ['p:4'] }, 'test.tsx');
    expect(a.classNames.card).toBe(b.classNames.card);
  });

  it('handles display keywords', () => {
    const result = css(
      {
        layout: ['flex', 'gap:4'],
      },
      'test.tsx',
    );

    expect(result.css).toContain('display: flex');
    expect(result.css).toContain('gap: 1rem');
  });

  it('handles pseudo-state prefixes', () => {
    const result = css(
      {
        button: ['bg:primary', 'hover:bg:primary.700'],
      },
      'test.tsx',
    );

    const className = result.classNames.button as string;
    expect(result.css).toContain(`.${className}:hover`);
    expect(result.css).toContain('var(--color-primary-700)');
  });

  it('handles multiple pseudo-states', () => {
    const result = css(
      {
        input: ['bg:background', 'hover:bg:primary.100', 'focus:bg:primary.200'],
      },
      'test.tsx',
    );

    const className = result.classNames.input as string;
    expect(result.css).toContain(`.${className}:hover`);
    expect(result.css).toContain(`.${className}:focus`);
  });

  it('handles object form for complex selectors', () => {
    const result = css(
      {
        card: ['p:4', { '&::after': ['block'] }],
      },
      'test.tsx',
    );

    const className = result.classNames.card as string;
    expect(result.css).toContain(`.${className}::after`);
    expect(result.css).toContain('display: block');
  });

  it('handles mixed array and object entries', () => {
    const result = css(
      {
        card: ['p:4', 'bg:background', 'hover:bg:primary.100', { '&::before': ['block'] }],
      },
      'test.tsx',
    );

    const className = result.classNames.card as string;
    expect(result.css).toContain('padding: 1rem');
    expect(result.css).toContain('var(--color-background)');
    expect(result.css).toContain(`.${className}:hover`);
    expect(result.css).toContain(`.${className}::before`);
  });

  it('handles multiple blocks', () => {
    const result = css(
      {
        card: ['p:4', 'rounded:lg'],
        title: ['font:xl', 'weight:bold'],
        body: ['text:foreground', 'leading:normal'],
      },
      'test.tsx',
    );

    expect(result.css).toContain('padding: 1rem');
    expect(result.css).toContain('border-radius: 0.5rem');
    expect(result.css).toContain('font-size: 1.25rem');
    expect(result.css).toContain('font-weight: 700');
    expect(result.css).toContain('color: var(--color-foreground)');
    expect(result.css).toContain('line-height: 1.5');
  });

  it('uses default file path when none provided', () => {
    const result = css({ root: ['p:4'] });
    expect(result.classNames.root).toBeDefined();
    expect(result.css).toContain('padding: 1rem');
  });
});
