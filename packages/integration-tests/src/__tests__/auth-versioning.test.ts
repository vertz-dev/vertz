/**
 * Integration test — Plan Versioning & Grandfathering (Phase 4: Access Redesign) [#1075]
 *
 * Validates the full versioning + grandfathering lifecycle end-to-end:
 * - computePlanHash() determinism and change detection
 * - InMemoryPlanVersionStore version management
 * - InMemoryGrandfatheringStore state tracking
 * - createPlanManager() with initialize/migrate/resolve/schedule/grandfathered
 * - Clock injection for testable time-dependent behavior
 * - Grace period policy (default, explicit, indefinite)
 * - Events: version_created, grace_approaching, grace_expiring, migrated
 *
 * Uses public package imports only (@vertz/server).
 */
import { describe, expect, it } from 'bun:test';
import {
  computePlanHash,
  createPlanManager,
  InMemoryGrandfatheringStore,
  InMemoryPlanVersionStore,
  InMemorySubscriptionStore,
  type PlanEvent,
} from '@vertz/server';

// ============================================================================
// E2E: Full versioning + grandfathering lifecycle
// ============================================================================

describe('Feature: Plan versioning E2E lifecycle', () => {
  it('full deploy cycle: initialize → assign → redeploy → grandfather → migrate', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();
    const events: PlanEvent[] = [];

    // ── Deploy 1: Pro plan with 50 prompt limit ──
    const deploy1Clock = () => new Date('2026-01-01T00:00:00Z');
    const manager1 = createPlanManager({
      plans: {
        pro: {
          group: 'main',
          features: ['project:view', 'project:edit'],
          limits: { prompts: { max: 50, gates: 'prompt:create' } },
          price: { amount: 29, interval: 'month' },
        },
      },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock: deploy1Clock,
    });
    manager1.on((e) => events.push(e));
    await manager1.initialize();

    // Version 1 created
    expect(await versionStore.getCurrentVersion('pro')).toBe(1);
    expect(events[0].type).toBe('plan:version_created');

    // Tenant signs up and is assigned pro plan
    await subscriptionStore.assign('org-acme', 'pro');
    await versionStore.setTenantVersion('org-acme', 'pro', 1);

    // Resolve shows tenant on v1
    const state1 = await manager1.resolve('org-acme');
    expect(state1).not.toBeNull();
    expect(state1!.version).toBe(1);
    expect(state1!.currentVersion).toBe(1);
    expect(state1!.grandfathered).toBe(false);
    expect(state1!.snapshot.limits).toEqual({ prompts: { max: 50, gates: 'prompt:create' } });

    // ── Deploy 2: Pro plan limit increased to 100 ──
    events.length = 0;
    const deploy2Clock = () => new Date('2026-06-01T00:00:00Z');
    const manager2 = createPlanManager({
      plans: {
        pro: {
          group: 'main',
          features: ['project:view', 'project:edit'],
          limits: { prompts: { max: 100, gates: 'prompt:create' } },
          price: { amount: 29, interval: 'month' },
        },
      },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock: deploy2Clock,
    });
    manager2.on((e) => events.push(e));
    await manager2.initialize();

    // Version 2 created
    expect(await versionStore.getCurrentVersion('pro')).toBe(2);
    expect(events[0].type).toBe('plan:version_created');
    expect(events[0].version).toBe(2);

    // Tenant is now grandfathered on v1
    const state2 = await manager2.resolve('org-acme');
    expect(state2!.version).toBe(1);
    expect(state2!.currentVersion).toBe(2);
    expect(state2!.grandfathered).toBe(true);
    expect(state2!.graceEnds).not.toBeNull();
    // Still sees old snapshot
    expect(state2!.snapshot.limits).toEqual({ prompts: { max: 50, gates: 'prompt:create' } });

    // New tenant gets v2
    await subscriptionStore.assign('org-newco', 'pro');
    const stateNew = await manager2.resolve('org-newco');
    expect(stateNew!.version).toBe(2);
    expect(stateNew!.grandfathered).toBe(false);
    expect(stateNew!.snapshot.limits).toEqual({ prompts: { max: 100, gates: 'prompt:create' } });

    // ── Migrate: advance clock past grace, migrate ──
    events.length = 0;
    const postGraceClock = () => new Date('2026-08-01T00:00:00Z'); // Well past 1-month grace
    const manager3 = createPlanManager({
      plans: {
        pro: {
          group: 'main',
          features: ['project:view', 'project:edit'],
          limits: { prompts: { max: 100, gates: 'prompt:create' } },
          price: { amount: 29, interval: 'month' },
        },
      },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock: postGraceClock,
    });
    manager3.on((e) => events.push(e));

    await manager3.migrate('pro');

    // Tenant migrated to v2
    const state3 = await manager3.resolve('org-acme');
    expect(state3!.version).toBe(2);
    expect(state3!.grandfathered).toBe(false);
    expect(state3!.snapshot.limits).toEqual({ prompts: { max: 100, gates: 'prompt:create' } });

    // Migration event emitted
    const migratedEvent = events.find((e) => e.type === 'plan:migrated');
    expect(migratedEvent).toBeDefined();
    expect(migratedEvent!.tenantId).toBe('org-acme');
    expect(migratedEvent!.previousVersion).toBe(1);
    expect(migratedEvent!.version).toBe(2);
  });
});

