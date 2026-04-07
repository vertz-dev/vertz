import type { ToolDefinition } from '../types';

interface ValidationOk {
  readonly ok: true;
  readonly data: unknown;
}

interface ValidationErr {
  readonly ok: false;
  readonly error: string;
}

export type ValidationResult = ValidationOk | ValidationErr;

/**
 * Validate a tool's input against its schema.
 *
 * Returns the parsed data on success, or an error message on failure.
 * The schema may strip unknown keys or apply coercions during parsing.
 */
export function validateToolInput(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool types vary
  toolDef: ToolDefinition<any, any>,
  input: unknown,
): ValidationResult {
  const result = toolDef.input.parse(input);

  if (result.ok) {
    return { ok: true, data: result.data };
  }

  return {
    ok: false,
    error: result.error instanceof Error ? result.error.message : String(result.error),
  };
}

/**
 * Validate a tool handler's output against its schema.
 *
 * Returns the parsed data on success, or an error message on failure.
 * Ensures handler implementations conform to their declared output schema.
 */
export function validateToolOutput(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool types vary
  toolDef: ToolDefinition<any, any>,
  output: unknown,
): ValidationResult {
  const result = toolDef.output.parse(output);

  if (result.ok) {
    return { ok: true, data: result.data };
  }

  return {
    ok: false,
    error: result.error instanceof Error ? result.error.message : String(result.error),
  };
}
