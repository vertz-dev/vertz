import { describe, expect, it } from 'bun:test';
import type { FontDescriptor } from '../font';
import { compileFonts, font } from '../font';

describe('font()', () => {
  it('returns a FontDescriptor with family and defaults', () => {
    const result = font('DM Sans', {
      weight: '100..1000',
      src: '/fonts/dm-sans.woff2',
    });

    expect(result.__brand).toBe('FontDescriptor');
    expect(result.family).toBe('DM Sans');
    expect(result.weight).toBe('100..1000');
    expect(result.style).toBe('normal');
    expect(result.display).toBe('swap');
    expect(result.src).toBe('/fonts/dm-sans.woff2');
    expect(result.fallback).toEqual([]);
    expect(result.subsets).toEqual(['latin']);
  });

  it('accepts all custom options', () => {
    const result = font('JetBrains Mono', {
      weight: 400,
      style: 'italic',
      display: 'swap',
      src: '/fonts/jb-mono.woff2',
      fallback: ['monospace'],
      subsets: ['latin', 'cyrillic'],
      unicodeRange: 'U+0000-00FF',
    });

    expect(result.family).toBe('JetBrains Mono');
    expect(result.weight).toBe('400');
    expect(result.style).toBe('italic');
    expect(result.display).toBe('swap');
    expect(result.fallback).toEqual(['monospace']);
    expect(result.subsets).toEqual(['latin', 'cyrillic']);
    expect(result.unicodeRange).toBe('U+0000-00FF');
  });

  it('accepts array src for multiple font files', () => {
    const result = font('DM Sans', {
      weight: '100..1000',
      src: [
        { path: '/fonts/dm-sans.woff2', weight: '100..1000', style: 'normal' },
        { path: '/fonts/dm-sans-italic.woff2', weight: '100..1000', style: 'italic' },
      ],
    });

    expect(Array.isArray(result.src)).toBe(true);
    expect((result.src as Array<{ path: string }>).length).toBe(2);
  });
});

