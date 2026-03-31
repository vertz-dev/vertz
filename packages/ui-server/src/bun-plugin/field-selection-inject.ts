/**
 * Field selection injection — transforms source code to inject `select`
 * and `include` into query descriptor calls based on field access analysis.
 *
 * Uses MagicString for source-map-preserving string manipulation.
 * Supports cross-file field resolution via FieldSelectionManifest.
 * When an entity schema manifest is provided, classifies fields as
 * scalar vs relation and generates `include` for relation fields
 * with nested `select`.
 */

import type {
  EntitySchemaManifest,
  EntitySchemaManifestEntry,
  EntitySchemaRelation,
} from '@vertz/codegen';
import type { NestedFieldAccess, PropFlow } from '../compiler/field-selection-analyzer';
import { analyzeFieldSelection } from '../compiler/field-selection-analyzer';
import MagicString from 'magic-string';
import type { FieldSelectionManifest } from './field-selection-manifest';

export type { EntitySchemaManifest, EntitySchemaManifestEntry, EntitySchemaRelation };

export interface FieldSelectionOptions {
  /** Cross-file manifest for resolving child component fields */
  manifest?: FieldSelectionManifest;
  /** Resolve import specifier to absolute file path */
  resolveImport?: (specifier: string, fromFile: string) => string | undefined;
  /** Entity schema manifest from codegen — enables relation-aware injection */
  entitySchema?: EntitySchemaManifest;
  /** Entity type name for the current file's queries */
  entityType?: string;
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
 * Analyze field access in a source file and inject `select` (and optionally
 * `include`) into query descriptor calls.
 *
 * For each query() call:
 * 1. Analyzes which fields are accessed on the query result (single-file)
 * 2. Resolves cross-file fields from child components via manifest
 * 3. When entity schema is available: classifies fields as scalar vs relation
 * 4. Builds `select` for scalar fields + `include` for relation fields
 * 5. Injects into the descriptor call arguments
 *
 * Skips injection when:
 * - The query has opaque access (spread, dynamic key)
 * - A child component has opaque access on the forwarded prop
 * - The query has no tracked field access (single-file + cross-file)
 * - The `// @vertz-select-all` pragma is present
 * - The user already provided `select` in the descriptor call
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
    // Check if user already provided `select` in the descriptor call
    // Scoped to the descriptor call's argument range to avoid false positives
    if (hasUserSelect(source, selection.descriptorCallStart, selection.descriptorCallEnd)) {
      diagnostics.push({
        queryVar: selection.queryVar,
        singleFileFields: [...selection.fields],
        crossFileFields: [],
        combinedFields: [...selection.fields],
        hasOpaqueAccess: selection.hasOpaqueAccess,
        injected: false,
      });
      continue;
    }

    // Resolve entity schema per-query: prefer inferred entity name, fall back to option
    const entityName = selection.inferredEntityName ?? options?.entityType;
    const schema = entityName ? options?.entitySchema?.[entityName] : undefined;

    // Merge cross-file fields from child component prop flows
    const crossFileResult = resolveCrossFileFields(filePath, selection.propFlows, options);

    const combinedFields = [...selection.fields, ...crossFileResult.fields];
    const combinedOpaque = selection.hasOpaqueAccess || crossFileResult.hasOpaqueAccess;

    let queryInjected = false;

