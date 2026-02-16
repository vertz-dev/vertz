/**
 * @vertz/db diagnostic utilities.
 *
 * Maps common error patterns to human-readable explanations.
 * Useful for developers and LLMs understanding type errors and runtime exceptions.
 *
 * @module
 */
export interface DiagnosticResult {
  /** Short identifier for the error pattern. */
  readonly code: string;
  /** Human-readable explanation of the error. */
  readonly explanation: string;
  /** Suggested fix or next step. */
  readonly suggestion: string;
}
/**
 * Analyzes an error message and returns a human-readable diagnostic.
 *
 * Works with both TypeScript type error messages (from the branded types)
 * and runtime DbError messages.
 *
 * @param message - The error message string to analyze
 * @returns A DiagnosticResult if the pattern is recognized, or null
 */
export declare function diagnoseError(message: string): DiagnosticResult | null;
/**
 * Formats a diagnostic result as a multi-line string for display.
 *
 * @param diag - The diagnostic result to format
 * @returns A formatted string with the error code, explanation, and suggestion
 */
export declare function formatDiagnostic(diag: DiagnosticResult): string;
/**
 * Convenience: diagnose and format in one step.
 *
 * @param message - The error message to analyze
 * @returns Formatted diagnostic string, or a fallback message
 */
export declare function explainError(message: string): string;
//# sourceMappingURL=index.d.ts.map
