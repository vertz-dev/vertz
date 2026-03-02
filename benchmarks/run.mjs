#!/usr/bin/env node
/**
 * Benchmark harness: compares vinext (Vite) vs Vertz (Bun.build)
 *
 * Metrics:
 *   1. Production build time (hyperfine or manual timing, randomized order)
 *   2. Production bundle size (client JS+CSS, raw + gzip)
 *   3. Dev server cold start (time to first HTTP 200 + peak RSS)
 *
 * Prerequisites:
 *   - Run `bash benchmarks/setup.sh` first (builds monorepo, installs vinext deps)
 *   - hyperfine (optional, falls back to manual timing)
 *
 * Usage: node benchmarks/run.mjs [--runs N] [--dev-runs N] [--skip-build] [--skip-dev]
 */

import { execSync, spawn } from 'node:child_process';
import {
  existsSync, readdirSync, statSync, writeFileSync,
  mkdirSync, readFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const RESULTS_DIR = join(__dirname, 'results');
mkdirSync(RESULTS_DIR, { recursive: true });

// ─── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const RUNS = parseInt(args.find((a) => a.startsWith('--runs='))?.split('=')[1] ?? '5', 10);
const DEV_RUNS = parseInt(args.find((a) => a.startsWith('--dev-runs='))?.split('=')[1] ?? '10', 10);
const SKIP_BUILD = args.includes('--skip-build');
const SKIP_DEV = args.includes('--skip-dev');

// ─── Helpers ───────────────────────────────────────────────────────────────────

function exec(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...opts });
}

function getGitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8', cwd: ROOT_DIR }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Recursively sum JS/CSS/MJS file sizes in a directory.
 * Returns { raw: bytes, gzip: bytes, files: number }
 */
function bundleSize(dir) {
  let raw = 0;
  let gzip = 0;
  let files = 0;

  function walk(d) {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (/\.(js|css|mjs)$/.test(entry)) {
        const content = readFileSync(full);
        raw += content.length;
        gzip += gzipSync(content).length;
        files++;
      }
    }
  }

  walk(dir);
  return { raw, gzip, files };
}

/**
 * Poll a URL until HTTP 200. Returns elapsed time in ms.
 */
