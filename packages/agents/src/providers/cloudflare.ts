import type { LLMAdapter, Message } from '../loop/react-loop';
import type { CreateAdapterOptions } from './types';
import { fromOpenAIResponse, toOpenAIMessages, toOpenAITools } from './openai-format';

const CLOUDFLARE_AI_BASE = 'https://api.cloudflare.com/client/v4/accounts';

/**
 * Create an LLM adapter for Cloudflare Workers AI.
 *
 * Uses the OpenAI-compatible REST API endpoint:
 * `https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1/chat/completions`
 *
 * Required environment variables:
 * - `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID
 * - `CLOUDFLARE_API_TOKEN` — API token with Workers AI permissions
 */
export function createCloudflareAdapter(options: CreateAdapterOptions): LLMAdapter {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) {
    throw new Error(
      'CLOUDFLARE_ACCOUNT_ID environment variable is required for Cloudflare Workers AI adapter',
    );
  }

  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) {
    throw new Error(
      'CLOUDFLARE_API_TOKEN environment variable is required for Cloudflare Workers AI adapter',
    );
  }

  const url = `${CLOUDFLARE_AI_BASE}/${accountId}/ai/v1/chat/completions`;
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
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Cloudflare Workers AI request failed (${response.status}): ${text}`);
      }

      const json = await response.json();
      return fromOpenAIResponse(json);
    },
  };
}
