import type { LLMAdapter } from './loop/react-loop';
import { run } from './run';
import type { CreateAdapterOptions } from './providers/types';
import type { AgentDefinition } from './types';

// ---------------------------------------------------------------------------
// Runner context — mirrors @vertz/server's BaseContext structurally
// ---------------------------------------------------------------------------

/** Structural match for @vertz/server's BaseContext. */
interface BaseContextLike {
  readonly userId: string | null;
  readonly tenantId: string | null;
  readonly tenantLevel?: string | null;
  authenticated(): boolean;
  tenant(): boolean;
  role(...roles: string[]): boolean;
}

/** Result shape expected by @vertz/server's agent route handler. */
interface AgentRunResult {
  readonly status: string;
  readonly response: string;
}

/** The runner function signature — matches AgentRunnerFn from @vertz/server. */
type RunnerFn = (
  agentName: string,
  message: string,
  ctx: BaseContextLike,
) => Promise<AgentRunResult>;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface CreateAgentRunnerOptions {
  /** A shared LLM adapter for all agents. */
  readonly llm?: LLMAdapter;
  /** A factory that creates an LLM adapter per agent. Takes precedence over `llm`. */
  readonly createAdapter?: (options: CreateAdapterOptions) => LLMAdapter;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an agent runner function compatible with `@vertz/server`'s `agentRunner` config.
 *
 * The runner maps agent names to definitions and executes them using
 * either a shared LLM adapter or a per-agent adapter factory.
 *
 * ```ts
 * const runner = createAgentRunner([myAgent], { llm: cloudflareAdapter });
 * const server = createServer({ agents: [myAgent], agentRunner: runner });
 * ```
 */
export function createAgentRunner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- agent definitions have varying types
  agents: readonly AgentDefinition<any, any, any>[],
  options: CreateAgentRunnerOptions,
): RunnerFn {
  if (!options.llm && !options.createAdapter) {
    throw new Error('createAgentRunner requires either "llm" or "createAdapter" option');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any needed for Map storage
  const agentMap = new Map<string, AgentDefinition<any, any, any>>();
  for (const agentDef of agents) {
    agentMap.set(agentDef.name, agentDef);
  }

  return async (agentName, message, _ctx) => {
    const agentDef = agentMap.get(agentName);
    if (!agentDef) {
      throw new Error(
        `Agent "${agentName}" not found. Available: ${[...agentMap.keys()].join(', ') || 'none'}`,
      );
    }

    const llm = options.createAdapter
      ? options.createAdapter({ config: agentDef.model, tools: agentDef.tools })
      : options.llm!;

    const result = await run(agentDef, { message, llm });

    return {
      status: result.status,
      response: result.response,
    };
  };
}
