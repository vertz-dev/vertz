import { toJSONSchema } from '@vertz/schema';
import type { ToolDefinition } from '../types';
import type { ToolDescription } from './types';

/**
 * Convert a record of tool definitions to an array of tool descriptions
 * suitable for sending to an LLM's function-calling interface.
 *
 * Each tool's input schema is converted to JSON Schema for the `parameters` field.
 */
export function toolsToDescriptions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tools have varying types
  tools: Record<string, ToolDefinition<any, any>>,
): ToolDescription[] {
  return Object.entries(tools).map(([name, def]) => ({
    name,
    description: def.description,
    parameters: toJSONSchema(def.input),
  }));
}
