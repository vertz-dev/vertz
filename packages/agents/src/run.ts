import { ToolDurabilityError, serializeToolDurabilityError } from './errors';
import type {
  LLMAdapter,
  LoopResult,
  Message,
  TokenUsageSummary,
  ToolCall,
  ToolCallSummaryEntry,
} from './loop/react-loop';
import { reactLoop } from './loop/react-loop';
import {
  MemoryStoreNotDurableError,
  SessionAccessDeniedError,
  SessionNotFoundError,
} from './stores/errors';
import { isMemoryStore } from './stores/memory-store';
import type { AgentSession, AgentStore } from './stores/types';
import type { AgentContext, AgentDefinition, ToolDefinition, ToolProvider } from './types';

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
  /**
   * Tool handler implementations to inject at runtime.
   * Provider handlers override handlers defined on the tool itself.
   * Only tools declared in the agent's `tools` record are resolved —
   * extra provider entries are ignored.
   */
  readonly tools?: ToolProvider;
  /**
   * Identity of the caller. Propagates to `ctx.userId` inside the agent and to
   * any sub-agents invoked via `ctx.agents.invoke()`. Also used for session
   * ownership checks when a store is provided.
   */
  readonly userId?: string | null;
  /**
   * Tenant of the caller. Propagates to `ctx.tenantId` and is used for session
   * scoping when a store is provided.
   */
  readonly tenantId?: string | null;
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
  readonly tokenUsage?: TokenUsageSummary;
  readonly compressionCount?: number;
  readonly toolCallSummary?: readonly ToolCallSummaryEntry[];
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

/**
 * Scan the loaded message history for an "orphaned" assistant-with-toolCalls —
 * an assistant message whose tool_call ids are not all matched by tool_result
 * messages that come after it. Returns the missing tool_calls, or null if the
 * history is consistent.
 */
function findOrphanAssistantWithToolCalls(
  messages: readonly Message[],
): { missingToolCalls: ToolCall[] } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      const laterToolResultIds = new Set(
        messages
          .slice(i + 1)
          .filter(
            (x): x is Message & { toolCallId: string } =>
              x.role === 'tool' && typeof x.toolCallId === 'string',
          )
          .map((x) => x.toolCallId),
      );
      const missing = m.toolCalls.filter(
        (tc): tc is ToolCall & { id: string } =>
          typeof tc.id === 'string' && tc.id.length > 0 && !laterToolResultIds.has(tc.id),
      );
      return missing.length > 0 ? { missingToolCalls: [...missing] } : null;
    }
    if (m.role !== 'tool') {
      // Reached a non-tool, non-assistant row (typically `user`) without
      // finding an assistant-with-toolCalls closer to the tail → no orphan.
      break;
    }
  }
  return null;
}

/**
 * Merge a ToolProvider's handlers into the agent's tool definitions.
 * Creates new (unfrozen) objects — never mutates frozen definitions.
 * Provider handlers override definition handlers.
 */
