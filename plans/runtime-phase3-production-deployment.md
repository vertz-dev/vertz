# Design: Runtime Phase 3 — Production Deployment

**Status:** Draft (Rev 2 — post-review)
**Issue:** #2032
**Author:** spokane (Technical Lead)
**Date:** 2026-03-30

## Goal

Add production deployment capabilities to the Vertz CLI: `vertz build --target cloudflare` performs entity analysis and generates a deployment manifest + Worker bundle, `vertz start` enforces production constraints, and `vertz deploy` pushes to Cloudflare Workers.

## Relationship to #2032

Issue #2032 has four acceptance criteria:

| Criterion | Tier | Status |
|-----------|------|--------|
| `vertz deploy` successfully deploys to Cloudflare Workers | **Tier 1 (this doc)** | Delivered in Phases 1-4 |
| Queue messages delivered reliably (at-least-once) | **Tier 2 (deferred)** | Requires Phase 2 multi-isolate queue handler isolates |
| Scheduled tasks fire correctly | **Tier 2 (deferred)** | Requires Phase 2 cron trigger isolates |
| Production mode enforces all constraints | **Tier 1 (partial)** | Serialization boundaries deferred to Tier 2; access rules and DB validation in Tier 1 |

Tier 2 criteria will be tracked in a follow-up issue created when Tier 1 ships. #2032 is partially fulfilled by Tier 1.

## Phase 2 Dependency — Scoping Decision

The original runtime plan states Phase 3 depends on Phase 2 (multi-isolate). However, Phase 2's multi-isolate architecture (cooperative scheduling, message bus, entity grouping) is not yet implemented. Rather than block all production deployment work, we scope Phase 3 into two tiers:

**Tier 1 (this design doc):** Single-worker deployment. All entities deploy into one Cloudflare Worker. No entity-to-worker splitting, no cross-worker message bus. This is the "entity-todo → Workers" path and is immediately buildable.

**Tier 2 (future, after Phase 2):** Multi-worker deployment with entity graph splitting. Domains → separate Workers, message bus → HTTP/Service Bindings, Durable Objects for stateful entities. Deferred until Phase 2's isolate supervisor and message bus are operational.

This approach follows the vision principle "If you can't demo it, it's not done" — Tier 1 delivers a demoable deployment before multi-isolate lands.

## Existing Infrastructure

**`@vertz/cloudflare` already exists** (`packages/cloudflare/`) with:
- `createHandler()` — Full-stack Cloudflare Worker handler (lazy app factory, SSR, ISR caching, security headers, image optimization)
- D1 support via `@vertz/db`'s `createDb({ dialect: 'sqlite', d1: env.DB })`
- ISR cache helpers (KV-based, stale-while-revalidate)
- Traffic-aware pre-rendering (`@vertz/cloudflare/tpr`)
- Image optimizer (`@vertz/cloudflare/image`)

**`EntityAnalyzer` exists** in `@vertz/compiler` (`packages/compiler/src/analyzers/entity-analyzer.ts`) with:
- Static AST analysis of `entity()` calls (no runtime execution needed)
- Extracts: name, model, table, access rules, tenant scoping, custom actions, hooks, relations, expose config
- Output: `EntityIR[]` — fully typed intermediate representation
- Already used by `ManifestGenerator` and `OpenAPIGenerator`

**`vertz build` exists** with `target: 'worker'` already in `BuildTarget` union type.

**This design extends existing code, not creates from scratch.**

## API Surface

### `vertz build --target cloudflare`

The target is decided once at build time. The deploy command reads the manifest and knows where to deploy — no second `--target` flag needed.

```bash
# Build for Cloudflare Workers (single worker, all entities)
vertz build --target cloudflare

# Build for traditional server (existing behavior, unchanged)
vertz build --target node
```

```ts
// Programmatic API (in @vertz/cli)
import { buildAction } from '@vertz/cli/commands/build';

await buildAction({
  target: 'cloudflare',  // new target value
  sourcemap: true,
});
```

**Output structure:**
```
.vertz/build/
  worker/
    index.js          # Worker entry point (fetch handler)
    manifest.json     # Deployment manifest
    wrangler.toml     # Generated wrangler config (build artifact, not source)
  client/             # Static assets (if full-stack)
    assets/
      *.js, *.css
```

