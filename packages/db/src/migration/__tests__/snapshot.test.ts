import { describe, expect, it } from '@vertz/test';
import { d } from '../../d';
import { createSnapshot } from '../snapshot';

describe('createSnapshot — FK from relations', () => {
  it('derives foreign keys from d.ref.one() relations', () => {
    const orgs = d.table('organizations', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    const users = d.table('users', {
      id: d.uuid().primary(),
      orgId: d.uuid(),
    });

    const orgsModel = d.model(orgs);
    const usersModel = d.model(users, {
      org: d.ref.one(() => orgs, 'orgId'),
    });

    const snapshot = createSnapshot([orgsModel, usersModel]);

    expect(snapshot.tables.users.foreignKeys).toEqual([
      { column: 'orgId', targetTable: 'organizations', targetColumn: 'id' },
    ]);
    expect(snapshot.tables.organizations.foreignKeys).toEqual([]);
  });

  it('does not derive FK from d.ref.many() — FK lives on the target table', () => {
    const posts = d.table('posts', {
      id: d.uuid().primary(),
      title: d.text(),
    });

    const comments = d.table('comments', {
      id: d.uuid().primary(),
      postId: d.uuid(),
      body: d.text(),
    });

    const postsModel = d.model(posts, {
      comments: d.ref.many(() => comments, 'postId'),
    });
    const commentsModel = d.model(comments, {
      post: d.ref.one(() => posts, 'postId'),
    });

    const snapshot = createSnapshot([postsModel, commentsModel]);

    // FK should be on comments (ref.one), not on posts (ref.many)
    expect(snapshot.tables.posts.foreignKeys).toEqual([]);
    expect(snapshot.tables.comments.foreignKeys).toEqual([
      { column: 'postId', targetTable: 'posts', targetColumn: 'id' },
    ]);
  });

  it('handles self-referencing FK (e.g., categories with parentId)', () => {
    const categories = d.table('categories', {
      id: d.uuid().primary(),
      name: d.text(),
      parentId: d.uuid().nullable(),
    });

    const categoriesModel = d.model(categories, {
      parent: d.ref.one(() => categories, 'parentId'),
    });

    const snapshot = createSnapshot([categoriesModel]);

    expect(snapshot.tables.categories.foreignKeys).toEqual([
      { column: 'parentId', targetTable: 'categories', targetColumn: 'id' },
    ]);
  });

  it('throws when target table has no primary key column', () => {
    const tags = d.table('tags', {
      name: d.text().unique(),
      slug: d.text(),
    });

    const posts = d.table('posts', {
      id: d.uuid().primary(),
      tagName: d.text(),
    });

    const postsModel = d.model(posts, {
      tag: d.ref.one(() => tags, 'tagName'),
    });

    expect(() => createSnapshot([postsModel])).toThrow(
      'Target table "tags" referenced by relation "tag" on table "posts" has no primary key column',
    );
  });

  it('throws when relation FK column does not exist on source table', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
    });

    const posts = d.table('posts', {
      id: d.uuid().primary(),
      title: d.text(),
    });

    const postsModel = d.model(posts, {
      author: d.ref.one(() => users, 'authorId'), // authorId doesn't exist on posts
    });

    expect(() => createSnapshot([postsModel])).toThrow(
      'Relation "author" on table "posts" references column "authorId" which does not exist',
    );
  });
});

