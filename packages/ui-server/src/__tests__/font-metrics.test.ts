import { afterAll, describe, expect, it, spyOn } from '@vertz/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { font } from '@vertz/ui';
import { detectFallbackFont, extractFontMetrics } from '../font-metrics';

// Use real font files from the landing site as test fixtures
const FIXTURES_ROOT = join(import.meta.dir, '../../../../packages/landing');
const DM_SANS_PATH = '/public/fonts/dm-sans-latin.woff2';
const DM_SERIF_PATH = '/public/fonts/dm-serif-display-latin.woff2';
const JB_MONO_PATH = '/public/fonts/jetbrains-mono-latin.woff2';

// ─── detectFallbackFont ─────────────────────────────────────────

describe('detectFallbackFont()', () => {
  it('selects Arial for sans-serif', () => {
    expect(detectFallbackFont(['system-ui', 'sans-serif'])).toBe('Arial');
  });

  it('selects Arial for system-ui', () => {
    expect(detectFallbackFont(['system-ui'])).toBe('Arial');
  });

  it('selects Times New Roman for serif', () => {
    expect(detectFallbackFont(['Georgia', 'serif'])).toBe('Times New Roman');
  });

  it('selects Courier New for monospace', () => {
    expect(detectFallbackFont(['monospace'])).toBe('Courier New');
  });

  it('defaults to Arial when no generic keyword found', () => {
    expect(detectFallbackFont(['Georgia', 'Verdana'])).toBe('Arial');
  });

  it('defaults to Arial for empty fallback array', () => {
    expect(detectFallbackFont([])).toBe('Arial');
  });

  it('skips non-generic entries and finds generic keyword later', () => {
    expect(detectFallbackFont(['Helvetica', 'Georgia', 'serif'])).toBe('Times New Roman');
  });
});

// ─── extractFontMetrics ─────────────────────────────────────────

