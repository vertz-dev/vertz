/**
 * DB-backed UserStore implementation.
 *
 * Stores users in the auth_users table. Supports SQLite and PostgreSQL
 * through the DatabaseClient's sql tagged template.
 */

import { sql } from '@vertz/db/sql';
import { type AuthDbClient, assertWrite, boolVal } from './db-types';
import type { AuthUser, UserStore } from './types';

export class DbUserStore implements UserStore {
  constructor(private db: AuthDbClient) {}

  async createUser(user: AuthUser, passwordHash: string | null): Promise<void> {
    const result = await this.db.query(
      sql`INSERT INTO auth_users (id, email, password_hash, role, plan, email_verified, created_at, updated_at)
          VALUES (${user.id}, ${user.email.toLowerCase()}, ${passwordHash}, ${user.role}, ${user.plan ?? null}, ${boolVal(this.db, user.emailVerified ?? false)}, ${user.createdAt.toISOString()}, ${user.updatedAt.toISOString()})`,
    );
    assertWrite(result, 'createUser');
  }

  async findByEmail(
    email: string,
  ): Promise<{ user: AuthUser; passwordHash: string | null } | null> {
    const result = await this.db.query<{
      id: string;
      email: string;
      password_hash: string | null;
      role: string;
      plan: string | null;
      email_verified: number | boolean;
      created_at: string;
      updated_at: string;
    }>(sql`SELECT * FROM auth_users WHERE email = ${email.toLowerCase()} LIMIT 1`);

    if (!result.ok) return null;
    const row = result.data.rows[0];
    if (!row) return null;

    return {
      user: this.rowToUser(row),
      passwordHash: row.password_hash,
    };
  }

  async findById(id: string): Promise<AuthUser | null> {
    const result = await this.db.query<{
      id: string;
      email: string;
      password_hash: string | null;
      role: string;
      plan: string | null;
      email_verified: number | boolean;
      created_at: string;
      updated_at: string;
    }>(sql`SELECT * FROM auth_users WHERE id = ${id} LIMIT 1`);

    if (!result.ok) return null;
    const row = result.data.rows[0];
    if (!row) return null;

    return this.rowToUser(row);
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    const result = await this.db.query(
      sql`UPDATE auth_users SET password_hash = ${passwordHash}, updated_at = ${new Date().toISOString()} WHERE id = ${userId}`,
    );
    assertWrite(result, 'updatePasswordHash');
  }

  async updateEmailVerified(userId: string, verified: boolean): Promise<void> {
    const val = boolVal(this.db, verified);
    const result = await this.db.query(
      sql`UPDATE auth_users SET email_verified = ${val}, updated_at = ${new Date().toISOString()} WHERE id = ${userId}`,
    );
    assertWrite(result, 'updateEmailVerified');
  }

  async deleteUser(id: string): Promise<void> {
    const result = await this.db.query(sql`DELETE FROM auth_users WHERE id = ${id}`);
    assertWrite(result, 'deleteUser');
  }

  private rowToUser(row: {
    id: string;
    email: string;
    role: string;
    plan: string | null;
    email_verified: number | boolean;
    created_at: string;
    updated_at: string;
  }): AuthUser {
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      plan: row.plan ?? undefined,
      emailVerified: row.email_verified === 1 || row.email_verified === true,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
