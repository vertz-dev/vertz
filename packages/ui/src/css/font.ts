/**
 * Font descriptor API.
 *
 * font() creates a FontDescriptor that describes a font family and its sources.
 * compileFonts() generates @font-face CSS, CSS custom properties, and preload tags.
 *
 * NOTE: Only woff2 format is supported. Passing non-woff2 src paths will throw.
 */

import { escapeHtmlAttr, sanitizeCssValue } from './sanitize';

// ─── Types ──────────────────────────────────────────────────────

export interface FontSrc {
  path: string;
  weight?: string | number;
  style?: 'normal' | 'italic';
}

export type FallbackFontName = 'Arial' | 'Times New Roman' | 'Courier New';

export interface FontFallbackMetrics {
  /** CSS ascent-override value, e.g., '94.52%' */
  ascentOverride: string;
  /** CSS descent-override value, e.g., '24.60%' */
  descentOverride: string;
  /** CSS line-gap-override value, e.g., '0.00%' */
  lineGapOverride: string;
  /** CSS size-adjust value, e.g., '104.88%' */
  sizeAdjust: string;
  /** System font used as fallback base. */
  fallbackFont: FallbackFontName;
}

export interface CompileFontsOptions {
  /** Pre-computed fallback metrics per font key. Provided by @vertz/ui-server at build/SSR time. */
  fallbackMetrics?: Record<string, FontFallbackMetrics>;
}

export interface FontOptions {
  /** Font weight: '100..1000' (variable) or 400 (fixed). */
  weight: string | number;
  /** Font style. @default 'normal' */
  style?: 'normal' | 'italic';
  /** Font-display strategy. @default 'swap' */
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
  /** URL path(s) for local/self-hosted fonts. */
  src?: string | FontSrc[];
  /** Fallback font stack. */
  fallback?: string[];
  /** Font subsets (metadata only — subsetting is deferred to a future phase). @default ['latin'] */
  subsets?: string[];
  /** Unicode range for subsetting. */
  unicodeRange?: string;
  /**
   * Control automatic fallback font metric adjustment for zero-CLS font loading.
   * - true: auto-detect fallback base from `fallback` array (default)
   * - false: disable
   * - 'Arial' | 'Times New Roman' | 'Courier New': explicit base
   * @default true
   */
  adjustFontFallback?: boolean | FallbackFontName;
}

type FontStyle = 'normal' | 'italic';
type FontDisplay = 'auto' | 'block' | 'swap' | 'fallback' | 'optional';

export interface FontDescriptor {
  readonly __brand: 'FontDescriptor';
  readonly family: string;
  readonly weight: string;
  readonly style: FontStyle;
  readonly display: FontDisplay;
  readonly src?: string | FontSrc[];
  readonly fallback: string[];
  readonly subsets: string[];
  readonly unicodeRange?: string;
  readonly adjustFontFallback: boolean | FallbackFontName;
}

export interface CompiledFonts {
  /** @font-face declarations. */
  fontFaceCss: string;
  /** :root { --font-<key>: ...; } block (for standalone use). */
  cssVarsCss: string;
  /** Individual CSS var lines (e.g., '  --font-sans: ...;') for merging into an existing :root. */
  cssVarLines: string[];
  /** <link rel="preload"> HTML tags for font files. */
  preloadTags: string;
}

// ─── font() ─────────────────────────────────────────────────────

/**
 * Create a font descriptor for use in theme definitions.
 *
 * @param family - The font family name (e.g., 'DM Sans').
 * @param options - Font configuration.
 * @returns A FontDescriptor.
 */
