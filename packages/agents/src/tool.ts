import type { SchemaAny } from '@vertz/schema';
import type { ToolConfig, ToolDefinition } from './types';
import { deepFreeze } from './utils';

/**
 * Define a tool that an agent can use.
 *
 * Tools are typed units of capability: each has a description, input/output schemas,
 * and a handler. All tools execute on the server.
 */
export function tool<TInput, TOutput>(
  config: ToolConfig<TInput, TOutput>,
): ToolDefinition<TInput, TOutput> {
  if (!config.description || config.description.trim() === '') {
    throw new Error('tool() description must be a non-empty string.');
  }

  // Handler-less tools are valid declarations — handlers are injected at runtime
  // via ToolProvider when calling run() or runWorkflow().

  const def: ToolDefinition<TInput, TOutput> = {
    kind: 'tool',
    description: config.description,
    input: config.input as SchemaAny,
    output: config.output as SchemaAny,
    handler: config.handler,
    parallel: config.parallel,
  };

  return deepFreeze(def);
}
