import { describe, it } from '@vertz/test';
import { createDb, d } from '@vertz/db';
import { authModels, createServer, type ServerInstance } from '..';

// ---------------------------------------------------------------------------
// Type test: createDb() return is assignable to createServer({ db }) without cast
// Regression: https://github.com/vertz-dev/vertz/issues/1446
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.text().primary(),
  tenantId: d.text().default(''),
  name: d.text(),
  email: d.text().unique(),
});

const usersModel = d.model(usersTable);

const db = createDb({
  models: {
    ...authModels,
    users: usersModel,
  },
  dialect: 'sqlite',
  path: ':memory:',
});

describe('createServer db parameter type', () => {
  it('accepts DatabaseClient from createDb() without cast', () => {
    // This must compile without `as any` — the db parameter should accept
    // any DatabaseClient regardless of its specific model types.
    const app = createServer({
      entities: [],
      db,
      auth: {
        session: { strategy: 'jwt', ttl: '15m', refreshTtl: '7d' },
        emailPassword: {},
      },
    });

    // Verify the overload resolves to ServerInstance (db + auth provided)
    void (app satisfies ServerInstance);
  });

  it('rejects non-DatabaseClient objects for the db parameter', () => {
    createServer({
      entities: [],
      // @ts-expect-error — plain object is not a DatabaseClient or EntityDbAdapter
      db: { notADatabase: true },
      auth: {
        session: { strategy: 'jwt', ttl: '15m', refreshTtl: '7d' },
        emailPassword: {},
      },
    });
  });
});
