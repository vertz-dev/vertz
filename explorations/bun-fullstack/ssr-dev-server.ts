/**
 * Phase 4: Bun SSR dev server for the task-manager example.
 *
 * Replaces Vite's SSR middleware with a Bun-native approach:
 * 1. Registers the Vertz compiler plugin for .tsx transforms
 * 2. Swaps JSX runtime for SSR (client → server JSX)
 * 3. Uses ssrRenderToString() for two-pass rendering
 * 4. Serves the client bundle for hydration
 *
 * Run: bun ssr-dev-server.ts
 */

import { resolve } from 'node:path';
import { watch } from 'node:fs';
import { plugin } from 'bun';
import { vertzBunPlugin, fileExtractions } from './vertz-bun-plugin';
// Use relative source imports since explorations/ is outside the workspace
import { ssrRenderToString, ssrDiscoverQueries } from '../../packages/ui-server/src/ssr-render';
import type { SSRModule } from '../../packages/ui-server/src/ssr-render';
import { safeSerialize } from '../../packages/ui-server/src/ssr-streaming-runtime';

const TASK_MANAGER_DIR = resolve(import.meta.dir, '..', '..', 'examples', 'task-manager');
const ENTRY = resolve(TASK_MANAGER_DIR, 'src', 'index.ts');
const PORT = Number(process.env.PORT) || 3000;

// Register the compiler plugin for server-side .tsx loading
// This also handles the JSX runtime swap via onResolve
plugin({
  name: 'vertz-ssr',
  setup(build) {
    // Swap JSX runtime: @vertz/ui/jsx-runtime → @vertz/ui-server/jsx-runtime
    build.onResolve({ filter: /^@vertz\/ui\/jsx-runtime$/ }, () => {
      return { path: '@vertz/ui-server/jsx-runtime', external: false };
    });
    build.onResolve({ filter: /^@vertz\/ui\/jsx-dev-runtime$/ }, () => {
      return { path: '@vertz/ui-server/jsx-runtime', external: false };
    });
  },
});

// Register the Vertz compiler plugin for .tsx transforms on the server
plugin(vertzBunPlugin());

// Build the client bundle
let clientBundle = '';
let clientBuildTime = 0;

async function buildClient() {
  const start = performance.now();
  const result = await Bun.build({
    entrypoints: [ENTRY],
    plugins: [vertzBunPlugin()],
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
const indexHtml = await Bun.file(resolve(TASK_MANAGER_DIR, 'index.html')).text();

// Load the SSR module (server-side import of the app entry)
// The compiler plugin transforms .tsx files on load
let ssrModule: SSRModule;
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
  // Replace <script type="module" src="/src/index.ts"> with client bundle
  let html = template.replace(
    /<script type="module" src="\/src\/index\.ts"><\/script>/,
    `<script type="module">\n${clientBundle}\n</script>`,
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
const srcDir = resolve(TASK_MANAGER_DIR, 'src');
let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;

watch(srcDir, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  if (rebuildTimeout) clearTimeout(rebuildTimeout);
  rebuildTimeout = setTimeout(async () => {
    console.log(`\nFile changed: ${filename}`);
    console.log('Rebuilding client...');
    await buildClient();
    console.log(`Client rebuilt in ${clientBuildTime.toFixed(0)}ms`);
    // Note: SSR module is cached — use `bun --hot` to auto-reload server modules
  }, 100);
});

// Start server
const server = Bun.serve({
  port: PORT,

  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

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

    // Serve static files
    if (pathname !== '/' && !pathname.endsWith('.html')) {
      const staticFile = Bun.file(resolve(TASK_MANAGER_DIR, `.${pathname}`));
      if (await staticFile.exists()) {
        return new Response(staticFile);
      }
    }

    // Skip non-HTML requests
    if (
      !request.headers.get('accept')?.includes('text/html') &&
      !pathname.endsWith('.html') &&
      pathname !== '/'
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
        /<script type="module" src="\/src\/index\.ts"><\/script>/,
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
console.log(`Serving: ${TASK_MANAGER_DIR}`);
console.log('Mode: SSR + client hydration (watching for changes)');
