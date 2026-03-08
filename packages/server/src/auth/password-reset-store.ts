/**
 * Password Reset Store — pluggable password reset token storage
 */

import type { PasswordResetStore, StoredPasswordReset } from './types';

export class InMemoryPasswordResetStore implements PasswordResetStore {
  private byId = new Map<string, StoredPasswordReset>();
  private byTokenHash = new Map<string, StoredPasswordReset>();
  private byUserId = new Map<string, Set<string>>();

  async createReset(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<StoredPasswordReset> {
    const reset: StoredPasswordReset = {
      id: crypto.randomUUID(),
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    };

    this.byId.set(reset.id, reset);
    this.byTokenHash.set(data.tokenHash, reset);

    const userSet = this.byUserId.get(data.userId) ?? new Set();
    userSet.add(reset.id);
    this.byUserId.set(data.userId, userSet);

    return reset;
  }

  async findByTokenHash(tokenHash: string): Promise<StoredPasswordReset | null> {
    return this.byTokenHash.get(tokenHash) ?? null;
  }

  async deleteByUserId(userId: string): Promise<void> {
    const ids = this.byUserId.get(userId);
    if (ids) {
      for (const id of ids) {
        const reset = this.byId.get(id);
        if (reset) {
          this.byTokenHash.delete(reset.tokenHash);
          this.byId.delete(id);
        }
      }
      this.byUserId.delete(userId);
    }
  }

  dispose(): void {
    this.byId.clear();
    this.byTokenHash.clear();
    this.byUserId.clear();
  }
}
