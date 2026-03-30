# Agent Persistence Layer — Design Document (Rev 2)

> "If it builds, it works." — Vertz Vision, Principle 1

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-03-30 | Initial draft |
| 2 | 2026-03-30 | Address all review findings (DX, Product, Technical) |

### Rev 2 Changes Summary

**DX blockers resolved:**
- B1/B3: `RunOptions` is now a discriminated union — `sessionId` without `store` is a compile-time error (not a runtime trap). `LoopResult` is also discriminated: stateless runs return no `sessionId`.
- B2: `AgentRunnerFn` signature change fully specified — moves to options bag, `AgentRunResult` includes `sessionId`.

**Product blockers resolved:**
- B1: Phase 1b blockers (toolCalls on messages, tenantLevel) are already resolved in commit `0eadb6911`. Noted in prerequisites.
- B2: Session ownership model added — `userId`/`tenantId` are required on `AgentSession`, enforced on resume.
- B3: Type constraint implemented via discriminated union (same as DX B1/B3).

**Technical blockers resolved:**
- B1: `reactLoop` gets a new `previousMessages` option for injecting stored conversation history.
- B2: `AgentRunnerFn` new signature specified (same as DX B2).
- B3: Error persistence strategy defined — only complete iterations are persisted. Error turns are not stored.

**Should-fixes resolved:**
- `listSessions()` added to `AgentStore` interface.
- `AgentSession.state` clarified as `string` (JSON blob) — stores are byte-level, `run()` handles serialization.
- Message pruning specified as atomic interaction rounds (assistant + tool calls).
- Invalid `sessionId` behavior specified — throws `SessionNotFoundError`.
- `bun:sqlite` specified (not `better-sqlite3`).
- Session ID format specified: `sess_` + `crypto.randomUUID()`.
- D1 auto-migration acknowledged as v1-only; Vertz Cloud may use platform-managed tables.

---

## Prerequisites

