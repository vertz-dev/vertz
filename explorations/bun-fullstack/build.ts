/**
 * Phase 5: Production build using Bun.build() with the Vertz compiler plugin.
 *
 * Generates:
 * - Client bundle (minified, code-split, source maps)
 * - Extracted CSS (dead CSS elimination)
 * - Bundle size report
 *
 * Run: bun build.ts
 */

import { resolve } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { vertzBunPlugin, fileExtractions } from './vertz-bun-plugin';
import { DeadCSSEliminator } from '../../packages/ui-compiler/src/css-extraction/dead-css';

const TASK_MANAGER_DIR = resolve(import.meta.dir, '..', '..', 'examples', 'task-manager');
const ENTRY = resolve(TASK_MANAGER_DIR, 'src', 'index.ts');
const OUT_DIR = resolve(import.meta.dir, 'dist');

// Clean output directory
try { rmSync(OUT_DIR, { recursive: true }); } catch {}
mkdirSync(resolve(OUT_DIR, 'client'), { recursive: true });

console.log('=== Vertz Production Build (Bun) ===\n');

// ── Client Build ──────────────────────────────────────────
const clientStart = performance.now();

const clientResult = await Bun.build({
  entrypoints: [ENTRY],
  plugins: [vertzBunPlugin()],
  target: 'browser',
  minify: true,
  sourcemap: 'external',
  splitting: true,
  outdir: resolve(OUT_DIR, 'client'),
  naming: 'assets/[name]-[hash].[ext]',
});

const clientTime = performance.now() - clientStart;

if (!clientResult.success) {
  console.error('Client build failed:');
  for (const log of clientResult.logs) {
    console.error(' ', log.message);
  }
  process.exit(1);
}

console.log(`Client build: ${clientTime.toFixed(0)}ms`);
console.log('  Output files:');
let totalClientSize = 0;
for (const output of clientResult.outputs) {
  const size = output.size;
  totalClientSize += size;
  const name = output.path.replace(OUT_DIR, '');
  console.log(`    ${name} — ${formatSize(size)}`);
}
console.log(`  Total: ${formatSize(totalClientSize)}`);

// ── CSS Extraction ────────────────────────────────────────
console.log(`\nCSS extractions: ${fileExtractions.size} files`);

const usedFiles = new Set(fileExtractions.keys());
const deadCssEliminator = new DeadCSSEliminator();
const liveCSS = deadCssEliminator.eliminate(fileExtractions, usedFiles);

if (liveCSS.length > 0) {
  const cssPath = resolve(OUT_DIR, 'client', 'assets', 'vertz.css');
  mkdirSync(resolve(OUT_DIR, 'client', 'assets'), { recursive: true });
  writeFileSync(cssPath, liveCSS);
  console.log(`  Extracted CSS: ${formatSize(Buffer.byteLength(liveCSS))}`);
  console.log(`  Written to: dist/client/assets/vertz.css`);
} else {
  console.log('  No extractable CSS (all CSS is runtime-generated)');
}

// ── HTML Template ─────────────────────────────────────────
const indexHtml = await Bun.file(resolve(TASK_MANAGER_DIR, 'index.html')).text();

// Find the main JS output file
const mainJs = clientResult.outputs.find(o => o.path.endsWith('.js') && !o.path.includes('chunk'));
const mainJsName = mainJs
  ? mainJs.path.replace(resolve(OUT_DIR, 'client') + '/', '')
  : 'assets/index.js';

let html = indexHtml.replace(
  '<script type="module" src="/src/index.ts"></script>',
  `<script type="module" src="/${mainJsName}"></script>`,
);

// Inject CSS link if extracted CSS exists
if (liveCSS.length > 0) {
  html = html.replace('</head>', '  <link rel="stylesheet" href="/assets/vertz.css">\n</head>');
}

writeFileSync(resolve(OUT_DIR, 'client', 'index.html'), html);
console.log('\n  Written: dist/client/index.html');

// ── Summary ───────────────────────────────────────────────
console.log('\n=== Build Summary ===');
console.log(`  Build time: ${clientTime.toFixed(0)}ms`);
console.log(`  JS bundle: ${formatSize(totalClientSize)}`);
console.log(`  CSS extracted: ${liveCSS.length > 0 ? formatSize(Buffer.byteLength(liveCSS)) : 'none (runtime)'}`);
console.log(`  Files processed: ${fileExtractions.size}`);
console.log(`  Output: ${OUT_DIR}/`);

// ── Compare with Vite ─────────────────────────────────────
// Check if Vite dist exists for comparison
const viteDistDir = resolve(TASK_MANAGER_DIR, 'dist', 'client');
const viteIndexJs = Bun.file(resolve(viteDistDir, 'assets', 'index.js'));
if (await viteIndexJs.exists()) {
  console.log('\n=== Vite Comparison ===');
  const viteSize = viteIndexJs.size;
  console.log(`  Vite JS: ${formatSize(viteSize ?? 0)}`);
  console.log(`  Bun JS: ${formatSize(totalClientSize)}`);
}

console.log('\nDone.');

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}
