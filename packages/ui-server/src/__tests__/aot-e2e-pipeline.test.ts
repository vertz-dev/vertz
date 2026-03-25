/**
 * E2E Integration Tests for AOT SSR Pipeline
 *
 * Validates the full wire-up from compiler output → build manifest →
 * barrel generation → manifest loading → AOT render with data prefetch.
 *
 * Issue: #1843
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installDomShim } from '../dom-shim';
import type { SSRModule } from '../ssr-render';

installDomShim();

// ─── Test Fixtures ──────────────────────────────────────────────

let tmpDir: string;
let srcDir: string;
let serverDir: string;

beforeEach(() => {
  tmpDir = join(import.meta.dir, `.tmp-aot-e2e-${Date.now()}`);
  srcDir = join(tmpDir, 'src');
  serverDir = join(tmpDir, 'server');
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(serverDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/** Create a minimal SSRModule for testing. */
function createMockModule(
  components: Record<string, () => unknown> = {},
): SSRModule & Record<string, unknown> {
  return {
    default: () => {
      const el = document.createElement('div');
      el.textContent = 'fallback app';
      return el;
    },
    ...components,
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Feature: E2E AOT Pipeline', () => {
  describe('Given a compiled AOT manifest and routes module', () => {
    describe('When loadAotManifest → ssrRenderAot → full render cycle', () => {
      it('Then AOT routes render via string concatenation', async () => {
        // 1. Write AOT manifest and routes module to server dir
        writeFileSync(
          join(serverDir, 'aot-manifest.json'),
          JSON.stringify({
            routes: {
              '/': { renderFn: '__ssr_HomePage', holes: [], queryKeys: [] },
            },
          }),
        );
        writeFileSync(
          join(serverDir, 'aot-routes.js'),
          `export function __ssr_HomePage(data, ctx) { return '<div class="home"><h1>Welcome</h1></div>'; }`,
        );

        // 2. Load manifest
        const { loadAotManifest } = await import('../aot-manifest-loader');
        const aotManifest = await loadAotManifest(serverDir);
        expect(aotManifest).not.toBeNull();

        // 3. Render via AOT pipeline
        const { ssrRenderAot } = await import('../ssr-aot-pipeline');
        const module = createMockModule();
        const result = await ssrRenderAot(module, '/', { aotManifest: aotManifest! });

        // 4. Verify AOT rendered the page
        expect(result.html).toBe('<div class="home"><h1>Welcome</h1></div>');
        expect(result.matchedRoutePatterns).toEqual(['/']);
      });

      it('Then fallback routes render via ssrRenderSinglePass', async () => {
        writeFileSync(
          join(serverDir, 'aot-manifest.json'),
          JSON.stringify({
            routes: {
              '/projects/list': { renderFn: '__ssr_ProjectsPage', holes: [], queryKeys: [] },
            },
          }),
        );
        writeFileSync(
          join(serverDir, 'aot-routes.js'),
          `export function __ssr_ProjectsPage() { return '<div>Projects</div>'; }`,
        );

        const { loadAotManifest } = await import('../aot-manifest-loader');
        const aotManifest = await loadAotManifest(serverDir);
        expect(aotManifest).not.toBeNull();

        // Request a route NOT in the AOT manifest → fallback
        // Use /settings which won't match /projects/list (prefix matching only matches shorter patterns)
        const { ssrRenderAot } = await import('../ssr-aot-pipeline');
        const module = createMockModule();
        const result = await ssrRenderAot(module, '/settings', { aotManifest: aotManifest! });

        // Fallback renders via DOM shim — module.default() creates <div>fallback app</div>
        expect(result.html).toContain('fallback app');
      });
    });
  });

  describe('Given AOT route with holes', () => {
    describe('When the route is rendered via AOT pipeline', () => {
      it('Then AOT shell is string concatenation and holes render via DOM shim', async () => {
        writeFileSync(
          join(serverDir, 'aot-manifest.json'),
          JSON.stringify({
            routes: {
              '/dashboard': {
                renderFn: '__ssr_DashboardPage',
                holes: ['UserWidget'],
                queryKeys: [],
              },
            },
          }),
        );
        writeFileSync(
          join(serverDir, 'aot-routes.js'),
          `export function __ssr_DashboardPage(data, ctx) {
  const userHtml = ctx.holes.UserWidget ? ctx.holes.UserWidget() : '';
  return '<div class="dashboard"><main>Dashboard</main><aside>' + userHtml + '</aside></div>';
}`,
        );

        const { loadAotManifest } = await import('../aot-manifest-loader');
        const aotManifest = await loadAotManifest(serverDir);
        expect(aotManifest).not.toBeNull();

        // Module exports the hole component
        const module = createMockModule({
          UserWidget: () => {
            const el = document.createElement('div');
            el.setAttribute('class', 'user-widget');
            el.textContent = 'Alice (Admin)';
            return el;
          },
        });

        const { ssrRenderAot } = await import('../ssr-aot-pipeline');
        const result = await ssrRenderAot(module, '/dashboard', { aotManifest: aotManifest! });

        // AOT string content
        expect(result.html).toContain('Dashboard');
        // DOM-shim-rendered hole content
        expect(result.html).toContain('Alice (Admin)');
        expect(result.html).toContain('user-widget');
      });
    });
  });

  describe('Given AOT route with dynamic params', () => {
    describe('When the route is rendered', () => {
      it('Then params are available in ctx.params', async () => {
        writeFileSync(
          join(serverDir, 'aot-manifest.json'),
          JSON.stringify({
            routes: {
              '/projects/:id': {
                renderFn: '__ssr_ProjectPage',
                holes: [],
                queryKeys: [],
              },
            },
          }),
        );
        writeFileSync(
          join(serverDir, 'aot-routes.js'),
          `export function __ssr_ProjectPage(data, ctx) {
  return '<div>Project: ' + (ctx.params.id || 'unknown') + '</div>';
}`,
        );

        const { loadAotManifest } = await import('../aot-manifest-loader');
        const aotManifest = await loadAotManifest(serverDir);

        const { ssrRenderAot } = await import('../ssr-aot-pipeline');
        const module = createMockModule();
        const result = await ssrRenderAot(module, '/projects/proj-42', {
          aotManifest: aotManifest!,
        });

        expect(result.html).toContain('Project: proj-42');
      });
    });
  });

  describe('Given AOT route with queryKeys and a prefetch manifest', () => {
    describe('When the route is rendered with an API client', () => {
      it('Then data is prefetched and available via ctx.getData()', async () => {
        // Construct the AOT manifest directly (no file loading needed)
        const { ssrRenderAot } = await import('../ssr-aot-pipeline');

        const aotManifest = {
          routes: {
            '/tasks': {
              render: (
                _data: Record<string, unknown>,
                ctx: { getData: (key: string) => unknown },
              ) => {
                const tasks = ctx.getData('tasks-list') as Array<{ title: string }> | undefined;
                if (!tasks) return '<div>Loading...</div>';
                return '<ul>' + tasks.map((t) => '<li>' + t.title + '</li>').join('') + '</ul>';
              },
              holes: [],
              queryKeys: ['tasks-list'],
            },
          },
        };

        const module = createMockModule();
        // Attach mock API client
        (module as Record<string, unknown>).api = {
          tasks: {
            list: () => ({
              _key: 'vertz:tasks:list:{}',
              _fetch: () =>
                Promise.resolve({
                  ok: true,
                  data: [
                    { id: '1', title: 'Buy groceries' },
                    { id: '2', title: 'Write tests' },
                  ],
                }),
            }),
          },
        };

        const manifest = {
          routePatterns: ['/tasks'],
          routeEntries: {
            '/tasks': {
              queries: [{ descriptorChain: 'api.tasks.list', entity: 'tasks', operation: 'list' }],
            },
          },
        };

        const result = await ssrRenderAot(module, '/tasks', {
          aotManifest,
          manifest,
        });

        expect(result.html).toContain('Buy groceries');
        expect(result.html).toContain('Write tests');
        // ssrData should include the prefetched data
        expect(result.ssrData).toHaveLength(1);
        expect(result.ssrData[0].key).toBe('tasks-list');
        expect(result.ssrData[0].data).toEqual([
          { id: '1', title: 'Buy groceries' },
          { id: '2', title: 'Write tests' },
        ]);
      });
    });
  });

  describe('Given the build manifest pipeline', () => {
    describe('When compiling source → building route map → generating barrel', () => {
      it('Then generateAotBuildManifest → buildAotRouteMap → generateAotBarrel produces valid output', async () => {
        // 1. Write source component
        writeFileSync(
          join(srcDir, 'home.tsx'),
          `export function HomePage() { return <div><h1>Home Page</h1></div>; }`,
        );

        // 2. Generate build manifest
        const { generateAotBuildManifest, buildAotRouteMap, generateAotBarrel } =
          await import('../aot-manifest-build');
        const buildManifest = generateAotBuildManifest(srcDir);

        expect(buildManifest.components.HomePage).toBeDefined();
        expect(buildManifest.components.HomePage.tier).toBe('static');

        // Verify compiled code was preserved
        const filePath = join(srcDir, 'home.tsx');
        expect(buildManifest.compiledFiles[filePath]).toBeDefined();
        expect(buildManifest.compiledFiles[filePath].code).toContain('__ssr_HomePage');

        // 3. Build route map (simulate route extraction)
        const routes = [{ pattern: '/', componentName: 'HomePage' }];
        const routeMap = buildAotRouteMap(buildManifest.components, routes);

        expect(routeMap['/']).toBeDefined();
        expect(routeMap['/']?.renderFn).toBe('__ssr_HomePage');

        // 4. Generate barrel
        const barrel = generateAotBarrel(buildManifest.compiledFiles, routeMap);

        expect(barrel.barrelSource).toContain('__ssr_HomePage');
        expect(Object.keys(barrel.files).length).toBeGreaterThan(0);

        // 5. Verify the barrel + files contain valid, self-consistent code
        // The barrel re-exports from compiled files
        for (const [filename, code] of Object.entries(barrel.files)) {
          expect(filename).toMatch(/\.tsx$/);
          expect(code).toContain('export function __ssr_');
        }

        // 6. Simulate what loadAotManifest does: wire render functions to routes
        // Write the manifest + a hand-crafted routes module to the server dir
        writeFileSync(join(serverDir, 'aot-manifest.json'), JSON.stringify({ routes: routeMap }));

        // Extract just the __ssr_ function (without the original JSX component)
        // and strip TS type annotations for .js execution
        const ssrFnCode = buildManifest.compiledFiles[filePath].code
          .split('\n')
          .filter((line) => !line.includes('return <'))
          .join('\n')
          .replace(/\)\s*:\s*string\s*\{/, ') {');
        writeFileSync(join(serverDir, 'aot-routes.js'), ssrFnCode);

        const { loadAotManifest } = await import('../aot-manifest-loader');
        const aotManifest = await loadAotManifest(serverDir);

        expect(aotManifest).not.toBeNull();
        expect(typeof aotManifest?.routes['/']?.render).toBe('function');

        // 7. Render via AOT pipeline
        const { ssrRenderAot } = await import('../ssr-aot-pipeline');
        const module = createMockModule();
        const result = await ssrRenderAot(module, '/', { aotManifest: aotManifest! });

        expect(result.html).toContain('Home Page');
        expect(result.matchedRoutePatterns).toEqual(['/']);
      });
    });
  });

  describe('Given graceful degradation', () => {
    describe('When AOT manifest is missing', () => {
      it('Then loadAotManifest returns null and handler uses single-pass', async () => {
        const { loadAotManifest } = await import('../aot-manifest-loader');
        const manifest = await loadAotManifest(serverDir);
        expect(manifest).toBeNull();
      });
    });

    describe('When createSSRHandler receives an AOT manifest', () => {
      it('Then handler renders AOT routes and falls back for non-AOT routes', async () => {
        // Use a specific multi-segment route so the prefix matcher
        // doesn't accidentally match other URLs
        writeFileSync(
          join(serverDir, 'aot-manifest.json'),
          JSON.stringify({
            routes: {
              '/projects/list': {
                renderFn: '__ssr_ProjectsListPage',
                holes: [],
                queryKeys: [],
              },
            },
          }),
        );
        writeFileSync(
          join(serverDir, 'aot-routes.js'),
          `export function __ssr_ProjectsListPage() { return '<div>AOT Projects</div>'; }`,
        );

        const { loadAotManifest } = await import('../aot-manifest-loader');
        const aotManifest = await loadAotManifest(serverDir);
        expect(aotManifest).not.toBeNull();

        const { createSSRHandler } = await import('../ssr-handler');
        const module = createMockModule();
        const template = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><div id="app"><!--ssr-outlet--></div></body>
</html>`;

        const handler = createSSRHandler({
          module,
          template,
          aotManifest: aotManifest ?? undefined,
        });

        // AOT route
        const aotResponse = await handler(new Request('http://localhost/projects/list'));
        const aotHtml = await aotResponse.text();
        expect(aotHtml).toContain('AOT Projects');

        // Non-AOT route → fallback via ssrRenderSinglePass
        const fallbackResponse = await handler(new Request('http://localhost/settings'));
        const fallbackHtml = await fallbackResponse.text();
        expect(fallbackHtml).toContain('fallback app');
      });
    });
  });
});
