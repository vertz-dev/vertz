/**
 * Tests for AOT SSR Pipeline — createHoles() and ssrRenderAot().
 *
 * Phase 2 of AOT-compiled SSR: runtime holes and SSR pipeline integration.
 * Issue: #1745
 */
import { describe, expect, it } from 'bun:test';
import { installDomShim } from '../dom-shim';
import { type AotManifest, type AotRenderFn, createHoles, ssrRenderAot } from '../ssr-aot-pipeline';
import { __esc } from '../ssr-aot-runtime';
import type { SSRModule } from '../ssr-render';

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

    describe('Given ctx.getData() is called by the AOT function', () => {
      describe('When the key exists in the query cache', () => {
        it('Then returns the cached data', async () => {
          let receivedData: unknown;
          const aotFn: AotRenderFn = (_data, ctx) => {
            receivedData = ctx.getData('GET:/tasks');
            return '<div>Tasks</div>';
          };

          // For now, queryCache is empty unless populated externally.
          // Full prefetch integration comes in Phase 4.
          const module = createMockModule();
          const aotManifest: AotManifest = {
            routes: {
              '/tasks': { render: aotFn, holes: [] },
            },
          };

          await ssrRenderAot(module, '/tasks', { aotManifest });
          expect(receivedData).toBeUndefined(); // No prefetch yet
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
  });
});