describe('extractFontMetrics()', () => {
  it('reads a .woff2 font file and returns computed FontFallbackMetrics', async () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: DM_SANS_PATH,
      fallback: ['system-ui', 'sans-serif'],
    });

    const result = await extractFontMetrics({ sans }, FIXTURES_ROOT);

    expect(result.sans).toBeDefined();
    expect(result.sans.fallbackFont).toBe('Arial');
    // Verify metrics are percentage strings
    expect(result.sans.ascentOverride).toMatch(/^\d+\.\d{2}%$/);
    expect(result.sans.descentOverride).toMatch(/^\d+\.\d{2}%$/);
    expect(result.sans.lineGapOverride).toMatch(/^\d+\.\d{2}%$/);
    expect(result.sans.sizeAdjust).toMatch(/^\d+\.\d{2}%$/);
  });

  it('computes sizeAdjust from xWidthAvg ratio', async () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: DM_SANS_PATH,
      fallback: ['system-ui', 'sans-serif'],
    });

    const result = await extractFontMetrics({ sans }, FIXTURES_ROOT);

    // DM Sans xWidthAvg=471, UPM=1000; Arial xWidthAvg=904, UPM=2048
    // sizeAdjust = (471/1000) / (904/2048) ≈ 1.067
    const sizeAdjust = parseFloat(result.sans.sizeAdjust);
    expect(sizeAdjust).toBeGreaterThan(90);
    expect(sizeAdjust).toBeLessThan(120);
  });

  it('auto-detects Arial for sans-serif fallback', async () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: DM_SANS_PATH,
      fallback: ['system-ui', 'sans-serif'],
    });

    const result = await extractFontMetrics({ sans }, FIXTURES_ROOT);
    expect(result.sans.fallbackFont).toBe('Arial');
  });

  it('auto-detects Times New Roman for serif fallback', async () => {
    const display = font('DM Serif Display', {
      weight: 400,
      src: DM_SERIF_PATH,
      fallback: ['Georgia', 'serif'],
    });

    const result = await extractFontMetrics({ display }, FIXTURES_ROOT);
    expect(result.display.fallbackFont).toBe('Times New Roman');
  });

  it('auto-detects Courier New for monospace fallback', async () => {
    const mono = font('JetBrains Mono', {
      weight: '100..800',
      src: JB_MONO_PATH,
      fallback: ['monospace'],
    });

    const result = await extractFontMetrics({ mono }, FIXTURES_ROOT);
    expect(result.mono.fallbackFont).toBe('Courier New');
  });

  it('uses explicit adjustFontFallback font name instead of auto-detecting', async () => {
    const display = font('DM Serif Display', {
      weight: 400,
      src: DM_SERIF_PATH,
      fallback: ['Georgia', 'serif'],
      adjustFontFallback: 'Arial', // override: use Arial instead of Times New Roman
    });

    const result = await extractFontMetrics({ display }, FIXTURES_ROOT);
    expect(result.display.fallbackFont).toBe('Arial');
  });

  it('skips fonts with adjustFontFallback: false', async () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: DM_SANS_PATH,
      fallback: ['system-ui', 'sans-serif'],
      adjustFontFallback: false,
    });

    const result = await extractFontMetrics({ sans }, FIXTURES_ROOT);
    expect(result.sans).toBeUndefined();
  });

  it('skips fonts with no src', async () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      fallback: ['system-ui', 'sans-serif'],
    });

    const result = await extractFontMetrics({ sans }, FIXTURES_ROOT);
    expect(result.sans).toBeUndefined();
  });

  it('uses first entry from array src for metric extraction', async () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: [
        { path: DM_SANS_PATH, weight: '100..1000', style: 'normal' },
        {
          path: '/public/fonts/dm-sans-italic-latin.woff2',
          weight: '100..1000',
          style: 'italic',
        },
      ],
      fallback: ['system-ui', 'sans-serif'],
    });

    const result = await extractFontMetrics({ sans }, FIXTURES_ROOT);
    expect(result.sans).toBeDefined();
    expect(result.sans.fallbackFont).toBe('Arial');
  });

  it('logs a warning and skips when font file does not exist', async () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    const sans = font('DM Sans', {
      weight: '100..1000',
      src: '/public/fonts/nonexistent.woff2',
      fallback: ['sans-serif'],
    });

    const result = await extractFontMetrics({ sans }, FIXTURES_ROOT);
    expect(result.sans).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[vertz]'), expect.any(String));

    warnSpy.mockRestore();
  });

  it('logs a warning and skips when font file is corrupted', async () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    // Create a temporary corrupt font file
    const tmpDir = join(import.meta.dir, '__tmp_corrupt__');
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'corrupt.woff2'), Buffer.from([0, 1, 2, 3, 4, 5]));
    afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

    const sans = font('DM Sans', {
      weight: '100..1000',
      src: '/corrupt.woff2',
      fallback: ['sans-serif'],
    });

    const result = await extractFontMetrics({ sans }, tmpDir);
    expect(result.sans).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[vertz]'), expect.any(String));

    warnSpy.mockRestore();
  });

  it('handles multiple fonts in one call', async () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: DM_SANS_PATH,
      fallback: ['system-ui', 'sans-serif'],
    });
    const display = font('DM Serif Display', {
      weight: 400,
      src: DM_SERIF_PATH,
      fallback: ['Georgia', 'serif'],
    });
    const mono = font('JetBrains Mono', {
      weight: '100..800',
      src: JB_MONO_PATH,
      fallback: ['monospace'],
    });

    const result = await extractFontMetrics({ sans, display, mono }, FIXTURES_ROOT);

    expect(result.sans).toBeDefined();
    expect(result.display).toBeDefined();
    expect(result.mono).toBeDefined();
    expect(result.sans.fallbackFont).toBe('Arial');
    expect(result.display.fallbackFont).toBe('Times New Roman');
    expect(result.mono.fallbackFont).toBe('Courier New');
  });
});
