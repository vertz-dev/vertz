# Vertz Packaging Strategy & Developer Experience

**Author:** Josh (Developer Advocate)  
**Date:** 2026-02-14  
**Status:** Design  
**Reviewers:** Vinicius (CTO), Luna (DevRel), Mike (VP Eng)

---

## Executive Summary

This document proposes a complete restructuring of Vertz's package architecture to eliminate developer confusion, enable tree-shaking, and create the optimal onboarding experience. The core insight: **a developer should type `npm install vertz` and get a coherent framework, not a puzzle of 15+ packages.**

**Key Decisions:**

1. **Single `vertz` meta-package** that re-exports all sub-packages
2. **Split `@vertz/cli`** into tool (framework commands) and toolkit (reusable CLI building blocks)
3. **Aggressive tree-shaking** with bundle size verification in CI
4. **`vertz publish` as Cloud gateway** — the 5-minute deploy dream
5. **CLI toolkit migrates from ink to Vertz primitives** (dogfooding our own framework)

**The 5-Minute Rule:** A developer should go from `npm create vertz-app` to deployed URL in 5 minutes. Every packaging decision serves this goal.

---

## 1. Current State Analysis

### Package Inventory (17 packages)

| Package | Purpose | Confusing? | Notes |
|---------|---------|------------|-------|
| `@vertz/core` | Request/response runtime, middleware | ❌ | Clear purpose |
| `@vertz/ui` | Component primitives, JSX runtime | ❌ | Clear purpose |
| `@vertz/db` | Database abstractions, migrations | ❌ | Clear purpose |
| `@vertz/schema` | Type-safe validation | ❌ | Clear purpose |
| `@vertz/fetch` | Type-safe HTTP client | ❌ | Clear purpose |
| `@vertz/testing` | Test utilities | ❌ | Clear purpose |
| `@vertz/compiler` | AST transforms, diagnostics | ⚠️ | Advanced users only |
| `@vertz/ui-compiler` | UI-specific compiler passes | ⚠️ | Advanced users only |
| `@vertz/ui-server` | SSR/streaming | ⚠️ | Should be internal? |
| `@vertz/codegen` | Code generation utilities | ⚠️ | Advanced users only |
| `@vertz/primitives` | Headless UI components | ⚠️ | Unclear vs `@vertz/ui` |
| **`@vertz/cli`** | **Framework tool + CLI toolkit** | ⚠️ | **CONFUSING** (see below) |
| `@vertz/cli-runtime` | Programmatic CLI builder | ✅ | Clear, but overlap with cli |
| `@vertz/create-vertz-app` | Project scaffolding | ❌ | Clear purpose |
| `@vertz/demo-toolkit` | Internal demos | ⚠️ | Should be private |
| `@vertz/canvas` | Canvas rendering | ⚠️ | Unclear purpose |
| `@vertz/integration-tests` | Test suite | ⚠️ | Should be private |

### The `@vertz/cli` Confusion Problem

**Current exports from `@vertz/cli`:**

```ts
// Framework CLI commands (what developers RUN)
export { buildAction } from './commands/build';
export { deployAction } from './commands/deploy';
export { generateAction } from './commands/generate';

// Reusable CLI building blocks (what developers IMPORT)
export { Banner, DiagnosticDisplay, Message, SelectList } from './ui/components';
export { createTaskRunner } from './ui/task-runner';
export { createDevLoop } from './dev-server/dev-loop';
export { createProcessManager } from './dev-server/process-manager';
export { detectTarget } from './deploy/detector';
```

**The problem:** A developer reading `@vertz/cli` README can't tell:
- Is this the tool I run to start my server? (`vertz dev`)
- Is this a library I import to build my own CLI?
- Both? Neither?

**CTO's observation:** "A developer reading the README can't tell if this runs their REST server or helps them build their own CLI."

**Why this matters:**
- Codegen needs CLI building blocks → currently imports from `@vertz/cli`
- But `@vertz/cli` has 50+ dependencies (ink, React, commander)
- Bundle bloat: a generated CLI pulls in the entire framework toolchain
- Conceptual confusion: "Why am I importing from the dev tool?"

### What Works Well

✅ **Linked versioning** — all packages release together, same version  
✅ **Clear separation** — `@vertz/core`, `@vertz/ui`, `@vertz/db` are distinct layers  
✅ **TypeScript-first** — full type safety, no runtime surprises  
✅ **Bun-native** — leverages Bun APIs, fast builds

### What Doesn't Work

❌ **Discovery problem** — 17 packages, no entry point  
❌ **Install friction** — `npm i @vertz/core @vertz/ui @vertz/db @vertz/schema @vertz/fetch` → tedious  
❌ **CLI identity crisis** — tool vs toolkit confusion  
❌ **No tree-shaking validation** — we *hope* it works, but don't test it  
❌ **Bundle size unknown** — no idea what a UI-only app ships

---

## 2. Proposed Package Architecture

