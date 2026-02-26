/**
 * Unified Bun dev server for the Task Manager example.
 *
 * Modes:
 *   bun run dev        → HMR mode (Bun HTML import, CSS sidecar + Fast Refresh)
 *   bun run dev:ssr    → SSR mode (Bun.build() + ssrRenderToString, bun --watch)
 *
 * HMR mode uses Bun's native HTML import to serve the SPA with module-level
 * HMR. The @vertz/ui-server/bun-plugin handles compiler transforms, CSS extraction to
 * sidecar files, and Fast Refresh component wrappers.
 *
 * SSR mode uses Bun.build() to create a client bundle and ssrRenderToString()
 * to server-render HTML. Module freshness is handled by `bun --watch` which
 * restarts the server on file changes.
 */

const PORT = Number(process.env.PORT) || 5173;
const SSR_MODE = process.argv.includes('--ssr');

if (SSR_MODE) {
  await startSSRServer();
} else {
  startHMRServer();
}

// ── HMR Mode ──────────────────────────────────────────────────────

function startHMRServer(): void {
  // @ts-expect-error — Bun HTML import, resolved at serve time
  const homepage = require('./index.html');

  // TODO: API handler composition — when the app has a @vertz/server backend:
  // import { createServer } from '@vertz/server';
  // const apiApp = createServer({ entities: [...], db });
  // const apiHandler = apiApp.handler;

  const server = Bun.serve({
    port: PORT,
    routes: {
      // TODO: Uncomment when API handler is available:
      // '/api/*': { async fetch(req: Request) { return apiHandler(req); } },
      '/*': homepage,
    },
    development: {
      hmr: true,
      console: true,
    },
  });

  console.log(`\nDev server running at http://localhost:${server.port}`);
  console.log('Mode: HMR (CSS sidecar + Fast Refresh)');
}

// ── SSR Mode ──────────────────────────────────────────────────────

