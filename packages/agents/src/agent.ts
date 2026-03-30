import type { Schema, SchemaAny } from '@vertz/schema';
import type {
  AgentConfig,
  AgentDefinition,
  AgentLoopConfig,
  InferSchema,
  ToolDefinition,
} from './types';

const AGENT_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

const DEFAULT_LOOP: AgentLoopConfig = {
  maxIterations: 20,
  onStuck: 'stop',
  stuckThreshold: 3,
  checkpointEvery: 5,
};

/**
 * Define an AI agent with typed state, tools, and LLM configuration.
 *
 * Follows the same config-object pattern as `entity()` and `service()`.
 * Returns a frozen `AgentDefinition` that can be registered with `createServer()`.
 */
export function agent<
  TStateSchema extends SchemaAny,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TInput/TOutput must remain any for variance
  TTools extends Record<string, ToolDefinition<any, any>> = Record<
    string,
    ToolDefinition<any, any>
  >,
>(
  name: string,
  config: AgentConfig<InferSchema<TStateSchema>, TStateSchema, TTools>,
): AgentDefinition<InferSchema<TStateSchema>, TTools> {
  if (!name || !AGENT_NAME_PATTERN.test(name)) {
    throw new Error(
      `agent() name must be a non-empty lowercase string matching /^[a-z][a-z0-9-]*$/. Got: "${name}"`,
    );
  }

  const loop: AgentLoopConfig = config.loop
    ? { ...DEFAULT_LOOP, ...config.loop }
    : { ...DEFAULT_LOOP };

  type TState = InferSchema<TStateSchema>;
  const def: AgentDefinition<TState, TTools> = {
    kind: 'agent',
    name,
    state: config.state as SchemaAny,
    initialState: config.initialState,
    tools: config.tools,
    model: config.model,
    loop,
    access: config.access ?? {},
    inject: config.inject ?? {},
    onStart: config.onStart,
    onComplete: config.onComplete,
    onStuck: config.onStuck,
  };

  return Object.freeze(def);
}
