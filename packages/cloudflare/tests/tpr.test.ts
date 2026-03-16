import { describe, expect, it, mock } from 'bun:test';
import {
  type AnalyzeTrafficOptions,
  analyzeTraffic,
  filterPagePaths,
  preRenderPages,
  selectHotPaths,
  type TrafficEntry,
} from '../src/tpr.js';

// ---------------------------------------------------------------------------
// filterPagePaths
// ---------------------------------------------------------------------------

describe('filterPagePaths', () => {
  it('excludes paths starting with /api', () => {
    const entries: TrafficEntry[] = [
      { path: '/api/todos', requests: 500 },
      { path: '/about', requests: 100 },
    ];
    expect(filterPagePaths(entries, '/api')).toEqual([{ path: '/about', requests: 100 }]);
  });

  it('excludes asset paths (/assets/, /_)', () => {
    const entries: TrafficEntry[] = [
      { path: '/assets/main.js', requests: 1000 },
      { path: '/_vertz/image', requests: 200 },
      { path: '/products', requests: 300 },
    ];
    expect(filterPagePaths(entries, '/api')).toEqual([{ path: '/products', requests: 300 }]);
  });

  it('excludes paths with file extensions', () => {
    const entries: TrafficEntry[] = [
      { path: '/favicon.ico', requests: 500 },
      { path: '/robots.txt', requests: 100 },
      { path: '/sitemap.xml', requests: 50 },
      { path: '/about', requests: 200 },
    ];
    expect(filterPagePaths(entries, '/api')).toEqual([{ path: '/about', requests: 200 }]);
  });

  it('keeps root path /', () => {
    const entries: TrafficEntry[] = [
      { path: '/', requests: 5000 },
      { path: '/api/health', requests: 100 },
    ];
    expect(filterPagePaths(entries, '/api')).toEqual([{ path: '/', requests: 5000 }]);
  });
});

// ---------------------------------------------------------------------------
// selectHotPaths
// ---------------------------------------------------------------------------

describe('selectHotPaths', () => {
  it('returns paths covering the threshold percentage of traffic', () => {
    const entries: TrafficEntry[] = [
      { path: '/', requests: 5000 },
      { path: '/products', requests: 3000 },
      { path: '/about', requests: 1000 },
      { path: '/contact', requests: 500 },
      { path: '/blog/post-1', requests: 300 },
      { path: '/blog/post-2', requests: 200 },
    ];

    // Total = 10000, threshold 0.9 = 9000 requests needed
    const result = selectHotPaths(entries, 0.9, 500);
    // / (5000) + /products (3000) + /about (1000) = 9000 >= 90%
    expect(result).toEqual(['/', '/products', '/about']);
  });

  it('respects maxPages cap', () => {
    const entries: TrafficEntry[] = [
      { path: '/', requests: 5000 },
      { path: '/products', requests: 3000 },
      { path: '/about', requests: 1000 },
      { path: '/contact', requests: 500 },
    ];

    const result = selectHotPaths(entries, 0.99, 2);
    expect(result).toHaveLength(2);
    expect(result).toEqual(['/', '/products']);
  });

  it('returns empty array for empty input', () => {
    expect(selectHotPaths([], 0.9, 500)).toEqual([]);
  });

  it('sorts by request count descending', () => {
    const entries: TrafficEntry[] = [
      { path: '/about', requests: 100 },
      { path: '/', requests: 5000 },
      { path: '/products', requests: 3000 },
    ];

    const result = selectHotPaths(entries, 0.99, 500);
    expect(result[0]).toBe('/');
    expect(result[1]).toBe('/products');
  });
});

// ---------------------------------------------------------------------------
// analyzeTraffic
// ---------------------------------------------------------------------------

