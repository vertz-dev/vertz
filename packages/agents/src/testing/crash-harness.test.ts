import { describe, expect, it } from '@vertz/test';
import { sqliteStore } from '../stores/sqlite-store';
import type { AgentSession } from '../stores/types';
import { crashAfterToolResults } from './crash-harness';

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'sess_test-1',
    agentName: 'test',
    userId: null,
    tenantId: null,
    state: '{}',
    createdAt: '2026-04-19T00:00:00.000Z',
    updatedAt: '2026-04-19T00:00:00.000Z',
    ...overrides,
  };
}

describe('crashAfterToolResults()', () => {
  describe('Given default behavior (fail on 2nd call)', () => {
    it('Then the first appendMessagesAtomic call passes through', async () => {
      const underlying = sqliteStore({ path: ':memory:' });
      const harness = crashAfterToolResults(underlying);
      const session = makeSession();

      await harness.appendMessagesAtomic(session.id, [{ role: 'user', content: 'first' }], session);

      const loaded = await underlying.loadMessages(session.id);
      expect(loaded).toEqual([{ role: 'user', content: 'first' }]);
    });

    it('Then the second appendMessagesAtomic call throws and nothing lands', async () => {
      const underlying = sqliteStore({ path: ':memory:' });
      const harness = crashAfterToolResults(underlying);
      const session = makeSession();

      await harness.appendMessagesAtomic(session.id, [{ role: 'user', content: 'first' }], session);

      await expect(
        harness.appendMessagesAtomic(
          session.id,
          [{ role: 'assistant', content: 'second' }],
          session,
        ),
      ).rejects.toThrow('simulated crash after tool results');

      const loaded = await underlying.loadMessages(session.id);
      expect(loaded).toEqual([{ role: 'user', content: 'first' }]);
    });
  });

  describe('Given failOnCallNumber is 1', () => {
    it('Then the first call throws', async () => {
      const harness = crashAfterToolResults(sqliteStore({ path: ':memory:' }), 1);
      const session = makeSession();

      await expect(harness.appendMessagesAtomic(session.id, [], session)).rejects.toThrow(
        'simulated crash after tool results',
      );
    });
  });

  describe('Given pass-through methods', () => {
    it('Then loadSession, saveSession, appendMessages, pruneMessages, deleteSession, listSessions all delegate', async () => {
      const underlying = sqliteStore({ path: ':memory:' });
      const harness = crashAfterToolResults(underlying);
      const session = makeSession({ id: 'sess_passthrough' });

      await harness.saveSession(session);
      const loaded = await harness.loadSession(session.id);
      expect(loaded).toEqual(session);

      await harness.appendMessages(session.id, [{ role: 'user', content: 'pt' }]);
      const msgs = await harness.loadMessages(session.id);
      expect(msgs).toEqual([{ role: 'user', content: 'pt' }]);

      const list = await harness.listSessions();
      expect(list).toHaveLength(1);

      await harness.deleteSession(session.id);
      expect(await harness.loadSession(session.id)).toBeNull();
    });
  });
});
