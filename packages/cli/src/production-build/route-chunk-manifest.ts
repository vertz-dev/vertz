/**
 * Route Chunk Manifest Generator
 *
 * Parses the bundled entry file to extract route pattern → chunk filename
 * mappings. The route-splitting transformer converts static route imports
 * to dynamic `import("./chunk-HASH.js")` calls. This module reads the
 * built output to discover which chunks serve which routes.
 *
 * Uses a tokenizer that tracks brace nesting and `children:` blocks to
 * build full-path keys (e.g., `/dashboard/settings` instead of just
 * `/settings`), avoiding collisions when the same child key appears
 * under different parents.
 */

export interface RouteChunkManifest {
  /** Route pattern → array of chunk paths for that route. */
  routes: Record<string, string[]>;
}

/** Join parent and child route patterns, handling leading/trailing slashes. */
function joinPatterns(parent: string, child: string): string {
  if (!parent || parent === '/') return child;
  if (child === '/') return parent;
  return `${parent.replace(/\/$/, '')}/${child.replace(/^\//, '')}`;
}

/**
 * Skip past a quoted string starting at `i` (where `s[i]` is `"` or `'`).
 * Returns { value, end } or null if no closing quote is found.
 */
function extractQuotedString(s: string, i: number): { value: string; end: number } | null {
  const quote = s[i];
  if (quote !== '"' && quote !== "'") return null;
  let j = i + 1;
  while (j < s.length && s[j] !== quote) {
    if (s[j] === '\\') j++;
    j++;
  }
  if (j >= s.length) return null;
  return { value: s.slice(i + 1, j), end: j + 1 };
}

/**
 * Extract route → chunk mappings from a bundled entry file's content.
 *
 * Scans for patterns like:
 *   "/path": { component: () => import("./chunk-HASH.js").then(...) }
 *
 * Tracks brace nesting and `children:` blocks so that child routes are
 * recorded with their full path (e.g., `/dashboard/settings`).
 *
 * @param entryContent - The full text of the bundled client entry file.
 * @param assetPrefix - URL prefix for chunk paths (e.g., "/assets").
 */
export function generateRouteChunkManifest(
  entryContent: string,
  assetPrefix: string,
): RouteChunkManifest {
  const routes: Record<string, string[]> = {};
  const s = entryContent;
  const len = s.length;

  // Parent stack for nested children blocks.
  // Each entry records the parent path and the brace depth at entry time.
  const parentStack: { parentPath: string; braceDepthAtEntry: number }[] = [];
  let currentParent = '';
  let braceDepth = 0;

  // Last route key seen — used to associate with the next component import.
  let lastRouteKeyFullPath: string | null = null;

  let i = 0;
  while (i < len) {
    const ch = s[i];

    // Track braces — braces inside .then((m) => ({...})) open and close
    // symmetrically, so structural route nesting is preserved.
    if (ch === '{') {
      braceDepth++;
      i++;
      continue;
    }
    if (ch === '}') {
      braceDepth--;
      // Pop parent stack when we exit the brace level where we entered
      while (parentStack.length > 0) {
        const top = parentStack[parentStack.length - 1];
        if (!top || top.braceDepthAtEntry < braceDepth) break;
        parentStack.pop();
        currentParent = top.parentPath;
      }
      i++;
      continue;
    }

    // Handle quoted strings
    if (ch === '"' || ch === "'") {
      const extracted = extractQuotedString(s, i);
      if (!extracted) {
        i++;
        continue;
      }

      const value = extracted.value;
      i = extracted.end;

      // Check if this looks like a route key: starts with / and is followed by :
      if (value.startsWith('/')) {
        let j = i;
        while (j < len && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n' || s[j] === '\r')) j++;
        if (j < len && s[j] === ':') {
          lastRouteKeyFullPath = joinPatterns(currentParent, value);
        }
      }
      continue;
    }

    // Detect `children` keyword — push to parent stack
    if (s.slice(i, i + 8) === 'children' && lastRouteKeyFullPath) {
      let j = i + 8;
      while (j < len && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n' || s[j] === '\r')) j++;
      if (j < len && s[j] === ':') {
        parentStack.push({ parentPath: currentParent, braceDepthAtEntry: braceDepth });
        currentParent = lastRouteKeyFullPath;
        i = j + 1;
        continue;
      }
    }

    // Detect `component` keyword — extract the import path
    if (s.slice(i, i + 9) === 'component' && lastRouteKeyFullPath) {
      const importMatch = s
        .slice(i)
        .match(/^component\s*:\s*\(\)\s*=>\s*import\s*\(\s*(?:"|')(\.[^"']+?)(?:"|')\s*\)/);
      if (importMatch) {
        const chunkFile = importMatch[1] ?? '';
        const chunkName = chunkFile.replace(/^\.\//, '');
        const chunkPath = `${assetPrefix}/${chunkName}`;
        routes[lastRouteKeyFullPath] = [chunkPath];
        i += importMatch[0].length;
        continue;
      }
    }

    i++;
  }

  return { routes };
}
