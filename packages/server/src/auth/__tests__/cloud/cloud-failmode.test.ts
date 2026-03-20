import { beforeEach, describe, expect, it } from 'bun:test';
import { createAccessContext } from '../../access-context';
import { InMemoryClosureStore } from '../../closure-store';
import { defineAccess } from '../../define-access';
import { InMemoryRoleAssignmentStore } from '../../role-assignment-store';
import { InMemorySubscriptionStore } from '../../subscription-store';
import type { ConsumeResult, WalletStore } from '../../wallet-store';

// ============================================================================
// Failing wallet store — simulates cloud failure
// ============================================================================

class FailingWalletStore implements WalletStore {
  async consume(): Promise<ConsumeResult> {
    throw new Error('Cloud unavailable');
  }
  async unconsume(): Promise<void> {
    throw new Error('Cloud unavailable');
  }
  async getConsumption(): Promise<number> {
    throw new Error('Cloud unavailable');
  }
  dispose(): void {}
}

// ============================================================================
// Shared setup
// ============================================================================

const accessDef = defineAccess({
  entities: {
    workspace: { roles: ['admin', 'member'] },
  },
  entitlements: {
    'workspace:create-prompt': { roles: ['admin', 'member'] },
  },
  plans: {
    free: {
      group: 'main',
      features: ['workspace:create-prompt'],
      limits: {
        prompts: { max: 50, gates: 'workspace:create-prompt', per: 'month' },
      },
    },
  },
  defaultPlan: 'free',
});

describe('Feature: Cloud failure modes', () => {
  let closureStore: InMemoryClosureStore;
  let roleStore: InMemoryRoleAssignmentStore;
  let subscriptionStore: InMemorySubscriptionStore;

  beforeEach(async () => {
    closureStore = new InMemoryClosureStore();
    roleStore = new InMemoryRoleAssignmentStore();
    subscriptionStore = new InMemorySubscriptionStore();
    await roleStore.assign('user-1', 'workspace', 'ws-1', 'admin');
    await subscriptionStore.assign('org-1', 'free');
  });

  describe('Given failMode: "closed" (default) and cloud is down', () => {
    describe('When checking can() with limit', () => {
      it('Then returns false with cloudError meta', async () => {
        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore: new FailingWalletStore(),
          orgResolver: () => Promise.resolve('org-1'),
          cloudFailMode: 'closed',
        });

        const result = await ctx.can('workspace:create-prompt', {
          type: 'workspace',
          id: 'ws-1',
        });
        expect(result).toBe(false);
      });
    });

    describe('When checking check() with limit', () => {
      it('Then includes meta.cloudError: true', async () => {
        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore: new FailingWalletStore(),
          orgResolver: () => Promise.resolve('org-1'),
          cloudFailMode: 'closed',
        });

        const result = await ctx.check('workspace:create-prompt', {
          type: 'workspace',
          id: 'ws-1',
        });
        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain('limit_reached');
        expect(result.meta?.cloudError).toBe(true);
      });
    });
  });

  describe('Given failMode: "open" and cloud is down', () => {
    describe('When checking can() with limit', () => {
      it('Then returns true (allow access despite cloud failure)', async () => {
        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore: new FailingWalletStore(),
          orgResolver: () => Promise.resolve('org-1'),
          cloudFailMode: 'open',
        });

        const result = await ctx.can('workspace:create-prompt', {
          type: 'workspace',
          id: 'ws-1',
        });
        expect(result).toBe(true);
      });
    });

    describe('When checking check() with limit', () => {
      it('Then returns allowed with cloudError meta', async () => {
        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore: new FailingWalletStore(),
          orgResolver: () => Promise.resolve('org-1'),
          cloudFailMode: 'open',
        });

        const result = await ctx.check('workspace:create-prompt', {
          type: 'workspace',
          id: 'ws-1',
        });
        expect(result.allowed).toBe(true);
        expect(result.meta?.cloudError).toBe(true);
      });
    });
  });

  describe('Given failMode: "cached" and cloud is down with no cached data', () => {
    describe('When checking can() with limit', () => {
      it('Then falls back to closed behavior (deny)', async () => {
        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore: new FailingWalletStore(),
          orgResolver: () => Promise.resolve('org-1'),
          cloudFailMode: 'cached',
        });

        const result = await ctx.can('workspace:create-prompt', {
          type: 'workspace',
          id: 'ws-1',
        });
        expect(result).toBe(false);
      });
    });

    describe('When checking check() with limit', () => {
      it('Then returns denied with cloudError meta', async () => {
        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore: new FailingWalletStore(),
          orgResolver: () => Promise.resolve('org-1'),
          cloudFailMode: 'cached',
        });

        const result = await ctx.check('workspace:create-prompt', {
          type: 'workspace',
          id: 'ws-1',
        });
        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain('limit_reached');
        expect(result.meta?.cloudError).toBe(true);
      });
    });

    describe('When calling canAndConsume()', () => {
      it('Then returns false', async () => {
        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore: new FailingWalletStore(),
          orgResolver: () => Promise.resolve('org-1'),
          cloudFailMode: 'cached',
        });

        const result = await ctx.canAndConsume('workspace:create-prompt', {
          type: 'workspace',
          id: 'ws-1',
        });
        expect(result).toBe(false);
      });
    });
  });

  describe('Given no cloud configured (local wallet, no failMode)', () => {
    describe('When wallet throws', () => {
      it('Then propagates the error (no failMode fallback)', async () => {
        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore: new FailingWalletStore(),
          orgResolver: () => Promise.resolve('org-1'),
          // No cloudFailMode — error propagates
        });

        await expect(
          ctx.can('workspace:create-prompt', { type: 'workspace', id: 'ws-1' }),
        ).rejects.toThrow('Cloud unavailable');
      });
    });
  });

  describe('Given canAndConsume() with cloud failure', () => {
    describe('When failMode is "closed"', () => {
      it('Then returns false', async () => {
        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore: new FailingWalletStore(),
          orgResolver: () => Promise.resolve('org-1'),
          cloudFailMode: 'closed',
        });

        const result = await ctx.canAndConsume('workspace:create-prompt', {
          type: 'workspace',
          id: 'ws-1',
        });
        expect(result).toBe(false);
      });
    });

    describe('When failMode is "open"', () => {
      it('Then returns true', async () => {
        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore: new FailingWalletStore(),
          orgResolver: () => Promise.resolve('org-1'),
          cloudFailMode: 'open',
        });

        const result = await ctx.canAndConsume('workspace:create-prompt', {
          type: 'workspace',
          id: 'ws-1',
        });
        expect(result).toBe(true);
      });
    });
  });
});
