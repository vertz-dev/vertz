import { describe, expect, it } from 'bun:test';
import { d } from '../../d';
import { createSnapshot } from '../snapshot';

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

  it('captures foreign keys from column references', () => {
    const orgs = d.table('organizations', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    const users = d.table('users', {
      id: d.uuid().primary(),
      orgId: d.uuid().references('organizations', 'id'),
    });

    const snapshot = createSnapshot([orgs, users]);

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
