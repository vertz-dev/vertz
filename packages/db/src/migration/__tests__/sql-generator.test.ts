import { describe, expect, it } from 'vitest';
import type { DiffChange } from '../differ';
import { generateMigrationSql, generateRollbackSql } from '../sql-generator';

describe('generateMigrationSql', () => {
  it('generates CREATE TABLE for table_added', () => {
    const changes: DiffChange[] = [{ type: 'table_added', table: 'users' }];

    const sql = generateMigrationSql(changes, {
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            email: { type: 'text', nullable: false, primary: false, unique: true },
            name: { type: 'text', nullable: true, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
    });

    expect(sql).toContain('CREATE TABLE "users"');
    expect(sql).toContain('"id" uuid NOT NULL');
    expect(sql).toContain('PRIMARY KEY ("id")');
    expect(sql).toContain('"email" text NOT NULL UNIQUE');
    expect(sql).toContain('"name" text');
  });

  it('generates DROP TABLE for table_removed', () => {
    const changes: DiffChange[] = [{ type: 'table_removed', table: 'users' }];
    const sql = generateMigrationSql(changes);
    expect(sql).toBe('DROP TABLE "users";');
  });

  it('generates ALTER TABLE ADD COLUMN for column_added', () => {
    const changes: DiffChange[] = [{ type: 'column_added', table: 'users', column: 'bio' }];
    const sql = generateMigrationSql(changes, {
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            bio: { type: 'text', nullable: true, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
    });

    expect(sql).toContain('ALTER TABLE "users" ADD COLUMN "bio" text');
  });

  it('generates ALTER TABLE DROP COLUMN for column_removed', () => {
    const changes: DiffChange[] = [{ type: 'column_removed', table: 'users', column: 'bio' }];
    const sql = generateMigrationSql(changes);
    expect(sql).toBe('ALTER TABLE "users" DROP COLUMN "bio";');
  });

  it('generates ALTER TABLE ALTER COLUMN TYPE for column type change', () => {
    const changes: DiffChange[] = [
      {
        type: 'column_altered',
        table: 'users',
        column: 'age',
        oldType: 'integer',
        newType: 'bigint',
      },
    ];
    const sql = generateMigrationSql(changes);
    expect(sql).toBe('ALTER TABLE "users" ALTER COLUMN "age" TYPE bigint;');
  });

  it('generates ALTER TABLE ALTER COLUMN nullable change', () => {
    const changes: DiffChange[] = [
      {
        type: 'column_altered',
        table: 'users',
        column: 'bio',
        oldNullable: false,
        newNullable: true,
      },
    ];
    const sql = generateMigrationSql(changes);
    expect(sql).toBe('ALTER TABLE "users" ALTER COLUMN "bio" DROP NOT NULL;');
  });

  it('generates RENAME COLUMN for column_renamed', () => {
    const changes: DiffChange[] = [
      {
        type: 'column_renamed',
        table: 'users',
        oldColumn: 'name',
        newColumn: 'fullName',
        confidence: 1,
      },
    ];
    const sql = generateMigrationSql(changes);
    expect(sql).toBe('ALTER TABLE "users" RENAME COLUMN "name" TO "full_name";');
  });

  it('generates CREATE INDEX for index_added', () => {
    const changes: DiffChange[] = [{ type: 'index_added', table: 'users', columns: ['email'] }];
    const sql = generateMigrationSql(changes);
    expect(sql).toBe('CREATE INDEX "idx_users_email" ON "users" ("email");');
  });

  it('generates DROP INDEX for index_removed', () => {
    const changes: DiffChange[] = [{ type: 'index_removed', table: 'users', columns: ['email'] }];
    const sql = generateMigrationSql(changes);
    expect(sql).toBe('DROP INDEX "idx_users_email";');
  });

  it('generates CREATE TYPE for enum_added', () => {
    const changes: DiffChange[] = [{ type: 'enum_added', enumName: 'user_role' }];
    const sql = generateMigrationSql(changes, {
      enums: { user_role: ['admin', 'editor', 'viewer'] },
    });
    expect(sql).toBe("CREATE TYPE \"user_role\" AS ENUM ('admin', 'editor', 'viewer');");
  });

  it('generates DROP TYPE for enum_removed', () => {
    const changes: DiffChange[] = [{ type: 'enum_removed', enumName: 'user_role' }];
    const sql = generateMigrationSql(changes);
    expect(sql).toBe('DROP TYPE "user_role";');
  });

  it('generates ALTER TYPE ADD VALUE for enum_altered', () => {
    const changes: DiffChange[] = [
      { type: 'enum_altered', enumName: 'user_role', addedValues: ['viewer'], removedValues: [] },
    ];
    const sql = generateMigrationSql(changes);
    expect(sql).toBe('ALTER TYPE "user_role" ADD VALUE \'viewer\';');
  });

  it('generates CREATE TABLE with foreign keys', () => {
    const changes: DiffChange[] = [{ type: 'table_added', table: 'posts' }];
    const sql = generateMigrationSql(changes, {
      tables: {
        posts: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            authorId: { type: 'uuid', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [{ column: 'authorId', targetTable: 'users', targetColumn: 'id' }],
          _metadata: {},
        },
      },
    });

    expect(sql).toContain('FOREIGN KEY ("author_id") REFERENCES "users" ("id")');
  });

  it('generates CREATE TABLE with indexes', () => {
    const changes: DiffChange[] = [{ type: 'table_added', table: 'posts' }];
    const sql = generateMigrationSql(changes, {
      tables: {
        posts: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            status: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [{ columns: ['status'] }],
          foreignKeys: [],
          _metadata: {},
        },
      },
    });

    expect(sql).toContain('CREATE INDEX "idx_posts_status" ON "posts" ("status")');
  });
});

describe('generateRollbackSql', () => {
  it('reverses table_added to DROP TABLE', () => {
    const changes: DiffChange[] = [{ type: 'table_added', table: 'users' }];
    const sql = generateRollbackSql(changes);
    expect(sql).toBe('DROP TABLE "users";');
  });

  it('reverses column_added to DROP COLUMN', () => {
    const changes: DiffChange[] = [{ type: 'column_added', table: 'users', column: 'bio' }];
    const sql = generateRollbackSql(changes);
    expect(sql).toBe('ALTER TABLE "users" DROP COLUMN "bio";');
  });

  it('reverses column_altered type change', () => {
    const changes: DiffChange[] = [
      {
        type: 'column_altered',
        table: 'users',
        column: 'age',
        oldType: 'integer',
        newType: 'bigint',
      },
    ];
    const sql = generateRollbackSql(changes);
    expect(sql).toBe('ALTER TABLE "users" ALTER COLUMN "age" TYPE integer;');
  });

  it('reverses column_renamed', () => {
    const changes: DiffChange[] = [
      {
        type: 'column_renamed',
        table: 'users',
        oldColumn: 'name',
        newColumn: 'fullName',
        confidence: 1,
      },
    ];
    const sql = generateRollbackSql(changes);
    expect(sql).toBe('ALTER TABLE "users" RENAME COLUMN "full_name" TO "name";');
  });
});
