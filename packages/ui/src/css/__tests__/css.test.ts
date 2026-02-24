import { afterEach, describe, expect, it } from 'vitest';
import { css, resetInjectedStyles } from '../css';

describe('css() runtime style injection', () => {
  afterEach(() => {
    // Clean up injected <style> elements and reset tracking
    for (const el of document.head.querySelectorAll('style[data-vertz-css]')) {
      el.remove();
    }
    resetInjectedStyles();
  });

  it('injects generated CSS into document.head as a <style> tag', () => {
    css({ card: ['p:4', 'bg:background'] }, 'inject-test.tsx');

    const styles = document.head.querySelectorAll('style[data-vertz-css]');
    expect(styles.length).toBe(1);
    expect(styles[0]?.textContent).toContain('padding: 1rem');
    expect(styles[0]?.textContent).toContain('background-color: var(--color-background)');
  });

  it('does not inject the same CSS twice (deduplication)', () => {
    css({ card: ['p:4'] }, 'dedup-test.tsx');
    css({ card: ['p:4'] }, 'dedup-test.tsx');

    const styles = document.head.querySelectorAll('style[data-vertz-css]');
    expect(styles.length).toBe(1);
  });

  it('injects separate <style> tags for different css() calls', () => {
    css({ a: ['p:4'] }, 'file-a.tsx');
    css({ b: ['m:4'] }, 'file-b.tsx');

    const styles = document.head.querySelectorAll('style[data-vertz-css]');
    expect(styles.length).toBe(2);
  });

  it('does not inject when css produces empty output', () => {
    css({}, 'empty-test.tsx');

    const styles = document.head.querySelectorAll('style[data-vertz-css]');
    expect(styles.length).toBe(0);
  });
});

describe('css()', () => {
  it('returns class names for each block', () => {
    const result = css(
      {
        card: ['p:4'],
        title: ['font:xl'],
      },
      'test.tsx',
    );

    expect(result.card).toBeDefined();
    expect(result.title).toBeDefined();
    expect(result.card).not.toBe(result.title);
  });

  it('produces valid CSS with class selectors', () => {
    const result = css(
      {
        card: ['p:4', 'bg:background'],
      },
      'test.tsx',
    );

    expect(result.css).toContain(`.${result.card}`);
    expect(result.css).toContain('padding: 1rem');
    expect(result.css).toContain('background-color: var(--color-background)');
  });

  it('produces deterministic class names', () => {
    const a = css({ card: ['p:4'] }, 'test.tsx');
    const b = css({ card: ['p:4'] }, 'test.tsx');
    expect(a.card).toBe(b.card);
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

    const className = result.button as string;
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

    const className = result.input as string;
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

    const className = result.card as string;
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

    const className = result.card as string;
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
    expect(result.root).toBeDefined();
    expect(result.css).toContain('padding: 1rem');
  });

  it('handles content:empty in object form (documented API)', () => {
    const result = css(
      {
        card: ['p:4', { '&::after': ['content:empty', 'block'] }],
      },
      'test.tsx',
    );

    const className = result.card as string;
    expect(result.css).toContain(`.${className}::after`);
    expect(result.css).toContain("content: ''");
    expect(result.css).toContain('display: block');
  });

  it('handles ring:2 with focus-visible pseudo', () => {
    const result = css(
      {
        button: ['bg:primary', 'focus-visible:ring:2'],
      },
      'test.tsx',
    );

    const className = result.button as string;
    expect(result.css).toContain(`.${className}:focus-visible`);
    expect(result.css).toContain('outline: 2px solid var(--color-ring)');
  });

  it('handles h:screen as 100vh (axis-aware)', () => {
    const result = css(
      {
        layout: ['w:screen', 'h:screen'],
      },
      'test.tsx',
    );

    expect(result.css).toContain('width: 100vw');
    expect(result.css).toContain('height: 100vh');
  });

  it('css property is non-enumerable (Object.keys excludes it)', () => {
    const result = css({ card: ['p:4'] }, 'test.tsx');
    expect(Object.keys(result)).toEqual(['card']);
    expect(result.css).toContain('padding: 1rem');
  });

  it('spreading drops the non-enumerable css property', () => {
    const result = css({ card: ['p:4'] }, 'test.tsx');
    const spread = { ...result };
    expect(spread).toHaveProperty('card');
    expect(spread).not.toHaveProperty('css');
  });

  it('throws when block name is "css" (reserved)', () => {
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (css as any)({ css: ['p:4'] }, 'test.tsx');
    }).toThrow("css(): block name 'css' is reserved");
  });
});
