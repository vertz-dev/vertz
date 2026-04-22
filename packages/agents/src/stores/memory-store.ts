import type { Message } from '../loop/react-loop';
import { MemoryStoreNotDurableError } from './errors';
import type { AgentSession, AgentStore, ListSessionsFilter } from './types';

/** Brand used by `run()` to detect memoryStore() without `instanceof` across HMR/bundle boundaries. */
export const MEMORY_STORE_KIND: unique symbol = Symbol.for('@vertz/agents::memoryStore');

/** Returns true if the given store was produced by `memoryStore()`. */
export function isMemoryStore(store: AgentStore): boolean {
  return (store as { [MEMORY_STORE_KIND]?: boolean })[MEMORY_STORE_KIND] === true;
}

/**
 * In-memory store for agent sessions and messages.
 * Sessions are lost on process restart. Useful for testing.
 *
 * Non-durable by construction: `appendMessagesAtomic` always throws
 * `MemoryStoreNotDurableError`. `run()` also detects memoryStore + sessionId
 * at entry and throws before any work starts (see `isMemoryStore`).
 */
export function memoryStore(): AgentStore {
  const sessions = new Map<string, AgentSession>();
  const messages = new Map<string, Message[]>();

  const store: AgentStore & { [MEMORY_STORE_KIND]: true } = {
    [MEMORY_STORE_KIND]: true,
    async loadSession(sessionId) {
      return sessions.get(sessionId) ?? null;
    },

    async saveSession(session) {
      sessions.set(session.id, session);
    },

    async loadMessages(sessionId) {
      return [...(messages.get(sessionId) ?? [])];
    },

    async appendMessages(sessionId, newMessages, _session) {
      // `_session` is unused — memoryStore doesn't back entity reads, so there's no
      // denormalized userId/tenantId to persist.
      const existing = messages.get(sessionId) ?? [];
      existing.push(...newMessages);
      messages.set(sessionId, existing);
    },

    async pruneMessages(sessionId, keepCount) {
      const existing = messages.get(sessionId);
      if (existing && existing.length > keepCount) {
        messages.set(sessionId, existing.slice(existing.length - keepCount));
      }
    },

    async deleteSession(sessionId) {
      sessions.delete(sessionId);
      messages.delete(sessionId);
    },

    async listSessions(filter?: ListSessionsFilter) {
      let result = [...sessions.values()];

      if (filter?.agentName) {
        result = result.filter((s) => s.agentName === filter.agentName);
      }
      if (filter?.userId) {
        result = result.filter((s) => s.userId === filter.userId);
      }

      result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      if (filter?.limit) {
        result = result.slice(0, filter.limit);
      }

      return result;
    },

    async appendMessagesAtomic(_sessionId, _newMessages, _session) {
      throw new MemoryStoreNotDurableError();
    },
  };

  return store;
}
