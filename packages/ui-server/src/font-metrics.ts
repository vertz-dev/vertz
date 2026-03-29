/**
 * Font metrics extraction for zero-CLS font loading.
 *
 * Reads .woff2 font files and computes CSS fallback metric overrides
 * (ascent-override, descent-override, line-gap-override, size-adjust)
 * so the browser's fallback font occupies the same space as the real font.
 *
 * Uses @capsizecss/unpack for font file parsing (pure JS, works in Bun + Node).
 */

import { access as fsAccess } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fromBuffer } from '@capsizecss/unpack';
import type { FallbackFontName, FontDescriptor, FontFallbackMetrics } from '@vertz/ui';

// ─── System font metrics (hardcoded, stable across OS versions) ──

interface SystemFontMetrics {
  ascent: number;
  descent: number;
  lineGap: number;
  unitsPerEm: number;
  xWidthAvg: number;
}

const SYSTEM_FONT_METRICS: Record<FallbackFontName, SystemFontMetrics> = {
  Arial: {
    ascent: 1854,
    descent: -434,
    lineGap: 67,
    unitsPerEm: 2048,
    xWidthAvg: 904,
  },
  'Times New Roman': {
    ascent: 1825,
    descent: -443,
    lineGap: 87,
    unitsPerEm: 2048,
    xWidthAvg: 819,
  },
  'Courier New': {
    ascent: 1705,
    descent: -615,
    lineGap: 0,
    unitsPerEm: 2048,
    xWidthAvg: 1229,
  },
};

// ─── Fallback font auto-detection ────────────────────────────────

/**
 * Auto-detect which system font to use as fallback base.
 *
 * Scans the `fallback` array for generic CSS font family keywords:
 * - 'sans-serif' or 'system-ui' → Arial
 * - 'serif' → Times New Roman
 * - 'monospace' → Courier New
 *
 * Skips non-generic entries (e.g., 'Georgia', 'Helvetica').
 * If no generic keyword found, defaults to Arial.
 */
export function detectFallbackFont(fallback: readonly string[]): FallbackFontName {
  for (const f of fallback) {
    const lower = f.toLowerCase();
    if (lower === 'sans-serif' || lower === 'system-ui') return 'Arial';
    if (lower === 'serif') return 'Times New Roman';
    if (lower === 'monospace') return 'Courier New';
  }
  return 'Arial';
}

// ─── Metric calculation ──────────────────────────────────────────

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function computeFallbackMetrics(
  fontMetrics: {
    ascent: number;
    descent: number;
    lineGap: number;
    unitsPerEm: number;
    xWidthAvg: number;
  },
  fallbackFont: FallbackFontName,
): FontFallbackMetrics {
  const systemMetrics = SYSTEM_FONT_METRICS[fallbackFont];

  // size-adjust = fontAvgWidth / fallbackAvgWidth (normalized by UPM)
  const fontNormalizedWidth = fontMetrics.xWidthAvg / fontMetrics.unitsPerEm;
  const systemNormalizedWidth = systemMetrics.xWidthAvg / systemMetrics.unitsPerEm;
  const sizeAdjust = fontNormalizedWidth / systemNormalizedWidth;

  // Override values = metric / (UPM × sizeAdjust) × 100%
  const ascentOverride = fontMetrics.ascent / (fontMetrics.unitsPerEm * sizeAdjust);
  const descentOverride = Math.abs(fontMetrics.descent) / (fontMetrics.unitsPerEm * sizeAdjust);
  const lineGapOverride = fontMetrics.lineGap / (fontMetrics.unitsPerEm * sizeAdjust);

  return {
    ascentOverride: formatPercent(ascentOverride),
    descentOverride: formatPercent(descentOverride),
    lineGapOverride: formatPercent(lineGapOverride),
    sizeAdjust: formatPercent(sizeAdjust),
    fallbackFont,
  };
}

// ─── Font src path resolution ────────────────────────────────────

/** Get the primary font file path from a descriptor's src. */
function getPrimarySrcPath(descriptor: FontDescriptor): string | null {
  const { src } = descriptor;
  if (!src) return null;
  if (typeof src === 'string') return src;
  const first = src[0];
  if (first) return first.path;
  return null;
}

/**
 * Resolve a font URL path to a filesystem path.
 *
 * Font descriptors use URL paths (e.g. `/fonts/dm-sans.woff2`) that the dev
 * server serves from `public/`. Try the direct path first, then fall back to
 * `public/` subdirectory — which is the standard static-asset convention.
 */
async function resolveFilePath(urlPath: string, rootDir: string): Promise<string> {
  // Absolute paths (e.g., from Google Fonts resolver cache) — use directly
  if (isAbsolute(urlPath)) {
    try {
      await fsAccess(urlPath);
      return urlPath;
    } catch {
      // Fall through to root-relative resolution
    }
  }
  const cleaned = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
  const direct = join(rootDir, cleaned);
  try {
    await fsAccess(direct);
    return direct;
  } catch {
    // Font URL paths are served from public/ by the dev server
    return join(rootDir, 'public', cleaned);
  }
}

// ─── Main extraction function ────────────────────────────────────

/**
 * Extract font metrics from .woff2 files and compute CSS fallback overrides.
 *
 * @param fonts - Font descriptors from theme definition.
 * @param rootDir - Project root directory for resolving font file paths.
 * @returns Map of font key → computed fallback metrics.
 */
export async function extractFontMetrics(
  fonts: Record<string, FontDescriptor>,
  rootDir: string,
): Promise<Record<string, FontFallbackMetrics>> {
  const result: Record<string, FontFallbackMetrics> = {};

  for (const [key, descriptor] of Object.entries(fonts)) {
    // Skip if font fallback adjustment is disabled
    const adjustFontFallback = descriptor.adjustFontFallback ?? true;
    if (adjustFontFallback === false) continue;

    // Get the primary font file path
    const srcPath = getPrimarySrcPath(descriptor);
    if (!srcPath) continue;

    // Enforce woff2-only policy
    if (!srcPath.toLowerCase().endsWith('.woff2')) continue;

    try {
      const filePath = await resolveFilePath(srcPath, rootDir);
      const buffer = await readFile(filePath);
      const metrics = await fromBuffer(buffer);

      // Determine fallback font
      const fallbackFont: FallbackFontName =
        typeof adjustFontFallback === 'string'
          ? adjustFontFallback
          : detectFallbackFont(descriptor.fallback);

      result[key] = computeFallbackMetrics(
        {
          ascent: metrics.ascent,
          descent: metrics.descent,
          lineGap: metrics.lineGap,
          unitsPerEm: metrics.unitsPerEm,
          xWidthAvg: metrics.xWidthAvg,
        },
        fallbackFont,
      );
    } catch (error) {
      console.warn(
        `[vertz] Failed to extract font metrics for "${key}" from "${srcPath}":`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return result;
}