describe('Feature: computePlanHash determinism', () => {
  it('same config produces same hash across calls', async () => {
    const config = {
      features: ['project:view', 'project:edit'],
      limits: { prompts: { max: 50, gates: 'prompt:create' } },
      price: { amount: 29, interval: 'month' },
    };
    const h1 = await computePlanHash(config);
    const h2 = await computePlanHash(config);
    expect(h1).toBe(h2);
    expect(h1.length).toBe(64);
  });

  it('different features produce different hash', async () => {
    const h1 = await computePlanHash({ features: ['a'] });
    const h2 = await computePlanHash({ features: ['a', 'b'] });
    expect(h1).not.toBe(h2);
  });
});

describe('Feature: Grandfathering policy integration', () => {
  it('indefinite grandfathering prevents auto-migration', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();

    // Deploy 1
    const m1 = createPlanManager({
      plans: {
        enterprise: {
          group: 'main',
          features: ['a'],
          grandfathering: { grace: 'indefinite' },
        },
      },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
    });
    await m1.initialize();
    await subscriptionStore.assign('org-1', 'enterprise');
    await versionStore.setTenantVersion('org-1', 'enterprise', 1);

    // Deploy 2 — changed features
    const m2 = createPlanManager({
      plans: {
        enterprise: {
          group: 'main',
          features: ['a', 'b'],
          grandfathering: { grace: 'indefinite' },
        },
      },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
    });
    await m2.initialize();

    // Tenant is grandfathered with null graceEnds
    const gf = await grandfatheringStore.getGrandfathered('org-1', 'enterprise');
    expect(gf).not.toBeNull();
    expect(gf!.graceEnds).toBeNull();

    // Even far-future clock won't auto-migrate
    const farFutureClock = () => new Date('2099-12-31T00:00:00Z');
    const m3 = createPlanManager({
      plans: {
        enterprise: {
          group: 'main',
          features: ['a', 'b'],
          grandfathering: { grace: 'indefinite' },
        },
      },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock: farFutureClock,
    });
    await m3.migrate('enterprise');

    // Still on v1
    expect(await versionStore.getTenantVersion('org-1', 'enterprise')).toBe(1);

    // But forced migration with tenantId works
    await m3.migrate('enterprise', { tenantId: 'org-1' });
    expect(await versionStore.getTenantVersion('org-1', 'enterprise')).toBe(2);
  });
});

describe('Feature: Grace period events integration', () => {
  it('checkGraceEvents emits approaching and expiring at correct thresholds', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();

    // Grace ends 2026-04-01
    await grandfatheringStore.setGrandfathered('org-a', 'pro', 1, new Date('2026-04-01T00:00:00Z'));
    // Grace ends 2026-04-01 (same, for approaching test)
    await grandfatheringStore.setGrandfathered('org-b', 'pro', 1, new Date('2026-04-01T00:00:00Z'));

    // Clock: March 5 — 27 days before. Within 30-day window, > 7 days.
    const events1: PlanEvent[] = [];
    const m1 = createPlanManager({
      plans: { pro: { group: 'main', features: ['a'] } },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock: () => new Date('2026-03-05T00:00:00Z'),
    });
    m1.on((e) => events1.push(e));
    await m1.checkGraceEvents();
    expect(events1.every((e) => e.type === 'plan:grace_approaching')).toBe(true);
    expect(events1.length).toBe(2);

    // Clock: March 28 — 4 days before. Within 7-day window.
    const events2: PlanEvent[] = [];
    const m2 = createPlanManager({
      plans: { pro: { group: 'main', features: ['a'] } },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
      clock: () => new Date('2026-03-28T00:00:00Z'),
    });
    m2.on((e) => events2.push(e));
    await m2.checkGraceEvents();
    expect(events2.every((e) => e.type === 'plan:grace_expiring')).toBe(true);
    expect(events2.length).toBe(2);
  });
});

describe('Feature: Schedule migration', () => {
  it('schedule overrides grace end for all grandfathered tenants', async () => {
    const versionStore = new InMemoryPlanVersionStore();
    const grandfatheringStore = new InMemoryGrandfatheringStore();
    const subscriptionStore = new InMemorySubscriptionStore();

    await grandfatheringStore.setGrandfathered('org-1', 'pro', 1, new Date('2099-01-01T00:00:00Z'));
    await grandfatheringStore.setGrandfathered('org-2', 'pro', 1, new Date('2099-01-01T00:00:00Z'));

    const manager = createPlanManager({
      plans: { pro: { group: 'main', features: ['a'] } },
      versionStore,
      grandfatheringStore,
      subscriptionStore,
    });

    await manager.schedule('pro', { at: '2026-06-01' });

    const s1 = await grandfatheringStore.getGrandfathered('org-1', 'pro');
    const s2 = await grandfatheringStore.getGrandfathered('org-2', 'pro');
    expect(s1!.graceEnds!.toISOString()).toContain('2026-06-01');
    expect(s2!.graceEnds!.toISOString()).toContain('2026-06-01');
  });
});
