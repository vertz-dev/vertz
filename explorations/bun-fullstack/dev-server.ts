/**
 * Phase 2: Bun dev server for the task-manager example (client-only).
 *
 * Uses Bun.serve() with a manual bundling approach since Bun's HTML import
 * feature requires paths relative to the HTML file, but the task-manager
 * uses absolute paths (/src/index.ts).
 *
 * Approach:
 * 1. Use Bun.build() with the Vertz compiler plugin to bundle the app
 * 2. Serve the bundle + HTML template via Bun.serve()
 * 3. Watch for file changes and rebuild (dev mode)
 *
 * Run from explorations/bun-fullstack/:
 *   bun dev-server.ts
 */

import { resolve } from 'node:path';
import { watch } from 'node:fs';
import { vertzBunPlugin, fileExtractions } from './vertz-bun-plugin';

const TASK_MANAGER_DIR = resolve(import.meta.dir, '..', '..', 'examples', 'task-manager');
const ENTRY = resolve(TASK_MANAGER_DIR, 'src', 'index.ts');
const PORT = Number(process.env.PORT) || 3000;

// Initial build
let bundleCode = '';
let buildTime = 0;

async function buildApp() {
  const start = performance.now();
  const result = await Bun.build({
    entrypoints: [ENTRY],
    plugins: [vertzBunPlugin()],
    target: 'browser',
    minify: false,
    sourcemap: 'inline',
    // Don't externalize @vertz packages — bundle everything for the browser
  });

  if (!result.success) {
    console.error('Build failed:');
    for (const log of result.logs) {
      console.error(' ', log.message);
    }
    return false;
  }

  for (const output of result.outputs) {
    bundleCode = await output.text();
  }

  buildTime = performance.now() - start;
  return true;
}

console.log('Building...');
const ok = await buildApp();
if (!ok) {
  console.error('Initial build failed. Fix errors and restart.');
  process.exit(1);
}
console.log(`Built in ${buildTime.toFixed(0)}ms`);

// Read and prepare HTML template
const indexHtml = await Bun.file(resolve(TASK_MANAGER_DIR, 'index.html')).text();

function getHtml() {
  // Replace the <script type="module" src="/src/index.ts"> with the bundle
  return indexHtml.replace(
    /<script type="module" src="\/src\/index\.ts"><\/script>/,
    `<script type="module">\n${bundleCode}\n</script>`,
  );
}

// Watch for file changes and rebuild
const srcDir = resolve(TASK_MANAGER_DIR, 'src');
let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;

watch(srcDir, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  // Debounce rebuilds
  if (rebuildTimeout) clearTimeout(rebuildTimeout);
  rebuildTimeout = setTimeout(async () => {
    console.log(`\nFile changed: ${filename}`);
    console.log('Rebuilding...');
    const ok = await buildApp();
    if (ok) {
      console.log(`Rebuilt in ${buildTime.toFixed(0)}ms`);
    }
  }, 100);
});

// Start server
const server = Bun.serve({
  port: PORT,

  async fetch(request) {
    const url = new URL(request.url);

    // Serve favicon and other static files
    if (url.pathname !== '/' && !url.pathname.endsWith('.html')) {
      const staticFile = Bun.file(resolve(TASK_MANAGER_DIR, `.${url.pathname}`));
      if (await staticFile.exists()) {
        return new Response(staticFile);
      }
    }

    // All routes serve the SPA HTML
    return new Response(getHtml(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
});

console.log(`\nDev server running at http://localhost:${server.port}`);
console.log(`Serving: ${TASK_MANAGER_DIR}`);
console.log('Mode: client-only (watching for changes)');
console.log('Note: This uses Bun.build() for bundling. No HMR — full page refresh on changes.');
