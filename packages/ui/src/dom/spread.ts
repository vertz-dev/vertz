import { deferredDomEffect } from '../runtime/signal';
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
 * IDL properties where setAttribute doesn't control the displayed state —
 * only direct property assignment (el.prop = value) works correctly.
 * Matches the IDL_PROPERTIES map in the JSX transformer.
 */
const IDL_PROPS: Record<string, ReadonlySet<string>> = {
  INPUT: new Set(['value', 'checked']),
  SELECT: new Set(['value']),
  TEXTAREA: new Set(['value']),
};

/**
 * Apply a spread props object to a DOM element.
 *
 * Compiler output target for JSX spread attributes on intrinsic elements:
 *   <button {...rest} /> → __spread(el, rest)
 *   <button {...rest} /> → __spread(el, rest, __props)  (inside components)
 *
 * When `source` is provided (the original __props with getter descriptors),
 * keys that have getters on source get reactive effects (like __attr/__prop).
 * Keys without getters are set one-shot from the `props` rest object.
 *
 * Handles event handlers (on*), ref, style, class/className, htmlFor,
 * SVG attribute normalization, and standard HTML attributes.
 * Uses replace (not merge) semantics — last-wins, matching source order.
 */
export function __spread(
  el: Element,
  props: Record<string, unknown>,
  source?: Record<string, unknown>,
): void {
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

    // Check if source has a getter for this key — if so, set up reactive effect
    const descriptor = source && Object.getOwnPropertyDescriptor(source, key);
    if (descriptor?.get) {
      const getter = descriptor.get;
      const isIdl = IDL_PROPS[el.tagName]?.has(key);
      if (isIdl) {
        // Reactive IDL property (value, checked)
        deferredDomEffect(() => {
          const v = getter();
          if (v == null) {
            Reflect.set(el, key, typeof Reflect.get(el, key) === 'boolean' ? false : '');
          } else {
            Reflect.set(el, key, v);
          }
        });
      } else {
        // Reactive attribute
        const attrName = PROP_ALIASES[key] ?? key;
        const finalName = isSvg ? normalizeSVGAttr(attrName) : attrName;
        deferredDomEffect(() => {
          const v = getter();
          if (v == null || v === false) {
            el.removeAttribute(finalName);
          } else if (v === true) {
            el.setAttribute(finalName, '');
          } else if (finalName === 'style' && typeof v === 'object') {
            el.setAttribute('style', styleObjectToString(v as Record<string, string | number>));
          } else {
            el.setAttribute(finalName, String(v));
          }
        });
      }
      continue;
    }

    // --- One-shot path (no reactive source for this key) ---

    // Skip null/undefined/false values (but not for IDL boolean props like `checked`)
    if (value == null || value === false) {
      // For IDL boolean props, false means "uncheck" — set via property assignment
      if (value === false && IDL_PROPS[el.tagName]?.has(key)) {
        Reflect.set(el, key, false);
      }
      continue;
    }

    // IDL properties: direct property assignment instead of setAttribute
    // (setAttribute('value', x) only sets the default, not the displayed value)
    if (IDL_PROPS[el.tagName]?.has(key)) {
      Reflect.set(el, key, value);
      continue;
    }

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
