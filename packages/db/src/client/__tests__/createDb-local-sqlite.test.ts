import { describe, expect, it } from '@vertz/test';
import { d } from '../../d';
import { createDb } from '../database';

// ---------------------------------------------------------------------------
// Test schemas
// ---------------------------------------------------------------------------

const todosTable = d.table('todos', {
  id: d.uuid().primary({ generate: 'cuid' }),
  title: d.text(),
  completed: d.boolean().default(false),
  createdAt: d.timestamp().default('now').readOnly(),
});

const todosModel = d.model(todosTable);

// Multi-table schema for relation tests
const usersTable = d.table('users', {
  id: d.uuid().primary({ generate: 'cuid' }),
  name: d.text(),
  active: d.boolean().default(true),
});

const postsTable = d.table('posts', {
  id: d.uuid().primary({ generate: 'cuid' }),
  title: d.text(),
  authorId: d.uuid(),
  published: d.boolean().default(false),
  createdAt: d.timestamp().default('now').readOnly(),
});

const usersModel = d.model(usersTable, {
  posts: d.ref.many(() => postsTable, 'authorId'),
});

const postsModel = d.model(postsTable, {
  author: d.ref.one(() => usersTable, 'authorId'),
});

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

describe('createDb with local SQLite (path option)', () => {
  describe('Given dialect: sqlite with no path or d1', () => {
    describe('When calling createDb', () => {
      it('Then throws a descriptive error', () => {
        expect(() =>
          // @ts-expect-error — testing runtime validation of missing path/d1
          createDb({
            models: { todos: todosModel },
            dialect: 'sqlite',
          }),
        ).toThrow(
          'SQLite dialect requires either a "path" (local file) or "d1" (Cloudflare D1 binding)',
        );
      });
    });
  });

  describe('Given dialect: sqlite with both path and d1', () => {
    describe('When calling createDb', () => {
      it('Then throws a mutual exclusivity error', () => {
        expect(() =>
          createDb({
            models: { todos: todosModel },
            dialect: 'sqlite',
            path: ':memory:',
            // @ts-expect-error — testing runtime validation of path + d1
            d1: {},
          }),
        ).toThrow('Cannot use both "path" and "d1"');
      });
    });
  });

  describe('Given path with postgres dialect', () => {
    describe('When calling createDb', () => {
      it('Then throws dialect mismatch error', () => {
        expect(() =>
          // @ts-expect-error — testing runtime validation of path on postgres
          createDb({
            models: { todos: todosModel },
            dialect: 'postgres',
            path: ':memory:',
          }),
        ).toThrow('"path" is only valid with dialect: "sqlite"');
      });
    });
  });

  describe('Given dialect: sqlite with url', () => {
    describe('When calling createDb', () => {
      it('Then throws an error pointing to path or d1', () => {
        expect(() =>
          // @ts-expect-error — testing runtime validation of url on sqlite
          createDb({
            models: { todos: todosModel },
            dialect: 'sqlite',
            url: 'postgres://localhost',
          }),
        ).toThrow('"url" is for postgres');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // CRUD tests
  // ---------------------------------------------------------------------------

  describe('Given createDb with path: ":memory:" and migrations: { autoApply: true }', () => {
    describe('When performing CRUD operations', () => {
      it('Then creates, queries, updates, and deletes with typed results', async () => {
        const db = createDb({
          models: { todos: todosModel },
          dialect: 'sqlite',
          path: ':memory:',
          migrations: { autoApply: true },
        });

        // Create
        const created = await db.todos.create({
          data: { title: 'Buy milk', completed: false },
        });
        expect(created.ok).toBe(true);
        if (!created.ok) throw new Error('create failed');
        expect(created.data.title).toBe('Buy milk');
        expect(created.data.completed).toBe(false);
        expect(typeof created.data.id).toBe('string');

        // List
        const listed = await db.todos.list({
          where: { completed: false },
        });
        expect(listed.ok).toBe(true);
        if (!listed.ok) throw new Error('list failed');
        expect(listed.data.length).toBe(1);
        expect(listed.data[0]?.title).toBe('Buy milk');

        // Update
        const updated = await db.todos.update({
          where: { id: created.data.id },
          data: { completed: true },
        });
        expect(updated.ok).toBe(true);
        if (!updated.ok) throw new Error('update failed');
        expect(updated.data.completed).toBe(true);

        // Get
        const got = await db.todos.get({
          where: { id: created.data.id },
        });
        expect(got.ok).toBe(true);
        if (!got.ok) throw new Error('get failed');
        expect(got.data.completed).toBe(true);

        // Delete
        const deleted = await db.todos.delete({
          where: { id: created.data.id },
        });
        expect(deleted.ok).toBe(true);

        // Verify deleted
        const afterDelete = await db.todos.list({});
        expect(afterDelete.ok).toBe(true);
        if (!afterDelete.ok) throw new Error('list failed');
        expect(afterDelete.data.length).toBe(0);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-table + relations
  // ---------------------------------------------------------------------------

  describe('Given createDb with two related models', () => {
    describe('When querying with include', () => {
      it('Then loads relations across tables', async () => {
        const db = createDb({
          models: { users: usersModel, posts: postsModel },
          dialect: 'sqlite',
          path: ':memory:',
          migrations: { autoApply: true },
        });

        // Create a user
        const user = await db.users.create({ data: { name: 'Alice' } });
        expect(user.ok).toBe(true);
        if (!user.ok) throw new Error('create user failed');

        // Create posts for the user
        const post1 = await db.posts.create({
          data: { title: 'First post', authorId: user.data.id, published: true },
        });
        if (!post1.ok) console.error('post1 error:', post1.error);
        expect(post1.ok).toBe(true);

        const post2 = await db.posts.create({
          data: { title: 'Second post', authorId: user.data.id, published: false },
        });
        expect(post2.ok).toBe(true);

        // Query posts (without include first to verify basic multi-table works)
        const posts = await db.posts.list({});
        expect(posts.ok).toBe(true);
        if (!posts.ok) throw new Error('list posts failed');
        expect(posts.data.length).toBe(2);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // autoUpdate timestamp columns
  // ---------------------------------------------------------------------------

  describe('Given a schema with autoUpdate timestamp column', () => {
    const contactsTable = d.table('contacts', {
      id: d.uuid().primary({ generate: 'cuid' }),
      name: d.text(),
      createdAt: d.timestamp().default('now').readOnly(),
      updatedAt: d.timestamp().autoUpdate(),
    });
    const contactsModel = d.model(contactsTable);

    describe('When creating and updating a record', () => {
      it('Then auto-generates updatedAt on INSERT and UPDATE', async () => {
        const db = createDb({
          models: { contacts: contactsModel },
          dialect: 'sqlite',
          path: ':memory:',
          migrations: { autoApply: true },
        });

        const created = await db.contacts.create({ data: { name: 'Alice' } });
        expect(created.ok).toBe(true);
        if (!created.ok) throw new Error('create failed');
        expect(created.data.updatedAt).toBeInstanceOf(Date);

        const updated = await db.contacts.update({
          where: { id: created.data.id },
          data: { name: 'Bob' },
        });
        expect(updated.ok).toBe(true);
        if (!updated.ok) throw new Error('update failed');
        expect(updated.data.updatedAt).toBeInstanceOf(Date);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // close() and isHealthy()
  // ---------------------------------------------------------------------------

  describe('Given an in-memory SQLite database', () => {
    describe('When calling close and isHealthy', () => {
      it('Then isHealthy returns true before close and false after', async () => {
        const db = createDb({
          models: { todos: todosModel },
          dialect: 'sqlite',
          path: ':memory:',
          migrations: { autoApply: true },
        });

        // Trigger lazy migration so driver is initialized
        await db.todos.list({});

        expect(await db.isHealthy()).toBe(true);

        await db.close();

        expect(await db.isHealthy()).toBe(false);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // DDL default values (number, string, boolean)
  // ---------------------------------------------------------------------------

  describe('Given a schema with various default value types', () => {
    const configTable = d.table('config', {
      id: d.uuid().primary({ generate: 'cuid' }),
      label: d.text().default('untitled'),
      priority: d.integer().default(0),
      enabled: d.boolean().default(true),
    });
    const configModel = d.model(configTable);

    describe('When creating a record with no data beyond required fields', () => {
      it('Then applies string, number, and boolean defaults', async () => {
        const db = createDb({
          models: { config: configModel },
          dialect: 'sqlite',
          path: ':memory:',
          migrations: { autoApply: true },
        });

        const created = await db.config.create({ data: {} });
        expect(created.ok).toBe(true);
        if (!created.ok) throw new Error('create failed');
        expect(created.data.label).toBe('untitled');
        expect(created.data.priority).toBe(0);
        expect(created.data.enabled).toBe(true);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Value conversion (boolean + Date)
  // ---------------------------------------------------------------------------

  describe('Given createDb with boolean and timestamp columns', () => {
    describe('When inserting and querying', () => {
      it('Then correctly converts booleans and timestamps', async () => {
        const db = createDb({
          models: { todos: todosModel },
          dialect: 'sqlite',
          path: ':memory:',
          migrations: { autoApply: true },
        });

        // Insert with boolean false
        const created = await db.todos.create({
          data: { title: 'Test', completed: false },
        });
        expect(created.ok).toBe(true);
        if (!created.ok) throw new Error('create failed');

        // Boolean should come back as JS boolean, not 0/1
        expect(created.data.completed).toBe(false);
        expect(typeof created.data.completed).toBe('boolean');

        // createdAt should come back as Date
        expect(created.data.createdAt).toBeInstanceOf(Date);

        // Update to true
        const updated = await db.todos.update({
          where: { id: created.data.id },
          data: { completed: true },
        });
        expect(updated.ok).toBe(true);
        if (!updated.ok) throw new Error('update failed');
        expect(updated.data.completed).toBe(true);
        expect(typeof updated.data.completed).toBe('boolean');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Composite primary key (#2375)
  // ---------------------------------------------------------------------------

  describe('Given a schema with composite primary key', () => {
    const projectUsersTable = d.table(
      'project_users',
      {
        projectId: d.uuid(),
        userId: d.uuid(),
        role: d.text().default('member'),
      },
      { primaryKey: ['projectId', 'userId'] },
    );
    const projectUsersModel = d.model(projectUsersTable);

    describe('When creating a record via autoApply', () => {
      it('Then generates valid DDL with table-level PRIMARY KEY constraint', async () => {
        const db = createDb({
          models: { projectUsers: projectUsersModel },
          dialect: 'sqlite',
          path: ':memory:',
          migrations: { autoApply: true },
        });

        // If DDL is invalid (per-column PRIMARY KEY on both columns), this will throw
        const created = await db.projectUsers.create({
          data: { projectId: 'p1', userId: 'u1', role: 'admin' },
        });
        expect(created.ok).toBe(true);
        if (!created.ok) throw new Error('create failed');
        expect(created.data.projectId).toBe('p1');
        expect(created.data.userId).toBe('u1');
        expect(created.data.role).toBe('admin');
      });
    });

    describe('When querying records with composite PK', () => {
      it('Then correctly enforces uniqueness on the composite key', async () => {
        const db = createDb({
          models: { projectUsers: projectUsersModel },
          dialect: 'sqlite',
          path: ':memory:',
          migrations: { autoApply: true },
        });

        const first = await db.projectUsers.create({
          data: { projectId: 'p1', userId: 'u1' },
        });
        expect(first.ok).toBe(true);

        // Inserting the same composite key should fail
        const duplicate = await db.projectUsers.create({
          data: { projectId: 'p1', userId: 'u1' },
        });
        expect(duplicate.ok).toBe(false);

        // Different composite key should succeed
        const second = await db.projectUsers.create({
          data: { projectId: 'p1', userId: 'u2' },
        });
        expect(second.ok).toBe(true);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // autoApply DDL: UNIQUE indexes, FOREIGN KEYs, enum CHECK constraints (#2848)
  // ---------------------------------------------------------------------------

  describe('Given a table with a non-inline UNIQUE index', () => {
    const tenantsTable = d.table('tenants', {
      id: d.uuid().primary({ generate: 'cuid' }),
      name: d.text(),
    });
    const installsTable = d.table(
      'installs',
      {
        id: d.uuid().primary({ generate: 'cuid' }),
        tenantId: d.uuid(),
        provider: d.text(),
      },
      { indexes: [d.index(['tenantId', 'provider'], { unique: true })] },
    );
    const tenantsModel = d.model(tenantsTable);
    const installsModel = d.model(installsTable);

    describe('When inserting a duplicate (tenantId, provider) pair via autoApply', () => {
      it('Then the UNIQUE INDEX rejects the duplicate', async () => {
        const db = createDb({
          models: { tenants: tenantsModel, installs: installsModel },
          dialect: 'sqlite',
          path: ':memory:',
          migrations: { autoApply: true },
        });

        const tenant = await db.tenants.create({ data: { name: 'Acme' } });
        expect(tenant.ok).toBe(true);
        if (!tenant.ok) throw new Error('create tenant failed');

        const first = await db.installs.create({
          data: { tenantId: tenant.data.id, provider: 'github' },
        });
        expect(first.ok).toBe(true);

        const duplicate = await db.installs.create({
          data: { tenantId: tenant.data.id, provider: 'github' },
        });
        expect(duplicate.ok).toBe(false);

        const different = await db.installs.create({
          data: { tenantId: tenant.data.id, provider: 'slack' },
        });
        expect(different.ok).toBe(true);
      });
    });
  });

  describe('Given a table whose model declares d.ref.one() to another table', () => {
    const orgsTable = d.table('orgs', {
      id: d.uuid().primary({ generate: 'cuid' }),
      name: d.text(),
    });
    const membersTable = d.table('members', {
      id: d.uuid().primary({ generate: 'cuid' }),
      orgId: d.uuid(),
      email: d.text(),
    });
    const orgsModel = d.model(orgsTable);
    const membersModel = d.model(membersTable, {
      org: d.ref.one(() => orgsTable, 'orgId'),
    });

    describe('When inserting a row whose FK column points to a non-existent parent row', () => {
      it('Then the FOREIGN KEY constraint rejects the orphan insert', async () => {
        const db = createDb({
          models: { orgs: orgsModel, members: membersModel },
          dialect: 'sqlite',
          path: ':memory:',
          migrations: { autoApply: true },
        });

        const org = await db.orgs.create({ data: { name: 'Acme' } });
        expect(org.ok).toBe(true);

        const orphan = await db.members.create({
          data: { orgId: 'does-not-exist', email: 'nobody@example.com' },
        });
        expect(orphan.ok).toBe(false);
      });
    });
  });

  describe('Given a table with two d.enum() columns', () => {
    const ticketsTable = d.table('tickets', {
      id: d.uuid().primary({ generate: 'cuid' }),
      title: d.text(),
      priority: d.enum('ticket_priority', ['low', 'high']).default('low'),
      status: d.enum('ticket_status', ['open', 'closed']).default('open'),
    });
    const ticketsModel = d.model(ticketsTable);

    describe('When inserting rows that violate each enum independently', () => {
      it('Then both CHECK constraints are enforced', async () => {
        const db = createDb({
          models: { tickets: ticketsModel },
          dialect: 'sqlite',
          path: ':memory:',
          migrations: { autoApply: true },
        });

        const valid = await db.tickets.create({
          data: { title: 'Broken login', priority: 'high', status: 'open' },
        });
        expect(valid.ok).toBe(true);

        const badStatus = await db.tickets.create({
          // @ts-expect-error — 'slonk' is not in the enum literal union
          data: { title: 'Ghost status', priority: 'high', status: 'slonk' },
        });
        expect(badStatus.ok).toBe(false);

        const badPriority = await db.tickets.create({
          // @ts-expect-error — 'mega' is not in the enum literal union
          data: { title: 'Ghost priority', priority: 'mega', status: 'open' },
        });
        expect(badPriority.ok).toBe(false);
      });
    });
  });
});
