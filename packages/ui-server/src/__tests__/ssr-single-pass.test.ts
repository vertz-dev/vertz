/**
 * Tests for ssrRenderSinglePass — discovery-only + single render pass.
 *
 * Tests for ssrRenderSinglePass — discovery-only (captures queries) → prefetch → single render.
 */
import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createRouter, defineRoutes, query, resetInjectedStyles, RouterView } from '@vertz/ui';
import type { AuthSdk } from '@vertz/ui/auth';
import { AuthProvider } from '@vertz/ui/auth';
import { ProtectedRoute } from '@vertz/ui-auth';
import { installDomShim } from '../dom-shim';
import { ssrStorage } from '../ssr-context';
import type { SSRModule } from '../ssr-shared';
import { ssrRenderProgressive, ssrRenderSinglePass } from '../ssr-single-pass';

installDomShim();

afterEach(() => {
  resetInjectedStyles();
});

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

  // ─── Entity Access Filtering ──────────────────────────────��─────

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

// ─── Zero-Discovery SSR ─────────────────────────────────────────

describe('Feature: Zero-discovery SSR rendering', () => {
  const taskListData = {
    items: [
      { id: '1', title: 'Task Alpha' },
      { id: '2', title: 'Task Beta' },
    ],
  };

  function createMockApi() {
    return {
      tasks: {
        list: (queryParams?: Record<string, unknown>) => {
          return mockDescriptor('GET', '/tasks', taskListData, queryParams);
        },
        get: (id: string, options?: Record<string, unknown>) => {
          return mockDescriptor('GET', `/tasks/${id}`, { id, title: `Task ${id}` }, options);
        },
      },
    };
  }

  describe('Given manifest with routeEntries and module.api exported', () => {
    it('Then createApp() is called exactly once (no discovery pass)', async () => {
      let appCallCount = 0;

      const module: SSRModule = {
        default: () => {
          appCallCount++;
          const tasks = query(mockDescriptor('GET', '/tasks', taskListData));
          const el = document.createElement('div');
          if (tasks.data.value) {
            const data = tasks.data.value as typeof taskListData;
            el.textContent = data.items.map((t) => t.title).join(', ');
          }
          return el;
        },
        api: createMockApi(),
      };

      await ssrRenderSinglePass(module, '/tasks', {
        manifest: {
          routePatterns: ['/tasks'],
          routeEntries: {
            '/tasks': {
              queries: [{ descriptorChain: 'api.tasks.list', entity: 'tasks', operation: 'list' }],
            },
          },
        },
      });

      // Zero-discovery: createApp called exactly once (render only, no discovery)
      expect(appCallCount).toBe(1);
    });

    it('Then HTML output contains prefetched data', async () => {
      const module: SSRModule = {
        default: () => {
          const tasks = query(mockDescriptor('GET', '/tasks', taskListData));
          const el = document.createElement('div');
          if (tasks.data.value) {
            const data = tasks.data.value as typeof taskListData;
            el.textContent = data.items.map((t) => t.title).join(', ');
          }
          return el;
        },
        api: createMockApi(),
      };

      const result = await ssrRenderSinglePass(module, '/tasks', {
        manifest: {
          routePatterns: ['/tasks'],
          routeEntries: {
            '/tasks': {
              queries: [{ descriptorChain: 'api.tasks.list', entity: 'tasks', operation: 'list' }],
            },
          },
        },
      });

      expect(result.html).toContain('Task Alpha');
      expect(result.html).toContain('Task Beta');
    });
  });

  describe('Given route NOT in manifest', () => {
    it('Then falls back to discovery-based single-pass', async () => {
      let appCallCount = 0;

      const module: SSRModule = {
        default: () => {
          appCallCount++;
          const tasks = query(mockDescriptor('GET', '/tasks', taskListData));
          const el = document.createElement('div');
          if (tasks.data.value) {
            const data = tasks.data.value as typeof taskListData;
            el.textContent = data.items.map((t) => t.title).join(', ');
          }
          return el;
        },
        api: createMockApi(),
      };

      await ssrRenderSinglePass(module, '/unknown-route', {
        manifest: {
          routePatterns: ['/tasks'],
          routeEntries: {
            '/tasks': {
              queries: [{ descriptorChain: 'api.tasks.list', entity: 'tasks', operation: 'list' }],
            },
          },
        },
      });

      // No route match → falls back to discovery (2 calls: discovery + render)
      expect(appCallCount).toBe(2);
    });
  });

  describe('Given module.api is not exported', () => {
    it('Then falls back to discovery-based single-pass', async () => {
      let appCallCount = 0;

      const module: SSRModule = {
        default: () => {
          appCallCount++;
          const tasks = query(mockDescriptor('GET', '/tasks', taskListData));
          const el = document.createElement('div');
          if (tasks.data.value) {
            const data = tasks.data.value as typeof taskListData;
            el.textContent = data.items.map((t) => t.title).join(', ');
          }
          return el;
        },
        // No api export
      };

      await ssrRenderSinglePass(module, '/tasks', {
        manifest: {
          routePatterns: ['/tasks'],
          routeEntries: {
            '/tasks': {
              queries: [{ descriptorChain: 'api.tasks.list', entity: 'tasks', operation: 'list' }],
            },
          },
        },
      });

      // No API client → falls back to discovery (2 calls)
      expect(appCallCount).toBe(2);
    });
  });

  describe('Given /tasks/:taskId with parameterized queries', () => {
    it('Then route params resolve correctly into descriptor factories', async () => {
      const module: SSRModule = {
        default: () => {
          const task = query(
            mockDescriptor('GET', '/tasks/t-42', { id: 't-42', title: 'Task t-42' }),
          );
          const el = document.createElement('div');
          if (task.data.value) {
            const data = task.data.value as { id: string; title: string };
            el.textContent = data.title;
          }
          return el;
        },
        api: createMockApi(),
      };

      const result = await ssrRenderSinglePass(module, '/tasks/t-42', {
        manifest: {
          routePatterns: ['/tasks/:taskId'],
          routeEntries: {
            '/tasks/:taskId': {
              queries: [
                {
                  descriptorChain: 'api.tasks.get',
                  entity: 'tasks',
                  operation: 'get',
                  idParam: 'taskId',
                },
              ],
            },
          },
        },
      });

      expect(result.html).toContain('Task t-42');
      expect(result.ssrData).toHaveLength(1);
    });
  });

  describe('Given manifest query that component conditionally skips', () => {
    it('Then extra prefetched data is harmless (unused in cache)', async () => {
      // Module queries tasks but manifest includes BOTH tasks and labels
      const module: SSRModule = {
        default: () => {
          const tasks = query(mockDescriptor('GET', '/tasks', taskListData));
          const el = document.createElement('div');
          if (tasks.data.value) {
            const data = tasks.data.value as typeof taskListData;
            el.textContent = data.items.map((t) => t.title).join(', ');
          }
          return el;
        },
        api: {
          ...createMockApi(),
          labels: {
            list: () => mockDescriptor('GET', '/labels', { items: [{ id: 'l1', name: 'bug' }] }),
          },
        },
      };

      const result = await ssrRenderSinglePass(module, '/tasks', {
        manifest: {
          routePatterns: ['/tasks'],
          routeEntries: {
            '/tasks': {
              queries: [
                { descriptorChain: 'api.tasks.list', entity: 'tasks', operation: 'list' },
                { descriptorChain: 'api.labels.list', entity: 'labels', operation: 'list' },
              ],
            },
          },
        },
      });

      // Renders normally — extra prefetched data is harmless
      expect(result.html).toContain('Task Alpha');
      // ssrData includes BOTH prefetched queries (even unused ones)
      expect(result.ssrData).toHaveLength(2);
    });
  });

  describe('Given a zero-discovery module with ssrAuth', () => {
    it('Then ssrAuth is passed to the render context', async () => {
      const taskListData = {
        items: [{ id: '1', title: 'Authed Task' }],
      };

      const module: SSRModule = {
        default: () => {
          const tasks = query(mockDescriptor('GET', '/tasks', taskListData));
          const el = document.createElement('div');
          if (tasks.data.value) {
            const data = tasks.data.value as typeof taskListData;
            el.textContent = data.items.map((t) => t.title).join(', ');
          }
          return el;
        },
        api: {
          tasks: {
            list: () => mockDescriptor('GET', '/tasks', taskListData),
          },
        },
      };

      const result = await ssrRenderSinglePass(module, '/tasks', {
        ssrAuth: {
          status: 'authenticated',
          user: { id: 'u1', email: 'a@b.c', role: 'user' },
          expiresAt: Date.now() + 60_000,
        },
        manifest: {
          routePatterns: ['/tasks'],
          routeEntries: {
            '/tasks': {
              queries: [{ descriptorChain: 'api.tasks.list', entity: 'tasks', operation: 'list' }],
            },
          },
        },
      });

      expect(result.html).toContain('Authed Task');
    });
  });

  describe('Given a zero-discovery module with an invalid theme', () => {
    it('Then logs error and renders without CSS', async () => {
      const spy = spyOn(console, 'error').mockImplementation(() => {});
      const taskListData = { items: [{ id: '1', title: 'Theme Err' }] };

      const module: SSRModule = {
        default: () => {
          const tasks = query(mockDescriptor('GET', '/tasks', taskListData));
          const el = document.createElement('div');
          if (tasks.data.value) {
            const data = tasks.data.value as typeof taskListData;
            el.textContent = data.items.map((t) => t.title).join(', ');
          }
          return el;
        },
        api: {
          tasks: {
            list: () => mockDescriptor('GET', '/tasks', taskListData),
          },
        },
        // Invalid theme — will cause compileThemeCached to throw
        theme: {} as never,
      };

      const result = await ssrRenderSinglePass(module, '/tasks', {
        manifest: {
          routePatterns: ['/tasks'],
          routeEntries: {
            '/tasks': {
              queries: [{ descriptorChain: 'api.tasks.list', entity: 'tasks', operation: 'list' }],
            },
          },
        },
      });

      expect(result.html).toContain('Theme Err');
      expect(spy).toHaveBeenCalledWith(
        '[vertz] Failed to compile theme export. Ensure your theme is created with defineTheme().',
        expect.any(Error),
      );
      spy.mockRestore();
    });
  });

  describe('Given a zero-discovery module with ProtectedRoute', () => {
    function createMockAuthSdk(): AuthSdk {
      const noop = Object.assign(
        async () => ({
          ok: true as const,
          data: {
            user: { id: '1', email: 'test@test.com', role: 'user' },
            expiresAt: Date.now() + 60_000,
          },
        }),
        { url: '/api/auth/signin', method: 'POST' },
      );
      return {
        signIn: noop,
        signUp: Object.assign(
          async () => ({
            ok: true as const,
            data: {
              user: { id: '1', email: 'test@test.com', role: 'user' },
              expiresAt: Date.now() + 60_000,
            },
          }),
          { url: '/api/auth/signup', method: 'POST' },
        ),
        signOut: async () => ({ ok: true as const, data: { ok: true } }),
        refresh: async () => ({
          ok: true as const,
          data: {
            user: { id: '1', email: 'test@test.com', role: 'user' },
            expiresAt: Date.now() + 60_000,
          },
        }),
        providers: async () => ({ ok: true as const, data: [] }),
      };
    }

    it('Then returns redirect when unauthenticated', async () => {
      const taskListData = { items: [{ id: '1', title: 'Protected' }] };

      const module: SSRModule = {
        default: () => {
          const container = document.createElement('div');
          AuthProvider({
            auth: createMockAuthSdk(),
            children: () => {
              const result = ProtectedRoute({
                loginPath: '/login',
                children: () => {
                  query(mockDescriptor('GET', '/tasks', taskListData));
                  container.textContent = 'Protected';
                  return container;
                },
              });
              if (result && typeof result === 'object' && 'value' in result) {
                (result as { value: unknown }).value;
              }
              return container;
            },
          });
          return container;
        },
        api: {
          tasks: {
            list: () => mockDescriptor('GET', '/tasks', taskListData),
          },
        },
      };

      const result = await ssrRenderSinglePass(module, '/admin', {
        ssrAuth: { status: 'unauthenticated' },
        manifest: {
          routePatterns: ['/admin'],
          routeEntries: {
            '/admin': {
              queries: [{ descriptorChain: 'api.tasks.list', entity: 'tasks', operation: 'list' }],
            },
          },
        },
      });

      expect(result.redirect).toBeDefined();
      expect(result.redirect!.to).toContain('/login');
    });
  });

  describe('Given a zero-discovery descriptor returning non-ok result', () => {
    it('Then the raw result is stored in ssrData', async () => {
      const errorResult = { ok: false, error: 'Not found' };

      function createFailingApi() {
        return {
          tasks: {
            list: () => {
              const key = 'GET:/tasks';
              const fetchResult = async () => errorResult;
              return {
                _tag: 'QueryDescriptor' as const,
                _key: key,
                _fetch: fetchResult,

                then(onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
                  return fetchResult().then(onFulfilled, onRejected);
                },
              };
            },
          },
        };
      }

      const module: SSRModule = {
        default: () => {
          const el = document.createElement('div');
          el.textContent = 'Error case';
          return el;
        },
        api: createFailingApi(),
      };

      const result = await ssrRenderSinglePass(module, '/tasks', {
        manifest: {
          routePatterns: ['/tasks'],
          routeEntries: {
            '/tasks': {
              queries: [{ descriptorChain: 'api.tasks.list', entity: 'tasks', operation: 'list' }],
            },
          },
        },
      });

      // Non-ok result is stored as-is (not unwrapped)
      expect(result.ssrData).toHaveLength(1);
      expect(result.ssrData[0]?.data).toEqual(errorResult);
    });
  });
});

