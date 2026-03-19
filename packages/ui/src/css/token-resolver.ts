/**
 * Resolves design tokens and shorthand values to CSS property-value pairs.
 *
 * The property map translates shorthand names (p, bg, text, etc.) to CSS properties.
 * Values go through the token resolution pipeline:
 *   1. Spacing scale numbers -> rem values
 *   2. Named tokens -> CSS custom properties
 *   3. Named size values (sm, md, lg) -> concrete values
 *   4. Passthrough for raw CSS values
 */

import type { ParsedShorthand } from './shorthand-parser';
import type { PropertyMapping } from './token-tables';
import {
  ALIGNMENT_MAP,
  COLOR_NAMESPACES,
  CONTENT_MAP,
  CSS_COLOR_KEYWORDS,
  FONT_SIZE_SCALE,
  FONT_WEIGHT_SCALE,
  HEIGHT_AXIS_PROPERTIES,
  KEYWORD_MAP,
  LINE_HEIGHT_SCALE,
  PROPERTY_MAP,
  RADIUS_SCALE,
  SHADOW_SCALE,
  SIZE_KEYWORDS,
  SPACING_SCALE,
} from './token-tables';

/** A resolved CSS declaration. */
export interface ResolvedStyle {
  /** CSS property name(s). */
  declarations: CSSDeclaration[];
  /** Pseudo-selector if any. */
  pseudo: string | null;
}

/** A single CSS property-value pair. */
export interface CSSDeclaration {
  property: string;
  value: string;
}

/** Error thrown when token resolution fails. */
export class TokenResolveError extends Error {
  readonly shorthand: string;

  constructor(message: string, shorthand: string) {
    super(message);
    this.name = 'TokenResolveError';
    this.shorthand = shorthand;
  }
}

// ─── Resolver ──────────────────────────────────────────────────

/**
 * Resolve a parsed shorthand into CSS declarations.
 */
export function resolveToken(parsed: ParsedShorthand): ResolvedStyle {
  const { property, value, pseudo } = parsed;

  // Keywords (no value): flex, flex-1, flex-col, fixed, uppercase, etc.
  const keyword = KEYWORD_MAP[property];
  if (keyword !== undefined && value === null) {
    return { declarations: [...keyword], pseudo };
  }

  const mapping = PROPERTY_MAP[property];
  if (!mapping) {
    throw new TokenResolveError(
      `Unknown property shorthand '${property}'`,
      formatShorthand(parsed),
    );
  }

  if (value === null) {
    throw new TokenResolveError(`Property '${property}' requires a value`, formatShorthand(parsed));
  }

  // Multi-mode properties: text, font, border, ring resolve based on value type.
  if (property === 'text') {
    return { declarations: resolveText(value), pseudo };
  }
  if (property === 'font') {
    return { declarations: resolveFont(value), pseudo };
  }
  if (property === 'border') {
    return { declarations: resolveBorder(value), pseudo };
  }
  if (property === 'ring') {
    return { declarations: resolveRingMulti(value), pseudo };
  }
  if (property === 'list') {
    return { declarations: resolveList(value), pseudo };
  }

  // Standard single-mode resolution.
  const resolvedValue = resolveValue(value, mapping.valueType, property);
  const declarations = mapping.properties.map((prop) => ({
    property: prop,
    value: resolvedValue,
  }));

  return { declarations, pseudo };
}

function resolveValue(
  value: string,
  valueType: PropertyMapping['valueType'],
  property: string,
): string {
  switch (valueType) {
    case 'spacing':
      return resolveSpacing(value, property);
    case 'color':
      return resolveColor(value, property);
    case 'radius':
      return resolveRadius(value, property);
    case 'shadow':
      return resolveShadow(value, property);
    case 'size':
      return resolveSize(value, property);
    case 'alignment':
      return resolveAlignment(value, property);
    case 'font-size':
      return resolveFontSize(value, property);
    case 'font-weight':
      return resolveFontWeight(value, property);
    case 'line-height':
      return resolveLineHeight(value, property);
    case 'ring':
      return resolveRing(value, property);
    case 'content':
      return resolveContent(value, property);
    case 'display':
      return value;
    case 'raw':
      return resolveRaw(value, property);
  }
}

