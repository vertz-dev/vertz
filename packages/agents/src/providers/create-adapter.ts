import type { LLMAdapter } from '../loop/react-loop';
import { createAnthropicAdapter } from './anthropic';
import { createCloudflareAdapter } from './cloudflare';
import { createMinimaxAdapter } from './minimax';
import type { CreateAdapterOptions } from './types';

/**
 * Create an LLM adapter based on the agent's model provider config.
 *
 * Dispatches to the appropriate provider adapter:
 * - `'cloudflare'` → Cloudflare Workers AI (OpenAI-compatible REST API)
 * - `'minimax'` → MiniMax (OpenAI-compatible REST API)
 * - `'anthropic'` → Anthropic Messages API (native tool-use blocks)
 * - `'openai'` — not yet implemented
 */
export function createAdapter(options: CreateAdapterOptions): LLMAdapter {
  switch (options.config.provider) {
    case 'cloudflare':
      return createCloudflareAdapter(options);
    case 'minimax':
      return createMinimaxAdapter(options);
    case 'anthropic':
      return createAnthropicAdapter(options);
    default:
      throw new Error(
        `Unsupported LLM provider: "${options.config.provider}". Supported: cloudflare, minimax, anthropic`,
      );
  }
}