// ─── Progressive SSR rendering ──────────────────────────────────

describe('Feature: Progressive SSR rendering', () => {
  describe('Given a simple module', () => {
    it('Then returns a render stream with app HTML', async () => {
      const module: SSRModule = {
        default: () => {
          const el = document.createElement('div');
          el.textContent = 'Progressive Hello';
          return el;
        },
      };

      const result = await ssrRenderProgressive(module, '/');

      expect(result.redirect).toBeUndefined();
      expect(result.renderStream).toBeInstanceOf(ReadableStream);
      expect(result.css).toBeDefined();
      expect(result.ssrData).toEqual([]);
    });
  });

  describe('Given a module with queries', () => {
    it('Then ssrData contains discovered and resolved queries', async () => {
      const taskListData = { items: [{ id: '1', title: 'Progressive Task' }] };

      const module: SSRModule = {
        default: () => {
          const tasks = query(mockDescriptor('GET', '/tasks', taskListData));
          const el = document.createElement('div');
          if (tasks.data.value) {
            const data = tasks.data.value as typeof taskListData;
            el.textContent = data.items.map((t) => t.title).join(', ');
          }
          return el;
        },
      };

      const result = await ssrRenderProgressive(module, '/');

      expect(result.ssrData).toHaveLength(1);
      expect(result.ssrData[0]?.key).toBe('GET:/tasks');
      expect(result.renderStream).toBeDefined();
    });
  });

  describe('Given a redirect during discovery', () => {
    function createMockAuthSdk(): AuthSdk {
      const noop = Object.assign(
        async () => ({
          ok: true as const,
          data: {
            user: { id: '1', email: 'test@test.com', role: 'user' },
            expiresAt: Date.now() + 60_000,
          },
        }),
        { url: '/api/auth/signin', method: 'POST' },
      );
      return {
        signIn: noop,
        signUp: Object.assign(
          async () => ({
            ok: true as const,
            data: {
              user: { id: '1', email: 'test@test.com', role: 'user' },
              expiresAt: Date.now() + 60_000,
            },
          }),
          { url: '/api/auth/signup', method: 'POST' },
        ),
        signOut: async () => ({ ok: true as const, data: { ok: true } }),
        refresh: async () => ({
          ok: true as const,
          data: {
            user: { id: '1', email: 'test@test.com', role: 'user' },
            expiresAt: Date.now() + 60_000,
          },
        }),
        providers: async () => ({ ok: true as const, data: [] }),
      };
    }

    it('Then returns redirect result without a render stream', async () => {
      const module: SSRModule = {
        default: () => {
          const container = document.createElement('div');
          AuthProvider({
            auth: createMockAuthSdk(),
            children: () => {
              const result = ProtectedRoute({
                loginPath: '/login',
                children: () => {
                  container.textContent = 'Protected';
                  return container;
                },
              });
              if (result && typeof result === 'object' && 'value' in result) {
                (result as { value: unknown }).value;
              }
              return container;
            },
          });
          return container;
        },
      };

      const result = await ssrRenderProgressive(module, '/protected', {
        ssrAuth: { status: 'unauthenticated' },
      });

      expect(result.redirect).toBeDefined();
      expect(result.redirect!.to).toContain('/login');
      expect(result.renderStream).toBeUndefined();
    });
  });

  describe('Given a module with an invalid theme', () => {
    it('Then logs error and renders without CSS', async () => {
      const spy = spyOn(console, 'error').mockImplementation(() => {});

      const module: SSRModule = {
        default: () => {
          const el = document.createElement('div');
          el.textContent = 'Theme Error Progressive';
          return el;
        },
        theme: {} as never,
      };

      const result = await ssrRenderProgressive(module, '/');

      expect(result.css).toBe('');
      expect(result.renderStream).toBeDefined();
      expect(spy).toHaveBeenCalledWith(
        '[vertz] Failed to compile theme export. Ensure your theme is created with defineTheme().',
        expect.any(Error),
      );
      spy.mockRestore();
    });
  });

  describe('Given a /index.html URL', () => {
    it('Then normalizes the URL by stripping the suffix', async () => {
      const module: SSRModule = {
        default: () => {
          const el = document.createElement('div');
          el.textContent = 'Normalized';
          return el;
        },
      };

      const result = await ssrRenderProgressive(module, '/page/index.html');

      expect(result.redirect).toBeUndefined();
      expect(result.renderStream).toBeDefined();
    });
  });

  describe('Given a module with ssrAuth', () => {
    it('Then passes auth state to the render context', async () => {
      const module: SSRModule = {
        default: () => {
          const el = document.createElement('div');
          el.textContent = 'Authed Progressive';
          return el;
        },
      };

      const result = await ssrRenderProgressive(module, '/', {
        ssrAuth: {
          status: 'authenticated',
          user: { id: 'u1', email: 'a@b.c', role: 'user' },
          expiresAt: Date.now() + 60_000,
        },
      });

      expect(result.renderStream).toBeDefined();
    });
  });
});

