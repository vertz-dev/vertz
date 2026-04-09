import { describe, expect, it } from '@vertz/test';
import type { PlanDef } from '../define-access';
import { InMemoryGrandfatheringStore } from '../grandfathering-store';
import { createPlanManager, type PlanEvent } from '../plan-manager';
import { InMemoryPlanVersionStore } from '../plan-version-store';
import { InMemorySubscriptionStore } from '../subscription-store';

function makeManager(plans: Record<string, PlanDef>, opts?: { clock?: () => Date }) {
  const versionStore = new InMemoryPlanVersionStore();
  const grandfatheringStore = new InMemoryGrandfatheringStore();
  const subscriptionStore = new InMemorySubscriptionStore();
  const events: PlanEvent[] = [];
  const manager = createPlanManager({
    plans,
    versionStore,
    grandfatheringStore,
    subscriptionStore,
    clock: opts?.clock,
  });
  manager.on((event) => events.push(event));
  return { manager, versionStore, grandfatheringStore, subscriptionStore, events };
}

describe('Feature: Plan version detection on initialize()', () => {
  describe('Given first deployment with plans', () => {
    it('creates version 1 for each plan', async () => {
      const { manager, versionStore } = makeManager({
        pro: {
          title: 'Pro',
          group: 'main',
          features: ['project:view', 'project:edit'],
          limits: { prompts: { max: 100, gates: 'prompt:create' } },
          price: { amount: 29, interval: 'month' },
        },
      });

      await manager.initialize();

      const version = await versionStore.getCurrentVersion('pro');
      expect(version).toBe(1);
    });

    it('emits plan:version_created event', async () => {
      const { manager, events } = makeManager({
        pro: {
          title: 'Pro',
          group: 'main',
          features: ['project:view'],
          price: { amount: 29, interval: 'month' },
        },
      });

      await manager.initialize();

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('plan:version_created');
      expect(events[0].planId).toBe('pro');
      expect(events[0].version).toBe(1);
    });
  });

  describe('Given second deployment with unchanged plans', () => {
    it('no new version created (hash matches)', async () => {
      const plans: Record<string, PlanDef> = {
        pro: {
          title: 'Pro',
          group: 'main',
          features: ['project:view'],
          price: { amount: 29, interval: 'month' },
        },
      };
      const { manager, versionStore } = makeManager(plans);

      await manager.initialize();
      await manager.initialize(); // Second deploy

      expect(await versionStore.getCurrentVersion('pro')).toBe(1);
    });

    it('no event emitted on second deploy', async () => {
      const plans: Record<string, PlanDef> = {
        pro: {
          title: 'Pro',
          group: 'main',
          features: ['project:view'],
          price: { amount: 29, interval: 'month' },
        },
      };
      const { manager, events } = makeManager(plans);

      await manager.initialize();
      events.length = 0; // Clear first deploy events
      await manager.initialize(); // Second deploy

      expect(events.length).toBe(0);
    });
  });

  describe('Given deployment with changed plan limits', () => {
    it('creates new version', async () => {
      const versionStore = new InMemoryPlanVersionStore();
      const grandfatheringStore = new InMemoryGrandfatheringStore();
      const subscriptionStore = new InMemorySubscriptionStore();

      // Deploy 1
      const manager1 = createPlanManager({
        plans: {
          pro: {
            title: 'Pro',
            group: 'main',
            features: ['project:view'],
            limits: { prompts: { max: 50, gates: 'prompt:create' } },
            price: { amount: 29, interval: 'month' },
          },
        },
        versionStore,
        grandfatheringStore,
        subscriptionStore,
      });
      await manager1.initialize();

      // Deploy 2 — changed limits
      const manager2 = createPlanManager({
        plans: {
          pro: {
            title: 'Pro',
            group: 'main',
            features: ['project:view'],
            limits: { prompts: { max: 100, gates: 'prompt:create' } },
            price: { amount: 29, interval: 'month' },
          },
        },
        versionStore,
        grandfatheringStore,
        subscriptionStore,
      });
      await manager2.initialize();

      expect(await versionStore.getCurrentVersion('pro')).toBe(2);
    });

    it('existing tenants keep old version (grandfathered)', async () => {
      const versionStore = new InMemoryPlanVersionStore();
      const grandfatheringStore = new InMemoryGrandfatheringStore();
      const subscriptionStore = new InMemorySubscriptionStore();

      // Deploy 1 — tenant assigned to plan
      const manager1 = createPlanManager({
        plans: {
          pro: {
            title: 'Pro',
            group: 'main',
            features: ['project:view'],
            limits: { prompts: { max: 50, gates: 'prompt:create' } },
            price: { amount: 29, interval: 'month' },
          },
        },
        versionStore,
        grandfatheringStore,
        subscriptionStore,
      });
      await manager1.initialize();
      await subscriptionStore.assign('tenant', 'org-1', 'pro');
      await versionStore.setTenantVersion('tenant', 'org-1', 'pro', 1);

      // Deploy 2 — changed limits
      const manager2 = createPlanManager({
        plans: {
          pro: {
            title: 'Pro',
            group: 'main',
            features: ['project:view'],
            limits: { prompts: { max: 100, gates: 'prompt:create' } },
            price: { amount: 29, interval: 'month' },
          },
        },
        versionStore,
        grandfatheringStore,
        subscriptionStore,
      });
      await manager2.initialize();

      // Tenant should be grandfathered on v1
      const grandfathered = await grandfatheringStore.getGrandfathered('tenant', 'org-1', 'pro');
      expect(grandfathered).not.toBeNull();
      expect(grandfathered!.version).toBe(1);
      expect(grandfathered!.graceEnds).not.toBeNull(); // monthly plan => 1 month grace
    });

    it('new tenants get new version', async () => {
      const versionStore = new InMemoryPlanVersionStore();
      const grandfatheringStore = new InMemoryGrandfatheringStore();
      const subscriptionStore = new InMemorySubscriptionStore();

      // Deploy 1
      const manager1 = createPlanManager({
        plans: {
          pro: {
            title: 'Pro',
            group: 'main',
            features: ['project:view'],
            limits: { prompts: { max: 50, gates: 'prompt:create' } },
            price: { amount: 29, interval: 'month' },
          },
        },
        versionStore,
        grandfatheringStore,
        subscriptionStore,
      });
      await manager1.initialize();

      // Deploy 2 — changed limits
      const manager2 = createPlanManager({
        plans: {
          pro: {
            title: 'Pro',
            group: 'main',
            features: ['project:view'],
            limits: { prompts: { max: 100, gates: 'prompt:create' } },
            price: { amount: 29, interval: 'month' },
          },
        },
        versionStore,
        grandfatheringStore,
        subscriptionStore,
      });
      await manager2.initialize();

      // New tenant assigned after v2
      await subscriptionStore.assign('tenant', 'org-new', 'pro');
      // Not setting tenant version => resolve defaults to current
      const state = await manager2.resolve('tenant', 'org-new');
      expect(state).not.toBeNull();
      expect(state!.version).toBe(2);
      expect(state!.grandfathered).toBe(false);
    });
  });
});

