import { describe, it } from '@vertz/test';
import { d, createDb } from '@vertz/db';
import {
  agentSessionColumns,
  agentSessionIndexes,
  agentMessageColumns,
  agentMessageIndexes,
} from '../columns';
import { defineAgentEntities } from '../define';

// Build a real createDb to drive the generic. Never executed — types only.
const _sessions = d.table('agent_sessions', agentSessionColumns, { indexes: agentSessionIndexes });
const _messages = d.table('agent_messages', agentMessageColumns, { indexes: agentMessageIndexes });

// Don't bother plumbing the full generic here — the factory accepts DatabaseClient<any>
// by design; the runtime check is the real contract.
declare const db: ReturnType<typeof createDb>;

describe('defineAgentEntities() — type-level', () => {
  it('returns { session, message } as EntityDefinitions', () => {
    const { session, message } = defineAgentEntities(db);
    session satisfies { kind: 'entity'; name: string };
    message satisfies { kind: 'entity'; name: string };
  });

  it('rejects a non-string sessionName', () => {
    // @ts-expect-error — sessionName must be string
    defineAgentEntities(db, { sessionName: 42 });
  });

  it('rejects a non-string messageName', () => {
    // @ts-expect-error — messageName must be string
    defineAgentEntities(db, { messageName: true });
  });

  it('rejects a non-object sessionAccess', () => {
    // @ts-expect-error — sessionAccess must be an object of AccessRule values
    defineAgentEntities(db, { sessionAccess: 'authenticated' });
  });

  it('rejects a string value inside sessionAccess', () => {
    // @ts-expect-error — each value in sessionAccess must be an AccessRule, not a string
    defineAgentEntities(db, { sessionAccess: { list: 'not-a-rule' } });
  });

  it('requires a db argument', () => {
    // @ts-expect-error — db is required
    defineAgentEntities();
  });
});
