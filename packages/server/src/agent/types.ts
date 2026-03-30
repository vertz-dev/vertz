import type { BaseContext } from '../entity/types';

// ---------------------------------------------------------------------------
// Structural types for agent integration
// ---------------------------------------------------------------------------

/**
 * Structural type for agent definitions accepted by `createServer()`.
 *
 * This is intentionally a minimal structural type that `@vertz/agents`
 * `AgentDefinition` satisfies. `@vertz/server` does not import from
 * `@vertz/agents` to keep the dependency direction correct.
 */
export interface AgentLike {
  readonly kind: 'agent';
  readonly name: string;
  readonly description?: string;
  readonly access: Partial<Record<string, unknown>>;
}

/** Result returned by an agent runner after invocation. */
export interface AgentRunResult {
  readonly status: string;
  readonly response: string;
}

/**
 * Callback that executes an agent. The server evaluates access rules
 * before calling this function.
 *
 * Provided by `@vertz/agents` via `createAgentRunner()`.
 */
export type AgentRunnerFn = (
  agentName: string,
  message: string,
  ctx: BaseContext,
) => Promise<AgentRunResult>;