describe('Feature: Plan migration', () => {
  describe('Given grandfathered tenant past grace period', () => {
    describe('When calling migrate(planId)', () => {
      it('migrates tenant to current version', async () => {
        const versionStore = new InMemoryPlanVersionStore();
        const grandfatheringStore = new InMemoryGrandfatheringStore();
        const subscriptionStore = new InMemorySubscriptionStore();

        // Set up: tenant on v1, grandfathered with expired grace
        await versionStore.createVersion('pro', 'hash-1', {
          features: ['a'],
          limits: {},
          price: null,
        });
        await versionStore.createVersion('pro', 'hash-2', {
          features: ['a', 'b'],
          limits: {},
          price: null,
        });
        await versionStore.setTenantVersion('tenant', 'org-1', 'pro', 1);
        await subscriptionStore.assign('tenant', 'org-1', 'pro');
        // Grace ended yesterday
        await grandfatheringStore.setGrandfathered(
          'tenant',
          'org-1',
          'pro',
          1,
          new Date('2026-01-01T00:00:00Z'),
        );

        const clock = () => new Date('2026-01-02T00:00:00Z'); // After grace
        const manager = createPlanManager({
          plans: { pro: { group: 'main', features: ['a', 'b'] } },
          versionStore,
          grandfatheringStore,
          subscriptionStore,
          clock,
        });

        await manager.migrate('pro');

        const tenantVersion = await versionStore.getTenantVersion('tenant', 'org-1', 'pro');
        expect(tenantVersion).toBe(2);
      });

      it('emits plan:migrated event with previousVersion', async () => {
        const versionStore = new InMemoryPlanVersionStore();
        const grandfatheringStore = new InMemoryGrandfatheringStore();
        const subscriptionStore = new InMemorySubscriptionStore();
        const events: PlanEvent[] = [];

        await versionStore.createVersion('pro', 'hash-1', {
          features: ['a'],
          limits: {},
          price: null,
        });
        await versionStore.createVersion('pro', 'hash-2', {
          features: ['a', 'b'],
          limits: {},
          price: null,
        });
        await versionStore.setTenantVersion('tenant', 'org-1', 'pro', 1);
        await subscriptionStore.assign('tenant', 'org-1', 'pro');
        await grandfatheringStore.setGrandfathered(
          'tenant',
          'org-1',
          'pro',
          1,
          new Date('2026-01-01T00:00:00Z'),
        );

        const clock = () => new Date('2026-01-02T00:00:00Z');
        const manager = createPlanManager({
          plans: { pro: { group: 'main', features: ['a', 'b'] } },
          versionStore,
          grandfatheringStore,
          subscriptionStore,
          clock,
        });
        manager.on((e) => events.push(e));

        await manager.migrate('pro');

        expect(events.length).toBe(1);
        expect(events[0].type).toBe('plan:migrated');
        expect(events[0].resourceId).toBe('org-1');
        expect(events[0].previousVersion).toBe(1);
        expect(events[0].version).toBe(2);
      });

      it('clears grandfathering state', async () => {
        const versionStore = new InMemoryPlanVersionStore();
        const grandfatheringStore = new InMemoryGrandfatheringStore();
        const subscriptionStore = new InMemorySubscriptionStore();

        await versionStore.createVersion('pro', 'hash-1', {
          features: ['a'],
          limits: {},
          price: null,
        });
        await versionStore.createVersion('pro', 'hash-2', {
          features: ['a', 'b'],
          limits: {},
          price: null,
        });
        await versionStore.setTenantVersion('tenant', 'org-1', 'pro', 1);
        await subscriptionStore.assign('tenant', 'org-1', 'pro');
        await grandfatheringStore.setGrandfathered(
          'tenant',
          'org-1',
          'pro',
          1,
          new Date('2026-01-01T00:00:00Z'),
        );

        const clock = () => new Date('2026-01-02T00:00:00Z');
        const manager = createPlanManager({
          plans: { pro: { group: 'main', features: ['a', 'b'] } },
          versionStore,
          grandfatheringStore,
          subscriptionStore,
          clock,
        });

        await manager.migrate('pro');

        const state = await grandfatheringStore.getGrandfathered('tenant', 'org-1', 'pro');
        expect(state).toBeNull();
      });
    });
  });

  describe('Given grandfathered tenant within grace period', () => {
    describe('When calling migrate(planId)', () => {
      it('does NOT migrate — grace still active', async () => {
        const versionStore = new InMemoryPlanVersionStore();
        const grandfatheringStore = new InMemoryGrandfatheringStore();
        const subscriptionStore = new InMemorySubscriptionStore();

        await versionStore.createVersion('pro', 'hash-1', {
          features: ['a'],
          limits: {},
          price: null,
        });
        await versionStore.createVersion('pro', 'hash-2', {
          features: ['a', 'b'],
          limits: {},
          price: null,
        });
        await versionStore.setTenantVersion('tenant', 'org-1', 'pro', 1);
        await subscriptionStore.assign('tenant', 'org-1', 'pro');
        // Grace ends in the future
        await grandfatheringStore.setGrandfathered(
          'tenant',
          'org-1',
          'pro',
          1,
          new Date('2027-01-01T00:00:00Z'),
        );

        const clock = () => new Date('2026-06-01T00:00:00Z'); // Before grace end
        const manager = createPlanManager({
          plans: { pro: { group: 'main', features: ['a', 'b'] } },
          versionStore,
          grandfatheringStore,
          subscriptionStore,
          clock,
        });

        await manager.migrate('pro');

        const tenantVersion = await versionStore.getTenantVersion('tenant', 'org-1', 'pro');
        expect(tenantVersion).toBe(1); // Still on v1
      });
    });
  });

  describe('Given migrate with specific tenantId', () => {
    it('migrates immediately regardless of grace', async () => {
      const versionStore = new InMemoryPlanVersionStore();
      const grandfatheringStore = new InMemoryGrandfatheringStore();
      const subscriptionStore = new InMemorySubscriptionStore();

      await versionStore.createVersion('pro', 'hash-1', {
        features: ['a'],
        limits: {},
        price: null,
      });
      await versionStore.createVersion('pro', 'hash-2', {
        features: ['a', 'b'],
        limits: {},
        price: null,
      });
      await versionStore.setTenantVersion('tenant', 'org-1', 'pro', 1);
      await subscriptionStore.assign('tenant', 'org-1', 'pro');
      // Grace ends far in the future
      await grandfatheringStore.setGrandfathered(
        'tenant',
        'org-1',
        'pro',
        1,
        new Date('2099-01-01T00:00:00Z'),
      );

      const clock = () => new Date('2026-01-01T00:00:00Z');
      const manager = createPlanManager({
        plans: { pro: { group: 'main', features: ['a', 'b'] } },
        versionStore,
        grandfatheringStore,
        subscriptionStore,
        clock,
      });

      await manager.migrate('pro', { resource: { type: 'tenant', id: 'org-1' } });

      const tenantVersion = await versionStore.getTenantVersion('tenant', 'org-1', 'pro');
      expect(tenantVersion).toBe(2);
    });
  });
});

