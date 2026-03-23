/**
 * SSR AOT Runtime Helpers
 *
 * Lightweight runtime functions used by AOT-compiled SSR string-builder
 * functions. These are injected at the top of compiled output and called
 * inline during string concatenation.
 *
 * Design constraints:
 * - Must produce identical output to html-serializer.ts escapeHtml/escapeAttr
 * - Must be fast — called per-element, per-attribute during SSR
 * - No dependencies beyond this file
 */

// biome-ignore lint/suspicious/noExplicitAny: runtime helper accepts any renderable value
type Renderable = any;

/**
 * CSS properties that are unitless (numeric values should NOT get 'px' appended).
 * Based on React's unitless CSS properties list.
 */
const UNITLESS_PROPERTIES = new Set([
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
  'fontWeight',
  'gridArea',
  'gridColumn',
  'gridColumnEnd',
  'gridColumnSpan',
  'gridColumnStart',
  'gridRow',
  'gridRowEnd',
  'gridRowSpan',
  'gridRowStart',
  'lineClamp',
  'lineHeight',
  'opacity',
  'order',
  'orphans',
  'scale',
  'tabSize',
  'widows',
  'zIndex',
  'zoom',
]);

/**
 * Escape HTML text content. Matches escapeHtml() from html-serializer.ts exactly.
 *
 * Handles: null, undefined, false → '', true → 'true', numbers → string,
 * arrays → recursive join.
 */
export function __esc(value: Renderable): string {
  if (value == null || value === false) return '';
  if (value === true) return 'true';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(__esc).join('');
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Escape HTML attribute value. Matches escapeAttr() from html-serializer.ts exactly.
 */
export function __esc_attr(value: Renderable): string {
  const str = typeof value === 'string' ? value : String(value);
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Render a props object as an HTML attribute string for spread attributes.
 *
 * - Skips null/undefined/false values
 * - Skips event handlers (on* props)
 * - Maps className → class
 * - Boolean true → attribute name only (no value)
 * - Escapes string values
 */
export function __ssr_spread(props: Record<string, Renderable>): string {
  const parts: string[] = [];

  for (const key in props) {
    const value = props[key];

    // Skip null, undefined, false
    if (value == null || value === false) continue;

    // Skip event handlers (onClick, onSubmit, etc.)
    const third = key.charAt(2);
    if (
      key.length > 2 &&
      key.charAt(0) === 'o' &&
      key.charAt(1) === 'n' &&
      third >= 'A' &&
      third <= 'Z'
    ) {
      continue;
    }

    // Skip functions (refs, callbacks, etc.)
    if (typeof value === 'function') continue;

    // Skip React/Vertz internal props
    if (key === 'key' || key === 'ref' || key === 'children') continue;

    // Map JSX prop names → HTML attribute names
    const attrName = key === 'className' ? 'class' : key === 'htmlFor' ? 'for' : key;

    // Style objects → serialized CSS string
    if (key === 'style' && typeof value === 'object') {
      const css = __ssr_style_object(value as Record<string, Renderable>);
      if (css) {
        parts.push(` style="${__esc_attr(css)}"`);
      }
      continue;
    }

    // Boolean true → attribute name only
    if (value === true) {
      parts.push(` ${attrName}`);
      continue;
    }

    parts.push(` ${attrName}="${__esc_attr(value)}"`);
  }

  return parts.join('');
}

/**
 * Convert a camelCase CSS property name to kebab-case.
 *
 * Handles:
 * - Regular camelCase: backgroundColor → background-color
 * - Vendor prefixes: WebkitTransform → -webkit-transform
 * - ms prefix: msTransform → -ms-transform
 * - CSS custom properties: --primary → --primary (unchanged)
 */
function camelToKebab(prop: string): string {
  // CSS custom properties pass through
  if (prop.startsWith('--')) return prop;

  // ms prefix gets special treatment (lowercase)
  if (prop.startsWith('ms')) {
    return `-${prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
  }

  // Vendor prefixes start with uppercase (Webkit, Moz, O)
  // WebkitTransform → -webkit-transform (lowercase first char, add leading dash)
  const first = prop.charAt(0);
  if (first >= 'A' && first <= 'Z') {
    return `-${first.toLowerCase()}${prop.slice(1).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
  }

  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/**
 * Convert a style object to a CSS string.
 *
 * - camelCase → kebab-case
 * - Numeric values get 'px' appended for non-unitless properties
 * - Zero is never suffixed with 'px'
 * - Skips null, undefined, empty string values
 * - Preserves CSS custom properties and vendor prefixes
 */
export function __ssr_style_object(style: Record<string, Renderable>): string {
  const parts: string[] = [];

  for (const prop in style) {
    const value = style[prop];

    // Skip null, undefined, empty string
    if (value == null || value === '') continue;

    const cssProp = camelToKebab(prop);

    // Add px suffix for numeric values on pixel properties
    if (typeof value === 'number' && value !== 0 && !UNITLESS_PROPERTIES.has(prop)) {
      parts.push(`${cssProp}: ${value}px`);
    } else {
      parts.push(`${cssProp}: ${value}`);
    }
  }

  return parts.join('; ');
}
