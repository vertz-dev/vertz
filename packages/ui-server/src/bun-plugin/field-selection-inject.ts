/**
 * Field selection injection — transforms source code to inject `select`
 * into query descriptor calls based on field access analysis.
 *
 * Uses MagicString for source-map-preserving string manipulation.
 */
import { analyzeFieldSelection } from '@vertz/ui-compiler';
import MagicString from 'magic-string';

export interface FieldSelectionResult {
  /** Transformed source code */
  code: string;
  /** Whether any select was injected */
  injected: boolean;
}

/**
 * Analyze field access in a source file and inject `select` into descriptor calls.
 *
 * For each query() call:
 * 1. Analyzes which fields are accessed on the query result
 * 2. Builds a select object with those fields + `id` (always included)
 * 3. Injects the select into the descriptor call arguments
 *
 * Skips injection when:
 * - The query has opaque access (spread, dynamic key)
 * - The query has no tracked field access
 * - The `// @vertz-select-all` pragma is present
 */
export function injectFieldSelection(filePath: string, source: string): FieldSelectionResult {
  const selections = analyzeFieldSelection(filePath, source);

  if (selections.length === 0) {
    return { code: source, injected: false };
  }

  const s = new MagicString(source);
  let injected = false;

  for (const selection of selections) {
    // Skip if opaque access detected
    if (selection.hasOpaqueAccess) continue;

    // Skip if no fields were tracked
    if (selection.fields.length === 0) continue;

    // Build select object: always include 'id', then sorted accessed fields
    const allFields = new Set(['id', ...selection.fields]);
    const sortedFields = [...allFields].sort();
    const selectEntries = sortedFields.map((f) => `${f}: true`).join(', ');
    const selectObj = `{ ${selectEntries} }`;

    switch (selection.injectionKind) {
      case 'insert-arg':
        // api.users.list() → api.users.list({ select: {...} })
        s.appendLeft(selection.injectionPos, `{ select: ${selectObj} }`);
        break;
      case 'merge-into-object':
        // api.users.list({ status }) → api.users.list({ status, select: {...} })
        s.appendLeft(selection.injectionPos, `, select: ${selectObj} `);
        break;
      case 'append-arg':
        // api.users.get(id) → api.users.get(id, { select: {...} })
        s.appendLeft(selection.injectionPos, `, { select: ${selectObj} }`);
        break;
    }

    injected = true;
  }

  return {
    code: s.toString(),
    injected,
  };
}
