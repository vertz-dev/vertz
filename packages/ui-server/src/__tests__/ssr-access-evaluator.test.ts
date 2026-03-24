/**
 * Tests for SSR prefetch access rule evaluator.
 *
 * Phase 3 of SSR single-pass prefetch: evaluates serialized entity access
 * rules against the current session to determine prefetch eligibility.
 */
import { describe, expect, it } from 'bun:test';
import {
  evaluateAccessRule,
  type PrefetchSession,
  type SerializedAccessRule,
  toPrefetchSession,
} from '../ssr-access-evaluator';

// ─── Helpers ────────────────────────────────────────────────────

const authenticatedSession: PrefetchSession = {
  status: 'authenticated',
  roles: ['user'],
  entitlements: { 'project:read': true, 'issue:read': true, 'issue:write': true },
};

const adminSession: PrefetchSession = {
  status: 'authenticated',
  roles: ['admin', 'user'],
  entitlements: { 'project:read': true, 'project:admin': true },
};

const anonymousSession: PrefetchSession = {
  status: 'unauthenticated',
};

// ─── Tests ──────────────────────────────────────────────────────

describe('Feature: Prefetch access rule evaluation', () => {
  describe('Given a public rule', () => {
    const rule: SerializedAccessRule = { type: 'public' };

    it('Then anonymous user is eligible', () => {
      expect(evaluateAccessRule(rule, anonymousSession)).toBe(true);
    });

    it('Then authenticated user is eligible', () => {
      expect(evaluateAccessRule(rule, authenticatedSession)).toBe(true);
    });
  });

  describe('Given an authenticated rule', () => {
    const rule: SerializedAccessRule = { type: 'authenticated' };

    it('Then anonymous user is NOT eligible', () => {
      expect(evaluateAccessRule(rule, anonymousSession)).toBe(false);
    });

    it('Then authenticated user is eligible', () => {
      expect(evaluateAccessRule(rule, authenticatedSession)).toBe(true);
    });
  });

  describe('Given a role rule', () => {
    const rule: SerializedAccessRule = { type: 'role', roles: ['admin'] };

    it('Then user with matching role is eligible', () => {
      expect(evaluateAccessRule(rule, adminSession)).toBe(true);
    });

    it('Then user without matching role is NOT eligible', () => {
      expect(evaluateAccessRule(rule, authenticatedSession)).toBe(false);
    });

    it('Then anonymous user is NOT eligible', () => {
      expect(evaluateAccessRule(rule, anonymousSession)).toBe(false);
    });
  });

  describe('Given an entitlement rule', () => {
    const rule: SerializedAccessRule = { type: 'entitlement', value: 'issue:write' };

    it('Then user with the entitlement is eligible', () => {
      expect(evaluateAccessRule(rule, authenticatedSession)).toBe(true);
    });

    it('Then user without the entitlement is NOT eligible', () => {
      expect(evaluateAccessRule(rule, adminSession)).toBe(false);
    });

    it('Then anonymous user is NOT eligible', () => {
      expect(evaluateAccessRule(rule, anonymousSession)).toBe(false);
    });
  });

  describe('Given a where rule (row-level filter)', () => {
    const rule: SerializedAccessRule = {
      type: 'where',
      conditions: { createdBy: { $user: 'id' } },
    };

    it('Then always eligible (row-level filtering, not access gate)', () => {
      expect(evaluateAccessRule(rule, authenticatedSession)).toBe(true);
      expect(evaluateAccessRule(rule, anonymousSession)).toBe(true);
    });
  });

  describe('Given an fva (MFA freshness) rule', () => {
    const rule: SerializedAccessRule = { type: 'fva', maxAge: 600 };

    it('Then authenticated user is eligible (optimistic)', () => {
      expect(evaluateAccessRule(rule, authenticatedSession)).toBe(true);
    });

    it('Then anonymous user is NOT eligible', () => {
      expect(evaluateAccessRule(rule, anonymousSession)).toBe(false);
    });
  });

  describe('Given a deny rule', () => {
    const rule: SerializedAccessRule = { type: 'deny' };

    it('Then no one is eligible', () => {
      expect(evaluateAccessRule(rule, authenticatedSession)).toBe(false);
      expect(evaluateAccessRule(rule, anonymousSession)).toBe(false);
    });
  });

  describe('Given an all (AND) rule', () => {
    const rule: SerializedAccessRule = {
      type: 'all',
      rules: [{ type: 'authenticated' }, { type: 'entitlement', value: 'issue:write' }],
    };

    it('Then both conditions must pass', () => {
      expect(evaluateAccessRule(rule, authenticatedSession)).toBe(true);
    });

    it('Then fails if any condition fails', () => {
      expect(evaluateAccessRule(rule, adminSession)).toBe(false);
    });

    it('Then anonymous user fails', () => {
      expect(evaluateAccessRule(rule, anonymousSession)).toBe(false);
    });
  });

  describe('Given an any (OR) rule', () => {
    const rule: SerializedAccessRule = {
      type: 'any',
      rules: [
        { type: 'role', roles: ['admin'] },
        { type: 'entitlement', value: 'issue:write' },
      ],
    };

    it('Then passes if either condition passes', () => {
      expect(evaluateAccessRule(rule, authenticatedSession)).toBe(true);
      expect(evaluateAccessRule(rule, adminSession)).toBe(true);
    });

    it('Then fails if no condition passes', () => {
      const limitedSession: PrefetchSession = {
        status: 'authenticated',
        roles: ['viewer'],
        entitlements: {},
      };
      expect(evaluateAccessRule(rule, limitedSession)).toBe(false);
    });
  });

  describe('Given an unknown rule type', () => {
    const rule = { type: 'future-rule' } as unknown as SerializedAccessRule;

    it('Then returns false (fail-secure)', () => {
      expect(evaluateAccessRule(rule, authenticatedSession)).toBe(false);
    });
  });
});

