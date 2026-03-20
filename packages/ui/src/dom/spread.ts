import { styleObjectToString } from './style';
import { normalizeSVGAttr, SVG_NS } from './svg-tags';

/** Keys that are framework concepts and should not be set as DOM attributes. */
const SKIP_KEYS = new Set(['children', 'key']);

/** JSX prop name → DOM attribute name normalization. */
const PROP_ALIASES: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
};

/**
 * Apply a spread props object to a DOM element.
 *
 * Compiler output target for JSX spread attributes on intrinsic elements:
 *   <button {...rest} /> → __spread(el, rest)
 *
 * Handles event handlers (on*), ref, style, class/className, htmlFor,
 * SVG attribute normalization, and standard HTML attributes.
 * Uses replace (not merge) semantics — last-wins, matching source order.
 */
export function __spread(el: Element, props: Record<string, unknown>): void {
  const isSvg = el.namespaceURI === SVG_NS;

  for (const key of Object.keys(props)) {
    if (SKIP_KEYS.has(key)) continue;

    const value = props[key];

    // ref: { current: Element | null }
    if (key === 'ref') {
      if (value && typeof value === 'object' && 'current' in value) {
        (value as { current: unknown }).current = el;
      }
      continue;
    }

    // Event handlers: onClick → addEventListener('click', handler)
    // Full lowercase: onDblClick → dblclick (DOM events are case-sensitive)
    if (key.length > 2 && key.startsWith('on') && typeof value === 'function') {
      const eventName = key.slice(2).toLowerCase();
      el.addEventListener(eventName, value as EventListener);
      continue;
    }

    // Skip null/undefined/false values
    if (value == null || value === false) continue;

    // Normalize prop aliases (className → class, htmlFor → for)
    const attrName = PROP_ALIASES[key] ?? key;

    // Style: object → string conversion, string → direct set
    if (attrName === 'style') {
      if (typeof value === 'object') {
        el.setAttribute('style', styleObjectToString(value as Record<string, string | number>));
      } else {
        el.setAttribute('style', String(value));
      }
      continue;
    }

    // Boolean true → empty string attribute
    if (value === true) {
      el.setAttribute(attrName, '');
      continue;
    }

    // SVG attribute normalization (camelCase → hyphenated)
    const finalName = isSvg ? normalizeSVGAttr(attrName) : attrName;
    el.setAttribute(finalName, String(value));
  }
}
