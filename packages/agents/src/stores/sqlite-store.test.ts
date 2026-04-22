import { describe, expect, it } from '@vertz/test';
import type { Message } from '../loop/react-loop';
import { sqliteStore } from './sqlite-store';
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

describe('sqliteStore()', () => {
  describe('Given an in-memory SQLite store', () => {
    describe('When loadSession is called with a non-existent ID', () => {
      it('Then returns null', async () => {
        const store = sqliteStore({ path: ':memory:' });
        const result = await store.loadSession('sess_nonexistent');
        expect(result).toBeNull();
      });
    });
  });

  describe('Given a session is saved', () => {
    describe('When loadSession is called with the same ID', () => {
      it('Then returns the saved session', async () => {
        const store = sqliteStore({ path: ':memory:' });
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
        const store = sqliteStore({ path: ':memory:' });
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
        const store = sqliteStore({ path: ':memory:' });
        await store.saveSession(makeSession());
        const messages: Message[] = [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ];

        await store.appendMessages('sess_test-1', messages, makeSession());
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
      it('Then returns all messages in append order with correct seq', async () => {
        const store = sqliteStore({ path: ':memory:' });
        await store.saveSession(makeSession());

        await store.appendMessages(
          'sess_test-1',
          [
            { role: 'user', content: 'First' },
            { role: 'assistant', content: 'Response 1' },
          ],
          makeSession(),
        );
        await store.appendMessages(
          'sess_test-1',
          [
            { role: 'user', content: 'Second' },
            { role: 'assistant', content: 'Response 2' },
          ],
          makeSession(),
        );

        const loaded = await store.loadMessages('sess_test-1');
        expect(loaded).toHaveLength(4);
        expect(loaded[0].content).toBe('First');
        expect(loaded[3].content).toBe('Response 2');
      });
    });
  });

  describe('Given messages with tool metadata', () => {
    describe('When appendMessages and loadMessages are called', () => {
      it('Then preserves toolCallId, toolName, and toolCalls', async () => {
        const store = sqliteStore({ path: ':memory:' });
        await store.saveSession(makeSession());
        const messages: Message[] = [
          { role: 'user', content: 'Use the tool' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [{ id: 'call_1', name: 'myTool', arguments: { x: 1 } }],
          },
          { role: 'tool', content: '{"result": 42}', toolCallId: 'call_1', toolName: 'myTool' },
          { role: 'assistant', content: 'The result is 42.' },
        ];

        await store.appendMessages('sess_test-1', messages, makeSession());
        const loaded = await store.loadMessages('sess_test-1');

        expect(loaded).toHaveLength(4);
        expect(loaded[1].toolCalls).toEqual([
          { id: 'call_1', name: 'myTool', arguments: { x: 1 } },
        ]);
        expect(loaded[2].toolCallId).toBe('call_1');
        expect(loaded[2].toolName).toBe('myTool');
      });
    });
  });

  describe('Given a session is deleted', () => {
    describe('When loadSession and loadMessages are called', () => {
      it('Then returns null for session and empty array for messages', async () => {
        const store = sqliteStore({ path: ':memory:' });
        await store.saveSession(makeSession());
        await store.appendMessages(
          'sess_test-1',
          [{ role: 'user', content: 'Hello' }],
          makeSession(),
        );

        await store.deleteSession('sess_test-1');

        expect(await store.loadSession('sess_test-1')).toBeNull();
        expect(await store.loadMessages('sess_test-1')).toEqual([]);
      });
    });
  });

  describe('Given multiple sessions exist', () => {
    describe('When listSessions is called without filters', () => {
      it('Then returns all sessions ordered by updatedAt descending', async () => {
        const store = sqliteStore({ path: ':memory:' });
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
        const store = sqliteStore({ path: ':memory:' });
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
        const store = sqliteStore({ path: ':memory:' });
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
        const store = sqliteStore({ path: ':memory:' });
        await store.saveSession(makeSession({ id: 'sess_1' }));
        await store.saveSession(makeSession({ id: 'sess_2' }));
        await store.saveSession(makeSession({ id: 'sess_3' }));

        const sessions = await store.listSessions({ limit: 2 });
        expect(sessions).toHaveLength(2);
      });
    });
  });

  describe('Given a session is saved and then re-saved with updated userId/tenantId', () => {
    describe('When loadSession is called', () => {
      it('Then returns the updated userId and tenantId', async () => {
        const store = sqliteStore({ path: ':memory:' });
        await store.saveSession(makeSession({ userId: null, tenantId: null }));

        // Re-save with userId and tenantId set (e.g., user authenticated after session creation)
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

  describe('Given loadMessages is called for a non-existent session', () => {
    it('Then returns an empty array', async () => {
      const store = sqliteStore({ path: ':memory:' });
      const messages = await store.loadMessages('sess_nonexistent');
      expect(messages).toEqual([]);
    });
  });

  describe('Given deleteSession is called for a non-existent session', () => {
    it('Then does not throw', async () => {
      const store = sqliteStore({ path: ':memory:' });
      await expect(store.deleteSession('sess_nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('Given a session with 6 messages and pruneMessages(sessionId, 4) is called', () => {
    describe('When loadMessages is called', () => {
      it('Then returns only the 4 most recent messages', async () => {
        const store = sqliteStore({ path: ':memory:' });
        await store.saveSession(makeSession());
        await store.appendMessages(
          'sess_test-1',
          [
            { role: 'user', content: 'M1' },
            { role: 'assistant', content: 'M2' },
            { role: 'user', content: 'M3' },
            { role: 'assistant', content: 'M4' },
            { role: 'user', content: 'M5' },
            { role: 'assistant', content: 'M6' },
          ],
          makeSession(),
        );

        await store.pruneMessages('sess_test-1', 4);
        const messages = await store.loadMessages('sess_test-1');

        expect(messages).toHaveLength(4);
        expect(messages[0].content).toBe('M3');
        expect(messages[3].content).toBe('M6');
      });
    });
  });

  describe('Given an integration test with run()', () => {
    describe('When a multi-turn conversation is run with sqliteStore', () => {
      it('Then persists and resumes across separate run() calls', async () => {
        const { agent } = await import('../agent');
        const { run } = await import('../run');
        const { s } = await import('@vertz/schema');
        const { tool } = await import('../tool');

        const noopTool = tool({
          description: 'noop',
          input: s.object({}),
          output: s.object({}),
          handler() {
            return {};
          },
        });

        const testAgent = agent('test-persist', {
          state: s.object({ count: s.number() }),
          initialState: { count: 0 },
          tools: { noop: noopTool },
          model: { provider: 'cloudflare', model: 'test' },
          loop: { maxIterations: 5 },
        });

        const store = sqliteStore({ path: ':memory:' });
        let callIndex = 0;
        const llm = {
          async chat() {
            callIndex++;
            return { text: `Response ${callIndex}`, toolCalls: [] };
          },
        };

        // First call — creates session
        const r1 = await run(testAgent, { message: 'First message', llm, store });
        expect(r1.sessionId).toMatch(/^sess_/);
        expect(r1.response).toBe('Response 1');

        // Second call — resumes session
        const r2 = await run(testAgent, {
          message: 'Second message',
          llm,
          store,
          sessionId: r1.sessionId,
        });
        expect(r2.sessionId).toBe(r1.sessionId);
        expect(r2.response).toBe('Response 2');

        // Verify messages are persisted
        const messages = await store.loadMessages(r1.sessionId);
        expect(messages.length).toBeGreaterThanOrEqual(4); // user + assistant from each turn
      });
    });
  });

  describe('appendMessagesAtomic', () => {
    describe('Given a session + 2 messages', () => {
      it('Then the session is upserted and both messages are visible after the call', async () => {
        const store = sqliteStore({ path: ':memory:' });
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

    describe('Given an insert fails mid-batch (duplicate seq)', () => {
      it('Then no partial state is visible (atomic rollback)', async () => {
        const store = sqliteStore({ path: ':memory:' });
        const session = makeSession();

        // Prime the session with one existing message at seq=1.
        await store.appendMessagesAtomic(
          session.id,
          [{ role: 'user', content: 'existing' }],
          session,
        );

        // Force a duplicate by directly inserting a row at seq=2, then call
        // appendMessagesAtomic which will try to insert at seq=2 again —
        // the UNIQUE constraint will throw, and the whole transaction must roll
        // back (no partial rows, session.updatedAt unchanged).
        const updatedSession: AgentSession = {
          ...session,
          updatedAt: '2099-01-01T00:00:00.000Z',
        };

        // Inject a conflicting row using the internal sqlite driver via a
        // second store over the SAME memory DB is not possible; instead we
        // rely on the UNIQUE(session_id, seq) constraint: appendMessages
        // computes starting seq from MAX+1, so to force a conflict we first
        // mutate seq via raw SQL. Simplest: open a second writer via the
        // public API path to force a conflict is not feasible for `:memory:`.
        // Alternative: assert that throwing from within the transaction
        // callback rolls back. We test this by breaking one of the prepared
        // statements via a message with content SQL injection... or easier:
        // pass an object that fails JSON.stringify (circular toolCalls).
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        const badMessages: Message[] = [
          { role: 'user', content: 'this-will-commit' },
          // toolCalls with a circular reference → JSON.stringify throws.
          { role: 'assistant', content: 'fails', toolCalls: circular as never },
        ];

        await expect(
          store.appendMessagesAtomic(session.id, badMessages, updatedSession),
        ).rejects.toThrow();

        // Messages from the failed call must NOT be persisted.
        const loaded = await store.loadMessages(session.id);
        expect(loaded).toEqual([{ role: 'user', content: 'existing' }]);

        // Session.updatedAt from the failed call must NOT be persisted.
        const loadedSession = await store.loadSession(session.id);
        expect(loadedSession?.updatedAt).toBe('2026-03-30T00:00:00.000Z');
      });
    });

    describe('Given multiple atomic appends to the same session', () => {
      it('Then each message gets a monotonic sequence number', async () => {
        const store = sqliteStore({ path: ':memory:' });
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
  });

  describe('Given appendMessages is called with a session carrying userId/tenantId', () => {
    describe('When we read the raw agent_messages rows', () => {
      it('Then user_id and tenant_id are denormalized onto every row (#2847 bridge)', async () => {
        const { Database } = await import('@vertz/sqlite');
        const path = `/tmp/agent-bridge-denorm-${Date.now()}-${Math.random()}.db`;
        const store = sqliteStore({ path });
        const session = makeSession({
          id: 'sess_denorm',
          userId: 'user-a',
          tenantId: 'tenant-a',
        });
        await store.saveSession(session);
        await store.appendMessages(
          session.id,
          [
            { role: 'user', content: 'u' },
            { role: 'assistant', content: 'a' },
          ],
          session,
        );

        // Open the same file via the raw sqlite driver; inspect the rows directly.
        const raw = new Database(path);
        const rows = raw
          .prepare<{ user_id: string | null; tenant_id: string | null }, [string]>(
            'SELECT user_id, tenant_id FROM agent_messages WHERE session_id = ? ORDER BY seq',
          )
          .all(session.id);
        raw.close();

        expect(rows).toHaveLength(2);
        for (const row of rows) {
          expect(row.user_id).toBe('user-a');
          expect(row.tenant_id).toBe('tenant-a');
        }
      });
    });
  });
});
