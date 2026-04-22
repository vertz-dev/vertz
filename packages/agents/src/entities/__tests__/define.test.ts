import { describe, expect, it } from '@vertz/test';
import { d, createDb } from '@vertz/db';
import { rules } from '@vertz/server';
import {
  agentSessionColumns,
  agentSessionIndexes,
  agentMessageColumns,
  agentMessageIndexes,
} from '../columns';
import { AgentBridgeMissingTableError, defineAgentEntities } from '../define';

function makeDb() {
  const sessionsTable = d.table('agent_sessions', agentSessionColumns, {
    indexes: agentSessionIndexes,
  });
  const messagesTable = d.table('agent_messages', agentMessageColumns, {
    indexes: agentMessageIndexes,
  });
  return createDb({
    dialect: 'sqlite',
    path: ':memory:',
    migrations: { autoApply: true },
    models: {
      agentSessions: d.model(sessionsTable),
      agentMessages: d.model(messagesTable, {
        session: d.ref.one(() => sessionsTable, 'sessionId'),
      }),
    },
  });
}

describe('defineAgentEntities()', () => {
  describe('Given a db with registered agent tables', () => {
    describe('When called without options', () => {
      it('Then returns entities with default names', () => {
        const db = makeDb();
        const { session, message } = defineAgentEntities(db);
        expect(session.name).toBe('agent-session');
        expect(message.name).toBe('agent-message');
        expect(session.kind).toBe('entity');
        expect(message.kind).toBe('entity');
      });

      it('Then applies default access rules (user-scoped where rule)', () => {
        const db = makeDb();
        const { session, message } = defineAgentEntities(db);
        // Spot-check: every op on session has a rule; message reads are user-scoped, writes disabled.
        expect(session.access.list).toBeDefined();
        expect(session.access.get).toBeDefined();
        expect(session.access.create).toBeDefined();
        expect(message.access.list).toBeDefined();
        expect(message.access.get).toBeDefined();
        // Message writes default to undefined (factory leaves them off so entity pipeline denies).
        expect(message.access.create).toBeUndefined();
      });

      it('Then installs a before.create hook on session that injects userId/tenantId from ctx', async () => {
        const db = makeDb();
        const { session } = defineAgentEntities(db);
        const hook = session.before.create;
        expect(hook).toBeDefined();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- hook ctx stubbed for unit test
        const ctx = { userId: 'user-1', tenantId: 'tenant-1' } as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- hook is type-erased at runtime
        const result = (await (hook as any)({ agentName: 'coder' }, ctx)) as {
          userId: string | null;
          tenantId: string | null;
        };
        expect(result.userId).toBe('user-1');
        expect(result.tenantId).toBe('tenant-1');
      });

      it('Then ctx.userId wins over explicit input.userId (prevents impersonation)', async () => {
        const db = makeDb();
        const { session } = defineAgentEntities(db);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ctx/hook stubbed for unit test
        const ctx = { userId: 'actual-user', tenantId: 'actual-tenant' } as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- hook is type-erased at runtime
        const result = (await (session.before.create as any)(
          { agentName: 'coder', userId: 'attacker', tenantId: 'other-tenant' },
          ctx,
        )) as { userId: string | null; tenantId: string | null };
        expect(result.userId).toBe('actual-user');
        expect(result.tenantId).toBe('actual-tenant');
      });
    });

    describe('When called with custom sessionName / messageName', () => {
      it('Then uses the overridden names', () => {
        const db = makeDb();
        const { session, message } = defineAgentEntities(db, {
          sessionName: 'coder-session',
          messageName: 'coder-message',
        });
        expect(session.name).toBe('coder-session');
        expect(message.name).toBe('coder-message');
      });
    });

    describe('When called with custom sessionAccess', () => {
      it('Then the override replaces defaults', () => {
        const db = makeDb();
        const { session } = defineAgentEntities(db, {
          sessionAccess: {
            list: rules.authenticated(),
          },
        });
        expect(session.access.list).toEqual(rules.authenticated());
      });
    });
  });

  describe('Given a db without the required tables', () => {
    it('Then throws AgentBridgeMissingTableError with actionable message', () => {
      const unrelatedTable = d.table('users', { id: d.text().primary() });
      const db = createDb({
        dialect: 'sqlite',
        path: ':memory:',
        migrations: { autoApply: true },
        models: { users: d.model(unrelatedTable) },
      });
      expect(() => defineAgentEntities(db)).toThrow(AgentBridgeMissingTableError);
    });
  });
});
