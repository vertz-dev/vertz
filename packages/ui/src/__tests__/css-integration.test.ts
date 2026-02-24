import { describe, expect, it } from 'bun:test';
import { css, generateClassName, globalCss, parseShorthand, resolveToken } from '../css';

/**
 * Integration tests for the CSS framework.
 * These test the full pipeline: shorthand → token resolution → class generation → CSS output.
 */
describe('CSS Integration Tests', () => {
  // IT-2A-1: css() with array shorthands produces scoped class names and valid CSS
  it('IT-2A-1: css() with array shorthands produces scoped class names and valid CSS', () => {
    const result = css(
      {
        card: ['p:4', 'bg:background', 'rounded:lg', 'shadow:sm'],
        title: ['font:xl', 'weight:bold', 'text:foreground'],
      },
      'src/components/Card.tsx',
    );

    // Class names are scoped and deterministic
    expect(result.card).toMatch(/^_[0-9a-f]{8}$/);
    expect(result.title).toMatch(/^_[0-9a-f]{8}$/);
    expect(result.card).not.toBe(result.title);

    // CSS contains valid rules
    const cardClass = result.card as string;
    const titleClass = result.title as string;

    // Card rules
    expect(result.css).toContain(`.${cardClass} {`);
    expect(result.css).toContain('padding: 1rem;');
    expect(result.css).toContain('background-color: var(--color-background);');
    expect(result.css).toContain('border-radius: 0.5rem;');
    expect(result.css).toContain('box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);');

    // Title rules
    expect(result.css).toContain(`.${titleClass} {`);
    expect(result.css).toContain('font-size: 1.25rem;');
    expect(result.css).toContain('font-weight: 700;');
    expect(result.css).toContain('color: var(--color-foreground);');

    // Class names are deterministic across calls
    const result2 = css(
      {
        card: ['p:4', 'bg:background', 'rounded:lg', 'shadow:sm'],
        title: ['font:xl', 'weight:bold', 'text:foreground'],
      },
      'src/components/Card.tsx',
    );
    expect(result2.card).toBe(result.card);
    expect(result2.title).toBe(result.title);
  });

  // IT-2A-2: Pseudo-state prefixes generate correct :hover, :focus-visible selectors
  it('IT-2A-2: pseudo-state prefixes generate correct :hover, :focus-visible selectors', () => {
    const result = css(
      {
        button: [
          'p:4',
          'bg:primary',
          'text:foreground',
          'rounded:md',
          'hover:bg:primary.700',
          'focus-visible:bg:primary.800',
          'active:bg:primary.900',
          'disabled:bg:muted',
        ],
      },
      'src/components/Button.tsx',
    );

    const className = result.button as string;

    // Base rule
    expect(result.css).toContain(`.${className} {`);
    expect(result.css).toContain('padding: 1rem;');
    expect(result.css).toContain('background-color: var(--color-primary);');

    // Hover rule
    expect(result.css).toContain(`.${className}:hover {`);
    expect(result.css).toContain('var(--color-primary-700)');

    // Focus-visible rule
    expect(result.css).toContain(`.${className}:focus-visible {`);
    expect(result.css).toContain('var(--color-primary-800)');

    // Active rule
    expect(result.css).toContain(`.${className}:active {`);
    expect(result.css).toContain('var(--color-primary-900)');

    // Disabled rule
    expect(result.css).toContain(`.${className}:disabled {`);
    expect(result.css).toContain('var(--color-muted)');
  });

  // IT-2A-3: Invalid design token produces actionable compile error
  it('IT-2A-3: invalid design token produces actionable compile error', () => {
    // Invalid color token
    expect(() => {
      css({ card: ['bg:nonexistent'] }, 'test.tsx');
    }).toThrow(/Unknown color token/);

    // Invalid spacing value
    expect(() => {
      css({ card: ['p:13'] }, 'test.tsx');
    }).toThrow(/Invalid spacing value/);

    // Invalid property
    expect(() => {
      css({ card: ['zindex:10'] }, 'test.tsx');
    }).toThrow(/Unknown property shorthand/);

    // Invalid border radius
    expect(() => {
      css({ card: ['rounded:huge'] }, 'test.tsx');
    }).toThrow(/Invalid border-radius/);

    // Invalid color namespace
    expect(() => {
      css({ card: ['bg:potato.500'] }, 'test.tsx');
    }).toThrow(/Unknown color token/);
  });

  // IT-2A-4: Mixed array + object form compiles correctly
  it('IT-2A-4: mixed array + object form compiles correctly', () => {
    const result = css(
      {
        card: [
          'p:4',
          'bg:background',
          'rounded:lg',
          'hover:bg:primary.100',
          { '&::after': ['block', 'w:full', 'h:1', 'bg:border'] },
          { '&::before': ['hidden'] },
        ],
      },
      'src/components/FancyCard.tsx',
    );

    const className = result.card as string;

    // Base styles
    expect(result.css).toContain(`.${className} {`);
    expect(result.css).toContain('padding: 1rem;');
    expect(result.css).toContain('background-color: var(--color-background);');
    expect(result.css).toContain('border-radius: 0.5rem;');

    // Pseudo state
    expect(result.css).toContain(`.${className}:hover {`);

    // Complex selectors via object form
    expect(result.css).toContain(`.${className}::after {`);
    expect(result.css).toContain('display: block;');
    expect(result.css).toContain('width: 100%;');
    expect(result.css).toContain('height: 0.25rem;');
    expect(result.css).toContain('background-color: var(--color-border);');

    expect(result.css).toContain(`.${className}::before {`);
    expect(result.css).toContain('display: none;');
  });

  // IT-2A-5: CSS extraction produces separate CSS output (not inlined in JS)
  it('IT-2A-5: CSS extraction produces separate CSS output (not inlined in JS)', () => {
    const result = css(
      {
        card: ['p:4', 'bg:background'],
        title: ['font:xl'],
      },
      'src/components/Card.tsx',
    );

    // Block names are top-level string properties (css is non-enumerable)
    for (const [_name, className] of Object.entries(result)) {
      expect(typeof className).toBe('string');
      expect(className).toMatch(/^_[0-9a-f]{8}$/);
      // Class names don't contain CSS
      expect(className).not.toContain('{');
      expect(className).not.toContain(':');
    }

    // CSS is a separate string output
    expect(typeof result.css).toBe('string');
    expect(result.css.length).toBeGreaterThan(0);
    // CSS contains actual rules
    expect(result.css).toContain('{');
    expect(result.css).toContain('}');

    // The CSS output and the JS output (block names) are completely separate
    // — the block name properties are all you need in JS
    // — the CSS string goes to a separate .css file
    const allClassValues = Object.values(result).join(' ');
    expect(allClassValues).not.toContain('padding');
    expect(allClassValues).not.toContain('background');
    expect(allClassValues).not.toContain('{');
    expect(allClassValues).not.toContain('}');
  });

  // Additional: globalCss integration
  it('globalCss produces global rules without scoped class names', () => {
    const result = globalCss({
      '*, *::before, *::after': {
        boxSizing: 'border-box',
        margin: '0',
      },
      ':root': {
        '--color-primary': '#3b82f6',
        '--color-background': '#ffffff',
      },
    });

    expect(result.css).toContain('*, *::before, *::after {');
    expect(result.css).toContain('box-sizing: border-box;');
    expect(result.css).toContain(':root {');
    expect(result.css).toContain('--color-primary: #3b82f6;');
    // No underscore-hash class names
    expect(result.css).not.toMatch(/_[0-9a-f]{8}/);
  });

  // Additional: End-to-end pipeline
  it('full pipeline: parse → resolve → generate class → format CSS', () => {
    // Parse
    const parsed = parseShorthand('hover:bg:primary.700');
    expect(parsed.pseudo).toBe(':hover');
    expect(parsed.property).toBe('bg');
    expect(parsed.value).toBe('primary.700');

    // Resolve
    const resolved = resolveToken(parsed);
    expect(resolved.pseudo).toBe(':hover');
    expect(resolved.declarations[0]?.property).toBe('background-color');
    expect(resolved.declarations[0]?.value).toBe('var(--color-primary-700)');

    // Generate class name
    const className = generateClassName('src/Button.tsx', 'root');
    expect(className).toMatch(/^_[0-9a-f]{8}$/);

    // Full css() call validates the whole chain
    const result = css(
      {
        root: ['hover:bg:primary.700'],
      },
      'src/Button.tsx',
    );
    expect(result.css).toContain(`.${result.root}:hover {`);
    expect(result.css).toContain('background-color: var(--color-primary-700);');
  });
});