describe('Feature: Clock injection', () => {
  it('migrate uses injected clock for grace period comparison', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();

    await versionStore.createVersion('pro', 'hash-1', {
      features: ['a'],
      limits: {},
      price: null,
    });
    await versionStore.createVersion('pro', 'hash-2', {
      features: ['a', 'b'],
      limits: {},
      price: null,
    });
    await versionStore.setTenantVersion('tenant', 'org-1', 'pro', 1);
    await subscriptionStore.assign('tenant', 'org-1', 'pro');
    await grandfatheringStore.setGrandfathered(
      'tenant',
      'org-1',
      'pro',
      1,
      new Date('2026-06-15T00:00:00Z'),
    );

    // Clock before grace end — should NOT migrate
    const clockBefore = () => new Date('2026-06-14T00:00:00Z');
    const manager1 = createPlanManager({
      plans: { pro: { group: 'main', features: ['a', 'b'] } },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock: clockBefore,
    });
    await manager1.migrate('pro');
    expect(await versionStore.getTenantVersion('tenant', 'org-1', 'pro')).toBe(1);

    // Clock after grace end — SHOULD migrate
    const clockAfter = () => new Date('2026-06-16T00:00:00Z');
    const manager2 = createPlanManager({
      plans: { pro: { group: 'main', features: ['a', 'b'] } },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock: clockAfter,
    });
    await manager2.migrate('pro');
    expect(await versionStore.getTenantVersion('tenant', 'org-1', 'pro')).toBe(2);
  });
});

