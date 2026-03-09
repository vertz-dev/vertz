/**
 * Landing Page Production Build
 *
 * Produces a fully self-contained static site for Cloudflare Workers:
 * 1. Builds client JS bundle (Bun.build + Vertz plugin)
 * 2. Extracts CSS from components
 * 3. Generates OG image via Satori
 * 4. SSR-renders the page via dev server
 * 5. Strips dev-only scripts, injects production assets + meta tags
 * 6. Outputs everything to dist/ for wrangler deploy
 *
 * Usage: bun run scripts/build.ts
 */

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createVertzBunPlugin } from '@vertz/ui-server/bun-plugin';

const ROOT = resolve(import.meta.dir, '..');
const DIST = resolve(ROOT, 'dist');
const DIST_ASSETS = resolve(DIST, 'assets');
const PORT = 4100;

// ── Step 1: Build client JS bundle ─────────────────────────
console.log('[build] Building client bundle...');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST_ASSETS, { recursive: true });

const { plugin, fileExtractions } = createVertzBunPlugin({
  hmr: false,
  fastRefresh: false,
  projectRoot: ROOT,
});

const clientResult = await Bun.build({
  entrypoints: [resolve(ROOT, 'src/entry-client.ts')],
  plugins: [plugin],
  target: 'browser',
  minify: true,
  splitting: true,
  outdir: DIST_ASSETS,
  naming: '[name]-[hash].[ext]',
});

if (!clientResult.success) {
  console.error('[build] Client build failed:');
  for (const log of clientResult.logs) {
    console.error(`  ${log.message}`);
  }
  process.exit(1);
}

// Collect built asset paths (relative to dist/)
let clientJsPath = '';
const clientCssPaths: string[] = [];

for (const output of clientResult.outputs) {
  const rel = output.path.replace(DIST, '');
  if (output.kind === 'entry-point') {
    clientJsPath = rel;
    console.log(`  JS entry: ${rel}`);
  } else if (output.path.endsWith('.css')) {
    clientCssPaths.push(rel);
    console.log(`  CSS: ${rel}`);
  }
}

// Extract component CSS
let extractedCss = '';
for (const [, extraction] of fileExtractions) {
  if (extraction.css) {
    extractedCss += `${extraction.css}\n`;
  }
}
if (extractedCss) {
  const cssPath = resolve(DIST_ASSETS, 'vertz.css');
  writeFileSync(cssPath, extractedCss);
  clientCssPaths.push('/assets/vertz.css');
  console.log('  CSS (extracted): /assets/vertz.css');
}

// ── Step 2: Copy public/ → dist/ ───────────────────────────
const publicDir = resolve(ROOT, 'public');
if (existsSync(publicDir)) {
  cpSync(publicDir, resolve(DIST, 'public'), { recursive: true });
  console.log('[build] Copied public/ assets');
}

// ── Step 3: Generate OG image ──────────────────────────────
console.log('[build] Generating OG image...');
const ogProc = Bun.spawnSync(['bun', 'run', 'scripts/generate-og.ts'], {
  cwd: ROOT,
  stdio: ['inherit', 'inherit', 'inherit'],
});
if (ogProc.exitCode !== 0) {
  console.warn('[build] OG image generation failed (continuing without it)');
}
// Copy newly generated OG image to dist
const ogSrc = resolve(ROOT, 'public/og.png');
if (existsSync(ogSrc)) {
  cpSync(ogSrc, resolve(DIST, 'public/og.png'));
}

// ── Step 4: SSR-render the page ────────────────────────────
console.log('[build] Starting dev server for SSR render...');
const server = Bun.spawn(['bun', 'run', 'src/dev-server.ts'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let ready = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`http://localhost:${PORT}`);
    if (res.ok) {
      ready = true;
      break;
    }
  } catch {
    // Not ready yet
  }
  await Bun.sleep(500);
}

if (!ready) {
  console.error('[build] Dev server failed to start');
  server.kill();
  process.exit(1);
}

