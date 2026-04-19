import { Database } from '@vertz/sqlite';
import { describe, expect, it } from '@vertz/test';
import type { Message } from '../loop/react-loop';
import { d1Store } from './d1-store';
import type { D1Binding } from './d1-store';
import type { AgentSession } from './types';

// ---------------------------------------------------------------------------
// Mock D1 binding using @vertz/sqlite
// ---------------------------------------------------------------------------

/**
 * Creates a mock D1 binding backed by @vertz/sqlite in-memory.
 * This mimics the D1 API surface used by d1Store.
 */
function mockD1Binding(): D1Binding {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');

  type MockStmt = ReturnType<typeof makePrepared>;

  function makePrepared(query: string) {
    const stmt = db.prepare(query);

    const self = {
      _params: [] as unknown[],

      bind(...values: unknown[]) {
        self._params = values;
        return self;
      },

      async all<T>(): Promise<{ results: T[]; success: boolean }> {
        const results = stmt.all(...self._params) as T[];
        return { results, success: true };
      },

      async run(): Promise<{ results: unknown[]; success: boolean }> {
        stmt.run(...self._params);
        return { results: [], success: true };
      },

      async first<T>(): Promise<T | null> {
        const result = stmt.get(...self._params) as T | null;
        return result ?? null;
      },
    };

    return self;
  }

  return {
    async exec(query: string) {
      db.exec(query);
      return {};
    },

    prepare(query: string) {
      return makePrepared(query);
    },

    async batch(statements: MockStmt[]) {
      const results = [];
      const tx = db.transaction(() => {
        for (const s of statements) {
          s.run();
          results.push({ results: [], success: true });
        }
      });
      tx();
      return results;
    },
  };
}

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

