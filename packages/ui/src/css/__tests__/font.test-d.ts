/**
 * Type-level tests for font() and related types.
 *
 * Checked by `tsc --noEmit` (typecheck), not by vitest at runtime.
 */

import type { FontDescriptor, FontFallbackMetrics, FontSrc } from '../font';
import { compileFonts, font } from '../font';
import type { CompileThemeOptions, Theme } from '../theme';
import { compileTheme, defineTheme } from '../theme';

// ─── font() returns FontDescriptor ──────────────────────────────

const sans = font('DM Sans', { weight: '100..1000', src: '/fonts/dm-sans.woff2' });

// Positive: font() return type is assignable to FontDescriptor
const _fd: FontDescriptor = sans;
void _fd;

// Positive: brand is present
const _brand: 'FontDescriptor' = sans.__brand;
void _brand;

// ─── FontOptions.display rejects invalid values ─────────────────

// @ts-expect-error - 'bold' is not a valid display value
font('Test', { weight: 400, display: 'bold' });

// @ts-expect-error - 'fast' is not a valid display value
font('Test', { weight: 400, display: 'fast' });

// Positive: valid display values compile
font('Test', { weight: 400, display: 'swap' });
font('Test', { weight: 400, display: 'optional' });
font('Test', { weight: 400, display: 'auto' });
font('Test', { weight: 400, display: 'block' });
font('Test', { weight: 400, display: 'fallback' });

// ─── FontOptions.style rejects invalid values ───────────────────

// @ts-expect-error - 'bold' is not a valid style value
font('Test', { weight: 400, style: 'bold' });

// @ts-expect-error - 'oblique' is not a valid style value
font('Test', { weight: 400, style: 'oblique' });

// Positive: valid style values compile
font('Test', { weight: 400, style: 'normal' });
font('Test', { weight: 400, style: 'italic' });

// ─── font() requires weight ─────────────────────────────────────

// @ts-expect-error - weight is required
font('Test', {});

// @ts-expect-error - weight is required (even with src)
font('Test', { src: '/fonts/test.woff2' });

// ─── FontDescriptor brand prevents plain object assignment ──────

const _plainObj = {
  family: 'Evil',
  weight: '400',
  style: 'normal',
  display: 'optional',
  fallback: [] as string[],
  subsets: ['latin'],
};
// @ts-expect-error - plain object missing __brand is not assignable to FontDescriptor
const _notDescriptor: FontDescriptor = _plainObj;
void _notDescriptor;

// ─── defineTheme accepts fonts field ────────────────────────────

const themeWithFonts = defineTheme({
  colors: {},
  fonts: { sans },
});

// Positive: theme with fonts is a valid Theme
const _t: Theme = themeWithFonts;
void _t;

// ─── ThemeInput.fonts requires FontDescriptor values ────────────

const _badFontObj = {
  family: 'X',
  weight: '400',
  style: 'normal',
  display: 'swap',
  fallback: [] as string[],
  subsets: [] as string[],
};
// @ts-expect-error - plain object is not a FontDescriptor (missing __brand)
defineTheme({ colors: {}, fonts: { sans: _badFontObj } });

// ─── CompiledTheme includes preloadTags ─────────────────────────

const compiled = compileTheme(defineTheme({ colors: { primary: { 500: '#3b82f6' } } }));

// Positive: preloadTags is a string
const _tags: string = compiled.preloadTags;
void _tags;

// Positive: css is a string
const _css: string = compiled.css;
void _css;

// ─── CompiledFonts includes cssVarLines ─────────────────────────

const compiledFonts = compileFonts({ sans });

// Positive: cssVarLines is string[]
const _lines: string[] = compiledFonts.cssVarLines;
void _lines;

// Positive: other fields are strings
const _ffCss: string = compiledFonts.fontFaceCss;
const _cvCss: string = compiledFonts.cssVarsCss;
const _pt: string = compiledFonts.preloadTags;
void _ffCss;
void _cvCss;
void _pt;

// ─── FontSrc type constraints ───────────────────────────────────

// Positive: valid FontSrc
const _src: FontSrc = { path: '/fonts/test.woff2' };
void _src;

// Positive: FontSrc with optional fields
const _srcFull: FontSrc = { path: '/fonts/test.woff2', weight: '400', style: 'italic' };
void _srcFull;

// @ts-expect-error - FontSrc.style rejects invalid values
const _badSrc: FontSrc = { path: '/fonts/test.woff2', style: 'bold' };
void _badSrc;

// ─── adjustFontFallback type constraints ─────────────────────────

// Positive: valid adjustFontFallback values
font('Test', { weight: 400, adjustFontFallback: true });
font('Test', { weight: 400, adjustFontFallback: false });
font('Test', { weight: 400, adjustFontFallback: 'Arial' });
font('Test', { weight: 400, adjustFontFallback: 'Times New Roman' });
font('Test', { weight: 400, adjustFontFallback: 'Courier New' });

// @ts-expect-error - 'Helvetica' is not a valid FallbackFontName
font('Test', { weight: 400, adjustFontFallback: 'Helvetica' });

// @ts-expect-error - number is not valid for adjustFontFallback
font('Test', { weight: 400, adjustFontFallback: 42 });

// Positive: FontDescriptor has adjustFontFallback
const _afb: boolean | 'Arial' | 'Times New Roman' | 'Courier New' = sans.adjustFontFallback;
void _afb;

// ─── FontFallbackMetrics type ────────────────────────────────────

const _metrics: FontFallbackMetrics = {
  ascentOverride: '94.52%',
  descentOverride: '24.60%',
  lineGapOverride: '0.00%',
  sizeAdjust: '104.88%',
  fallbackFont: 'Arial',
};
void _metrics;

// @ts-expect-error - 'Helvetica' is not a valid fallbackFont
const _badFallbackFont: FontFallbackMetrics['fallbackFont'] = 'Helvetica';
void _badFallbackFont;

// ─── compileFonts accepts options ────────────────────────────────

// Positive: compileFonts with fallbackMetrics
compileFonts({ sans }, { fallbackMetrics: { sans: _metrics } });

// Positive: compileFonts without options (backward compatible)
compileFonts({ sans });

// ─── compileTheme accepts options ────────────────────────────────

const _themeOpts: CompileThemeOptions = { fallbackMetrics: { sans: _metrics } };
void _themeOpts;

// Positive: compileTheme with options
compileTheme(defineTheme({ colors: {} }), { fallbackMetrics: { sans: _metrics } });

// Positive: compileTheme without options (backward compatible)
compileTheme(defineTheme({ colors: {} }));
