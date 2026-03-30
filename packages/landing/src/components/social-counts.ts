/**
 * Server-side cached fetcher for GitHub stars and Discord members.
 *
 * Uses module-level globalThis cache (KV) with 1-hour TTL.
 * Called by query() inside an Island — SSR hydration handles
 * the server → client data transfer automatically.
 */

const isServer = typeof window === 'undefined';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const CACHE_KEY = '__vertz_social_cache';

export interface SocialCounts {
  stars: string;
  members: string;
}

interface CacheEntry {
  data: SocialCounts;
  fetchedAt: number;
}

function formatCount(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}

function getCached(): CacheEntry | undefined {
  return (globalThis as Record<string, unknown>)[CACHE_KEY] as CacheEntry | undefined;
}

function setCache(entry: CacheEntry): void {
  (globalThis as Record<string, unknown>)[CACHE_KEY] = entry;
}

export async function fetchSocialCounts(): Promise<SocialCounts> {
  // Server: return from KV cache if fresh
  if (isServer) {
    const cached = getCached();
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      return cached.data;
    }
  }

  const data: SocialCounts = { stars: '', members: '' };

  try {
    const [ghRes, discordRes] = await Promise.all([
      fetch('https://api.github.com/repos/vertz-dev/vertz'),
      fetch('https://discord.com/api/v10/invites/C7JkeBhH5?with_counts=true'),
    ]);
    const [ghData, discordData] = await Promise.all([ghRes.json(), discordRes.json()]);

    const sc = (ghData as Record<string, unknown>)?.stargazers_count;
    if (typeof sc === 'number') data.stars = formatCount(sc);

    const mc = (discordData as Record<string, unknown>)?.approximate_member_count;
    if (typeof mc === 'number') data.members = formatCount(mc);
  } catch {
    // Return empty counts on failure
  }

  if (isServer) {
    setCache({ data, fetchedAt: Date.now() });
  }

  return data;
}
