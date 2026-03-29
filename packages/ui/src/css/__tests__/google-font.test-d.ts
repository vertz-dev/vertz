/**
 * Type-level tests for googleFont().
 *
 * Checked by `tsc --noEmit` (typecheck), not by vitest at runtime.
 */

import type { FontDescriptor } from '../font';
import { googleFont } from '../google-font';

// ─── googleFont() returns FontDescriptor ────────────────────

const sans = googleFont('Inter', { weight: '100..900' });

// Positive: return type is assignable to FontDescriptor
const _fd: FontDescriptor = sans;
void _fd;

// Positive: brand is present
const _brand: 'FontDescriptor' = sans.__brand;
void _brand;

// Positive: __google metadata is present
const _google = sans.__google;
void _google;

// ─── Valid weight forms ─────────────────────────────────────

// Positive: string range
googleFont('Inter', { weight: '100..900' });

// Positive: single number
googleFont('Inter', { weight: 400 });

// Positive: array of numbers
googleFont('Inter', { weight: [400, 700] });

// ─── Invalid usage rejected ─────────────────────────────────

// @ts-expect-error — missing required weight
googleFont('Inter', { subsets: ['latin'] });

// @ts-expect-error — weight must be string, number, or number[]
googleFont('Inter', { weight: true });

// @ts-expect-error — missing options entirely
googleFont('Inter');

// ─── Valid style forms ──────────────────────────────────────

// Positive: single style
googleFont('Inter', { weight: 400, style: 'normal' });
googleFont('Inter', { weight: 400, style: 'italic' });

// Positive: array of styles
googleFont('Inter', { weight: 400, style: ['normal', 'italic'] });

// @ts-expect-error — invalid style value
googleFont('Inter', { weight: 400, style: 'bold' });

// ─── Valid display values ───────────────────────────────────

googleFont('Inter', { weight: 400, display: 'swap' });
googleFont('Inter', { weight: 400, display: 'optional' });
googleFont('Inter', { weight: 400, display: 'auto' });
googleFont('Inter', { weight: 400, display: 'block' });
googleFont('Inter', { weight: 400, display: 'fallback' });

// @ts-expect-error — invalid display value
googleFont('Inter', { weight: 400, display: 'fast' });

// ─── googleFont and font() return compatible types ──────────

import { font } from '../font';
import { compileFonts } from '../font';
import { defineTheme } from '../theme';

const selfHosted = font('Custom', { weight: 400, src: '/fonts/custom.woff2' });

// Positive: both can be used in compileFonts together
compileFonts({ sans, mono: selfHosted });

// Positive: both can be used in defineTheme together
defineTheme({ colors: {}, fonts: { sans, mono: selfHosted } });