describe('createSnapshot', () => {
  it('creates a snapshot with version 1 and table entries', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    const snapshot = createSnapshot([users]);

    expect(snapshot.version).toBe(1);
    expect(snapshot.tables).toHaveProperty('users');
    expect(snapshot.enums).toEqual({});
  });

  it('captures column metadata correctly', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      email: d.text().unique(),
      bio: d.text().nullable(),
      active: d.boolean().default(true),
      secret: d.text().is('sensitive'),
      internal: d.text().is('hidden'),
    });

    const snapshot = createSnapshot([users]);
    const cols = snapshot.tables.users.columns;

    expect(cols.id).toEqual({
      type: 'uuid',
      nullable: false,
      primary: true,
      unique: false,
    });

    expect(cols.email).toEqual({
      type: 'text',
      nullable: false,
      primary: false,
      unique: true,
    });

    expect(cols.bio).toEqual({
      type: 'text',
      nullable: true,
      primary: false,
      unique: false,
    });

    expect(cols.active).toEqual({
      type: 'boolean',
      nullable: false,
      primary: false,
      unique: false,
      default: 'true',
    });

    expect(cols.secret).toEqual({
      type: 'text',
      nullable: false,
      primary: false,
      unique: false,
      annotations: ['sensitive'],
    });

    expect(cols.internal).toEqual({
      type: 'text',
      nullable: false,
      primary: false,
      unique: false,
      annotations: ['hidden'],
    });
  });

  it('captures foreign keys from model relations', () => {
    const orgs = d.table('organizations', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    const users = d.table('users', {
      id: d.uuid().primary(),
      orgId: d.uuid(),
    });

    const usersModel = d.model(users, {
      org: d.ref.one(() => orgs, 'orgId'),
    });

    const snapshot = createSnapshot([orgs, usersModel]);

    expect(snapshot.tables.users.foreignKeys).toEqual([
      { column: 'orgId', targetTable: 'organizations', targetColumn: 'id' },
    ]);
  });

  it('captures indexes from table definition', () => {
    const posts = d.table(
      'posts',
      {
        id: d.uuid().primary(),
        status: d.text(),
        authorId: d.uuid(),
      },
      {
        indexes: [d.index('status'), d.index(['authorId', 'status'])],
      },
    );

    const snapshot = createSnapshot([posts]);

    expect(snapshot.tables.posts.indexes).toEqual([
      { columns: ['status'] },
      { columns: ['authorId', 'status'] },
    ]);
  });

  it('captures custom index name in snapshot', () => {
    const posts = d.table(
      'posts',
      {
        id: d.uuid().primary(),
        status: d.text(),
      },
      {
        indexes: [d.index('status', { name: 'idx_posts_status_custom' })],
      },
    );

    const snapshot = createSnapshot([posts]);

    expect(snapshot.tables.posts.indexes).toEqual([
      { columns: ['status'], name: 'idx_posts_status_custom' },
    ]);
  });

  it('captures index type and where in snapshot', () => {
    const posts = d.table(
      'posts',
      {
        id: d.uuid().primary(),
        title: d.text(),
        status: d.text(),
      },
      {
        indexes: [
          d.index('title', { type: 'gin' }),
          d.index('status', { where: "status != 'archived'" }),
          d.index(['title', 'status'], { unique: true, type: 'btree' }),
        ],
      },
    );

    const snapshot = createSnapshot([posts]);

    expect(snapshot.tables.posts.indexes).toEqual([
      { columns: ['title'], type: 'gin' },
      { columns: ['status'], where: "status != 'archived'" },
      { columns: ['title', 'status'], unique: true, type: 'btree' },
    ]);
  });

  it('captures enum types from columns', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      role: d.enum('user_role', ['admin', 'editor', 'viewer']),
    });

    const snapshot = createSnapshot([users]);

    expect(snapshot.enums).toEqual({
      user_role: ['admin', 'editor', 'viewer'],
    });
  });

  it('serializes and deserializes snapshot as JSON', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      email: d.text().unique().is('sensitive'),
      role: d.enum('user_role', ['admin', 'editor', 'viewer']),
    });

    const original = createSnapshot([users]);
    const json = JSON.stringify(original);
    const restored = JSON.parse(json);

    expect(restored).toEqual(original);
  });
});

describe('createSnapshot — composite primary keys', () => {
  it('marks all composite PK columns as primary in snapshot', () => {
    const tenantMembers = d.table(
      'tenant_members',
      {
        tenantId: d.uuid(),
        userId: d.uuid(),
        role: d.text().default('member'),
      },
      { primaryKey: ['tenantId', 'userId'] },
    );

    const snapshot = createSnapshot([tenantMembers]);
    const cols = snapshot.tables.tenant_members.columns;

    expect(cols.tenantId.primary).toBe(true);
    expect(cols.userId.primary).toBe(true);
    expect(cols.role.primary).toBe(false);
  });

  it('derives FK from relation to composite-PK table using first PK column', () => {
    const tenantMembers = d.table(
      'tenant_members',
      {
        tenantId: d.uuid(),
        userId: d.uuid(),
        role: d.text(),
      },
      { primaryKey: ['tenantId', 'userId'] },
    );

    const logs = d.table('member_logs', {
      id: d.uuid().primary(),
      memberId: d.uuid(),
    });

    const logsModel = d.model(logs, {
      member: d.ref.one(() => tenantMembers, 'memberId'),
    });

    const snapshot = createSnapshot([tenantMembers, logsModel]);

    expect(snapshot.tables.member_logs.foreignKeys).toEqual([
      { column: 'memberId', targetTable: 'tenant_members', targetColumn: 'tenantId' },
    ]);
  });
});