The `wrangler.toml` is generated inside `.vertz/build/worker/` — it's a build artifact, not a source file. Developers who need custom wrangler config create their own `wrangler.toml` at the project root and pass `--config wrangler.toml` to `vertz deploy`.

### `vertz start` (production mode)

```bash
# Start production server (existing, enhanced with constraint enforcement)
vertz start --port 3000
```

No API changes. Enhanced with production constraint enforcement:
- **Hard error** if any entity operation has no access rule defined (no undefined = open access). Use `access: { list: rules.public }` to explicitly allow open access.
- Validates all entity models have DB table mappings
- Logs startup diagnostics (entity count, route count, tenant scoping status)
- `--allow-open-access` escape hatch for development/prototyping

### `vertz deploy`

```bash
# Deploy to Cloudflare Workers (target read from manifest)
vertz deploy

# Dry run — show what would be deployed
vertz deploy --dry-run

# Deploy with custom wrangler config (overrides generated)
vertz deploy --config wrangler.toml

# Provision D1 database if it doesn't exist (opt-in)
vertz deploy --provision
```

The deploy command reads `.vertz/build/worker/manifest.json` and determines the target automatically. No `--target` flag on deploy — the build already decided.

```ts
// Programmatic API — discriminated union per target
import { deployCloudflareAction } from '@vertz/cli/commands/deploy';

deployCloudflareAction({
  projectRoot: process.cwd(),
  dryRun: false,
  provision: false,     // opt-in D1 creation
  config: undefined,    // custom wrangler.toml path
});
```

**Build → deploy validation:**
- `vertz deploy` fails with `"No deployment manifest found. Run 'vertz build --target cloudflare' first."` if manifest is missing.
- `vertz deploy` fails with `"Build target 'node' is incompatible with Cloudflare Workers. Rebuild with 'vertz build --target cloudflare'."` if manifest target doesn't match.

### Deployment Manifest

```ts
// .vertz/build/worker/manifest.json
interface DeploymentManifest {
  version: 1;
  target: 'cloudflare';
  generatedAt: string; // ISO timestamp
  entities: EntityManifestEntry[];
  routes: RouteManifestEntry[];
  bindings: BindingManifestEntry[];
  assets: {
    hasClient: boolean;
    clientDir?: string; // relative path to client assets (undefined if none)
  };
  ssr: {
    enabled: boolean;
    module?: string; // relative path to SSR module (undefined if disabled)
  };
}

interface EntityManifestEntry {
  name: string;
  table: string;
  tenantScoped: boolean;
  operations: string[]; // ['list', 'get', 'create', 'update', 'delete', ...]
  accessRules: Record<string, { type: string }>; // metadata-only, for inspection/auditing
}

interface RouteManifestEntry {
  method: string;
  path: string;
  entity: string;
  operation: string;
}

interface BindingManifestEntry {
  type: 'd1' | 'kv' | 'r2' | 'service';
  name: string; // binding name in wrangler.toml
  purpose: string; // human-readable description
}
```

**Access rules in the manifest are metadata-only** — for inspection, auditing, and LLM consumption. Runtime enforcement comes from the bundled `@vertz/server` code evaluating the original entity definitions (same as Bun today). The manifest does not replace runtime enforcement.

### Worker Entry Point (generated)

```ts
// .vertz/build/worker/index.js (generated, simplified view)
import { createHandler } from '@vertz/cloudflare';
import { createServer } from '@vertz/server';
import { createDb } from '@vertz/db';
// ... entity imports from user code (resolved by EntityAnalyzer)

// Module-level init — runs once per isolate cold start, reused across requests
function initApp(env: Env) {
  const db = createDb({ dialect: 'sqlite', d1: env.DB });
  return createServer({ entities: [...], db });
}

let cachedApp: ReturnType<typeof initApp> | null = null;
let cachedEnv: Env | null = null;

export default createHandler((env) => {
  // Re-init if env changes (different Worker environment) or first call
  if (!cachedApp || cachedEnv !== env) {
    cachedApp = initApp(env);
    cachedEnv = env;
  }
  return cachedApp;
});
```

