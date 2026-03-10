import { describe, expect, it } from 'bun:test';
import { encodeVertzQL, resolveVertzQL } from './vertzql';

function decodeBase64url(encoded: string): unknown {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

describe('encodeVertzQL', () => {
  it('encodes select into base64url string', () => {
    const result = encodeVertzQL({ select: { id: true, name: true } });

    expect(decodeBase64url(result)).toEqual({ select: { id: true, name: true } });
  });

  it('produces URL-safe characters (no +, /, =)', () => {
    const result = encodeVertzQL({ select: { id: true, name: true, email: true } });

    expect(result).not.toContain('+');
    expect(result).not.toContain('/');
    expect(result).not.toContain('=');
  });

  it('encodes include for relation loading', () => {
    const result = encodeVertzQL({ include: { posts: true } });

    expect(decodeBase64url(result)).toEqual({ include: { posts: true } });
  });

  it('encodes both select and include together', () => {
    const result = encodeVertzQL({
      select: { id: true, name: true },
      include: { posts: { title: true } },
    });

    expect(decodeBase64url(result)).toEqual({
      select: { id: true, name: true },
      include: { posts: { title: true } },
    });
  });
});

describe('resolveVertzQL', () => {
  it('returns undefined when query is undefined', () => {
    expect(resolveVertzQL(undefined)).toBeUndefined();
  });

  it('passes through query as-is when no select or include present', () => {
    const query = { status: 'active', page: 1 };

    expect(resolveVertzQL(query)).toEqual({ status: 'active', page: 1 });
  });

  it('extracts select from query and encodes as q= param', () => {
    const query = { select: { id: true, name: true } };
    const result = resolveVertzQL(query);

    expect(result).toBeDefined();
    expect(result?.select).toBeUndefined();
    expect(result?.q).toBeDefined();
    expect(decodeBase64url(result?.q as string)).toEqual({
      select: { id: true, name: true },
    });
  });

  it('preserves other query params alongside q=', () => {
    const query = { status: 'active', select: { id: true } };
    const result = resolveVertzQL(query);

    expect(result).toBeDefined();
    expect(result?.status).toBe('active');
    expect(result?.select).toBeUndefined();
    expect(result?.q).toBeDefined();
  });

  it('extracts include from query and encodes as q= param', () => {
    const query = { include: { posts: true } };
    const result = resolveVertzQL(query);

    expect(result).toBeDefined();
    expect(result?.include).toBeUndefined();
    expect(decodeBase64url(result?.q as string)).toEqual({
      include: { posts: true },
    });
  });

  it('combines select and include into single q= param', () => {
    const query = {
      select: { id: true, name: true },
      include: { posts: true },
    };
    const result = resolveVertzQL(query);

    expect(result).toBeDefined();
    expect(result?.select).toBeUndefined();
    expect(result?.include).toBeUndefined();
    expect(decodeBase64url(result?.q as string)).toEqual({
      select: { id: true, name: true },
      include: { posts: true },
    });
  });

  it('returns same reference when no select or include (no-op)', () => {
    const query = { status: 'active' };
    const result = resolveVertzQL(query);

    expect(result).toBe(query);
  });

  it('different selections produce different q= values (cache key differentiation)', () => {
    const q1 = resolveVertzQL({ select: { id: true, name: true } });
    const q2 = resolveVertzQL({ select: { id: true, email: true } });

    expect(q1?.q).not.toBe(q2?.q);
  });
});

describe('encodeVertzQL round-trip with server decode logic', () => {
  // Mirrors the server's parseVertzQL base64url decode logic
  function serverDecode(encoded: string): Record<string, unknown> {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  }

  it('server decode correctly reads client encodeVertzQL output for select', () => {
    const encoded = encodeVertzQL({ select: { id: true, name: true } });
    const decoded = serverDecode(encoded);

    expect(decoded.select).toEqual({ id: true, name: true });
  });

  it('round-trips include with nested fields', () => {
    const encoded = encodeVertzQL({ include: { posts: { title: true } } });
    const decoded = serverDecode(encoded);

    expect(decoded.include).toEqual({ posts: { title: true } });
  });

  it('round-trips combined select + include', () => {
    const encoded = encodeVertzQL({
      select: { id: true, name: true },
      include: { posts: true },
    });
    const decoded = serverDecode(encoded);

    expect(decoded.select).toEqual({ id: true, name: true });
    expect(decoded.include).toEqual({ posts: true });
  });
});