describe('Feature: Plan resolution', () => {
  it('resolve returns tenant plan state with snapshot', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();

    const snap = { features: ['a', 'b'], limits: {}, price: null };
    await versionStore.createVersion('pro', 'hash-1', snap);
    await versionStore.setTenantVersion('tenant', 'org-1', 'pro', 1);
    await subscriptionStore.assign('tenant', 'org-1', 'pro');

    const manager = createPlanManager({
      plans: { pro: { group: 'main', features: ['a', 'b'] } },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
    });

    const state = await manager.resolve('tenant', 'org-1');
    expect(state).not.toBeNull();
    expect(state!.planId).toBe('pro');
    expect(state!.version).toBe(1);
    expect(state!.currentVersion).toBe(1);
    expect(state!.grandfathered).toBe(false);
    expect(state!.graceEnds).toBeNull();
    expect(state!.snapshot.features).toEqual(['a', 'b']);
  });

  it('resolve returns null for unknown tenant', async () => {
    const { manager } = makeManager({
      pro: { group: 'main', features: ['a'] },
    });
    await manager.initialize();

    const state = await manager.resolve('tenant', 'unknown-org');
    expect(state).toBeNull();
  });

  it('resolve shows grandfathered state', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();

    await versionStore.createVersion('pro', 'hash-1', {
      features: ['a'],
      limits: {},
      price: null,
    });
    await versionStore.createVersion('pro', 'hash-2', {
      features: ['a', 'b'],
      limits: {},
      price: null,
    });
    await versionStore.setTenantVersion('tenant', 'org-1', 'pro', 1);
    await subscriptionStore.assign('tenant', 'org-1', 'pro');
    const graceEnds = new Date('2027-01-15T00:00:00Z');
    await grandfatheringStore.setGrandfathered('tenant', 'org-1', 'pro', 1, graceEnds);

    const manager = createPlanManager({
      plans: { pro: { group: 'main', features: ['a', 'b'] } },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
    });

    const state = await manager.resolve('tenant', 'org-1');
    expect(state!.version).toBe(1);
    expect(state!.currentVersion).toBe(2);
    expect(state!.grandfathered).toBe(true);
    expect(state!.graceEnds).toEqual(graceEnds);
    // Snapshot should be from v1, not v2
    expect(state!.snapshot.features).toEqual(['a']);
  });
});

