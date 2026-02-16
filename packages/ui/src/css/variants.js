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
import { css } from './css';

// ─── Implementation ─────────────────────────────────────────────
/**
 * Derive a deterministic file path key from the config structure.
 * This ensures that identical configs always produce the same class names.
 */
function deriveConfigKey(config) {
  const parts = [];
  // Serialize base styles
  for (const entry of config.base) {
    parts.push(typeof entry === 'string' ? entry : JSON.stringify(entry));
  }
  // Serialize variant definitions (sorted by variant name for stability)
  const variantNames = Object.keys(config.variants).sort();
  for (const variantName of variantNames) {
    const options = config.variants[variantName];
    if (!options) continue;
    const optionNames = Object.keys(options).sort();
    for (const optionName of optionNames) {
      const styles = options[optionName];
      if (!styles) continue;
      parts.push(
        `${variantName}:${optionName}=${styles.map((s) => (typeof s === 'string' ? s : JSON.stringify(s))).join(',')}`,
      );
    }
  }
  return `__variants__${parts.join('|')}`;
}
/**
 * Create a typed variant function from a config object.
 *
 * @param config - Variant configuration (base, variants, defaultVariants, compoundVariants).
 * @returns A function that accepts variant props and returns a className string.
 */
export function variants(config) {
  const { base, variants: variantDefs, defaultVariants, compoundVariants } = config;
  const filePath = deriveConfigKey(config);
  // Pre-compute: generate a css() block for the base styles
  const baseResult = base.length > 0 ? css({ base: base }, filePath) : { classNames: {}, css: '' };
  // Pre-compute: generate css() blocks for each variant value
  const variantResults = {};
  for (const [variantName, options] of Object.entries(variantDefs)) {
    variantResults[variantName] = {};
    for (const [optionName, styles] of Object.entries(options)) {
      if (styles.length > 0) {
        const blockName = `${variantName}_${optionName}`;
        const result = css({ [blockName]: styles }, filePath);
        const className = result.classNames[blockName];
        if (className) {
          variantResults[variantName][optionName] = {
            className,
            css: result.css,
          };
        }
      }
    }
  }
  // Pre-compute: generate css() blocks for compound variants
  const compoundResults = [];
  if (compoundVariants) {
    for (let i = 0; i < compoundVariants.length; i++) {
      const compound = compoundVariants[i];
      if (!compound) continue;
      const { styles, ...conditions } = compound;
      if (styles.length > 0) {
        const blockName = `compound_${i}`;
        const result = css({ [blockName]: styles }, filePath);
        const className = result.classNames[blockName];
        if (className) {
          compoundResults.push({
            conditions: conditions,
            className,
            css: result.css,
          });
        }
      }
    }
  }
  // Aggregate all CSS
  const allCss = [];
  if (baseResult.css) allCss.push(baseResult.css);
  for (const options of Object.values(variantResults)) {
    for (const result of Object.values(options)) {
      if (result.css) allCss.push(result.css);
    }
  }
  for (const result of compoundResults) {
    if (result.css) allCss.push(result.css);
  }
  // The variant selector function
  const fn = (props) => {
    const classNames = [];
    // 1. Add base class
    const baseClassName = baseResult.classNames.base;
    if (baseClassName) {
      classNames.push(baseClassName);
    }
    // 2. Resolve effective variant values (merge defaults with overrides)
    const resolved = {};
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
    // 3. Add variant classes
    for (const [variantName, optionName] of Object.entries(resolved)) {
      const variantGroup = variantResults[variantName];
      if (variantGroup) {
        const result = variantGroup[optionName];
        if (result) {
          classNames.push(result.className);
        }
      }
    }
    // 4. Add compound variant classes
    for (const compound of compoundResults) {
      const matches = Object.entries(compound.conditions).every(([key, value]) => {
        return resolved[key] === String(value);
      });
      if (matches) {
        classNames.push(compound.className);
      }
    }
    return classNames.join(' ');
  };
  // Attach the CSS as a property
  fn.css = allCss.join('\n');
  return fn;
}
//# sourceMappingURL=variants.js.map
