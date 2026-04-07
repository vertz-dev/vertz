import type { LLMAdapter, Message } from '../loop/react-loop';
import type { CreateAdapterOptions } from './types';
import { fromOpenAIResponse, toOpenAIMessages, toOpenAITools } from './openai-format';

const MINIMAX_API_BASE = 'https://api.minimax.io/v1';

/**
 * Create an LLM adapter for MiniMax.
 *
 * Uses the OpenAI-compatible API endpoint:
 * `https://api.minimax.io/v1/chat/completions`
 *
 * Required environment variables:
 * - `MINIMAX_API_KEY` — MiniMax API key
 */
export function createMinimaxAdapter(options: CreateAdapterOptions): LLMAdapter {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY environment variable is required for MiniMax adapter');
  }

  const url = `${MINIMAX_API_BASE}/chat/completions`;
  const openAITools = toOpenAITools(options.tools);
  const model = options.config.model;

  return {
    async chat(messages: readonly Message[]) {
      const body: Record<string, unknown> = {
        model,
        messages: toOpenAIMessages(messages),
      };

      if (openAITools.length > 0) {
        body.tools = openAITools;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`MiniMax API request failed (${response.status}): ${text}`);
      }

      const json = await response.json();
      return fromOpenAIResponse(json);
    },
  };
}
