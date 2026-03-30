import { describe, expect, it } from 'bun:test';
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
      it('Then returns all messages in append order with correct seq', async () => {
        const store = sqliteStore({ path: ':memory:' });
        await store.saveSession(makeSession());

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

        await store.appendMessages('sess_test-1', messages);
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
});
