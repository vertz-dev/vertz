import type { Diagnostic } from '@vertz/compiler';
export declare function formatDiagnostic(diagnostic: Diagnostic): string;
export declare function formatDiagnosticSummary(diagnostics: readonly Diagnostic[]): string;
export declare function formatDiagnosticsAsJSON(
  diagnostics: readonly Diagnostic[],
  success: boolean,
): string;
export declare function formatDiagnosticsAsGitHub(diagnostics: readonly Diagnostic[]): string;
//# sourceMappingURL=diagnostic-formatter.d.ts.map
