/**
 * Convert a camelCase CSS property name to kebab-case.
 * Handles vendor prefixes: WebkitX → -webkit-x, MozX → -moz-x, msX → -ms-x.
 */
function camelToKebab(prop: string): string {
  // ms prefix is lowercase in camelCase (unlike Webkit/Moz), needs leading dash
  const third = prop[2];
  if (prop.startsWith('ms') && third !== undefined && third >= 'A' && third <= 'Z') {
    prop = `Ms${prop.slice(2)}`;
  }
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/**
 * CSS properties that accept unitless numeric values (no 'px' suffix).
 * Matches React's behavior — see react-dom/src/shared/CSSProperty.js.
 */
const UNITLESS = new Set([
  'animationIterationCount',
  'aspectRatio',
  'borderImageOutset',
  'borderImageSlice',
  'borderImageWidth',
  'boxFlex',
  'boxFlexGroup',
  'boxOrdinalGroup',
  'columnCount',
  'columns',
  'flex',
  'flexGrow',
  'flexPositive',
  'flexShrink',
  'flexNegative',
  'flexOrder',
  'gridArea',
  'gridRow',
  'gridRowEnd',
  'gridRowSpan',
  'gridRowStart',
  'gridColumn',
  'gridColumnEnd',
  'gridColumnSpan',
  'gridColumnStart',
  'fontWeight',
  'lineClamp',
  'lineHeight',
  'opacity',
  'order',
  'orphans',
  'tabSize',
  'widows',
  'zIndex',
  'zoom',
  'fillOpacity',
  'floodOpacity',
  'stopOpacity',
  'strokeDasharray',
  'strokeDashoffset',
  'strokeMiterlimit',
  'strokeOpacity',
  'strokeWidth',
  'scale',
]);

/**
 * Format a CSS value — append 'px' for non-zero numeric values on dimensional properties.
 */
function formatValue(key: string, value: string | number): string {
  if (typeof value !== 'number' || value === 0 || key.startsWith('--') || UNITLESS.has(key)) {
    return String(value);
  }
  return `${value}px`;
}

/**
 * Convert a style object with camelCase properties to a CSS string.
 *
 * - camelCase → kebab-case (e.g., backgroundColor → background-color)
 * - Vendor prefixes: WebkitTransform → -webkit-transform, msTransform → -ms-transform
 * - Numeric values get 'px' suffix for dimensional properties (not unitless ones)
 * - Zero values never get 'px'
 * - CSS custom properties (--*) pass through as-is, no auto-px
 * - null/undefined values are skipped
 */
/**
 * Compiler-internal alias for styleObjectToString.
 * Used in generated code to convert style objects to CSS strings.
 */
export { styleObjectToString as __styleStr };

export function styleObjectToString(
  style: Record<string, string | number | null | undefined>,
): string {
  const parts: string[] = [];
  for (const key of Object.keys(style)) {
    const value = style[key];
    if (value == null) continue;

    const cssKey = key.startsWith('--') ? key : camelToKebab(key);
    parts.push(`${cssKey}: ${formatValue(key, value)}`);
  }
  return parts.join('; ');
}
