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
      include: { posts: { select: { title: true } } },
    });

    expect(decodeBase64url(result)).toEqual({
      select: { id: true, name: true },
      include: { posts: { select: { title: true } } },
    });
  });
});

describe('resolveVertzQL', () => {
  it('returns undefined when query is undefined', () => {
    expect(resolveVertzQL(undefined)).toBeUndefined();
  });

  it('passes through query as-is when no VertzQL keys present', () => {
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

  it('extracts where from query and encodes inside q= param', () => {
    const query = { where: { projectId: '123' } };
    const result = resolveVertzQL(query);

    expect(result).toBeDefined();
    expect(result?.where).toBeUndefined();
    expect(result?.q).toBeDefined();
    expect(decodeBase64url(result?.q as string)).toEqual({
      where: { projectId: '123' },
    });
  });

  it('extracts orderBy from query and encodes inside q= param', () => {
    const query = { orderBy: { createdAt: 'desc' } };
    const result = resolveVertzQL(query);

    expect(result).toBeDefined();
    expect(result?.orderBy).toBeUndefined();
    expect(result?.q).toBeDefined();
    expect(decodeBase64url(result?.q as string)).toEqual({
      orderBy: { createdAt: 'desc' },
    });
  });

  it('extracts limit from query and encodes inside q= param', () => {
    const query = { limit: 10 };
    const result = resolveVertzQL(query);

    expect(result).toBeDefined();
    expect(result?.limit).toBeUndefined();
    expect(result?.q).toBeDefined();
    expect(decodeBase64url(result?.q as string)).toEqual({
      limit: 10,
    });
  });

  it('combines all five VertzQL keys into single q= param', () => {
    const query = {
      select: { id: true, title: true },
      include: { comments: true },
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      limit: 25,
      page: 2,
    };
    const result = resolveVertzQL(query);

    expect(result).toBeDefined();
    expect(result?.select).toBeUndefined();
    expect(result?.include).toBeUndefined();
    expect(result?.where).toBeUndefined();
    expect(result?.orderBy).toBeUndefined();
    expect(result?.limit).toBeUndefined();
    expect(result?.page).toBe(2);
    expect(decodeBase64url(result?.q as string)).toEqual({
      select: { id: true, title: true },
      include: { comments: true },
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      limit: 25,
    });
  });

  it('returns same reference when no VertzQL keys present (no-op)', () => {
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

describe('encodeVertzQL with top-level where/orderBy/limit (#1637)', () => {
  it('encodes where as a top-level VertzQL key', () => {
    const result = encodeVertzQL({ where: { projectId: '123' } });

    expect(decodeBase64url(result)).toEqual({ where: { projectId: '123' } });
  });

  it('encodes orderBy as a top-level VertzQL key', () => {
    const result = encodeVertzQL({ orderBy: { createdAt: 'desc' } });

    expect(decodeBase64url(result)).toEqual({ orderBy: { createdAt: 'desc' } });
  });

  it('encodes limit as a top-level VertzQL key', () => {
    const result = encodeVertzQL({ limit: 10 });

    expect(decodeBase64url(result)).toEqual({ limit: 10 });
  });

  it('encodes all five VertzQL keys together', () => {
    const params = {
      select: { id: true, title: true },
      include: { comments: true },
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      limit: 25,
    };
    const result = encodeVertzQL(params);

    expect(decodeBase64url(result)).toEqual(params);
  });
});

describe('encodeVertzQL with where/orderBy/limit in include (#1130)', () => {
  it('encodes include with where, orderBy, and limit', () => {
    const result = encodeVertzQL({
      include: {
        comments: {
          where: { status: 'published' },
          orderBy: { createdAt: 'desc' },
          limit: 10,
        },
      },
    });

    expect(decodeBase64url(result)).toEqual({
      include: {
        comments: {
          where: { status: 'published' },
          orderBy: { createdAt: 'desc' },
          limit: 10,
        },
      },
    });
  });

  it('encodes nested include (depth 2)', () => {
    const result = encodeVertzQL({
      include: {
        author: {
          select: { name: true },
          include: {
            organization: { select: { name: true } },
          },
        },
      },
    });

    expect(decodeBase64url(result)).toEqual({
      include: {
        author: {
          select: { name: true },
          include: {
            organization: { select: { name: true } },
          },
        },
      },
    });
  });

  it('encodes mixed boolean and object includes', () => {
    const result = encodeVertzQL({
      include: {
        tags: true,
        comments: {
          where: { status: 'published' },
          limit: 5,
        },
      },
    });

    expect(decodeBase64url(result)).toEqual({
      include: {
        tags: true,
        comments: {
          where: { status: 'published' },
          limit: 5,
        },
      },
    });
  });
});

describe('resolveVertzQL with nested include options (#1130)', () => {
  it('extracts include with where/orderBy/limit into q= param', () => {
    const query = {
      include: {
        comments: {
          where: { status: 'published' },
          orderBy: { createdAt: 'desc' },
          limit: 10,
        },
      },
    };
    const result = resolveVertzQL(query);

    expect(result?.include).toBeUndefined();
    expect(result?.q).toBeDefined();
    expect(decodeBase64url(result?.q as string)).toEqual({
      include: {
        comments: {
          where: { status: 'published' },
          orderBy: { createdAt: 'desc' },
          limit: 10,
        },
      },
    });
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
    const encoded = encodeVertzQL({ include: { posts: { select: { title: true } } } });
    const decoded = serverDecode(encoded);

    expect(decoded.include).toEqual({ posts: { select: { title: true } } });
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

  it('round-trips where filter (#1637)', () => {
    const encoded = encodeVertzQL({ where: { projectId: '123' } });
    const decoded = serverDecode(encoded);

    expect(decoded.where).toEqual({ projectId: '123' });
  });

  it('round-trips orderBy (#1637)', () => {
    const encoded = encodeVertzQL({ orderBy: { createdAt: 'desc' } });
    const decoded = serverDecode(encoded);

    expect(decoded.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('round-trips limit (#1637)', () => {
    const encoded = encodeVertzQL({ limit: 10 });
    const decoded = serverDecode(encoded);

    expect(decoded.limit).toBe(10);
  });

  it('round-trips all five VertzQL keys (#1637)', () => {
    const params = {
      select: { id: true, title: true },
      include: { comments: true },
      where: { status: 'active', projectId: '456' },
      orderBy: { createdAt: 'desc' },
      limit: 50,
    };
    const encoded = encodeVertzQL(params);
    const decoded = serverDecode(encoded);

    expect(decoded).toEqual(params);
  });
});
