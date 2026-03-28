/**
 * HTML-aware CSS filtering for SSR responses.
 *
 * Eliminates unused CSS (e.g., eagerly compiled theme component styles)
 * by matching CSS class selectors against classes present in the rendered HTML.
 *
 * @see https://github.com/vertz-dev/vertz/issues/1979
 */

/**
 * Extract all class names from rendered HTML.
 * Matches class="..." and className="..." attributes.
 */
function extractClassNamesFromHTML(html: string): Set<string> {
  const classes = new Set<string>();
  // Match class="..." or className="..."
  const attrRegex = /\bclass(?:Name)?="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(html)) !== null) {
    const value = match[1]!;
    for (const cls of value.split(/\s+/)) {
      if (cls) classes.add(cls);
    }
  }
  return classes;
}

/**
 * Extract class selectors from a CSS string.
 * Returns the set of class names (without the leading dot) referenced by selectors.
 */
function extractClassSelectorsFromCSS(css: string): Set<string> {
  const selectors = new Set<string>();
  // Match class selectors: .className (may be followed by pseudo, space, {, etc.)
  const selectorRegex = /\.([\w-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = selectorRegex.exec(css)) !== null) {
    selectors.add(match[1]!);
  }
  return selectors;
}

/**
 * Check if a CSS string is a standalone @keyframes block.
 */
function isKeyframesBlock(css: string): boolean {
  return /^\s*@keyframes\s/.test(css);
}

/**
 * Check if a CSS string contains ONLY class-based rules.
 * If it has non-class selectors (element, :root, *, @font-face, etc.),
 * it should always be kept.
 *
 * @keyframes blocks and @media/@container wrappers are stripped before checking,
 * since @keyframes are dead if the class rules referencing them are removed (#1988).
 */
function hasOnlyClassSelectors(css: string): boolean {
  // Strip comments
  let stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Strip @keyframes blocks entirely (they're dead if referencing rules are removed)
  stripped = stripped.replace(/@keyframes\s+[\w-]+\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '');
  // Strip @media / @container / @supports / @layer wrappers
  stripped = stripped.replace(/@[\w-]+\s*\([^)]*\)\s*\{/g, '').replace(/^\s*\}/gm, '');

  // Find all selector-like patterns before { blocks
  const ruleRegex = /([^{}]+)\{/g;
  let match: RegExpExecArray | null;
  let foundAnySelector = false;

  while ((match = ruleRegex.exec(stripped)) !== null) {
    const selector = match[1]!.trim();
    if (!selector) continue;
    foundAnySelector = true;

    // If the selector does NOT start with a class selector, it's a non-class rule
    // (element selector, :root, *, etc.)
    if (!selector.startsWith('.')) {
      return false;
    }
  }

  return foundAnySelector;
}

/**
 * Filter CSS strings to only include those whose class selectors appear in the HTML.
 *
 * Two-pass filtering (#1988):
 * 1. Class-based CSS: kept only if at least one class selector appears in the HTML.
 * 2. Standalone @keyframes: kept only if a surviving CSS string references that
 *    keyframe name in an `animation` or `animation-name` property.
 *
 * Non-class rules (:root, body, *, @font-face) are always kept.
 *
 * @param html - The rendered HTML string.
 * @param cssStrings - Array of CSS strings (each may contain multiple rules).
 * @returns Filtered array of CSS strings.
 */
export function filterCSSByHTML(html: string, cssStrings: string[]): string[] {
  if (cssStrings.length === 0 || !html) return [];

  const htmlClasses = extractClassNamesFromHTML(html);

  // Pass 1: partition into kept (global/used-class), standalone @keyframes, and dropped
  const kept: string[] = [];
  const pendingKeyframes: Array<{ css: string; name: string }> = [];

  for (const css of cssStrings) {
    // Standalone @keyframes blocks are deferred to pass 2
    if (isKeyframesBlock(css)) {
      const nameMatch = /@keyframes\s+([\w-]+)/.exec(css);
      if (nameMatch) {
        pendingKeyframes.push({ css, name: nameMatch[1]! });
      }
      continue;
    }

    // Non-class rules are always kept (resets, :root vars, etc.)
    if (!hasOnlyClassSelectors(css)) {
      kept.push(css);
      continue;
    }

    // Class-only rules: keep if any selector class is in the HTML
    const cssClasses = extractClassSelectorsFromCSS(css);
    let used = false;
    for (const cls of cssClasses) {
      if (htmlClasses.has(cls)) {
        used = true;
        break;
      }
    }
    if (used) kept.push(css);
  }

  // Pass 2: keep @keyframes only if a surviving CSS string references the name
  if (pendingKeyframes.length > 0) {
    const survivingCss = kept.join('\n');
    for (const kf of pendingKeyframes) {
      // Check if the keyframe name appears in an animation property of surviving CSS
      if (survivingCss.includes(kf.name)) {
        kept.push(kf.css);
      }
    }
  }

  return kept;
}
