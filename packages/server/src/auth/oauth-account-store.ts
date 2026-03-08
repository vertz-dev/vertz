/**
 * In-memory OAuth account store for development and testing.
 */

import type { OAuthAccountStore } from './types';

interface OAuthLink {
  userId: string;
  provider: string;
  providerId: string;
  email?: string;
}

export class InMemoryOAuthAccountStore implements OAuthAccountStore {
  private byProviderAccount = new Map<string, OAuthLink>();
  private byUserId = new Map<string, OAuthLink[]>();

  private providerKey(provider: string, providerId: string): string {
    return `${provider}:${providerId}`;
  }

  async linkAccount(
    userId: string,
    provider: string,
    providerId: string,
    email?: string,
  ): Promise<void> {
    const link: OAuthLink = { userId, provider, providerId, email };
    this.byProviderAccount.set(this.providerKey(provider, providerId), link);

    const userLinks = this.byUserId.get(userId) ?? [];
    userLinks.push(link);
    this.byUserId.set(userId, userLinks);
  }

  async findByProviderAccount(provider: string, providerId: string): Promise<string | null> {
    const link = this.byProviderAccount.get(this.providerKey(provider, providerId));
    return link?.userId ?? null;
  }

  async findByUserId(userId: string): Promise<{ provider: string; providerId: string }[]> {
    const links = this.byUserId.get(userId) ?? [];
    return links.map(({ provider, providerId }) => ({ provider, providerId }));
  }

  async unlinkAccount(userId: string, provider: string): Promise<void> {
    const userLinks = this.byUserId.get(userId) ?? [];
    const linkToRemove = userLinks.find((l) => l.provider === provider);

    if (linkToRemove) {
      this.byProviderAccount.delete(this.providerKey(provider, linkToRemove.providerId));
      this.byUserId.set(
        userId,
        userLinks.filter((l) => l.provider !== provider),
      );
    }
  }

  dispose(): void {
    this.byProviderAccount.clear();
    this.byUserId.clear();
  }
}