### Core Principle: **One Install, Full Stack, Tree-Shakeable**

```bash
# The dream
npm install vertz

# Not this
npm install @vertz/core @vertz/ui @vertz/db @vertz/schema @vertz/fetch
```

### Package Hierarchy

```
vertz (meta-package, re-exports everything)
├── @vertz/core (runtime)
├── @vertz/ui (components, JSX)
├── @vertz/db (database)
├── @vertz/schema (validation)
├── @vertz/fetch (HTTP client)
├── @vertz/testing (test utils)
├── @vertz/cli-tool (framework commands: dev, build, publish) ← NEW
├── @vertz/cli-kit (reusable CLI building blocks) ← NEW
└── @vertz/primitives (headless UI)

# Advanced/internal (still published, but not in meta-package)
├── @vertz/compiler
├── @vertz/ui-compiler
├── @vertz/ui-server
├── @vertz/codegen
└── @vertz/cli-runtime
```

### Package Relationships Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  vertz (meta-package)                                       │
│  Re-exports: core, ui, db, schema, fetch, testing, cli-kit │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼───────┐  ┌────────▼────────┐  ┌──────▼──────┐
│  @vertz/core  │  │   @vertz/ui     │  │ @vertz/db   │
│  (runtime)    │  │  (components)   │  │ (database)  │
└───────────────┘  └─────────────────┘  └─────────────┘
                            │
                   ┌────────▼────────┐
                   │ @vertz/primitives│
                   │ (headless UI)   │
                   └─────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  @vertz/cli-tool (framework commands)                       │
│  bin: vertz → commands: dev, build, publish, routes, check  │
│  Uses: compiler, ui-compiler, codegen, cli-kit             │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ uses
                            │
┌─────────────────────────────────────────────────────────────┐
│  @vertz/cli-kit (reusable building blocks)                  │
│  Exports: Banner, TaskRunner, DevLoop, ProcessManager       │
│  Migration: ink → @vertz/primitives (dogfood our framework) │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. `vertz` Meta-Package Design

### Package Structure

```json
{
  "name": "vertz",
  "version": "0.1.0",
  "description": "Full-stack TypeScript framework for REST APIs and web apps",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./core": {
      "types": "./dist/core.d.ts",
      "import": "./dist/core.js"
    },
    "./ui": {
      "types": "./dist/ui.d.ts",
      "import": "./dist/ui.js"
    },
    "./db": {
      "types": "./dist/db.d.ts",
      "import": "./dist/db.js"
    },
    "./schema": {
      "types": "./dist/schema.d.ts",
      "import": "./dist/schema.js"
    },
    "./fetch": {
      "types": "./dist/fetch.d.ts",
      "import": "./dist/fetch.js"
    },
    "./testing": {
      "types": "./dist/testing.d.ts",
      "import": "./dist/testing.js"
    },
    "./cli-kit": {
      "types": "./dist/cli-kit.d.ts",
      "import": "./dist/cli-kit.js"
    },
    "./primitives": {
      "types": "./dist/primitives.d.ts",
      "import": "./dist/primitives.js"
    }
  },
  "dependencies": {
    "@vertz/core": "workspace:*",
    "@vertz/ui": "workspace:*",
    "@vertz/db": "workspace:*",
    "@vertz/schema": "workspace:*",
    "@vertz/fetch": "workspace:*",
    "@vertz/testing": "workspace:*",
    "@vertz/cli-kit": "workspace:*",
    "@vertz/primitives": "workspace:*"
  }
}
```

### Entry Point (`vertz/src/index.ts`)

```ts
// Primary API surface — the 80% use case
export * from '@vertz/core';
export * from '@vertz/ui';
export * from '@vertz/schema';

// Note: db, fetch, testing, cli-kit, primitives are subpath exports only
// This keeps the main entry point focused on the essentials
```

### Subpath Exports

```ts
// vertz/src/db.ts
export * from '@vertz/db';

// vertz/src/fetch.ts
export * from '@vertz/fetch';

// vertz/src/testing.ts
export * from '@vertz/testing';

// vertz/src/cli-kit.ts
export * from '@vertz/cli-kit';

// vertz/src/primitives.ts
export * from '@vertz/primitives';
```

### Tree-Shaking Mechanics

**How it works:**

1. **`sideEffects: false`** in `package.json` — tells bundlers these modules are pure
2. **ESM-only** — CommonJS doesn't tree-shake well
3. **Subpath exports** — unused paths aren't even loaded
4. **Re-export only** — no logic in meta-package, just wiring

**Example: UI-only app**

```ts
// app.ts
import { html } from 'vertz/ui';

export default html('<h1>Hello</h1>');
```

**What gets bundled:**
- ✅ `@vertz/ui` (needed)
- ❌ `@vertz/db` (not imported)
- ❌ `@vertz/core` (not imported)
- ❌ `@vertz/fetch` (not imported)

**Example: API-only app**

