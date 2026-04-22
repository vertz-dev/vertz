import type { Message } from '../loop/react-loop';

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** A session represents one conversation with an agent instance. */
export interface AgentSession {
  readonly id: string;
  readonly agentName: string;
  readonly userId: string | null;
  readonly tenantId: string | null;
  readonly state: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

/** Filter options for listing sessions. */
export interface ListSessionsFilter {
  readonly agentName?: string;
  readonly userId?: string;
  readonly limit?: number;
}

/** Pluggable persistence backend for agent sessions and messages. */
export interface AgentStore {
  /** Load an existing session. Returns null if not found. */
  loadSession(sessionId: string): Promise<AgentSession | null>;

  /** Create or update a session. */
  saveSession(session: AgentSession): Promise<void>;

  /** Load all messages for a session, ordered by sequence. */
  loadMessages(sessionId: string): Promise<Message[]>;

  /**
   * Append messages to a session. Assigns seq values starting from the current max + 1.
   *
   * `session` is passed so stores can denormalize `userId`/`tenantId` onto the message rows,
   * which is what makes `rules.where({ userId: rules.user.id })` work on the `Message` entity
   * in the entity-bridge integration (#2847). Callers already have a session in scope here
   * (the atomic variant `appendMessagesAtomic` has always had this parameter).
   */
  appendMessages(sessionId: string, messages: Message[], session: AgentSession): Promise<void>;

  /** Delete the oldest messages for a session, keeping only the most recent `keepCount`. */
  pruneMessages(sessionId: string, keepCount: number): Promise<void>;

  /** Delete a session and all its messages. */
  deleteSession(sessionId: string): Promise<void>;

  /** List sessions, optionally filtered. Ordered by updatedAt descending. */
  listSessions(filter?: ListSessionsFilter): Promise<AgentSession[]>;

  /**
   * Atomically append messages AND upsert the session row in a single
   * transaction (D1 `batch`, SQLite `transaction`, etc.). Readers must
   * observe either all of the writes or none — no partial visibility.
   *
   * Implementations must not `await` between internal statements; the whole
   * atomic unit runs as one driver-level transaction over already-resolved
   * data. The memory store cannot provide durability and throws
   * `MemoryStoreNotDurableError` on any call.
   *
   * Used on every step boundary under durable execution (`run()` called
   * with `store + sessionId`). Replaces the end-of-run
   * `saveSession` + `appendMessages` pair for that path.
   */
  appendMessagesAtomic(
    sessionId: string,
    messages: Message[],
    session: AgentSession,
  ): Promise<void>;
}