async function waitForServer(url, timeoutMs = 60000) {
  const start = performance.now();
  const deadline = start + timeoutMs;

  while (performance.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return performance.now() - start;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server at ${url} did not respond within ${timeoutMs}ms`);
}

/**
 * Sum RSS (in KB) for an entire process group.
 * On macOS: enumerate all processes via ps and sum RSS for matching PGID.
 * On Linux: use pgrep -g to find PIDs in the group.
 */
function getGroupRssKb(pid) {
  try {
    if (process.platform === 'linux') {
      const pidsRaw = execSync(`pgrep -g ${pid}`, { encoding: 'utf-8' }).trim();
      if (!pidsRaw) return 0;
      const pidList = pidsRaw.split('\n').join(',');
      const out = execSync(`ps -o rss= -p ${pidList}`, { encoding: 'utf-8' });
      return out.trim().split('\n')
        .reduce((sum, line) => sum + (parseInt(line.trim(), 10) || 0), 0);
    } else {
      // macOS: enumerate all processes and sum RSS for our PGID
      const out = execSync('ps -axo pid=,pgid=,rss=', { encoding: 'utf-8' });
      const pgid = String(pid);
      return out.trim().split('\n')
        .reduce((sum, line) => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3 && parts[1] === pgid) {
            return sum + (parseInt(parts[2], 10) || 0);
          }
          return sum;
        }, 0);
    }
  } catch {
    return 0;
  }
}

/**
 * Start a process and measure cold start time + peak RSS.
 */
async function startAndMeasure(cmd, cmdArgs, cwd, url, env = {}) {
  let peakRssKb = 0;

  const proc = spawn(cmd, cmdArgs, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, ...env },
  });

  let output = '';
  proc.stdout?.on('data', (d) => (output += d.toString()));
  proc.stderr?.on('data', (d) => (output += d.toString()));

  const rssInterval = setInterval(() => {
    const rss = getGroupRssKb(proc.pid);
    if (rss > peakRssKb) peakRssKb = rss;
  }, 200);

  try {
    const coldStartMs = await waitForServer(url, 60000);
    clearInterval(rssInterval);

    const rss = getGroupRssKb(proc.pid);
    if (rss > peakRssKb) peakRssKb = rss;

    return { coldStartMs, peakRssKb, process: proc, output };
  } catch (err) {
    clearInterval(rssInterval);
    kill(proc);
    console.error('Server output:', output);
    throw err;
  }
}

function kill(proc) {
  if (!proc || proc.killed) return;
  try {
    process.kill(-proc.pid, 'SIGKILL');
  } catch {}
}

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMs(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function fmtSpeedup(baseline, value) {
  if (!baseline || !value) return 'N/A';
  const ratio = baseline / value;
  if (ratio > 1) return `**${ratio.toFixed(1)}x faster**`;
  if (ratio < 1) return `**${(1 / ratio).toFixed(1)}x slower**`;
  return 'same';
}

function fmtSizeReduction(baseline, value) {
  if (!baseline || !value) return 'N/A';
  const pct = Math.round((1 - value / baseline) * 100);
  if (pct > 0) return `**${pct}% smaller**`;
  if (pct < 0) return `**${Math.abs(pct)}% larger**`;
  return 'same';
}

const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const stddev = (arr) => {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
};

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const vinextDir = join(__dirname, 'vinext');
  const vertzDir = join(__dirname, 'vertz');

  // Vertz CLI path
  const vertzCli = join(vertzDir, 'node_modules', '@vertz', 'cli', 'dist', 'vertz.js');

  if (!existsSync(vertzCli)) {
    console.error('Error: Vertz CLI not found. Run `bash benchmarks/setup.sh` first.');
    process.exit(1);
  }
  if (!existsSync(join(vinextDir, 'node_modules'))) {
    console.error('Error: vinext node_modules not found. Run `bash benchmarks/setup.sh` first.');
    process.exit(1);
  }

  const results = {
    timestamp: new Date().toISOString(),
    gitHash: getGitHash(),
    buildRuns: RUNS,
    devRuns: DEV_RUNS,
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpus: (await import('node:os')).cpus().length,
    },
    vinext: {},
    vertz: {},
  };

  // Detect versions
  try {
    const vitePkg = JSON.parse(readFileSync(join(vinextDir, 'node_modules', 'vite', 'package.json'), 'utf-8'));
    results.system.viteVersion = vitePkg.version;
  } catch {}
  try {
    const vinextPkg = JSON.parse(readFileSync(join(vinextDir, 'node_modules', 'vinext', 'package.json'), 'utf-8'));
    results.system.vinextVersion = vinextPkg.version;
  } catch {}
  results.system.bunVersion = exec('bun --version').trim();

  // ─── 1. Production Build Time ──────────────────────────────────────────────
  if (!SKIP_BUILD) {
    console.log('\n=== Production Build Time ===\n');

    // Clean
    exec('rm -rf dist', { cwd: vinextDir });
    exec('rm -rf dist', { cwd: vertzDir });

    // Warmup (1 run each, not measured)
    console.log('  Warmup: vinext build...');
    exec(`cd ${vinextDir} && ./node_modules/.bin/vite build`, { timeout: 120000 });
    exec('rm -rf dist', { cwd: vinextDir });

    console.log('  Warmup: Vertz build...');
    exec(`cd ${vertzDir} && bun ${vertzCli} build --no-typecheck`, { timeout: 120000 });
    exec('rm -rf dist', { cwd: vertzDir });

    // Measured runs
    console.log(`\n  Running ${RUNS} build iterations...\n`);

    function parseHyperfineResult(r) {
      return {
        mean: r.mean * 1000,
        stddev: r.stddev * 1000,
        min: r.min * 1000,
        max: r.max * 1000,
      };
    }

    try {
      // Try hyperfine with --shuffle
      // Vite 7 uses positional [root] arg, but cwd-based execution is cleaner.
      // Each command cd's into its project directory for correct config resolution.
      const cmds = [
        `--command-name vinext 'rm -rf ${vinextDir}/dist && cd ${vinextDir} && ./node_modules/.bin/vite build'`,
        `--command-name vertz 'rm -rf ${vertzDir}/dist && cd ${vertzDir} && bun ${vertzCli} build --no-typecheck'`,
      ];

      console.log('  Timing builds with hyperfine (shuffled)...');
      const hfJson = exec(
        `hyperfine --runs ${RUNS} --shuffle ${cmds.join(' ')} --export-json /dev/stdout 2>/dev/null`,
        { cwd: __dirname, timeout: 600000 }
      );
      const hf = JSON.parse(hfJson);

      for (const r of hf.results) {
        if (r.command.includes('vite build')) {
          results.vinext.buildTime = parseHyperfineResult(r);
        } else if (r.command.includes('vertz')) {
          results.vertz.buildTime = parseHyperfineResult(r);
        }
      }
      results.buildMethodology = 'hyperfine --shuffle (randomized)';
    } catch {
      // Fallback: manual timing with randomized order
      console.log('  hyperfine not available, using manual timing...');
      const buildTimes = { vinext: [], vertz: [] };

      const buildRunners = [
        {
          key: 'vinext',
          run: () => {
            exec('rm -rf dist', { cwd: vinextDir });
            const start = performance.now();
            exec(`cd ${vinextDir} && ./node_modules/.bin/vite build`, { timeout: 120000 });
            buildTimes.vinext.push(performance.now() - start);
          },
        },
        {
          key: 'vertz',
          run: () => {
            exec('rm -rf dist', { cwd: vertzDir });
            const start = performance.now();
            exec(`cd ${vertzDir} && bun ${vertzCli} build --no-typecheck`, { timeout: 120000 });
            buildTimes.vertz.push(performance.now() - start);
          },
        },
      ];

      const buildRunOrders = [];
      for (let i = 0; i < RUNS; i++) {
        const order = shuffle(buildRunners);
        buildRunOrders.push(order.map((r) => r.key));
        console.log(`  Run ${i + 1}/${RUNS} (order: ${order.map((r) => r.key).join(' → ')})...`);
        for (const runner of order) runner.run();
      }

      results.vinext.buildTime = {
        mean: avg(buildTimes.vinext),
        stddev: stddev(buildTimes.vinext),
        min: Math.min(...buildTimes.vinext),
        max: Math.max(...buildTimes.vinext),
      };
      results.vertz.buildTime = {
        mean: avg(buildTimes.vertz),
        stddev: stddev(buildTimes.vertz),
        min: Math.min(...buildTimes.vertz),
        max: Math.max(...buildTimes.vertz),
      };
      results.buildMethodology = 'manual timing (randomized)';
      results.buildRunOrders = buildRunOrders;
    }

    // ─── 2. Bundle Size ────────────────────────────────────────────────────────
    console.log('\n=== Production Bundle Size ===\n');

    // Rebuild both for clean measurement
    exec('rm -rf dist', { cwd: vinextDir });
    exec(`cd ${vinextDir} && ./node_modules/.bin/vite build`, { timeout: 120000 });

    exec('rm -rf dist', { cwd: vertzDir });
    exec(`cd ${vertzDir} && bun ${vertzCli} build --no-typecheck`, { timeout: 120000 });

    // vinext: client bundles in dist/client/
    const vnSize = bundleSize(join(vinextDir, 'dist', 'client'));
    results.vinext.bundleSize = vnSize;
    console.log(`  vinext: ${vnSize.files} files, ${formatBytes(vnSize.raw)} raw, ${formatBytes(vnSize.gzip)} gzip`);

    // Vertz: client bundles in dist/client/ (includes assets/ subdirectory)
    const vzSize = bundleSize(join(vertzDir, 'dist', 'client'));
    results.vertz.bundleSize = vzSize;
    console.log(`  Vertz:  ${vzSize.files} files, ${formatBytes(vzSize.raw)} raw, ${formatBytes(vzSize.gzip)} gzip`);
  }

  // ─── 3. Dev Server Cold Start ──────────────────────────────────────────────
  if (!SKIP_DEV) {
    console.log('\n=== Dev Server Cold Start ===\n');

    const devResults = { vinext: [], vertz: [] };

    const runners = [
      {
        key: 'vinext',
        label: 'vinext',
        run: async () => {
          exec('rm -rf node_modules/.vite', { cwd: vinextDir });
          return startAndMeasure(
            join(vinextDir, 'node_modules', '.bin', 'vite'), ['--port', '4200'],
            vinextDir, 'http://localhost:4200',
            { PORT: '4200' }
          );
        },
      },
      {
        key: 'vertz',
        label: 'Vertz',
        run: async () => {
          exec('rm -rf .vertz', { cwd: vertzDir });
          return startAndMeasure(
            'bun', [vertzCli, 'dev', '--port', '4201'],
            vertzDir, 'http://localhost:4201'
          );
        },
      },
    ];

    const runOrders = [];

    for (let i = 0; i < DEV_RUNS; i++) {
      const order = shuffle(runners);
      const orderLabels = order.map((r) => r.label);
      runOrders.push(orderLabels);
      console.log(`  Run ${i + 1}/${DEV_RUNS} (order: ${orderLabels.join(' → ')})...`);

      for (const runner of order) {
        console.log(`    Starting ${runner.label} dev server...`);
        const result = await runner.run();
        devResults[runner.key].push({
          coldStartMs: result.coldStartMs,
          peakRssKb: result.peakRssKb,
        });
        console.log(`    ${runner.label}: ${formatMs(result.coldStartMs)}, ${Math.round(result.peakRssKb / 1024)} MB RSS`);
        kill(result.process);
        await new Promise((r) => setTimeout(r, 2000)); // cooldown
      }
    }

    results.vinext.devColdStart = {
      meanMs: avg(devResults.vinext.map((r) => r.coldStartMs)),
      meanRssKb: avg(devResults.vinext.map((r) => r.peakRssKb)),
      runs: devResults.vinext,
    };
    results.vertz.devColdStart = {
      meanMs: avg(devResults.vertz.map((r) => r.coldStartMs)),
      meanRssKb: avg(devResults.vertz.map((r) => r.peakRssKb)),
      runs: devResults.vertz,
    };
    results.devRunOrders = runOrders;
  }

  // ─── Output Results ──────────────────────────────────────────────────────────
  console.log('\n=== Results ===\n');

  const jsonFile = join(RESULTS_DIR, `bench-${results.gitHash}-${Date.now()}.json`);
  writeFileSync(jsonFile, JSON.stringify(results, null, 2));
  console.log(`  JSON: ${jsonFile}\n`);

  // Generate markdown
  let md = `# vinext vs Vertz — Benchmark Results\n\n`;
  md += `- **Date**: ${results.timestamp}\n`;
  md += `- **Git**: ${results.gitHash}\n`;
  md += `- **Node**: ${results.system.nodeVersion}\n`;
  md += `- **Bun**: ${results.system.bunVersion}\n`;
  md += `- **CPUs**: ${results.system.cpus}\n`;
  md += `- **Build runs**: ${results.buildRuns}\n`;
  md += `- **Dev cold start runs**: ${results.devRuns}\n`;
  if (results.system.viteVersion) md += `- **Vite**: ${results.system.viteVersion}\n`;
  if (results.system.vinextVersion) md += `- **vinext**: ${results.system.vinextVersion}\n`;
  md += '\n';

  md += `> **Methodology:** Build and dev cold start runs are executed in randomized order to eliminate positional bias from filesystem caches, CPU thermal state, and residual process state. `;
  md += `Build methodology: ${results.buildMethodology || 'N/A'}.\n\n`;

  md += `> **Note:** Vertz build uses \`--no-typecheck\` so that build timings measure bundler/compilation speed only. Vite does not type-check during build.\n\n`;

  // Build time table
  if (results.vinext.buildTime && results.vertz.buildTime) {
    md += `## Production Build Time\n\n`;
    md += `| Framework | Mean | StdDev | Min | Max | vs vinext |\n`;
    md += `|-----------|------|--------|-----|-----|----------|\n`;
    md += `| vinext (Vite) | ${formatMs(results.vinext.buildTime.mean)} | ±${formatMs(results.vinext.buildTime.stddev)} | ${formatMs(results.vinext.buildTime.min)} | ${formatMs(results.vinext.buildTime.max)} | baseline |\n`;
    md += `| Vertz (Bun.build) | ${formatMs(results.vertz.buildTime.mean)} | ±${formatMs(results.vertz.buildTime.stddev)} | ${formatMs(results.vertz.buildTime.min)} | ${formatMs(results.vertz.buildTime.max)} | ${fmtSpeedup(results.vinext.buildTime.mean, results.vertz.buildTime.mean)} |\n`;
    md += '\n';
  }

  // Bundle size table
  if (results.vinext.bundleSize && results.vertz.bundleSize) {
    md += `## Production Bundle Size (Client)\n\n`;
    md += `| Framework | Files | Raw | Gzipped | vs vinext (gzip) |\n`;
    md += `|-----------|-------|-----|----------|------------------|\n`;
    md += `| vinext | ${results.vinext.bundleSize.files} | ${formatBytes(results.vinext.bundleSize.raw)} | ${formatBytes(results.vinext.bundleSize.gzip)} | baseline |\n`;
    md += `| Vertz | ${results.vertz.bundleSize.files} | ${formatBytes(results.vertz.bundleSize.raw)} | ${formatBytes(results.vertz.bundleSize.gzip)} | ${fmtSizeReduction(results.vinext.bundleSize.gzip, results.vertz.bundleSize.gzip)} |\n`;
    md += '\n';
  }

  // Dev cold start table
  if (results.vinext.devColdStart && results.vertz.devColdStart) {
    md += `## Dev Server Cold Start\n\n`;
    md += `| Framework | Mean Cold Start | Mean Peak RSS | vs vinext |\n`;
    md += `|-----------|----------------|----------------|----------|\n`;
    md += `| vinext (Vite) | ${formatMs(results.vinext.devColdStart.meanMs)} | ${Math.round(results.vinext.devColdStart.meanRssKb / 1024)} MB | baseline |\n`;
    md += `| Vertz (Bun) | ${formatMs(results.vertz.devColdStart.meanMs)} | ${Math.round(results.vertz.devColdStart.meanRssKb / 1024)} MB | ${fmtSpeedup(results.vinext.devColdStart.meanMs, results.vertz.devColdStart.meanMs)} |\n`;
    md += '\n';
  }

  // SSR non-goal
  md += `## SSR Throughput\n\n`;
  md += `Not measured in v1. vinext's production SSR server is not yet wired for benchmarking. This will be added in a future iteration.\n\n`;

  // Framework differences
  md += `## Framework Differences\n\n`;
  md += `These benchmarks compare two fundamentally different approaches. Key differences to consider:\n\n`;
  md += `- **Reactivity**: Vertz uses signals-based reactivity (compiler-transformed \`let\` → signals); vinext uses React (hooks, virtual DOM)\n`;
  md += `- **Bundler**: Vertz uses \`Bun.build()\`; vinext uses Vite (Rollup)\n`;
  md += `- **Routing**: Vertz uses code-based routing (\`defineRoutes()\`); vinext uses file-based routing (Next.js convention)\n`;
  md += `- **Styling**: Vertz uses \`css()\` for scoped atomic styles (generates CSS at build time); vinext uses inline React styles\n`;
  md += `- **Code volume**: Both apps have 31 page components, 3 reactive components, and 4 layouts. Vertz source is ~64% larger due to explicit \`css()\` style definitions and layout wrapper imports — this exercises the Vertz CSS pipeline but makes raw bundle size comparison less direct.\n`;
  md += `- **No API routes**: Neither benchmark app includes API routes — this measures UI build pipeline only\n`;

  const mdFile = join(RESULTS_DIR, `bench-${results.gitHash}-${Date.now()}.md`);
  writeFileSync(mdFile, md);
  console.log(`  Markdown: ${mdFile}\n`);
  console.log(md);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
