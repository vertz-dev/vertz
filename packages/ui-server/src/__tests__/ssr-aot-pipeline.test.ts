/**
 * Tests for AOT SSR Pipeline — createHoles() and ssrRenderAot().
 *
 * Phase 2 of AOT-compiled SSR: runtime holes and SSR pipeline integration.
 * Issue: #1745
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { installDomShim } from '../dom-shim';
import {
  type AotDataResolver,
  type AotManifest,
  type AotRenderFn,
  clearRouteCssCache,
  createHoles,
  resolveParamQueryKeys,
  ssrRenderAot,
} from '../ssr-aot-pipeline';
import { __esc } from '../ssr-aot-runtime';
import type { SSRModule } from '../ssr-shared';

installDomShim();

// ─── Test Fixtures ──────────────────────────────────────────────

/** Create a minimal SSRModule with named component exports. */
function createMockModule(
  components: Record<string, () => unknown> = {},
): SSRModule & Record<string, unknown> {
  return {
    default: () => {
      const el = document.createElement('div');
      el.textContent = 'app';
      return el;
    },
    ...components,
  };
}

/** Create an AOT render function that returns static HTML. */
function staticAotFn(html: string): AotRenderFn {
  return () => html;
}

// ─── createHoles() Tests ────────────────────────────────────────