function resolveSpacing(value: string, property: string): string {
  const scaled = SPACING_SCALE[value];
  if (scaled !== undefined) return scaled;

  throw new TokenResolveError(
    `Invalid spacing value '${value}' for '${property}'. Use a spacing scale number (0, 1, 2, 4, 8, etc.) or 'auto'.`,
    `${property}:${value}`,
  );
}

/** Opacity modifier pattern: integer 0-100 after last `/`. */
const OPACITY_PATTERN = /^(.+)\/(\d+)$/;

function resolveColor(value: string, property: string): string {
  // Check for opacity modifier: 'primary/50', 'primary.700/50'
  const opacityMatch = OPACITY_PATTERN.exec(value);
  if (opacityMatch && opacityMatch[1] && opacityMatch[2]) {
    const colorPart = opacityMatch[1];
    const opacityStr = opacityMatch[2];

    // Validate opacity is an integer 0-100
    const opacity = Number(opacityStr);
    if (opacity < 0 || opacity > 100) {
      throw new TokenResolveError(
        `Invalid opacity '${opacityStr}' in '${value}'. Opacity must be an integer between 0 and 100.`,
        `${property}:${value}`,
      );
    }

    // Resolve the color token part (may throw if invalid)
    const resolvedColor = resolveColorToken(colorPart, property, value);
    return `color-mix(in oklch, ${resolvedColor} ${opacity}%, transparent)`;
  }

  return resolveColorToken(value, property, value);
}

/** Resolve a color token (no opacity) to a CSS value. */
function resolveColorToken(token: string, property: string, fullValue: string): string {
  // Check for dotted notation: 'primary.700' -> 'var(--color-primary-700)'
  const dotIndex = token.indexOf('.');
  if (dotIndex !== -1) {
    const namespace = token.substring(0, dotIndex);
    const shade = token.substring(dotIndex + 1);
    if (COLOR_NAMESPACES.has(namespace)) {
      return `var(--color-${namespace}-${shade})`;
    }
    throw new TokenResolveError(
      `Unknown color token '${fullValue}'. Known namespaces: ${[...COLOR_NAMESPACES].join(', ')}`,
      `${property}:${fullValue}`,
    );
  }

  // Plain token name: 'background' -> 'var(--color-background)'
  if (COLOR_NAMESPACES.has(token)) {
    return `var(--color-${token})`;
  }

  // CSS color keywords (named colors + global keywords).
  if (CSS_COLOR_KEYWORDS.has(token)) {
    return token;
  }

  throw new TokenResolveError(
    `Unknown color token '${fullValue}'. Use a design token name (e.g. 'primary', 'background') or 'primary.700' for shades.`,
    `${property}:${fullValue}`,
  );
}

function resolveRadius(value: string, property: string): string {
  const scaled = RADIUS_SCALE[value];
  if (scaled !== undefined) return scaled;

  throw new TokenResolveError(
    `Invalid border-radius value '${value}' for '${property}'. Use: ${Object.keys(RADIUS_SCALE).join(', ')}`,
    `${property}:${value}`,
  );
}

function resolveShadow(value: string, property: string): string {
  const scaled = SHADOW_SCALE[value];
  if (scaled !== undefined) return scaled;

  throw new TokenResolveError(
    `Invalid shadow value '${value}' for '${property}'. Use: ${Object.keys(SHADOW_SCALE).join(', ')}`,
    `${property}:${value}`,
  );
}

/** Fraction pattern: N/M where N and M are non-negative integers. */
const FRACTION_PATTERN = /^(\d+)\/(\d+)$/;

function resolveSize(value: string, property: string): string {
  // Check spacing scale first (numeric)
  const spaced = SPACING_SCALE[value];
  if (spaced !== undefined) return spaced;

  // Axis-aware `screen` keyword: vh for height axis, vw for width axis
  if (value === 'screen') {
    return HEIGHT_AXIS_PROPERTIES.has(property) ? '100vh' : '100vw';
  }

  // Size keywords
  const keyword = SIZE_KEYWORDS[value];
  if (keyword !== undefined) return keyword;

  // Fraction dimensions: N/M -> percentage
  const fractionMatch = FRACTION_PATTERN.exec(value);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (denominator === 0) {
      throw new TokenResolveError(
        `Invalid fraction '${value}' for '${property}'. Denominator cannot be zero.`,
        `${property}:${value}`,
      );
    }
    const percent = (numerator / denominator) * 100;
    // Use 6 decimal places for repeating fractions, strip trailing zeros
    const formatted = percent % 1 === 0 ? `${percent}` : percent.toFixed(6);
    return `${formatted}%`;
  }

  throw new TokenResolveError(
    `Invalid size value '${value}' for '${property}'. Use a spacing scale number, keyword (full, screen, min, max, fit, auto), or fraction (1/2, 2/3, etc.).`,
    `${property}:${value}`,
  );
}

