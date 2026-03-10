/**
 * Field selection injection — transforms source code to inject `select`
 * into query descriptor calls based on field access analysis.
 *
 * Uses MagicString for source-map-preserving string manipulation.
 * Supports cross-file field resolution via FieldSelectionManifest.
 */

import type { PropFlow } from '@vertz/ui-compiler';
import { analyzeFieldSelection } from '@vertz/ui-compiler';
import MagicString from 'magic-string';
import type { FieldSelectionManifest } from './field-selection-manifest';

export interface FieldSelectionOptions {
  /** Cross-file manifest for resolving child component fields */
  manifest?: FieldSelectionManifest;
  /** Resolve import specifier to absolute file path */
  resolveImport?: (specifier: string, fromFile: string) => string | undefined;
}

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
 * 1. Analyzes which fields are accessed on the query result (single-file)
 * 2. Resolves cross-file fields from child components via manifest
 * 3. Builds a select object with those fields + `id` (always included)
 * 4. Injects the select into the descriptor call arguments
 *
 * Skips injection when:
 * - The query has opaque access (spread, dynamic key)
 * - A child component has opaque access on the forwarded prop
 * - The query has no tracked field access (single-file + cross-file)
 * - The `// @vertz-select-all` pragma is present
 */
export function injectFieldSelection(
  filePath: string,
  source: string,
  options?: FieldSelectionOptions,
): FieldSelectionResult {
  const selections = analyzeFieldSelection(filePath, source);

  if (selections.length === 0) {
    return { code: source, injected: false };
  }

  const s = new MagicString(source);
  let injected = false;

  for (const selection of selections) {
    // Merge cross-file fields from child component prop flows
    const crossFileResult = resolveCrossFileFields(filePath, selection.propFlows, options);

    const combinedFields = [...selection.fields, ...crossFileResult.fields];
    const combinedOpaque = selection.hasOpaqueAccess || crossFileResult.hasOpaqueAccess;

    // Skip if opaque access detected (single-file or cross-file)
    if (combinedOpaque) continue;

    // Skip if no fields were tracked
    if (combinedFields.length === 0) continue;

    // Build select object: always include 'id', then sorted accessed fields
    const allFields = new Set(['id', ...combinedFields]);
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

/**
 * Resolve cross-file fields from child component prop flows.
 */
function resolveCrossFileFields(
  filePath: string,
  propFlows: PropFlow[],
  options?: FieldSelectionOptions,
): { fields: string[]; hasOpaqueAccess: boolean } {
  if (!options?.manifest || !options.resolveImport || propFlows.length === 0) {
    return { fields: [], hasOpaqueAccess: false };
  }

  const fields: string[] = [];
  let hasOpaqueAccess = false;

  for (const flow of propFlows) {
    if (!flow.importSource) continue;

    const resolvedPath = options.resolveImport(flow.importSource, filePath);
    if (!resolvedPath) {
      // Can't resolve → conservative fallback
      hasOpaqueAccess = true;
      continue;
    }

    const childFields = options.manifest.getResolvedPropFields(
      resolvedPath,
      flow.componentName,
      flow.propName,
    );

    if (childFields) {
      fields.push(...childFields.fields);
      if (childFields.hasOpaqueAccess) {
        hasOpaqueAccess = true;
      }
    }
  }

  return { fields, hasOpaqueAccess };
}
