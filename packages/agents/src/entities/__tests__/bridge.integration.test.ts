import { describe, expect, it, afterEach, beforeEach } from '@vertz/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';
import { d, createDb, createDatabaseBridgeAdapter } from '@vertz/db';
import {
  createServer,
  createCrudHandlers,
  createEntityContext,
  EntityRegistry,
  type EntityOperations,
} from '@vertz/server';
import { sqliteStore } from '../../stores/sqlite-store';
import type { AgentSession } from '../../stores/types';
import {
  agentSessionColumns,
  agentSessionIndexes,
  agentMessageColumns,
  agentMessageIndexes,
} from '../columns';
import { defineAgentEntities } from '../define';

// Stub EntityOperations — the handlers path uses its own EntityDbAdapter; these stubs
// are only referenced by ctx.entities.* cross-entity traversal, which this test
// doesn't exercise. Shape matches the interface at entity-operations.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops are unused in this test; shape erasure is deliberate
const stubOps: EntityOperations<any> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub — return any empty row
  get: async () => ({}) as any,
  list: async () =>
    ({
      items: [],
      total: 0,
      limit: 0,
      nextCursor: null,
      hasNextPage: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub
    }) as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub
  create: async () => ({}) as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub
  update: async () => ({}) as any,
  delete: async () => undefined,
};

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  const now = '2026-04-22T00:00:00.000Z';
  return {
    id: 'sess_default',
    agentName: 'coder',
    userId: null,
    tenantId: null,
    state: '{}',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Feature: Agent store ↔ entity bridge (#2847)', () => {
  let dbPath: string;
  beforeEach(() => {
    dbPath = join(tmpdir(), `agent-bridge-${Date.now()}-${Math.random()}.db`);
  });
  afterEach(() => {
    try {
      unlinkSync(dbPath);
    } catch {
      // best-effort cleanup
    }
  });

  describe('Given run() persisted a session + messages via sqliteStore, and entities are registered on the same DB', () => {
    it('Then entity RLS isolates the session from a different user in a different tenant', async () => {
      // Schema: shared DB file used by BOTH the store and the entity-side createDb.
      const sessionsTable = d.table('agent_sessions', agentSessionColumns, {
        indexes: agentSessionIndexes,
      });
      const messagesTable = d.table('agent_messages', agentMessageColumns, {
        indexes: agentMessageIndexes,
      });
      const db = createDb({
        dialect: 'sqlite',
        path: dbPath,
        migrations: { autoApply: true },
        models: {
          agentSessions: d.model(sessionsTable),
          agentMessages: d.model(messagesTable, {
            session: d.ref.one(() => sessionsTable, 'sessionId'),
          }),
        },
      });

      const { session: Session, message: Message } = defineAgentEntities(db);
      // Registration side-effect runs tenant-chain resolution inside createServer.
      createServer({ db, entities: [Session, Message] });

      // Simulate run()-driven writes by calling the store directly.
      const store = sqliteStore({ path: dbPath });
      const userASession = makeSession({
        id: 'sess_user-a',
        userId: 'user-a',
        tenantId: 'ws-1',
      });
      await store.saveSession(userASession);
      await store.appendMessages(
        userASession.id,
        [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello' },
        ],
        userASession,
      );

      // --- Entity-side reads with an EntityContext per user ---
      const registry = new EntityRegistry();
      registry.register(Session.name, stubOps);
      registry.register(Message.name, stubOps);
      const asCtx = (userId: string | null, tenantId: string | null) =>
        createEntityContext({ userId, tenantId, roles: [] }, stubOps, registry.createProxy());

      const sessionAdapter = createDatabaseBridgeAdapter(db, 'agentSessions');
      const messageAdapter = createDatabaseBridgeAdapter(db, 'agentMessages');
      const sessionHandlers = createCrudHandlers(Session, sessionAdapter);
      const messageHandlers = createCrudHandlers(Message, messageAdapter);

      // User B (different tenant) → no rows via RLS.
      const listB = await sessionHandlers.list!(asCtx('user-b', 'ws-2'));
      expect(listB.ok).toBe(true);
      if (!listB.ok) throw listB.error;
      expect(listB.data.body.items).toEqual([]);

      // User C (same tenant, different user) → no rows either.
      const listC = await sessionHandlers.list!(asCtx('user-c', 'ws-1'));
      expect(listC.ok).toBe(true);
      if (!listC.ok) throw listC.error;
      expect(listC.data.body.items).toEqual([]);

      // User A → sees exactly their session.
      const listA = await sessionHandlers.list!(asCtx('user-a', 'ws-1'));
      expect(listA.ok).toBe(true);
      if (!listA.ok) throw listA.error;
      expect(listA.data.body.items).toHaveLength(1);
      expect((listA.data.body.items[0] as { id: string; userId: string | null }).id).toBe(
        'sess_user-a',
      );

      // Messages are filterable + ordered by seq, and RLS-scoped via denormalized userId.
      const msgsA = await messageHandlers.list!(asCtx('user-a', 'ws-1'), {
        where: { sessionId: 'sess_user-a' },
      });
      expect(msgsA.ok).toBe(true);
      if (!msgsA.ok) throw msgsA.error;
      const items = msgsA.data.body.items as {
        role: string;
        seq: number;
        content: string;
      }[];
      expect(items.map((m) => m.role)).toEqual(['user', 'assistant']);
      expect(items.map((m) => m.seq)).toEqual([1, 2]);

      // User C in same tenant can't read user A's messages.
      const msgsC = await messageHandlers.list!(asCtx('user-c', 'ws-1'), {
        where: { sessionId: 'sess_user-a' },
      });
      expect(msgsC.ok).toBe(true);
      if (!msgsC.ok) throw msgsC.error;
      expect(msgsC.data.body.items).toEqual([]);
    });
  });

  describe('Given an extended sessions table with a custom workspaceId column', () => {
    it('Then Session.create via the entity API runs before.create, injects userId, and the custom field round-trips', async () => {
      const sessionsTable = d.table(
        'agent_sessions',
        {
          ...agentSessionColumns,
          workspaceId: d.text(),
        },
        { indexes: [...agentSessionIndexes, d.index('workspaceId')] },
      );
      const messagesTable = d.table('agent_messages', agentMessageColumns, {
        indexes: agentMessageIndexes,
      });
      const db = createDb({
        dialect: 'sqlite',
        path: dbPath,
        migrations: { autoApply: true },
        models: {
          agentSessions: d.model(sessionsTable),
          agentMessages: d.model(messagesTable, {
            session: d.ref.one(() => sessionsTable, 'sessionId'),
          }),
        },
      });

      const { session: Session } = defineAgentEntities(db);
      createServer({ db, entities: [Session] });

      const registry = new EntityRegistry();
      registry.register(Session.name, stubOps);
      const asCtx = (userId: string | null, tenantId: string | null) =>
        createEntityContext({ userId, tenantId, roles: [] }, stubOps, registry.createProxy());

      const adapter = createDatabaseBridgeAdapter(db, 'agentSessions');
      const handlers = createCrudHandlers(Session, adapter);

      // Caller passes only agentName + workspaceId. The hook injects userId/tenantId from ctx.
      const created = await handlers.create!(asCtx('user-a', 'ws-1'), {
        agentName: 'coder',
        workspaceId: 'ws-1',
        state: '{}',
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:00:00.000Z',
      });
      if (!created.ok) {
        // Surface detail so failures are diagnosable.
        throw new Error(`create failed: ${JSON.stringify(created.error, null, 2)}`);
      }
      expect(created.ok).toBe(true);
      if (!created.ok) throw created.error;
      const body = created.data.body as {
        id: string;
        userId: string | null;
        tenantId: string | null;
        workspaceId: string;
      };
      expect(body.userId).toBe('user-a');
      expect(body.tenantId).toBe('ws-1');
      expect(body.workspaceId).toBe('ws-1');

      // The CRUD pipeline excludes `userId` / `tenantId` from the create input schema
      // (tenant-scoping auto-sets them; our before.create hook fills in userId), so the
      // "ctx wins over explicit input" semantic is verified as a unit test in
      // define.test.ts rather than end-to-end here — there is no way to smuggle an
      // `attacker` userId through the entity API in the first place.

      // Custom-column query via the entity pipeline (RLS + user-defined filter).
      const inWs1 = await handlers.list!(asCtx('user-a', 'ws-1'), {
        where: { workspaceId: 'ws-1' },
      });
      expect(inWs1.ok).toBe(true);
      if (!inWs1.ok) throw inWs1.error;
      expect(inWs1.data.body.items).toHaveLength(1);
    });
  });
});
