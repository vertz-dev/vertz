/**
 * Shared CSS token lookup tables.
 *
 * This is the single source of truth for all CSS token resolution data.
 * These tables are consumed by:
 *   1. packages/ui/src/css/token-resolver.ts (runtime)
 *   2. packages/ui-compiler/src/transformers/css-transformer.ts (compiler)
 *   3. packages/ui-compiler/src/css-extraction/extractor.ts (extraction)
 *
 * DO NOT duplicate these tables elsewhere. If you need a new token,
 * add it here and all consumers will pick it up automatically.
 */

// ─── Property Map ──────────────────────────────────────────────

export interface PropertyMapping {
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

export const PROPERTY_MAP: Record<string, PropertyMapping> = {
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

  // Colors (text, border, bg are multi-mode — resolved in resolveToken)
  bg: { properties: ['background-color'], valueType: 'color' },
  text: { properties: ['color'], valueType: 'color' },
  border: { properties: ['border-color'], valueType: 'color' },

  // Border width (directional)
  'border-r': { properties: ['border-right-width'], valueType: 'raw' },
  'border-l': { properties: ['border-left-width'], valueType: 'raw' },
  'border-t': { properties: ['border-top-width'], valueType: 'raw' },
  'border-b': { properties: ['border-bottom-width'], valueType: 'raw' },

  // Border radius
  rounded: { properties: ['border-radius'], valueType: 'radius' },

  // Shadow
  shadow: { properties: ['box-shadow'], valueType: 'shadow' },

  // Layout
  gap: { properties: ['gap'], valueType: 'spacing' },
  items: { properties: ['align-items'], valueType: 'alignment' },
  justify: { properties: ['justify-content'], valueType: 'alignment' },
  'grid-cols': { properties: ['grid-template-columns'], valueType: 'raw' },

  // Typography
  font: { properties: ['font-size'], valueType: 'font-size' },
  weight: { properties: ['font-weight'], valueType: 'font-weight' },
  leading: { properties: ['line-height'], valueType: 'line-height' },
  tracking: { properties: ['letter-spacing'], valueType: 'raw' },

  // Ring (outline)
  ring: { properties: ['outline'], valueType: 'ring' },

  // Misc properties
  cursor: { properties: ['cursor'], valueType: 'raw' },
  transition: { properties: ['transition'], valueType: 'raw' },
  resize: { properties: ['resize'], valueType: 'raw' },
  opacity: { properties: ['opacity'], valueType: 'raw' },
  inset: { properties: ['inset'], valueType: 'raw' },
  z: { properties: ['z-index'], valueType: 'raw' },

  // Content
  content: { properties: ['content'], valueType: 'content' },
};

// ─── Keyword Map ───────────────────────────────────────────────

/** A single CSS property-value pair. */
export interface CSSDeclarationEntry {
  property: string;
  value: string;
}

/** Keyword map -- single keywords that resolve to one or more declarations. */
export const KEYWORD_MAP: Record<string, CSSDeclarationEntry[]> = {
  // Display
  flex: [{ property: 'display', value: 'flex' }],
  grid: [{ property: 'display', value: 'grid' }],
  block: [{ property: 'display', value: 'block' }],
  inline: [{ property: 'display', value: 'inline' }],
  hidden: [{ property: 'display', value: 'none' }],
  'inline-flex': [{ property: 'display', value: 'inline-flex' }],

  // Flex utilities
  'flex-1': [{ property: 'flex', value: '1 1 0%' }],
  'flex-col': [{ property: 'flex-direction', value: 'column' }],
  'flex-row': [{ property: 'flex-direction', value: 'row' }],
  'flex-wrap': [{ property: 'flex-wrap', value: 'wrap' }],
  'flex-nowrap': [{ property: 'flex-wrap', value: 'nowrap' }],

  // Position
  fixed: [{ property: 'position', value: 'fixed' }],
  absolute: [{ property: 'position', value: 'absolute' }],
  relative: [{ property: 'position', value: 'relative' }],
  sticky: [{ property: 'position', value: 'sticky' }],

  // Text
  uppercase: [{ property: 'text-transform', value: 'uppercase' }],
  lowercase: [{ property: 'text-transform', value: 'lowercase' }],
  capitalize: [{ property: 'text-transform', value: 'capitalize' }],

  // Outline
  'outline-none': [{ property: 'outline', value: 'none' }],
};

/**
 * Display-only keyword map. Used by the compiler for quick display keyword
 * lookup without processing the full KEYWORD_MAP.
 */
export const DISPLAY_MAP: Record<string, string> = {
  flex: 'flex',
  grid: 'grid',
  block: 'block',
  inline: 'inline',
  hidden: 'none',
  'inline-flex': 'inline-flex',
};

// ─── Value Scales ──────────────────────────────────────────────

/** Spacing scale: number -> rem. 1=0.25rem, 2=0.5rem, 4=1rem, 8=2rem, etc. */
export const SPACING_SCALE: Record<string, string> = {
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
export const RADIUS_SCALE: Record<string, string> = {
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
export const SHADOW_SCALE: Record<string, string> = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  none: 'none',
};

/** Font size scale. */
export const FONT_SIZE_SCALE: Record<string, string> = {
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
export const FONT_WEIGHT_SCALE: Record<string, string> = {
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
export const LINE_HEIGHT_SCALE: Record<string, string> = {
  none: '1',
  tight: '1.25',
  snug: '1.375',
  normal: '1.5',
  relaxed: '1.625',
  loose: '2',
};

/** Alignment value map. */
export const ALIGNMENT_MAP: Record<string, string> = {
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
export const SIZE_KEYWORDS: Record<string, string> = {
  full: '100%',
  svw: '100svw',
  dvw: '100dvw',
  min: 'min-content',
  max: 'max-content',
  fit: 'fit-content',
  auto: 'auto',
  // Named max-width breakpoints (Tailwind-compatible).
  xs: '20rem',
  sm: '24rem',
  md: '28rem',
  lg: '32rem',
  xl: '36rem',
  '2xl': '42rem',
  '3xl': '48rem',
  '4xl': '56rem',
  '5xl': '64rem',
  '6xl': '72rem',
  '7xl': '80rem',
};

/** Height-axis property shorthands that should use vh units. */
export const HEIGHT_AXIS_PROPERTIES: ReadonlySet<string> = new Set(['h', 'min-h', 'max-h']);

/** Known color token namespaces -- values that resolve to CSS custom properties. */
export const COLOR_NAMESPACES: ReadonlySet<string> = new Set([
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
  'primary-foreground',
  'secondary-foreground',
  'accent-foreground',
  'destructive-foreground',
  'muted-foreground',
  'card-foreground',
  'popover-foreground',
]);

/** CSS color keywords that pass through without token resolution. */
export const CSS_COLOR_KEYWORDS: ReadonlySet<string> = new Set([
  'transparent',
  'inherit',
  'currentColor',
  'initial',
  'unset',
  'white',
  'black',
]);

/** Content keywords. */
export const CONTENT_MAP: Record<string, string> = {
  empty: "''",
  none: 'none',
};

// ─── Pseudo Selectors ──────────────────────────────────────────

/** Supported pseudo-state prefixes. */
export const PSEUDO_PREFIXES: ReadonlySet<string> = new Set([
  'hover',
  'focus',
  'focus-visible',
  'active',
  'disabled',
  'first',
  'last',
]);

/** Map pseudo shorthand names to CSS pseudo-selectors. */
export const PSEUDO_MAP: Record<string, string> = {
  hover: ':hover',
  focus: ':focus',
  'focus-visible': ':focus-visible',
  active: ':active',
  disabled: ':disabled',
  first: ':first-child',
  last: ':last-child',
};