describe('Feature: Schedule migration', () => {
  it('schedule sets grace end date for all grandfathered tenants', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();

    await versionStore.createVersion('pro', 'hash-1', {
      features: ['a'],
      limits: {},
      price: null,
    });
    await versionStore.createVersion('pro', 'hash-2', {
      features: ['a', 'b'],
      limits: {},
      price: null,
    });

    await grandfatheringStore.setGrandfathered(
      'tenant',
      'org-1',
      'pro',
      1,
      new Date('2099-01-01T00:00:00Z'),
    );
    await grandfatheringStore.setGrandfathered(
      'tenant',
      'org-2',
      'pro',
      1,
      new Date('2099-01-01T00:00:00Z'),
    );

    const manager = createPlanManager({
      plans: { pro: { group: 'main', features: ['a', 'b'] } },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
    });

    await manager.schedule('pro', { at: '2026-06-01' });

    const s1 = await grandfatheringStore.getGrandfathered('tenant', 'org-1', 'pro');
    const s2 = await grandfatheringStore.getGrandfathered('tenant', 'org-2', 'pro');
    expect(s1!.graceEnds!.toISOString()).toContain('2026-06-01');
    expect(s2!.graceEnds!.toISOString()).toContain('2026-06-01');
  });
});

describe('Feature: Grandfathered listing', () => {
  it('grandfathered returns all grandfathered tenants for a plan', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();

    await grandfatheringStore.setGrandfathered('tenant', 'org-1', 'pro', 1, new Date('2027-01-01'));
    await grandfatheringStore.setGrandfathered('tenant', 'org-2', 'pro', 1, new Date('2027-01-01'));

    const manager = createPlanManager({
      plans: { pro: { group: 'main', features: ['a'] } },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
    });

    const list = await manager.grandfathered('pro');
    expect(list.length).toBe(2);
    expect(list.map((s) => s.resourceId).sort()).toEqual(['org-1', 'org-2']);
  });
});

