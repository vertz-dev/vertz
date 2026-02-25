/**
 * HMR Dev Server Prototype — CSS sidecar files approach.
 *
 * Uses Bun.serve() with HTML import to get Bun's native HMR:
 * - JS modules self-accept via import.meta.hot.accept()
 * - CSS sidecar files get Bun's built-in CSS HMR (<link> tag swap)
 *
 * Run: bun hmr-dev-server.ts
 */

// @ts-ignore — HTML import, Bun resolves this at build time
import homepage from './hmr-index.html';

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  routes: {
    // Serve the SPA for all HTML-accepting routes (client-side routing)
    '/*': homepage,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`\nHMR dev server running at http://localhost:${server.port}`);
console.log('Mode: HTML import + CSS sidecar HMR');
console.log('CSS sidecar dir: .vertz/css/');
