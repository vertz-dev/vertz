/**
 * variants() — Typed component variant API.
 *
 * Builds on the css() infrastructure to define component variants
 * with full TypeScript inference for variant names and values.
 *
 * Usage:
 * ```ts
 * const button = variants({
 *   base: ['flex', 'font:medium', 'rounded:md'],
 *   variants: {
 *     intent: {
 *       primary: ['bg:primary.600', 'text:foreground'],
 *       secondary: ['bg:background', 'text:muted'],
 *     },
 *     size: {
 *       sm: ['text:xs', 'h:8'],
 *       md: ['text:sm', 'h:10'],
 *     },
 *   },
 *   defaultVariants: { intent: 'primary', size: 'md' },
 *   compoundVariants: [
 *     { intent: 'primary', size: 'sm', styles: ['px:2'] },
 *   ],
 * });
 *
 * // Returns a className string
 * const className = button({ intent: 'secondary', size: 'sm' });
 * const defaultClassName = button(); // uses defaultVariants
 * ```
 */
import type { StyleEntry } from './css';
/** A record of variant names to their possible values (each value maps to style entries). */
type VariantDefinitions = Record<string, Record<string, StyleEntry[]>>;
/** Extract the variant props type from a variant definitions object. */
export type VariantProps<V extends VariantDefinitions> = {
  [K in keyof V]?: keyof V[K];
};
/** A compound variant rule: matches when all specified variant values are active. */
type CompoundVariant<V extends VariantDefinitions> = {
  [K in keyof V]?: keyof V[K];
} & {
  styles: StyleEntry[];
};
/** Configuration for the variants() function. */
export interface VariantsConfig<V extends VariantDefinitions> {
  /** Base styles applied to all variants. */
  base: StyleEntry[];
  /** Variant definitions: each key is a variant name, each value is a map of option to styles. */
  variants: V;
  /** Default variant values used when no override is provided. */
  defaultVariants?: {
    [K in keyof V]?: keyof V[K];
  };
  /** Compound variants: styles applied when multiple variant values match simultaneously. */
  compoundVariants?: CompoundVariant<V>[];
}
/** The function returned by variants(). Takes optional variant props and returns a className string. */
export interface VariantFunction<V extends VariantDefinitions> {
  (props?: VariantProps<V>): string;
  /** The extracted CSS for all variant combinations. */
  css: string;
}
/**
 * Create a typed variant function from a config object.
 *
 * @param config - Variant configuration (base, variants, defaultVariants, compoundVariants).
 * @returns A function that accepts variant props and returns a className string.
 */
export declare function variants<V extends VariantDefinitions>(
  config: VariantsConfig<V>,
): VariantFunction<V>;
//# sourceMappingURL=variants.d.ts.map