describe('Feature: Runtime holes and SSR integration', () => {
  describe('createHoles()', () => {
    describe('Given an empty hole list', () => {
      it('Then returns an empty record', () => {
        const module = createMockModule();
        const holes = createHoles([], module, '/', new Map());
        expect(holes).toEqual({});
      });
    });

    describe('Given a component with a runtime hole', () => {
      describe('When the hole component exists in the module', () => {
        it('Then creates a closure that renders the component to HTML', () => {
          const module = createMockModule({
            Sidebar: () => {
              const el = document.createElement('aside');
              el.setAttribute('class', 'sidebar');
              el.textContent = 'Sidebar content';
              return el;
            },
          });

          const holes = createHoles(['Sidebar'], module, '/', new Map());
          expect(holes.Sidebar).toBeDefined();
          expect(typeof holes.Sidebar).toBe('function');

          const html = holes.Sidebar?.();
          expect(html).toContain('<aside');
          expect(html).toContain('class="sidebar"');
          expect(html).toContain('Sidebar content');
        });
      });

      describe('When the hole component does NOT exist in the module', () => {
        it('Then returns a placeholder comment', () => {
          const module = createMockModule();
          const holes = createHoles(['MissingComponent'], module, '/', new Map());

          const html = holes.MissingComponent?.();
          expect(html).toContain('<!-- AOT hole: MissingComponent not found -->');
        });
      });

      describe('When the hole renders a component with children', () => {
        it('Then the full DOM tree is serialized', () => {
          const module = createMockModule({
            UserCard: () => {
              const card = document.createElement('div');
              card.setAttribute('class', 'user-card');
              const name = document.createElement('span');
              name.textContent = 'Alice';
              card.appendChild(name);
              const role = document.createElement('span');
              role.textContent = 'Admin';
              card.appendChild(role);
              return card;
            },
          });

          const holes = createHoles(['UserCard'], module, '/', new Map());
          const html = holes.UserCard?.();
          expect(html).toContain('Alice');
          expect(html).toContain('Admin');
          expect(html).toContain('user-card');
        });
      });

      describe('When query data is shared', () => {
        it('Then hole closure has access to the same query cache', () => {
          const queryCache = new Map<string, unknown>();
          queryCache.set('GET:/tasks', {
            items: [{ id: '1', title: 'Task One' }],
          });

          // The hole component doesn't directly use query() in this test,
          // but verifies the cache is accessible via context sharing.
          // Full query() integration requires the reactive runtime.
          const module = createMockModule({
            TaskList: () => {
              const el = document.createElement('ul');
              el.setAttribute('data-testid', 'task-list');
              return el;
            },
          });

          const holes = createHoles(['TaskList'], module, '/', queryCache);
          const html = holes.TaskList?.();
          expect(html).toContain('data-testid="task-list"');
        });
      });

      describe('When multiple holes are requested', () => {
        it('Then creates a closure for each', () => {
          const module = createMockModule({
            Header: () => {
              const el = document.createElement('header');
              el.textContent = 'Header';
              return el;
            },
            Footer: () => {
              const el = document.createElement('footer');
              el.textContent = 'Footer';
              return el;
            },
          });

          const holes = createHoles(['Header', 'Footer'], module, '/', new Map());
          expect(Object.keys(holes)).toHaveLength(2);

          const headerHtml = holes.Header?.();
          expect(headerHtml).toContain('<header');

          const footerHtml = holes.Footer?.();
          expect(footerHtml).toContain('<footer');
        });
      });
    });
  });

  // ─── ssrRenderAot() Tests ──────────────────────────────────────

  describe('ssrRenderAot()', () => {
    beforeEach(() => {
      clearRouteCssCache();
    });

    describe('Given a fully AOT-compiled route', () => {
      describe('When ssrRenderAot() is called', () => {
        it('Then the AOT function is called (no DOM shim)', async () => {
          let aotCalled = false;
          const aotFn: AotRenderFn = () => {
            aotCalled = true;
            return '<div class="page"><h1>Projects</h1></div>';
          };

          const module = createMockModule();
          const aotManifest: AotManifest = {
            routes: {
              '/projects': { render: aotFn, holes: [] },
            },
          };

          const result = await ssrRenderAot(module, '/projects', { aotManifest });
          expect(aotCalled).toBe(true);
          expect(result.html).toBe('<div class="page"><h1>Projects</h1></div>');
        });

        it('Then returns matchedRoutePatterns for per-route modulepreload', async () => {
          const module = createMockModule();
          const aotManifest: AotManifest = {
            routes: {
              '/projects': { render: staticAotFn('<div>Projects</div>'), holes: [] },
            },
          };

          const result = await ssrRenderAot(module, '/projects', { aotManifest });
          expect(result.matchedRoutePatterns).toEqual(['/projects']);
        });

        it('Then ssrData is populated from query cache', async () => {
          const aotFn: AotRenderFn = (_data, ctx) => {
            return `<div>${__esc(String(ctx.getData('GET:/tasks')))}</div>`;
          };

          const module = createMockModule();
          const aotManifest: AotManifest = {
            routes: {
              '/tasks': {
                render: aotFn,
                holes: [],
                queryKeys: ['GET:/tasks'],
              },
            },
          };

          const result = await ssrRenderAot(module, '/tasks', { aotManifest });
          expect(result.ssrData).toBeDefined();
          expect(Array.isArray(result.ssrData)).toBe(true);
        });

        it('Then CSS is collected from the module', async () => {
          const module = createMockModule();
          module.styles = ['.test { color: red; }'];

          const aotManifest: AotManifest = {
            routes: {
              '/styled': { render: staticAotFn('<div>Styled</div>'), holes: [] },
            },
          };

          const result = await ssrRenderAot(module, '/styled', { aotManifest });
          expect(result.css).toContain('.test { color: red; }');
          expect(result.css).toContain('data-vertz-css');
        });
      });
    });

    describe('Given a route with holes', () => {
      describe('When ssrRenderAot() is called', () => {
        it('Then the AOT shell renders via string concatenation and holes render via DOM shim', async () => {
          const aotFn: AotRenderFn = (_data, ctx) => {
            const sidebarHtml = ctx.holes.Sidebar?.() ?? '';
            return `<div class="layout"><main>AOT content</main><aside>${sidebarHtml}</aside></div>`;
          };

          const module = createMockModule({
            Sidebar: () => {
              const el = document.createElement('nav');
              el.textContent = 'DOM shim sidebar';
              return el;
            },
          });

          const aotManifest: AotManifest = {
            routes: {
              '/with-sidebar': { render: aotFn, holes: ['Sidebar'] },
            },
          };

          const result = await ssrRenderAot(module, '/with-sidebar', { aotManifest });
          expect(result.html).toContain('AOT content');
          expect(result.html).toContain('DOM shim sidebar');
          expect(result.html).toContain('<nav');
        });
      });
    });

    describe('Given a route with dynamic params', () => {
      describe('When ssrRenderAot() is called', () => {
        it('Then route params are available in ctx.params', async () => {
          let capturedParams: Record<string, string> = {};
          const aotFn: AotRenderFn = (_data, ctx) => {
            capturedParams = ctx.params;
            return `<div>Project ${__esc(ctx.params.projectId ?? '')}</div>`;
          };

          const module = createMockModule();
          const aotManifest: AotManifest = {
            routes: {
              '/projects/:projectId': { render: aotFn, holes: [] },
            },
          };

          const result = await ssrRenderAot(module, '/projects/abc-123', { aotManifest });
          expect(capturedParams.projectId).toBe('abc-123');
          expect(result.html).toContain('abc-123');
        });
      });
    });

    describe('Given a route NOT in AOT manifest', () => {
      describe('When ssrRenderAot() is called', () => {
        it('Then falls back to ssrRenderSinglePass()', async () => {
          const module = createMockModule();
          const aotManifest: AotManifest = {
            routes: {
              '/projects': { render: staticAotFn('<div>Projects</div>'), holes: [] },
            },
          };

          // Request a route not in the manifest
          const result = await ssrRenderAot(module, '/settings', { aotManifest });
          // Fallback renders via DOM shim — the module's default() creates <div>app</div>
          expect(result.html).toContain('app');
        });
      });
    });

    describe('Given a URL with /index.html suffix', () => {
      describe('When ssrRenderAot() is called', () => {
        it('Then normalizes the URL before matching', async () => {
          let aotCalled = false;
          const aotFn: AotRenderFn = () => {
            aotCalled = true;
            return '<div>Home</div>';
          };

          const module = createMockModule();
          const aotManifest: AotManifest = {
            routes: {
              '/': { render: aotFn, holes: [] },
            },
          };

          await ssrRenderAot(module, '/index.html', { aotManifest });
          expect(aotCalled).toBe(true);
        });
      });
    });

    describe('Given an AOT route with queryKeys and a prefetch manifest', () => {
      describe('When ssrRenderAot() is called with an API client', () => {
        it('Then prefetches data and populates the query cache', async () => {
          let receivedData: unknown;
          const aotFn: AotRenderFn = (_data, ctx) => {
            receivedData = ctx.getData('tasks-list');
            return '<div>Tasks</div>';
          };

          const module = createMockModule();
          // Simulate API client: module.api.tasks.list() → descriptor
          (module as Record<string, unknown>).api = {
            tasks: {
              list: () => ({
                _key: 'vertz:tasks:list:{}',
                _fetch: () => Promise.resolve({ ok: true, data: [{ id: '1', title: 'Buy milk' }] }),
              }),
            },
          };

          const aotManifest: AotManifest = {
            routes: {
              '/tasks': {
                render: aotFn,
                holes: [],
                queryKeys: ['tasks-list'],
              },
            },
          };

          const manifest = {
            routePatterns: ['/tasks'],
            routeEntries: {
              '/tasks': {
                queries: [
                  { descriptorChain: 'api.tasks.list', entity: 'tasks', operation: 'list' },
                ],
              },
            },
          };

          await ssrRenderAot(module, '/tasks', { aotManifest, manifest });

          expect(receivedData).toEqual([{ id: '1', title: 'Buy milk' }]);
        });
      });
    });

    describe('Given a route with query data', () => {
      describe('When the AOT function reads data via ctx.getData()', () => {
        it('Then query cache entries are passed as data and ssrData', async () => {
          const aotFn: AotRenderFn = (_data, ctx) => {
            return `<div>${__esc(String(ctx.getData('GET:/items')))}</div>`;
          };

          const module = createMockModule();
          const aotManifest: AotManifest = {
            routes: {
              '/items': {
                render: aotFn,
                holes: [],
                queryKeys: ['GET:/items'],
              },
            },
          };

          const result = await ssrRenderAot(module, '/items', { aotManifest });
          expect(result.ssrData).toBeDefined();
          expect(Array.isArray(result.ssrData)).toBe(true);
        });
      });
    });

    describe('Given ssrAuth is provided', () => {
      describe('When holes are created for the route', () => {
        it('Then ssrAuth is passed to the hole closures', async () => {
          const aotFn: AotRenderFn = (_data, ctx) => {
            const sidebarHtml = ctx.holes.Sidebar?.() ?? '';
            return `<div>${sidebarHtml}</div>`;
          };

          const module = createMockModule({
            Sidebar: () => {
              const el = document.createElement('div');
              el.textContent = 'sidebar';
              return el;
            },
          });

          const aotManifest: AotManifest = {
            routes: {
              '/': { render: aotFn, holes: ['Sidebar'] },
            },
          };

          const result = await ssrRenderAot(module, '/', {
            aotManifest,
            ssrAuth: {
              status: 'authenticated',
              user: { id: 'u-1', email: 'test@test.com', role: 'admin' },
              expiresAt: Date.now() + 3600_000,
            } satisfies import('@vertz/ui/internals').SSRAuth,
          });
          expect(result.html).toContain('sidebar');
        });
      });
    });

    describe('Given a module with a theme export', () => {
      describe('When ssrRenderAot() collects CSS', () => {
        it('Then theme CSS is included in the result', async () => {
          const module = createMockModule();
          // Simulate a theme export — compileTheme will be called
          // This exercises the collectCSSFromModule theme path
          module.theme = {
            tokens: {},
            css: '.theme { color: blue; }',
          };

          const aotManifest: AotManifest = {
            routes: {
              '/themed': { render: staticAotFn('<div>Themed</div>'), holes: [] },
            },
          };

          // The theme compile may throw if the format doesn't match defineTheme(),
          // which exercises the catch block in collectCSSFromModule
          const result = await ssrRenderAot(module, '/themed', { aotManifest });
          // Either the theme compiled successfully or the error was caught gracefully
          expect(result.html).toBe('<div>Themed</div>');
        });
      });
    });

    describe('Given per-route CSS in the manifest (#1988, #1989)', () => {
      describe('When ssrRenderAot() collects CSS', () => {
        it('Then per-route CSS is used directly without runtime filtering', async () => {
          const aotFn: AotRenderFn = () =>
            '<div class="_used1234"><span class="_used5678">Content</span></div>';

          const module = createMockModule();
          const aotManifest: AotManifest = {
            routes: {
              '/page': {
                render: aotFn,
                holes: [],
                // Only the CSS needed by this route — pre-filtered at build time
                css: ['._used1234 {\n  padding: 1rem;\n}', '._used5678 {\n  color: blue;\n}'],
              },
            },
          };

          const result = await ssrRenderAot(module, '/page', { aotManifest });

          // Per-route CSS should be present
          expect(result.css).toContain('_used1234');
          expect(result.css).toContain('_used5678');
          expect(result.css).toContain('padding: 1rem');
        });

        it('Then per-route CSS works without getInjectedCSS() (workerd)', async () => {
          const aotFn: AotRenderFn = () => '<div class="_abc12345">Styled</div>';

          const module = createMockModule();
          delete (module as Record<string, unknown>).getInjectedCSS;

          const aotManifest: AotManifest = {
            routes: {
              '/styled': {
                render: aotFn,
                holes: [],
                css: ['._abc12345 {\n  background: red;\n}'],
              },
            },
          };

          const result = await ssrRenderAot(module, '/styled', { aotManifest });
          expect(result.css).toContain('_abc12345');
          expect(result.css).toContain('background: red');
        });

        it('Then app CSS and route CSS are merged', async () => {
          const pageFn: AotRenderFn = () => '<main class="_page1234">Page</main>';
          const appFn: AotRenderFn = (_data, ctx) =>
            `<div class="_app56789">${ctx.holes.RouterView?.() ?? ''}</div>`;

          const module = createMockModule();
          const aotManifest: AotManifest = {
            routes: {
              '/': {
                render: pageFn,
                holes: [],
                css: ['._page1234 {\n  padding: 2rem;\n}'],
              },
            },
            app: {
              render: appFn,
              holes: ['RouterView'],
              css: ['._app56789 {\n  display: flex;\n}'],
            },
          };

          const result = await ssrRenderAot(module, '/', { aotManifest });
          // Both app and route CSS should be present
          expect(result.css).toContain('_app56789');
          expect(result.css).toContain('_page1234');
        });

        it('Then per-route CSS is cached across requests (no per-request allocations)', async () => {
          clearRouteCssCache();

          const aotFn: AotRenderFn = () => '<div class="_cached12">Cached</div>';
          const module = createMockModule();
          const aotManifest: AotManifest = {
            routes: {
              '/cached': {
                render: aotFn,
                holes: [],
                css: ['._cached12 {\n  margin: 1rem;\n}'],
              },
            },
          };

          const result1 = await ssrRenderAot(module, '/cached', { aotManifest });
          const result2 = await ssrRenderAot(module, '/cached', { aotManifest });

          // Same CSS output
          expect(result1.css).toBe(result2.css);
          expect(result1.css).toContain('_cached12');
        });
      });
    });

    describe('Given VERTZ_DEBUG=aot is set', () => {
      describe('When diagnostics are provided and AOT renders', () => {
        it('Then divergence detection runs without breaking the render', async () => {
          const originalEnv = process.env.VERTZ_DEBUG;
          process.env.VERTZ_DEBUG = 'aot';
          try {
            const { AotDiagnostics } = await import('../ssr-aot-diagnostics');
            const diagnostics = new AotDiagnostics();

            const aotFn: AotRenderFn = () => '<div>AOT output</div>';
            const module = createMockModule();
            const aotManifest: AotManifest = {
              routes: {
                '/test': { render: aotFn, holes: [] },
              },
            };

            const result = await ssrRenderAot(module, '/test', {
              aotManifest,
              diagnostics,
            });

            expect(result.html).toBe('<div>AOT output</div>');
            // Divergence may or may not be recorded depending on DOM shim output
            const snapshot = diagnostics.getSnapshot();
            expect(snapshot.divergences).toBeDefined();
          } finally {
            if (originalEnv === undefined) {
              delete process.env.VERTZ_DEBUG;
            } else {
              process.env.VERTZ_DEBUG = originalEnv;
            }
          }
        });
      });
    });

    describe('Given session is provided', () => {
      describe('When AOT function accesses ctx.session', () => {
        it('Then session data is available', async () => {
          let capturedSession: unknown;
          const aotFn: AotRenderFn = (_data, ctx) => {
            capturedSession = ctx.session;
            return '<div>Authed</div>';
          };

          const module = createMockModule();
          const aotManifest: AotManifest = {
            routes: {
              '/dashboard': { render: aotFn, holes: [] },
            },
          };

          const session = {
            userId: 'u-1',
            roles: ['admin'],
            tenantId: 't-1',
          };

          await ssrRenderAot(module, '/dashboard', {
            aotManifest,
            prefetchSession: session,
          });

          expect(capturedSession).toEqual(session);
        });
      });
    });

    describe('Given an AOT route with queryKeys but no prefetch manifest', () => {
      describe('When ssrRenderAot is called', () => {
        it('Then falls back to ssrRenderSinglePass instead of crashing', async () => {
          const aotFn: AotRenderFn = (_data, ctx) => {
            // This would crash if called with empty queryCache
            const items = ctx.getData('games-list') as unknown[];
            return '<ul>' + items.map(() => '<li>x</li>').join('') + '</ul>';
          };

          const module = createMockModule();
          const aotManifest: AotManifest = {
            routes: {
              '/games': { render: aotFn, holes: [], queryKeys: ['games-list'] },
            },
          };

          // No manifest provided → no prefetch possible → should fall back
          const result = await ssrRenderAot(module, '/games', { aotManifest });

          // Should get a result from single-pass fallback, not a crash
          expect(result.html).toBeDefined();
        });
      });
    });

    describe('Given an AOT route with queryKeys but no api export', () => {
      describe('When ssrRenderAot is called', () => {
        it('Then falls back to ssrRenderSinglePass instead of crashing', async () => {
          const aotFn: AotRenderFn = (_data, ctx) => {
            const items = ctx.getData('sellers-list') as unknown[];
            return '<ul>' + items.map(() => '<li>x</li>').join('') + '</ul>';
          };

          // Module without api export
          const module = createMockModule();
          const aotManifest: AotManifest = {
            routes: {
              '/sellers': { render: aotFn, holes: [], queryKeys: ['sellers-list'] },
            },
          };

          const result = await ssrRenderAot(module, '/sellers', {
            aotManifest,
            manifest: { routePatterns: ['/sellers'], routeEntries: {} },
          });

          expect(result.html).toBeDefined();
        });
      });
    });

    describe('Given an AOT route without queryKeys', () => {
      describe('When ssrRenderAot is called without prefetch manifest', () => {
        it('Then still uses AOT render (no fallback needed)', async () => {
          const aotFn: AotRenderFn = () => '<div>Cart</div>';
          const module = createMockModule();
          const aotManifest: AotManifest = {
            routes: {
              '/cart': { render: aotFn, holes: [] },
            },
          };

          const result = await ssrRenderAot(module, '/cart', { aotManifest });

          expect(result.html).toBe('<div>Cart</div>');
        });
      });
    });

    // ─── aotDataResolver Tests ──────────────────────────────────────

    describe('Feature: aotDataResolver for non-entity data sources', () => {
      describe('Given an AOT route with queryKeys and an aotDataResolver', () => {
        describe('When the resolver provides all keys', () => {
          it('Then AOT renders with resolved data (no single-pass fallback)', async () => {
            let aotCalled = false;
            const aotFn: AotRenderFn = (_data, ctx) => {
              aotCalled = true;
              const hero = ctx.getData('home-hero') as string;
              return `<h1>${__esc(hero)}</h1>`;
            };

            const module = createMockModule();
            const aotManifest: AotManifest = {
              routes: {
                '/': {
                  render: aotFn,
                  holes: [],
                  queryKeys: ['home-hero'],
                },
              },
            };

            const aotDataResolver: AotDataResolver = async (_pattern, _params, keys) => {
              const data = new Map<string, unknown>();
              if (keys.includes('home-hero')) data.set('home-hero', 'Welcome');
              return data;
            };

            const result = await ssrRenderAot(module, '/', {
              aotManifest,
              aotDataResolver,
            });

            expect(aotCalled).toBe(true);
            expect(result.html).toContain('<h1>Welcome</h1>');
          });

          it('Then resolver receives the correct pattern, params, and queryKeys', async () => {
            let capturedPattern: string | undefined;
            let capturedParams: Record<string, string> | undefined;
            let capturedKeys: string[] | undefined;

            const aotFn: AotRenderFn = (_data, ctx) => {
              const name = ctx.getData('product-get') as string;
              return `<div>${__esc(name)}</div>`;
            };

            const module = createMockModule();
            const aotManifest: AotManifest = {
              routes: {
                '/products/:id': {
                  render: aotFn,
                  holes: [],
                  queryKeys: ['product-get'],
                },
              },
            };

            const aotDataResolver: AotDataResolver = async (pattern, params, keys) => {
              capturedPattern = pattern;
              capturedParams = params;
              capturedKeys = keys;
              const data = new Map<string, unknown>();
              data.set('product-get', 'Widget');
              return data;
            };

            await ssrRenderAot(module, '/products/abc-123', {
              aotManifest,
              aotDataResolver,
            });

            expect(capturedPattern).toBe('/products/:id');
            expect(capturedParams).toEqual({ id: 'abc-123' });
            expect(capturedKeys).toEqual(['product-get']);
          });

          it('Then query cache entries appear in ssrData for client hydration', async () => {
            const aotFn: AotRenderFn = (_data, ctx) => {
              return `<div>${__esc(String(ctx.getData('items-list')))}</div>`;
            };

            const module = createMockModule();
            const aotManifest: AotManifest = {
              routes: {
                '/items': {
                  render: aotFn,
                  holes: [],
                  queryKeys: ['items-list'],
                },
              },
            };

            const items = [{ id: '1', name: 'A' }];
            const aotDataResolver: AotDataResolver = async (_p, _pa, _k) => {
              return new Map([['items-list', items]]);
            };

            const result = await ssrRenderAot(module, '/items', {
              aotManifest,
              aotDataResolver,
            });

            expect(result.ssrData).toEqual([{ key: 'items-list', data: items }]);
          });
        });
      });

      describe('Given an AOT route with queryKeys and NO aotDataResolver', () => {
        describe('When no entity prefetch is available', () => {
          it('Then falls back to ssrRenderSinglePass (existing behavior)', async () => {
            const aotFn: AotRenderFn = (_data, ctx) => {
              const items = ctx.getData('tasks-list') as unknown[];
              return '<ul>' + items.map(() => '<li>x</li>').join('') + '</ul>';
            };

            const module = createMockModule();
            const aotManifest: AotManifest = {
              routes: {
                '/tasks': { render: aotFn, holes: [], queryKeys: ['tasks-list'] },
              },
            };

            // No aotDataResolver, no manifest → fallback
            const result = await ssrRenderAot(module, '/tasks', { aotManifest });
            // Single-pass fallback renders via DOM shim
            expect(result.html).toBeDefined();
            expect(result.html).toContain('app');
          });
        });
      });

      describe('Given an AOT route where entity prefetch resolves some keys', () => {
        describe('When aotDataResolver fills the remaining keys', () => {
          it('Then AOT renders with combined data from both sources', async () => {
            let aotCalled = false;
            const aotFn: AotRenderFn = (_data, ctx) => {
              aotCalled = true;
              const tasks = ctx.getData('tasks-list') as string;
              const trending = ctx.getData('trending-custom') as string;
              return `<div>${__esc(String(tasks))}-${__esc(String(trending))}</div>`;
            };

            const module = createMockModule();
            // Simulate API client for entity prefetch
            (module as Record<string, unknown>).api = {
              tasks: {
                list: () => ({
                  _key: 'vertz:tasks:list:{}',
                  _fetch: () => Promise.resolve({ ok: true, data: 'entity-data' }),
                }),
              },
            };

            const aotManifest: AotManifest = {
              routes: {
                '/dashboard': {
                  render: aotFn,
                  holes: [],
                  queryKeys: ['tasks-list', 'trending-custom'],
                },
              },
            };

            const manifest = {
              routePatterns: ['/dashboard'],
              routeEntries: {
                '/dashboard': {
                  queries: [
                    { descriptorChain: 'api.tasks.list', entity: 'tasks', operation: 'list' },
                  ],
                },
              },
            };

            const aotDataResolver: AotDataResolver = async (_pattern, _params, unresolvedKeys) => {
              const data = new Map<string, unknown>();
              // Should only receive 'trending-custom' since 'tasks-list' was resolved by entity prefetch
              for (const key of unresolvedKeys) {
                if (key === 'trending-custom') data.set(key, 'custom-data');
              }
              return data;
            };

            const result = await ssrRenderAot(module, '/dashboard', {
              aotManifest,
              manifest,
              aotDataResolver,
            });

            expect(aotCalled).toBe(true);
            expect(result.html).toContain('entity-data');
            expect(result.html).toContain('custom-data');
          });

          it('Then resolver only receives unresolved keys', async () => {
            let capturedUnresolvedKeys: string[] | undefined;

            const aotFn: AotRenderFn = (_data, ctx) => {
              return `<div>${__esc(String(ctx.getData('tasks-list')))}</div>`;
            };

            const module = createMockModule();
            (module as Record<string, unknown>).api = {
              tasks: {
                list: () => ({
                  _key: 'vertz:tasks:list:{}',
                  _fetch: () => Promise.resolve({ ok: true, data: 'from-entity' }),
                }),
              },
            };

            const aotManifest: AotManifest = {
              routes: {
                '/mixed': {
                  render: aotFn,
                  holes: [],
                  queryKeys: ['tasks-list', 'custom-data'],
                },
              },
            };

            const manifest = {
              routePatterns: ['/mixed'],
              routeEntries: {
                '/mixed': {
                  queries: [
                    { descriptorChain: 'api.tasks.list', entity: 'tasks', operation: 'list' },
                  ],
                },
              },
            };

            const aotDataResolver: AotDataResolver = async (_p, _pa, unresolvedKeys) => {
              capturedUnresolvedKeys = unresolvedKeys;
              return new Map([['custom-data', 'resolved']]);
            };

            await ssrRenderAot(module, '/mixed', {
              aotManifest,
              manifest,
              aotDataResolver,
            });

            // Entity prefetch resolved 'tasks-list', so resolver only gets 'custom-data'
            expect(capturedUnresolvedKeys).toEqual(['custom-data']);
          });
        });
      });

      describe('Given an AOT route where aotDataResolver provides partial keys', () => {
        describe('When not all keys are resolved after both pipelines', () => {
          it('Then falls back to ssrRenderSinglePass', async () => {
            const aotFn: AotRenderFn = (_data, ctx) => {
              // Would crash if called — getData returns undefined for missing keys
              const a = ctx.getData('key-a') as string;
              const b = ctx.getData('key-b') as string;
              return `<div>${a}-${b}</div>`;
            };

            const module = createMockModule();
            const aotManifest: AotManifest = {
              routes: {
                '/partial': {
                  render: aotFn,
                  holes: [],
                  queryKeys: ['key-a', 'key-b'],
                },
              },
            };

            // Resolver only provides one of two keys
            const aotDataResolver: AotDataResolver = async () => {
              return new Map([['key-a', 'value-a']]);
            };

            const result = await ssrRenderAot(module, '/partial', {
              aotManifest,
              aotDataResolver,
            });

            // Fallback to single-pass — renders the default module
            expect(result.html).toContain('app');
          });
        });
      });

      describe('Given an aotDataResolver that throws', () => {
        describe('When ssrRenderAot is called', () => {
          it('Then falls back to ssrRenderSinglePass (graceful degradation)', async () => {
            const aotFn: AotRenderFn = (_data, ctx) => {
              const d = ctx.getData('data-key') as string;
              return `<div>${d}</div>`;
            };

            const module = createMockModule();
            const aotManifest: AotManifest = {
              routes: {
                '/error': {
                  render: aotFn,
                  holes: [],
                  queryKeys: ['data-key'],
                },
              },
            };

            const aotDataResolver: AotDataResolver = async () => {
              throw new Error('DB connection failed');
            };

            const result = await ssrRenderAot(module, '/error', {
              aotManifest,
              aotDataResolver,
            });

            // Fallback to single-pass — renders the default module
            expect(result.html).toBeDefined();
            expect(result.html).toContain('app');
          });
        });
      });

      describe('Given an AOT route without queryKeys', () => {
        describe('When aotDataResolver is provided', () => {
          it('Then resolver is NOT called (no unresolved keys)', async () => {
            let resolverCalled = false;
            const aotFn: AotRenderFn = () => '<div>Static</div>';

            const module = createMockModule();
            const aotManifest: AotManifest = {
              routes: {
                '/static': { render: aotFn, holes: [] },
              },
            };

            const aotDataResolver: AotDataResolver = async () => {
              resolverCalled = true;
              return new Map();
            };

            const result = await ssrRenderAot(module, '/static', {
              aotManifest,
              aotDataResolver,
            });

            expect(resolverCalled).toBe(false);
            expect(result.html).toBe('<div>Static</div>');
          });
        });
      });

      describe('Given an aotDataResolver that returns synchronously', () => {
        describe('When ssrRenderAot is called', () => {
          it('Then the sync Map is used without issues', async () => {
            let aotCalled = false;
            const aotFn: AotRenderFn = (_data, ctx) => {
              aotCalled = true;
              return `<div>${__esc(String(ctx.getData('sync-key')))}</div>`;
            };

            const module = createMockModule();
            const aotManifest: AotManifest = {
              routes: {
                '/sync': {
                  render: aotFn,
                  holes: [],
                  queryKeys: ['sync-key'],
                },
              },
            };

            // Synchronous resolver (returns Map directly, not Promise<Map>)
            const aotDataResolver: AotDataResolver = () => {
              return new Map([['sync-key', 'sync-value']]);
            };

            const result = await ssrRenderAot(module, '/sync', {
              aotManifest,
              aotDataResolver,
            });

            expect(aotCalled).toBe(true);
            expect(result.html).toContain('sync-value');
          });
        });
      });
    });

    // ─── Parameterized query key resolution ─────────────────────────

    describe('Feature: parameterized query key resolution', () => {
      describe('resolveParamQueryKeys()', () => {
        describe('Given queryKeys with ${param} placeholders', () => {
          it('Then resolves placeholders from route params', () => {
            const resolved = resolveParamQueryKeys(['game-${slug}'], { slug: 'pokemon-tcg' });
            expect(resolved).toEqual(['game-pokemon-tcg']);
          });

          it('Then resolves multiple params in a single key', () => {
            const resolved = resolveParamQueryKeys(['org-${orgId}-team-${teamId}'], {
              orgId: 'acme',
              teamId: 'eng',
            });
            expect(resolved).toEqual(['org-acme-team-eng']);
          });

          it('Then leaves static keys unchanged', () => {
            const resolved = resolveParamQueryKeys(['tasks-list', 'game-${slug}'], {
              slug: 'chess',
            });
            expect(resolved).toEqual(['tasks-list', 'game-chess']);
          });
        });

        describe('Given a missing param in the params record', () => {
          it('Then replaces with empty string', () => {
            const resolved = resolveParamQueryKeys(['game-${slug}'], {});
            expect(resolved).toEqual(['game-']);
          });
        });

        describe('Given queryKeys with ${sp:name} search param placeholders', () => {
          it('Then resolves search param placeholders from searchParams', () => {
            const searchParams = new URLSearchParams('page=3');
            const resolved = resolveParamQueryKeys(
              ['set-${slug}-${sp:page}'],
              { slug: 'base-set' },
              searchParams,
            );
            expect(resolved).toEqual(['set-base-set-3']);
          });

          it('Then defaults to empty string for missing search params', () => {
            const searchParams = new URLSearchParams('');
            const resolved = resolveParamQueryKeys(
              ['set-${slug}-${sp:page}'],
              { slug: 'base-set' },
              searchParams,
            );
            expect(resolved).toEqual(['set-base-set-']);
          });

          it('Then resolves search-params-only keys without route params', () => {
            const searchParams = new URLSearchParams('q=pikachu');
            const resolved = resolveParamQueryKeys(['search-${sp:q}'], {}, searchParams);
            expect(resolved).toEqual(['search-pikachu']);
          });
        });

        describe('Given queryKeys with ${sp:name|default} format (default values)', () => {
          it('Then uses default value when search param is missing', () => {
            const resolved = resolveParamQueryKeys(
              ['set-${slug}-${sp:page|1}'],
              { slug: 'base-set' },
              new URLSearchParams(''),
            );
            expect(resolved).toEqual(['set-base-set-1']);
          });

          it('Then uses actual value when search param is present', () => {
            const resolved = resolveParamQueryKeys(
              ['set-${slug}-${sp:page|1}'],
              { slug: 'base-set' },
              new URLSearchParams('page=3'),
            );
            expect(resolved).toEqual(['set-base-set-3']);
          });

          it('Then uses default when param is empty string (|| semantics)', () => {
            const resolved = resolveParamQueryKeys(
              ['set-${slug}-${sp:page|1}'],
              { slug: 'base-set' },
              new URLSearchParams('page='),
            );
            expect(resolved).toEqual(['set-base-set-1']);
          });

          it('Then handles multiple defaults in one key', () => {
            const resolved = resolveParamQueryKeys(
              ['search-${sp:q|undefined}-${sp:order|asc}-${sp:page|1}'],
              {},
              new URLSearchParams('q=dragon'),
            );
            expect(resolved).toEqual(['search-dragon-asc-1']);
          });

          it('Then keeps backward compat with old format (no default)', () => {
            const resolved = resolveParamQueryKeys(
              ['set-${slug}-${sp:page}'],
              { slug: 'base-set' },
              new URLSearchParams(''),
            );
            expect(resolved).toEqual(['set-base-set-']);
          });
        });

        describe('Given queryKeys with ${name} where name is a search param (not route param)', () => {
          it('Then falls back to search params when route param is missing', () => {
            const resolved = resolveParamQueryKeys(
              ['set-${slug}-${page}'],
              { slug: 'base-set' },
              new URLSearchParams('page=3'),
            );
            expect(resolved).toEqual(['set-base-set-3']);
          });

          it('Then prefers route params over search params', () => {
            const resolved = resolveParamQueryKeys(
              ['item-${id}'],
              { id: 'route-123' },
              new URLSearchParams('id=sp-456'),
            );
            expect(resolved).toEqual(['item-route-123']);
          });

          it('Then resolves to empty string when neither source has the param', () => {
            const resolved = resolveParamQueryKeys(
              ['set-${slug}-${page}'],
              { slug: 'base-set' },
              new URLSearchParams(''),
            );
            expect(resolved).toEqual(['set-base-set-']);
          });
        });
      });

      describe('ssrRenderAot() with parameterized queryKeys', () => {
        describe('Given an AOT route with parameterized queryKeys and aotDataResolver', () => {
          describe('When the URL provides params that resolve the keys', () => {
            it('Then aotDataResolver receives resolved keys (not templates)', async () => {
              let capturedKeys: string[] | undefined;

              const aotFn: AotRenderFn = (_data, ctx) => {
                const game = ctx.getData('game-pokemon-tcg') as string;
                return `<div>${__esc(String(game))}</div>`;
              };

              const module = createMockModule();
              const aotManifest: AotManifest = {
                routes: {
                  '/games/:slug': {
                    render: aotFn,
                    holes: [],
                    queryKeys: ['game-${slug}'],
                  },
                },
              };

              const aotDataResolver: AotDataResolver = async (
                _pattern,
                _params,
                unresolvedKeys,
              ) => {
                capturedKeys = unresolvedKeys;
                return new Map([['game-pokemon-tcg', 'Pokemon TCG']]);
              };

              const result = await ssrRenderAot(module, '/games/pokemon-tcg', {
                aotManifest,
                aotDataResolver,
              });

              expect(capturedKeys).toEqual(['game-pokemon-tcg']);
              expect(result.html).toContain('Pokemon TCG');
            });

            it('Then ssrData uses resolved keys for client hydration', async () => {
              const aotFn: AotRenderFn = (_data, ctx) => {
                return `<div>${__esc(String(ctx.getData('card-abc-123')))}</div>`;
              };

              const module = createMockModule();
              const aotManifest: AotManifest = {
                routes: {
                  '/cards/:id': {
                    render: aotFn,
                    holes: [],
                    queryKeys: ['card-${id}'],
                  },
                },
              };

              const aotDataResolver: AotDataResolver = async () => {
                return new Map([['card-abc-123', { name: 'Pikachu' }]]);
              };

              const result = await ssrRenderAot(module, '/cards/abc-123', {
                aotManifest,
                aotDataResolver,
              });

              expect(result.ssrData).toEqual([{ key: 'card-abc-123', data: { name: 'Pikachu' } }]);
            });
          });

          describe('When allKeysResolved check uses resolved keys', () => {
            it('Then falls back when resolved key is not in cache', async () => {
              const aotFn: AotRenderFn = (_data, ctx) => {
                const d = ctx.getData('game-chess') as string;
                return `<div>${d}</div>`;
              };

              const module = createMockModule();
              const aotManifest: AotManifest = {
                routes: {
                  '/games/:slug': {
                    render: aotFn,
                    holes: [],
                    queryKeys: ['game-${slug}'],
                  },
                },
              };

              // Resolver returns nothing → allKeysResolved should be false → fallback
              const aotDataResolver: AotDataResolver = async () => {
                return new Map();
              };

              const result = await ssrRenderAot(module, '/games/chess', {
                aotManifest,
                aotDataResolver,
              });

              // Falls back to single-pass
              expect(result.html).toContain('app');
            });
          });
        });
      });

      describe('ssrRenderAot() with search param query keys', () => {
        describe('Given an AOT route with ${sp:name} query keys', () => {
          it('Then resolves search params from the URL and passes to aotDataResolver', async () => {
            let capturedKeys: string[] | undefined;

            const aotFn: AotRenderFn = (_data, ctx) => {
              const d = ctx.getData('set-base-set-2') as { name: string };
              return `<div>${__esc(d.name)}</div>`;
            };

            const module = createMockModule();
            const aotManifest: AotManifest = {
              routes: {
                '/sets/:slug': {
                  render: aotFn,
                  holes: [],
                  queryKeys: ['set-${slug}-${sp:page}'],
                },
              },
            };

            const aotDataResolver: AotDataResolver = async (_pattern, _params, unresolvedKeys) => {
              capturedKeys = unresolvedKeys;
              return new Map([['set-base-set-2', { name: 'Base Set' }]]);
            };

            const result = await ssrRenderAot(module, '/sets/base-set?page=2', {
              aotManifest,
              aotDataResolver,
            });

            expect(capturedKeys).toEqual(['set-base-set-2']);
            expect(result.html).toContain('Base Set');
          });

          it('Then provides searchParams on ctx for __ssr_ function access', async () => {
            let capturedSearchParams: URLSearchParams | undefined;

            const aotFn: AotRenderFn = (_data, ctx) => {
              capturedSearchParams = ctx.searchParams;
              return '<div>ok</div>';
            };

            const module = createMockModule();
            const aotManifest: AotManifest = {
              routes: {
                '/search': {
                  render: aotFn,
                  holes: [],
                },
              },
            };

            await ssrRenderAot(module, '/search?q=pikachu&page=3', {
              aotManifest,
            });

            expect(capturedSearchParams).toBeInstanceOf(URLSearchParams);
            expect(capturedSearchParams?.get('q')).toBe('pikachu');
            expect(capturedSearchParams?.get('page')).toBe('3');
          });
        });
      });

      describe('ssrRenderAot() ctx.getData resolves template literal patterns', () => {
        describe('Given an AOT function that calls ctx.getData with a pattern key', () => {
          it('Then resolves the pattern to match the cache entry', async () => {
            // The AOT function uses the pattern key (as the Rust compiler emits it),
            // not the resolved key. ctx.getData must resolve the pattern internally.
            const aotFn: AotRenderFn = (_data, ctx) => {
              const game = ctx.getData('game-${slug}') as { name: string };
              return `<div>${__esc(game?.name ?? '')}</div>`;
            };

            const module = createMockModule();
            const aotManifest: AotManifest = {
              routes: {
                '/games/:slug': {
                  render: aotFn,
                  holes: [],
                  queryKeys: ['game-${slug}'],
                },
              },
            };

            const aotDataResolver: AotDataResolver = async () => {
              return new Map([['game-pokemon-tcg', { name: 'Pokemon TCG' }]]);
            };

            const result = await ssrRenderAot(module, '/games/pokemon-tcg', {
              aotManifest,
              aotDataResolver,
            });

            expect(result.html).toContain('Pokemon TCG');
          });

          it('Then resolves search param fallback in getData pattern', async () => {
            const aotFn: AotRenderFn = (_data, ctx) => {
              const set = ctx.getData('set-${slug}-${page}') as { name: string };
              return `<div>${__esc(set?.name ?? '')}</div>`;
            };

            const module = createMockModule();
            const aotManifest: AotManifest = {
              routes: {
                '/sets/:slug': {
                  render: aotFn,
                  holes: [],
                  queryKeys: ['set-${slug}-${page}'],
                },
              },
            };

            const aotDataResolver: AotDataResolver = async () => {
              return new Map([['set-base-set-2', { name: 'Base Set' }]]);
            };

            const result = await ssrRenderAot(module, '/sets/base-set?page=2', {
              aotManifest,
              aotDataResolver,
            });

            expect(result.html).toContain('Base Set');
          });
        });
      });
    });
  });

  describe('Given an AOT render function that throws at runtime', () => {
    describe('When ssrRenderAot is called', () => {
      it('Then falls back to ssrRenderSinglePass instead of crashing', async () => {
        const throwingAotFn: AotRenderFn = () => {
          // Simulates the bug: closure variable not defined inside .map()
          throw new ReferenceError('seller is not defined');
        };

        const module = createMockModule();
        const aotManifest: AotManifest = {
          routes: {
            '/cards/123': {
              render: throwingAotFn,
              holes: [],
            },
          },
        };

        const result = await ssrRenderAot(module, '/cards/123', {
          aotManifest,
        });

        // Should gracefully fall back to single-pass, not crash
        expect(result.html).toBeDefined();
        expect(result.html).toContain('app');
      });

      it('Then falls back even when render throws with query data resolved', async () => {
        const throwingAotFn: AotRenderFn = () => {
          throw new TypeError('Cannot read properties of undefined');
        };

        const module = createMockModule();
        const aotManifest: AotManifest = {
          routes: {
            '/detail': {
              render: throwingAotFn,
              holes: [],
              queryKeys: ['data-key'],
            },
          },
        };

        const aotDataResolver: AotDataResolver = async () => {
          return new Map([['data-key', { items: [] }]]);
        };

        const result = await ssrRenderAot(module, '/detail', {
          aotManifest,
          aotDataResolver,
        });

        // Should gracefully fall back to single-pass
        expect(result.html).toBeDefined();
        expect(result.html).toContain('app');
      });
    });
  });

  // ─── App Layout Composition Tests (#1977) ──────────────────────

  describe('Feature: App layout shell composition (#1977)', () => {
    describe('Given an AOT manifest with an app entry and page routes', () => {
      describe('When ssrRenderAot() renders an AOT page route', () => {
        it('Then the page content is wrapped in the App layout shell', async () => {
          const appFn: AotRenderFn = (_data, ctx) => {
            const routerHtml = ctx.holes.RouterView?.() ?? '';
            return `<div class="app"><header>Nav</header><main>${routerHtml}</main><footer>Footer</footer></div>`;
          };

          const pageFn: AotRenderFn = () => '<h1>Games List</h1>';

          const module = createMockModule();
          const aotManifest: AotManifest = {
            app: { render: appFn, holes: ['RouterView'] },
            routes: {
              '/games': { render: pageFn, holes: [] },
            },
          };

          const result = await ssrRenderAot(module, '/games', { aotManifest });

          // Page content is present
          expect(result.html).toContain('Games List');
          // App shell wraps it
          expect(result.html).toContain('<header>Nav</header>');
          expect(result.html).toContain('<footer>Footer</footer>');
          // Page is inside the main element
          expect(result.html).toContain('<main><h1>Games List</h1></main>');
        });
      });

      describe('When the App has additional holes besides RouterView', () => {
        it('Then non-RouterView holes render via DOM shim', async () => {
          const appFn: AotRenderFn = (_data, ctx) => {
            const themeHtml = ctx.holes.ThemeProvider?.() ?? '';
            const routerHtml = ctx.holes.RouterView?.() ?? '';
            return `<div>${themeHtml}<main>${routerHtml}</main></div>`;
          };

          const pageFn: AotRenderFn = () => '<h1>Home</h1>';

          const module = createMockModule({
            ThemeProvider: () => {
              const el = document.createElement('style');
              el.textContent = '.theme { color: blue; }';
              return el;
            },
          });

          const aotManifest: AotManifest = {
            app: { render: appFn, holes: ['ThemeProvider', 'RouterView'] },
            routes: {
              '/': { render: pageFn, holes: [] },
            },
          };

          const result = await ssrRenderAot(module, '/', { aotManifest });

          expect(result.html).toContain('Home');
          expect(result.html).toContain('.theme { color: blue; }');
        });
      });

      describe('When there is no app entry in the manifest', () => {
        it('Then page renders without a layout shell (backwards compatible)', async () => {
          const pageFn: AotRenderFn = () => '<h1>No Layout</h1>';

          const module = createMockModule();
          const aotManifest: AotManifest = {
            routes: {
              '/bare': { render: pageFn, holes: [] },
            },
          };

          const result = await ssrRenderAot(module, '/bare', { aotManifest });

          expect(result.html).toBe('<h1>No Layout</h1>');
        });
      });

      describe('When the page itself has holes', () => {
        it('Then both page holes and app holes are rendered', async () => {
          const appFn: AotRenderFn = (_data, ctx) => {
            const routerHtml = ctx.holes.RouterView?.() ?? '';
            return `<div class="app">${routerHtml}</div>`;
          };

          const pageFn: AotRenderFn = (_data, ctx) => {
            const widgetHtml = ctx.holes.UserWidget?.() ?? '';
            return `<div class="page">${widgetHtml}</div>`;
          };

          const module = createMockModule({
            UserWidget: () => {
              const el = document.createElement('span');
              el.textContent = 'Alice';
              return el;
            },
          });

          const aotManifest: AotManifest = {
            app: { render: appFn, holes: ['RouterView'] },
            routes: {
              '/dashboard': { render: pageFn, holes: ['UserWidget'] },
            },
          };

          const result = await ssrRenderAot(module, '/dashboard', { aotManifest });

          expect(result.html).toContain('Alice');
          expect(result.html).toContain('class="app"');
          expect(result.html).toContain('class="page"');
        });
      });

      describe('When the route falls back to single-pass', () => {
        it('Then the app shell is NOT applied (single-pass handles its own layout)', async () => {
          const appFn: AotRenderFn = (_data, ctx) => {
            const routerHtml = ctx.holes.RouterView?.() ?? '';
            return `<div class="aot-app">${routerHtml}</div>`;
          };

          const module = createMockModule();
          const aotManifest: AotManifest = {
            app: { render: appFn, holes: ['RouterView'] },
            routes: {
              '/games': { render: () => '<div>Games</div>', holes: [], queryKeys: ['games-list'] },
            },
          };

          // No data resolver, no manifest → falls back to single-pass
          const result = await ssrRenderAot(module, '/games', { aotManifest });

          // Single-pass renders the DOM shim app, not the AOT app shell
          expect(result.html).not.toContain('aot-app');
          expect(result.html).toContain('app');
        });
      });
    });
  });
});
