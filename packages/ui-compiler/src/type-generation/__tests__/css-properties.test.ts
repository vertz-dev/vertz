import { describe, expect, it } from 'vitest';
import { generateCSSProperties } from '../css-properties';

describe('generateCSSProperties()', () => {
  it('generates a CSSProperties interface', () => {
    const source = generateCSSProperties({
      colors: {
        primary: { 500: '#3b82f6' },
        background: { DEFAULT: 'white' },
      },
    });
    expect(source).toContain('export interface CSSProperties');
  });

  it('includes color token var references as allowed values', () => {
    const source = generateCSSProperties({
      colors: {
        primary: { 500: '#3b82f6' },
        background: { DEFAULT: 'white' },
      },
    });
    expect(source).toContain("'var(--color-primary-500)'");
    expect(source).toContain("'var(--color-background)'");
  });

  it('includes spacing token var references', () => {
    const source = generateCSSProperties({
      colors: {},
      spacing: {
        sm: '0.5rem',
        md: '1rem',
      },
    });
    expect(source).toContain("'var(--spacing-sm)'");
    expect(source).toContain("'var(--spacing-md)'");
  });

  it('produces a ThemeTokenVar union type', () => {
    const source = generateCSSProperties({
      colors: {
        primary: { 500: '#3b82f6' },
      },
    });
    expect(source).toContain('type ThemeTokenVar');
  });

  it('skips _dark variant keys from CSS var references', () => {
    const source = generateCSSProperties({
      colors: {
        background: { DEFAULT: 'white', _dark: '#111827' },
      },
    });
    expect(source).not.toContain('_dark');
    expect(source).toContain("'var(--color-background)'");
  });
});
