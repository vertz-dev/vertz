/**
 * Extracts string-valued property names from CSSStyleDeclaration.
 * Filters out methods (getPropertyValue, item, etc.), numeric properties (length),
 * and non-string properties (parentRule). Uses Extract<keyof, string> to exclude
 * numeric index signatures.
 */
type CSSPropertyName = {
  [K in Extract<keyof CSSStyleDeclaration, string>]: CSSStyleDeclaration[K] extends string
    ? K
    : never;
}[Extract<keyof CSSStyleDeclaration, string>];

/**
 * CSS properties type for the style prop, derived from CSSStyleDeclaration.
 * Provides autocomplete for all CSS properties the browser supports.
 *
 * - All properties accept string | number (numeric values get auto-px at runtime)
 * - CSS custom properties (--*) are supported via template literal index signature
 * - Stays current with whatever TypeScript version the developer uses
 */
export type CSSProperties = {
  [K in CSSPropertyName]?: string | number;
} & {
  [key: `--${string}`]: string | number;
};