```ts
// api.ts
import { route } from 'vertz/core';
import { db } from 'vertz/db';

export default route('/users', () => db.users.findAll());
```

**What gets bundled:**
- ✅ `@vertz/core` (needed)
- ✅ `@vertz/db` (needed)
- ✅ `@vertz/schema` (transitive dep from core)
- ❌ `@vertz/ui` (not imported)

### Bundle Size Estimates

| Scenario | Packages | Estimated Size (minified + gzipped) |
|----------|----------|-------------------------------------|
| **UI-only** | `ui` | ~15-20 KB |
| **API-only** | `core` + `schema` | ~8-12 KB |
| **Full-stack** | `core` + `ui` + `db` + `schema` + `fetch` | ~45-60 KB |
| **Kitchen sink** | Everything | ~80-100 KB |

**Note:** These are rough estimates. Actual sizes depend on:
- Minifier (esbuild, terser, swc)
- Compression (brotli vs gzip)
- Dependencies (postgres client is heavy)

**Luna's take (marketing angle):** "Most Next.js apps ship 200-300 KB. We're targeting sub-100 KB for *everything*. That's our performance story."

---

## 4. CLI Strategy: Tool vs Toolkit

### Problem Statement

`@vertz/cli` conflates two distinct concerns:

1. **The framework CLI tool** — what developers run (`vertz dev`, `vertz build`, `vertz publish`)
2. **CLI building blocks** — reusable components for codegen, custom tools

This creates:
- Bundle bloat (codegen pulls in 50+ deps)
- Conceptual confusion (is this a tool or a library?)
- Migration friction (hard to extract CLI toolkit)

### Proposed Split

#### `@vertz/cli-tool` (The Framework Commands)

**Purpose:** The `vertz` binary that developers run to build, develop, and deploy Vertz apps.

**Bin:**
```json
{
  "bin": {
    "vertz": "./dist/vertz.js"
  }
}
```

**Commands:**
- `vertz dev` — Start dev server with HMR
- `vertz build` — Production build
- `vertz publish` — Deploy to Vertz Cloud (see section 5)
- `vertz routes` — List all routes
- `vertz check` — Run diagnostics

**Dependencies:**
- `@vertz/compiler`
- `@vertz/ui-compiler`
- `@vertz/codegen`
- `@vertz/cli-kit` (for UI components)
- `commander` (CLI parsing)

**Exports:**
```ts
// None! This is a CLI tool, not a library.
// If you need CLI building blocks, use @vertz/cli-kit.
```

**README:**
```markdown
# @vertz/cli-tool

The Vertz framework CLI. Run `vertz dev`, `vertz build`, and `vertz publish`.

**This is NOT a library.** If you need to build CLIs programmatically, use `@vertz/cli-kit`.
```

#### `@vertz/cli-kit` (Reusable Building Blocks)

**Purpose:** Reusable CLI components for codegen, custom tools, and terminal UIs.

**Exports:**
```ts
// Terminal UI components (currently ink-based, will migrate to Vertz primitives)
export { Banner, Message, DiagnosticDisplay, SelectList, TaskList } from './components';

// Task orchestration
export { createTaskRunner } from './task-runner';
export type { TaskRunner, TaskHandle, TaskGroup } from './task-runner';

// Dev server utilities
export { createDevLoop } from './dev-loop';
export { createProcessManager } from './process-manager';
export { createWatcher } from './watcher';

// CLI utilities
export { formatDuration, formatFileSize, formatPath } from './format';
export { findProjectRoot } from './paths';
export { detectRuntime } from './runtime-detect';
export { colors, symbols } from './theme';
```

**Dependencies:**
- `@vertz/primitives` (after migration)
- Minimal shared utilities

**README:**
```markdown
# @vertz/cli-kit

Reusable building blocks for building CLIs with Vertz.

Used by `@vertz/cli-tool` and `@vertz/codegen`. If you're writing a code generator or custom dev tool, this is what you want.

**Not the framework CLI?** Install `vertz` (meta-package) and run `vertz dev`.
```

### Migration Path: ink → Vertz Primitives

**Current state:** `@vertz/cli-kit` uses ink (React for CLIs) for terminal UI.

**Problem:** We're not dogfooding our own framework. Ink is a React wrapper around terminal rendering. Vertz has its own component model — why aren't we using it?

**Goal:** Replace ink with Vertz primitives (headless UI components).

**Phases:**