describe('Feature: Grandfathering policy', () => {
  it('monthly plan defaults to 1 month grace', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();
    const fixedNow = new Date('2026-03-01T00:00:00Z');

    // Deploy 1
    const manager1 = createPlanManager({
      plans: {
        pro: {
          group: 'main',
          features: ['a'],
          price: { amount: 29, interval: 'month' },
        },
      },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock: () => fixedNow,
    });
    await manager1.initialize();
    await subscriptionStore.assign('tenant', 'org-1', 'pro');
    await versionStore.setTenantVersion('tenant', 'org-1', 'pro', 1);

    // Deploy 2 — changed features
    const manager2 = createPlanManager({
      plans: {
        pro: {
          group: 'main',
          features: ['a', 'b'],
          price: { amount: 29, interval: 'month' },
        },
      },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock: () => fixedNow,
    });
    await manager2.initialize();

    const state = await grandfatheringStore.getGrandfathered('tenant', 'org-1', 'pro');
    expect(state).not.toBeNull();
    // 1 month ≈ 30 days from March 1
    const expectedGraceEnd = new Date(fixedNow.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(state!.graceEnds!.getTime()).toBe(expectedGraceEnd.getTime());
  });

  it('yearly plan defaults to 3 month grace', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();
    const fixedNow = new Date('2026-03-01T00:00:00Z');

    const manager1 = createPlanManager({
      plans: {
        pro: {
          group: 'main',
          features: ['a'],
          price: { amount: 290, interval: 'year' },
        },
      },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock: () => fixedNow,
    });
    await manager1.initialize();
    await subscriptionStore.assign('tenant', 'org-1', 'pro');
    await versionStore.setTenantVersion('tenant', 'org-1', 'pro', 1);

    const manager2 = createPlanManager({
      plans: {
        pro: {
          group: 'main',
          features: ['a', 'b'],
          price: { amount: 290, interval: 'year' },
        },
      },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock: () => fixedNow,
    });
    await manager2.initialize();

    const state = await grandfatheringStore.getGrandfathered('tenant', 'org-1', 'pro');
    expect(state).not.toBeNull();
    // 3 months ≈ 90 days
    const expectedGraceEnd = new Date(fixedNow.getTime() + 90 * 24 * 60 * 60 * 1000);
    expect(state!.graceEnds!.getTime()).toBe(expectedGraceEnd.getTime());
  });

  it('explicit grace: "12m" on plan config', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();
    const fixedNow = new Date('2026-03-01T00:00:00Z');

    const planConfig = {
      group: 'main',
      features: ['a'],
      price: { amount: 29, interval: 'month' as const },
      grandfathering: { grace: '12m' as const },
    };

    const manager1 = createPlanManager({
      plans: { pro: planConfig },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock: () => fixedNow,
    });
    await manager1.initialize();
    await subscriptionStore.assign('tenant', 'org-1', 'pro');
    await versionStore.setTenantVersion('tenant', 'org-1', 'pro', 1);

    const manager2 = createPlanManager({
      plans: { pro: { ...planConfig, features: ['a', 'b'] } },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock: () => fixedNow,
    });
    await manager2.initialize();

    const state = await grandfatheringStore.getGrandfathered('tenant', 'org-1', 'pro');
    expect(state).not.toBeNull();
    // 12 months ≈ 365 days
    const expectedGraceEnd = new Date(fixedNow.getTime() + 365 * 24 * 60 * 60 * 1000);
    expect(state!.graceEnds!.getTime()).toBe(expectedGraceEnd.getTime());
  });

  it('explicit grace: "indefinite" results in null graceEnds', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();

    const planConfig = {
      group: 'main',
      features: ['a'],
      grandfathering: { grace: 'indefinite' as const },
    };

    const manager1 = createPlanManager({
      plans: { pro: planConfig },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
    });
    await manager1.initialize();
    await subscriptionStore.assign('tenant', 'org-1', 'pro');
    await versionStore.setTenantVersion('tenant', 'org-1', 'pro', 1);

    const manager2 = createPlanManager({
      plans: { pro: { ...planConfig, features: ['a', 'b'] } },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
    });
    await manager2.initialize();

    const state = await grandfatheringStore.getGrandfathered('tenant', 'org-1', 'pro');
    expect(state).not.toBeNull();
    expect(state!.graceEnds).toBeNull();
  });
});

