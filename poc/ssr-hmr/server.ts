/**
 * POC: SSR + HMR + API in a single Bun.serve()
 *
 * Tests multiple approaches for serving HMR-enabled client bundles
 * from dynamically generated SSR HTML.
 *
 * Run: bun run poc/ssr-hmr/server.ts
 */

// @ts-ignore — HTML imports are a Bun-specific feature
import hmrShell from './hmr-shell.html';

let bundledScriptUrl: string | null = null;
let hmrBootstrapScript: string | null = null;

const server = Bun.serve({
  port: 3456,

  routes: {
    '/__hmr': hmrShell,
  },

  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, timestamp: Date.now() });
    }

    // SSR for page routes
    const scriptTag = bundledScriptUrl
      ? `<script type="module" crossorigin src="${bundledScriptUrl}" data-bun-dev-server-script></script>${hmrBootstrapScript ? `\n  ${hmrBootstrapScript}` : ''}`
      : `<script type="module" src="/client.tsx"></script>`;

    const ssrHtml = `<!DOCTYPE html>
<html>
<head>
  <title>SSR + HMR POC</title>
</head>
<body>
  <div id="app">
    <h1>Server-rendered content</h1>
    <p>This was rendered on the server at ${new Date().toISOString()}</p>
    <p>Using bundled URL: ${bundledScriptUrl ? 'YES' : 'NO'}</p>
  </div>
  ${scriptTag}
</body>
</html>`;

    return new Response(ssrHtml, {
      headers: { 'Content-Type': 'text/html' },
    });
  },

  development: {
    hmr: true,
    console: true,
  },
});

// After server starts, fetch /__hmr to discover the bundled script URL
try {
  const res = await fetch(`http://localhost:${server.port}/__hmr`);
  const html = await res.text();

  // Extract the bundled /_bun/client/... URL
  const srcMatch = html.match(/src="(\/_bun\/client\/[^"]+\.js)"/);
  if (srcMatch) {
    bundledScriptUrl = srcMatch[1];
    console.log('✅ Discovered bundled script URL:', bundledScriptUrl);
  }

  // Extract the HMR bootstrap script (the unref beacon script)
  const bootstrapMatch = html.match(/<script>(\(\(a\)=>\{document\.addEventListener.*?)<\/script>/);
  if (bootstrapMatch) {
    hmrBootstrapScript = `<script>${bootstrapMatch[1]}</script>`;
    console.log('✅ Extracted HMR bootstrap script');
  }
} catch (e) {
  console.log('❌ Could not discover bundled URL:', e);
}

console.log(`
🧪 SSR + HMR POC running at http://localhost:${server.port}
Bundled script URL: ${bundledScriptUrl || 'NOT FOUND'}

Test endpoints:
  http://localhost:${server.port}/          — SSR page (fetch handler)
  http://localhost:${server.port}/__hmr     — HMR shell (routes, initializes HMR)
  http://localhost:${server.port}/api/health — API route

Test plan:
  1. Open / in browser → check console for import.meta.hot
  2. Edit client.tsx → check if HMR update triggers
`);
