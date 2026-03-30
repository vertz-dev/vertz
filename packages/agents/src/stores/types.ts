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

  /** Append messages to a session. Assigns seq values starting from the current max + 1. */
  appendMessages(sessionId: string, messages: Message[]): Promise<void>;

  /** Delete a session and all its messages. */
  deleteSession(sessionId: string): Promise<void>;

  /** List sessions, optionally filtered. Ordered by updatedAt descending. */
  listSessions(filter?: ListSessionsFilter): Promise<AgentSession[]>;
}