export function font(family: string, options: FontOptions): FontDescriptor {
  return {
    __brand: 'FontDescriptor',
    family,
    weight: String(options.weight),
    style: options.style ?? 'normal',
    display: options.display ?? 'swap',
    src: options.src,
    fallback: options.fallback ?? [],
    subsets: options.subsets ?? ['latin'],
    unicodeRange: options.unicodeRange,
    adjustFontFallback: options.adjustFontFallback ?? true,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

/** Convert '100..1000' range notation to CSS '100 1000' format. */
function toCssWeight(weight: string): string {
  return sanitizeCssValue(weight).replace('..', ' ');
}

/** Generate a single @font-face block. */
function buildFontFace(
  family: string,
  src: string,
  weight: string,
  style: string,
  display: string,
  unicodeRange?: string,
): string {
  const safeFamily = sanitizeCssValue(family);
  const safeSrc = sanitizeCssValue(src);
  const safeStyle = sanitizeCssValue(style);
  const safeDisplay = sanitizeCssValue(display);
  const lines = [
    '@font-face {',
    `  font-family: '${safeFamily}';`,
    `  font-style: ${safeStyle};`,
    `  font-weight: ${toCssWeight(weight)};`,
    `  font-display: ${safeDisplay};`,
    `  src: url(${safeSrc}) format('woff2');`,
  ];
  if (unicodeRange) {
    lines.push(`  unicode-range: ${sanitizeCssValue(unicodeRange)};`);
  }
  lines.push('}');
  return lines.join('\n');
}

/** Generate a fallback @font-face block with metric overrides for zero-CLS font loading. */
function buildFallbackFontFace(
  family: string,
  metrics: FontFallbackMetrics,
): string {
  const safeFamily = sanitizeCssValue(family);
  const lines = [
    '@font-face {',
    `  font-family: '${safeFamily} Fallback';`,
    `  src: local(${metrics.fallbackFont});`,
    `  ascent-override: ${metrics.ascentOverride};`,
    `  descent-override: ${metrics.descentOverride};`,
    `  line-gap-override: ${metrics.lineGapOverride};`,
    `  size-adjust: ${metrics.sizeAdjust};`,
    '}',
  ];
  return lines.join('\n');
}

// ─── compileFonts() ─────────────────────────────────────────────

/** Validate that a font src path ends with .woff2. */
function validateWoff2Src(path: string): void {
  if (!path.toLowerCase().endsWith('.woff2')) {
    throw new Error(
      `Font src "${path}" is not a .woff2 file. Only woff2 format is currently supported.`,
    );
  }
}

/**
 * Compile font descriptors into CSS and preload tags.
 *
 * @param fonts - A map of token key → FontDescriptor.
 * @param options - Optional compilation settings (e.g., pre-computed fallback metrics).
 * @returns Compiled @font-face CSS, CSS var lines, and preload link tags.
 */
export function compileFonts(
  fonts: Record<string, FontDescriptor>,
  options?: CompileFontsOptions,
): CompiledFonts {
  const fontFaces: string[] = [];
  const cssVars: string[] = [];
  const preloadPaths: string[] = [];
  const fallbackMetrics = options?.fallbackMetrics;

  for (const [key, descriptor] of Object.entries(fonts)) {
    if (!/^[a-zA-Z0-9-]+$/.test(key)) {
      throw new Error(
        `Font key "${key}" contains invalid CSS identifier characters. Use only [a-zA-Z0-9-].`,
      );
    }

    const { family, weight, style, display, src, fallback, unicodeRange } = descriptor;
    // Default adjustFontFallback to true for descriptors that lack the field
    const adjustFontFallback = descriptor.adjustFontFallback ?? true;

    // Check if this font should get a fallback @font-face
    const metrics = fallbackMetrics?.[key];
    const shouldGenerateFallback =
      metrics && src && adjustFontFallback !== false;

    // Build font family CSS var value: 'Family Name', ['Family Fallback',] fallback1, fallback2
    const safeFamily = sanitizeCssValue(family);
    const safeFallbacks = fallback.map(sanitizeCssValue);
    const fallbackFontName = shouldGenerateFallback
      ? `'${safeFamily} Fallback'`
      : undefined;
    const familyParts = [
      `'${safeFamily}'`,
      ...(fallbackFontName ? [fallbackFontName] : []),
      ...safeFallbacks,
    ];
    const familyValue = familyParts.join(', ');
    cssVars.push(`  --font-${sanitizeCssValue(key)}: ${familyValue};`);

    if (!src) continue;

    if (typeof src === 'string') {
      validateWoff2Src(src);
      fontFaces.push(buildFontFace(family, src, weight, style, display, unicodeRange));
      preloadPaths.push(src);
    } else {
      for (const entry of src) {
        validateWoff2Src(entry.path);
        const entryWeight = entry.weight != null ? String(entry.weight) : weight;
        const entryStyle = entry.style ?? style;
        fontFaces.push(
          buildFontFace(family, entry.path, entryWeight, entryStyle, display, unicodeRange),
        );
      }
      // Preload only the first file (primary)
      const first = src[0];
      if (first) {
        preloadPaths.push(first.path);
      }
    }

    // Generate adjusted fallback @font-face if metrics are provided
    if (shouldGenerateFallback) {
      fontFaces.push(buildFallbackFontFace(family, metrics));
    }
  }

  const fontFaceCss = fontFaces.join('\n\n');
  const cssVarLines = cssVars;
  const cssVarsCss = cssVars.length > 0 ? `:root {\n${cssVars.join('\n')}\n}` : '';
  const preloadTags = preloadPaths
    .map(
      (p) =>
        `<link rel="preload" href="${escapeHtmlAttr(p)}" as="font" type="font/woff2" crossorigin>`,
    )
    .join('\n');

  return { fontFaceCss, cssVarsCss, cssVarLines, preloadTags };
}
