/**
 * Production build script for Entity Todo.
 *
 * 1. Client build → dist/client/assets/ (Bun.build, browser target, minified)
 * 2. Worker build → dist/worker.js (Bun.build, bun target, then patched for Workers)
 *
 * The worker uses Bun.build (to get the Vertz compiler plugin) with target=bun,
 * then patches the output to replace Bun-specific CJS helpers (import.meta.require)
 * with standard ESM-compatible equivalents for Cloudflare Workers.
 *
 * Usage: bun run build.ts
 */

import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { createVertzBunPlugin } from '@vertz/ui-server/bun-plugin';

const ROOT = import.meta.dir;
const CLIENT_ENTRY = resolve(ROOT, 'src', 'entry-client.ts');
const WORKER_ENTRY = resolve(ROOT, 'src', 'worker.ts');
const DIST = resolve(ROOT, 'dist');
const DIST_CLIENT = resolve(DIST, 'client');

// Clean dist/
rmSync(DIST, { recursive: true, force: true });
mkdirSync(resolve(DIST_CLIENT, 'assets'), { recursive: true });

// ── 1. Client build ──────────────────────────────────────────────

console.log('Building client...');

const { plugin: clientPlugin, fileExtractions } = createVertzBunPlugin({
  hmr: false,
  fastRefresh: false,
});

const clientResult = await Bun.build({
  entrypoints: [CLIENT_ENTRY],
  plugins: [clientPlugin],
  target: 'browser',
  minify: true,
  sourcemap: 'external',
  splitting: true,
  outdir: resolve(DIST_CLIENT, 'assets'),
  naming: '[name].[ext]',
});

if (!clientResult.success) {
  console.error('Client build failed:');
  for (const log of clientResult.logs) {
    console.error(' ', log.message);
  }
  process.exit(1);
}

for (const output of clientResult.outputs) {
  const name = output.path.replace(DIST_CLIENT, '');
  if (output.kind === 'entry-point') {
    console.log(`  JS entry: ${name}`);
  } else if (output.path.endsWith('.css')) {
    console.log(`  CSS: ${name}`);
  }
}

// Extract CSS from component css() calls
let extractedCss = '';
for (const [, extraction] of fileExtractions) {
  if (extraction.css) {
    extractedCss += `${extraction.css}\n`;
  }
}

if (extractedCss) {
  const cssOutPath = resolve(DIST_CLIENT, 'assets', 'vertz.css');
  await Bun.write(cssOutPath, extractedCss);
  console.log('  CSS (extracted): /assets/vertz.css');
}

// ── 2. Worker build ──────────────────────────────────────────────

console.log('Building worker...');

const { plugin: workerPlugin } = createVertzBunPlugin({
  hmr: false,
  fastRefresh: false,
});

const workerResult = await Bun.build({
  entrypoints: [WORKER_ENTRY],
  plugins: [workerPlugin],
  target: 'bun',
  minify: false,
  sourcemap: 'none',
  outdir: DIST,
  naming: 'worker.[ext]',
});

if (!workerResult.success) {
  console.error('Worker build failed:');
  for (const log of workerResult.logs) {
    console.error(' ', log.message);
  }
  process.exit(1);
}

// Patch worker output for Cloudflare Workers compatibility.
// These are Bun.build quirks (target=bun emits Bun-specific constructs),
// NOT dead-code issues.
const workerPath = resolve(DIST, 'worker.js');
let workerCode = await Bun.file(workerPath).text();

// 1. Remove Bun marker comment
workerCode = workerCode.replace(/^\/\/ @bun\n/, '');

// 2. Replace Bun-specific import.meta.require with a minimal CJS require shim.
// The only require() calls in the bundle are for "crypto" (from @noble/hashes).
// We provide a shim that maps to the node:crypto ESM import.
workerCode = workerCode.replace(
  'var __require = import.meta.require;',
  'var __require = (mod) => { if (mod === "crypto" || mod === "node:crypto") return __nodeCrypto; throw new Error(`require("${mod}") not available in Workers`); };',
);

// 3. Fix bare Node.js built-in imports → node: prefixed (Cloudflare nodejs_compat)
const nodeBuiltins = [
  'async_hooks',
  'buffer',
  'child_process',
  'crypto',
  'events',
  'fs',
  'http',
  'https',
  'module',
  'net',
  'os',
  'path',
  'stream',
  'tls',
  'url',
  'util',
  'zlib',
  'string_decoder',
  'worker_threads',
  'assert',
];
for (const mod of nodeBuiltins) {
  const escaped = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Replace: from "module" → from "node:module"  (but NOT "node:module")
  workerCode = workerCode.replace(new RegExp(`from\\s+"${escaped}"`, 'g'), `from "node:${mod}"`);
  workerCode = workerCode.replace(new RegExp(`from\\s+'${escaped}'`, 'g'), `from 'node:${mod}'`);
  // Also fix require("module") → require("node:module")
  workerCode = workerCode.replace(
    new RegExp(`require\\("${escaped}"\\)`, 'g'),
    `require("node:${mod}")`,
  );
}

// 4. Prepend node:crypto import for the CJS require shim
workerCode = `import * as __nodeCrypto from "node:crypto";\n${workerCode}`;

await Bun.write(workerPath, workerCode);

const stats = Bun.file(workerPath);
console.log(`  Worker: dist/worker.js (${(stats.size / 1024).toFixed(0)}KB)`);

// ── Done ─────────────────────────────────────────────────────────

console.log('\nBuild complete!');
console.log(`  Client: ${DIST_CLIENT}/`);
console.log(`  Worker: ${DIST}/worker.js`);
console.log('\nDeploy: wrangler deploy');
