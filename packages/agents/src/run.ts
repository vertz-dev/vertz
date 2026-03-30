import type { LLMAdapter, LoopResult } from './loop/react-loop';
import { reactLoop } from './loop/react-loop';
import type { AgentContext, AgentDefinition, ToolDefinition } from './types';

// ---------------------------------------------------------------------------
// Run options
// ---------------------------------------------------------------------------

export interface RunOptions {
  /** The user message to send to the agent. */
  readonly message: string;
  /** The LLM adapter to use for chat completions. */
  readonly llm: LLMAdapter;
  /** Optional instance ID for the agent. Defaults to a random ID. */
  readonly instanceId?: string;
}

// ---------------------------------------------------------------------------
// Run an agent
// ---------------------------------------------------------------------------

/**
 * Execute an agent's ReAct loop with the given message and LLM adapter.
 *
 * This is the main entry point for running an agent. It:
 * 1. Creates the agent context with initial state
 * 2. Calls onStart lifecycle hook
 * 3. Runs the ReAct loop
 * 4. Calls onComplete or onStuck based on the result
 * 5. Returns the loop result
 */
export async function run(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- agent definitions have varying state/tool types
  agentDef: AgentDefinition<any, any, any>,
  options: RunOptions,
): Promise<LoopResult> {
  const { message, llm, instanceId } = options;

  // Create agent context
  const ctx: AgentContext = {
    agent: {
      id: instanceId ?? crypto.randomUUID(),
      name: agentDef.name,
    },
    state: structuredClone(agentDef.initialState),
    userId: null,
    tenantId: null,
    authenticated() {
      return false;
    },
  };

  // Lifecycle: onStart
  if (agentDef.onStart) {
    await agentDef.onStart(ctx);
  }

  // Build system prompt
  const systemPrompt =
    agentDef.prompt.system ??
    `You are an AI agent named "${agentDef.name}". Use the available tools to accomplish the user's request.`;

  // Run the ReAct loop
  const result = await reactLoop({
    llm,
    tools: agentDef.tools as Record<string, ToolDefinition<unknown, unknown>>,
    systemPrompt,
    userMessage: message,
    maxIterations: agentDef.loop.maxIterations,
    checkpointInterval: agentDef.loop.checkpointInterval,
  });

  // Lifecycle: onComplete or onStuck
  if (result.status === 'complete') {
    if (agentDef.onComplete) {
      await agentDef.onComplete(ctx);
    }
  } else if (result.status === 'max-iterations' || result.status === 'stuck') {
    if (agentDef.onStuck) {
      await agentDef.onStuck(ctx);
    }
  }

  return result;
}
