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
 * Check if a CSS string contains ONLY class-based rules.
 * If it has non-class selectors (element, :root, *, @font-face, etc.),
 * it should always be kept.
 */
function hasOnlyClassSelectors(css: string): boolean {
  // Strip @media / @container wrappers to inspect the inner selectors
  // Also strip comments
  const stripped = css
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
    .replace(/@[\w-]+\s*\([^)]*\)\s*\{/g, '') // Remove @media/@container opening
    .replace(/^\s*\}/gm, ''); // Remove closing braces from stripped at-rules

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
 * For each CSS string:
 * - If it contains non-class selectors (element selectors, :root, *, @font-face),
 *   it's always kept (global resets, CSS variables, etc.).
 * - If it contains ONLY class-based selectors, it's kept only if at least one
 *   of its class names appears in the HTML.
 *
 * @param html - The rendered HTML string.
 * @param cssStrings - Array of CSS strings (each may contain multiple rules).
 * @returns Filtered array of CSS strings.
 */
export function filterCSSByHTML(html: string, cssStrings: string[]): string[] {
  if (cssStrings.length === 0 || !html) return [];

  const htmlClasses = extractClassNamesFromHTML(html);

  return cssStrings.filter((css) => {
    // Non-class rules are always kept (resets, :root vars, etc.)
    if (!hasOnlyClassSelectors(css)) {
      return true;
    }

    // Class-only rules: keep if any selector class is in the HTML
    const cssClasses = extractClassSelectorsFromCSS(css);
    for (const cls of cssClasses) {
      if (htmlClasses.has(cls)) return true;
    }
    return false;
  });
}