function resolveAlignment(value: string, property: string): string {
  const mapped = ALIGNMENT_MAP[value];
  if (mapped !== undefined) return mapped;

  throw new TokenResolveError(
    `Invalid alignment value '${value}' for '${property}'. Use: ${Object.keys(ALIGNMENT_MAP).join(', ')}`,
    `${property}:${value}`,
  );
}

function resolveFontSize(value: string, property: string): string {
  const scaled = FONT_SIZE_SCALE[value];
  if (scaled !== undefined) return scaled;

  throw new TokenResolveError(
    `Invalid font-size value '${value}' for '${property}'. Use: ${Object.keys(FONT_SIZE_SCALE).join(', ')}`,
    `${property}:${value}`,
  );
}

function resolveFontWeight(value: string, property: string): string {
  const scaled = FONT_WEIGHT_SCALE[value];
  if (scaled !== undefined) return scaled;

  throw new TokenResolveError(
    `Invalid font-weight value '${value}' for '${property}'. Use: ${Object.keys(FONT_WEIGHT_SCALE).join(', ')}`,
    `${property}:${value}`,
  );
}

function resolveLineHeight(value: string, property: string): string {
  const scaled = LINE_HEIGHT_SCALE[value];
  if (scaled !== undefined) return scaled;

  throw new TokenResolveError(
    `Invalid line-height value '${value}' for '${property}'. Use: ${Object.keys(LINE_HEIGHT_SCALE).join(', ')}`,
    `${property}:${value}`,
  );
}

/** Ring values: number -> outline shorthand with ring color token. */
function resolveRing(value: string, property: string): string {
  const num = Number(value);
  if (Number.isNaN(num) || num < 0) {
    throw new TokenResolveError(
      `Invalid ring width '${value}' for '${property}'. Use a non-negative number (0, 1, 2, 4, etc.).`,
      `${property}:${value}`,
    );
  }
  return `${num}px solid var(--color-ring)`;
}

function resolveContent(value: string, property: string): string {
  const mapped = CONTENT_MAP[value];
  if (mapped !== undefined) return mapped;

  throw new TokenResolveError(
    `Invalid content value '${value}' for '${property}'. Use: ${Object.keys(CONTENT_MAP).join(', ')}`,
    `${property}:${value}`,
  );
}

// ─── Multi-Mode Resolvers ────────────────────────────────────

/** Text alignment keywords. */
const TEXT_ALIGN_KEYWORDS = new Set(['center', 'left', 'right', 'justify', 'start', 'end']);

/**
 * Resolve `text:value` -- multi-mode:
 * - Font-size keywords (sm, xs, lg, etc.) -> font-size
 * - Text-align keywords (center, left, right) -> text-align
 * - Everything else -> color
 */
function resolveText(value: string): CSSDeclaration[] {
  if (FONT_SIZE_SCALE[value] !== undefined) {
    return [{ property: 'font-size', value: FONT_SIZE_SCALE[value] }];
  }
  if (TEXT_ALIGN_KEYWORDS.has(value)) {
    return [{ property: 'text-align', value }];
  }
  return [{ property: 'color', value: resolveColor(value, 'text') }];
}

/**
 * Resolve `font:value` -- multi-mode:
 * - Font-weight keywords (medium, semibold, bold, etc.) -> font-weight
 * - Everything else -> font-size
 */
function resolveFont(value: string): CSSDeclaration[] {
  if (FONT_WEIGHT_SCALE[value] !== undefined) {
    return [{ property: 'font-weight', value: FONT_WEIGHT_SCALE[value] }];
  }
  return [{ property: 'font-size', value: resolveFontSize(value, 'font') }];
}

/**
 * Resolve `border:value` -- multi-mode:
 * - Numeric values (1, 2, etc.) -> border-width in px
 * - Everything else -> border-color
 */
function resolveBorder(value: string): CSSDeclaration[] {
  const num = Number(value);
  if (!Number.isNaN(num) && num >= 0) {
    return [{ property: 'border-width', value: `${num}px` }];
  }
  return [{ property: 'border-color', value: resolveColor(value, 'border') }];
}

