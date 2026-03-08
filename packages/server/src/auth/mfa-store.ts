/**
 * MFA Store — pluggable MFA storage for auth module
 */

import type { MFAStore } from './types';

export class InMemoryMFAStore implements MFAStore {
  private secrets = new Map<string, string>();
  private backupCodes = new Map<string, string[]>();
  private enabled = new Set<string>();

  async enableMfa(userId: string, encryptedSecret: string): Promise<void> {
    this.secrets.set(userId, encryptedSecret);
    this.enabled.add(userId);
  }

  async disableMfa(userId: string): Promise<void> {
    this.secrets.delete(userId);
    this.backupCodes.delete(userId);
    this.enabled.delete(userId);
  }

  async getSecret(userId: string): Promise<string | null> {
    return this.secrets.get(userId) ?? null;
  }

  async isMfaEnabled(userId: string): Promise<boolean> {
    return this.enabled.has(userId);
  }

  async setBackupCodes(userId: string, hashedCodes: string[]): Promise<void> {
    this.backupCodes.set(userId, [...hashedCodes]);
  }

  async getBackupCodes(userId: string): Promise<string[]> {
    return this.backupCodes.get(userId) ?? [];
  }

  async consumeBackupCode(userId: string, hashedCode: string): Promise<void> {
    const codes = this.backupCodes.get(userId);
    if (codes) {
      this.backupCodes.set(
        userId,
        codes.filter((c) => c !== hashedCode),
      );
    }
  }

  dispose(): void {
    this.secrets.clear();
    this.backupCodes.clear();
    this.enabled.clear();
  }
}