describe('d1Store()', () => {
  describe('Given a D1 store', () => {
    describe('When loadSession is called with a non-existent ID', () => {
      it('Then returns null', async () => {
        const store = d1Store({ binding: mockD1Binding() });
        const result = await store.loadSession('sess_nonexistent');
        expect(result).toBeNull();
      });
    });
  });

  describe('Given a session is saved', () => {
    describe('When loadSession is called with the same ID', () => {
      it('Then returns the saved session', async () => {
        const store = d1Store({ binding: mockD1Binding() });
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
        const store = d1Store({ binding: mockD1Binding() });
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

  describe('Given a session is saved and then re-saved with updated userId/tenantId', () => {
    describe('When loadSession is called', () => {
      it('Then returns the updated userId and tenantId', async () => {
        const store = d1Store({ binding: mockD1Binding() });
        await store.saveSession(makeSession({ userId: null, tenantId: null }));

        await store.saveSession(
          makeSession({
            userId: 'user-new',
            tenantId: 'tenant-new',
            updatedAt: '2026-03-30T01:00:00.000Z',
          }),
        );

        const loaded = await store.loadSession('sess_test-1');
        expect(loaded!.userId).toBe('user-new');
        expect(loaded!.tenantId).toBe('tenant-new');
      });
    });
  });

  describe('Given messages are appended to a session', () => {
    describe('When loadMessages is called', () => {
      it('Then returns the messages in order', async () => {
        const store = d1Store({ binding: mockD1Binding() });
        await store.saveSession(makeSession());
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

  describe('Given messages with tool metadata', () => {
    describe('When appendMessages and loadMessages are called', () => {
      it('Then preserves toolCallId, toolName, and toolCalls', async () => {
        const store = d1Store({ binding: mockD1Binding() });
        await store.saveSession(makeSession());
        const messages: Message[] = [
          { role: 'user', content: 'Use the tool' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [{ id: 'call_1', name: 'myTool', arguments: { x: 1 } }],
          },
          { role: 'tool', content: '{"result": 42}', toolCallId: 'call_1', toolName: 'myTool' },
        ];

        await store.appendMessages('sess_test-1', messages);
        const loaded = await store.loadMessages('sess_test-1');

        expect(loaded).toHaveLength(3);
        expect(loaded[1].toolCalls).toEqual([
          { id: 'call_1', name: 'myTool', arguments: { x: 1 } },
        ]);
        expect(loaded[2].toolCallId).toBe('call_1');
        expect(loaded[2].toolName).toBe('myTool');
      });
    });
  });

  describe('Given a session with 6 messages and pruneMessages(sessionId, 4) is called', () => {
    describe('When loadMessages is called', () => {
      it('Then returns only the 4 most recent messages', async () => {
        const store = d1Store({ binding: mockD1Binding() });
        await store.saveSession(makeSession());
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

  describe('Given a session is deleted', () => {
    describe('When loadSession and loadMessages are called', () => {
      it('Then returns null for session and empty array for messages', async () => {
        const store = d1Store({ binding: mockD1Binding() });
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
        const store = d1Store({ binding: mockD1Binding() });
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
        const store = d1Store({ binding: mockD1Binding() });
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
    describe('When listSessions is called with a limit', () => {
      it('Then returns at most limit sessions', async () => {
        const store = d1Store({ binding: mockD1Binding() });
        await store.saveSession(makeSession({ id: 'sess_1' }));
        await store.saveSession(makeSession({ id: 'sess_2' }));
        await store.saveSession(makeSession({ id: 'sess_3' }));

        const sessions = await store.listSessions({ limit: 2 });
        expect(sessions).toHaveLength(2);
      });
    });
  });

  describe('Given tables are auto-created', () => {
    describe('When the store is used for the first time', () => {
      it('Then tables are created transparently', async () => {
        const binding = mockD1Binding();
        const store = d1Store({ binding });

        // First operation should trigger table creation
        const result = await store.loadSession('sess_nonexistent');
        expect(result).toBeNull();

        // Subsequent operations should work
        await store.saveSession(makeSession());
        const loaded = await store.loadSession('sess_test-1');
        expect(loaded!.id).toBe('sess_test-1');
      });
    });
  });

  describe('appendMessagesAtomic', () => {
    describe('Given a session + 2 messages', () => {
      it('Then the session is upserted and both messages are visible after the call', async () => {
        const store = d1Store({ binding: mockD1Binding() });
        const session = makeSession();
        const messages: Message[] = [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' },
        ];

        await store.appendMessagesAtomic(session.id, messages, session);

        const loadedSession = await store.loadSession(session.id);
        expect(loadedSession).toEqual(session);
        const loaded = await store.loadMessages(session.id);
        expect(loaded).toEqual(messages);
      });
    });

    describe('Given successive atomic appends to the same session', () => {
      it('Then each message gets a monotonic sequence number (batch subquery picks up prior inserts)', async () => {
        const store = d1Store({ binding: mockD1Binding() });
        const session = makeSession();

        await store.appendMessagesAtomic(
          session.id,
          [
            { role: 'user', content: 'a' },
            { role: 'assistant', content: 'b' },
          ],
          session,
        );
        await store.appendMessagesAtomic(
          session.id,
          [
            { role: 'user', content: 'c' },
            { role: 'assistant', content: 'd' },
          ],
          session,
        );

        const loaded = await store.loadMessages(session.id);
        expect(loaded.map((m) => m.content)).toEqual(['a', 'b', 'c', 'd']);
      });
    });

    describe('Given db.batch() rejects', () => {
      it('Then no partial state is visible (atomic rollback)', async () => {
        // Wrap the mock binding to make batch() throw.
        const underlying = mockD1Binding();
        const failingBinding: D1Binding = {
          exec: underlying.exec.bind(underlying),
          prepare: underlying.prepare.bind(underlying),
          async batch() {
            // eslint-disable-next-line vertz-rules/no-throw-plain-error -- test mock simulating a driver-level failure; not user-facing
            throw new Error('simulated D1 failure');
          },
        };
        const store = d1Store({ binding: failingBinding });
        const session = makeSession();

        await expect(
          store.appendMessagesAtomic(
            session.id,
            [{ role: 'user', content: 'never-landed' }],
            session,
          ),
        ).rejects.toThrow('simulated D1 failure');

        // Recreate the store over the underlying (healthy) binding, confirm
        // no session row was written.
        const healthyStore = d1Store({ binding: underlying });
        const loadedSession = await healthyStore.loadSession(session.id);
        expect(loadedSession).toBeNull();
        const loaded = await healthyStore.loadMessages(session.id);
        expect(loaded).toEqual([]);
      });
    });

    describe('Given messages with toolCall metadata', () => {
      it('Then toolCallId, toolName, and toolCalls are preserved through the batch', async () => {
        const store = d1Store({ binding: mockD1Binding() });
        const session = makeSession();
        const messages: Message[] = [
          {
            role: 'assistant',
            content: 'calling tools',
            toolCalls: [{ id: 'call_1', name: 'postSlack', arguments: { text: 'hi' } }],
          },
          { role: 'tool', content: '{"ts":"123"}', toolCallId: 'call_1', toolName: 'postSlack' },
        ];

        await store.appendMessagesAtomic(session.id, messages, session);

        const loaded = await store.loadMessages(session.id);
        expect(loaded).toEqual(messages);
      });
    });
  });
});
