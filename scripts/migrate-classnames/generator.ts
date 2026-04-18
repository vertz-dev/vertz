/**
 * Generates an object-literal source string from an array of shorthand tokens.
 *
 *   generateStyleBlock(['p:4', 'hover:bg:primary'])
 *     -> "{ padding: token.spacing[4], '&:hover': { backgroundColor: token.color.primary } }"
 *
 * Base entries render first, pseudo groups render in first-seen order. Output is
 * single-line; let oxfmt normalize whitespace after the file rewriter runs.
 */

import type { MappedEntry } from './mapper';
import { mapShorthand } from './mapper';

export function generateStyleBlock(shorthands: readonly string[]): string {
  if (shorthands.length === 0) return '{}';

  const baseEntries: MappedEntry[] = [];
  const pseudoGroups = new Map<string, MappedEntry[]>();

  for (const shorthand of shorthands) {
    const mapped = mapShorthand(shorthand);
    if (mapped.pseudo === null) {
      baseEntries.push(...mapped.entries);
      continue;
    }
    const existing = pseudoGroups.get(mapped.pseudo);
    if (existing) {
      existing.push(...mapped.entries);
    } else {
      pseudoGroups.set(mapped.pseudo, [...mapped.entries]);
    }
  }

  const parts: string[] = [];
  for (const entry of baseEntries) parts.push(formatEntry(entry));
  for (const [selector, entries] of pseudoGroups) {
    const inner = entries.map(formatEntry).join(', ');
    parts.push(`'${selector}': { ${inner} }`);
  }

  return `{ ${parts.join(', ')} }`;
}

function formatEntry(entry: MappedEntry): string {
  return `${entry.cssKey}: ${entry.valueExpr}`;
}