describe('compileFonts()', () => {
  it('generates @font-face CSS for a single string src', () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: '/fonts/dm-sans.woff2',
    });
    const result = compileFonts({ sans });

    expect(result.fontFaceCss).toContain("font-family: 'DM Sans'");
    expect(result.fontFaceCss).toContain('font-weight: 100 1000');
    expect(result.fontFaceCss).toContain('font-style: normal');
    expect(result.fontFaceCss).toContain('font-display: swap');
    expect(result.fontFaceCss).toContain("url(/fonts/dm-sans.woff2) format('woff2')");
  });

  it('generates --font-<key> CSS custom property with fallbacks', () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: '/fonts/dm-sans.woff2',
      fallback: ['system-ui', 'sans-serif'],
    });
    const result = compileFonts({ sans });

    expect(result.cssVarsCss).toContain(':root {');
    expect(result.cssVarsCss).toContain("--font-sans: 'DM Sans', system-ui, sans-serif;");
  });

  it('generates preload link tags for font files', () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: '/fonts/dm-sans.woff2',
    });
    const result = compileFonts({ sans });

    expect(result.preloadTags).toContain(
      '<link rel="preload" href="/fonts/dm-sans.woff2" as="font" type="font/woff2" crossorigin>',
    );
  });

  it('generates multiple @font-face blocks for array src', () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: [
        { path: '/fonts/dm-sans.woff2', weight: '100..1000', style: 'normal' },
        { path: '/fonts/dm-sans-italic.woff2', weight: '100..1000', style: 'italic' },
      ],
    });
    const result = compileFonts({ sans });

    // Two separate @font-face blocks
    const faceCount = (result.fontFaceCss.match(/@font-face/g) ?? []).length;
    expect(faceCount).toBe(2);
    expect(result.fontFaceCss).toContain('font-style: normal');
    expect(result.fontFaceCss).toContain('font-style: italic');
    expect(result.fontFaceCss).toContain('dm-sans.woff2');
    expect(result.fontFaceCss).toContain('dm-sans-italic.woff2');
  });

  it('uses descriptor weight/style when array src entry omits them', () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      style: 'normal',
      src: [{ path: '/fonts/dm-sans.woff2' }, { path: '/fonts/dm-sans-2.woff2' }],
    });
    const result = compileFonts({ sans });

    const faceCount = (result.fontFaceCss.match(/@font-face/g) ?? []).length;
    expect(faceCount).toBe(2);
    // Both should use the descriptor's weight and style
    const weightMatches = result.fontFaceCss.match(/font-weight: 100 1000/g);
    expect(weightMatches?.length).toBe(2);
    const styleMatches = result.fontFaceCss.match(/font-style: normal/g);
    expect(styleMatches?.length).toBe(2);
  });

  it('preloads only the first file from array src', () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: [{ path: '/fonts/dm-sans.woff2' }, { path: '/fonts/dm-sans-italic.woff2' }],
    });
    const result = compileFonts({ sans });

    expect(result.preloadTags).toContain('dm-sans.woff2');
    expect(result.preloadTags).not.toContain('dm-sans-italic.woff2');
  });

  it('handles multiple font entries', () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: '/fonts/dm-sans.woff2',
      fallback: ['system-ui', 'sans-serif'],
    });
    const mono = font('JetBrains Mono', {
      weight: '100..800',
      src: '/fonts/jb-mono.woff2',
      fallback: ['monospace'],
    });
    const result = compileFonts({ sans, mono });

    // Both @font-face blocks
    expect(result.fontFaceCss).toContain("font-family: 'DM Sans'");
    expect(result.fontFaceCss).toContain("font-family: 'JetBrains Mono'");

    // Both CSS vars
    expect(result.cssVarsCss).toContain("--font-sans: 'DM Sans', system-ui, sans-serif;");
    expect(result.cssVarsCss).toContain("--font-mono: 'JetBrains Mono', monospace;");

    // Both preload tags
    expect(result.preloadTags).toContain('dm-sans.woff2');
    expect(result.preloadTags).toContain('jb-mono.woff2');
  });

  it('includes unicode-range when specified', () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: '/fonts/dm-sans.woff2',
      unicodeRange: 'U+0000-00FF',
    });
    const result = compileFonts({ sans });

    expect(result.fontFaceCss).toContain('unicode-range: U+0000-00FF;');
  });

  it('returns empty strings when no fonts have src', () => {
    const sans = font('DM Sans', { weight: '100..1000' });
    const result = compileFonts({ sans });

    expect(result.fontFaceCss).toBe('');
    expect(result.preloadTags).toBe('');
    // CSS var should still be generated
    expect(result.cssVarsCss).toContain("--font-sans: 'DM Sans';");
  });

  it('returns empty strings for empty font record', () => {
    const result = compileFonts({});

    expect(result.fontFaceCss).toBe('');
    expect(result.cssVarsCss).toBe('');
    expect(result.cssVarLines).toEqual([]);
    expect(result.preloadTags).toBe('');
  });

  it('exposes cssVarLines for merging into external :root blocks', () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: '/fonts/dm-sans.woff2',
      fallback: ['system-ui', 'sans-serif'],
    });
    const result = compileFonts({ sans });

    expect(result.cssVarLines).toEqual(["  --font-sans: 'DM Sans', system-ui, sans-serif;"]);
  });

  // ─── Sanitization ─────────────────────────────────────────────

  it('sanitizes font family names to prevent CSS injection', () => {
    const evil = font('Evil; } body { background: url(evil)', {
      weight: 400,
      src: '/fonts/evil.woff2',
    });
    const result = compileFonts({ test: evil });

    // Family name should be sanitized: no ; or } or url(
    const familyMatch = result.fontFaceCss.match(/font-family:\s*'([^']+)'/);
    expect(familyMatch).not.toBeNull();
    expect(familyMatch?.[1]).not.toContain(';');
    expect(familyMatch?.[1]).not.toContain('}');
    expect(familyMatch?.[1]).not.toContain('url(');
  });

  it('sanitizes src paths in @font-face to prevent CSS injection', () => {
    const evil = font('Test', {
      weight: 400,
      src: '/fonts/evil;}.x{color:red}.woff2',
    });
    const result = compileFonts({ test: evil });

    // Structural CSS chars should be stripped from the src value
    const srcMatch = result.fontFaceCss.match(/src:\s*url\(([^)]+)\)/);
    expect(srcMatch).not.toBeNull();
    expect(srcMatch?.[1]).not.toContain(';');
    expect(srcMatch?.[1]).not.toContain('}');
    expect(srcMatch?.[1]).not.toContain('{');
  });

  it('escapes preload href to prevent HTML attribute injection', () => {
    const evil = font('Test', {
      weight: 400,
      src: '/fonts/evil" onload="alert(1).woff2',
    });
    const result = compileFonts({ test: evil });

    // The raw double-quote must not break out of the href attribute
    expect(result.preloadTags).not.toContain('onload="alert(1)"');
    // The escaped version should be present
    expect(result.preloadTags).toContain('&quot;');
  });

  it('sanitizes font-style values in @font-face', () => {
    // Construct a descriptor that bypasses font() type constraints
    const desc: FontDescriptor = {
      __brand: 'FontDescriptor',
      family: 'Test',
      weight: '400',
      style: 'normal; } * { display: none' as 'normal',
      display: 'swap',
      src: '/fonts/test.woff2',
      fallback: [],
      subsets: ['latin'],
    };
    const result = compileFonts({ test: desc });

    // Structural chars (;{}) should be stripped — no CSS rule breakout
    const styleMatch = result.fontFaceCss.match(/font-style:\s*([^;]+);/);
    expect(styleMatch).not.toBeNull();
    expect(styleMatch?.[1]).not.toContain(';');
    expect(styleMatch?.[1]).not.toContain('}');
    expect(styleMatch?.[1]).not.toContain('{');
  });

  it('sanitizes font-display values in @font-face', () => {
    const desc: FontDescriptor = {
      __brand: 'FontDescriptor',
      family: 'Test',
      weight: '400',
      style: 'normal',
      display: 'swap; } * { color: red' as 'swap',
      src: '/fonts/test.woff2',
      fallback: [],
      subsets: ['latin'],
    };
    const result = compileFonts({ test: desc });

    // Structural chars stripped — no CSS rule breakout
    const displayMatch = result.fontFaceCss.match(/font-display:\s*([^;]+);/);
    expect(displayMatch).not.toBeNull();
    expect(displayMatch?.[1]).not.toContain(';');
    expect(displayMatch?.[1]).not.toContain('}');
    expect(displayMatch?.[1]).not.toContain('{');
  });

  it('sanitizes unicode-range values to prevent CSS injection', () => {
    const evil = font('Test', {
      weight: 400,
      src: '/fonts/test.woff2',
      unicodeRange: 'U+0000-00FF; } * { display: none',
    });
    const result = compileFonts({ test: evil });

    // Structural chars stripped — no CSS rule breakout
    const rangeMatch = result.fontFaceCss.match(/unicode-range:\s*([^;]+);/);
    expect(rangeMatch).not.toBeNull();
    expect(rangeMatch?.[1]).not.toContain(';');
    expect(rangeMatch?.[1]).not.toContain('}');
    expect(rangeMatch?.[1]).not.toContain('{');
  });

  it('strips </style> from family names to prevent style tag breakout', () => {
    const evil = font('Evil</style><script>alert(1)</script>', {
      weight: 400,
      src: '/fonts/evil.woff2',
    });
    const result = compileFonts({ test: evil });

    expect(result.fontFaceCss).not.toContain('</style>');
    expect(result.fontFaceCss).not.toContain('<script>');
    expect(result.cssVarsCss).not.toContain('</style>');
  });

  // ─── Key validation ─────────────────────────────────────────

  it('throws for font keys with invalid CSS identifier characters', () => {
    const f = font('Test', { weight: 400, src: '/fonts/test.woff2' });
    expect(() => compileFonts({ 'bad key!': f })).toThrow('invalid CSS identifier');
  });

  it('accepts hyphenated font keys', () => {
    const f = font('Test', { weight: 400, src: '/fonts/test.woff2' });
    expect(() => compileFonts({ 'sans-serif': f })).not.toThrow();
  });

  // ─── woff2 validation ─────────────────────────────────────────

  it('throws for non-woff2 string src paths', () => {
    const f = font('Test', { weight: 400, src: '/fonts/test.woff' });
    expect(() => compileFonts({ test: f })).toThrow('not a .woff2 file');
  });

  it('throws for non-woff2 array src paths', () => {
    const f = font('Test', {
      weight: 400,
      src: [{ path: '/fonts/test.ttf' }],
    });
    expect(() => compileFonts({ test: f })).toThrow('not a .woff2 file');
  });

  it('accepts .WOFF2 (case-insensitive)', () => {
    const f = font('Test', { weight: 400, src: '/fonts/test.WOFF2' });
    expect(() => compileFonts({ test: f })).not.toThrow();
  });
});
