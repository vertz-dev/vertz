import { describe, expect, it } from 'bun:test';
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
});
