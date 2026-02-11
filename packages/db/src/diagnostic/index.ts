/**
 * @vertz/db diagnostic utilities.
 *
 * Maps common error patterns to human-readable explanations.
 * Useful for developers and LLMs understanding type errors and runtime exceptions.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Error pattern matching
// ---------------------------------------------------------------------------

export interface DiagnosticResult {
  /** Short identifier for the error pattern. */
  readonly code: string;
  /** Human-readable explanation of the error. */
  readonly explanation: string;
  /** Suggested fix or next step. */
  readonly suggestion: string;
}

/**
 * Known error patterns and their explanations.
 */
const ERROR_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  code: string;
  explanation: string;
  suggestion: string;
}> = [
  {
    pattern: /Column '([^']+)' does not exist on table '([^']+)'/,
    code: 'INVALID_COLUMN',
    explanation:
      'The column name used in a select, where, or orderBy clause does not exist on the specified table.',
    suggestion:
      'Check the table schema definition for available column names. Column names are camelCase in TypeScript.',
  },
  {
    pattern: /Relation '([^']+)' does not exist/,
    code: 'INVALID_RELATION',
    explanation:
      'The relation name used in an include clause does not match any declared relation on the table entry.',
    suggestion: 'Check the relations record passed to the table entry in your database registry.',
  },
  {
    pattern: /Filter on '([^']+)' expects type '([^']+)', got '([^']+)'/,
    code: 'INVALID_FILTER_TYPE',
    explanation: 'The value passed to a where filter does not match the column type.',
    suggestion:
      'Ensure the filter value matches the column type. For example, use a number for integer columns.',
  },
  {
    pattern: /Cannot combine 'not' with explicit field selection/,
    code: 'MIXED_SELECT',
    explanation:
      'The select option uses both `not: "sensitive"` and explicit field selection like `{ id: true }`, which are mutually exclusive.',
    suggestion: 'Use either `{ not: "sensitive" }` OR `{ id: true, name: true }`, not both.',
  },
  {
    pattern: /Unique constraint violated on ([^.]+)\.([^\s(]+)/,
    code: 'UNIQUE_VIOLATION',
    explanation: 'An INSERT or UPDATE tried to set a value that already exists in a unique column.',
    suggestion:
      'Check the violating value and either use a different value or use upsert() to handle conflicts.',
  },
  {
    pattern: /Foreign key constraint "([^"]+)" violated on table ([^\s]+)/,
    code: 'FK_VIOLATION',
    explanation: 'An INSERT or UPDATE references a row in another table that does not exist.',
    suggestion: 'Ensure the referenced row exists before creating the dependent row.',
  },
  {
    pattern: /Not-null constraint violated on ([^.]+)\.([^\s]+)/,
    code: 'NOT_NULL_VIOLATION',
    explanation: 'An INSERT or UPDATE tried to set a NOT NULL column to null.',
    suggestion:
      'Provide a non-null value for the column, or make the column nullable in the schema with `.nullable()`.',
  },
  {
    pattern: /Record not found in table ([^\s]+)/,
    code: 'NOT_FOUND',
    explanation: 'A findOneOrThrow, update, or delete query did not match any rows.',
    suggestion:
      'Verify the where clause matches existing rows. Use findOne() if the record may not exist.',
  },
  {
    pattern: /Table "([^"]+)" is not registered in the database/,
    code: 'UNREGISTERED_TABLE',
    explanation: 'The table name passed to a query method is not in the database registry.',
    suggestion: 'Register the table in the `tables` record passed to `createDb()`.',
  },
];

// ---------------------------------------------------------------------------
// diagnoseError — main entry point
// ---------------------------------------------------------------------------

/**
 * Analyzes an error message and returns a human-readable diagnostic.
 *
 * Works with both TypeScript type error messages (from the branded types)
 * and runtime DbError messages.
 *
 * @param message - The error message string to analyze
 * @returns A DiagnosticResult if the pattern is recognized, or null
 */
export function diagnoseError(message: string): DiagnosticResult | null {
  for (const entry of ERROR_PATTERNS) {
    if (entry.pattern.test(message)) {
      return {
        code: entry.code,
        explanation: entry.explanation,
        suggestion: entry.suggestion,
      };
    }
  }
  return null;
}

/**
 * Formats a diagnostic result as a multi-line string for display.
 *
 * @param diag - The diagnostic result to format
 * @returns A formatted string with the error code, explanation, and suggestion
 */
export function formatDiagnostic(diag: DiagnosticResult): string {
  return [
    `[${diag.code}]`,
    `  Explanation: ${diag.explanation}`,
    `  Suggestion: ${diag.suggestion}`,
  ].join('\n');
}

/**
 * Convenience: diagnose and format in one step.
 *
 * @param message - The error message to analyze
 * @returns Formatted diagnostic string, or a fallback message
 */
export function explainError(message: string): string {
  const diag = diagnoseError(message);
  if (!diag) {
    return `[UNKNOWN] No diagnostic available for: ${message}`;
  }
  return formatDiagnostic(diag);
}
