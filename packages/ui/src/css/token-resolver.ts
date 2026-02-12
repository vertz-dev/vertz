/**
 * Resolves design tokens and shorthand values to CSS property-value pairs.
 *
 * The property map translates shorthand names (p, bg, text, etc.) to CSS properties.
 * Values go through the token resolution pipeline:
 *   1. Spacing scale numbers → rem values
 *   2. Named tokens → CSS custom properties
 *   3. Named size values (sm, md, lg) → concrete values
 *   4. Passthrough for raw CSS values
 */

import type { ParsedShorthand } from './shorthand-parser';

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

// ─── Property Map ──────────────────────────────────────────────

interface PropertyMapping {
  /** CSS property name(s). If multiple, all get the same value. */
  properties: string[];
  /** Value resolver type. */
  valueType:
    | 'spacing'
    | 'color'
    | 'radius'
    | 'shadow'
    | 'size'
    | 'display'
    | 'alignment'
    | 'font-size'
    | 'font-weight'
    | 'line-height'
    | 'ring'
    | 'content'
    | 'raw';
}

const PROPERTY_MAP: Record<string, PropertyMapping> = {
  // Padding
  p: { properties: ['padding'], valueType: 'spacing' },
  px: { properties: ['padding-inline'], valueType: 'spacing' },
  py: { properties: ['padding-block'], valueType: 'spacing' },
  pt: { properties: ['padding-top'], valueType: 'spacing' },
  pr: { properties: ['padding-right'], valueType: 'spacing' },
  pb: { properties: ['padding-bottom'], valueType: 'spacing' },
  pl: { properties: ['padding-left'], valueType: 'spacing' },

  // Margin
  m: { properties: ['margin'], valueType: 'spacing' },
  mx: { properties: ['margin-inline'], valueType: 'spacing' },
  my: { properties: ['margin-block'], valueType: 'spacing' },
  mt: { properties: ['margin-top'], valueType: 'spacing' },
  mr: { properties: ['margin-right'], valueType: 'spacing' },
  mb: { properties: ['margin-bottom'], valueType: 'spacing' },
  ml: { properties: ['margin-left'], valueType: 'spacing' },

  // Sizing
  w: { properties: ['width'], valueType: 'size' },
  h: { properties: ['height'], valueType: 'size' },
  'min-w': { properties: ['min-width'], valueType: 'size' },
  'max-w': { properties: ['max-width'], valueType: 'size' },
  'min-h': { properties: ['min-height'], valueType: 'size' },
  'max-h': { properties: ['max-height'], valueType: 'size' },

  // Colors
  bg: { properties: ['background-color'], valueType: 'color' },
  text: { properties: ['color'], valueType: 'color' },
  border: { properties: ['border-color'], valueType: 'color' },

  // Border radius
  rounded: { properties: ['border-radius'], valueType: 'radius' },

  // Shadow
  shadow: { properties: ['box-shadow'], valueType: 'shadow' },

  // Layout
  gap: { properties: ['gap'], valueType: 'spacing' },
  items: { properties: ['align-items'], valueType: 'alignment' },
  justify: { properties: ['justify-content'], valueType: 'alignment' },

  // Typography
  font: { properties: ['font-size'], valueType: 'font-size' },
  weight: { properties: ['font-weight'], valueType: 'font-weight' },
  leading: { properties: ['line-height'], valueType: 'line-height' },

  // Ring (outline)
  ring: { properties: ['outline'], valueType: 'ring' },

  // Content
  content: { properties: ['content'], valueType: 'content' },
};

/** Display keyword map. */
const DISPLAY_MAP: Record<string, string> = {
  flex: 'flex',
  grid: 'grid',
  block: 'block',
  inline: 'inline',
  hidden: 'none',
};

// ─── Value Resolvers ───────────────────────────────────────────

/** Spacing scale: number → rem. 1=0.25rem, 2=0.5rem, 4=1rem, 8=2rem, etc. */
const SPACING_SCALE: Record<string, string> = {
  '0': '0',
  '0.5': '0.125rem',
  '1': '0.25rem',
  '1.5': '0.375rem',
  '2': '0.5rem',
  '2.5': '0.625rem',
  '3': '0.75rem',
  '3.5': '0.875rem',
  '4': '1rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '7': '1.75rem',
  '8': '2rem',
  '9': '2.25rem',
  '10': '2.5rem',
  '11': '2.75rem',
  '12': '3rem',
  '14': '3.5rem',
  '16': '4rem',
  '20': '5rem',
  '24': '6rem',
  '28': '7rem',
  '32': '8rem',
  '36': '9rem',
  '40': '10rem',
  '44': '11rem',
  '48': '12rem',
  '52': '13rem',
  '56': '14rem',
  '60': '15rem',
  '64': '16rem',
  '72': '18rem',
  '80': '20rem',
  '96': '24rem',
  auto: 'auto',
};

