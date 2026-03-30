import type { Message } from '../loop/react-loop';
import type { AgentSession, AgentStore, ListSessionsFilter } from './types';

/**
 * In-memory store for agent sessions and messages.
 * Sessions are lost on process restart. Useful for testing.
 */
export function memoryStore(): AgentStore {
  const sessions = new Map<string, AgentSession>();
  const messages = new Map<string, Message[]>();

  return {
    async loadSession(sessionId) {
      return sessions.get(sessionId) ?? null;
    },

    async saveSession(session) {
      sessions.set(session.id, session);
    },

    async loadMessages(sessionId) {
      return [...(messages.get(sessionId) ?? [])];
    },

    async appendMessages(sessionId, newMessages) {
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
  };
}
