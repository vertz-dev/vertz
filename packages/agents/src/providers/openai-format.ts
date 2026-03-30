import { toJSONSchema } from '@vertz/schema';
import type { LLMResponse, Message } from '../loop/react-loop';
import type { ToolDefinition } from '../types';

// ---------------------------------------------------------------------------
// OpenAI-compatible types
// ---------------------------------------------------------------------------

/** An OpenAI-format chat message. */
export interface OpenAIMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string | null;
  readonly tool_calls?: readonly OpenAIToolCall[];
  readonly tool_call_id?: string;
}

/** An OpenAI-format tool call in an assistant message. */
export interface OpenAIToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly arguments: string;
  };
}

/** An OpenAI-format tool definition. */
export interface OpenAITool {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
}

/** The relevant shape of an OpenAI chat completion response. */
export interface OpenAIChatResponse {
  readonly choices: readonly {
    readonly message: {
      readonly role: 'assistant';
      readonly content: string | null;
      readonly tool_calls?: readonly OpenAIToolCall[];
    };
  }[];
}

// ---------------------------------------------------------------------------
// Conversion functions
// ---------------------------------------------------------------------------

/**
 * Convert Vertz messages to OpenAI-compatible format.
 *
 * - Tool result messages: `toolCallId` → `tool_call_id`
 * - Assistant messages starting with `[Calling ` get `content: null`
 *   (OpenAI expects null content for tool-calling assistant turns)
 */
export function toOpenAIMessages(messages: readonly Message[]): OpenAIMessage[] {
  return messages.map((msg) => {
    if (msg.role === 'tool') {
      return {
        role: 'tool' as const,
        content: msg.content,
        tool_call_id: msg.toolCallId,
      };
    }

    // Assistant message with tool calls — include tool_calls array
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: 'assistant' as const,
        content: msg.content.startsWith('[Calling ') ? null : msg.content,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id ?? `call_${tc.name}`,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      };
    }

    return { role: msg.role, content: msg.content };
  });
}

/**
 * Convert Vertz tool definitions to OpenAI-compatible function tool objects.
 */
export function toOpenAITools(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tools have varying types
  tools: Record<string, ToolDefinition<any, any>>,
): OpenAITool[] {
  return Object.entries(tools).map(([name, def]) => ({
    type: 'function' as const,
    function: {
      name,
      description: def.description,
      parameters: toJSONSchema(def.input),
    },
  }));
}

/**
 * Convert an OpenAI chat completion response to a Vertz `LLMResponse`.
 *
 * Validates the response shape to produce clear errors when the API
 * returns unexpected formats instead of cryptic TypeErrors.
 */
export function fromOpenAIResponse(response: unknown): LLMResponse {
  const resp = response as Record<string, unknown>;
  if (!resp || !Array.isArray(resp.choices)) {
    return { text: '', toolCalls: [] };
  }

  if (resp.choices.length === 0) {
    return { text: '', toolCalls: [] };
  }

  const choice = resp.choices[0] as Record<string, unknown>;
  const message = choice?.message as Record<string, unknown> | undefined;
  if (!message) {
    return { text: '', toolCalls: [] };
  }

  const text = (typeof message.content === 'string' ? message.content : '') ?? '';
  const rawToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const toolCalls = rawToolCalls.map((tc: Record<string, unknown>) => {
    const fn = tc.function as Record<string, unknown> | undefined;
    return {
      id: typeof tc.id === 'string' ? tc.id : undefined,
      name: typeof fn?.name === 'string' ? fn.name : 'unknown',
      arguments: typeof fn?.arguments === 'string' ? parseArguments(fn.arguments) : {},
    };
  });

  return { text, toolCalls };
}

/** Safely parse JSON tool call arguments. Returns `{}` on failure. */
function parseArguments(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
