import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { signal } from '../../runtime/signal';
import type { ClientAccessEvent } from '../access-event-client';
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
      { type: 'access:flag_toggled', flag: 'export-v2', enabled: false },
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
      { type: 'access:flag_toggled', flag: 'export-v2', enabled: true },
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

    handleAccessEvent(accessSet, { type: 'access:plan_changed' });

    // Should be the same object (no inline update for plan changes)
    expect(accessSet.value).toBe(original);
  });
});