/** Border radius scale. */
const RADIUS_SCALE: Record<string, string> = {
  none: '0',
  sm: '0.125rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  '3xl': '1.5rem',
  full: '9999px',
};

/** Shadow scale. */
const SHADOW_SCALE: Record<string, string> = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  none: 'none',
};

/** Font size scale. */
const FONT_SIZE_SCALE: Record<string, string> = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
  '3xl': '1.875rem',
  '4xl': '2.25rem',
  '5xl': '3rem',
};

/** Font weight scale. */
const FONT_WEIGHT_SCALE: Record<string, string> = {
  thin: '100',
  extralight: '200',
  light: '300',
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
};

/** Line height scale. */
const LINE_HEIGHT_SCALE: Record<string, string> = {
  none: '1',
  tight: '1.25',
  snug: '1.375',
  normal: '1.5',
  relaxed: '1.625',
  loose: '2',
};

/** Alignment value map. */
const ALIGNMENT_MAP: Record<string, string> = {
  start: 'flex-start',
  end: 'flex-end',
  center: 'center',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
  stretch: 'stretch',
  baseline: 'baseline',
};

/** Size keywords for width/height. */
const SIZE_KEYWORDS: Record<string, string> = {
  full: '100%',
  svw: '100svw',
  dvw: '100dvw',
  min: 'min-content',
  max: 'max-content',
  fit: 'fit-content',
  auto: 'auto',
};

/** Height-axis property shorthands that should use vh units. */
const HEIGHT_AXIS_PROPERTIES = new Set(['h', 'min-h', 'max-h']);

/** Known color token namespaces — values that resolve to CSS custom properties. */
const COLOR_NAMESPACES = new Set([
  'primary',
  'secondary',
  'accent',
  'background',
  'foreground',
  'muted',
  'surface',
  'destructive',
  'danger',
  'success',
  'warning',
  'info',
  'border',
  'ring',
  'input',
  'card',
  'popover',
  'gray',
]);

// ─── Resolver ──────────────────────────────────────────────────

/**
 * Resolve a parsed shorthand into CSS declarations.
 */
export function resolveToken(parsed: ParsedShorthand): ResolvedStyle {
  const { property, value, pseudo } = parsed;

  // Display keywords
  const displayValue = DISPLAY_MAP[property];
  if (displayValue !== undefined && value === null) {
    return {
      declarations: [{ property: 'display', value: displayValue }],
      pseudo,
    };
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
    case 'raw':
      return value;
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

function resolveColor(value: string, property: string): string {
  // Check for dotted notation: 'primary.700' → 'var(--color-primary-700)'
  const dotIndex = value.indexOf('.');
  if (dotIndex !== -1) {
    const namespace = value.substring(0, dotIndex);
    const shade = value.substring(dotIndex + 1);
    if (COLOR_NAMESPACES.has(namespace)) {
      return `var(--color-${namespace}-${shade})`;
    }
    throw new TokenResolveError(
      `Unknown color token '${value}'. Known namespaces: ${[...COLOR_NAMESPACES].join(', ')}`,
      `${property}:${value}`,
    );
  }

  // Plain token name: 'background' → 'var(--color-background)'
  if (COLOR_NAMESPACES.has(value)) {
    return `var(--color-${value})`;
  }

  // Transparent, inherit, etc.
  const cssKeywords = new Set(['transparent', 'inherit', 'currentColor', 'initial', 'unset']);
  if (cssKeywords.has(value)) {
    return value;
  }

  throw new TokenResolveError(
    `Unknown color token '${value}'. Use a design token name (e.g. 'primary', 'background') or 'primary.700' for shades.`,
    `${property}:${value}`,
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

  throw new TokenResolveError(
    `Invalid size value '${value}' for '${property}'. Use a spacing scale number or keyword (full, screen, min, max, fit, auto).`,
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

/** Ring values: number → outline shorthand with ring color token. */
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

/** Content keywords. */
const CONTENT_MAP: Record<string, string> = {
  empty: "''",
  none: 'none',
};

function resolveContent(value: string, property: string): string {
  const mapped = CONTENT_MAP[value];
  if (mapped !== undefined) return mapped;

  throw new TokenResolveError(
    `Invalid content value '${value}' for '${property}'. Use: ${Object.keys(CONTENT_MAP).join(', ')}`,
    `${property}:${value}`,
  );
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
  return name in PROPERTY_MAP || name in DISPLAY_MAP;
}

/**
 * Check if a color token is valid.
 */
export function isValidColorToken(value: string): boolean {
  const dotIndex = value.indexOf('.');
  if (dotIndex !== -1) {
    return COLOR_NAMESPACES.has(value.substring(0, dotIndex));
  }
  return COLOR_NAMESPACES.has(value);
}
