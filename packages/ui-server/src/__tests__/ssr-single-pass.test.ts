/**
 * Tests for ssrRenderSinglePass — discovery-only + single render pass.
 *
 * Phase 1 of SSR single-pass prefetch: replaces the two-pass SSR pipeline
 * with discovery-only (captures queries) → prefetch → single render.
 */
import { describe, expect, it } from 'bun:test';
import { query } from '@vertz/ui';
import { installDomShim } from '../dom-shim';
import { ssrStorage } from '../ssr-context';
import { type SSRModule, ssrRenderToString } from '../ssr-render';
import { ssrRenderSinglePass } from '../ssr-single-pass';

installDomShim();

// ─── Test Fixtures ──────────────────────────────────────────────

/** Serialize query params the same way @vertz/fetch does. */
function serializeQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const urlParams = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value !== undefined && value !== null) {
      urlParams.set(key, String(value));
    }
  }
  const str = urlParams.toString();
  return str ? `?${str}` : '';
}

/**
 * Create a mock QueryDescriptor inline (avoids @vertz/fetch dependency).
 * Matches the exact structure that query() checks via isQueryDescriptor().
 */
function mockDescriptor<T>(
  method: string,
  path: string,
  data: T,
  queryParams?: Record<string, unknown>,
  options?: { delay?: number },
) {
  const key = `${method}:${path}${serializeQuery(queryParams)}`;
  const fetchResult = async () => {
    if (options?.delay) {
      await new Promise((r) => setTimeout(r, options.delay));
    }
    return { ok: true as const, data };
  };
  return {
    _tag: 'QueryDescriptor' as const,
    _key: key,
    _fetch: fetchResult,
    // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike
    then(onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return fetchResult().then(onFulfilled, onRejected);
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Feature: Discovery-only single-pass SSR', () => {
  describe('Given a page with query() calls', () => {
    const taskListData = {
      items: [
        { id: '1', title: 'Task One' },
        { id: '2', title: 'Task Two' },
      ],
    };
    const taskListDescriptor = mockDescriptor('GET', '/tasks', taskListData);

    function createTaskListModule() {
      return {
        default: () => {
          const tasks = query(taskListDescriptor);
          const el = document.createElement('div');
          el.setAttribute('data-testid', 'task-list');

          if (tasks.loading.value) {
            el.textContent = 'Loading...';
          } else if (tasks.data.value) {
            const data = tasks.data.value as typeof taskListData;
            el.textContent = data.items.map((t) => t.title).join(', ');
          }

          return el;
        },
      };
    }

    describe('When ssrRenderSinglePass() is called', () => {
      it('Then HTML output matches two-pass output for same data', async () => {
        const module = createTaskListModule();

        const twoPass = await ssrRenderToString(module, '/');
        const singlePass = await ssrRenderSinglePass(module, '/');

        expect(singlePass.html).toBe(twoPass.html);
      });

      it('Then the app factory is called exactly twice (discovery + render)', async () => {
        let callCount = 0;
        const module = {
          default: () => {
            callCount++;
            const tasks = query(taskListDescriptor);
            const el = document.createElement('div');
            if (tasks.data.value) {
              const data = tasks.data.value as typeof taskListData;
              el.textContent = data.items.map((t) => t.title).join(', ');
            } else {
              el.textContent = 'Loading...';
            }
            return el;
          },
        };

        await ssrRenderSinglePass(module, '/');

        // Discovery pass + render pass = 2 calls total
        // (vs two-pass which also calls 2 times, but the architecture is cleaner)
        expect(callCount).toBe(2);
      });

      it('Then queries that hit cache register 0 SSR queries in render context', async () => {
        // We verify this indirectly: if all queries hit cache,
        // ssrData should contain the pre-fetched data (from discovery),
        // and the render pass should not have registered new queries.
        const module = createTaskListModule();

        const result = await ssrRenderSinglePass(module, '/');

        expect(result.html).toContain('Task One');
        expect(result.html).toContain('Task Two');
        expect(result.html).not.toContain('Loading...');
        expect(result.ssrData).toHaveLength(1);
        expect(result.ssrData[0].key).toBe(taskListDescriptor._key);
      });
    });
  });

  describe('Given multiple queries on the same page', () => {
    const tasksData = { items: [{ id: '1', title: 'Task A' }] };
    const statsData = { total: 42, completed: 10 };
    const tasksDescriptor = mockDescriptor('GET', '/tasks', tasksData);
    const statsDescriptor = mockDescriptor('GET', '/stats', statsData);

    function createMultiQueryModule() {
      return {
        default: () => {
          const tasks = query(tasksDescriptor);
          const stats = query(statsDescriptor);
          const el = document.createElement('div');

          const taskSpan = document.createElement('span');
          taskSpan.setAttribute('data-testid', 'tasks');
          if (tasks.data.value) {
            const data = tasks.data.value as typeof tasksData;
            taskSpan.textContent = data.items.map((t) => t.title).join(', ');
          } else {
            taskSpan.textContent = 'Loading tasks...';
          }

          const statsSpan = document.createElement('span');
          statsSpan.setAttribute('data-testid', 'stats');
          if (stats.data.value) {
            const data = stats.data.value as typeof statsData;
            statsSpan.textContent = `Total: ${data.total}`;
          } else {
            statsSpan.textContent = 'Loading stats...';
          }

          el.appendChild(taskSpan);
          el.appendChild(statsSpan);
          return el;
        },
      };
    }

    describe('When ssrRenderSinglePass() is called', () => {
      it('Then all queries are discovered and rendered with data', async () => {
        const module = createMultiQueryModule();

        const result = await ssrRenderSinglePass(module, '/');

        expect(result.html).toContain('Task A');
        expect(result.html).toContain('Total: 42');
        expect(result.html).not.toContain('Loading tasks...');
        expect(result.html).not.toContain('Loading stats...');
      });

      it('Then ssrData contains both resolved queries', async () => {
        const module = createMultiQueryModule();

        const result = await ssrRenderSinglePass(module, '/');

        expect(result.ssrData).toHaveLength(2);
        const keys = result.ssrData.map((d) => d.key);
        expect(keys).toContain(tasksDescriptor._key);
        expect(keys).toContain(statsDescriptor._key);
      });

      it('Then HTML matches two-pass output', async () => {
        const module = createMultiQueryModule();

        const twoPass = await ssrRenderToString(module, '/');
        const singlePass = await ssrRenderSinglePass(module, '/');

        expect(singlePass.html).toBe(twoPass.html);
      });
    });
  });

  describe('Given an SSR redirect during discovery', () => {
    describe('When ProtectedRoute writes a redirect', () => {
      it('Then the result contains redirect.to and empty html', async () => {
        const module = {
          default: () => {
            // Simulate ProtectedRoute setting ssrRedirect
            const store = ssrStorage.getStore();
            if (store) {
              store.ssrRedirect = { to: '/login' };
            }
            return document.createElement('div');
          },
        };

        const result = await ssrRenderSinglePass(module, '/protected');

        expect(result.redirect).toEqual({ to: '/login' });
        expect(result.html).toBe('');
        expect(result.ssrData).toEqual([]);
      });
    });
  });

  describe('Given a query that exceeds the SSR timeout', () => {
    describe('When the timeout fires during discovery', () => {
      it('Then cached queries render data, timed-out query shows loading', async () => {
        const fastData = { items: [{ id: '1', title: 'Fast Task' }] };
        const fastDescriptor = mockDescriptor('GET', '/tasks', fastData);
        // This query takes 5s — will exceed the 50ms SSR timeout
        const slowDescriptor = mockDescriptor('GET', '/slow-stats', { total: 99 }, undefined, {
          delay: 5000,
        });

        const module = {
          default: () => {
            const tasks = query(fastDescriptor);
            const stats = query(slowDescriptor);
            const el = document.createElement('div');

            const taskSpan = document.createElement('span');
            if (tasks.data.value) {
              const data = tasks.data.value as typeof fastData;
              taskSpan.textContent = data.items.map((t) => t.title).join(', ');
            } else {
              taskSpan.textContent = 'Loading tasks...';
            }

            const statsSpan = document.createElement('span');
            if (stats.data.value) {
              statsSpan.textContent = `Total: ${(stats.data.value as { total: number }).total}`;
            } else {
              statsSpan.textContent = 'Loading stats...';
            }

            el.appendChild(taskSpan);
            el.appendChild(statsSpan);
            return el;
          },
        };

        const result = await ssrRenderSinglePass(module, '/', { ssrTimeout: 50 });

        // Fast query should render with data
        expect(result.html).toContain('Fast Task');
        // Slow query should show loading (timed out during discovery)
        expect(result.html).toContain('Loading stats...');
        // Only the fast query should be in ssrData
        expect(result.ssrData).toHaveLength(1);
        expect(result.ssrData[0].key).toBe(fastDescriptor._key);
      });
    });
  });

  describe('Given a null thunk query', () => {
    describe('When ssrRenderSinglePass() is called', () => {
      it('Then null thunk queries stay idle and render correctly', async () => {
        const module = {
          default: () => {
            const result = query(() => null as Promise<{ items: string[] }> | null);
            const el = document.createElement('div');
            if (result.idle.value) {
              el.textContent = 'Idle';
            } else if (result.data.value) {
              el.textContent = 'Has data';
            }
            return el;
          },
        };

        const result = await ssrRenderSinglePass(module, '/');

        expect(result.html).toContain('Idle');
        expect(result.ssrData).toHaveLength(0);
      });
    });
  });

  describe('Given a URL with /index.html suffix', () => {
    describe('When ssrRenderSinglePass() is called', () => {
      it('Then the URL is normalized (suffix stripped)', async () => {
        let capturedUrl = '';
        const module = {
          default: () => {
            const store = ssrStorage.getStore();
            capturedUrl = store?.url ?? '';
            return document.createElement('div');
          },
        };

        await ssrRenderSinglePass(module, '/about/index.html');

        expect(capturedUrl).toBe('/about');
      });
    });
  });

  describe('Given a module without default or App export', () => {
    describe('When ssrRenderSinglePass() is called', () => {
      it('Then it throws an error', async () => {
        const module = {} as SSRModule;

        await expect(ssrRenderSinglePass(module, '/')).rejects.toThrow(
          'App entry must export a default function or named App function',
        );
      });
    });
  });

  describe('Given prefetch: false option', () => {
    describe('When ssrRenderSinglePass() is called', () => {
      it('Then it falls back to two-pass rendering', async () => {
        let callCount = 0;
        const data = { items: [{ id: '1', title: 'Fallback Test' }] };
        const descriptor = mockDescriptor('GET', '/tasks', data);
        const module = {
          default: () => {
            callCount++;
            const tasks = query(descriptor);
            const el = document.createElement('div');
            if (tasks.data.value) {
              el.textContent = (tasks.data.value as typeof data).items[0].title;
            }
            return el;
          },
        };

        const result = await ssrRenderSinglePass(module, '/', { prefetch: false });

        expect(result.html).toContain('Fallback Test');
        // Two-pass calls createApp twice (same as current behavior)
        expect(callCount).toBe(2);
      });
    });
  });

  // ─── Entity Access Filtering ────────────────────────────────────

  describe('Given entity access rules in the manifest', () => {
    const publicData = { items: [{ id: '1', title: 'Public Item' }] };
    const privateData = { items: [{ id: '2', title: 'Private Item' }] };
    const publicDescriptor = mockDescriptor('GET', '/posts', publicData);
    const privateDescriptor = mockDescriptor('GET', '/secrets', privateData);

    function createMixedAccessModule() {
      return {
        default: () => {
          const posts = query(publicDescriptor);
          const secrets = query(privateDescriptor);
          const el = document.createElement('div');

          const postsSpan = document.createElement('span');
          if (posts.data.value) {
            postsSpan.textContent = (posts.data.value as typeof publicData).items[0].title;
          } else {
            postsSpan.textContent = 'Loading posts...';
          }

          const secretsSpan = document.createElement('span');
          if (secrets.data.value) {
            secretsSpan.textContent = (secrets.data.value as typeof privateData).items[0].title;
          } else {
            secretsSpan.textContent = 'Loading secrets...';
          }

          el.appendChild(postsSpan);
          el.appendChild(secretsSpan);
          return el;
        },
      };
    }

    describe('When an anonymous user requests the page', () => {
      it('Then only public entity queries are prefetched', async () => {
        const module = createMixedAccessModule();

        const result = await ssrRenderSinglePass(module, '/', {
          manifest: {
            routePatterns: ['/'],
            entityAccess: {
              posts: { list: { type: 'public' } },
              secrets: { list: { type: 'authenticated' } },
            },
          },
          prefetchSession: { status: 'unauthenticated' },
        });

        // Public entity data should be rendered
        expect(result.html).toContain('Public Item');
        // Authenticated-only entity should show loading (not prefetched)
        expect(result.html).toContain('Loading secrets...');
        // Only the public query should be in ssrData
        expect(result.ssrData).toHaveLength(1);
        expect(result.ssrData[0].key).toBe(publicDescriptor._key);
      });
    });

    describe('When an authenticated user requests the page', () => {
      it('Then all eligible entity queries are prefetched', async () => {
        const module = createMixedAccessModule();

        const result = await ssrRenderSinglePass(module, '/', {
          manifest: {
            routePatterns: ['/'],
            entityAccess: {
              posts: { list: { type: 'public' } },
              secrets: { list: { type: 'authenticated' } },
            },
          },
          prefetchSession: { status: 'authenticated' },
        });

        // Both entities should be rendered with data
        expect(result.html).toContain('Public Item');
        expect(result.html).toContain('Private Item');
        expect(result.ssrData).toHaveLength(2);
      });
    });

    describe('When an entity has a deny rule', () => {
      it('Then that entity is never prefetched', async () => {
        const module = createMixedAccessModule();

        const result = await ssrRenderSinglePass(module, '/', {
          manifest: {
            routePatterns: ['/'],
            entityAccess: {
              posts: { list: { type: 'public' } },
              secrets: { list: { type: 'deny' } },
            },
          },
          prefetchSession: { status: 'authenticated' },
        });

        expect(result.html).toContain('Public Item');
        expect(result.html).toContain('Loading secrets...');
        expect(result.ssrData).toHaveLength(1);
      });
    });

    describe('When no manifest is provided', () => {
      it('Then all queries are prefetched (no filtering)', async () => {
        const module = createMixedAccessModule();

        const result = await ssrRenderSinglePass(module, '/');

        expect(result.html).toContain('Public Item');
        expect(result.html).toContain('Private Item');
        expect(result.ssrData).toHaveLength(2);
      });
    });

    describe('When entity access uses role-based rules', () => {
      it('Then queries for entities requiring admin role are filtered for non-admins', async () => {
        const module = createMixedAccessModule();

        const result = await ssrRenderSinglePass(module, '/', {
          manifest: {
            routePatterns: ['/'],
            entityAccess: {
              posts: { list: { type: 'public' } },
              secrets: { list: { type: 'role', roles: ['admin'] } },
            },
          },
          prefetchSession: {
            status: 'authenticated',
            roles: ['user'],
          },
        });

        expect(result.html).toContain('Public Item');
        expect(result.html).toContain('Loading secrets...');
        expect(result.ssrData).toHaveLength(1);
      });

      it('Then admin users can access admin-only entities', async () => {
        const module = createMixedAccessModule();

        const result = await ssrRenderSinglePass(module, '/', {
          manifest: {
            routePatterns: ['/'],
            entityAccess: {
              posts: { list: { type: 'public' } },
              secrets: { list: { type: 'role', roles: ['admin'] } },
            },
          },
          prefetchSession: {
            status: 'authenticated',
            roles: ['admin'],
          },
        });

        expect(result.html).toContain('Public Item');
        expect(result.html).toContain('Private Item');
        expect(result.ssrData).toHaveLength(2);
      });
    });

    describe('When entity access uses where rules', () => {
      it('Then where rules always pass (row-level filter, not access gate)', async () => {
        const module = createMixedAccessModule();

        const result = await ssrRenderSinglePass(module, '/', {
          manifest: {
            routePatterns: ['/'],
            entityAccess: {
              posts: { list: { type: 'public' } },
              secrets: {
                list: {
                  type: 'all',
                  rules: [
                    { type: 'authenticated' },
                    { type: 'where', conditions: { createdBy: { $user: 'id' } } },
                  ],
                },
              },
            },
          },
          prefetchSession: { status: 'authenticated' },
        });

        // Both should render — where is not an access gate
        expect(result.html).toContain('Public Item');
        expect(result.html).toContain('Private Item');
        expect(result.ssrData).toHaveLength(2);
      });
    });
  });
});
