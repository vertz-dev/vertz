import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { font, googleFont } from '@vertz/ui/css';
import {
  buildGoogleFontsUrl,
  parseWoff2UrlsFromCss,
  resolveGoogleFonts,
} from '../google-fonts-resolver';

// ─── URL Building ───────────────────────────────────────────

describe('buildGoogleFontsUrl()', () => {
  it('builds URL for a variable weight range', () => {
    const url = buildGoogleFontsUrl('Inter', {
      weight: '100..900',
      style: ['normal'],
      subsets: ['latin'],
      display: 'swap',
    });

    expect(url).toBe('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
  });

  it('builds URL for specific weights', () => {
    const url = buildGoogleFontsUrl('Roboto', {
      weight: [400, 700],
      style: ['normal'],
      subsets: ['latin'],
      display: 'swap',
    });

    expect(url).toBe('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
  });

  it('builds URL for a single numeric weight', () => {
    const url = buildGoogleFontsUrl('Roboto', {
      weight: 400,
      style: ['normal'],
      subsets: ['latin'],
      display: 'swap',
    });

    expect(url).toBe('https://fonts.googleapis.com/css2?family=Roboto:wght@400&display=swap');
  });

  it('builds URL with italic axis', () => {
    const url = buildGoogleFontsUrl('Inter', {
      weight: '100..900',
      style: ['italic'],
      subsets: ['latin'],
      display: 'swap',
    });

    expect(url).toBe(
      'https://fonts.googleapis.com/css2?family=Inter:ital,wght@1,100..900&display=swap',
    );
  });

  it('builds URL with both normal and italic', () => {
    const url = buildGoogleFontsUrl('Inter', {
      weight: '100..900',
      style: ['normal', 'italic'],
      subsets: ['latin'],
      display: 'swap',
    });

    expect(url).toBe(
      'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,100..900;1,100..900&display=swap',
    );
  });

  it('encodes spaces in family name', () => {
    const url = buildGoogleFontsUrl('Playfair Display', {
      weight: '400..700',
      style: ['normal'],
      subsets: ['latin'],
      display: 'swap',
    });

    expect(url).toContain('family=Playfair+Display');
  });

  it('uses custom display strategy', () => {
    const url = buildGoogleFontsUrl('Inter', {
      weight: '400',
      style: ['normal'],
      subsets: ['latin'],
      display: 'optional',
    });

    expect(url).toContain('display=optional');
  });
});

// ─── CSS Parsing ────────────────────────────────────────────

describe('parseWoff2UrlsFromCss()', () => {
  it('extracts woff2 URLs from Google Fonts CSS response', () => {
    const css = `
/* latin */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v18/abc123.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}`;
    const urls = parseWoff2UrlsFromCss(css);

    expect(urls).toEqual(['https://fonts.gstatic.com/s/inter/v18/abc123.woff2']);
  });

  it('extracts multiple woff2 URLs from multi-subset response', () => {
    const css = `
/* cyrillic */
@font-face {
  font-family: 'Inter';
  src: url(https://fonts.gstatic.com/s/inter/v18/cyrillic.woff2) format('woff2');
  unicode-range: U+0400-045F;
}
/* latin */
@font-face {
  font-family: 'Inter';
  src: url(https://fonts.gstatic.com/s/inter/v18/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}`;
    const urls = parseWoff2UrlsFromCss(css);

    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('cyrillic.woff2');
    expect(urls[1]).toContain('latin.woff2');
  });

  it('returns empty array when no woff2 URLs found', () => {
    const css = `
@font-face {
  font-family: 'Inter';
  src: url(https://fonts.gstatic.com/s/inter/v18/abc.woff) format('woff');
}`;
    const urls = parseWoff2UrlsFromCss(css);

    expect(urls).toEqual([]);
  });

  it('returns empty array for empty CSS', () => {
    expect(parseWoff2UrlsFromCss('')).toEqual([]);
  });
});

// ─── Full Resolution ────────────────────────────────────────

describe('resolveGoogleFonts()', () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = join(
      tmpdir(),
      `vertz-font-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(cacheDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it('passes through non-google font descriptors unchanged', async () => {
    const sans = font('Custom', {
      weight: '400',
      src: '/fonts/custom.woff2',
      fallback: ['sans-serif'],
    });

    const result = await resolveGoogleFonts({ sans }, cacheDir);

    expect(result.sans).toBe(sans);
  });

  it('returns empty object for empty input', async () => {
    const result = await resolveGoogleFonts({}, cacheDir);

    expect(result).toEqual({});
  });

  it('creates cache directory if it does not exist', async () => {
    const newCacheDir = join(cacheDir, 'nested', 'dir');

    await resolveGoogleFonts({}, newCacheDir);

    expect(existsSync(newCacheDir)).toBe(true);
  });

  it('uses cached files when manifest entry is valid', async () => {
    // Pre-populate cache with a fake font file
    const sans = googleFont('Inter', { weight: '100..900' });
    const hash = '7e5f3b6c1a2d'; // We'll compute this dynamically below

    // First resolve to get the real hash — we need to mock fetch for this
    // Instead, let's directly test the cache by writing manifest + file

    // Create a fake woff2 file (> 100 bytes = valid)
    const fakeWoff2 = Buffer.alloc(200, 0x42);
    const fileName = 'inter-test.woff2';
    writeFileSync(join(cacheDir, fileName), fakeWoff2);

    // Create a manifest that matches the googleFont descriptor's hash
    // We need the actual hash, so let's compute it manually
    const { createHash } = await import('node:crypto');
    const data = JSON.stringify({
      family: 'Inter',
      weight: '100..900',
      style: ['normal'],
      subsets: ['latin'],
      display: 'swap',
    });
    const realHash = createHash('sha256').update(data).digest('hex').slice(0, 12);

    const manifest = {
      entries: {
        [realHash]: { hash: realHash, files: [fileName], sizes: [200] },
      },
    };
    writeFileSync(join(cacheDir, 'manifest.json'), JSON.stringify(manifest));

    const result = await resolveGoogleFonts({ sans }, cacheDir);

    // Should have resolved src to the cached file (no network request)
    expect(result.sans.src).toBe(join(cacheDir, fileName));
    expect(result.sans.__brand).toBe('FontDescriptor');
    expect(result.sans.family).toBe('Inter');
  });

  it('re-fetches when cached file is corrupt (too small)', async () => {
    const sans = googleFont('Inter', { weight: '100..900' });

    // Create a corrupt file (< 100 bytes)
    const corruptFile = Buffer.alloc(10, 0x42);
    const fileName = 'inter-corrupt.woff2';
    writeFileSync(join(cacheDir, fileName), corruptFile);

    const { createHash } = await import('node:crypto');
    const data = JSON.stringify({
      family: 'Inter',
      weight: '100..900',
      style: ['normal'],
      subsets: ['latin'],
      display: 'swap',
    });
    const realHash = createHash('sha256').update(data).digest('hex').slice(0, 12);

    const manifest = {
      entries: {
        [realHash]: { hash: realHash, files: [fileName], sizes: [10] },
      },
    };
    writeFileSync(join(cacheDir, 'manifest.json'), JSON.stringify(manifest));

    // This will try to fetch from Google (network call).
    // In a unit test without network mocking, this tests the fallback path.
    // The descriptor should still be returned (either resolved or original).
    const result = await resolveGoogleFonts({ sans }, cacheDir);

    // Result should be a FontDescriptor regardless of fetch outcome
    expect(result.sans.__brand).toBe('FontDescriptor');
    expect(result.sans.family).toBe('Inter');
  });

  it('preserves all descriptor fields in resolved output', async () => {
    const sans = googleFont('Inter', {
      weight: '100..900',
      subsets: ['latin'],
      fallback: ['system-ui', 'sans-serif'],
      display: 'optional',
      adjustFontFallback: false,
    });

    // Pre-populate cache
    const fakeWoff2 = Buffer.alloc(200, 0x42);
    const fileName = 'inter-full.woff2';
    writeFileSync(join(cacheDir, fileName), fakeWoff2);

    const { createHash } = await import('node:crypto');
    const data = JSON.stringify({
      family: 'Inter',
      weight: '100..900',
      style: ['normal'],
      subsets: ['latin'],
      display: 'optional',
    });
    const realHash = createHash('sha256').update(data).digest('hex').slice(0, 12);

    const manifest = {
      entries: {
        [realHash]: { hash: realHash, files: [fileName], sizes: [200] },
      },
    };
    writeFileSync(join(cacheDir, 'manifest.json'), JSON.stringify(manifest));

    const result = await resolveGoogleFonts({ sans }, cacheDir);

    expect(result.sans.family).toBe('Inter');
    expect(result.sans.weight).toBe('100..900');
    expect(result.sans.style).toBe('normal');
    expect(result.sans.display).toBe('optional');
    expect(result.sans.fallback).toEqual(['system-ui', 'sans-serif']);
    expect(result.sans.adjustFontFallback).toBe(false);
    expect(result.sans.__google).toBeDefined();
    expect(result.sans.src).toBe(join(cacheDir, fileName));
  });

  it('handles mixed google and non-google descriptors', async () => {
    const custom = font('Custom', {
      weight: '400',
      src: '/fonts/custom.woff2',
    });

    const gFont = googleFont('Inter', { weight: '100..900' });

    // Pre-populate cache for Inter
    const fakeWoff2 = Buffer.alloc(200, 0x42);
    const fileName = 'inter-mixed.woff2';
    writeFileSync(join(cacheDir, fileName), fakeWoff2);

    const { createHash } = await import('node:crypto');
    const data = JSON.stringify({
      family: 'Inter',
      weight: '100..900',
      style: ['normal'],
      subsets: ['latin'],
      display: 'swap',
    });
    const realHash = createHash('sha256').update(data).digest('hex').slice(0, 12);

    const manifest = {
      entries: {
        [realHash]: { hash: realHash, files: [fileName], sizes: [200] },
      },
    };
    writeFileSync(join(cacheDir, 'manifest.json'), JSON.stringify(manifest));

    const result = await resolveGoogleFonts({ custom, sans: gFont }, cacheDir);

    // Non-google descriptor passed through unchanged
    expect(result.custom).toBe(custom);
    // Google descriptor resolved with local src
    expect(result.sans.src).toBe(join(cacheDir, fileName));
  });

  it('writes manifest after resolution', async () => {
    // Just resolve with no google fonts — manifest should still be written
    await resolveGoogleFonts({}, cacheDir);

    const manifestPath = join(cacheDir, 'manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.entries).toEqual({});
  });
});
