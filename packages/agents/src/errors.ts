// Package-level errors for @vertz/agents. Store-specific errors live in
// `stores/errors.ts`. This file is for cross-cutting runtime errors surfaced
// to callers via the agent loop (resume path, tool execution, etc.).

/**
 * Raised when a session resumes and an assistant-with-toolCalls message
 * is missing one or more corresponding tool_result rows. For non-safeToRetry
 * tools, the framework cannot know whether the handler's side effect
 * committed before the previous run crashed, so it surfaces this error as
 * a synthetic tool_result in the message history. The LLM reads the error
 * in-band and decides recovery.
 *
 * The class is exported so callers inspecting resumed history can pattern-
 * match on it; the instance is serialized as JSON into the `tool` message's
 * content (same encoding handler errors use).
 */
export class ToolDurabilityError extends Error {
  readonly code = 'TOOL_DURABILITY_ERROR' as const;
  readonly kind = 'tool-durability-error' as const;
  readonly toolCallId: string;
  readonly toolName: string;

  constructor(toolCallId: string, toolName: string) {
    super(
      `Tool '${toolName}' (call ${toolCallId}) was requested but its execution ` +
        `did not complete durably before the process ended. The tool is not ` +
        `declared 'safeToRetry: true', so the framework will not automatically ` +
        `re-invoke it. Decide recovery based on observable external state — e.g., ` +
        `check whether the side effect already occurred. If this tool is a pure ` +
        `read with no side effects, add \`safeToRetry: true\` to its declaration.`,
    );
    this.name = 'ToolDurabilityError';
    this.toolCallId = toolCallId;
    this.toolName = toolName;
  }
}

/** Serialize a `ToolDurabilityError` as the JSON content of a `tool` message. */
export function serializeToolDurabilityError(err: ToolDurabilityError): string {
  return JSON.stringify({
    error: err.message,
    kind: err.kind,
    toolName: err.toolName,
    toolCallId: err.toolCallId,
  });
}