    if (!combinedOpaque && combinedFields.length > 0) {
      const injectionStr = schema
        ? buildManifestAwareInjection(combinedFields, selection.nestedAccess, schema)
        : buildSimpleSelectInjection(combinedFields);

      if (injectionStr) {
        switch (selection.injectionKind) {
          case 'insert-arg':
            s.appendLeft(selection.injectionPos, `{ ${injectionStr} }`);
            break;
          case 'merge-into-object':
            s.appendLeft(selection.injectionPos, `, ${injectionStr} `);
            break;
          case 'append-arg':
            s.appendLeft(selection.injectionPos, `, { ${injectionStr} }`);
            break;
        }

        queryInjected = true;
        injected = true;
      }
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
 * Build a simple select injection string (no schema awareness).
 * Always includes 'id' as a default field.
 */
function buildSimpleSelectInjection(fields: string[]): string {
  const allFields = new Set(['id', ...fields]);
  const sortedFields = [...allFields].sort();
  const selectEntries = sortedFields.map((f) => `${f}: true`).join(', ');
  return `select: { ${selectEntries} }`;
}

/**
 * Build a manifest-aware injection string with separate select + include.
 *
 * Uses the entity schema to classify fields:
 * - Scalar fields → `select: { field: true, ... }`
 * - Relation fields with nested access → `include: { rel: { select: { field: true } } }`
 * - Relation fields without nested access → included in `select` as before
 */
function buildManifestAwareInjection(
  fields: string[],
  nestedAccess: NestedFieldAccess[],
  schema: EntitySchemaManifestEntry,
): string {
  const relationNames = new Set(Object.keys(schema.relations));
  const hiddenFieldSet = new Set(schema.hiddenFields);
  const primaryKey = schema.primaryKey ?? 'id';
  const scalarFields = new Set<string>([primaryKey]);
  const relationIncludes = new Map<string, Set<string>>();

  // Classify fields
  for (const field of new Set(fields)) {
    if (relationNames.has(field)) {
      // Only add to include if there's nested access — otherwise treat as scalar
      const nestedForField = nestedAccess.filter((n) => n.field === field);
      if (nestedForField.length > 0) {
        if (!relationIncludes.has(field)) {
          relationIncludes.set(field, new Set());
        }
        for (const nested of nestedForField) {
          const firstSegment = nested.nestedPath[0];
          if (firstSegment !== undefined) {
            relationIncludes.get(field)?.add(firstSegment);
          }
        }
      } else {
        scalarFields.add(field);
      }
    } else {
      scalarFields.add(field);
    }
  }

  // Filter out hidden fields from scalar selection
  for (const hidden of hiddenFieldSet) {
    scalarFields.delete(hidden);
  }

  // Build select string
  const sortedScalars = [...scalarFields].sort();
  const selectEntries = sortedScalars.map((f) => `${f}: true`).join(', ');
  const parts = [`select: { ${selectEntries} }`];

  // Build include string if we have relation includes
  if (relationIncludes.size > 0) {
    const includeEntries: string[] = [];
    const sortedRelations = [...relationIncludes.keys()].sort();

    for (const relName of sortedRelations) {
      const relSchema = schema.relations[relName];
      const relFieldSet = relationIncludes.get(relName);
      if (!relFieldSet) continue;
      let relFields = [...relFieldSet];

      // Filter by allowed selection if narrowed
      if (relSchema && Array.isArray(relSchema.selection)) {
        const allowed = new Set(relSchema.selection);
        relFields = relFields.filter((f) => allowed.has(f));
      }

      if (relFields.length > 0) {
        const sortedRelFields = relFields.sort();
        const relSelectEntries = sortedRelFields.map((f) => `${f}: true`).join(', ');
        includeEntries.push(`${relName}: { select: { ${relSelectEntries} } }`);
      }
    }

    if (includeEntries.length > 0) {
      parts.push(`include: { ${includeEntries.join(', ')} }`);
    }
  }

  return parts.join(', ');
}

/**
 * Check if the user already provided `select` in the descriptor call arguments.
 * Scoped to the descriptor call's argument range to avoid false positives
 * from other queries or variables in the same file.
 */
function hasUserSelect(source: string, callStart: number, callEnd: number): boolean {
  const region = source.slice(callStart, callEnd);
  return /\bselect\s*:/.test(region);
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
    } else {
      // Component not found in manifest → we can't determine what fields
      // the child accesses. Fall back to opaque to prevent under-fetching.
      hasOpaqueAccess = true;
    }
  }

  return { fields, hasOpaqueAccess };
}
