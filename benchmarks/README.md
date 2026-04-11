# vinext vs Vertz — Benchmark Suite

Compares [vinext](https://github.com/nicolo-ribaudo/vinext) (Cloudflare's Vite-based Next.js alternative) against Vertz on production build time, client bundle size, and dev server cold start.

## Quick Start

```bash
# 1. Setup (builds monorepo, generates apps, installs vinext deps)
bash benchmarks/setup.sh

# 2. Run benchmarks (quick validation)
node benchmarks/run.mjs --runs=2 --dev-runs=3

# 3. Full benchmark
node benchmarks/run.mjs --runs=5 --dev-runs=10
```

## Prerequisites

- **vtz** (monorepo runtime)
- **Node.js 22+** (benchmark harness, vinext dev server)
- **npm** (vinext dependency isolation)
- **hyperfine** (optional — falls back to manual timing if not installed)

## What's Measured

| Metric | vinext | Vertz |
|--------|--------|-------|
| **Production Build Time** | `vite build` | `vtz build --no-typecheck` |
| **Client Bundle Size** | `dist/client/` JS+CSS (raw + gzip) | `dist/client/` JS+CSS (raw + gzip) |
| **Dev Cold Start** | `vite dev` → HTTP 200 + peak RSS | `vtz dev` → HTTP 200 + peak RSS |

### Not Measured (v1)

- **SSR throughput** — vinext's production SSR server is not yet wired for benchmarking
- **HMR speed** — measuring hot module replacement latency requires browser automation; deferred to v2

## Methodology

- **Randomized ordering**: Build and dev runs are interleaved in random order to eliminate positional bias from filesystem caches, CPU thermal state, and residual process state
- **Warmup runs**: 1 warmup build per framework before measured runs (not counted)
- **Clean builds**: `rm -rf dist/` before each build run
- **Type checking disabled**: Vertz uses `--no-typecheck`; Vite does not type-check during build
- **Same machine, same session**: Both frameworks measured back-to-back for fair comparison

## Benchmark Apps

Both apps are generated deterministically from the same seeded PRNG (mulberry32, seed 42):

- **31 page components** (home, about, 3 products, 3 blog, 5 dashboard, 2 docs, 4 settings, 15 static)
- **3 reactive components** (counter, timer, search)
- **4 layout wrappers** (products, blog, dashboard, settings)
- **No API routes** — UI build pipeline only

## Framework Differences (Fairness Caveats)

These benchmarks compare two fundamentally different frameworks:

| Aspect | vinext | Vertz |
|--------|--------|-------|
| Reactivity | React (hooks, virtual DOM) | Signals (compiler-transformed `let`) |
| Bundler | Vite (Rollup) | vtz build |
| Routing | File-based (Next.js convention) | Code-based (`defineRoutes()`) |
| Styling | Inline React styles | `css()` scoped atomic styles |
| Code volume | ~17 KB source | ~28 KB source |

The Vertz app is ~64% larger in source code because it uses explicit `css()` style definitions and layout wrapper imports. This exercises the Vertz CSS pipeline but means raw bundle size comparison is not apples-to-apples on source input volume.

## CLI Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--runs=N` | 5 | Number of production build iterations |
| `--dev-runs=N` | 10 | Number of dev cold start iterations |
| `--skip-build` | false | Skip production build time & bundle size |
| `--skip-dev` | false | Skip dev server cold start |

## Output

Results are saved to `benchmarks/results/`:
- `bench-<hash>-<timestamp>.json` — raw data
- `bench-<hash>-<timestamp>.md` — formatted comparison tables

## Directory Structure

```
benchmarks/
├── run.mjs                # Unified benchmark harness
├── generate-app.mjs       # Generates both benchmark apps
├── setup.sh               # One-time setup
├── README.md              # This file
├── results/               # Output (gitignored)
├── vinext/                # vinext project (npm-managed, outside vtz workspace)
│   ├── package.json
│   ├── vite.config.ts
│   └── app/               # Generated React/RSC pages
└── vertz/                 # Vertz project (vtz workspace member)
    ├── package.json
    ├── tsconfig.json
    ├── index.html
    └── src/               # Generated Vertz pages
```

## E2E Tests (Vertz)

The Vertz benchmark app has Playwright e2e tests that validate SSR, hydration, client-side navigation, and component reactivity.

### Prerequisites

The benchmark app source is **generated** — it does not exist by default. You must generate it before running e2e tests:

```bash
# 1. Generate the benchmark app (creates benchmarks/vertz/src/)
node benchmarks/generate-app.mjs

# 2. Run e2e tests
cd benchmarks/vertz
npx playwright test

# Or run headed (with browser visible)
npx playwright test --headed
```

If `src/` doesn't exist or is stale, the dev server will fail with "no app entry found". Always re-generate after changes to `generate-app.mjs`.

### Test Suites

| File | What it tests |
|------|---------------|
| `ssr.spec.ts` | Pre-rendered HTML contains expected content, theme CSS |
| `hydration.spec.ts` | Dashboard stat cards render correctly, counter works after hydration |
| `navigation.spec.ts` | Client-side nav (top nav + sidebar) without full page reloads |
| `counter.spec.ts` | Counter components increment on click |
| `timer.spec.ts` | Timer auto-increments in sidebar |
| `search.spec.ts` | Search input shows/hides hint text |
| `route-smoke.spec.ts` | All 31 routes respond with 200 |

## Notes

- The `vinext/` directory uses **npm** (not vtz) intentionally to avoid workspace resolution conflicts. Never run `vtz install` inside `benchmarks/vinext/`.
- vinext is pinned to a specific npm version in `vinext/package.json`. Record the git hash of the vinext repo if using a local build.
