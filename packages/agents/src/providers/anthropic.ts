import { toJSONSchema } from '@vertz/schema';
import type { LLMAdapter, LLMResponse, Message, ToolCall } from '../loop/react-loop';
import type { ToolDefinition } from '../types';
import type { CreateAdapterOptions } from './types';

const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

// ---------------------------------------------------------------------------
// Anthropic Messages API types (only what we use)
// ---------------------------------------------------------------------------

interface AnthropicTextBlock {
  readonly type: 'text';
  readonly text: string;
}

interface AnthropicToolUseBlock {
  readonly type: 'tool_use';
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

interface AnthropicToolResultBlock {
  readonly type: 'tool_result';
  readonly tool_use_id: string;
  readonly content: string;
}

type AnthropicAssistantBlock = AnthropicTextBlock | AnthropicToolUseBlock;

type AnthropicUserBlock = AnthropicToolResultBlock;

interface AnthropicMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string | readonly AnthropicAssistantBlock[] | readonly AnthropicUserBlock[];
}

interface AnthropicTool {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown>;
}

/**
 * Create an LLM adapter for Anthropic's Claude models via the native Messages API.
 *
 * Uses `POST https://api.anthropic.com/v1/messages` with native tool_use /
 * tool_result content blocks — not the OpenAI-compatible shim.
 *
 * Required environment variables:
 * - `ANTHROPIC_API_KEY` — Anthropic API key (sent via `x-api-key` header)
 */
export function createAnthropicAdapter(options: CreateAdapterOptions): LLMAdapter {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required for Anthropic adapter');
  }

  const url = `${ANTHROPIC_API_BASE}/messages`;
  const anthropicTools = toAnthropicTools(options.tools);
  const model = options.config.model;

  return {
    async chat(messages: readonly Message[]): Promise<LLMResponse> {
      const { system, messages: apiMessages } = toAnthropicMessages(messages);

      const body: Record<string, unknown> = {
        model,
        max_tokens: DEFAULT_MAX_TOKENS,
        messages: apiMessages,
      };

      if (system) {
        body.system = system;
      }

      if (anthropicTools.length > 0) {
        body.tools = anthropicTools;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Anthropic API request failed (${response.status}): ${text}`);
      }

      const json = await response.json();
      return fromAnthropicResponse(json);
    },
  };
}

// ---------------------------------------------------------------------------
// Conversion — Vertz messages → Anthropic Messages API
// ---------------------------------------------------------------------------

interface AnthropicRequest {
  system: string;
  messages: AnthropicMessage[];
}

function toAnthropicMessages(messages: readonly Message[]): AnthropicRequest {
  const systemParts: string[] = [];
  const apiMessages: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(msg.content);
      continue;
    }

    if (msg.role === 'tool') {
      if (!msg.toolCallId) {
        throw new Error(
          'Anthropic tool_result requires a toolCallId. Tool messages without toolCallId cannot be converted to the Messages API.',
        );
      }
      const resultBlock: AnthropicToolResultBlock = {
        type: 'tool_result',
        tool_use_id: msg.toolCallId,
        content: msg.content,
      };

      const last = apiMessages[apiMessages.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        // Merge consecutive tool results into a single user message.
        (last.content as AnthropicUserBlock[]).push(resultBlock);
      } else {
        apiMessages.push({ role: 'user', content: [resultBlock] });
      }
      continue;
    }

    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      const blocks: AnthropicAssistantBlock[] = [];
      // The react-loop synthesises "[Calling ...]" placeholders when the model
      // returns no text alongside tool calls. Drop those — Anthropic expects a
      // real text block or none at all.
      if (msg.content && !msg.content.startsWith('[Calling ')) {
        blocks.push({ type: 'text', text: msg.content });
      }
      msg.toolCalls.forEach((tc, i) => {
        blocks.push({
          type: 'tool_use',
          // Suffix with index so repeated tool names don't collide when the
          // model emitted no id (Anthropic requires unique tool_use ids per turn).
          id: tc.id ?? `call_${i}_${tc.name}`,
          name: tc.name,
          input: tc.arguments,
        });
      });
      apiMessages.push({ role: 'assistant', content: blocks });
      continue;
    }

    apiMessages.push({ role: msg.role, content: msg.content });
  }

  return { system: systemParts.join('\n\n'), messages: apiMessages };
}

function toAnthropicTools(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tools have varying types
  tools: Record<string, ToolDefinition<any, any>>,
): AnthropicTool[] {
  return Object.entries(tools).map(([name, def]) => ({
    name,
    description: def.description,
    input_schema: toJSONSchema(def.input),
  }));
}

// ---------------------------------------------------------------------------
// Conversion — Anthropic response → Vertz LLMResponse
// ---------------------------------------------------------------------------

function fromAnthropicResponse(response: unknown): LLMResponse {
  const resp = response as Record<string, unknown>;
  const rawContent = Array.isArray(resp?.content) ? resp.content : [];

  let text = '';
  const toolCalls: ToolCall[] = [];

  for (const block of rawContent) {
    const b = block as Record<string, unknown>;
    if (b?.type === 'text' && typeof b.text === 'string') {
      text += b.text;
    } else if (b?.type === 'tool_use') {
      const input = b.input;
      toolCalls.push({
        id: typeof b.id === 'string' ? b.id : undefined,
        name: typeof b.name === 'string' ? b.name : 'unknown',
        arguments:
          typeof input === 'object' && input !== null && !Array.isArray(input)
            ? (input as Record<string, unknown>)
            : {},
      });
    }
  }

  const rawUsage = resp?.usage as Record<string, unknown> | undefined;
  const usage =
    rawUsage &&
    typeof rawUsage.input_tokens === 'number' &&
    typeof rawUsage.output_tokens === 'number'
      ? { inputTokens: rawUsage.input_tokens, outputTokens: rawUsage.output_tokens }
      : undefined;

  return usage ? { text, toolCalls, usage } : { text, toolCalls };
}
