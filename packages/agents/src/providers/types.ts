import type { LLMAdapter } from '../loop/react-loop';
import type { AgentModelConfig, ToolDefinition } from '../types';

/** Options for creating an LLM adapter from an agent's model config. */
export interface CreateAdapterOptions {
  readonly config: AgentModelConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tools have varying types
  readonly tools: Record<string, ToolDefinition<any, any>>;
}

/** Factory function for creating LLM adapters. */
export type AdapterFactory = (options: CreateAdapterOptions) => LLMAdapter;

/** Tool description sent to the LLM for function calling. */
export interface ToolDescription {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}