function mergeToolProvider(
  agentTools: Record<string, ToolDefinition<unknown, unknown>>,
  provider?: ToolProvider,
): Record<string, ToolDefinition<unknown, unknown>> {
  if (!provider) return agentTools;

  const merged: Record<string, ToolDefinition<unknown, unknown>> = {};
  for (const [name, def] of Object.entries(agentTools)) {
    const providerHandler = provider[name];
    if (providerHandler) {
      merged[name] = { ...def, handler: providerHandler };
    } else {
      merged[name] = def;
    }
  }
  return merged;
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
  const userId = options.userId ?? null;
  const tenantId = options.tenantId ?? null;

  // --- Session handling (load or create) ---
  let sessionId: string | undefined;
  let previousMessages: Message[] | undefined;
  let initialState = structuredClone(agentDef.initialState);
  let existingCreatedAt: string | undefined;

  if (hasStore(options)) {
    const { store } = options;

    // Fail fast if a sessionId is paired with the non-durable memory store —
    // otherwise a chat-only agent (no tool calls) would silently appear to
    // work and lose data on restart. See #2835.
    if (options.sessionId && isMemoryStore(store)) {
      throw new MemoryStoreNotDurableError();
    }

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

      // Resume detection: if the last assistant message has toolCalls and
      // any tool_result is missing, the previous run crashed between the
      // pre-dispatch write and the post-dispatch write. Persist synthetic
      // ToolDurabilityError tool_results for the missing ids so the loop
      // resumes with a consistent conversation. (Phase 3 of #2835.)
      const orphan = findOrphanAssistantWithToolCalls(previousMessages);
      if (orphan && !isMemoryStore(store)) {
        const now = new Date().toISOString();
        const syntheticResults: Message[] = orphan.missingToolCalls.map((tc) => ({
          role: 'tool',
          content: serializeToolDurabilityError(new ToolDurabilityError(tc.id ?? '', tc.name)),
          toolCallId: tc.id ?? '',
          toolName: tc.name,
        }));
        await store.appendMessagesAtomic(sessionId, syntheticResults, {
          id: sessionId,
          agentName: agentDef.name,
          userId,
          tenantId,
          state: JSON.stringify(initialState),
          createdAt: existingCreatedAt ?? now,
          updatedAt: now,
        });
        previousMessages = [...previousMessages, ...syntheticResults];
      }
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

  // Merge tool provider handlers into agent tool definitions
  const resolvedTools = mergeToolProvider(
    agentDef.tools as Record<string, ToolDefinition<unknown, unknown>>,
    options.tools,
  );

  // Build agent invoker for ctx.agents.invoke().
  // Sub-agents inherit the parent's identity by default; an explicit `as`
  // override can substitute either field (set to `null` to drop identity).
  const agents = {
    async invoke(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- agent definitions have varying types
      targetAgent: AgentDefinition<any, any, any>,
      invokeOpts: {
        message: string;
        instanceId?: string;
        as?: { userId?: string | null; tenantId?: string | null };
      },
    ) {
      const childUserId =
        invokeOpts.as && 'userId' in invokeOpts.as ? (invokeOpts.as.userId ?? null) : userId;
      const childTenantId =
        invokeOpts.as && 'tenantId' in invokeOpts.as ? (invokeOpts.as.tenantId ?? null) : tenantId;

      const invokeResult = await run(targetAgent, {
        message: invokeOpts.message,
        llm,
        instanceId: invokeOpts.instanceId,
        tools: options.tools, // inherit tool provider for sub-agents
        userId: childUserId,
        tenantId: childTenantId,
      });
      return { response: invokeResult.response };
    },
  };

  // Durable execution is active when the caller pairs a durable store with
  // a sessionId. In that mode, we persist per-step via appendMessagesAtomic
  // instead of a single end-of-run flush.
  const durable = hasStore(options) && sessionId !== undefined && !isMemoryStore(options.store);
  const durableStore = durable ? options.store : null;

  let writtenByLoop = 0;

  function buildSession(): AgentSession {
    const now = new Date().toISOString();
    return {
      id: sessionId!,
      agentName: agentDef.name,
      userId,
      tenantId,
      state: JSON.stringify(ctx.state),
      createdAt: existingCreatedAt ?? now,
      updatedAt: now,
    };
  }

  // Under durable execution, the new turn's user message is persisted
  // alongside the FIRST persistStep write (bundled atomically). That way,
  // if the LLM call fails before any step runs, nothing lands in the store
  // and readers observe the session at its pre-turn state.
  let userPersisted = false;
  const newUserMessage: Message = { role: 'user', content: message };

  // Run the ReAct loop
  const result = await reactLoop({
    llm,
    tools: resolvedTools,
    systemPrompt,
    userMessage: message,
    maxIterations: agentDef.loop.maxIterations,
    stuckThreshold: agentDef.loop.stuckThreshold,
    toolContext: { agentId, agentName: agentDef.name, agents },
    previousMessages,
    tokenBudget: agentDef.loop.tokenBudget,
    diminishingReturns: agentDef.loop.diminishingReturns,
    maxToolConcurrency: agentDef.loop.maxToolConcurrency,
    contextCompression: agentDef.loop.contextCompression,
    persistStep:
      durable && durableStore
        ? async ({ newMessages }) => {
            const batch = userPersisted ? [...newMessages] : [newUserMessage, ...newMessages];
            userPersisted = true;
            await durableStore.appendMessagesAtomic(sessionId!, batch, buildSession());
            writtenByLoop += batch.length;
          }
        : undefined,
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

  // Validate agent output against schema (if defined and agent completed)
  if (agentDef.output && result.status === 'complete' && result.response) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.response);
    } catch {
      // Response is not valid JSON — return error status
      return {
        status: 'error',
        response: result.response,
        iterations: result.iterations,
        messages: result.messages,
        tokenUsage: result.tokenUsage,
        compressionCount: result.compressionCount,
        toolCallSummary: result.toolCallSummary,
      };
    }

    const validation = agentDef.output.parse(parsed);
    if (!validation.ok) {
      return {
        status: 'error',
        response: result.response,
        iterations: result.iterations,
        messages: result.messages,
        tokenUsage: result.tokenUsage,
        compressionCount: result.compressionCount,
        toolCallSummary: result.toolCallSummary,
      };
    }
  }

  // --- Persist session (if store provided and not an error) ---
  if (hasStore(options) && sessionId) {
    const { store } = options;

    if (result.status !== 'error') {
      if (durable && durableStore) {
        // Compute what reactLoop produced NEW in this turn (skipping system
        // prompt and any pre-existing resumed messages).
        const newSinceResume = result.messages
          .filter((m) => m.role !== 'system')
          .slice(previousMessages?.length ?? 0);

        // Already persisted by persistStep: writtenByLoop messages plus the
        // user message if it was bundled into the first persist.
        const alreadyPersisted = (userPersisted ? 0 : 0) + writtenByLoop + (userPersisted ? 1 : 0);
        // Unpersisted tail: user message (if loop never called persistStep)
        // plus any trailing text-only assistant response.
        const tail = userPersisted ? newSinceResume.slice(alreadyPersisted) : newSinceResume; // includes the user message
        if (tail.length > 0) {
          await durableStore.appendMessagesAtomic(sessionId, [...tail], buildSession());
        } else {
          // No tail to flush, but session.state may have changed via
          // onComplete — bump the session row so readers see final state.
          await durableStore.saveSession(buildSession());
        }

        // Prune messages if maxStoredMessages is set
        const maxStored = options.maxStoredMessages;
        if (maxStored !== undefined) {
          await durableStore.pruneMessages(sessionId, maxStored);
        }
      } else {
        // Non-durable legacy path: saveSession + appendMessages at end.
        const session = buildSession();
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
    }

    return {
      status: result.status,
      response: result.response,
      iterations: result.iterations,
      messages: result.messages,
      tokenUsage: result.tokenUsage,
      compressionCount: result.compressionCount,
      toolCallSummary: result.toolCallSummary,
      sessionId,
    };
  }

  return result;
}
