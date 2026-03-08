/**
 * Email Verification Store — pluggable email verification token storage
 */

import type { EmailVerificationStore, StoredEmailVerification } from './types';

export class InMemoryEmailVerificationStore implements EmailVerificationStore {
  private byId = new Map<string, StoredEmailVerification>();
  private byTokenHash = new Map<string, StoredEmailVerification>();
  private byUserId = new Map<string, Set<string>>();

  async createVerification(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<StoredEmailVerification> {
    const verification: StoredEmailVerification = {
      id: crypto.randomUUID(),
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    };

    this.byId.set(verification.id, verification);
    this.byTokenHash.set(data.tokenHash, verification);

    const userSet = this.byUserId.get(data.userId) ?? new Set();
    userSet.add(verification.id);
    this.byUserId.set(data.userId, userSet);

    return verification;
  }

  async findByTokenHash(tokenHash: string): Promise<StoredEmailVerification | null> {
    return this.byTokenHash.get(tokenHash) ?? null;
  }

  async deleteByUserId(userId: string): Promise<void> {
    const ids = this.byUserId.get(userId);
    if (ids) {
      for (const id of ids) {
        const verification = this.byId.get(id);
        if (verification) {
          this.byTokenHash.delete(verification.tokenHash);
          this.byId.delete(id);
        }
      }
      this.byUserId.delete(userId);
    }
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    const verification = this.byTokenHash.get(tokenHash);
    if (verification) {
      this.byTokenHash.delete(tokenHash);
      this.byId.delete(verification.id);
      const userSet = this.byUserId.get(verification.userId);
      if (userSet) {
        userSet.delete(verification.id);
        if (userSet.size === 0) {
          this.byUserId.delete(verification.userId);
        }
      }
    }
  }

  dispose(): void {
    this.byId.clear();
    this.byTokenHash.clear();
    this.byUserId.clear();
  }
}