describe('analyzeTraffic', () => {
  it('calls the Cloudflare GraphQL API with correct parameters', async () => {
    const mockFetch = mock().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            viewer: {
              zones: [
                {
                  httpRequests1hGroups: [
                    {
                      dimensions: { datetime: '2026-03-15T00:00:00Z' },
                      sum: {
                        urlPathSummary: [{ path: '/', requests: 5000 }],
                      },
                    },
                  ],
                },
              ],
            },
          },
        }),
      ),
    );

    const options: AnalyzeTrafficOptions = {
      zoneId: 'test-zone-123',
      apiToken: 'test-token',
      lookback: '24h',
      threshold: 0.9,
      maxPages: 500,
      apiBasePath: '/api',
      fetchFn: mockFetch,
    };

    const result = await analyzeTraffic(options);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/graphql');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      }),
    );
    // Verify we actually got paths back
    expect(result).toContain('/');
  });

  it('returns filtered and ranked hot paths', async () => {
    const mockFetch = mock().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            viewer: {
              zones: [
                {
                  httpRequests1hGroups: [
                    {
                      dimensions: { datetime: '2026-03-15T12:00:00Z' },
                      sum: {
                        urlPathSummary: [
                          { path: '/', requests: 5000 },
                          { path: '/products', requests: 3000 },
                          { path: '/about', requests: 1000 },
                          { path: '/api/todos', requests: 2000 },
                          { path: '/assets/main.js', requests: 8000 },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          },
        }),
      ),
    );

    const result = await analyzeTraffic({
      zoneId: 'test-zone',
      apiToken: 'token',
      lookback: '24h',
      threshold: 0.9,
      maxPages: 500,
      apiBasePath: '/api',
      fetchFn: mockFetch,
    });

    // Only page paths should be included (no /api, /assets)
    expect(result).not.toContain('/api/todos');
    expect(result).not.toContain('/assets/main.js');
    // Pages should be ranked by traffic
    expect(result[0]).toBe('/');
  });

  it('throws on API error', async () => {
    const mockFetch = mock().mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [{ message: 'Authentication error' }],
        }),
        { status: 200 },
      ),
    );

    await expect(
      analyzeTraffic({
        zoneId: 'test-zone',
        apiToken: 'bad-token',
        lookback: '24h',
        threshold: 0.9,
        maxPages: 500,
        apiBasePath: '/api',
        fetchFn: mockFetch,
      }),
    ).rejects.toThrow('Cloudflare Analytics API error');
  });
});

// ---------------------------------------------------------------------------
// preRenderPages
// ---------------------------------------------------------------------------

function createMockKV() {
  return {
    get: mock().mockResolvedValue(null),
    put: mock().mockResolvedValue(undefined),
  };
}

describe('preRenderPages', () => {
  it('renders each path and stores in KV', async () => {
    const kv = createMockKV();
    const renderFn = mock(async (path: string) => `<html>${path}</html>`);

    const result = await preRenderPages({
      paths: ['/about', '/products', '/contact'],
      kvNamespace: kv as unknown as KVNamespace,
      renderFn,
      concurrency: 10,
    });

    expect(result.rendered).toBe(3);
    expect(result.failed).toHaveLength(0);
    expect(renderFn).toHaveBeenCalledTimes(3);
    expect(kv.put).toHaveBeenCalledTimes(3);
  });

  it('reports failed renders without stopping', async () => {
    const kv = createMockKV();
    const renderFn = mock(async (path: string) => {
      if (path === '/broken') throw new Error('SSR failed');
      return `<html>${path}</html>`;
    });

    const result = await preRenderPages({
      paths: ['/about', '/broken', '/products'],
      kvNamespace: kv as unknown as KVNamespace,
      renderFn,
    });

    expect(result.rendered).toBe(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.path).toBe('/broken');
    expect(result.failed[0]!.error).toBe('SSR failed');
  });

  it('calls onProgress for each successful render', async () => {
    const kv = createMockKV();
    const renderFn = mock(async (path: string) => `<html>${path}</html>`);
    const onProgress = mock();

    await preRenderPages({
      paths: ['/a', '/b'],
      kvNamespace: kv as unknown as KVNamespace,
      renderFn,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('respects concurrency limit', async () => {
    const kv = createMockKV();
    let maxConcurrent = 0;
    let current = 0;

    const renderFn = mock(async (path: string) => {
      current++;
      if (current > maxConcurrent) maxConcurrent = current;
      // Simulate async work
      await new Promise((r) => setTimeout(r, 10));
      current--;
      return `<html>${path}</html>`;
    });

    const paths = Array.from({ length: 20 }, (_, i) => `/page-${i}`);
    await preRenderPages({
      paths,
      kvNamespace: kv as unknown as KVNamespace,
      renderFn,
      concurrency: 5,
    });

    expect(maxConcurrent).toBeLessThanOrEqual(5);
  });

  it('returns duration in milliseconds', async () => {
    const kv = createMockKV();
    const renderFn = mock(async () => '<html></html>');

    const result = await preRenderPages({
      paths: ['/'],
      kvNamespace: kv as unknown as KVNamespace,
      renderFn,
    });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