// ─── toPrefetchSession ─────────────────────────────────────────

describe('Feature: SSRAuth to PrefetchSession conversion', () => {
  describe('Given an authenticated SSRAuth', () => {
    it('Then returns an authenticated PrefetchSession with role', () => {
      const ssrAuth = {
        status: 'authenticated' as const,
        user: { id: 'u1', email: 'a@b.com', role: 'admin', tenantId: 't1' },
        expiresAt: Date.now() + 3600_000,
      };
      const session = toPrefetchSession(ssrAuth);
      expect(session.status).toBe('authenticated');
      expect(session).toEqual({
        status: 'authenticated',
        roles: ['admin'],
        tenantId: 't1',
      });
    });
  });

  describe('Given an unauthenticated SSRAuth', () => {
    it('Then returns an unauthenticated PrefetchSession', () => {
      const ssrAuth = { status: 'unauthenticated' as const };
      const session = toPrefetchSession(ssrAuth);
      expect(session).toEqual({ status: 'unauthenticated' });
    });
  });

  describe('Given undefined SSRAuth', () => {
    it('Then returns an unauthenticated PrefetchSession', () => {
      const session = toPrefetchSession(undefined);
      expect(session).toEqual({ status: 'unauthenticated' });
    });
  });

  describe('Given an authenticated user without a role', () => {
    it('Then returns authenticated session without roles', () => {
      const ssrAuth = {
        status: 'authenticated' as const,
        user: { id: 'u1', email: 'a@b.com', role: '' },
        expiresAt: Date.now() + 3600_000,
      };
      const session = toPrefetchSession(ssrAuth);
      expect(session.status).toBe('authenticated');
      if (session.status === 'authenticated') {
        expect(session.roles).toBeUndefined();
      }
    });
  });

  describe('Given an authenticated SSRAuth with an access set', () => {
    it('Then populates entitlements from the access set allowed flags', () => {
      const ssrAuth = {
        status: 'authenticated' as const,
        user: { id: 'u1', email: 'a@b.com', role: 'user', tenantId: 't1' },
        expiresAt: Date.now() + 3600_000,
      };
      const accessSet = {
        entitlements: {
          'task:read': { allowed: true, reasons: [] },
          'task:write': { allowed: true, reasons: [] },
          'task:delete': { allowed: false, reasons: ['no-role'], reason: 'no-role' as const },
        },
        flags: {},
        plan: null,
        computedAt: new Date().toISOString(),
      };
      const session = toPrefetchSession(ssrAuth, accessSet);
      expect(session).toEqual({
        status: 'authenticated',
        roles: ['user'],
        tenantId: 't1',
        entitlements: {
          'task:read': true,
          'task:write': true,
          'task:delete': false,
        },
      });
    });
  });

  describe('Given an authenticated SSRAuth without an access set', () => {
    it('Then entitlements are undefined', () => {
      const ssrAuth = {
        status: 'authenticated' as const,
        user: { id: 'u1', email: 'a@b.com', role: 'user' },
        expiresAt: Date.now() + 3600_000,
      };
      const session = toPrefetchSession(ssrAuth);
      expect(session.status).toBe('authenticated');
      if (session.status === 'authenticated') {
        expect(session.entitlements).toBeUndefined();
      }
    });
  });

  describe('Given an access set with null (overflow)', () => {
    it('Then entitlements are undefined', () => {
      const ssrAuth = {
        status: 'authenticated' as const,
        user: { id: 'u1', email: 'a@b.com', role: 'user' },
        expiresAt: Date.now() + 3600_000,
      };
      const session = toPrefetchSession(ssrAuth, null);
      expect(session.status).toBe('authenticated');
      if (session.status === 'authenticated') {
        expect(session.entitlements).toBeUndefined();
      }
    });
  });
});
