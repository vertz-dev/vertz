import type { Message } from '../loop/react-loop';
import type { AgentSession, AgentStore } from '../stores/types';

/**
 * Wraps an `AgentStore` so that the Nth call to `appendMessagesAtomic` throws.
 * Default: the 2nd call throws, which simulates a crash between the
 * "assistant-with-toolCalls" write and the "tool-results" write that land in
 * Phase 2 of #2835. All other store methods pass through unchanged.
 *
 * Used in `durable-resume.test.ts` to exercise resume semantics against a
 * deterministic crash point.
 *
 * @param store underlying store (typically `sqliteStore({ path: ':memory:' })`)
 * @param failOnCallNumber 1-indexed; which `appendMessagesAtomic` call to fail (default 2)
 */
export function crashAfterToolResults(store: AgentStore, failOnCallNumber: number = 2): AgentStore {
  let atomicCallCount = 0;
  return {
    loadSession: (id) => store.loadSession(id),
    saveSession: (s) => store.saveSession(s),
    loadMessages: (id) => store.loadMessages(id),
    appendMessages: (id, msgs) => store.appendMessages(id, msgs),
    pruneMessages: (id, keep) => store.pruneMessages(id, keep),
    deleteSession: (id) => store.deleteSession(id),
    listSessions: (f) => store.listSessions(f),
    async appendMessagesAtomic(sessionId: string, messages: Message[], session: AgentSession) {
      atomicCallCount++;
      if (atomicCallCount === failOnCallNumber) {
        // eslint-disable-next-line vertz-rules/no-throw-plain-error -- test-harness sentinel; not user-facing
        throw new Error('simulated crash after tool results');
      }
      await store.appendMessagesAtomic(sessionId, messages, session);
    },
  };
}
