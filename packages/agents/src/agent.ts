import type { SchemaAny } from '@vertz/schema';
import type {
  AgentConfig,
  AgentDefinition,
  AgentLoopConfig,
  AgentPromptConfig,
  InferSchema,
  ToolDefinition,
} from './types';
import { deepFreeze } from './utils';

const AGENT_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

const DEFAULT_LOOP: AgentLoopConfig = {
  maxIterations: 20,
  onStuck: 'stop',
  stuckThreshold: 3,
  checkpointInterval: 5,
};

const DEFAULT_PROMPT: AgentPromptConfig = {};

/**
 * Define an AI agent with typed state, tools, and LLM configuration.
 *
 * Follows the same config-object pattern as `entity()` and `service()`.
 * Returns a frozen `AgentDefinition` that can be registered with `createServer()`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- TInput/TOutput must remain any for variance */
export function agent<
  TStateSchema extends SchemaAny,
  TTools extends Record<string, ToolDefinition<any, any>> = Record<
    string,
    ToolDefinition<any, any>
  >,
  TOutputSchema extends SchemaAny | undefined = undefined,
>(
  name: string,
  config: AgentConfig<InferSchema<TStateSchema>, TStateSchema, TTools, TOutputSchema>,
): AgentDefinition<InferSchema<TStateSchema>, TTools, TOutputSchema> {
  /* eslint-enable @typescript-eslint/no-explicit-any */
  if (!name || !AGENT_NAME_PATTERN.test(name)) {
    throw new Error(
      `agent() name must be a non-empty lowercase string matching /^[a-z][a-z0-9-]*$/. Got: "${name}"`,
    );
  }

  const loop: AgentLoopConfig = config.loop
    ? { ...DEFAULT_LOOP, ...config.loop }
    : { ...DEFAULT_LOOP };

  if (loop.maxIterations < 1) {
    throw new Error(`agent() loop.maxIterations must be >= 1. Got: ${loop.maxIterations}`);
  }

  const prompt: AgentPromptConfig = config.prompt
    ? { ...DEFAULT_PROMPT, ...config.prompt }
    : { ...DEFAULT_PROMPT };

  type TState = InferSchema<TStateSchema>;
  const def: AgentDefinition<TState, TTools, TOutputSchema> = {
    kind: 'agent',
    name,
    description: config.description,
    state: config.state as SchemaAny,
    initialState: config.initialState,
    output: config.output,
    tools: config.tools,
    model: config.model,
    prompt,
    loop,
    access: config.access ?? {},
    inject: config.inject ?? {},
    onStart: config.onStart,
    onComplete: config.onComplete,
    onStuck: config.onStuck,
  };

  return deepFreeze(def);
}
