import type { SchemaAny } from '@vertz/schema';
import type { ToolConfig, ToolDefinition } from './types';

/**
 * Define a tool that an agent can use.
 *
 * Tools are typed units of capability: each has a description, input/output schemas,
 * and an optional handler. Client-side tools omit the handler (execution: 'client').
 */
export function tool<TInput, TOutput>(
  config: ToolConfig<TInput, TOutput>,
): ToolDefinition<TInput, TOutput> {
  if (!config.description || config.description.trim() === '') {
    throw new Error('tool() description must be a non-empty string.');
  }

  const def: ToolDefinition<TInput, TOutput> = {
    kind: 'tool',
    description: config.description,
    input: config.input as SchemaAny,
    output: config.output as SchemaAny,
    handler: config.handler,
    approval: config.approval,
    execution: config.execution ?? 'server',
  };

  return Object.freeze(def);
}