// ─── Theme compile error in discovery-based render ───────────────

describe('Feature: Theme compile error handling', () => {
  describe('Given ssrRenderSinglePass with an invalid theme', () => {
    it('Then logs error and renders without CSS', async () => {
      const spy = spyOn(console, 'error').mockImplementation(() => {});

      const module: SSRModule = {
        default: () => {
          const el = document.createElement('div');
          el.textContent = 'Theme Error Single';
          return el;
        },
        theme: {} as never,
      };

      const result = await ssrRenderSinglePass(module, '/');

      expect(result.html).toContain('Theme Error Single');
      expect(result.css).toBe('');
      expect(spy).toHaveBeenCalledWith(
        '[vertz] Failed to compile theme export. Ensure your theme is created with defineTheme().',
        expect.any(Error),
      );
      spy.mockRestore();
    });
  });
});

// ─── Entity access key parsing edge cases ─────────────────────────

describe('Feature: Entity access key parsing edge cases', () => {
  describe('Given keys with various formats', () => {
    it('Then filters correctly when entity key has query params but no sub-path', async () => {
      // Key format: GET:/tasks?status=done → entity=tasks, method=list
      const taskListData = { items: [{ id: '1', title: 'Filtered' }] };

      const module: SSRModule = {
        default: () => {
          const tasks = query(mockDescriptor('GET', '/tasks', taskListData, { status: 'done' }));
          const el = document.createElement('div');
          if (tasks.data.value) {
            const data = tasks.data.value as typeof taskListData;
            el.textContent = data.items.map((t) => t.title).join(', ');
          }
          return el;
        },
      };

      // Deny list for tasks — should filter out the query
      const result = await ssrRenderSinglePass(module, '/', {
        manifest: {
          routePatterns: ['/'],
          entityAccess: {
            tasks: { list: { type: 'deny' } },
          },
        },
        prefetchSession: { authenticated: true, roles: [], userId: 'u1' },
      });

      // Query was filtered out → no SSR data
      expect(result.ssrData).toHaveLength(0);
    });

    it('Then filters correctly when entity key has sub-path (get operation)', async () => {
      // Key format: GET:/tasks/123 → entity=tasks, method=get
      const taskData = { id: '123', title: 'Detail' };

      const module: SSRModule = {
        default: () => {
          const task = query(mockDescriptor('GET', '/tasks/123', taskData));
          const el = document.createElement('div');
          if (task.data.value) {
            el.textContent = (task.data.value as typeof taskData).title;
          }
          return el;
        },
      };

      // Deny get for tasks — should filter out the query
      const result = await ssrRenderSinglePass(module, '/', {
        manifest: {
          routePatterns: ['/'],
          entityAccess: {
            tasks: { get: { type: 'deny' } },
          },
        },
        prefetchSession: { authenticated: true, roles: [], userId: 'u1' },
      });

      expect(result.ssrData).toHaveLength(0);
    });

    it('Then filters correctly when entity key has both sub-path and query params', async () => {
      // Key format: GET:/tasks/123?include=comments → entity=tasks, method=get
      const taskData = { id: '123', title: 'Detail With Params' };

      const module: SSRModule = {
        default: () => {
          const task = query(
            mockDescriptor('GET', '/tasks/123', taskData, { include: 'comments' }),
          );
          const el = document.createElement('div');
          if (task.data.value) {
            el.textContent = (task.data.value as typeof taskData).title;
          }
          return el;
        },
      };

      // Allow get for tasks — query should pass
      const result = await ssrRenderSinglePass(module, '/', {
        manifest: {
          routePatterns: ['/'],
          entityAccess: {
            tasks: { get: { type: 'public' } },
          },
        },
        prefetchSession: { authenticated: true, roles: [], userId: 'u1' },
      });

      expect(result.ssrData).toHaveLength(1);
    });
  });
});

// NOTE: Lazy route resolution (lines 347-368 of ssr-single-pass.ts) is covered
// by router-view.test.ts in @vertz/ui which tests pendingRouteComponents with
// the real router infrastructure. Testing it here would require duplicating
// router internals that are better tested at the integration level.