describe('Feature: Grace period events', () => {
  it('emits plan:grace_approaching when 30 days before grace end', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();
    const events: PlanEvent[] = [];

    // Grace ends April 1, clock is March 10 (22 days before => within 30 day window, > 7 days)
    await grandfatheringStore.setGrandfathered(
      'tenant',
      'org-1',
      'pro',
      1,
      new Date('2026-04-01T00:00:00Z'),
    );

    const clock = () => new Date('2026-03-10T00:00:00Z');
    const manager = createPlanManager({
      plans: { pro: { group: 'main', features: ['a'] } },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock,
    });
    manager.on((e) => events.push(e));

    await manager.checkGraceEvents();

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('plan:grace_approaching');
    expect(events[0].resourceId).toBe('org-1');
  });

  it('emits plan:grace_expiring when 7 days before grace end', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();
    const events: PlanEvent[] = [];

    // Grace ends April 1, clock is March 28 (4 days before => within 7 day window)
    await grandfatheringStore.setGrandfathered(
      'tenant',
      'org-1',
      'pro',
      1,
      new Date('2026-04-01T00:00:00Z'),
    );

    const clock = () => new Date('2026-03-28T00:00:00Z');
    const manager = createPlanManager({
      plans: { pro: { group: 'main', features: ['a'] } },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock,
    });
    manager.on((e) => events.push(e));

    await manager.checkGraceEvents();

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('plan:grace_expiring');
    expect(events[0].resourceId).toBe('org-1');
  });

  it('no event when grace end is far in the future', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();
    const events: PlanEvent[] = [];

    await grandfatheringStore.setGrandfathered(
      'tenant',
      'org-1',
      'pro',
      1,
      new Date('2027-01-01T00:00:00Z'),
    );

    const clock = () => new Date('2026-01-01T00:00:00Z');
    const manager = createPlanManager({
      plans: { pro: { group: 'main', features: ['a'] } },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock,
    });
    manager.on((e) => events.push(e));

    await manager.checkGraceEvents();

    expect(events.length).toBe(0);
  });

  it('no event for indefinitely grandfathered tenant', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();
    const events: PlanEvent[] = [];

    await grandfatheringStore.setGrandfathered('tenant', 'org-1', 'pro', 1, null);

    const clock = () => new Date('2099-01-01T00:00:00Z');
    const manager = createPlanManager({
      plans: { pro: { group: 'main', features: ['a'] } },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock,
    });
    manager.on((e) => events.push(e));

    await manager.checkGraceEvents();

    expect(events.length).toBe(0);
  });
});

describe('Feature: Indefinite grandfathering', () => {
  it('migrate skips indefinitely grandfathered tenants', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();

    await versionStore.createVersion('pro', 'hash-1', {
      features: ['a'],
      limits: {},
      price: null,
    });
    await versionStore.createVersion('pro', 'hash-2', {
      features: ['a', 'b'],
      limits: {},
      price: null,
    });
    await versionStore.setTenantVersion('tenant', 'org-1', 'pro', 1);
    await subscriptionStore.assign('tenant', 'org-1', 'pro');
    // null graceEnds = indefinite
    await grandfatheringStore.setGrandfathered('tenant', 'org-1', 'pro', 1, null);

    const clock = () => new Date('2099-12-31T00:00:00Z');
    const manager = createPlanManager({
      plans: { pro: { group: 'main', features: ['a', 'b'] } },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock,
    });

    await manager.migrate('pro');

    // Still on v1 — indefinite grandfathering not migrated
    expect(await versionStore.getTenantVersion('tenant', 'org-1', 'pro')).toBe(1);
  });
});
