/**
 * Production build script using Bun.build().
 *
 * Replaces `vite build` with Bun-native bundling:
 * 1. Client build → dist/client/ (browser target, minified, split)
 * 2. Server build → dist/server/ (bun target, SSR with JSX swap)
 * 3. HTML template → dist/client/index.html (asset references injected)
 *
 * Usage: bun run build.ts
 */

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { plugin } from 'bun';
import { createVertzBunPlugin } from '@vertz/ui-server/bun-plugin';

const ROOT = import.meta.dir;
const ENTRY = resolve(ROOT, 'src', 'index.ts');
const DIST_CLIENT = resolve(ROOT, 'dist', 'client');
const DIST_SERVER = resolve(ROOT, 'dist', 'server');

// Clean dist/
rmSync(resolve(ROOT, 'dist'), { recursive: true, force: true });
mkdirSync(DIST_CLIENT, { recursive: true });
mkdirSync(DIST_SERVER, { recursive: true });

// ── 1. Client build ──────────────────────────────────────────────

console.log('Building client...');

const { plugin: clientPlugin, fileExtractions } = createVertzBunPlugin({
  hmr: false,
  fastRefresh: false,
});

const clientResult = await Bun.build({
  entrypoints: [ENTRY],
  plugins: [clientPlugin],
  target: 'browser',
  minify: true,
  sourcemap: 'external',
  splitting: true,
  outdir: resolve(DIST_CLIENT, 'assets'),
  naming: '[name]-[hash].[ext]',
});

if (!clientResult.success) {
  console.error('Client build failed:');
  for (const log of clientResult.logs) {
    console.error(' ', log.message);
  }
  process.exit(1);
}

// Collect output filenames for HTML injection
let clientJsPath = '';
const clientCssPaths: string[] = [];

for (const output of clientResult.outputs) {
  const name = output.path.replace(DIST_CLIENT, '');
  if (output.kind === 'entry-point') {
    clientJsPath = name;
  } else if (output.path.endsWith('.css')) {
    clientCssPaths.push(name);
  }
}

console.log(`  JS entry: ${clientJsPath}`);
for (const css of clientCssPaths) {
  console.log(`  CSS: ${css}`);
}

// ── 2. Extract CSS from component css() calls ────────────────────

// Collect all CSS extracted by the compiler plugin during client build
let extractedCss = '';
for (const [, extraction] of fileExtractions) {
  if (extraction.css) {
    extractedCss += extraction.css + '\n';
  }
}

if (extractedCss) {
  const cssOutPath = resolve(DIST_CLIENT, 'assets', 'vertz.css');
  await Bun.write(cssOutPath, extractedCss);
  clientCssPaths.push('/assets/vertz.css');
  console.log('  CSS (extracted): /assets/vertz.css');
}

// ── 3. Process HTML template ─────────────────────────────────────

console.log('Processing HTML template...');

let html = await Bun.file(resolve(ROOT, 'index.html')).text();

// Replace the source script tag with the built entry
html = html.replace(
  /<script type="module" src="\.\/src\/index\.ts"><\/script>/,
  `<script type="module" crossorigin src="${clientJsPath}"></script>`,
);

// Remove the Fast Refresh runtime (not needed in production)
html = html.replace(
  /\s*<!-- Fast Refresh runtime.*?-->\s*<script[^>]*fast-refresh-runtime[^>]*><\/script>/s,
  '',
);

// Inject CSS links before </head>
if (clientCssPaths.length > 0) {
  const cssLinks = clientCssPaths
    .map((path) => `  <link rel="stylesheet" href="${path}">`)
    .join('\n');
  html = html.replace('</head>', `${cssLinks}\n  </head>`);
}

// Fix favicon path for production (./public/favicon.svg → /favicon.svg)
html = html.replace('href="./public/favicon.svg"', 'href="/favicon.svg"');

await Bun.write(resolve(DIST_CLIENT, 'index.html'), html);

// ── 4. Copy public/ → dist/client/ ──────────────────────────────

const publicDir = resolve(ROOT, 'public');
cpSync(publicDir, DIST_CLIENT, { recursive: true });
console.log('  Copied public/ assets');

// ── 5. Server build ──────────────────────────────────────────────

console.log('Building server...');

// Register JSX runtime swap for SSR
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

const { plugin: serverPlugin } = createVertzBunPlugin({
  hmr: false,
  fastRefresh: false,
});

const serverResult = await Bun.build({
  entrypoints: [ENTRY],
  plugins: [serverPlugin],
  target: 'bun',
  minify: false,
  outdir: DIST_SERVER,
  naming: '[name].[ext]',
  // Externalize runtime dependencies — they're available at import time
  external: ['@vertz/ui', '@vertz/ui-server', '@vertz/ui-primitives'],
});

if (!serverResult.success) {
  console.error('Server build failed:');
  for (const log of serverResult.logs) {
    console.error(' ', log.message);
  }
  process.exit(1);
}

console.log('  Server entry: dist/server/index.js');

// ── Done ─────────────────────────────────────────────────────────

console.log('\nBuild complete!');
console.log(`  Client: ${DIST_CLIENT}/`);
console.log(`  Server: ${DIST_SERVER}/`);
console.log('\nRun: bun run start');