async function startSSRServer(): Promise<void> {
  const { resolve } = await import('node:path');
  const { watch } = await import('node:fs');
  const { plugin } = await import('bun');
  const { createVertzBunPlugin } = await import('@vertz/ui-server/bun-plugin');
  const { ssrRenderToString, ssrDiscoverQueries, safeSerialize } = await import('@vertz/ui-server');

  const ENTRY = resolve(import.meta.dir, 'src', 'index.ts');

  // Register JSX runtime swap: @vertz/ui/jsx-runtime → @vertz/ui-server/jsx-runtime
  plugin({
    name: 'vertz-ssr-jsx-swap',
    setup(build) {
      build.onResolve({ filter: /^@vertz\/ui\/jsx-runtime$/ }, () => {
        return { path: '@vertz/ui-server/jsx-runtime', external: false };
      });
      build.onResolve({ filter: /^@vertz\/ui\/jsx-dev-runtime$/ }, () => {
        return { path: '@vertz/ui-server/jsx-runtime', external: false };
      });
    },
  });

  // Register the Vertz compiler plugin for server-side .tsx transforms
  const { plugin: serverPlugin } = createVertzBunPlugin({
    hmr: false,
    fastRefresh: false,
  });
  plugin(serverPlugin);

  // Build the client bundle
  let clientBundle = '';
  let clientBuildTime = 0;

  const { plugin: clientPlugin } = createVertzBunPlugin({
    hmr: false,
    fastRefresh: false,
  });

  async function buildClient(): Promise<boolean> {
    const start = performance.now();
    const result = await Bun.build({
      entrypoints: [ENTRY],
      plugins: [clientPlugin],
      target: 'browser',
      minify: false,
      sourcemap: 'inline',
    });

    if (!result.success) {
      console.error('Client build failed:');
      for (const log of result.logs) {
        console.error(' ', log.message);
      }
      return false;
    }

    for (const output of result.outputs) {
      clientBundle = await output.text();
    }

    clientBuildTime = performance.now() - start;
    return true;
  }

  console.log('Building client bundle...');
  const clientOk = await buildClient();
  if (!clientOk) {
    console.error('Client build failed. Fix errors and restart.');
    process.exit(1);
  }
  console.log(`Client built in ${clientBuildTime.toFixed(0)}ms`);

  // Read HTML template
  const indexHtml = await Bun.file(resolve(import.meta.dir, 'index.html')).text();

  // Load the SSR module (server-side import of the app entry)
  let ssrModule: import('@vertz/ui-server').SSRModule;
  try {
    ssrModule = await import(ENTRY);
    console.log('SSR module loaded');
  } catch (e) {
    console.error('Failed to load SSR module:', e);
    process.exit(1);
  }

  /**
   * Inject SSR output into the HTML template.
   */
  function injectIntoTemplate(
    template: string,
    appHtml: string,
    appCss: string,
    ssrData: Array<{ key: string; data: unknown }>,
  ): string {
    // Replace <script type="module" src="./src/index.ts"> with client bundle
    let html = template.replace(
      /<script type="module" src="\.\/src\/index\.ts"><\/script>/,
      `<script type="module">\n${clientBundle}\n</script>`,
    );

    // Remove the Fast Refresh runtime script (not needed in SSR mode)
    html = html.replace(
      /\s*<!-- Fast Refresh runtime.*?-->\s*<script[^>]*fast-refresh-runtime[^>]*><\/script>/s,
      '',
    );

    // Inject app HTML into <div id="app">
    if (html.includes('<!--ssr-outlet-->')) {
      html = html.replace('<!--ssr-outlet-->', appHtml);
    } else {
      html = html.replace(
        /(<div[^>]*id="app"[^>]*>)([\s\S]*?)(<\/div>)/,
        `$1${appHtml}$3`,
      );
    }

    // Inject CSS before </head>
    if (appCss) {
      html = html.replace('</head>', `${appCss}\n</head>`);
    }

    // Inject SSR data for client-side hydration before </body>
    if (ssrData.length > 0) {
      const ssrDataScript = `<script>window.__VERTZ_SSR_DATA__=${safeSerialize(ssrData)};</script>`;
      html = html.replace('</body>', `${ssrDataScript}\n</body>`);
    }

    return html;
  }

  // Watch for file changes and rebuild client bundle
  const srcDir = resolve(import.meta.dir, 'src');
  let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;

  watch(srcDir, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    if (rebuildTimeout) clearTimeout(rebuildTimeout);
    rebuildTimeout = setTimeout(async () => {
      console.log(`\nFile changed: ${filename}`);
      console.log('Rebuilding client...');
      await buildClient();
      console.log(`Client rebuilt in ${clientBuildTime.toFixed(0)}ms`);
      // SSR module freshness handled by `bun --watch` which restarts the server
    }, 100);
  });

  // Start server
  const server = Bun.serve({
    port: PORT,

    async fetch(request) {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // TODO: API handler composition — when the app has a @vertz/server backend:
      // if (pathname.startsWith('/api/')) return apiHandler(request);

      // Handle nav pre-fetch requests (X-Vertz-Nav: 1)
      if (request.headers.get('x-vertz-nav') === '1') {
        try {
          const result = await ssrDiscoverQueries(ssrModule, pathname, { ssrTimeout: 300 });
          let body = '';
          for (const entry of result.resolved) {
            body += `event: data\ndata: ${safeSerialize(entry)}\n\n`;
          }
          body += 'event: done\ndata: {}\n\n';
          return new Response(body, {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
          });
        } catch {
          return new Response('event: done\ndata: {}\n\n', {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
          });
        }
      }

      // Serve static files from public/ and project root (e.g. ./public/favicon.svg)
      if (pathname !== '/' && !pathname.endsWith('.html')) {
        // Try public/ directory first (e.g. /favicon.svg → public/favicon.svg)
        const publicFile = Bun.file(resolve(import.meta.dir, `public${pathname}`));
        if (await publicFile.exists()) {
          return new Response(publicFile);
        }
        // Try project root (e.g. /public/favicon.svg → ./public/favicon.svg)
        const rootFile = Bun.file(resolve(import.meta.dir, pathname.slice(1)));
        if (await rootFile.exists()) {
          return new Response(rootFile);
        }
      }

      // Skip non-HTML requests
      if (
        !request.headers.get('accept')?.includes('text/html')
        && !pathname.endsWith('.html')
        && pathname !== '/'
      ) {
        return new Response('Not Found', { status: 404 });
      }

      // SSR render
      try {
        const result = await ssrRenderToString(ssrModule, pathname, { ssrTimeout: 300 });
        const html = injectIntoTemplate(indexHtml, result.html, result.css, result.ssrData);

        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      } catch (err) {
        console.error('SSR error:', err);
        // Fallback to client-only rendering
        const fallbackHtml = indexHtml.replace(
          /<script type="module" src="\.\/src\/index\.ts"><\/script>/,
          `<script type="module">\n${clientBundle}\n</script>`,
        );
        return new Response(fallbackHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
    },
  });

  console.log(`\nSSR dev server running at http://localhost:${server.port}`);
  console.log('Mode: SSR + client hydration (watching for changes)');
  console.log('Use `bun --watch` for SSR module freshness');
}
