import { describe, expect, it } from 'bun:test';
import { InMemoryPlanStore } from '../plan-store';

describe('InMemoryPlanStore', () => {
  it('assignPlan stores org plan and getPlan retrieves it', () => {
    const store = new InMemoryPlanStore();
    store.assignPlan('org-1', 'free');

    const plan = store.getPlan('org-1');
    expect(plan).not.toBeNull();
    expect(plan!.orgId).toBe('org-1');
    expect(plan!.planId).toBe('free');
    expect(plan!.startedAt).toBeInstanceOf(Date);
    expect(plan!.expiresAt).toBeNull();
    expect(plan!.overrides).toEqual({});
  });

  it('getPlan returns null for unknown org', () => {
    const store = new InMemoryPlanStore();
    expect(store.getPlan('org-unknown')).toBeNull();
  });

  it('assignPlan accepts custom startedAt and expiresAt', () => {
    const store = new InMemoryPlanStore();
    const startedAt = new Date('2026-01-01T00:00:00Z');
    const expiresAt = new Date('2026-12-31T23:59:59Z');
    store.assignPlan('org-1', 'pro', startedAt, expiresAt);

    const plan = store.getPlan('org-1');
    expect(plan!.startedAt).toEqual(startedAt);
    expect(plan!.expiresAt).toEqual(expiresAt);
  });

  it('assignPlan overwrites existing plan for same org', () => {
    const store = new InMemoryPlanStore();
    store.assignPlan('org-1', 'free');
    store.assignPlan('org-1', 'pro');

    const plan = store.getPlan('org-1');
    expect(plan!.planId).toBe('pro');
  });

  it('updateOverrides merges overrides into existing plan', () => {
    const store = new InMemoryPlanStore();
    store.assignPlan('org-1', 'free');
    store.updateOverrides('org-1', {
      'project:create': { max: 200 },
    });

    const plan = store.getPlan('org-1');
    expect(plan!.overrides).toEqual({
      'project:create': { max: 200 },
    });
  });

  it('updateOverrides is a no-op for unknown org', () => {
    const store = new InMemoryPlanStore();
    store.updateOverrides('org-unknown', {
      'project:create': { max: 200 },
    });
    expect(store.getPlan('org-unknown')).toBeNull();
  });

  it('removePlan clears org plan', () => {
    const store = new InMemoryPlanStore();
    store.assignPlan('org-1', 'free');
    store.removePlan('org-1');
    expect(store.getPlan('org-1')).toBeNull();
  });

  it('dispose clears all data', () => {
    const store = new InMemoryPlanStore();
    store.assignPlan('org-1', 'free');
    store.assignPlan('org-2', 'pro');
    store.dispose();
    expect(store.getPlan('org-1')).toBeNull();
    expect(store.getPlan('org-2')).toBeNull();
  });
});
