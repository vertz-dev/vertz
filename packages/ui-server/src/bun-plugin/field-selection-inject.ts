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

export interface QueryDiagnosticInfo {
  queryVar: string;
  singleFileFields: string[];
  crossFileFields: string[];
  combinedFields: string[];
  hasOpaqueAccess: boolean;
  injected: boolean;
}

export interface FieldSelectionResult {
  /** Transformed source code */
  code: string;
  /** Whether any select was injected */
  injected: boolean;
  /** Diagnostic info for each query (for debug logging) */
  diagnostics: QueryDiagnosticInfo[];
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
    return { code: source, injected: false, diagnostics: [] };
  }

  const s = new MagicString(source);
  let injected = false;
  const diagnostics: QueryDiagnosticInfo[] = [];

  for (const selection of selections) {
    // Merge cross-file fields from child component prop flows
    const crossFileResult = resolveCrossFileFields(filePath, selection.propFlows, options);

    const combinedFields = [...selection.fields, ...crossFileResult.fields];
    const combinedOpaque = selection.hasOpaqueAccess || crossFileResult.hasOpaqueAccess;

    let queryInjected = false;

    if (!combinedOpaque && combinedFields.length > 0) {
      // Build select object: always include 'id', then sorted accessed fields
      const allFields = new Set(['id', ...combinedFields]);
      const sortedFields = [...allFields].sort();
      const selectEntries = sortedFields.map((f) => `${f}: true`).join(', ');
      const selectObj = `{ ${selectEntries} }`;

      switch (selection.injectionKind) {
        case 'insert-arg':
          s.appendLeft(selection.injectionPos, `{ select: ${selectObj} }`);
          break;
        case 'merge-into-object':
          s.appendLeft(selection.injectionPos, `, select: ${selectObj} `);
          break;
        case 'append-arg':
          s.appendLeft(selection.injectionPos, `, { select: ${selectObj} }`);
          break;
      }

      queryInjected = true;
      injected = true;
    }

    diagnostics.push({
      queryVar: selection.queryVar,
      singleFileFields: [...selection.fields],
      crossFileFields: [...crossFileResult.fields],
      combinedFields: [...new Set(combinedFields)],
      hasOpaqueAccess: combinedOpaque,
      injected: queryInjected,
    });
  }

  return {
    code: s.toString(),
    injected,
    diagnostics,
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
