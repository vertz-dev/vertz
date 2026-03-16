/**
 * ISR (Incremental Static Regeneration) cache for Cloudflare Workers.
 *
 * Caches SSR-rendered HTML in KV with TTL-based revalidation.
 * Supports stale-while-revalidate via ctx.waitUntil().
 */

// ---------------------------------------------------------------------------
// Cache key normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a URL path into a stable KV cache key.
 *
 * - Strips query parameters and hash fragments
 * - Strips trailing slash (except for root `/`)
 * - Prefixes with `tpr:` namespace
 */
export function normalizeCacheKey(path: string): string {
  // Strip query parameters
  let normalized = path.split('?')[0] ?? path;
  // Strip hash fragments
  normalized = normalized.split('#')[0] ?? normalized;
  // Strip trailing slash (but preserve root)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return `tpr:${normalized}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the JSON stored in KV for each cached page. */
export interface CacheEntry {
  /** Pre-rendered HTML string. */
  html: string;
  /** Unix timestamp (ms) when the entry was stored. */
  timestamp: number;
}

/** Result of a cache lookup. */
export interface ISRCacheResult {
  /** HIT = fresh, STALE = expired but available, MISS = not in cache. */
  status: 'HIT' | 'STALE' | 'MISS';
  /** Cached HTML (present for HIT and STALE). */
  html?: string;
}

// ---------------------------------------------------------------------------
// Cache operations
// ---------------------------------------------------------------------------

/**
 * Look up a page in the KV cache.
 *
 * Returns the cache status and HTML if available.
 * A STALE result means the entry exists but is past its TTL —
 * the caller should serve it and revalidate in the background.
 */
export async function lookupCache(
  kv: KVNamespace,
  path: string,
  ttlSeconds: number,
): Promise<ISRCacheResult> {
  const key = normalizeCacheKey(path);
  const raw = await kv.get(key);

  if (raw == null) {
    return { status: 'MISS' };
  }

  let entry: CacheEntry;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed == null ||
      typeof (parsed as CacheEntry).html !== 'string' ||
      typeof (parsed as CacheEntry).timestamp !== 'number'
    ) {
      return { status: 'MISS' };
    }
    entry = parsed as CacheEntry;
  } catch {
    // Corrupted KV data — treat as cache miss
    return { status: 'MISS' };
  }

  const age = Date.now() - entry.timestamp;
  const fresh = age < ttlSeconds * 1000;

  return {
    status: fresh ? 'HIT' : 'STALE',
    html: entry.html,
  };
}

/**
 * Store a pre-rendered page in the KV cache.
 *
 * Uses a KV expiration TTL of 2x the application TTL to ensure
 * stale entries are garbage-collected if not refreshed.
 */
export async function storeCache(
  kv: KVNamespace,
  path: string,
  html: string,
  expirationTtl?: number,
): Promise<void> {
  const key = normalizeCacheKey(path);
  const entry: CacheEntry = { html, timestamp: Date.now() };
  const options = expirationTtl ? { expirationTtl } : undefined;
  await kv.put(key, JSON.stringify(entry), options);
}

// ---------------------------------------------------------------------------
// Nonce management for cached HTML
// ---------------------------------------------------------------------------

/**
 * Strip nonce attributes from HTML before caching.
 *
 * Removes `nonce="..."` from `<script>` tags so that cached HTML
 * doesn't contain a stale nonce. The serving request injects a
 * fresh nonce via `injectNonce()`.
 */
export function stripNonce(html: string): string {
  return html.replace(/(<script\b[^>]*)\s+nonce="[^"]*"/gi, '$1');
}

/**
 * Inject a fresh nonce into cached HTML.
 *
 * Adds `nonce="..."` to all `<script` tags that don't already have one.
 */
export function injectNonce(html: string, nonce: string): string {
  return html.replace(/<script\b(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`);
}