**Key design decisions for the generated entry:**
- `createServer()` runs once per cold start, not per request (performance)
- Uses existing `createHandler()` from `@vertz/cloudflare` (no new handler API)
- D1 integration via existing `createDb({ d1 })` from `@vertz/db` (no new D1 adapter)
- Entity imports are resolved by the `EntityAnalyzer` at build time (literal `entity()` calls only — dynamic construction like `createServer({ entities: getEntities() })` is not supported, which matches the compiler's existing constraint)

## Entity Discovery Mechanism

The build pipeline uses the existing `EntityAnalyzer` from `@vertz/compiler`:

1. `EntityAnalyzer.analyze(project)` scans all `.ts`/`.tsx` files in the ts-morph project for `entity()` calls from `@vertz/server`
2. Produces `EntityIR[]` with name, model, table, access rules, tenant scoping, actions
3. New `ManifestBuilder` maps `EntityIR` → `EntityManifestEntry`:
   - `entity.name` → `name`
   - `entity.modelRef.tableName` → `table`
   - `entity.tenantScoped` → `tenantScoped`
   - `entity.access` map keys → `operations`
   - `entity.access` map values → `accessRules` (serialized descriptor type)
4. Import paths for the generated entry are derived from `entity.location.file`

**Constraint:** Entity config must be a literal object passed to `entity()`. The compiler emits `ENTITY_CONFIG_NOT_OBJECT` for dynamic configurations. This is a known and documented limitation.

## `node:crypto` and Workers Compatibility

`@vertz/server`'s auth module imports `node:crypto` (for `generateKeyPairSync`, `createPrivateKey`, `createPublicKey`, `timingSafeEqual`). Workers' `nodejs_compat_v2` flag provides partial support but `generateKeyPairSync` is not available.

**Tier 1 approach:** The generated `wrangler.toml` includes:
```toml
compatibility_flags = ["nodejs_compat_v2"]
compatibility_date = "2026-03-01"
```

The build pipeline detects if auth-related imports are present and:
- If the app uses auth: logs a warning about `node:crypto` limitations, suggests testing locally with `wrangler dev` before deploying
- If the app is API-only without auth: no warning, fully compatible

**Tier 2 approach:** Refactor auth module to use Web Crypto API (`crypto.subtle`) which is natively available on Workers. This is a separate initiative.

## esbuild Configuration for Workers

The worker target uses a fundamentally different bundling strategy:

```ts
const workerBuildConfig = {
  platform: 'neutral',            // NOT 'node' — Workers are not Node.js
  conditions: ['workerd', 'worker', 'browser'],  // Conditional export resolution
  external: [
    'better-sqlite3',             // Native addon — excluded, D1 replaces it
    'bun:*',                      // Bun-specific APIs
  ],
  // @vertz/* packages are BUNDLED (not external) — no node_modules on Workers
  // Tree-shaking removes unused entity code, DB adapters, etc.
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  format: 'esm',
  target: 'es2022',
  treeShaking: true,
  minify: true,
};
```

**Key differences from `node` target:**
- All `@vertz/*` packages bundled (not external)
- `better-sqlite3` excluded (D1 replaces it at runtime)
- `platform: 'neutral'` for Worker-compatible output
- Aggressive tree-shaking to minimize bundle size

## Bundle Size Fallback Strategy

If the bundle exceeds Workers' 10MB compressed / 50MB uncompressed limit:

1. **First:** Enable aggressive tree-shaking and dead code elimination
2. **If still too large:** Split into two workers:
   - API worker: entities + DB + auth (deployed as Worker)
   - SSR worker: UI rendering + static assets (deployed as Cloudflare Pages)
   - Connected via Service Bindings for data fetching
3. **If still too large:** Investigate code splitting per-entity (Tier 2 territory)

This is measured during Phase 2 (build pipeline). If splitting is needed, it's implemented before Phase 3 (deploy).

## Wrangler Authentication

- **Local development:** Developer runs `wrangler login` (interactive OAuth) before first `vertz deploy`. Stored in `~/.wrangler/config/`.
- **CI/CD:** Set `CLOUDFLARE_API_TOKEN` environment variable. `vertz deploy` passes it through to `wrangler deploy`.
- **D1 provisioning:** `vertz deploy --provision` runs `wrangler d1 create <name>` if the D1 database doesn't exist. This is opt-in — auto-creating databases in production is dangerous. Without `--provision`, deploy fails with instructions if D1 binding is unresolvable.

`vertz deploy` validates wrangler is installed before attempting anything. If missing: `"wrangler is required for Cloudflare deployment. Install with: npm install -g wrangler"`.

## Manifesto Alignment

| Principle | How this design aligns |
|-----------|----------------------|
| **If it builds, it works** | `vertz build --target cloudflare` validates entity access rules and DB bindings at build time. Missing access rules = build error. `vertz start` also fails with hard error on missing rules. |
| **One way to do things** | Target decided once at build time. `vertz deploy` reads the manifest — no redundant `--target` flag. Generated wrangler config is a build artifact, not a source file to maintain. |
| **AI agents are first-class** | Manifest is JSON — inspectable, serializable, diffable. An LLM can read the manifest to understand deployment topology. Entity discovery uses the existing compiler's `EntityAnalyzer` (static analysis, no runtime execution). |
| **Performance is not optional** | `createServer()` runs once per cold start, not per request. D1 uses prepared statements. Static assets use Cloudflare's native serving. |
| **No ceilings** | Single-worker now, multi-worker later. The manifest format is designed to accommodate entity-to-worker splitting in Tier 2. |

## Non-Goals

- **Multi-worker deployment (entity graph splitting)** — Tier 2, after Phase 2 multi-isolate lands.
- **Durable Objects integration** — Requires Phase 2's durable isolate design.
- **Queue/scheduled task handlers** — Requires Phase 2's queue handler isolates (#2032 criteria 2 & 3).
- **Edge-side access rule evaluation in Rust** — The Rust runtime doesn't run on Workers. Access rules evaluate in JS on Workers (same as Bun today).
- **Native runtime `build`/`deploy` subcommands** — These are TypeScript/Bun CLI commands. The native Rust runtime handles `dev` and `test` only.
- **KV, R2, or other Cloudflare binding types** — Only D1 for database. Others added as needed.
- **Custom domains / routing configuration** — Wrangler handles this.
- **New D1 adapter** — D1 is already supported via `@vertz/db`'s `createDb({ d1 })`.
- **New worker handler API** — `createHandler()` from `@vertz/cloudflare` already handles this.

## Unknowns

### 1. `node:crypto` specific API availability on Workers (needs POC)

**Question:** Do the specific `node:crypto` APIs used by `@vertz/server/auth` (`generateKeyPairSync`, `createPrivateKey`, `createPublicKey`, `timingSafeEqual`) work under `nodejs_compat_v2`?

**Resolution plan:** POC spike in Phase 1 — bundle a minimal entity app with auth, deploy to Workers, test auth flow. If `generateKeyPairSync` fails, document that auth requires key pre-generation (keys loaded from environment variables instead of generated at startup).

### 2. Worker bundle size

**Question:** Will a full-stack Vertz app fit within 10MB compressed / 50MB uncompressed?

**Resolution plan:** Measure in Phase 2 after bundling. Fallback strategy defined above (tree-shaking → split API/SSR → per-entity splitting).

### 3. SSR streaming on Workers

**Question:** Does `@vertz/ui-server`'s `renderToStream()` work in the Workers runtime?

**Resolution plan:** Test in Phase 4 (E2E). Workers support `ReadableStream`. If the Vertz streaming SSR uses Node.js-specific stream APIs, fall back to `renderToString()`.

## Type Flow Map

```
BuildCommandOptions.target: 'cloudflare'
  └→ buildForCloudflare(detected: DetectedApp, options: BuildCommandOptions)
      └→ EntityAnalyzer.analyze(project): EntityAnalyzerResult
          └→ EntityIR.name → EntityManifestEntry.name
          └→ EntityIR.modelRef.tableName → EntityManifestEntry.table
          └→ EntityIR.tenantScoped → EntityManifestEntry.tenantScoped
          └→ EntityIR.access → EntityManifestEntry.accessRules
      └→ ManifestBuilder.build(entities: EntityIR[]): DeploymentManifest
      └→ WorkerEntryGenerator.generate(manifest, entityLocations): string
      └→ esbuild.build(workerConfig): BundleResult
      └→ writeManifest(manifest: DeploymentManifest): void

deployCloudflareAction(options: CloudflareDeployOptions)
  └→ readManifest('.vertz/build/worker/manifest.json'): DeploymentManifest
  └→ validateManifestTarget(manifest.target === 'cloudflare'): void
  └→ generateWranglerConfig(manifest): string (written to .vertz/build/worker/wrangler.toml)
  └→ exec('wrangler deploy --config .vertz/build/worker/wrangler.toml')
```

## E2E Acceptance Test

From a developer's perspective, using the entity-todo example:

```ts
// Type-level tests (.test-d.ts)
describe('Type: BuildCommandOptions target validation', () => {
  it('accepts valid targets', () => {
    const opts: BuildCommandOptions = { target: 'cloudflare' }; // compiles
  });

  // @ts-expect-error — 'invalid' is not a valid BuildTarget
  it('rejects unknown build targets at type level', () => {
    const opts: BuildCommandOptions = { target: 'invalid' };
  });
});

// Runtime tests
describe('Feature: Cloudflare Workers deployment', () => {
  describe('Given an entity-todo app with a Todo entity', () => {
    describe('When running `vertz build --target cloudflare`', () => {
      it('generates .vertz/build/worker/index.js with fetch handler', () => {
        // Worker entry exists and exports default { fetch }
      });

      it('generates .vertz/build/worker/manifest.json with entity metadata', () => {
        // Manifest has version: 1, target: 'cloudflare'
        // Manifest has entities[0].name === 'todo'
        // Manifest has routes for GET/POST/PUT/DELETE /api/todo
        // Manifest has bindings[0].type === 'd1'
      });

      it('generates .vertz/build/worker/wrangler.toml with D1 binding and compat flags', () => {
        // wrangler.toml has [[d1_databases]] section
        // Has compatibility_flags = ["nodejs_compat_v2"]
        // Has compatibility_date set
      });

      it('fails build if entity has no access rules defined', () => {
        // Build error: "Entity 'todo' has no access rules for 'list'. Define rules or use rules.public."
      });
    });

    describe('When running `vertz deploy --dry-run`', () => {
      it('shows deployment plan without executing', () => {
        // Output includes worker name, bindings, routes
        // No wrangler deploy actually runs
      });
    });

    describe('When running `vertz deploy` without prior build', () => {
      it('fails with helpful error message', () => {
        // "No deployment manifest found. Run 'vertz build --target cloudflare' first."
      });
    });

    describe('When running `vertz deploy`', () => {
      it('deploys to Cloudflare Workers via wrangler', () => {
        // wrangler deploy runs successfully
        // Production URL is returned
      });
    });

    describe('When running `vertz start` with missing access rules', () => {
      it('fails with hard error listing entities with missing rules', () => {
        // Error: "Entity 'todo' has undefined access rules for: list, create, update, delete"
      });
    });

    describe('When running `vertz start --allow-open-access`', () => {
      it('starts successfully with warning about open access', () => {
        // Warning logged but server starts
      });
    });
  });
});
```

## Implementation Plan

### Phase 1: Build pipeline — `vertz build --target cloudflare` (Foundation)

**Goal:** Add `cloudflare` build target that uses the existing `EntityAnalyzer` to generate a deployable Worker bundle with manifest.

**Deliverables:**
- `cloudflare` build target in `packages/cli/src/production-build/`
- `ManifestBuilder` — maps `EntityIR[]` → `DeploymentManifest`
- `WorkerEntryGenerator` — generates `index.js` that uses existing `createHandler()` from `@vertz/cloudflare` and `createDb({ d1 })` from `@vertz/db`
- esbuild config for Workers (`platform: 'neutral'`, bundled `@vertz/*`, tree-shaking)
- Wrangler config generation (`.vertz/build/worker/wrangler.toml`) with D1 bindings and `nodejs_compat_v2`
- Build-time validation: fail if any entity has undefined access rules
- Production constraint validation integrated into build (entity access rules, DB table mappings)

**Entity discovery:** Reuses `EntityAnalyzer` from `@vertz/compiler`. `EntityIR` is mapped to `EntityManifestEntry` via `ManifestBuilder`. Import paths for the generated entry derived from `EntityIR.location.file`.

**Acceptance criteria:**
```ts
describe('Feature: Cloudflare build pipeline', () => {
  describe('Given an API-only app with entities', () => {
    describe('When running vertz build --target cloudflare', () => {
      it('generates .vertz/build/worker/index.js using createHandler()', () => {});
      it('generates .vertz/build/worker/manifest.json with correct schema', () => {});
      it('generates .vertz/build/worker/wrangler.toml with D1 and compat flags', () => {});
      it('bundles all @vertz/* and entity code into a single worker module', () => {});
      it('excludes better-sqlite3 from the bundle', () => {});
    });
  });

  describe('Given a full-stack app with entities and UI', () => {
    describe('When running vertz build --target cloudflare', () => {
      it('generates worker entry with SSR support via createHandler()', () => {});
      it('generates client assets in .vertz/build/client/', () => {});
      it('manifest includes ssr.enabled: true and ssr.module path', () => {});
    });
  });

  describe('Given an app with tenant-scoped entities', () => {
    describe('When generating the manifest', () => {
      it('includes tenantScoped: true for scoped entities', () => {});
      it('includes access rules serialized as descriptor types', () => {});
    });
  });

  describe('Given an entity with no access rules defined', () => {
    describe('When running vertz build --target cloudflare', () => {
      it('fails with error listing entities and operations missing rules', () => {});
    });
  });

  describe('Given an app with auth (node:crypto usage)', () => {
    describe('When building for cloudflare', () => {
      it('logs warning about node:crypto compatibility', () => {});
      it('includes nodejs_compat_v2 in generated wrangler.toml', () => {});
    });
  });
});
```

**Estimate:** 3-4 days

---

### Phase 2: Deploy command — `vertz deploy` for Cloudflare

**Goal:** Deploy the built worker to Cloudflare via wrangler.

**Deliverables:**
- `deployCloudflareAction()` in `packages/cli/src/deploy/cloudflare.ts`
- Manifest validation (exists, target matches)
- Wrangler availability check with install instructions
- Dry-run mode showing deployment plan (entities, routes, bindings)
- Actual deployment via `wrangler deploy --config .vertz/build/worker/wrangler.toml`
- `--provision` flag for opt-in D1 database creation
- `--config` flag for custom wrangler.toml override
- Structured error handling for common wrangler failures (auth, quota, size)

**Wrangler integration:**
- Authentication: documents `wrangler login` for local, `CLOUDFLARE_API_TOKEN` for CI
- D1 provisioning: opt-in via `--provision` — runs `wrangler d1 create` if needed
- Error handling: structured messages for auth failures, quota exceeded, bundle too large

**Acceptance criteria:**
```ts
describe('Feature: Cloudflare deployment', () => {
  describe('Given no manifest exists', () => {
    describe('When running vertz deploy', () => {
      it('fails with "Run vertz build --target cloudflare first"', () => {});
    });
  });

  describe('Given a manifest with target: "node"', () => {
    describe('When running vertz deploy', () => {
      it('fails with "Build target node incompatible with Cloudflare"', () => {});
    });
  });

  describe('Given a valid cloudflare manifest', () => {
    describe('When running vertz deploy --dry-run', () => {
      it('prints deployment plan (worker name, bindings, routes)', () => {});
      it('does not execute wrangler deploy', () => {});
    });
  });

  describe('Given wrangler is not installed', () => {
    describe('When running vertz deploy', () => {
      it('returns error with install instructions', () => {});
    });
  });

  describe('Given a valid build and wrangler available', () => {
    describe('When running vertz deploy', () => {
      it('runs wrangler deploy with generated wrangler.toml', () => {});
      it('returns the production URL on success', () => {});
    });
  });

  describe('Given vertz deploy --config custom.toml', () => {
    describe('When deploying', () => {
      it('uses the custom config instead of generated one', () => {});
    });
  });
});
```

**Estimate:** 2-3 days

---

### Phase 3: `vertz start` enhancements — Production constraint enforcement

**Goal:** Enhance `vertz start` with hard-error validation for missing access rules and production diagnostics.

**Deliverables:**
- Hard error if entities have undefined access rules (not warnings)
- `--allow-open-access` escape hatch for prototyping
- Startup diagnostics logging (entity count, route count, tenant scoping)
- Graceful error messages for missing build outputs

**Acceptance criteria:**
```ts
describe('Feature: Production mode constraints', () => {
  describe('Given an app where an entity has no access rules', () => {
    describe('When running vertz start', () => {
      it('exits with error listing entities and operations with missing rules', () => {});
    });
  });

  describe('Given vertz start --allow-open-access', () => {
    describe('When an entity has no access rules', () => {
      it('logs warning but starts successfully', () => {});
    });
  });

  describe('Given a valid build with all access rules defined', () => {
    describe('When running vertz start', () => {
      it('logs startup diagnostics (entity count, routes, tenant scoping)', () => {});
      it('serves API routes correctly', () => {});
    });
  });
});
```

**Estimate:** 1 day

---

### Phase 4: E2E integration — Entity-todo on Workers

**Goal:** Verify the full pipeline works end-to-end with the entity-todo example.

**Deliverables:**
- Verify `vertz build --target cloudflare` produces valid output for entity-todo
- Verify bundle size is within Workers limits
- Verify `vertz deploy --dry-run` shows correct plan
- Integration tests exercising the full build → deploy pipeline
- Documentation updates in `packages/docs/`

**Acceptance criteria:**
```ts
describe('Feature: Entity-todo E2E deployment', () => {
  describe('Given the entity-todo example', () => {
    describe('When building for cloudflare target', () => {
      it('produces a valid worker bundle under 10MB compressed', () => {});
      it('manifest includes todo entity with all CRUD operations', () => {});
      it('generated entry uses createHandler() and createDb({ d1 })', () => {});
    });

    describe('When deploying with --dry-run', () => {
      it('shows: 1 entity, 5 routes, 1 D1 binding', () => {});
    });
  });
});
```

**Estimate:** 1-2 days

---

## Phase Dependencies

```
Phase 1 (build pipeline + manifest) ── Phase 2 (deploy command)
                                                │
Phase 3 (start enhancements)                    │
        │                                       │
        └───────────────────────────────────── Phase 4 (E2E)
```

Phase 1 and Phase 3 can run in parallel. Phase 2 depends on Phase 1. Phase 4 depends on Phases 2 and 3.

## Risks

1. **`node:crypto` on Workers** — Auth module uses APIs that may not be available under `nodejs_compat_v2`. Mitigation: POC spike early in Phase 1. Fallback: require pre-generated keys via env vars.

2. **Worker bundle size** — Full-stack Vertz app may exceed 10MB compressed. Mitigation: Measure in Phase 1, aggressive tree-shaking, fallback to API/SSR split documented above.

3. **Wrangler version compatibility** — Generated `wrangler.toml` may break across wrangler versions. Mitigation: Pin to specific `compatibility_date`, test against current stable wrangler.

4. **SSR streaming on Workers** — Workers' streaming may differ from Bun/Node. Mitigation: Test in Phase 4, fallback to string rendering.

5. **Barrel file side effects** — User code with barrel re-exports may execute side effects on every cold start. Mitigation: Document best practice (direct imports, avoid barrel files with side effects).

## Future: Tier 2 (Post-Phase 2)

When Phase 2 (multi-isolate) is complete, the manifest format extends:

```ts
interface DeploymentManifestV2 extends DeploymentManifest {
  version: 2;
  workers: WorkerManifestEntry[]; // entity → worker mapping
  serviceBindings: ServiceBindingEntry[]; // cross-worker communication
  durableObjects: DurableObjectEntry[]; // stateful entities
  queues: QueueManifestEntry[]; // queue handlers
  scheduled: ScheduledManifestEntry[]; // cron triggers
}
```

The V1 manifest's `entities` and `routes` arrays are the foundation. V2 adds worker splitting on top. Tier 2 will also deliver #2032 criteria 2 (queue messages) and 3 (scheduled tasks).
