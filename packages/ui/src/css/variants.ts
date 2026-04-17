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
import { css } from './css';
import type { StrictBlockValue, StyleBlock } from './style-block';
import { isToken } from './token';

/** A single block value: either token-string entries or a StyleBlock object. */
type BlockValue = StyleEntry[] | StyleBlock;

// ─── Types ──────────────────────────────────────────────────────

/**
 * A record of variant names to their possible values.
 *
 * Each option value is either a style-entry array or a StyleBlock object. Both
 * shapes are accepted transiently during migration from the token-string API.
 * Only the keys (variant names and option names) drive type inference; values
 * are checked at runtime.
 */
type VariantDefinitions = Record<string, Record<string, unknown[] | StyleBlock>>;

/** Extract the variant props type from a variant definitions object. */
export type VariantProps<V extends VariantDefinitions> = {
  [K in keyof V]?: keyof V[K];
};

/** A compound variant rule: matches when all specified variant values are active. */
type CompoundVariant<V extends VariantDefinitions> = {
  [K in keyof V]?: keyof V[K];
} & { styles: BlockValue };

/** Configuration for the variants() function. */
export interface VariantsConfig<V extends VariantDefinitions> {
  /** Base styles applied to all variants. */
  base: BlockValue;
  /** Variant definitions: each key is a variant name, each value is a map of option to styles. */
  variants: V;
  /** Default variant values used when no override is provided. */
  defaultVariants?: { [K in keyof V]?: keyof V[K] };
  /** Compound variants: styles applied when multiple variant values match simultaneously. */
  compoundVariants?: CompoundVariant<V>[];
}

/**
 * Strict per-option validation: each option's object-form block must only use
 * known CSS properties / selector keys. Array-form options pass through.
 * Gets call-site type errors through generic inference where EPC alone misses.
 */
type StrictVariants<V extends VariantDefinitions> = {
  [K in keyof V]: {
    [O in keyof V[K]]: StrictBlockValue<V[K][O]>;
  };
};

/** The function returned by variants(). Takes optional variant props and returns a className string. */
export interface VariantFunction<V extends VariantDefinitions> {
  (props?: VariantProps<V>): string;
  /** @internal The extracted CSS for variant combinations compiled so far. */
  css: string;
}

// ─── Implementation ─────────────────────────────────────────────

/** Stable string for either an array of entries or an object block. */
function serializeBlockValue(value: BlockValue): string {
  if (Array.isArray(value)) {
    return value.map((s) => (typeof s === 'string' ? s : JSON.stringify(s))).join(',');
  }
  // Object block — sort keys, recurse on nested StyleBlock values.
  const keys = Object.keys(value).sort();
  return keys
    .map((key) => {
      const v = (value as Record<string, unknown>)[key];
      if (v != null && typeof v === 'object' && !Array.isArray(v) && !isToken(v)) {
        return `${key}:{${serializeBlockValue(v as StyleBlock)}}`;
      }
      return `${key}=${String(v)}`;
    })
    .join(';');
}

/**
 * Derive a deterministic file path key from the config structure.
 * This ensures that identical configs always produce the same class names.
 */
function deriveConfigKey(config: VariantsConfig<VariantDefinitions>): string {
  const parts: string[] = [];

  parts.push(serializeBlockValue(config.base));

  // Serialize variant definitions (sorted by variant name for stability)
  const variantNames = Object.keys(config.variants).sort();
  for (const variantName of variantNames) {
    const options = config.variants[variantName];
    if (!options) continue;
    const optionNames = Object.keys(options).sort();
    for (const optionName of optionNames) {
      const styles = options[optionName];
      if (!styles) continue;
      parts.push(`${variantName}:${optionName}=${serializeBlockValue(styles as BlockValue)}`);
    }
  }

  return `__variants__${parts.join('|')}`;
}

/** Is a block value "empty" — has no styles to emit? */
function isEmptyBlock(value: BlockValue): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return Object.keys(value).length === 0;
}

/**
 * Create a typed variant function from a config object.
 *
 * Variant option CSS is compiled lazily on first use — only the base styles
 * are compiled eagerly. This ensures unused variant options never produce CSS,
 * reducing SSR response size for pages that use a subset of available variants.
 *
 * @param config - Variant configuration (base, variants, defaultVariants, compoundVariants).
 * @returns A function that accepts variant props and returns a className string.
 */
