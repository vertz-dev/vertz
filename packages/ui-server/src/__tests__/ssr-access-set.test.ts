import { describe, expect, it } from 'bun:test';
import type { AccessSet } from '@vertz/ui/auth';
import { createAccessSetScript, getAccessSetForSSR } from '../ssr-access-set';

function makeAccessSet(overrides?: Partial<AccessSet>): AccessSet {
  return {
    entitlements: {
      'project:view': { allowed: true, reasons: [] },
    },
    flags: {},
    plan: null,
    computedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('createAccessSetScript', () => {
  it('produces valid script tag', () => {
    const set = makeAccessSet();
    const result = createAccessSetScript(set);

    expect(result).toContain('<script>');
    expect(result).toContain('</script>');
    expect(result).toContain('window.__VERTZ_ACCESS_SET__=');
  });

  it('escapes < characters (prevents </script> injection)', () => {
    const set = makeAccessSet({
      entitlements: {
        'test</script><script>alert(1)//': { allowed: true, reasons: [] },
      },
    });
    const result = createAccessSetScript(set);

    expect(result).not.toContain('</script><script>');
    expect(result).toContain('\\u003c');
  });

  it('escapes line/paragraph separators', () => {
    const set = makeAccessSet({
      entitlements: {
        'test\u2028line': { allowed: true, reasons: [] },
        'test\u2029para': { allowed: true, reasons: [] },
      },
    });
    const result = createAccessSetScript(set);

    // The raw characters should be escaped
    expect(result).not.toContain('\u2028');
    expect(result).not.toContain('\u2029');
  });

  it('escapes nonce attribute (prevents attribute injection)', () => {
    const set = makeAccessSet();
    const result = createAccessSetScript(set, '"><script>alert(1)</script>');

    expect(result).not.toContain('"><script>alert(1)</script>');
    expect(result).toContain('nonce=');
  });

  it('includes nonce when provided', () => {
    const set = makeAccessSet();
    const result = createAccessSetScript(set, 'abc123');

    expect(result).toContain('nonce="abc123"');
  });

  it('works without nonce', () => {
    const set = makeAccessSet();
    const result = createAccessSetScript(set);

    expect(result).not.toContain('nonce');
    expect(result).toMatch(/^<script>/);
  });

  it('handles empty entitlements', () => {
    const set = makeAccessSet({ entitlements: {} });
    const result = createAccessSetScript(set);

    expect(result).toContain('window.__VERTZ_ACCESS_SET__=');
    expect(result).toContain('"entitlements":{}');
  });

  it('handles entitlement names containing </script>', () => {
    const set = makeAccessSet({
      entitlements: {
        '</script>': { allowed: true, reasons: [] },
      },
    });
    const result = createAccessSetScript(set);

    // Should not break out of the script tag
    const scriptCount = (result.match(/<\/script>/g) || []).length;
    expect(scriptCount).toBe(1); // Only the closing tag
  });
});

describe('getAccessSetForSSR', () => {
  it('returns null for null payload', () => {
    expect(getAccessSetForSSR(null)).toBeNull();
  });

  it('returns null when no acl claim', () => {
    expect(getAccessSetForSSR({ sub: 'user-1' })).toBeNull();
  });

  it('returns null when acl.overflow is true', () => {
    const payload = {
      acl: { hash: 'abc123', overflow: true },
    };
    expect(getAccessSetForSSR(payload)).toBeNull();
  });

  it('returns AccessSet from inline acl.set', () => {
    const payload = {
      acl: {
        hash: 'abc123',
        overflow: false,
        set: {
          entitlements: {
            'project:view': { allowed: true },
            'project:edit': {
              allowed: false,
              reasons: ['role_required'],
              reason: 'role_required',
            },
          },
          flags: { beta: true },
          plan: 'pro',
          computedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    };

    const result = getAccessSetForSSR(payload);

    expect(result).not.toBeNull();
    expect(result?.entitlements['project:view'].allowed).toBe(true);
    expect(result?.entitlements['project:view'].reasons).toEqual([]);
    expect(result?.entitlements['project:edit'].allowed).toBe(false);
    expect(result?.entitlements['project:edit'].reasons).toContain('role_required');
    expect(result?.flags).toEqual({ beta: true });
    expect(result?.plan).toBe('pro');
    expect(result?.computedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns null when acl.set is missing (overflow false but no set)', () => {
    const payload = {
      acl: { hash: 'abc123', overflow: false },
    };
    expect(getAccessSetForSSR(payload)).toBeNull();
  });
});