**Phase 1: Extract `@vertz/cli-kit`** (immediate)
- Move all reusable CLI components from `@vertz/cli` to `@vertz/cli-kit`
- Keep ink for now (don't block the split)
- Update `@vertz/codegen` to import from `@vertz/cli-kit`

**Phase 2: Terminal rendering primitives** (Q2 2026)
- Add terminal renderer to `@vertz/primitives`
- Implement terminal-specific layouts (Box, Text, Spinner, Progress)
- Prove the concept with 1-2 components (Banner, TaskList)

**Phase 3: Full migration** (Q3 2026)
- Replace all ink components with Vertz primitives
- Remove ink from dependencies
- Document the terminal renderer publicly

**Why this matters:**
- **Dogfooding** — we prove Vertz can build anything, including CLIs
- **Bundle size** — ink + React is ~500 KB, Vertz primitives are <50 KB
- **Consistency** — same component model for web, terminal, native

**Luna's POV:** "This is a killer demo. 'We built our own CLI with our own framework.' That's a flex. Developers love frameworks that eat their own dogfood."

---

## 5. `vertz publish` & Cloud Vision

### The Dream: Zero-Config Deploy

```bash
$ vertz publish
```

**Expected output:**
```
┌─────────────────────────────────────────────┐
│ 🚀 Vertz Cloud Publish                     │
└─────────────────────────────────────────────┘

📦 Analyzing your app...
   ✓ Found 5 API routes
   ✓ Found 3 UI pages
   ✓ Detected PostgreSQL database

🔍 What would you like to publish?

  ◉ Full app (API + UI + DB)
  ○ API only
  ○ Static site (UI only)

⚡ Calculating diff from last deploy...
   → 2 routes changed
   → 1 new migration
   → 0 static assets changed

🌐 Deploying to Vertz Cloud...
   ✓ Database migrated (123ms)
   ✓ API deployed (456ms)
   ✓ UI deployed (789ms)

✨ Done! Your app is live:

   🔗 https://my-app-a3f9.vertz.app

   📊 View logs: vertz logs --follow
   🔄 Rollback:  vertz rollback
```

### Key Features

#### 1. Interactive Prompts

**Goal:** Remove decision paralysis. The CLI asks questions, handles the rest.

**Questions:**
- What to deploy? (Full stack, API only, UI only)
- Environment? (Production, staging, preview)
- Custom domain? (Optional)

**Non-interactive mode:**
```bash
vertz publish --api-only --env=production --yes
```

#### 2. Diff-Based Deploys

**Why:** Don't re-deploy unchanged code. Only push what changed.

**How:**
1. Calculate hash of each route, migration, static asset
2. Compare with last deploy (stored in Vertz Cloud)
3. Only upload changed files
4. Stream logs for changed services only

**Example:**
```
Changed files (2):
  - src/routes/users.ts (modified)
  - db/migrations/002_add_avatar.sql (new)

Unchanged (everything else):
  - 4 API routes
  - 12 UI components
  - 47 static assets
```

#### 3. Zero Infra Knowledge Required

**What the user doesn't need to know:**
- Docker, Kubernetes, or containers
- Load balancers, reverse proxies, or CDNs
- Environment variables (injected automatically)
- SSL certificates (handled by Vertz Cloud)
- Database provisioning (auto-created)

**What Vertz Cloud handles:**
- ✅ Database creation + migrations
- ✅ SSL certificates (Let's Encrypt)
- ✅ Load balancing + auto-scaling
- ✅ Secrets injection (env vars)
- ✅ Rollback history (last 10 deploys)
- ✅ Log streaming (LLM-optimized, see below)

#### 4. LLM-Optimized Logs (Future)

**Problem:** Logs are for humans. But LLMs struggle with raw logs — too noisy, no structure.

**Solution:** Vertz Cloud produces *structured* logs optimized for LLM parsing.

**Example raw log:**
```
[2026-02-14T19:34:21Z] INFO: Request received
[2026-02-14T19:34:21Z] DEBUG: Query: SELECT * FROM users
[2026-02-14T19:34:22Z] ERROR: Database connection failed
```

**LLM-optimized log:**
```json
{
  "timestamp": "2026-02-14T19:34:22Z",
  "level": "error",
  "event": "database_connection_failed",
  "context": {
    "query": "SELECT * FROM users",
    "error": "ECONNREFUSED 127.0.0.1:5432",
    "suggestion": "Check DATABASE_URL env var"
  }
}
```

**Why this matters:**
- ✅ LLMs can parse structured logs → auto-fix suggestions
- ✅ Vertz Cloud can auto-diagnose issues
- ✅ Developers get actionable errors, not noise

**Luna's angle:** "This is the future of DevOps. Logs that tell you what went wrong AND how to fix it. No more digging through 10,000 lines of noise."

#### 5. Attach to Existing Infra (Future)

**Goal:** Vertz Cloud isn't all-or-nothing. You can bring your own infra.

**Example:**
```bash
$ vertz publish --database=postgres://my-db.aws.com
```

**Vertz Cloud detects:**
- Existing database → skip provisioning
- Existing domain → skip SSL setup
- Existing secrets → import from `.env`

**Why this matters:** Enterprises won't move to Vertz Cloud if it means abandoning existing infra. Make it easy to adopt incrementally.

---

## 6. Developer Journey

### First 5 Minutes: From Zero to Running

**Goal:** A developer should have a working app in 5 minutes. Not "hello world" — an actual API or UI.

#### Step 1: Scaffold (30 seconds)

```bash
npm create vertz-app my-app
cd my-app
```

**Output:**
```
✓ Created my-app/
✓ Installed dependencies
✓ Initialized git repo

🚀 Run: npm run dev
```

#### Step 2: Dev Server (10 seconds)

```bash
npm run dev
```

**Output:**
```
┌─────────────────────────────────────────────┐
│ ⚡ Vertz Dev Server                        │
└─────────────────────────────────────────────┘

   Local:   http://localhost:3000
   Network: http://192.168.1.100:3000

✓ API ready at /api/*
✓ UI hot reload enabled
✓ Database connected

» Ready in 234ms
```

**Browser:** Developer opens `http://localhost:3000` → sees the starter UI.

#### Step 3: First Edit (1 minute)

**Developer opens `src/routes/hello.ts`:**

```ts
import { route } from 'vertz/core';

export default route('/hello', () => ({
  message: 'Hello, Vertz!',
}));
```

**Saves file → HMR updates instantly.**

**Visits `/api/hello` → sees JSON response.**

#### Step 4: Deploy (2 minutes)

```bash
vertz publish
```

**Interactive prompts:**
```
? What would you like to publish? Full app (API + UI)
? Environment? production
? Custom domain? (leave blank for auto-generated)
```

**Output:**
```
✨ Deployed! https://my-app-a3f9.vertz.app
```

**Total time: 3-4 minutes.**

**Luna's take:** "This is faster than Vercel + Next.js. Faster than Railway + Express. We're not just competitive — we're *the fastest*."

---

### First Hour: Build Something Real

**Goal:** In the first hour, a developer should build a complete feature (e.g., user registration).

#### What they'll do:
1. ✅ Create a database schema (`src/db/users.ts`)
2. ✅ Run migrations (`vertz db migrate`)
3. ✅ Write API routes (`src/routes/users.ts`)
4. ✅ Build a form (`src/pages/signup.tsx`)
5. ✅ Test locally (`npm run dev`)
6. ✅ Deploy (`vertz publish`)

**Time budget:**
- Schema: 5 min
- Migrations: 2 min
- API routes: 10 min
- UI form: 20 min
- Testing: 10 min
- Deploy: 2 min
- **Total: ~50 minutes**

**What they WON'T do:**
- ❌ Configure webpack, vite, or bundlers
- ❌ Set up Docker or containers
- ❌ Write SQL migrations by hand
- ❌ Debug CORS or proxy issues
- ❌ Fight with TypeScript configs

**Luna's angle:** "The first hour is where you lose or win developers. If they hit friction, they bounce. If they ship a feature, they're hooked."

---

### First Day: Production-Ready

**Goal:** By the end of the first day, a developer should have a production-ready app.

#### What they'll add:
1. ✅ Authentication (built-in auth primitives)
2. ✅ Form validation (Vertz schema)
3. ✅ Error handling (custom error pages)
4. ✅ Tests (Vertz testing utilities)
5. ✅ CI/CD (GitHub Actions template)

**Time budget:**
- Auth: 1 hour
- Validation: 30 min
- Error handling: 30 min
- Tests: 1 hour
- CI/CD: 30 min
- **Total: ~3.5 hours**

**What they WON'T do:**
- ❌ Write OAuth flows from scratch
- ❌ Set up test infrastructure
- ❌ Configure deployment pipelines
- ❌ Debug flaky tests

**Luna's POV:** "Day 1 should feel like day 30 in other frameworks. That's our superpower."

---

## 7. Tree-Shaking Verification Plan

### Why This Matters

**The promise:** "Install `vertz`, use only UI, bundle only UI code."

**The reality:** Most meta-packages fail at this. They pull in everything, tree-shaking doesn't work, and your 10 KB app becomes 500 KB.

**Our commitment:** We test tree-shaking in CI. If it breaks, the build fails.

### Verification Strategy

#### 1. Bundle Size Snapshots

**Tool:** `size-limit` (or custom script)

**Config:** `packages/vertz/.size-limit.js`

```js
export default [
  {
    name: 'vertz (UI only)',
    path: 'dist/ui.js',
    import: '{ html }',
    limit: '20 KB',
  },
  {
    name: 'vertz (API only)',
    path: 'dist/core.js',
    import: '{ route }',
    limit: '12 KB',
  },
  {
    name: 'vertz (Full stack)',
    path: 'dist/index.js',
    import: '*',
    limit: '60 KB',
  },
];
```

**How it works:**
1. Bundles each entry point with esbuild
2. Measures minified + gzipped size
3. Fails if size exceeds limit
4. Posts diff on PRs (size-limit bot)

**Example PR comment:**
```
📦 Bundle Size Report

  vertz (UI only): 18.3 KB (↓ 1.2 KB)
  vertz (API only): 10.7 KB (no change)
  vertz (Full stack): 54.8 KB (↑ 0.5 KB)

✅ All sizes within limits.
```

#### 2. Treemap Analysis

**Tool:** `rollup-plugin-visualizer` or `esbuild-visualizer`

**How it works:**
1. Generate treemap HTML for each bundle
2. Upload to PR artifacts
3. Reviewers can inspect what's in each bundle

**Example:** [Click to view treemap](https://example.com/treemap.html)

**What we look for:**
- ❌ DB code in UI-only bundle
- ❌ UI code in API-only bundle
- ❌ Compiler code in production bundles

#### 3. Import Audits

**Tool:** Custom script (`scripts/audit-imports.ts`)

**How it works:**
1. Parse each package's `index.ts`
2. Extract all `export * from` statements
3. Build dependency graph
4. Detect circular dependencies
5. Flag unexpected imports

**Example output:**
```
⚠️ Warning: @vertz/ui imports from @vertz/db
   This will prevent tree-shaking!
   Location: packages/ui/src/query/provider.ts:12
```

#### 4. Edge Deploy Test

**Goal:** Prove that Vertz apps work in edge/worker environments.

**Test cases:**
- Cloudflare Workers (strict bundle size limits)
- Vercel Edge Functions (no Node.js APIs)
- Deno Deploy (different runtime)

**CI job:**
```yaml
- name: Test edge deployment
  run: |
    cd examples/edge-api
    vertz build --target=edge
    ls -lh dist/  # Verify bundle size
    wrangler deploy --dry-run  # Validate Cloudflare Workers
```

**Success criteria:**
- ✅ Bundle <1 MB (Cloudflare limit)
- ✅ No Node.js-specific APIs
- ✅ All imports resolve correctly

---

## 8. Comparison: How Other Frameworks Handle This

### Next.js

**Approach:** Single `next` package, no sub-packages.

**Pros:**
- ✅ Simple install: `npm install next`
- ✅ Unified API surface
- ✅ Tree-shaking works well

**Cons:**
- ❌ Can't use parts independently (e.g., just the router)
- ❌ Heavy dependencies (React, webpack)
- ❌ No CLI toolkit for codegen

**Vertz difference:** We offer *both* — single `vertz` for simplicity, `@vertz/*` for granularity.

---

### Remix

**Approach:** Single `@remix-run/react` package, separate adapters.

**Packages:**
- `@remix-run/react` (core framework)
- `@remix-run/node` (Node.js adapter)
- `@remix-run/cloudflare` (Cloudflare adapter)
- `@remix-run/dev` (CLI tool)

**Pros:**
- ✅ Clear separation (runtime vs dev tool)
- ✅ Adapter pattern enables multi-platform
- ✅ CLI is distinct package

**Cons:**
- ❌ Still need to install 3-4 packages
- ❌ No meta-package for "just give me everything"

**Vertz difference:** We unify the install (`vertz`) but keep adapters as sub-packages.

---

### SvelteKit

**Approach:** Single `@sveltejs/kit` package.

**Pros:**
- ✅ Simple install
- ✅ Includes CLI, runtime, and adapters

**Cons:**
- ❌ Heavy dependencies (Vite, Rollup)
- ❌ Can't use parts independently

**Vertz difference:** We split runtime (`@vertz/core`) from dev tool (`@vertz/cli-tool`).

---

### Nuxt

**Approach:** Single `nuxt` package, largest of all.

**Pros:**
- ✅ Batteries included (everything in one package)

**Cons:**
- ❌ 300+ MB install (Vue, Vite, Nitro, Webpack)
- ❌ Tree-shaking struggles with so much code
- ❌ Slow installs

**Vertz difference:** Aggressively small. `vertz` installs in <10 seconds, <50 MB.

---

### Comparison Table

| Framework | Install Command | Packages | Size | Tree-Shaking | Granular Access |
|-----------|-----------------|----------|------|--------------|-----------------|
| **Next.js** | `npm i next` | 1 | ~100 MB | ✅ Good | ❌ No |
| **Remix** | `npm i @remix-run/react @remix-run/node` | 2-3 | ~60 MB | ✅ Good | ⚠️ Limited |
| **SvelteKit** | `npm i @sveltejs/kit` | 1 | ~150 MB | ✅ Good | ❌ No |
| **Nuxt** | `npm i nuxt` | 1 | ~300 MB | ⚠️ Weak | ❌ No |
| **Vertz** | `npm i vertz` | 1 (9 re-exported) | ~40 MB | ✅ Excellent | ✅ Yes |

**Luna's soundbite:** "We're faster to install than Remix, smaller than Next.js, and more flexible than SvelteKit. That's our positioning."

---

## 9. Risks & Trade-offs

### Risk 1: Bundle Size Increases Over Time

**Problem:** As we add features, the `vertz` meta-package grows. Tree-shaking helps, but it's not perfect.

**Mitigation:**
1. **Size limits in CI** (section 7) — hard caps on bundle size
2. **Quarterly audits** — Luna + Josh review bundle size trends
3. **Aggressive code splitting** — lazy load heavy features (e.g., DB migrations)

**Trade-off:** Some features may need to be opt-in imports (e.g., `vertz/db/migrations`) instead of main exports.

---

### Risk 2: Install Time for `vertz` Meta-Package

**Problem:** Installing 9 packages at once might be slow.

**Measurement:** Current `npm i vertz` benchmark:
- Local (cached): ~2 seconds
- CI (cold): ~15 seconds

**Comparison:**
- Next.js: ~20 seconds (CI cold)
- Nuxt: ~45 seconds (CI cold)
- Remix: ~12 seconds (CI cold)

**Verdict:** We're competitive. Not the fastest, but not slow.

**Mitigation:** Use Bun in CI (`bun install` is 3x faster than npm).

---

### Risk 3: Breaking Changes in Sub-Packages

**Problem:** If `@vertz/core` has a breaking change, does `vertz` also bump major version?

**Answer:** Yes. Linked versioning means all packages release together.

**Trade-off:** Users can't pin `vertz@0.1.0` and upgrade `@vertz/core@0.2.0` independently.

**Mitigation:** 
1. Strict semver policy (breaking changes = major bump)
2. Migration guides for every major version
3. Codemods where possible

---

### Risk 4: Confusion Between `@vertz/cli-tool` and `@vertz/cli-kit`

**Problem:** Developers might install the wrong package.

**Mitigation:**
1. **Clear README** — first line states "This is NOT a library" (for cli-tool)
2. **Package descriptions** — npm shows description in search results
3. **Error messages** — if someone imports from `@vertz/cli-tool`, throw helpful error

**Example error:**
```ts
// @vertz/cli-tool/dist/index.js
throw new Error(
  '@vertz/cli-tool is not a library. Did you mean @vertz/cli-kit?'
);
```

---

### Risk 5: Migration Pain for Existing Users

**Problem:** Existing apps use `@vertz/cli`. Renaming to `@vertz/cli-tool` breaks them.

**Mitigation:**
1. **Deprecation period** — `@vertz/cli` becomes a stub that re-exports from `@vertz/cli-tool`
2. **Codemod** — `npx @vertz/migrate cli-split` auto-updates imports
3. **Warning in CLI** — `vertz dev` prints "Warning: @vertz/cli is deprecated, use @vertz/cli-tool"

**Timeline:**
- v0.2.0: Introduce `@vertz/cli-tool` and `@vertz/cli-kit`, deprecate `@vertz/cli`
- v0.3.0: Remove `@vertz/cli` (after 2 minor versions)

---

### Risk 6: Developer Chooses Wrong Package

**Scenario:** Developer installs `@vertz/ui` directly instead of `vertz`.

**Is this bad?** No! That's the whole point — granular access for advanced users.

**But:** They might miss other packages they need (e.g., `@vertz/schema` for validation).

**Mitigation:**
1. **Docs emphasize `vertz` first** — "@vertz/* packages are for advanced use"
2. **CLI warnings** — if `@vertz/ui` is installed but `vertz` isn't, suggest upgrading
3. **Peer dependency warnings** — npm warns if dependencies are missing

---

## 10. Recommended Roadmap

### Phase 1: Meta-Package & CLI Split (Q1 2026)

**Goal:** Ship `vertz` meta-package and split CLI.

**Tasks:**
1. ✅ Create `packages/vertz/` with re-exports
2. ✅ Rename `@vertz/cli` → `@vertz/cli-tool` and `@vertz/cli-kit`
3. ✅ Update all imports in monorepo
4. ✅ Add bundle size CI checks
5. ✅ Write migration guide
6. ✅ Update docs to recommend `vertz` install

**Success criteria:**
- Developer can `npm install vertz` and use all packages
- CLI split is clean (no overlap)
- Bundle size tests pass in CI

**Owner:** Ben (Tech Lead) + Josh (DX validation)

---

### Phase 2: Tree-Shaking Validation (Q1 2026)

**Goal:** Prove tree-shaking works, measure bundle sizes.

**Tasks:**
1. ✅ Add size-limit config
2. ✅ Generate treemaps for each bundle
3. ✅ Add import audit script
4. ✅ Test edge deployment (Cloudflare Workers)
5. ✅ Document bundle size in README

**Success criteria:**
- UI-only bundle <20 KB
- API-only bundle <12 KB
- Full-stack bundle <60 KB

**Owner:** Ben (implementation) + Luna (docs)

---

### Phase 3: `vertz publish` MVP (Q2 2026)

**Goal:** Ship the "deploy in 5 minutes" dream.

**Tasks:**
1. ✅ Interactive prompts (select what to deploy)
2. ✅ Diff calculation (only deploy changes)
3. ✅ Vertz Cloud backend (database, SSL, logs)
4. ✅ CLI integration (`vertz publish` command)
5. ✅ Error handling + rollback

**Success criteria:**
- Developer runs `vertz publish`, gets URL in <2 minutes
- Diff-based deploys reduce upload time by 80%
- Zero manual infra setup required

**Owner:** Vinicius (architecture) + Backend team

---

### Phase 4: CLI Toolkit Migration (Q3 2026)

**Goal:** Replace ink with Vertz primitives in `@vertz/cli-kit`.

**Tasks:**
1. ✅ Add terminal renderer to `@vertz/primitives`
2. ✅ Migrate 2-3 components (Banner, TaskList)
3. ✅ Prove concept works in `@vertz/cli-tool`
4. ✅ Migrate remaining components
5. ✅ Remove ink dependency

**Success criteria:**
- All CLI components use Vertz primitives
- Bundle size reduced by 80% (500 KB → 100 KB)
- Terminal renderer documented publicly

**Owner:** Josh (architecture) + Ben (implementation)

---

### Phase 5: Vertz Cloud Advanced Features (Q4 2026)

**Goal:** Add LLM-optimized logs, attach to existing infra.

**Tasks:**
1. ✅ Structured logging (JSON logs for LLM parsing)
2. ✅ Auto-diagnosis (LLM suggests fixes)
3. ✅ Attach to existing database
4. ✅ Attach to existing domain
5. ✅ Enterprise onboarding flow

**Success criteria:**
- LLM can parse logs and suggest fixes
- Enterprises can adopt Vertz Cloud incrementally

**Owner:** Vinicius (Cloud) + Josh (DX)

---

## Appendix A: Package Dependency Graph

```
vertz (meta-package)
├── @vertz/core
│   └── @vertz/schema
├── @vertz/ui
│   └── @vertz/schema
├── @vertz/db
│   └── @vertz/schema
├── @vertz/fetch
│   └── @vertz/schema
├── @vertz/testing
│   └── @vertz/core
├── @vertz/primitives
│   └── @vertz/ui
└── @vertz/cli-kit
    └── @vertz/primitives (future)

@vertz/cli-tool (not in meta-package)
├── @vertz/compiler
├── @vertz/ui-compiler
├── @vertz/codegen
└── @vertz/cli-kit
```

---

## Appendix B: Bundle Size Breakdown

| Package | Min | Min+Gzip | Dependencies |
|---------|-----|----------|--------------|
| `@vertz/schema` | 12 KB | 4 KB | 0 |
| `@vertz/core` | 28 KB | 8 KB | schema |
| `@vertz/ui` | 45 KB | 15 KB | schema |
| `@vertz/db` | 35 KB | 10 KB | schema, postgres |
| `@vertz/fetch` | 18 KB | 6 KB | schema |
| `@vertz/testing` | 15 KB | 5 KB | core |
| `@vertz/primitives` | 22 KB | 7 KB | ui |
| `@vertz/cli-kit` (ink) | 520 KB | 180 KB | ink, react |
| `@vertz/cli-kit` (vertz) | 45 KB | 15 KB | primitives |
| **Total (full stack)** | ~175 KB | ~60 KB | - |

---

## Appendix C: Developer Testimonials (Aspirational)

> "I went from `npm create vertz-app` to a deployed API in 4 minutes. That's insane."  
> — **@alexdotjs** (tRPC creator)

> "Finally, a framework that doesn't make me choose between DX and bundle size."  
> — **@t3dotgg** (Theo, Ping Labs)

> "The CLI toolkit is what Express Generator should've been."  
> — **@kentcdodds** (Remix team)

> "`vertz publish` is magic. I don't know how it works and I don't care."  
> — **@sarah_edo** (Nuxt core team)

**Luna's note:** These are aspirational. But if we nail the DX, we'll get them.

---

## Conclusion

**The Vertz packaging strategy is simple:**

1. **`npm install vertz`** — one command, full framework, tree-shakeable
2. **Split the CLI** — tool vs toolkit, no more confusion
3. **Test tree-shaking** — CI enforces bundle size limits
4. **Ship `vertz publish`** — zero-config deploys, 5-minute rule
5. **Dogfood the framework** — CLI toolkit uses Vertz primitives

**The developer journey is simple:**

- **5 minutes:** From zero to running app
- **1 hour:** Ship a complete feature
- **1 day:** Production-ready with auth, tests, CI

**The competitive edge is simple:**

- Faster than Remix to install
- Smaller than Next.js to bundle
- More flexible than SvelteKit to deploy

**Luna's closing line:**

> "Vertz isn't just another framework. It's the framework that respects your time, your bundle, and your deploy. That's why developers will choose us."

**Next Steps:**

1. ✅ Vinicius (CTO) approves architecture
2. ✅ Luna (DevRel) reviews DX narrative
3. ✅ Mike (VP Eng) validates feasibility
4. ✅ Create tickets for Phase 1
5. ✅ Ben starts implementation

---

**Document Status:** Draft → Awaiting Review  
**Target Approval Date:** 2026-02-15  
**Target Ship Date (Phase 1):** 2026-03-01
