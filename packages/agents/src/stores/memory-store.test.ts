import { describe, expect, it } from '@vertz/test';
import type { Message } from '../loop/react-loop';
import { memoryStore } from './memory-store';
import type { AgentSession } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'sess_test-1',
    agentName: 'test-agent',
    userId: 'user-1',
    tenantId: 'tenant-1',
    state: '{}',
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('memoryStore()', () => {
  describe('Given a new memory store', () => {
    describe('When loadSession is called with a non-existent ID', () => {
      it('Then returns null', async () => {
        const store = memoryStore();
        const result = await store.loadSession('sess_nonexistent');
        expect(result).toBeNull();
      });
    });
  });

  describe('Given a session is saved', () => {
    describe('When loadSession is called with the same ID', () => {
      it('Then returns the saved session', async () => {
        const store = memoryStore();
        const session = makeSession();

        await store.saveSession(session);
        const loaded = await store.loadSession('sess_test-1');

        expect(loaded).toEqual(session);
      });
    });
  });

  describe('Given a session is saved twice with updated state', () => {
    describe('When loadSession is called', () => {
      it('Then returns the updated session', async () => {
        const store = memoryStore();
        await store.saveSession(makeSession({ state: '{"count":0}' }));
        await store.saveSession(
          makeSession({ state: '{"count":5}', updatedAt: '2026-03-30T01:00:00.000Z' }),
        );

        const loaded = await store.loadSession('sess_test-1');
        expect(loaded!.state).toBe('{"count":5}');
        expect(loaded!.updatedAt).toBe('2026-03-30T01:00:00.000Z');
      });
    });
  });

  describe('Given messages are appended to a session', () => {
    describe('When loadMessages is called', () => {
      it('Then returns the messages in order', async () => {
        const store = memoryStore();
        const messages: Message[] = [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ];

        await store.appendMessages('sess_test-1', messages);
        const loaded = await store.loadMessages('sess_test-1');

        expect(loaded).toHaveLength(2);
        expect(loaded[0].role).toBe('user');
        expect(loaded[0].content).toBe('Hello');
        expect(loaded[1].role).toBe('assistant');
        expect(loaded[1].content).toBe('Hi there!');
      });
    });
  });

  describe('Given messages are appended in multiple calls', () => {
    describe('When loadMessages is called', () => {
      it('Then returns all messages in append order', async () => {
        const store = memoryStore();

        await store.appendMessages('sess_test-1', [
          { role: 'user', content: 'First' },
          { role: 'assistant', content: 'Response 1' },
        ]);
        await store.appendMessages('sess_test-1', [
          { role: 'user', content: 'Second' },
          { role: 'assistant', content: 'Response 2' },
        ]);

        const loaded = await store.loadMessages('sess_test-1');
        expect(loaded).toHaveLength(4);
        expect(loaded[0].content).toBe('First');
        expect(loaded[3].content).toBe('Response 2');
      });
    });
  });

  describe('Given a session is deleted', () => {
    describe('When loadSession and loadMessages are called', () => {
      it('Then returns null for session and empty array for messages', async () => {
        const store = memoryStore();
        await store.saveSession(makeSession());
        await store.appendMessages('sess_test-1', [{ role: 'user', content: 'Hello' }]);

        await store.deleteSession('sess_test-1');

        expect(await store.loadSession('sess_test-1')).toBeNull();
        expect(await store.loadMessages('sess_test-1')).toEqual([]);
      });
    });
  });

  describe('Given multiple sessions exist', () => {
    describe('When listSessions is called without filters', () => {
      it('Then returns all sessions ordered by updatedAt descending', async () => {
        const store = memoryStore();
        await store.saveSession(
          makeSession({
            id: 'sess_1',
            agentName: 'agent-a',
            updatedAt: '2026-03-30T01:00:00.000Z',
          }),
        );
        await store.saveSession(
          makeSession({
            id: 'sess_2',
            agentName: 'agent-b',
            updatedAt: '2026-03-30T03:00:00.000Z',
          }),
        );
        await store.saveSession(
          makeSession({
            id: 'sess_3',
            agentName: 'agent-a',
            updatedAt: '2026-03-30T02:00:00.000Z',
          }),
        );

        const sessions = await store.listSessions();
        expect(sessions).toHaveLength(3);
        expect(sessions[0].id).toBe('sess_2');
        expect(sessions[1].id).toBe('sess_3');
        expect(sessions[2].id).toBe('sess_1');
      });
    });
  });

  describe('Given multiple sessions exist', () => {
    describe('When listSessions is called with agentName filter', () => {
      it('Then returns only sessions for that agent', async () => {
        const store = memoryStore();
        await store.saveSession(makeSession({ id: 'sess_1', agentName: 'agent-a' }));
        await store.saveSession(makeSession({ id: 'sess_2', agentName: 'agent-b' }));
        await store.saveSession(makeSession({ id: 'sess_3', agentName: 'agent-a' }));

        const sessions = await store.listSessions({ agentName: 'agent-a' });
        expect(sessions).toHaveLength(2);
        expect(sessions.every((s) => s.agentName === 'agent-a')).toBe(true);
      });
    });
  });

  describe('Given multiple sessions exist', () => {
    describe('When listSessions is called with userId filter', () => {
      it('Then returns only sessions for that user', async () => {
        const store = memoryStore();
        await store.saveSession(makeSession({ id: 'sess_1', userId: 'user-a' }));
        await store.saveSession(makeSession({ id: 'sess_2', userId: 'user-b' }));

        const sessions = await store.listSessions({ userId: 'user-a' });
        expect(sessions).toHaveLength(1);
        expect(sessions[0].userId).toBe('user-a');
      });
    });
  });

  describe('Given multiple sessions exist', () => {
    describe('When listSessions is called with a limit', () => {
      it('Then returns at most limit sessions', async () => {
        const store = memoryStore();
        await store.saveSession(makeSession({ id: 'sess_1' }));
        await store.saveSession(makeSession({ id: 'sess_2' }));
        await store.saveSession(makeSession({ id: 'sess_3' }));

        const sessions = await store.listSessions({ limit: 2 });
        expect(sessions).toHaveLength(2);
      });
    });
  });

  describe('Given a session with 6 messages and pruneMessages(sessionId, 4) is called', () => {
    describe('When loadMessages is called', () => {
      it('Then returns only the 4 most recent messages', async () => {
        const store = memoryStore();
        await store.appendMessages('sess_test-1', [
          { role: 'user', content: 'M1' },
          { role: 'assistant', content: 'M2' },
          { role: 'user', content: 'M3' },
          { role: 'assistant', content: 'M4' },
          { role: 'user', content: 'M5' },
          { role: 'assistant', content: 'M6' },
        ]);

        await store.pruneMessages('sess_test-1', 4);
        const messages = await store.loadMessages('sess_test-1');

        expect(messages).toHaveLength(4);
        expect(messages[0].content).toBe('M3');
        expect(messages[3].content).toBe('M6');
      });
    });
  });

  describe('Given loadMessages is called for a non-existent session', () => {
    it('Then returns an empty array', async () => {
      const store = memoryStore();
      const messages = await store.loadMessages('sess_nonexistent');
      expect(messages).toEqual([]);
    });
  });

  describe('Given deleteSession is called for a non-existent session', () => {
    it('Then does not throw', async () => {
      const store = memoryStore();
      await expect(store.deleteSession('sess_nonexistent')).resolves.toBeUndefined();
    });
  });
});
