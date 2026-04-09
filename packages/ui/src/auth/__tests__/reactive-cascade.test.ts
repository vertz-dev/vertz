import { describe, expect, it } from '@vertz/test';
import { signal } from '../../runtime/signal';
import { handleAccessEvent } from '../access-event-handler';
import type { AccessSet } from '../access-set-types';

describe('handleAccessEvent — reactive cascade', () => {
  it('flag_toggled event updates accessSet.flags inline', () => {
    const accessSet = signal<AccessSet | null>({
      entitlements: {
        'project:export': { allowed: true, reasons: [] },
      },
      flags: { 'export-v2': true },
      plan: 'pro',
      computedAt: new Date().toISOString(),
    });

    handleAccessEvent(accessSet, {
      type: 'access:flag_toggled',
      resourceType: 'tenant',
      resourceId: 'org-1',
      flag: 'export-v2',
      enabled: false,
    });

    expect(accessSet.value?.flags['export-v2']).toBe(false);
  });

  it('flag_toggled (disabled) marks affected entitlements as denied', () => {
    const accessSet = signal<AccessSet | null>({
      entitlements: {
        'project:export': { allowed: true, reasons: [] },
        'project:view': { allowed: true, reasons: [] },
      },
      flags: { 'export-v2': true },
      plan: 'pro',
      computedAt: new Date().toISOString(),
    });

    handleAccessEvent(
      accessSet,
      {
        type: 'access:flag_toggled',
        resourceType: 'tenant',
        resourceId: 'org-1',
        flag: 'export-v2',
        enabled: false,
      },
      { 'project:export': ['export-v2'] },
    );

    expect(accessSet.value?.entitlements['project:export'].allowed).toBe(false);
    expect(accessSet.value?.entitlements['project:export'].reason).toBe('flag_disabled');
    expect(accessSet.value?.entitlements['project:export'].meta?.disabledFlags).toEqual([
      'export-v2',
    ]);
    // Unrelated entitlement should remain unchanged
    expect(accessSet.value?.entitlements['project:view'].allowed).toBe(true);
  });

  it('flag_toggled (enabled) removes flag_disabled on affected entitlements', () => {
    const accessSet = signal<AccessSet | null>({
      entitlements: {
        'project:export': {
          allowed: false,
          reasons: ['flag_disabled'],
          reason: 'flag_disabled',
          meta: { disabledFlags: ['export-v2'] },
        },
      },
      flags: { 'export-v2': false },
      plan: 'pro',
      computedAt: new Date().toISOString(),
    });

    handleAccessEvent(
      accessSet,
      {
        type: 'access:flag_toggled',
        resourceType: 'tenant',
        resourceId: 'org-1',
        flag: 'export-v2',
        enabled: true,
      },
      { 'project:export': ['export-v2'] },
    );

    expect(accessSet.value?.flags['export-v2']).toBe(true);
    expect(accessSet.value?.entitlements['project:export'].allowed).toBe(true);
    expect(accessSet.value?.entitlements['project:export'].reasons).toEqual([]);
  });

  it('limit_updated event updates entitlement meta inline', () => {
    const accessSet = signal<AccessSet | null>({
      entitlements: {
        'project:create': {
          allowed: true,
          reasons: [],
          meta: { limit: { max: 100, consumed: 40, remaining: 60 } },
        },
      },
      flags: {},
      plan: 'pro',
      computedAt: new Date().toISOString(),
    });

    handleAccessEvent(accessSet, {
      type: 'access:limit_updated',
      resourceType: 'tenant',
      resourceId: 'org-1',
      entitlement: 'project:create',
      consumed: 99,
      remaining: 1,
      max: 100,
    });

    expect(accessSet.value?.entitlements['project:create'].meta?.limit).toEqual({
      max: 100,
      consumed: 99,
      remaining: 1,
    });
  });

  it('limit_updated marks entitlement denied when remaining is 0', () => {
    const accessSet = signal<AccessSet | null>({
      entitlements: {
        'project:create': {
          allowed: true,
          reasons: [],
          meta: { limit: { max: 100, consumed: 99, remaining: 1 } },
        },
      },
      flags: {},
      plan: 'pro',
      computedAt: new Date().toISOString(),
    });

    handleAccessEvent(accessSet, {
      type: 'access:limit_updated',
      resourceType: 'tenant',
      resourceId: 'org-1',
      entitlement: 'project:create',
      consumed: 100,
      remaining: 0,
      max: 100,
    });

    expect(accessSet.value?.entitlements['project:create'].allowed).toBe(false);
    expect(accessSet.value?.entitlements['project:create'].reasons).toContain('limit_reached');
  });

  it('does nothing when accessSet is null', () => {
    const accessSet = signal<AccessSet | null>(null);

    // Should not throw
    handleAccessEvent(accessSet, {
      type: 'access:flag_toggled',
      resourceType: 'tenant',
      resourceId: 'org-1',
      flag: 'export-v2',
      enabled: true,
    });

    expect(accessSet.value).toBeNull();
  });

  it('role_changed does not modify accessSet (handled externally via refetch)', () => {
    const original: AccessSet = {
      entitlements: {
        'project:view': { allowed: true, reasons: [] },
      },
      flags: {},
      plan: 'pro',
      computedAt: new Date().toISOString(),
    };
    const accessSet = signal<AccessSet | null>(original);

    handleAccessEvent(accessSet, { type: 'access:role_changed' });

    // Should be the same object (no inline update for role changes)
    expect(accessSet.value).toBe(original);
  });

  it('plan_changed does not modify accessSet (handled externally via refetch)', () => {
    const original: AccessSet = {
      entitlements: {
        'project:view': { allowed: true, reasons: [] },
      },
      flags: {},
      plan: 'pro',
      computedAt: new Date().toISOString(),
    };
    const accessSet = signal<AccessSet | null>(original);

    handleAccessEvent(accessSet, {
      type: 'access:plan_changed',
      resourceType: 'tenant',
      resourceId: 'org-1',
    });

    // Should be the same object (no inline update for plan changes)
    expect(accessSet.value).toBe(original);
  });

  it('plan_assigned updates plan field in accessSet', () => {
    const accessSet = signal<AccessSet | null>({
      entitlements: {
        'project:view': { allowed: true, reasons: [] },
      },
      flags: {},
      plan: 'free',
      computedAt: new Date().toISOString(),
    });

    handleAccessEvent(accessSet, {
      type: 'access:plan_assigned',
      resourceType: 'tenant',
      resourceId: 'org-1',
      planId: 'pro_monthly',
    });

    expect(accessSet.value?.plan).toBe('pro_monthly');
  });

  it('addon_attached does not modify accessSet (handled externally via refetch)', () => {
    const original: AccessSet = {
      entitlements: {
        'project:view': { allowed: true, reasons: [] },
      },
      flags: {},
      plan: 'pro',
      computedAt: new Date().toISOString(),
    };
    const accessSet = signal<AccessSet | null>(original);

    handleAccessEvent(accessSet, {
      type: 'access:addon_attached',
      resourceType: 'tenant',
      resourceId: 'org-1',
      addonId: 'export_addon',
    });

    // Add-on changes require a full refetch — same as role/plan changes
    expect(accessSet.value).toBe(original);
  });

  it('addon_detached does not modify accessSet (handled externally via refetch)', () => {
    const original: AccessSet = {
      entitlements: {
        'project:view': { allowed: true, reasons: [] },
      },
      flags: {},
      plan: 'pro',
      computedAt: new Date().toISOString(),
    };
    const accessSet = signal<AccessSet | null>(original);

    handleAccessEvent(accessSet, {
      type: 'access:addon_detached',
      resourceType: 'tenant',
      resourceId: 'org-1',
      addonId: 'export_addon',
    });

    // Add-on changes require a full refetch — same as role/plan changes
    expect(accessSet.value).toBe(original);
  });

  it('limit_reset resets consumed to 0 and sets remaining to max', () => {
    const accessSet = signal<AccessSet | null>({
      entitlements: {
        'prompt:create': {
          allowed: false,
          reasons: ['limit_reached'],
          reason: 'limit_reached',
          meta: { limit: { max: 100, consumed: 100, remaining: 0 } },
        },
      },
      flags: {},
      plan: 'pro',
      computedAt: new Date().toISOString(),
    });

    handleAccessEvent(accessSet, {
      type: 'access:limit_reset',
      resourceType: 'tenant',
      resourceId: 'org-1',
      entitlement: 'prompt:create',
      max: 100,
    });

    const entry = accessSet.value?.entitlements['prompt:create'];
    expect(entry?.meta?.limit).toEqual({ max: 100, consumed: 0, remaining: 100 });
    expect(entry?.allowed).toBe(true);
    expect(entry?.reasons).not.toContain('limit_reached');
  });

  it('limit_reset with new max updates the max value', () => {
    const accessSet = signal<AccessSet | null>({
      entitlements: {
        'prompt:create': {
          allowed: true,
          reasons: [],
          meta: { limit: { max: 50, consumed: 30, remaining: 20 } },
        },
      },
      flags: {},
      plan: 'pro',
      computedAt: new Date().toISOString(),
    });

    handleAccessEvent(accessSet, {
      type: 'access:limit_reset',
      resourceType: 'tenant',
      resourceId: 'org-1',
      entitlement: 'prompt:create',
      max: 200,
    });

    const entry = accessSet.value?.entitlements['prompt:create'];
    expect(entry?.meta?.limit).toEqual({ max: 200, consumed: 0, remaining: 200 });
  });
});
