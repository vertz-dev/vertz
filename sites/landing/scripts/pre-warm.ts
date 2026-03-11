/**
 * Pre-warm edge caches after deploy.
 *
 * Fetches every pre-rendered route to populate CDN edge caches,
 * so the first real user always gets a cache HIT.
 */

const SITE_URL = 'https://vertz.dev';

/** All known pre-rendered routes. */
const ROUTES = ['/', '/manifesto'];

/** Critical static assets to pre-warm. */
const ASSETS = ['/assets/vertz.css', '/robots.txt', '/sitemap.xml'];

async function prewarm() {
  const urls = [...ROUTES, ...ASSETS].map((path) => `${SITE_URL}${path}`);

  console.log(`🔥 Pre-warming ${urls.length} URLs...`);

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const start = performance.now();
      const response = await fetch(url);
      const ms = (performance.now() - start).toFixed(0);
      const cacheStatus = response.headers.get('cf-cache-status') || 'unknown';
      console.log(`  ${response.status} ${cacheStatus.padEnd(7)} ${ms.padStart(4)}ms  ${url}`);
      // Consume body to ensure full transfer
      await response.text();
      return { url, status: response.status, cacheStatus };
    }),
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    console.log(`\n⚠ ${failed.length} URL(s) failed to pre-warm`);
  } else {
    console.log('\n✅ All URLs pre-warmed');
  }
}

prewarm();
