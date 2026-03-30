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

    if (msg.role === 'assistant' && msg.content.startsWith('[Calling ')) {
      return { role: 'assistant' as const, content: null };
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
 */
export function fromOpenAIResponse(response: OpenAIChatResponse): LLMResponse {
  if (response.choices.length === 0) {
    return { text: '', toolCalls: [] };
  }

  const message = response.choices[0].message;
  const text = message.content ?? '';
  const toolCalls = (message.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: parseArguments(tc.function.arguments),
  }));

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
