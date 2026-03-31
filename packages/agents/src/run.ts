import type { LLMAdapter, LoopResult, Message } from './loop/react-loop';
import { reactLoop } from './loop/react-loop';
import { SessionAccessDeniedError, SessionNotFoundError } from './stores/errors';
import type { AgentSession, AgentStore } from './stores/types';
import type { AgentContext, AgentDefinition, ToolDefinition } from './types';

// ---------------------------------------------------------------------------
// Run options — discriminated union
// ---------------------------------------------------------------------------

/** Base options shared by both modes. */
interface RunOptionsBase {
  /** The user message to send to the agent. */
  readonly message: string;
  /** The LLM adapter to use for chat completions. */
  readonly llm: LLMAdapter;
  /** Optional instance ID for the agent. Defaults to a random ID. */
  readonly instanceId?: string;
}

/** Stateless mode — no persistence. Same as current behavior. */
export interface RunOptionsStateless extends RunOptionsBase {
  readonly store?: undefined;
}

/** Session mode — persistence enabled. */
export interface RunOptionsWithStore extends RunOptionsBase {
  readonly store: AgentStore;
  /** Resume an existing session. Omit to create a new one. */
  readonly sessionId?: string;
  /** Cap per session (default: 200). */
  readonly maxStoredMessages?: number;
  /** User ID for session ownership. */
  readonly userId?: string | null;
  /** Tenant ID for session scoping. */
  readonly tenantId?: string | null;
}

export type RunOptions = RunOptionsStateless | RunOptionsWithStore;

// ---------------------------------------------------------------------------
// Result types — discriminated by persistence mode
// ---------------------------------------------------------------------------

/** Result from a stateless run — no sessionId. */
export interface StatelessLoopResult {
  readonly status: LoopResult['status'];
  readonly response: string;
  readonly iterations: number;
  readonly messages: readonly Message[];
}

/** Result from a session run — includes sessionId. */
export interface SessionLoopResult extends StatelessLoopResult {
  readonly sessionId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSessionId(): string {
  return `sess_${crypto.randomUUID()}`;
}

function hasStore(opts: RunOptions): opts is RunOptionsWithStore {
  return opts.store !== undefined;
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
  opts: RunOptionsStateless,
): Promise<StatelessLoopResult>;
export async function run(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- overload signature
  agentDef: AgentDefinition<any, any, any>,
  opts: RunOptionsWithStore,
): Promise<SessionLoopResult>;
export async function run(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- implementation signature
  agentDef: AgentDefinition<any, any, any>,
  options: RunOptions,
): Promise<StatelessLoopResult | SessionLoopResult> {
  const { message, llm, instanceId } = options;
  const agentId = instanceId ?? crypto.randomUUID();
  const userId = hasStore(options) ? (options.userId ?? null) : null;
  const tenantId = hasStore(options) ? (options.tenantId ?? null) : null;

  // --- Session handling (load or create) ---
  let sessionId: string | undefined;
  let previousMessages: Message[] | undefined;
  let initialState = structuredClone(agentDef.initialState);
  let existingCreatedAt: string | undefined;

  if (hasStore(options)) {
    const { store } = options;

    if (options.sessionId) {
      // Resume existing session
      const session = await store.loadSession(options.sessionId);

      if (!session) {
        throw new SessionNotFoundError(options.sessionId);
      }

      // Ownership check
      if (session.userId && userId !== session.userId) {
        throw new SessionAccessDeniedError(options.sessionId);
      }
      if (session.tenantId && tenantId !== session.tenantId) {
        throw new SessionAccessDeniedError(options.sessionId);
      }

      sessionId = session.id;
      existingCreatedAt = session.createdAt;

      // Restore state — parse, validate, fall back to initialState on failure
      try {
        const parsed = JSON.parse(session.state);
        const validated = agentDef.state.parse(parsed);
        initialState = validated;
      } catch {
        // State validation failed — use initial state (agent definition may have changed)
        initialState = structuredClone(agentDef.initialState);
      }

      // Load previous messages (excluding system prompts)
      previousMessages = await store.loadMessages(sessionId);
    } else {
      // Create new session
      sessionId = generateSessionId();
    }
  }

  // Create agent context
  const ctx: AgentContext = {
    agent: { id: agentId, name: agentDef.name },
    state: initialState,
    userId,
    tenantId,
    authenticated() {
      return userId !== null;
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

  // Build agent invoker for ctx.agents.invoke()
  const agents = {
    async invoke(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- agent definitions have varying types
      targetAgent: AgentDefinition<any, any, any>,
      invokeOpts: { message: string; instanceId?: string },
    ) {
      const invokeResult = await run(targetAgent, {
        message: invokeOpts.message,
        llm,
        instanceId: invokeOpts.instanceId,
      });
      return { response: invokeResult.response };
    },
  };

  // Run the ReAct loop
  const result = await reactLoop({
    llm,
    tools: agentDef.tools as Record<string, ToolDefinition<unknown, unknown>>,
    systemPrompt,
    userMessage: message,
    maxIterations: agentDef.loop.maxIterations,
    stuckThreshold: agentDef.loop.stuckThreshold,
    toolContext: { agentId, agentName: agentDef.name, agents },
    checkpointInterval: agentDef.loop.checkpointInterval,
    previousMessages,
    tokenBudget: agentDef.loop.tokenBudget,
    diminishingReturns: agentDef.loop.diminishingReturns,
    maxToolConcurrency: agentDef.loop.maxToolConcurrency,
    contextCompression: agentDef.loop.contextCompression,
  });

  // Lifecycle: onComplete or onStuck
  if (result.status === 'complete') {
    if (agentDef.onComplete) {
      await agentDef.onComplete(ctx);
    }
  } else if (
    result.status === 'max-iterations' ||
    result.status === 'stuck' ||
    result.status === 'token-budget-exhausted' ||
    result.status === 'diminishing-returns'
  ) {
    if (agentDef.onStuck) {
      await agentDef.onStuck(ctx);
    }
  }

  // --- Persist session (if store provided and not an error) ---
  if (hasStore(options) && sessionId) {
    const { store } = options;

    if (result.status !== 'error') {
      const now = new Date().toISOString();
      const createdAt = existingCreatedAt ?? now;

      const session: AgentSession = {
        id: sessionId,
        agentName: agentDef.name,
        userId,
        tenantId,
        state: JSON.stringify(ctx.state),
        createdAt,
        updatedAt: now,
      };

      await store.saveSession(session);

      // Persist new messages (exclude system prompts)
      const newMessages = result.messages.filter((m) => m.role !== 'system');
      // If resuming, only persist messages from this turn (not the loaded ones)
      const messagesToPersist = previousMessages
        ? newMessages.slice(previousMessages.length)
        : newMessages;

      if (messagesToPersist.length > 0) {
        await store.appendMessages(sessionId, [...messagesToPersist]);
      }

      // Prune messages if maxStoredMessages is set
      const maxStored = options.maxStoredMessages;
      if (maxStored !== undefined) {
        await store.pruneMessages(sessionId, maxStored);
      }
    }

    return {
      status: result.status,
      response: result.response,
      iterations: result.iterations,
      messages: result.messages,
      sessionId,
    };
  }

  return result;
}
