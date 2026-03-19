/**
 * Type-safe CSS utility class union.
 *
 * Derived from the token tables in token-tables.ts (single source of truth).
 * Provides compile-time validation and editor autocomplete for css() and
 * variants() string entries.
 *
 * ## Property groups
 *
 * Properties are grouped by their value type. Multi-mode properties
 * (text, font, border, ring, list) have dedicated union types since
 * they accept multiple value categories.
 *
 * ## Raw properties (escape hatch)
 *
 * The following properties accept any string value and do NOT validate
 * values at the type level: cursor, transition, resize, opacity, inset,
 * z, vt-name, view-transition-name, border-r, border-l, border-t,
 * border-b, grid-cols, tracking, decoration.
 *
 * ## Pseudo-prefixed utilities
 *
 * Pseudo utilities validate the prefix and property name, but not the
 * value. This keeps the union size manageable for TypeScript performance.
 */

import type {
  AlignmentValue,
  ColorNamespace,
  ContentValue,
  CSSColorKeyword,
  FontSizeValue,
  FontWeightValue,
  Keyword,
  LineHeightValue,
  PropertyName,
  PseudoPrefix,
  RadiusValue,
  ShadowValue,
  SizeKeyword,
  SpacingValue,
} from './token-tables';

// ─── Property groups (by valueType) ──────────────────────────────
// Manually maintained to match PROPERTY_MAP entries in token-tables.ts.
// Multi-mode properties (text, border, font, ring, list) are excluded
// from their base group and handled as dedicated multi-mode types.

type SpacingProperty =
  | 'p'
  | 'px'
  | 'py'
  | 'pt'
  | 'pr'
  | 'pb'
  | 'pl'
  | 'm'
  | 'mx'
  | 'my'
  | 'mt'
  | 'mr'
  | 'mb'
  | 'ml'
  | 'gap';

/** bg only — text and border are multi-mode. */
type BgColorProperty = 'bg';

type SizeProperty = 'w' | 'h' | 'min-w' | 'max-w' | 'min-h' | 'max-h';

type RadiusProperty = 'rounded';

type ShadowProperty = 'shadow';

type AlignmentProperty = 'items' | 'justify';

type FontWeightProperty = 'weight';

type LineHeightProperty = 'leading';

type ContentProperty = 'content';

/**
 * Raw properties accept any string value (no value validation).
 * These are the escape hatch for arbitrary CSS values.
 */
type RawProperty =
  | 'cursor'
  | 'transition'
  | 'resize'
  | 'opacity'
  | 'inset'
  | 'z'
  | 'vt-name'
  | 'view-transition-name'
  | 'border-r'
  | 'border-l'
  | 'border-t'
  | 'border-b'
  | 'grid-cols'
  | 'tracking'
  | 'decoration'
  | 'overflow'
  | 'overflow-x'
  | 'overflow-y';

// ─── Color tokens ────────────────────────────────────────────────

type ColorShade =
  | '50'
  | '100'
  | '200'
  | '300'
  | '400'
  | '500'
  | '600'
  | '700'
  | '800'
  | '900'
  | '950';

type ColorToken =
  | ColorNamespace
  | `${ColorNamespace}.${ColorShade}`
  | CSSColorKeyword
  | `${ColorNamespace}/${number}`
  | `${ColorNamespace}.${ColorShade}/${number}`;

// ─── Multi-mode text values ──────────────────────────────────────
// text:value resolves to font-size, text-align, OR color depending on value.

type TextAlignKeyword = 'center' | 'left' | 'right' | 'justify' | 'start' | 'end';

// ─── Multi-mode list values ──────────────────────────────────────

type ListKeyword = 'none' | 'disc' | 'decimal' | 'inside' | 'outside';

// ─── Base utility union (no pseudo prefix) ───────────────────────

type BaseUtility =
  // Keywords (no value): flex, grid, hidden, inline-flex, ...
  | Keyword
  // Spacing: p:4, mx:auto, gap:2, ...
  | `${SpacingProperty}:${SpacingValue}`
  // Background color: bg:primary, bg:primary.700, bg:transparent, ...
  | `${BgColorProperty}:${ColorToken}`
  // Size: w:full, h:screen, h:4, max-w:xl, w:1/2, ...
  | `${SizeProperty}:${SizeKeyword | SpacingValue | 'screen' | `${number}/${number}`}`
  // Radius: rounded:lg, rounded:full, ...
  | `${RadiusProperty}:${RadiusValue}`
  // Shadow: shadow:md, shadow:none, ...
  | `${ShadowProperty}:${ShadowValue}`
  // Alignment: items:center, justify:between, ...
  | `${AlignmentProperty}:${AlignmentValue}`
  // Font weight: weight:bold, weight:medium, ...
  | `${FontWeightProperty}:${FontWeightValue}`
  // Line height: leading:tight, leading:loose, ...
  | `${LineHeightProperty}:${LineHeightValue}`
  // Content: content:empty, content:none
  | `${ContentProperty}:${ContentValue}`
  // Raw: cursor:pointer, z:10, opacity:0.5, transition:colors, ...
  | `${RawProperty}:${string}`
  // Ring (multi-mode): ring:2 (width) or ring:primary (color)
  | `ring:${`${number}` | ColorToken}`
  // Multi-mode text: text:foreground (color), text:sm (font-size), text:center (align)
  | `text:${FontSizeValue | TextAlignKeyword | ColorToken}`
  // Multi-mode font: font:xl (size) or font:medium (weight)
  | `font:${FontSizeValue | FontWeightValue}`
  // Multi-mode border: border:1 (width) or border:border (color)
  | `border:${`${number}` | ColorToken}`
  // Multi-mode list: list:none, list:disc, list:inside, ...
  | `list:${ListKeyword}`;

// ─── Pseudo-prefixed utilities ───────────────────────────────────
// Validates pseudo prefix + property/keyword name. Value is not validated
// for pseudo utilities to keep the union size manageable.

type PseudoUtility = `${PseudoPrefix}:${Keyword}` | `${PseudoPrefix}:${PropertyName}:${string}`;

// ─── Exported union ──────────────────────────────────────────────

/**
 * Union of all valid CSS utility class strings.
 *
 * Used by `css()` and `variants()` to validate string entries at compile time.
 * Invalid utility class names produce TypeScript errors with autocomplete
 * suggestions for valid alternatives.
 *
 * Properties that accept arbitrary CSS values (cursor, z, opacity, transition,
 * etc.) use `${string}` for their value portion — these won't validate values
 * but will still validate the property name prefix.
 */
export type UtilityClass = BaseUtility | PseudoUtility;
