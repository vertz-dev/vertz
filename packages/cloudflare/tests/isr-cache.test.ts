import { describe, expect, it, mock } from '@vertz/test';
import {
  type CacheEntry,
  type ISRCacheResult,
  injectNonce,
  lookupCache,
  normalizeCacheKey,
  storeCache,
  stripNonce,
} from '../src/isr-cache.js';

describe('normalizeCacheKey', () => {
  it('prefixes path with tpr:', () => {
    expect(normalizeCacheKey('/about')).toBe('tpr:/about');
  });

  it('strips trailing slash', () => {
    expect(normalizeCacheKey('/about/')).toBe('tpr:/about');
  });

  it('preserves root path as /', () => {
    expect(normalizeCacheKey('/')).toBe('tpr:/');
  });

  it('strips query parameters', () => {
    expect(normalizeCacheKey('/products?page=1&sort=name')).toBe('tpr:/products');
  });

  it('strips hash fragments', () => {
    expect(normalizeCacheKey('/docs#section')).toBe('tpr:/docs');
  });

  it('handles path with both trailing slash and query', () => {
    expect(normalizeCacheKey('/blog/?category=tech')).toBe('tpr:/blog');
  });
});

// ---------------------------------------------------------------------------
// Mock KV namespace
// ---------------------------------------------------------------------------

interface MockKV {
  get: ReturnType<typeof mock>;
  put: ReturnType<typeof mock>;
}

function createMockKV(): MockKV {
  return {
    get: mock().mockResolvedValue(null),
    put: mock().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// lookupCache
// ---------------------------------------------------------------------------

describe('lookupCache', () => {
  it('returns MISS when KV has no entry', async () => {
    const kv = createMockKV();
    const result = await lookupCache(kv as unknown as KVNamespace, '/about', 3600);

    expect(result.status).toBe('MISS');
    expect(result.html).toBeUndefined();
  });

  it('returns HIT when KV has a fresh entry', async () => {
    const kv = createMockKV();
    const entry: CacheEntry = {
      html: '<html>cached</html>',
      timestamp: Date.now() - 1000, // 1 second ago — well within TTL
    };
    kv.get.mockResolvedValue(JSON.stringify(entry));

    const result = await lookupCache(kv as unknown as KVNamespace, '/about', 3600);

    expect(result.status).toBe('HIT');
    expect(result.html).toBe('<html>cached</html>');
  });

  it('returns STALE when KV has an expired entry', async () => {
    const kv = createMockKV();
    const entry: CacheEntry = {
      html: '<html>stale</html>',
      timestamp: Date.now() - 7200_000, // 2 hours ago — past 1h TTL
    };
    kv.get.mockResolvedValue(JSON.stringify(entry));

    const result = await lookupCache(kv as unknown as KVNamespace, '/about', 3600);

    expect(result.status).toBe('STALE');
    expect(result.html).toBe('<html>stale</html>');
  });

  it('uses normalized cache key for KV get', async () => {
    const kv = createMockKV();
    await lookupCache(kv as unknown as KVNamespace, '/about/', 3600);

    expect(kv.get).toHaveBeenCalledWith('tpr:/about');
  });

  it('returns MISS for corrupted JSON in KV', async () => {
    const kv = createMockKV();
    kv.get.mockResolvedValue('not valid json {{{');

    const result = await lookupCache(kv as unknown as KVNamespace, '/about', 3600);
    expect(result.status).toBe('MISS');
  });

  it('returns MISS for JSON missing required fields', async () => {
    const kv = createMockKV();
    kv.get.mockResolvedValue(JSON.stringify({ foo: 'bar' }));

    const result = await lookupCache(kv as unknown as KVNamespace, '/about', 3600);
    expect(result.status).toBe('MISS');
  });

  it('returns MISS for JSON with wrong field types', async () => {
    const kv = createMockKV();
    kv.get.mockResolvedValue(JSON.stringify({ html: 123, timestamp: 'not a number' }));

    const result = await lookupCache(kv as unknown as KVNamespace, '/about', 3600);
    expect(result.status).toBe('MISS');
  });
});

// ---------------------------------------------------------------------------
// storeCache
// ---------------------------------------------------------------------------

describe('storeCache', () => {
  it('stores HTML with timestamp in KV', async () => {
    const kv = createMockKV();
    const before = Date.now();
    await storeCache(kv as unknown as KVNamespace, '/about', '<html>fresh</html>');
    const after = Date.now();

    expect(kv.put).toHaveBeenCalledTimes(1);
    const [key, value] = kv.put.mock.calls[0] as [string, string];
    expect(key).toBe('tpr:/about');
    const parsed = JSON.parse(value) as CacheEntry;
    expect(parsed.html).toBe('<html>fresh</html>');
    expect(parsed.timestamp).toBeGreaterThanOrEqual(before);
    expect(parsed.timestamp).toBeLessThanOrEqual(after);
  });

  it('uses normalized cache key for KV put', async () => {
    const kv = createMockKV();
    await storeCache(kv as unknown as KVNamespace, '/about/', '<html>x</html>');

    const [key] = kv.put.mock.calls[0] as [string, string];
    expect(key).toBe('tpr:/about');
  });

  it('passes expirationTtl to KV put when provided', async () => {
    const kv = createMockKV();
    await storeCache(kv as unknown as KVNamespace, '/about', '<html>x</html>', 7200);

    expect(kv.put).toHaveBeenCalledWith('tpr:/about', expect.any(String), { expirationTtl: 7200 });
  });
});

// ---------------------------------------------------------------------------
// stripNonce / injectNonce
// ---------------------------------------------------------------------------

describe('stripNonce', () => {
  it('removes nonce attribute from script tags', () => {
    const html = '<script type="module" src="/app.js" nonce="abc123"></script>';
    expect(stripNonce(html)).toBe('<script type="module" src="/app.js"></script>');
  });

  it('handles multiple script tags', () => {
    const html = '<script nonce="a1">code</script><script nonce="b2" src="/x.js"></script>';
    expect(stripNonce(html)).toBe('<script>code</script><script src="/x.js"></script>');
  });

  it('leaves HTML without nonces unchanged', () => {
    const html = '<div>hello</div><script src="/app.js"></script>';
    expect(stripNonce(html)).toBe(html);
  });
});

describe('injectNonce', () => {
  it('adds nonce to script tags without one', () => {
    const html = '<script type="module" src="/app.js"></script>';
    expect(injectNonce(html, 'xyz')).toBe(
      '<script nonce="xyz" type="module" src="/app.js"></script>',
    );
  });

  it('does not double-inject nonce on tags that already have one', () => {
    const html = '<script nonce="existing" src="/app.js"></script>';
    const result = injectNonce(html, 'new');
    // Should NOT add a second nonce
    expect(result).toBe(html);
  });

  it('handles multiple script tags', () => {
    const html = '<script src="/a.js"></script><script src="/b.js"></script>';
    const result = injectNonce(html, 'n1');
    expect(result).toContain('nonce="n1"');
    expect(result.match(/nonce=/g)?.length).toBe(2);
  });
});