export function variants<V extends VariantDefinitions>(
  config: VariantsConfig<V> & { variants: StrictVariants<V> },
): VariantFunction<V> {
  const { base, variants: variantDefs, defaultVariants, compoundVariants } = config;
  const filePath = deriveConfigKey(config as VariantsConfig<VariantDefinitions>);

  // Eagerly compile base styles (always used when the variant function is called)
  const baseResult = css({ base } as Record<string, BlockValue>, filePath);

  // Lazy caches for variant options and compound variants
  const variantCache = new Map<string, { className: string; css: string }>();

  // Store raw config for lazy compilation
  const variantStyles: Record<string, Record<string, BlockValue>> = {};
  for (const [variantName, options] of Object.entries(variantDefs)) {
    variantStyles[variantName] = {};
    for (const [optionName, styles] of Object.entries(options as Record<string, BlockValue>)) {
      if (!isEmptyBlock(styles)) {
        variantStyles[variantName][optionName] = styles;
      }
    }
  }

  const compoundCache = new Map<number, { className: string; css: string }>();

  /** Lazily compile a variant option, returning its className. */
  function ensureVariantOption(variantName: string, optionName: string): string | undefined {
    const cacheKey = `${variantName}::${optionName}`;
    const cached = variantCache.get(cacheKey);
    if (cached) return cached.className;

    const styles = variantStyles[variantName]?.[optionName];
    if (!styles) return undefined;

    const blockName = cacheKey;
    const result = css({ [blockName]: styles } as Record<string, BlockValue>, filePath);
    const className = (result as Record<string, string>)[blockName];
    if (className) {
      variantCache.set(cacheKey, { className, css: result.css });
      return className;
    }
    return undefined;
  }

  /** Lazily compile a compound variant, returning its className if conditions match. */
  function ensureCompoundVariant(
    index: number,
    compound: CompoundVariant<VariantDefinitions>,
    resolved: Record<string, string>,
  ): string | undefined {
    const { styles, ...conditions } = compound;
    const matches = Object.entries(conditions).every(
      ([key, value]) => resolved[key] === String(value),
    );
    if (!matches) return undefined;

    const cached = compoundCache.get(index);
    if (cached) return cached.className;

    if (isEmptyBlock(styles as BlockValue)) return undefined;

    const blockName = `compound_${index}`;
    const result = css(
      { [blockName]: styles as BlockValue } as Record<string, BlockValue>,
      filePath,
    );
    const className = (result as Record<string, string>)[blockName];
    if (className) {
      compoundCache.set(index, { className, css: result.css });
      return className;
    }
    return undefined;
  }

  // The variant selector function
  const fn = (props?: VariantProps<V>): string => {
    const classNames: string[] = [];

    // 1. Add base class
    const baseClassName = baseResult.base;
    if (baseClassName) {
      classNames.push(baseClassName);
    }

    // 2. Resolve effective variant values (merge defaults with overrides)
    const resolved: Record<string, string> = {};
    if (defaultVariants) {
      for (const [key, value] of Object.entries(defaultVariants)) {
        if (value !== undefined) {
          resolved[key] = String(value);
        }
      }
    }
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value !== undefined) {
          resolved[key] = String(value);
        }
      }
    }

    // 3. Add variant classes (lazily compiled)
    for (const [variantName, optionName] of Object.entries(resolved)) {
      const className = ensureVariantOption(variantName, optionName);
      if (className) {
        classNames.push(className);
      }
    }

    // 4. Add compound variant classes (lazily compiled)
    if (compoundVariants) {
      for (let i = 0; i < compoundVariants.length; i++) {
        const compound = compoundVariants[i];
        if (!compound) continue;
        const className = ensureCompoundVariant(
          i,
          compound as CompoundVariant<VariantDefinitions>,
          resolved,
        );
        if (className) {
          classNames.push(className);
        }
      }
    }

    return classNames.join(' ');
  };

  // Attach CSS as a getter that returns the aggregate of base + all compiled options
  Object.defineProperty(fn, 'css', {
    get() {
      const parts: string[] = [];
      if (baseResult.css) parts.push(baseResult.css);
      for (const entry of variantCache.values()) {
        if (entry.css) parts.push(entry.css);
      }
      for (const entry of compoundCache.values()) {
        if (entry.css) parts.push(entry.css);
      }
      return parts.join('\n');
    },
    enumerable: false,
    configurable: false,
  });

  return fn as VariantFunction<V>;
}
