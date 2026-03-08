/**
 * User Store — pluggable user storage for auth module
 */

import type { AuthUser, UserStore } from './types';

export class InMemoryUserStore implements UserStore {
  private byEmail = new Map<string, { user: AuthUser; passwordHash: string | null }>();
  private byId = new Map<string, AuthUser>();

  async createUser(user: AuthUser, passwordHash: string | null): Promise<void> {
    this.byEmail.set(user.email.toLowerCase(), { user, passwordHash });
    this.byId.set(user.id, user);
  }

  async findByEmail(
    email: string,
  ): Promise<{ user: AuthUser; passwordHash: string | null } | null> {
    return this.byEmail.get(email.toLowerCase()) ?? null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    return this.byId.get(id) ?? null;
  }
}