const html = await fetch(`http://localhost:${PORT}`).then((r) => r.text());
server.kill();
console.log(`[build] Captured SSR HTML (${(html.length / 1024).toFixed(1)} KB)`);

// ── Step 5: Strip dev scripts ──────────────────────────────
console.log('[build] Stripping dev scripts...');
let clean = html
  .replace(
    /<style>bun-hmr\{display:none!important\}<\/style><script>\(function\(\)\{var V=window\.__vertz_overlay[\s\S]*?\}\)\(\)<\/script>/g,
    '',
  )
  .replace(
    /<script>\(function\(\)\{var K="__vertz_reload_count"[\s\S]*?\}\)\(\)<\/script>/g,
    '',
  )
  .replace(/<script type="text\/plain"[^>]*data-bun-dev-server-script[^>]*><\/script>/g, '')
  .replace(
    /<script>\(\(a\)=>\{document\.addEventListener[\s\S]*?\}\)\(document\.querySelector[\s\S]*?\)<\/script>/g,
    '',
  )
  .replace(
    /<script>\(function\(\)\{var el=document\.querySelector\('\[data-bun-dev-server-script\]'\)[\s\S]*?\}\)\(\)<\/script>/g,
    '',
  )
  // Also strip the dev client entry script (served by Bun dev server)
  .replace(/<script type="module" src="\/src\/entry-client\.ts"><\/script>/g, '')
  .replace(/\n\s*\n\s*\n/g, '\n');

// Verify dev references are stripped
for (const ref of ['__vertz_overlay', 'bun-hmr', '__vertz_reload', '_bun/client', 'data-bun-dev-server']) {
  if (clean.includes(ref)) {
    console.warn(`[build] WARNING: Still contains dev reference: ${ref}`);
  }
}

// ── Step 6: Inject production head + client bundle ─────────
console.log('[build] Injecting production head + client bundle...');

const cssLinks = clientCssPaths
  .map((path) => `  <link rel="stylesheet" href="${path}" />`)
  .join('\n');

const PRODUCTION_HEAD = `
  <meta name="description" content="One command. Database, API, and UI — running locally. Define your schema once. Everything else is derived. Zero config." />

  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="/public/logo.svg" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://vertz.dev" />
  <meta property="og:title" content="Vertz — One command. Full stack. Running." />
  <meta property="og:description" content="Define your schema once. Everything else is derived. Database, API, and UI from a single schema. Zero config." />
  <meta property="og:image" content="https://vertz.dev/public/og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@vinicius_dacal" />
  <meta name="twitter:title" content="Vertz — One command. Full stack. Running." />
  <meta name="twitter:description" content="Define your schema once. Everything else is derived. Database, API, and UI from a single schema. Zero config." />
  <meta name="twitter:image" content="https://vertz.dev/public/og.png" />

  <!-- Font preloads (self-hosted, no external Google Fonts request) -->
  <link rel="preload" href="/public/fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="/public/fonts/dm-serif-display-latin.woff2" as="font" type="font/woff2" crossorigin />

  <!-- Canonical -->
  <link rel="canonical" href="https://vertz.dev" />

  <!-- Production CSS -->
${cssLinks}`;

// Inject meta tags after <title>
clean = clean.replace(
  /(<title>[^<]*<\/title>)/,
  `$1\n${PRODUCTION_HEAD}`,
);

// Inject production client bundle before </body>
clean = clean.replace(
  /<\/body>/,
  `  <script type="module" crossorigin src="${clientJsPath}"></script>\n</body>`,
);

// ── Step 7: Write index.html to dist/ ──────────────────────
const outPath = resolve(DIST, 'index.html');
await Bun.write(outPath, clean);
const fileSize = (await Bun.file(outPath).stat()).size;
console.log(`\n[build] ✓ Production build complete!`);
console.log(`  dist/index.html    (${(fileSize / 1024).toFixed(1)} KB)`);
console.log(`  dist/assets/       (client JS + CSS)`);
console.log(`  dist/public/       (static assets + OG image)`);