This design builds on the `@vertz/agents` Phase 1 implementation (PR #2114) and Phase 1b fast-follows (PR #2117). Both are merged to main. Specifically:
- The `Message` type includes `toolCalls` on assistant messages (Phase 1b fix B-1)
- `tenantLevel` is included in `BaseContext` construction (Phase 1b fix B-2)

---

## Executive Summary

Add a persistence layer to `@vertz/agents` so agents can maintain state and conversation history across requests. The core insight: **persistence is a pluggable store, not a platform commitment.**

Today, `run()` creates fresh state on every call — `structuredClone(agentDef.initialState)`. This works for single-shot tasks (summarize, classify, extract) but not for conversational agents, multi-turn workflows, or agents that accumulate knowledge.

The design introduces:
1. **`AgentStore` interface** — pluggable persistence backend
2. **Session model** — conversation history + agent state keyed by session ID, scoped to user/tenant
3. **Store implementations** — `memoryStore()` (testing), `sqliteStore()` (self-hosted), `d1Store()` (Cloudflare)
4. **Server integration** — `sessionId` in request/response for multi-turn, with ownership enforcement

### Relationship to Cloudflare Agents SDK

**We do not wrap or depend on the Cloudflare Agents SDK.** That SDK is class-based, CF-only, and uses Durable Objects as the fundamental primitive. Our approach is different:

| Cloudflare Agents SDK | `@vertz/agents` |
|---|---|
| Class-based (`extends Agent`) | Config-based (`agent()` returns frozen object) |
| Durable Objects for state | Pluggable `AgentStore` interface |
| CF-only | Any runtime (Bun, Node, Workers) |
| WebSocket-first | HTTP-first, WebSocket as optimization |
| `this.state` / `this.sql` | `ctx.state` + store abstraction |

A future DO-backed store would be one `AgentStore` implementation — optional, not required.

---

## The Problem

### What works today (stateless)

```ts
const result = await run(myAgent, { message: 'Summarize this PR', llm });
// result.response = "The PR adds..."
// Agent forgets everything after this call
```

### What doesn't work (multi-turn)

```ts
// Call 1: user asks a question
const r1 = await run(myAgent, { message: 'What files changed?', llm });

// Call 2: user follows up — but agent has no memory of call 1
const r2 = await run(myAgent, { message: 'Show me the diff for the first one', llm });
// Agent: "I don't know what you're referring to" — no context
```

### What we need

```ts
// Call 1: creates a session
const r1 = await run(myAgent, { message: 'What files changed?', llm, store });
// r1.sessionId = 'sess_a1b2c3d4-...'

// Call 2: resumes the session — full conversation context
const r2 = await run(myAgent, {
  message: 'Show me the diff for the first one',
  llm,
  store,
  sessionId: r1.sessionId,
});
// Agent sees the full conversation history and responds correctly
```

---

## API Surface

### `AgentStore` interface

```ts
/** A session represents one conversation with an agent instance. */
interface AgentSession {
  readonly id: string;
  readonly agentName: string;
  readonly userId: string | null;     // Session owner (required for access control)
  readonly tenantId: string | null;   // Tenant scope
  readonly state: string;             // JSON-serialized agent state
  readonly createdAt: string;         // ISO 8601
  readonly updatedAt: string;         // ISO 8601
}

/** Pluggable persistence backend for agent sessions and messages. */
interface AgentStore {
  /** Load an existing session. Returns null if not found. */
  loadSession(sessionId: string): Promise<AgentSession | null>;

  /** Create or update a session. */
  saveSession(session: AgentSession): Promise<void>;

  /** Load all messages for a session, ordered by sequence. */
  loadMessages(sessionId: string): Promise<Message[]>;

  /** Append messages to a session. Assigns seq values starting from the current max + 1. */
  appendMessages(sessionId: string, messages: Message[]): Promise<void>;

  /** Delete a session and all its messages. */
  deleteSession(sessionId: string): Promise<void>;

  /** List sessions, optionally filtered by agent name. Ordered by updatedAt descending. */
  listSessions(filter?: { agentName?: string; userId?: string; limit?: number }): Promise<AgentSession[]>;
}
```

**Design decisions:**
- `state` is `string` (JSON blob), not `unknown`. The store is a byte-level persistence layer. `run()` handles `JSON.stringify` on save and `JSON.parse` + schema validation on load.
- `userId` and `tenantId` are top-level required fields (not buried in `metadata`). Session ownership is a security concern, not optional metadata.
- `listSessions` enables conversation management UIs and cleanup.
- `appendMessages` assigns `seq` values internally (max + 1). Callers don't manage ordering.

### Store implementations

```ts
import { memoryStore, sqliteStore } from '@vertz/agents';

// In-memory — for testing. Sessions lost on process restart.
const store = memoryStore();

// SQLite (bun:sqlite) — for self-hosted / local dev. File-based persistence.
const store = sqliteStore({ path: './data/agents.db' });

// D1 — for Cloudflare Workers. Uses the raw D1 binding (not @vertz/db wrapper).
// Separate entrypoint to avoid bundling CF types in non-CF builds.
import { d1Store } from '@vertz/agents/cloudflare';
const store = d1Store({ binding: env.DB });
```

### Updated `run()` options — discriminated union

```ts
/** Base options shared by both modes. */
interface RunOptionsBase {
  readonly message: string;
  readonly llm: LLMAdapter;
  readonly instanceId?: string;
}

/** Stateless mode — no persistence. Same as current behavior. */
interface RunOptionsStateless extends RunOptionsBase {
  readonly store?: undefined;
  // sessionId and maxStoredMessages are NOT available without a store
}

/** Session mode — persistence enabled. */
interface RunOptionsWithStore extends RunOptionsBase {
  readonly store: AgentStore;
  readonly sessionId?: string;           // Resume existing session (omit to create new)
  readonly maxStoredMessages?: number;   // Cap per session (default: 200)
}

type RunOptions = RunOptionsStateless | RunOptionsWithStore;
```

This makes `sessionId` without `store` a **compile-time error**:

```ts
// OK — stateless
await run(myAgent, { message: 'hi', llm });

// OK — new session
await run(myAgent, { message: 'hi', llm, store });

// OK — resume session
await run(myAgent, { message: 'hi', llm, store, sessionId: 'sess_...' });

// @ts-expect-error — sessionId requires store
await run(myAgent, { message: 'hi', llm, sessionId: 'sess_...' });
```

### Updated `LoopResult` — discriminated by persistence mode

```ts
/** Result from a stateless run — no sessionId. */
interface StatelessLoopResult {
  readonly status: LoopStatus;
  readonly response: string;
  readonly iterations: number;
  readonly messages: readonly Message[];
}

/** Result from a session run — includes sessionId. */
interface SessionLoopResult extends StatelessLoopResult {
  readonly sessionId: string;
}
```

`run()` overloads return the correct type:

```ts
function run(agent: AgentDefinition, opts: RunOptionsStateless): Promise<StatelessLoopResult>;
function run(agent: AgentDefinition, opts: RunOptionsWithStore): Promise<SessionLoopResult>;
```

### Updated `AgentRunnerFn` — options bag

```ts
// OLD (Phase 1b):
type AgentRunnerFn = (agentName: string, message: string, ctx: BaseContext) => Promise<AgentRunResult>;

// NEW:
interface AgentRunOptions {
  readonly message: string;
  readonly sessionId?: string;
}

type AgentRunnerFn = (
  agentName: string,
  options: AgentRunOptions,
  ctx: BaseContext,
) => Promise<AgentRunResult>;

// Updated result:
interface AgentRunResult {
  readonly status: string;
  readonly response: string;
  readonly sessionId?: string;  // Present when store is configured
}
```

The route generator extracts both `message` and `sessionId` from the request body and passes them as the options bag.

---

## Session Ownership & Access Control

### Sessions are scoped to the creating user

When `run()` creates a session (no `sessionId` provided), it stores the `userId` and `tenantId` from the `AgentContext` on the session.

When `run()` resumes a session (`sessionId` provided), it verifies:
1. The session exists — if not, throws `SessionNotFoundError`
2. The caller's `userId` matches the session's `userId` — if not, throws `SessionAccessDeniedError`
3. If the session has a `tenantId`, the caller's `tenantId` must match

```ts
// Ownership check in run():
if (session.userId && ctx.userId !== session.userId) {
  throw new SessionAccessDeniedError(sessionId);
}
if (session.tenantId && ctx.tenantId !== session.tenantId) {
  throw new SessionAccessDeniedError(sessionId);
}
```

### Server integration

The route generator already constructs a `BaseContext` with `userId`, `tenantId`, etc. This context is passed to the runner, which passes it to `run()`. The ownership check happens inside `run()` before loading messages.

This means:
- Unauthenticated users can only access sessions with `userId: null`
- A user cannot probe for another user's sessions (they get `SessionAccessDeniedError`, not `SessionNotFoundError`, to avoid oracle attacks — actually, return the same error message either way to prevent ID enumeration)

**Design decision:** Both "not found" and "access denied" return the same error message: `Session "${id}" not found or access denied`. This prevents session ID enumeration.

---

## How `run()` Changes

### `reactLoop` signature change

The `ReactLoopOptions` interface gets a new optional field:

```ts
interface ReactLoopOptions {
  // ... existing fields ...

  /** Pre-existing conversation messages (from a resumed session). Injected between system prompt and new user message. */
  readonly previousMessages?: readonly Message[];
}
```

Inside `reactLoop`, the message array construction changes:

```ts
// BEFORE:
const messages: Message[] = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: userMessage },
];

// AFTER:
const messages: Message[] = [
  { role: 'system', content: systemPrompt },
  ...(previousMessages ?? []),
  { role: 'user', content: userMessage },
];
```

This is a **backward-compatible** change — `previousMessages` defaults to `undefined`, which results in the same behavior as today.

### Full `run()` flow

```
                    ┌──────────────────────────┐
                    │  opts has store?          │
                    └────────┬─────────────────┘
                             │
               yes           │           no
        ┌────────────────────┤────────────────────┐
        │                    │                    │
        ▼                    │                    ▼
  ┌─────────────┐           │        ┌───────────────────┐
  │ sessionId?  │           │        │ Stateless mode    │
  └──────┬──────┘           │        │ structuredClone   │
         │                  │        │ initialState      │
    yes  │  no              │        └─────────┬─────────┘
    ┌────┤────┐             │                  │
    │         │             │                  │
    ▼         ▼             │                  │
 ┌────────┐ ┌──────────┐   │                  │
 │ load   │ │ create   │   │                  │
 │ session│ │ new      │   │                  │
 │ + msgs │ │ session  │   │                  │
 │ verify │ │          │   │                  │
 │ owner  │ │          │   │                  │
 └───┬────┘ └────┬─────┘   │                  │
     │           │          │                  │
     └─────┬─────┘          │                  │
           │                │                  │
           ▼                │                  ▼
  ┌──────────────────┐      │       ┌────────────────────┐
  │ reactLoop({      │      │       │ reactLoop({        │
  │   previousMsgs,  │      │       │   // no previous   │
  │   ...            │      │       │   ...              │
  │ })               │      │       │ })                 │
  └────────┬─────────┘      │       └──────────┬─────────┘
           │                │                  │
           ▼                │                  ▼
  ┌──────────────────┐      │       ┌────────────────────┐
  │ Filter messages  │      │       │ Return             │
  │ (only complete   │      │       │ StatelessLoopResult│
  │ iterations)      │      │       └────────────────────┘
  │ saveSession()    │      │
  │ appendMessages() │      │
  └────────┬─────────┘      │
           │                │
           ▼                │
  ┌──────────────────┐      │
  │ Return           │      │
  │ SessionLoopResult│      │
  │ (with sessionId) │      │
  └──────────────────┘      │
```

### Error persistence strategy

When `run()` completes with `status === 'error'`:
- **Messages from the current turn are NOT persisted.** The session state is not updated.
- The session remains at its pre-turn state, as if the turn never happened.
- The caller receives the error result and can retry.

When `run()` completes with `status === 'complete'`, `'max-iterations'`, or `'stuck'`:
- Messages are persisted.
- For `'stuck'` / `'max-iterations'`, only complete iterations are stored. A "complete iteration" = assistant message + all corresponding tool results. If the last iteration is partial (assistant requested tools but loop ended before execution), it is excluded.

This ensures the stored conversation is always structurally valid — no orphaned tool results or missing tool-call messages.

### Message handling for resumed sessions

When resuming a session, stored messages (excluding system prompts, which are never stored) become `previousMessages`. The LLM sees:

```
[system prompt]        ← always fresh from agent definition
[stored message 1]     ← from store (via previousMessages)
[stored message 2]     ← from store
...
[stored message N]     ← from store
[new user message]     ← from current run() call
```

**Design decision: system prompts are never stored.** The system prompt is regenerated from `agentDef.prompt.system` on every turn. This means updating an agent's prompt takes effect immediately without migrating stored sessions.

### Message cap (`maxStoredMessages`)

When persisting, if the total message count exceeds `maxStoredMessages`, the oldest **interaction rounds** are pruned. An interaction round is:
- A user message + the assistant's response + any tool call/result messages within that response

This ensures the conversation is never structurally broken by pruning. The very first user message is NOT exempt — if the conversation exceeds the cap, old rounds are removed from the beginning.

Default: 200 messages. This is a storage cap, not a context window cap.

---

## Invalid Session ID Behavior

When `run()` is called with a `sessionId` that doesn't exist in the store:

```ts
const result = await run(myAgent, {
  message: 'hello',
  llm,
  store,
  sessionId: 'sess_nonexistent',
});
// Throws: SessionNotFoundError('Session not found or access denied')
```

This surfaces stale session references immediately. The developer can catch and create a new session:

```ts
try {
  result = await run(myAgent, { message, llm, store, sessionId });
} catch (err) {
  if (err instanceof SessionNotFoundError) {
    result = await run(myAgent, { message, llm, store }); // new session
  } else throw err;
}
```

---

## Session ID Format

Session IDs use the format `sess_` + UUID v4:

```ts
function generateSessionId(): string {
  return `sess_${crypto.randomUUID()}`;
}
// Example: 'sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890'
```

The `sess_` prefix distinguishes session IDs from other IDs in logs and debugging. The UUID v4 ensures uniqueness. Session IDs are globally unique (not per-agent).

Developer-provided session IDs (via `sessionId` in `RunOptions`) are accepted as-is — no prefix requirement enforced. However, generated IDs always use this format.

---

## SQLite Schema

Both `sqliteStore` and `d1Store` use the same schema:

```sql
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  user_id TEXT,                  -- Session owner (null for unauthenticated)
  tenant_id TEXT,                -- Tenant scope (null for unscoped)
  state TEXT NOT NULL,           -- JSON-serialized agent state
  created_at TEXT NOT NULL,      -- ISO 8601
  updated_at TEXT NOT NULL       -- ISO 8601
);

CREATE INDEX IF NOT EXISTS idx_sessions_agent ON agent_sessions(agent_name);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON agent_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON agent_sessions(updated_at);

CREATE TABLE IF NOT EXISTS agent_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,          -- Ordering within session
  role TEXT NOT NULL,             -- 'user' | 'assistant' | 'tool'
  content TEXT NOT NULL,
  tool_call_id TEXT,              -- For tool result messages
  tool_name TEXT,                 -- For tool result messages
  tool_calls TEXT,                -- JSON array of ToolCall objects (for assistant messages)
  created_at TEXT NOT NULL,

  UNIQUE(session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON agent_messages(session_id, seq);
```

**Note:** System messages (`role: 'system'`) are never stored — the system prompt is regenerated from the agent definition.

### SQLite binding

- `sqliteStore` uses `bun:sqlite` (Bun's built-in SQLite), not `better-sqlite3`.
- `d1Store` uses the raw Cloudflare D1 binding (`env.DB`), which has `exec()` for DDL and `prepare().bind().all()/run()` for DML. This is NOT the `@vertz/db` wrapper — it's the raw CF binding.

### Auto-migration

Both stores auto-create tables on first access via `CREATE TABLE IF NOT EXISTS`. For D1, this uses `binding.exec()` which supports this syntax. No wrangler migration files needed.

**Note for Vertz Cloud:** In a managed platform context, these tables may be pre-created by the platform instead of auto-migrated at runtime. This is acceptable for v1.

### Concurrent writes

Concurrent writes to the same session are undefined behavior. The `UNIQUE(session_id, seq)` constraint will surface as a DB error. This is documented as a known limitation — single-writer is assumed. D1 and SQLite both have implicit write serialization (WAL mode for reads), which makes this acceptable for agent workloads.

### Message content size

D1 has a 1MB row size limit. A single tool result returning a large file could exceed this. The store does not enforce content size limits — large content will fail with a D1 error. This is documented as a known limitation.

---

## Manifesto Alignment

### Principle 1: "If it builds, it works"

- `RunOptions` is a discriminated union. `sessionId` without `store` is a compile-time error.
- `LoopResult` discriminates by persistence mode. Stateless runs don't have `sessionId` — no misleading properties.
- Session ownership is enforced at the `run()` level, not left to the developer.

### Principle 3: "AI agents are first-class users"

- The API is simple enough for an LLM to use correctly on first prompt: `run(agent, { message, llm, store })`.
- No class hierarchies, no lifecycle methods to override, no decorator magic.

### Principle 5: "One way to do things"

- One `store` parameter. Not "pass a database", "configure a provider", or "extend a class".
- Three implementations cover all deployment targets. No config matrix.

### Principle 7: "No ceilings"

- `AgentStore` is an interface — developers can implement custom stores (Redis, Postgres, DynamoDB) without framework changes.

---

## Non-Goals

1. **Durable Objects integration** — separate design doc. This covers the portable store layer.
2. **Streaming / WebSocket** — requires DO or SSE infrastructure. Out of scope.
3. **Agent-to-agent communication** — `ctx.agents.invoke()` is Phase 2 of the main agents design doc.
4. **Scheduled execution** — alarm/cron-based agent runs need DO. Out of scope.
5. **Concurrent session access** — single-writer assumed. Explicit locking is not designed here.
6. **Message summarization / context window management** — the store handles raw persistence. LLM context optimization is a ReAct loop concern.
7. **Session TTL / auto-expiry** — useful but not in v1. Can be added to the store interface later.
8. **Client-side state sync** — state is server-side only.
9. **Cross-agent session sharing** — agents accessing other agents' sessions for handoff. Deferred to agent-to-agent communication design.

---

## Unknowns

### U1: D1 table creation timing — RESOLVED

D1's `binding.exec()` supports `CREATE TABLE IF NOT EXISTS`. This has been the case since 2024. Auto-migration at runtime is valid for v1.

### U2: Message volume and D1 row limits — RESOLVED

200 messages × 2KB average × 1000 sessions = ~400MB. Well within D1's 10GB limit. The `maxStoredMessages` cap provides the safety valve.

### U3: SQLite store concurrency in self-hosted

`bun:sqlite` is synchronous. Multiple concurrent requests to the same store file serialize writes. This is acceptable for agent workloads (not high-throughput).

**Resolution:** Accept for v1. WAL mode handles concurrent reads. Document the limitation.

---

## Type Flow Map

```
AgentStore interface
  │
  ├─→ RunOptionsWithStore.store: AgentStore
  │     │
  │     └─→ run() loads/saves session
  │           │
  │           ├─→ AgentSession.state: string ←─→ JSON.stringify(ctx.state)
  │           │     (run() serializes on save, parses + validates on load)
  │           │
  │           └─→ Message[] ←─→ ReactLoopOptions.previousMessages
  │                 (stored messages become conversation prefix)
  │
  ├─→ CreateAgentRunnerOptions.store?: AgentStore
  │     │
  │     └─→ AgentRunnerFn receives { message, sessionId } options bag
  │           │
  │           └─→ passes store + sessionId to run()
  │
  └─→ SessionLoopResult.sessionId: string
        │
        └─→ AgentRunResult.sessionId?: string (server response)
              │
              └─→ HTTP response: { status, response, sessionId }
```

### Generic flow: state schema → stored state → restored state

```
agent('x', { state: s.object({ count: s.number() }), initialState: { count: 0 } })
                      │                                        │
                      │ TStateSchema                           │ TState = { count: number }
                      │                                        │
                      ▼                                        ▼
              AgentDefinition.state: SchemaAny    AgentDefinition.initialState: TState
                      │                                        │
                      │ (used for validation on load)          │ (used when no session exists)
                      ▼                                        ▼
              run() → JSON.stringify(ctx.state) → store.saveSession({ state: jsonString })
                      │
                      ▼
              store.loadSession() → session.state (JSON string)
                      │
                      ▼
              run() → JSON.parse(session.state) → agentDef.state.parse(parsed)
                      │
                      ▼
              Validated TState (or reset to initialState if validation fails + warning)
```

---

## E2E Acceptance Test

### Test 1: Multi-turn conversation with store

```ts
describe('Feature: Agent conversation persistence', () => {
  describe('Given a conversational agent with a store', () => {
    describe('When the user sends a first message', () => {
      it('Then returns a SessionLoopResult with a new sessionId', async () => {
        const store = memoryStore();
        const llm = mockLLM([
          { text: 'The auth module handles JWT validation.', toolCalls: [] },
        ]);
        const myAgent = agent('assistant', { ... });

        const r1 = await run(myAgent, { message: 'What does auth do?', llm, store });

        expect(r1.status).toBe('complete');
        expect(r1.sessionId).toMatch(/^sess_/);
        expect(r1.response).toBe('The auth module handles JWT validation.');
      });
    });

    describe('When the user sends a follow-up with the same sessionId', () => {
      it('Then the LLM receives full conversation history', async () => {
        const messageSpy: Message[][] = [];
        const llm = mockLLM([
          { text: 'It validates JWTs.', toolCalls: [] },
          { text: 'It checks the exp claim.', toolCalls: [] },
        ], { onChat: (msgs) => messageSpy.push([...msgs]) });

        const r1 = await run(myAgent, { message: 'What does auth do?', llm, store });
        const r2 = await run(myAgent, {
          message: 'How does it validate tokens?',
          llm,
          store,
          sessionId: r1.sessionId,
        });

        // Second call should include conversation history
        const secondCallMessages = messageSpy[1];
        expect(secondCallMessages).toContainEqual(
          expect.objectContaining({ role: 'user', content: 'What does auth do?' }),
        );
        expect(secondCallMessages).toContainEqual(
          expect.objectContaining({ role: 'assistant', content: 'It validates JWTs.' }),
        );
        expect(secondCallMessages).toContainEqual(
          expect.objectContaining({ role: 'user', content: 'How does it validate tokens?' }),
        );
      });
    });
  });
});
```

### Test 2: State persistence across turns

```ts
describe('Given an agent with state schema', () => {
  describe('When the agent modifies state during execution', () => {
    it('Then the state is persisted and available on next turn', async () => {
      const store = memoryStore();
      const myAgent = agent('tracker', {
        state: s.object({ topic: s.string().default('none') }),
        initialState: { topic: 'none' },
        // ... tools that modify ctx.state.topic
      });

      const r1 = await run(myAgent, { message: 'Talk about auth', llm, store });

      const session = await store.loadSession(r1.sessionId);
      expect(JSON.parse(session!.state)).toEqual({ topic: 'auth' });
    });
  });
});
```

### Test 3: Server integration with sessionId round-trip

```ts
describe('Feature: Agent session via HTTP', () => {
  describe('Given a server with agent + store', () => {
    describe('When POST /api/agents/assistant/invoke with no sessionId', () => {
      it('Then returns response with new sessionId', async () => {
        const res = await fetch('/api/agents/assistant/invoke', {
          method: 'POST',
          body: JSON.stringify({ message: 'Hello' }),
        });
        const body = await res.json();
        expect(body.sessionId).toBeDefined();
        expect(body.status).toBe('complete');
      });
    });

    describe('When POST with existing sessionId', () => {
      it('Then resumes the conversation', async () => {
        const r1 = await fetch('/api/agents/assistant/invoke', {
          method: 'POST',
          body: JSON.stringify({ message: 'What is X?' }),
        });
        const { sessionId } = await r1.json();

        const r2 = await fetch('/api/agents/assistant/invoke', {
          method: 'POST',
          body: JSON.stringify({ message: 'Tell me more', sessionId }),
        });
        const body2 = await r2.json();
        expect(body2.sessionId).toBe(sessionId);
      });
    });
  });
});
```

### Test 4: No store = stateless (backward compat)

```ts
describe('Given run() called without a store', () => {
  it('Then behaves exactly as today — no sessionId on result', async () => {
    const result = await run(myAgent, { message: 'Hello', llm });
    expect(result.status).toBe('complete');
    expect('sessionId' in result).toBe(false);
  });
});
```

### Test 5: Session ownership enforcement

```ts
describe('Given a session created by user A', () => {
  describe('When user B tries to resume it', () => {
    it('Then throws SessionNotFoundError', async () => {
      // Create session as user A
      const r1 = await run(myAgent, { message: 'hi', llm, store, ctx: { userId: 'user-a' } });

      // Try to resume as user B
      await expect(
        run(myAgent, { message: 'hi', llm, store, sessionId: r1.sessionId, ctx: { userId: 'user-b' } }),
      ).rejects.toThrow('Session not found or access denied');
    });
  });
});
```

### Test 6: Invalid sessionId

```ts
describe('Given a non-existent sessionId', () => {
  it('Then throws SessionNotFoundError', async () => {
    await expect(
      run(myAgent, { message: 'hi', llm, store, sessionId: 'sess_nonexistent' }),
    ).rejects.toThrow('Session not found or access denied');
  });
});
```

### Negative type tests

```ts
// @ts-expect-error — sessionId without store
await run(myAgent, { message: 'hi', llm, sessionId: 'abc' });

// @ts-expect-error — maxStoredMessages without store
await run(myAgent, { message: 'hi', llm, maxStoredMessages: 100 });

// Stateless result has no sessionId
const stateless = await run(myAgent, { message: 'hi', llm });
// @ts-expect-error — sessionId doesn't exist on StatelessLoopResult
stateless.sessionId;
```

---

## Implementation Phases

### Phase 1: Store interface + memory store + `run()` changes

**Acceptance criteria:**
- `AgentStore` interface defined and exported
- `AgentSession` with `userId`/`tenantId` fields
- `memoryStore()` implementation (including `listSessions`)
- `RunOptions` discriminated union (`RunOptionsStateless` | `RunOptionsWithStore`)
- `reactLoop` accepts `previousMessages` option
- `run()` loads/saves sessions, validates state on load, checks ownership
- `LoopResult` discriminated (`StatelessLoopResult` | `SessionLoopResult`)
- `SessionNotFoundError` and `SessionAccessDeniedError` error types
- Multi-turn conversation works with `memoryStore()`
- Error turns are not persisted
- `.test-d.ts`: `sessionId` without `store` is type error; stateless result has no `sessionId`

### Phase 2: SQLite store

**Acceptance criteria:**
- `sqliteStore({ path })` implementation using `bun:sqlite`
- Auto-creates tables on first access
- Messages stored with ordering (`seq` column, assigned by store)
- `maxStoredMessages` enforced — prunes complete interaction rounds
- `deleteSession()` cascades to messages
- `listSessions()` with filtering
- Works with `:memory:` for testing
- Integration test: persist across separate `run()` calls

### Phase 3: Server integration

**Acceptance criteria:**
- `AgentRunnerFn` signature updated to options bag: `(name, { message, sessionId }, ctx)`
- `AgentRunResult` includes `sessionId?: string`
- `CreateAgentRunnerOptions` accepts `store`
- Route handler extracts `sessionId` from request body, passes through runner
- Route handler returns `sessionId` in response
- Session ownership enforced via `BaseContext.userId`/`tenantId`
- HTTP round-trip test: create session, resume session, access denied for wrong user

### Phase 4: D1 store

**Acceptance criteria:**
- `d1Store({ binding })` from `@vertz/agents/cloudflare` entrypoint
- Same SQLite schema as `sqliteStore`
- Auto-creates tables via `binding.exec()`
- Uses `prepare().bind()` for all DML (no SQL injection)
- Works with `@vertz/cloudflare`'s `createHandler()`
- Package exports configured: `"./cloudflare"` in package.json

---

## Competitive Positioning

| Framework | Persistence model | Platform lock-in | Type safety |
|---|---|---|---|
| Cloudflare Agents SDK | Durable Objects (`this.state`) | CF only | Minimal (generic `State`) |
| LangChain | Class-based memory types | None | None (Python) |
| Vercel AI SDK | No built-in persistence | None | Good |
| **Vertz** | Pluggable `AgentStore` interface | None (CF/Bun/Node) | Full (discriminated unions) |

The Vertz approach is unique in combining **pluggable persistence** (not locked to any platform) with **full type safety** (the type system prevents invalid state configurations). No other framework offers both.
