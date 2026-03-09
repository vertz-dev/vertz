/**
 * DB-backed OAuthAccountStore implementation.
 *
 * Stores OAuth account links in auth_oauth_accounts table.
 * Uses UNIQUE(provider, provider_id) constraint for idempotent link operations.
 */

import { sql } from '@vertz/db/sql';
import type { AuthDbClient } from './db-types';
import type { OAuthAccountStore } from './types';

export class DbOAuthAccountStore implements OAuthAccountStore {
  constructor(private db: AuthDbClient) {}

  async linkAccount(
    userId: string,
    provider: string,
    providerId: string,
    email?: string,
  ): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const emailValue = email ?? null;

    // Use INSERT OR IGNORE for idempotent link (UNIQUE(provider, provider_id) handles dedup)
    await this.db.query(
      sql`INSERT OR IGNORE INTO auth_oauth_accounts (id, user_id, provider, provider_id, email, created_at)
          VALUES (${id}, ${userId}, ${provider}, ${providerId}, ${emailValue}, ${now})`,
    );
  }

  async findByProviderAccount(provider: string, providerId: string): Promise<string | null> {
    const result = await this.db.query<{ user_id: string }>(
      sql`SELECT user_id FROM auth_oauth_accounts WHERE provider = ${provider} AND provider_id = ${providerId}`,
    );

    if (!result.ok || result.data.rows.length === 0) return null;
    return result.data.rows[0]?.user_id ?? null;
  }

  async findByUserId(userId: string): Promise<{ provider: string; providerId: string }[]> {
    const result = await this.db.query<{
      provider: string;
      provider_id: string;
    }>(sql`SELECT provider, provider_id FROM auth_oauth_accounts WHERE user_id = ${userId}`);

    if (!result.ok) return [];
    return result.data.rows.map((r) => ({
      provider: r.provider,
      providerId: r.provider_id,
    }));
  }

  async unlinkAccount(userId: string, provider: string): Promise<void> {
    await this.db.query(
      sql`DELETE FROM auth_oauth_accounts WHERE user_id = ${userId} AND provider = ${provider}`,
    );
  }

  dispose(): void {
    // No cleanup needed
  }
}
