import type { SourceLocation } from './ir/types';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
  | 'VERTZ_SCHEMA_NAMING'
  | 'VERTZ_SCHEMA_PLACEMENT'
  | 'VERTZ_SCHEMA_EXECUTION'
  | 'VERTZ_SCHEMA_MISSING_ID'
  | 'VERTZ_SCHEMA_DYNAMIC_NAME'
  | 'VERTZ_MODULE_CIRCULAR'
  | 'VERTZ_MODULE_EXPORT_INVALID'
  | 'VERTZ_MODULE_IMPORT_MISSING'
  | 'VERTZ_MODULE_DUPLICATE_NAME'
  | 'VERTZ_MODULE_DYNAMIC_NAME'
  | 'VERTZ_MODULE_OPTIONS_INVALID'
  | 'VERTZ_MODULE_WRONG_OWNERSHIP'
  | 'VERTZ_SERVICE_INJECT_MISSING'
  | 'VERTZ_SERVICE_UNUSED'
  | 'VERTZ_SERVICE_DYNAMIC_NAME'
  | 'VERTZ_ENV_MISSING_DEFAULT'
  | 'VERTZ_ENV_DUPLICATE'
  | 'VERTZ_ENV_DYNAMIC_CONFIG'
  | 'VERTZ_MW_MISSING_NAME'
  | 'VERTZ_MW_MISSING_HANDLER'
  | 'VERTZ_MW_DYNAMIC_NAME'
  | 'VERTZ_MW_NON_OBJECT_CONFIG'
  | 'VERTZ_MW_REQUIRES_UNSATISFIED'
  | 'VERTZ_MW_PROVIDES_COLLISION'
  | 'VERTZ_MW_ORDER_INVALID'
  | 'VERTZ_RT_UNKNOWN_MODULE_DEF'
  | 'VERTZ_RT_DYNAMIC_PATH'
  | 'VERTZ_RT_MISSING_HANDLER'
  | 'VERTZ_RT_MISSING_PREFIX'
  | 'VERTZ_RT_DYNAMIC_CONFIG'
  | 'VERTZ_RT_INVALID_PATH'
  | 'VERTZ_ROUTE_DUPLICATE'
  | 'VERTZ_ROUTE_PARAM_MISMATCH'
  | 'VERTZ_ROUTE_MISSING_RESPONSE'
  | 'VERTZ_APP_MISSING'
  | 'VERTZ_APP_NOT_FOUND'
  | 'VERTZ_APP_DUPLICATE'
  | 'VERTZ_APP_BASEPATH_FORMAT'
  | 'VERTZ_APP_INLINE_MODULE'
  | 'VERTZ_DEP_CYCLE'
  | 'VERTZ_DEP_CIRCULAR'
  | 'VERTZ_DEP_UNRESOLVED_INJECT'
  | 'VERTZ_DEP_INIT_ORDER'
  | 'VERTZ_CTX_COLLISION'
  | 'VERTZ_DEAD_CODE';

export interface SourceContext {
  lines: { number: number; text: string }[];
  highlightStart: number;
  highlightLength: number;
}

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: DiagnosticCode;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  suggestion?: string;
  sourceContext?: SourceContext;
}

export type CreateDiagnosticOptions = Diagnostic;

export function createDiagnostic(options: CreateDiagnosticOptions): Diagnostic {
  return { ...options };
}

export function createDiagnosticFromLocation(
  location: SourceLocation,
  options: Omit<CreateDiagnosticOptions, 'file' | 'line' | 'column'>,
): Diagnostic {
  return {
    ...options,
    file: location.sourceFile,
    line: location.sourceLine,
    column: location.sourceColumn,
  };
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

export function filterBySeverity(
  diagnostics: readonly Diagnostic[],
  severity: DiagnosticSeverity,
): Diagnostic[] {
  return diagnostics.filter((d) => d.severity === severity);
}

export function mergeDiagnostics(a: readonly Diagnostic[], b: readonly Diagnostic[]): Diagnostic[] {
  return [...a, ...b];
}