/**
 * Resolve `ring:value` -- multi-mode:
 * - Numeric values -> outline width
 * - Color tokens -> outline-color
 */
function resolveRingMulti(value: string): CSSDeclaration[] {
  const num = Number(value);
  if (!Number.isNaN(num) && num >= 0) {
    return [{ property: 'outline', value: `${num}px solid var(--color-ring)` }];
  }
  // Color token: ring:primary.500 -> outline-color
  return [{ property: 'outline-color', value: resolveColor(value, 'ring') }];
}

/** List-style type keywords. */
const LIST_STYLE_KEYWORDS = new Set(['none', 'disc', 'decimal']);

/** List-style position keywords. */
const LIST_POSITION_KEYWORDS = new Set(['inside', 'outside']);

/**
 * Resolve `list:value` -- multi-mode:
 * - Style keywords (none, disc, decimal) -> list-style
 * - Position keywords (inside, outside) -> list-style-position
 */
function resolveList(value: string): CSSDeclaration[] {
  if (LIST_STYLE_KEYWORDS.has(value)) {
    return [{ property: 'list-style', value }];
  }
  if (LIST_POSITION_KEYWORDS.has(value)) {
    return [{ property: 'list-style-position', value }];
  }
  throw new TokenResolveError(
    `Invalid list value '${value}'. Use: none, disc, decimal, inside, outside.`,
    `list:${value}`,
  );
}

/** Resolve raw values for properties that need custom mapping (border-width sides, transition, tracking, grid-cols, etc.). */
function resolveRaw(value: string, property: string): string {
  // border-r/l/t/b: numeric -> px
  if (
    property === 'border-r' ||
    property === 'border-l' ||
    property === 'border-t' ||
    property === 'border-b'
  ) {
    const num = Number(value);
    if (!Number.isNaN(num)) return `${num}px`;
    return value;
  }

  // transition shorthand aliases
  if (property === 'transition') {
    const TIMING = '150ms cubic-bezier(0.4, 0, 0.2, 1)';
    const COLOR_PROPS = [
      'color',
      'background-color',
      'border-color',
      'outline-color',
      'text-decoration-color',
      'fill',
      'stroke',
    ];
    const TRANSITION_MAP: Record<string, string> = {
      none: 'none',
      all: `all ${TIMING}`,
      colors: COLOR_PROPS.map((p) => `${p} ${TIMING}`).join(', '),
      shadow: `box-shadow ${TIMING}`,
      transform: `transform ${TIMING}`,
      opacity: `opacity ${TIMING}`,
    };
    return TRANSITION_MAP[value] ?? value;
  }

  // tracking (letter-spacing)
  if (property === 'tracking') {
    const TRACKING_MAP: Record<string, string> = {
      tighter: '-0.05em',
      tight: '-0.025em',
      normal: '0em',
      wide: '0.025em',
      wider: '0.05em',
      widest: '0.1em',
    };
    return TRACKING_MAP[value] ?? value;
  }

  // grid-cols: number -> repeat(N, minmax(0, 1fr))
  if (property === 'grid-cols') {
    const num = Number(value);
    if (!Number.isNaN(num) && num > 0) return `repeat(${num}, minmax(0, 1fr))`;
    return value;
  }

  // inset: use spacing scale
  if (property === 'inset') {
    const spaced = SPACING_SCALE[value];
    if (spaced !== undefined) return spaced;
    return value;
  }

  return value;
}

function formatShorthand(parsed: ParsedShorthand): string {
  const parts: string[] = [];
  if (parsed.pseudo) parts.push(parsed.pseudo);
  parts.push(parsed.property);
  if (parsed.value) parts.push(parsed.value);
  return parts.join(':');
}

/**
 * Check if a property shorthand is known.
 */
export function isKnownProperty(name: string): boolean {
  return name in PROPERTY_MAP || name in KEYWORD_MAP;
}

/**
 * Check if a color token is valid.
 */
export function isValidColorToken(value: string): boolean {
  // Strip opacity modifier if present
  const slashIndex = value.lastIndexOf('/');
  const token = slashIndex !== -1 ? value.substring(0, slashIndex) : value;

  const dotIndex = token.indexOf('.');
  if (dotIndex !== -1) {
    return COLOR_NAMESPACES.has(token.substring(0, dotIndex));
  }
  return COLOR_NAMESPACES.has(token);
}
