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

describe('encodeVertzQL round-trip with server decode logic', () => {
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
});

// ---------------------------------------------------------------------------
// resolveVertzQL — only select/include go into q=, the rest stay as flat params
// ---------------------------------------------------------------------------

describe('resolveVertzQL', () => {
  it('returns undefined when query is undefined', () => {
    expect(resolveVertzQL(undefined)).toBeUndefined();
  });

  it('passes through query as-is when no VertzQL keys present', () => {
    const query = { status: 'active', page: 1 };

    expect(resolveVertzQL(query)).toEqual({ status: 'active', page: 1 });
  });

  it('returns same reference when no VertzQL keys present (no-op)', () => {
    const query = { status: 'active' };
    const result = resolveVertzQL(query);

    expect(result).toBe(query);
  });

  it('preserves undefined values for non-VertzQL keys', () => {
    const query = { status: 'active', filter: undefined };
    const result = resolveVertzQL(query);

    expect(result).toBe(query);
    expect(result).toEqual({ status: 'active', filter: undefined });
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

    expect(result?.select).toBeUndefined();
    expect(result?.include).toBeUndefined();
    expect(decodeBase64url(result?.q as string)).toEqual({
      select: { id: true, name: true },
      include: { posts: true },
    });
  });

  it('extracts include with nested where/orderBy/limit into q= param', () => {
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

  it('preserves other query params alongside q=', () => {
    const query = { status: 'active', select: { id: true } };
    const result = resolveVertzQL(query);

    expect(result?.status).toBe('active');
    expect(result?.select).toBeUndefined();
    expect(result?.q).toBeDefined();
  });

  it('different selections produce different q= values (cache key differentiation)', () => {
    const q1 = resolveVertzQL({ select: { id: true, name: true } });
    const q2 = resolveVertzQL({ select: { id: true, email: true } });

    expect(q1?.q).not.toBe(q2?.q);
  });
});

// ---------------------------------------------------------------------------
// resolveVertzQL — where flattened to bracket notation (NOT encoded in q)
// ---------------------------------------------------------------------------

describe('resolveVertzQL where flattening (#1666)', () => {
  it('flattens simple where equality to bracket notation', () => {
    const result = resolveVertzQL({ where: { projectId: '123' } });

    expect(result?.q).toBeUndefined();
    expect(result?.where).toBeUndefined();
    expect(result?.['where[projectId]']).toBe('123');
  });

  it('flattens multiple where fields to separate bracket keys', () => {
    const result = resolveVertzQL({ where: { status: 'active', projectId: '456' } });

    expect(result?.q).toBeUndefined();
    expect(result?.['where[status]']).toBe('active');
    expect(result?.['where[projectId]']).toBe('456');
  });

  it('flattens where operator filters to nested bracket notation', () => {
    const result = resolveVertzQL({ where: { age: { gt: 18 } } });

    expect(result?.q).toBeUndefined();
    expect(result?.['where[age][gt]']).toBe('18');
  });

  it('flattens where with multiple operators on same field', () => {
    const result = resolveVertzQL({
      where: { createdAt: { gte: '2024-01-01', lte: '2024-12-31' } },
    });

    expect(result?.['where[createdAt][gte]']).toBe('2024-01-01');
    expect(result?.['where[createdAt][lte]']).toBe('2024-12-31');
  });

  it('flattens where with mix of equality and operator filters', () => {
    const result = resolveVertzQL({
      where: { status: 'active', priority: { gte: 3 } },
    });

    expect(result?.['where[status]']).toBe('active');
    expect(result?.['where[priority][gte]']).toBe('3');
  });

  it('flattens where with numeric equality value', () => {
    const result = resolveVertzQL({ where: { count: 42 } });

    expect(result?.['where[count]']).toBe('42');
  });

  it('skips where fields with null values', () => {
    const result = resolveVertzQL({ where: { deletedAt: null, status: 'active' } });

    expect(result?.['where[deletedAt]']).toBeUndefined();
    expect(result?.['where[status]']).toBe('active');
  });

  it('skips where fields with undefined values', () => {
    const result = resolveVertzQL({ where: { name: undefined, status: 'active' } });

    expect(result?.['where[name]']).toBeUndefined();
    expect(result?.['where[status]']).toBe('active');
  });

  it('flattens where alongside q= for select/include', () => {
    const result = resolveVertzQL({
      select: { id: true, title: true },
      where: { projectId: '123' },
    });

    expect(result?.q).toBeDefined();
    expect(decodeBase64url(result?.q as string)).toEqual({
      select: { id: true, title: true },
    });
    expect(result?.['where[projectId]']).toBe('123');
    expect(result?.where).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveVertzQL — orderBy flattened to colon format (NOT encoded in q)
// ---------------------------------------------------------------------------

describe('resolveVertzQL orderBy flattening (#1666)', () => {
  it('flattens single orderBy to colon format', () => {
    const result = resolveVertzQL({ orderBy: { createdAt: 'desc' } });

    expect(result?.q).toBeUndefined();
    expect(result?.orderBy).toBe('createdAt:desc');
  });

  it('flattens orderBy asc direction', () => {
    const result = resolveVertzQL({ orderBy: { name: 'asc' } });

    expect(result?.orderBy).toBe('name:asc');
  });

  it('flattens multiple orderBy fields as comma-separated', () => {
    const result = resolveVertzQL({ orderBy: { createdAt: 'desc', name: 'asc' } });

    expect(result?.orderBy).toBe('createdAt:desc,name:asc');
  });

  it('flattens orderBy alongside q= for select/include', () => {
    const result = resolveVertzQL({
      include: { comments: true },
      orderBy: { createdAt: 'desc' },
    });

    expect(result?.q).toBeDefined();
    expect(decodeBase64url(result?.q as string)).toEqual({
      include: { comments: true },
    });
    expect(result?.orderBy).toBe('createdAt:desc');
  });
});

// ---------------------------------------------------------------------------
// resolveVertzQL — limit stays as flat number (NOT encoded in q)
// ---------------------------------------------------------------------------

describe('resolveVertzQL limit flattening (#1666)', () => {
  it('keeps limit as a flat number param', () => {
    const result = resolveVertzQL({ limit: 10 });

    expect(result?.q).toBeUndefined();
    expect(result?.limit).toBe(10);
  });

  it('keeps limit alongside q= for select/include', () => {
    const result = resolveVertzQL({
      select: { id: true },
      limit: 25,
    });

    expect(result?.q).toBeDefined();
    expect(decodeBase64url(result?.q as string)).toEqual({
      select: { id: true },
    });
    expect(result?.limit).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// resolveVertzQL — combined scenarios
// ---------------------------------------------------------------------------

describe('resolveVertzQL combined flat params (#1666)', () => {
  it('keeps where/orderBy/limit as flat params with select/include in q=', () => {
    const query = {
      select: { id: true, title: true },
      include: { comments: true },
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      limit: 25,
      page: 2,
    };
    const result = resolveVertzQL(query);

    // select and include are in q=
    expect(result?.q).toBeDefined();
    expect(decodeBase64url(result?.q as string)).toEqual({
      select: { id: true, title: true },
      include: { comments: true },
    });

    // where is flattened to bracket notation
    expect(result?.['where[status]']).toBe('active');

    // orderBy is flattened to colon format
    expect(result?.orderBy).toBe('createdAt:desc');

    // limit stays as number
    expect(result?.limit).toBe(25);

    // non-VertzQL params pass through
    expect(result?.page).toBe(2);

    // original keys removed
    expect(result?.select).toBeUndefined();
    expect(result?.include).toBeUndefined();
    expect(result?.where).toBeUndefined();
  });

  it('works with only where/orderBy/limit (no q= generated)', () => {
    const result = resolveVertzQL({
      where: { projectId: '123' },
      orderBy: { createdAt: 'desc' },
      limit: 50,
    });

    expect(result?.q).toBeUndefined();
    expect(result?.['where[projectId]']).toBe('123');
    expect(result?.orderBy).toBe('createdAt:desc');
    expect(result?.limit).toBe(50);
  });

  it('preserves non-VertzQL params alongside flattened params', () => {
    const result = resolveVertzQL({
      where: { status: 'active' },
      page: 2,
      cursor: 'abc',
    });

    expect(result?.['where[status]']).toBe('active');
    expect(result?.page).toBe(2);
    expect(result?.cursor).toBe('abc');
  });
});
