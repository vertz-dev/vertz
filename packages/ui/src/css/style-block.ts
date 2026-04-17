import type { CamelCSSPropertyName } from './css-properties';

export type StyleDeclarations = {
  [K in CamelCSSPropertyName]?: string | number;
} & {
  [K in `-${string}` | `Webkit${string}` | `Moz${string}` | `Ms${string}`]?: string | number;
};

export type SelectorKey = `&${string}` | `@${string}`;

export type StyleBlock = StyleDeclarations & {
  [K in SelectorKey]?: StyleBlock;
};

/**
 * Validator that keeps known CSS-property / selector keys as-is and converts
 * unknown keys to `never`. Passing an object with a typo like `bacgroundColor`
 * produces a type whose property is `never`; the original string value is then
 * not assignable, so the compiler reports the typo at the call site.
 *
 * Used by `css()` and `variants()` to get call-site type errors through the
 * generic inference path, where normal excess-property checking would be
 * bypassed.
 */
export type StrictStyleBlock<T> = {
  [K in keyof T]?: K extends `&${string}` | `@${string}`
    ? StrictStyleBlock<T[K]>
    : K extends
          | CamelCSSPropertyName
          | `-${string}`
          | `Webkit${string}`
          | `Moz${string}`
          | `Ms${string}`
      ? string | number
      : never;
};

/**
 * Validate a css() / variants() block value — accepts legacy token-string
 * arrays unchanged, runs `StrictStyleBlock` on object-form blocks. Written as
 * a naked-parameter conditional so it distributes over unions like
 * `StyleEntry[] | StyleBlock` (avoids collapsing the array side to `never[]`).
 */
export type StrictBlockValue<V> = V extends readonly unknown[] ? V : StrictStyleBlock<V>;
