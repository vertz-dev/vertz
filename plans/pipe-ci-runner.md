# Design: vtz ci — Monorepo Task Runner with TypeScript Workflows

> **Package:** `@vertz/ci` SDK + `vtz ci` CLI
> **Status:** Draft — Rev 3 (user decisions applied)
> **Author:** viniciusdacal
> **Date:** 2026-04-02

## Strategic Sequencing

The vertz runtime roadmap is: native compiler (done) → dev server (done) → **test runner** (next) → package manager → E2E. `vtz ci` is a **parallel track** — it solves monorepo orchestration, not application runtime. It lives inside the `vtz` crate at `native/vtz/src/ci/` (same pattern as the package manager at `src/pm/`), reusing existing infrastructure (sha2, tar, walkdir, tokio, clap).

The test runner (`vtz test`) and CI runner (`vtz ci`) are different layers: `vtz test` runs tests in a single package, `vtz ci` orchestrates which packages need testing/building/linting across the monorepo. They're complementary. `vtz ci` calls whatever command you configure (`bun test` today, `vtz test` later).

Building this now is motivated by immediate pain: every CI run rebuilds the full monorepo.

## Problem Statement

The vertz monorepo uses Turborepo for task orchestration and GitHub Actions for CI. Pain points:

1. **No CI cache leverage** — Turborepo's remote cache requires a paid plan or self-hosted infra. Every CI run rebuilds everything.
2. **GitHub Actions YAML is brittle** — 490+ lines of YAML with duplicated filter logic, fragile shell scripting, no type safety.
3. **Poor change detection** — `turbo --filter=[origin/main]` operates at the package level but doesn't understand file-level granularity (e.g., "only Rust files changed, skip TS entirely").
4. **No local/CI parity** — Running `bun run ci:affected` locally doesn't replicate what GitHub Actions does (services, matrix builds, artifact uploads).
5. **Dagger requires Docker** — Interesting model (code-defined CI) but Docker-in-Docker is slow, fragile, and doesn't leverage the host's native toolchain.

**Scope clarification:** This is a **monorepo task runner** first — replacing Turborepo for local + CI task orchestration, caching, and change detection. CI workflow triggers (replacing GitHub Actions YAML) are Phase 2+ work. The value of moving CI logic from YAML to TypeScript is that it becomes testable and type-safe, not that we build a CI platform.

## Solution

A new module inside the **`vtz` runtime binary** (`native/vtz/src/ci/`) that:
- Adds `vtz ci` subcommands to the existing CLI (same pattern as `vtz install`, `vtz test`, etc.)
- Reads task/workflow definitions written in **TypeScript** (`ci.config.ts`)
- Understands **monorepo package graphs** (from `package.json` workspaces or `Cargo.toml` workspace)
- Detects **file-level changes** via git and maps them to packages/tasks
- Runs tasks in **parallel** with topological ordering
- **Caches outputs** with content-addressable storage (local + remote)
- Works identically **locally and in CI**
- Reuses existing `vtz` infrastructure: `sha2` (hashing), `tar` (cache archives), `walkdir` (workspace resolution), `tokio` (async), `clap` (CLI), `serde_json` (config parsing)

## Manifesto Alignment

| Principle | How `vtz ci` aligns |
|---|---|
| **One way to do things** | Single `ci.config.ts` replaces turbo.json + .github/workflows/*.yml + package.json CI scripts |
| **If it builds, it works** | TypeScript config = type-checked, autocomplete, catch errors before CI runs |
| **AI agents are first-class** | Agents can read/write/modify pipe configs programmatically — TS >> YAML for LLMs |
| **Performance is not optional** | Rust core for graph resolution, file hashing, parallel execution, caching |
| **No ceilings** | Extensible via TypeScript — any logic in config, custom conditions, programmatic tasks |

**Tradeoffs:**
- Building our own vs. adopting Nx/Moon — we need file-level granularity and TS-native config. Existing tools are config-driven (JSON/YAML) or require their own ecosystem.
- Rust binary vs. pure TS — performance for hashing/caching/graph ops matters at scale. The config load cost is paid once.
- Starting within vertz monorepo vs. standalone — dogfood first, extract later.

**Vertz-native integration (the actual moat):**
The generic differentiators (TS config, Rust speed, file-level detection) are table stakes — Moon and Nx are converging on similar features. The real value is deep integration with the vertz ecosystem:
- Understands both Bun workspaces AND Cargo workspaces natively (hybrid TS+Rust monorepo)
- Will integrate with `vtz test` (the upcoming test runner) for more precise test-level invalidation
- Can leverage the vertz compiler's module graph for import-level change detection (not just file-level)
- Structured execution logs that feed into a future dashboard/SaaS

**Rejected alternatives:**
- **Nx** — Opinionated project structure, plugin ecosystem lock-in, JS-based (slow for large graphs)
- **Moon** — Rust-based but YAML config, limited programmability
- **Dagger** — Docker dependency, slow cold starts, not monorepo-native
- **Just replacing turbo.json with scripts** — Doesn't solve caching, parallelism, or change detection

## Non-Goals

- **Container orchestration** — `vtz ci` runs tasks natively on the host. No Docker, no VMs, no sandboxing.
- **Artifact storage** — `vtz ci` caches build outputs for speed. It doesn't manage deployment artifacts, releases, or binary distribution.
- **Secret management** — `vtz ci` validates that declared secrets exist and redacts their values in output. It doesn't store, rotate, or inject secrets (use Doppler, Vault, GitHub Secrets, etc.).
- **Notifications** — No Slack/email/webhook notifications. CI platforms or separate tooling handle that.
- **CI workflow triggers (Phase 1)** — Phase 1 replaces Turborepo. Workflow triggers (PR events, push, schedule) come later.
- **SaaS infrastructure** — The remote cache backend and hosted runner service are future work, not part of this design.
- **General multi-language monorepo support** — `vtz ci` supports TypeScript (Bun/Node) and Rust (Cargo) workspaces. Other language ecosystems (Go, Python, Java) are not planned.
- **Config composition/inheritance** — No `mergeConfig()` helper or base config extends. Plain object spread works. Can revisit if real demand emerges.
- **Managed services** — No automatic database/redis/etc. startup. Tasks declare `env` vars; the environment provides the services. (Docker Compose or CI services handle this externally.)

## API Surface

### Configuration file: `ci.config.ts`

```typescript
import { pipe, task, cond } from '@vertz/ci';

export default pipe({
  // Fail-fast: validate these env vars exist before any task runs.
  // Values are redacted in all CLI output and NDJSON logs.
  secrets: ['NPM_TOKEN', 'DATABASE_URL'],

  // Auto-detected from package.json workspaces if omitted
  workspace: {
    packages: ['packages/*'],
    // Optional: non-JS workspaces
    native: { root: 'native', members: ['vtz', 'vertz-compiler', 'vertz-compiler-core'] },
  },

  tasks: {
    build: task({
      command: 'bun run build',
      deps: ['^build'], // topological: run build in dependency packages first
      cache: {
        inputs: ['src/**', 'package.json', 'tsconfig.json', 'bunup.config.ts'],
        outputs: ['dist/**'],
      },
    }),

    test: task({
      command: 'bun test',
      deps: ['^build', 'build'], // deps' build + own build first
    }),

    typecheck: task({
      command: 'bun run typecheck',
      deps: ['^build'],
    }),

    lint: task({
      command: 'oxlint packages/ && oxfmt --check packages/',
      scope: 'root', // run once at repo root, not per-package
    }),

    'rust-checks': task({
      cond: cond.changed('native/**'),
      scope: 'root',
      steps: [
        'cd native && cargo fmt --all -- --check',
        'cd native && cargo clippy --all-targets --release -- -D warnings',
        'cd native && cargo test --all',
      ],
    }),

    coverage: task({
      command: 'bun test --coverage',
      deps: ['^build', 'build'],
      env: { DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/vertz_test' },
    }),
  },

  // Workflows: named task groups with conditions
  workflows: {
    ci: {
      run: ['lint', 'build', 'typecheck', 'test'],
      filter: 'affected', // only packages affected by changes
    },

    'ci:full': {
      run: ['lint', 'build', 'typecheck', 'test', 'rust-checks', 'coverage'],
    },

    release: {
      run: ['build'],
      filter: 'all', // all packages, regardless of changes
    },
  },

  cache: {
    local: '.pipe/cache',
    // Remote cache — auto-detects GitHub Actions cache when running in CI
    // Falls back to S3/R2 if configured
    remote: process.env.PIPE_REMOTE_CACHE || 'auto',
    // 'auto' = use GitHub Actions cache if ACTIONS_CACHE_URL is set, else local-only
    // 's3://bucket/prefix' or 'r2://bucket/prefix' for explicit remote
    // false = local-only
  },
});
```

### Conditional skipping with dependency continuation

This is the killer feature that makes declarative CI painful in GitHub Actions and even CircleCI. The problem: "Task B depends on Task A. Task A's condition is false so it's skipped. What happens to Task B?"

**GitHub Actions:** B is blocked forever. You need ugly `if: always() && (needs.A.result == 'success' || needs.A.result == 'skipped')` on every downstream job.

**CircleCI:** Added `terminal` status to fix this, but it's per-dep and still YAML.

**`vtz ci` approach — `skip: 'continue'` (default) vs `skip: 'block'`:**

When a task's `cond` evaluates to false, the task is skipped. By default, **dependents continue as if the skipped task succeeded.** This is almost always what you want — "if nothing changed in native/, skip rust-checks, but don't block the rest of CI."

```typescript
tasks: {
  // Default behavior: skip='continue' (implicit)
  // If native/ hasn't changed, this is skipped and dependents proceed
  'build-image': task({
    command: 'docker build -t myapp .',
    cond: cond.changed('Dockerfile', 'src/**'),
  }),

  // This runs even if build-image was skipped
  // (it just uses the existing deployed image)
  'deploy-api': task({
    command: 'kubectl apply -f k8s/',
    deps: ['build-image'],
  }),

  // Explicit block: if build-image is skipped, do NOT run push-image
  'push-image': task({
    command: 'docker push myapp:latest',
    deps: [{ task: 'build-image', on: 'success' }], // only run if build-image actually ran and succeeded
  }),
}
```

**Dependency edge types:**

| Syntax | Behavior when upstream skipped | Behavior when upstream fails |
|---|---|---|
| `'taskName'` (string) | **Continue** — downstream runs | **Block** — downstream skipped |
| `{ task: 'taskName', on: 'success' }` | **Block** — downstream skipped | **Block** — downstream skipped |
| `{ task: 'taskName', on: 'always' }` | **Continue** — downstream runs | **Continue** — downstream runs |
| `{ task: 'taskName', on: 'failure' }` | **Skip** — downstream skipped | **Continue** — downstream runs |
| `{ task: 'taskName', on: (result) => boolean }` | **Callback decides** | **Callback decides** |

The default (bare string) is the 90% case: "run after this task, but don't block me if it was skipped." The string shortcuts handle the next 8%. The **callback form** handles everything else — and this is where `vtz ci` becomes fundamentally better than any YAML-based CI.

**The callback receives a `TaskResult` with full context — not a pseudo-expression language, actual JavaScript:**

```typescript
interface TaskResult {
  status: 'success' | 'failed' | 'skipped';
  exitCode: number | null;    // null if skipped
  duration: number;            // ms, 0 if skipped
  package: string | null;      // null for root-scoped tasks
  task: string;
  cached: boolean;
}

type Dep = string | DepEdge;

interface DepEdge {
  task: string;
  /**
   * When to run this dependent.
   * - 'success': only if upstream ran AND succeeded
   * - 'always': run regardless of upstream outcome
   * - 'failure': only if upstream ran AND failed
   * - callback: receives TaskResult, returns boolean — full programmatic control
   */
  on: 'success' | 'always' | 'failure' | ((result: TaskResult) => boolean);
}
```

**Callback examples — things impossible in GitHub Actions:**

```typescript
tasks: {
  'deploy-canary': task({
    command: 'deploy --canary',
    deps: ['build'],
  }),

  // Only promote to full deploy if canary was fast enough
  'deploy-full': task({
    command: 'deploy --full',
    deps: [{
      task: 'deploy-canary',
      on: (result) => result.status === 'success' && result.duration < 60_000,
    }],
  }),

  // Rollback if deploy took too long (timeout) or failed
  'rollback': task({
    command: 'deploy --rollback',
    deps: [{
      task: 'deploy-full',
      on: (result) => result.status === 'failed' || result.duration > 120_000,
    }],
  }),

  // Only run expensive E2E tests if the build wasn't cached
  // (if it was cached, nothing changed, E2E already passed)
  'e2e-tests': task({
    command: 'playwright test',
    deps: [{
      task: 'build',
      on: (result) => result.status === 'success' && !result.cached,
    }],
  }),
}
```

**Callbacks are real JavaScript, evaluated locally.** No proprietary expression language, no surprises. You can test them, debug them, refactor them. This is the core advantage of TypeScript-defined CI over YAML.

### Deploy orchestration example

The pain point: deploying services with conditional steps and rollbacks. In GitHub Actions this requires dozens of `if:` conditions and `needs:` with status checks. In `vtz ci`:

```typescript
import { pipe, task, cond } from '@vertz/ci';

export default pipe({
  tasks: {
    'build-api': task({
      command: 'docker build -t api:$SHA .',
      cond: cond.changed('services/api/**', 'shared/**'),
      cache: {
        inputs: ['services/api/**', 'shared/**', 'Dockerfile.api'],
        outputs: ['.docker-cache/api'],
      },
    }),

    'build-web': task({
      command: 'docker build -t web:$SHA .',
      cond: cond.changed('services/web/**', 'shared/**'),
      cache: {
        inputs: ['services/web/**', 'shared/**', 'Dockerfile.web'],
        outputs: ['.docker-cache/web'],
      },
    }),

    'push-images': task({
      steps: [
        'docker push api:$SHA',
        'docker push web:$SHA',
      ],
      // Only push if at least one image was actually built (not skipped)
      deps: [
        { task: 'build-api', on: 'success' },
        { task: 'build-web', on: 'success' },
      ],
    }),

    'migrate-db': task({
      command: 'npx prisma migrate deploy',
      cond: cond.changed('prisma/**'),
    }),

    'deploy-api': task({
      command: 'kubectl rollout restart deployment/api',
      // Runs after push-images and migrate-db, even if either was skipped
      deps: ['push-images', 'migrate-db'],
    }),

    'deploy-web': task({
      command: 'kubectl rollout restart deployment/web',
      deps: ['push-images'],
    }),

    'smoke-test': task({
      command: 'npm run test:smoke',
      timeout: 120_000,
      deps: ['deploy-api', 'deploy-web'],
    }),

    // Callback: rollback if smoke-test failed OR took suspiciously long
    'rollback': task({
      command: 'kubectl rollout undo deployment/api && kubectl rollout undo deployment/web',
      deps: [{
        task: 'smoke-test',
        on: (result) => result.status === 'failed' || result.duration > 90_000,
      }],
    }),
  },

  workflows: {
    deploy: {
      run: [
        'build-api', 'build-web', 'push-images',
        'migrate-db', 'deploy-api', 'deploy-web',
        'smoke-test', 'rollback',
      ],
    },
  },
});
```

**What happens when only `services/web/` changed:**
1. `build-api` → skipped (cond false), dependents continue
2. `build-web` → runs (cond true)
3. `push-images` → runs (build-web succeeded, build-api skipped but `on: 'success'` requires actual success — so only pushes web? No, push-images has `on: 'success'` for BOTH deps, meaning it only runs if at least one ran successfully)
4. `migrate-db` → skipped (no prisma changes), dependents continue
5. `deploy-api` → runs (deps are bare strings, so skip=continue)
6. `deploy-web` → runs
7. `smoke-test` → runs
8. `rollback` → Rust sends smoke-test's TaskResult to Bun, callback evaluates `result.status === 'failed' || result.duration > 90_000` → returns `false` → rollback skipped

This is **impossible to express cleanly** in GitHub Actions YAML. The `if:` conditions would require checking `needs.*.result` for every upstream job, with special handling for skipped vs failed vs success. The duration-based rollback trigger is completely impossible in GitHub Actions — there's no expression syntax for "upstream job duration."

### Dependency syntax: `^task` vs `task`

| Syntax | Meaning | Example |
|---|---|---|
| `'build'` | Run the `build` task in **this same package** first | `deps: ['build']` = "my own build must finish before this task runs" |
| `'^build'` | Run the `build` task in **all dependency packages** first (topological) | `deps: ['^build']` = "build my npm dependencies before building me" |
| `'^build', 'build'` | Both: build deps, then build self, then run this task | Common for `test` — needs built deps AND own build |

**Constraint:** `scope: 'root'` tasks cannot use `'^...'` deps (topological deps are per-package). This is enforced at the type level.

**Circular dependency detection:** The Rust binary detects cycles in the task DAG at config load time and reports the cycle path clearly:
```
error: circular dependency detected
  build (@vertz/ui) → build (@vertz/ui-server) → build (@vertz/ui)
```

### CLI interface

`vtz ci` is a new top-level subcommand, alongside `vtz dev`, `vtz test`, `vtz install`, etc. Since `vtz run` is already taken (runs package.json scripts), `vtz ci` is the entry point for task orchestration.

```bash
# Run a workflow
vtz ci ci                         # Run 'ci' workflow
vtz ci ci --all                   # Override filter: run on all packages
vtz ci ci:full                    # Run ci:full workflow

# Run a single task
vtz ci build                      # Run build in all packages
vtz ci test --scope @vertz/ui     # Run test on specific package
vtz ci test --scope '@vertz/ui*'  # Glob matching on package names

# Change detection
vtz ci affected                   # List affected packages
vtz ci affected --base main       # Compare against main branch
vtz ci affected --json            # JSON output for scripting

# Cache management
vtz ci cache status               # Show cache stats (size, hit rate)
vtz ci cache clean                # Clear local cache
vtz ci cache push                 # Push local cache to remote

# Debug
vtz ci graph                      # Print task execution graph
vtz ci graph --dot                # Graphviz DOT format
vtz ci ci --dry-run               # Show what would run without executing

# Verbosity
vtz ci ci --verbose               # Show cache keys, file hashes, timing details
vtz ci ci --quiet                 # Only show failures and summary
vtz ci ci --log-level debug       # Most verbose: includes config loading, git ops
```

**CLI override precedence:** CLI flags override config values. `vtz ci ci --all` overrides `filter: 'affected'` in the workflow config. `--scope @vertz/ui` filters to a specific package regardless of config.

**CLI structure in Rust** (follows existing vtz pattern):

```rust
// cli.rs — new variant in Command enum
#[derive(Subcommand, Debug)]
pub enum Command {
    // ... existing commands (Dev, Test, Install, Run, etc.)
    /// Monorepo CI task orchestration
    Ci(CiArgs),
}

#[derive(Parser, Debug)]
pub struct CiArgs {
    #[command(subcommand)]
    pub command: CiCommand,
}

#[derive(Subcommand, Debug)]
pub enum CiCommand {
    /// Run a workflow or task by name
    Run(CiRunArgs),    // vtz ci <name> desugars to this
    /// List affected packages
    Affected(AffectedArgs),
    /// Cache management
    Cache(CiCacheArgs),
    /// Print task execution graph
    Graph(GraphArgs),
}
```

**Routing in main.rs:**
```rust
Command::Ci(args) => {
    ci::execute(args, &root_dir).await?;
}
```

### TypeScript SDK types

```typescript
// @vertz/pipe — public API

export interface PipeConfig {
  /**
   * Environment variable names that must exist before execution starts.
   * Fail-fast: if any secret is missing, vtz ci exits immediately with an error
   * listing which secrets are unset — before any task runs.
   * Values are redacted ('[REDACTED]') in all CLI output and NDJSON logs.
   */
  secrets?: string[];
  /** Workspace configuration. Auto-detected if omitted. */
  workspace?: WorkspaceConfig;
  /** Task definitions. Accepts TaskConfig objects or bare command strings. */
  tasks: Record<string, TaskDef>;
  /** Named workflows (groups of tasks) */
  workflows?: Record<string, WorkflowConfig>;
  /** Cache configuration */
  cache?: CacheConfig;
}

/**
 * A task is either a command task (single command) or a steps task (sequential commands).
 * These are mutually exclusive — you cannot specify both `command` and `steps`.
 */
export type TaskDef = CommandTask | StepsTask;

interface TaskBase {
  /**
   * Task dependencies.
   * - String: '^taskName' = topological (deps first), 'taskName' = same package.
   *   Default behavior: if upstream is skipped (cond false), dependents continue.
   * - Object: { task: 'name', on: 'success' | 'always' | 'failure' } for explicit control.
   */
  deps?: Dep[];
  /** Condition for running this task. Omit = always run. */
  cond?: Condition;
  /** Cache configuration for this task */
  cache?: TaskCacheConfig;
  /** Environment variables passed to the command */
  env?: Record<string, string>;
  /** Timeout in milliseconds (default: no timeout) */
  timeout?: number;
}

/**
 * Dependency edge.
 * - string: "run after this, skip=continue" (default, covers 90% of cases)
 * - DepEdge: explicit control via shortcut or callback
 */
type Dep = string | DepEdge;

/** Result of an upstream task, passed to callback conditions. */
interface TaskResult {
  status: 'success' | 'failed' | 'skipped';
  exitCode: number | null;    // null if skipped
  duration: number;            // ms, 0 if skipped
  package: string | null;      // null for root-scoped tasks
  task: string;
  cached: boolean;
}

interface DepEdge {
  task: string;
  /**
   * When to run this dependent based on upstream outcome.
   *
   * Shortcuts (evaluated in Rust, no JS bridge needed):
   * - 'success': only if upstream ran AND succeeded
   * - 'always': run regardless of upstream outcome
   * - 'failure': only if upstream ran AND failed
   *
   * Callback (evaluated in the Bun process via NDJSON bridge):
   * - (result: TaskResult) => boolean — full programmatic control
   *
   * The callback receives the upstream's TaskResult and returns
   * true to run the dependent, false to skip it.
   * This is real JavaScript — testable, debuggable, no pseudo-expression language.
   */
  on: 'success' | 'always' | 'failure' | ((result: TaskResult) => boolean);
}

/** Task with a single command. Can run per-package or at root. */
export type CommandTask =
  | (TaskBase & { command: string; steps?: never; scope?: 'package' })
  | (TaskBase & { command: string; steps?: never; scope: 'root'; deps?: RootDep[] });

/** Task with sequential commands (stop on first failure). Can run per-package or at root. */
export type StepsTask =
  | (TaskBase & { steps: string[]; command?: never; scope?: 'package' })
  | (TaskBase & { steps: string[]; command?: never; scope: 'root'; deps?: RootDep[] });

/**
 * Root-scoped tasks cannot have topological deps (^prefix).
 * This type excludes strings starting with ^.
 */
type RootDep = string & { __brand?: 'rootDep' };
// Runtime validation rejects '^...' deps on root tasks.
// TypeScript branding provides documentation intent; the Rust binary enforces it.

export interface TaskCacheConfig {
  /** Glob patterns for cache key inputs (relative to package root) */
  inputs: string[];
  /** Glob patterns for cached outputs (relative to package root) */
  outputs: string[];
}

export interface WorkflowConfig {
  /** Tasks to run in this workflow */
  run: string[];
  /** Package filter. Default: 'all'. */
  filter?: WorkflowFilter;
  /** Environment variables for all tasks in this workflow */
  env?: Record<string, string>;
}

/**
 * Package filter for workflows.
 * - 'affected': only packages with changes (or transitive deps of changed packages)
 * - 'all': every package
 * - string[]: specific package names or glob patterns
 */
export type WorkflowFilter = 'affected' | 'all' | string[];

export interface CacheConfig {
  /** Local cache directory (default: '.pipe/cache') */
  local?: string;
  /** Remote cache URL (s3://, r2://, gcs://) or false to disable */
  remote?: string | false;
  /** Max local cache size in MB (default: 2048). LRU eviction when exceeded. */
  maxSize?: number;
}

/**
 * Condition builders — renamed from `when` to avoid collision with
 * the extremely common `when` variable name in tests and general code.
 */
export type Condition = ChangedCondition | BranchCondition | EnvCondition | AllCondition | AnyCondition;

interface ChangedCondition { type: 'changed'; patterns: string[] }
interface BranchCondition { type: 'branch'; names: string[] }
interface EnvCondition { type: 'env'; name: string; value?: string }
interface AllCondition { type: 'all'; conditions: Condition[] }
interface AnyCondition { type: 'any'; conditions: Condition[] }

export declare const cond: {
  /** Run only when matching files changed (relative to repo root) */
  changed(...patterns: string[]): ChangedCondition;
  /** Run only on specific branches */
  branch(...names: string[]): BranchCondition;
  /** Run only when env var is set (optionally matching a value) */
  env(name: string, value?: string): EnvCondition;
  /** All conditions must be true */
  all(...conditions: Condition[]): AllCondition;
  /** Any condition must be true */
  any(...conditions: Condition[]): AnyCondition;
};

/** Config builder — validates and returns the config object. */
export declare function pipe(config: PipeConfig): PipeConfig;

/**
 * Task builder with shorthand overload.
 * task('bun test') is equivalent to task({ command: 'bun test' })
 */
export declare function task(config: TaskDef): TaskDef;
export declare function task(command: string): CommandTask;
```

### Invalid usage (compile-time safety)

```typescript
import { pipe, task, cond } from '@vertz/ci';

pipe({
  tasks: {
    // @ts-expect-error — command and steps are mutually exclusive
    build: task({ command: 'bun run build', steps: ['step1', 'step2'] }),

    // @ts-expect-error — cache requires both inputs AND outputs
    test: task({ command: 'bun test', cache: { inputs: ['src/**'] } }),
  },
});

// Runtime validation (Rust binary):
// - '^build' dep on scope:'root' task → error with clear message
// - deps referencing non-existent task names → error listing available tasks
// - circular dependency → error showing the cycle path
```

### Steps failure semantics

Tasks with `steps: [...]` execute commands sequentially. **Stop on first failure** — if step N fails (non-zero exit), steps N+1..M are skipped and the task is marked as failed. This matches `&&` semantics in shell.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                vtz binary (native/vtz/)                  │
│  ┌────────────────────────────────────────────────────┐  │
│  │              src/ci/ module                      │  │
│  ├──────────┬──────────┬──────────┬─────────┬─────────┤  │
│  │  Config  │Workspace │  Change  │  Task   │  Cache  │  │
│  │  Loader  │ Resolver │ Detector │Scheduler│ Manager │  │
│  │  + Bun   │          │          │         │         │  │
│  │  Bridge  │ pkg.json │ git diff │ Build   │ sha2    │  │
│  │ (NDJSON) │ Cargo    │ 3-dot    │ DAG     │ hash    │  │
│  │ callback │ .toml    │ staged+  │ topo    │ tar+zstd│  │
│  │ eval     │ dep graph│ untracked│ parallel│ GH/S3   │  │
│  └─────┬────┴────┬─────┴────┬─────┴────┬────┴────┬────┘  │
│        │         │          │          │         │        │
│  Reuses: sha2, tar, walkdir, tokio, clap, serde_json     │
└────────┼─────────┼──────────┼──────────┼─────────┼────────┘
         ▼         ▼          ▼          ▼         ▼
      pipe.     package.   .git/      shell     .pipe/
      config.ts json       objects    (sh -c)   cache/
      (Bun stays alive for callback evaluation)
```

### Module structure (follows `pm/` pattern)

```
native/vtz/src/ci/
├── mod.rs           # Public API: execute(), entry point for CLI routing
├── config.rs        # Config loading + Bun bridge (NDJSON protocol, callback eval)
├── workspace.rs     # Workspace resolution (pkg.json + Cargo workspaces)
├── changes.rs       # Git-based change detection
├── graph.rs         # Task DAG construction + cycle detection
├── scheduler.rs     # Parallel task execution with work-stealing
├── cache.rs         # Content-addressable cache (hash, store, restore, evict)
├── types.rs         # Shared types (TaskConfig, WorkflowConfig, etc.)
├── output.rs        # Terminal output (progress, buffered task output)
└── logs.rs          # Structured NDJSON execution logs
```

### Component breakdown

**1. Config Loader + Callback Bridge** (`config.rs`)

Spawns `bun` (or `node --import tsx` as fallback) to evaluate `ci.config.ts`. Unlike a simple "eval and exit" approach, the Bun process **stays alive** during execution to evaluate dep callbacks. This is the key architecture choice that enables real JavaScript logic in dependency conditions.

**Two-phase protocol over stdin/stdout (NDJSON):**

```
Phase 1: Config loading
─────────────────────────────────────────────────────
Rust spawns Bun with loader script
  │
  Bun evaluates ci.config.ts
  │ ── registers callbacks (functions) by ID ──►  callback registry
  │ ── serializes config (JSON, callbacks → IDs) to stdout
  │
  Rust reads config JSON, builds task graph
  │
Phase 2: Execution (Bun stays alive)
─────────────────────────────────────────────────────
Rust executes tasks...
  │
  When a dep edge has a callback:
  │
  Rust ──► stdin:  {"eval": 3, "result": {"status":"failed","exitCode":1,...}}
  Bun  ──► stdout: {"eval": 3, "value": true}
  │
  Rust uses boolean to decide if dependent runs
  │
Phase 3: Cleanup
─────────────────────────────────────────────────────
Rust ──► stdin:  {"shutdown": true}
Bun process exits
```

**How callbacks are serialized:** The `pipe()` function in the TS SDK intercepts function values in `on:` fields. Each function is assigned a numeric ID and stored in a callback registry (a JS Map). The serialized config replaces the function with `{ type: 'callback', id: 3 }`. When the Rust binary needs to evaluate it, it sends the ID + TaskResult context over stdin, and the Bun process looks up the function, calls it with the result, and returns the boolean.

**The loader script:**
```typescript
const callbacks = new Map<number, (result: TaskResult) => boolean>();
let nextId = 0;

// The pipe() SDK function registers callbacks during config construction
globalThis.__pipeRegisterCallback = (fn: Function) => {
  const id = nextId++;
  callbacks.set(id, fn as (result: TaskResult) => boolean);
  return id;
};

const config = (await import(process.argv[2])).default;
if (!config || typeof config !== 'object') {
  process.stderr.write('error: ci.config.ts must export default a pipe({...}) config\n');
  process.exit(1);
}

// Phase 1: send config
process.stdout.write(JSON.stringify({ type: 'config', data: config }) + '\n');

// Phase 2: listen for callback evaluations
const rl = createInterface({ input: process.stdin });
for await (const line of rl) {
  const msg = JSON.parse(line);
  if (msg.shutdown) break;
  if (msg.eval != null) {
    const fn = callbacks.get(msg.eval);
    try {
      const value = fn ? fn(msg.result) : false;
      process.stdout.write(JSON.stringify({ eval: msg.eval, value: !!value }) + '\n');
    } catch (err) {
      process.stdout.write(JSON.stringify({ eval: msg.eval, error: String(err) }) + '\n');
    }
  }
}
```

**Important constraints on callbacks:**
- Callbacks should be **pure and fast** (< 100ms). They receive a read-only `TaskResult` and return a boolean.
- If a callback throws, the dependent is **blocked** (safe default). The error is reported in the CLI output.
- Callbacks run in the same Bun process that loaded the config — they have access to the same `process.env`, imports, etc.
- No string shortcuts (`'success'`, `'always'`, `'failure'`) ever go through the Bun process — they're evaluated entirely in Rust. The Bun bridge is only used for function callbacks.

**Secrets validation (fail-fast):**
After config is loaded and before any task executes, the Rust binary checks that every env var listed in `secrets: [...]` exists in the environment. If any are missing, it prints a clear error and exits immediately:
```
error: missing required secrets
  NPM_TOKEN    — not set
  DATABASE_URL — not set
```
During execution, secret values are redacted in all output: CLI logs, NDJSON execution logs, and task stdout/stderr. The redaction replaces exact matches of the secret value with `[REDACTED]`. Secret values are also excluded from cache key computation (only the secret name is included, not its value).

**Error handling:**
- If Bun/Node not found: clear error message suggesting install
- If config file has syntax/type errors: Bun's error output goes to stderr, `vtz ci` surfaces it
- If config has no default export: loader script exits 1 with message
- If Bun process crashes during execution: all pending callback evaluations fail, dependents are blocked, error is reported

**Runtime resolution order:** `bun` → `node --import tsx` → `node --loader tsx` → error. This ensures `vtz ci` works in non-Bun monorepos for future adoption.

**Environment sensitivity:** Config files can reference `process.env`. The resolved JSON is NOT cached (environment changes between runs).

**2. Workspace Resolver** (`workspace.rs`)

Reads `package.json` `workspaces` field (supports glob patterns and `!` negation). For each matched directory, reads the package's `package.json` to extract `name`, `dependencies`, `devDependencies`. Recognizes `workspace:*`, `workspace:^`, `workspace:~` protocols as local package references. Can reuse vtz's existing workspace resolution from `pm/workspace.rs` — the package manager already solves this problem.

For Rust workspaces: runs `cargo metadata --format-version=1 --no-deps` (structured JSON output, avoids parsing TOML manually). Maps Cargo crate names to directories.

Builds a unified dependency graph across both TS and Rust packages.

**Performance note:** For a 38-package monorepo, this means ~40 file reads (package.json files) + 1 subprocess (cargo metadata). Expected: <50ms total.

**3. Change Detector**

Detects changed files using a three-part strategy:

```bash
# 1. Committed changes (PR diff against base)
git diff --name-only <base>...<head>      # three-dot merge-base diff

# 2. Staged changes (git add'd but not committed)
git diff --cached --name-only

# 3. Untracked files (new files not yet added)
git ls-files --others --exclude-standard
```

**Base ref resolution:**
- In CI (detected via `CI=true` env): uses `origin/main` (or `--base` flag)
- Locally: uses `origin/main` by default (configurable via `--base`)
- The `cond.changed()` condition on individual tasks uses the same base ref as the workflow's `filter: 'affected'`

**Edge cases handled:**
- **Shallow clones:** If `git merge-base` fails (shallow history), falls back to `git diff HEAD~1 --name-only` and warns. The CI example in this doc uses `fetch-depth: 0` (full history) — this is documented as required.
- **Renamed files:** `git diff` reports renames as delete + add. Both old and new paths are considered changed, which correctly marks both source and destination packages as affected.
- **Merge commits:** Three-dot diff (`...`) computes the merge-base automatically, giving the correct set of changes introduced by the branch regardless of merge commits on the base.

Maps each changed file to a package by checking which package directory contains it. A package is "affected" if it has direct file changes OR any of its dependencies (transitive) are affected.

**4. Task Scheduler**

Builds a DAG of `(package, task)` nodes. For each task in a workflow:
- If `scope: 'package'`: creates one node per affected package
- If `scope: 'root'`: creates one node at the repo root
- Resolves `deps`:
  - `'^build'` → edges from this node to `build` nodes in dependency packages
  - `'build'` → edge from this node to the `build` node in the same package

Detects cycles at construction time. Reports the full cycle path in the error message.

Executes via a concurrent work-stealing scheduler:
- Maintains a ready queue of tasks with all dependencies satisfied
- Spawns up to `--concurrency N` (default: number of CPU cores) parallel workers
- Each worker picks a task from the ready queue, executes it, marks it complete, and checks if new tasks became ready

**Process management:**
- Commands run via `sh -c '<command>'` on Unix (consistent behavior across macOS/Linux)
- **Signal handling:** On SIGINT (Ctrl+C), sends SIGTERM to all running child processes, waits up to 5s for graceful shutdown, then SIGKILL. Partial results are reported.
- **Output buffering:** Each task's stdout/stderr is **buffered per-task** and replayed after completion (like Turborepo). Live streaming available via `--verbose` flag. This prevents interleaved output from parallel tasks.
- **Exit codes:** `vtz ci` exits with code 1 if any task fails. The summary shows which tasks failed and their exit codes.

**5. Cache Manager**

For each `(package, task)` pair with `cache` config:

**Cache key computation:**
```
sha256(
  command or steps (string),
  sorted env vars (key=value pairs),
  hash of each input file (content only, no metadata),
  pipe CLI version,
  platform (os + arch),
  lockfile hash (bun.lock or Cargo.lock — captures tool/dep versions)
)
```

Including `platform` prevents cross-platform cache poisoning (macOS `.node` files on Linux). Including the lockfile captures tool version changes (Bun upgrade, dep changes) without needing to list every tool version explicitly.

**Cache storage:** Outputs are packed with `tar + zstd` compression, stored at `.pipe/cache/<hex-key>.tar.zst`. On cache hit: extract outputs to the package directory.

**LRU eviction:** When local cache exceeds `maxSize` (default: 2GB), evict least-recently-used entries. Cache metadata (access time, size) stored in `.pipe/cache/manifest.json`.

**File permissions:** tar preserves file permissions. Symlinks inside output directories are followed (stored as regular files) to prevent dangling symlinks on restore.

**Fallback cache keys (inspired by CircleCI):** Cache lookup uses ordered key matching, not just exact:

```
1. Exact:  pipe-v1-linux-x64-build-@vertz/ui-<full-sha256>     → exact hit
2. Partial: pipe-v1-linux-x64-build-@vertz/ui-                  → partial hit (stale but useful)
3. Cross:   pipe-v1-linux-x64-build-                             → any build cache for this platform
```

A partial hit restores the cached outputs and marks the task as "stale cache restored — re-executing." The task runs but benefits from warm caches (e.g., `node_modules/.cache`, incremental TypeScript compilation). This is a huge win compared to GitHub Actions' all-or-nothing matching.

### GitHub Actions Cache Integration

**This is a first-class remote cache backend, not an afterthought.** When running inside GitHub Actions, `vtz ci` auto-detects the cache API and uses it as the remote cache — zero configuration needed.

**How it works:**

The GitHub Actions runner provides three env vars to JavaScript actions:
- `ACTIONS_CACHE_URL` — base URL for the cache API
- `ACTIONS_RESULTS_URL` — base URL for the v2 (Twirp/protobuf) cache API
- `ACTIONS_RUNTIME_TOKEN` — JWT bearer token (valid 6h)

These are NOT available to `run:` shell steps by default. A small setup step exposes them:

```yaml
# .github/workflows/ci.yml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: oven-sh/setup-bun@v2
      - name: Expose cache env vars
        uses: actions/github-script@v7
        with:
          script: |
            core.exportVariable('ACTIONS_CACHE_URL', process.env.ACTIONS_CACHE_URL || '');
            core.exportVariable('ACTIONS_RESULTS_URL', process.env.ACTIONS_RESULTS_URL || '');
            core.exportVariable('ACTIONS_RUNTIME_TOKEN', process.env.ACTIONS_RUNTIME_TOKEN || '');
      - run: bun install
      - run: vtz ci ci
        # vtz ci auto-detects ACTIONS_CACHE_URL and uses GitHub's cache
```

**Rust implementation:** Use Apache OpenDAL's `Ghac` service (Apache 2.0, production-tested by Mozilla's sccache). It handles both v1 (JSON REST) and v2 (Twirp/protobuf) APIs, including direct Azure Blob signed URL uploads for v2. Add `opendal` with `services-ghac` feature to Cargo.toml.

**Cache API flow:**
```
vtz ci ci
  │
  ├── Task needs cache restore
  │   ├── Check local: .pipe/cache/<key>.tar.zst
  │   ├── Miss → Check GitHub Actions cache API (GET /cache?keys=...)
  │   ├── Hit → Download from Azure Blob signed URL
  │   └── Extract to package directory
  │
  ├── Task executes...
  │
  └── Task outputs need caching
      ├── tar+zstd outputs
      ├── Save to local: .pipe/cache/<key>.tar.zst
      └── Push to GitHub Actions cache (POST /caches + PATCH chunks + POST finalize)
```

**GitHub cache scoping (important for monorepos):**
- PR branch can read caches from: own branch + base branch + default branch (main)
- PR branch CANNOT read caches from other PRs
- Main branch caches are shared across all PRs (warm cache for common deps)
- 10 GB limit per repo, 7-day eviction for unused entries

**Cache key design for GitHub:**
```
pipe-v1-{os}-{arch}-{task}-{package}-{inputs_hash}
```
With restore keys:
```
pipe-v1-{os}-{arch}-{task}-{package}-
pipe-v1-{os}-{arch}-{task}-
```

This means: exact match first, then any cache for the same task+package (partial/stale), then any cache for the same task across packages. The fallback strategy ensures CI almost always has a warm cache.

**Backend abstraction:** The cache manager uses a `CacheBackend` trait:
```rust
trait CacheBackend: Send + Sync {
    async fn get(&self, key: &str, restore_keys: &[&str]) -> Option<(String, Vec<u8>)>;
    async fn put(&self, key: &str, data: &[u8]) -> Result<()>;
}
```
Implementations: `LocalFs`, `GitHubActions` (via OpenDAL Ghac), `S3` (via OpenDAL S3). The `'auto'` remote config resolves to `GitHubActions` when env vars are present, else `LocalFs`-only.

## SaaS-Forward Architecture

These decisions are made now to keep the SaaS path open, even though the SaaS itself is not in scope:

1. **Structured execution logs.** Every run produces a NDJSON log at `.pipe/logs/<run-id>.jsonl` with: task name, package, start/end timestamps, cache hit/miss, exit code, duration. This is the data a future dashboard would display.

2. **Well-defined cache manifest format.** Each cache entry has a JSON manifest: `{ key, inputs_hash, command, platform, created_at, size_bytes }`. This format is the contract between local and remote cache.

3. **Execution metadata in CLI output.** `pipe run ci --json` outputs structured JSON (task graph, execution results, cache stats) suitable for machine consumption. A future SaaS agent could parse this directly.

4. **Run IDs.** Each execution gets a unique run ID (ULID). Logs, cache entries, and output reference this ID. Enables correlation across distributed runs.

## Unknowns

| Unknown | Resolution path |
|---|---|
| **Config loading performance** — Is spawning Bun for config eval fast enough? | Measure in Phase 1. If >500ms, consider caching the serialized JSON keyed by config file hash. Expected: ~100ms. |
| **Remote cache protocol** — S3-compatible? Custom protocol? | **Resolved:** Primary backend is GitHub Actions Cache API (via OpenDAL `Ghac`). S3/R2 as secondary option. `CacheBackend` trait abstracts both. |
| **Cargo workspace integration** — How well does `cargo metadata` handle edge cases? | POC in Phase 1. The structured JSON output is well-documented. |
| **Cross-platform hashing** — Will content hashes match between macOS (dev) and Linux (CI)? | Use content-only hashing, normalize line endings. Test in Phase 4 with CI integration. Platform is part of the cache key anyway, so cross-platform cache sharing is opt-in. |
| **`cond` API evolution** — The current condition types are simple. Will they need breaking changes when workflow triggers arrive? | Acceptable — pre-v1 breaking changes are encouraged (see policies). The discriminated union design is extensible (add new `type` variants). |

## POC Results

No POC yet — this is the initial design. POC work will happen in Phase 1 (config loading, workspace resolution, basic execution).

## Type Flow Map

The TypeScript SDK is a configuration DSL. Type flow is straightforward:

```
PipeConfig
  ├── tasks: Record<string, TaskDef>
  │     └── TaskDef = CommandTask | StepsTask (discriminated union)
  │           ├── command: string (CommandTask only)
  │           ├── steps: string[] (StepsTask only)
  │           ├── deps: Dep[] (string | DepEdge, or RootDep[] when scope:'root')
  │           ├── cond: Condition (discriminated union by 'type')
  │           │     ├── ChangedCondition { type:'changed', patterns:string[] }
  │           │     ├── BranchCondition { type:'branch', names:string[] }
  │           │     ├── EnvCondition { type:'env', name:string, value?:string }
  │           │     ├── AllCondition { type:'all', conditions:Condition[] }
  │           │     └── AnyCondition { type:'any', conditions:Condition[] }
  │           └── cache: TaskCacheConfig { inputs:string[], outputs:string[] }
  ├── workflows: Record<string, WorkflowConfig>
  │     ├── run: string[] (validated against task names at runtime by Rust)
  │     ├── filter: WorkflowFilter = 'affected' | 'all' | string[]
  │     └── env: Record<string, string>
  └── cache: CacheConfig { local:string, remote:string|false, maxSize:number }
```

**Type-level tests needed:**
- `pipe()` accepts valid config with CommandTask
- `pipe()` accepts valid config with StepsTask
- `task()` rejects `command` + `steps` together (discriminated union)
- `task(string)` shorthand returns CommandTask
- `cond.*` builders return correct discriminated union variants
- `cache` requires both `inputs` and `outputs` (no partial)
- `WorkflowFilter` accepts `'affected'`, `'all'`, and `string[]`
- `deps` accepts bare strings and `DepEdge` objects
- `DepEdge.on` only accepts `'success' | 'always' | 'failure'`

**Runtime validations (Rust binary, not TS types):**
- `'^...'` deps on `scope: 'root'` tasks → error
- `deps` / `workflow.run` referencing non-existent task names → error with available names
- Circular dependencies → error with cycle path
- `cond.changed()` patterns that match no files → warning

## E2E Acceptance Test

### Developer walkthrough: replacing turbo for the vertz monorepo

```typescript
// ci.config.ts at repo root
import { pipe, task, cond } from '@vertz/ci';

export default pipe({
  tasks: {
    build: task({
      command: 'bun run build',
      deps: ['^build'],
      cache: {
        inputs: ['src/**', 'package.json', 'tsconfig.json', 'bunup.config.ts'],
        outputs: ['dist/**'],
      },
    }),
    test: task({
      command: 'bun test',
      deps: ['^build', 'build'],
    }),
    typecheck: task({
      command: 'bun run typecheck',
      deps: ['^build'],
    }),
    lint: task({
      command: 'oxlint packages/ && oxfmt --check packages/',
      scope: 'root',
    }),
    'rust-fmt': task({
      cond: cond.changed('native/**'),
      scope: 'root',
      command: 'cd native && cargo fmt --all -- --check',
    }),
    'rust-clippy': task({
      cond: cond.changed('native/**'),
      scope: 'root',
      command: 'cd native && cargo clippy --all-targets --release -- -D warnings',
    }),
    'rust-test': task({
      cond: cond.changed('native/**'),
      scope: 'root',
      command: 'cd native && cargo test --all',
    }),
  },

  workflows: {
    ci: {
      run: ['lint', 'build', 'typecheck', 'test', 'rust-fmt', 'rust-clippy', 'rust-test'],
      filter: 'affected',
    },
  },

  cache: {
    local: '.pipe/cache',
  },
});
```

### CLI session (expected output)

```bash
$ vtz ci ci
[pipe] Loading ci.config.ts...
[pipe] Workspace: 28 packages, 3 native crates
[pipe] Changes (vs origin/main): 4 files in 2 packages (@vertz/ui, @vertz/ui-server)
[pipe] Affected: @vertz/ui, @vertz/ui-server, @vertz/ui-primitives (transitive)
[pipe] Skipping rust-fmt, rust-clippy, rust-test (condition: no native changes)
[pipe] Task graph: 14 tasks (3 cached, 8 to run, 3 skipped)

 ✓ lint                         2.1s
 ● build  @vertz/core           cached
 ● build  @vertz/schema         cached
 ✓ build  @vertz/ui             1.8s
 ✓ build  @vertz/ui-server      2.3s
 ● build  @vertz/ui-primitives  cached
 ✓ typecheck @vertz/ui          4.1s
 ✓ typecheck @vertz/ui-server   3.8s
 ✓ test   @vertz/ui             6.2s
 ✓ test   @vertz/ui-server      8.4s
 ✓ test   @vertz/ui-primitives  3.1s

[pipe] Done in 12.4s (3 cached, 8 executed, 3 skipped)
       Cache saved ~4.2s

# Run ID: 01JQXYZ... (log: .pipe/logs/01JQXYZ....jsonl)
```

```bash
# Second run, no changes
$ vtz ci ci
[pipe] Loading ci.config.ts...
[pipe] Changes (vs origin/main): none
[pipe] All packages up-to-date. Nothing to run.
[pipe] Done in 0.1s

# Show what would run
$ vtz ci ci --dry-run
[pipe] Dry run — no commands will be executed

 → lint                         oxlint packages/ && oxfmt --check packages/
 → build  @vertz/ui             bun run build (deps: @vertz/core, @vertz/schema)
 → build  @vertz/ui-server      bun run build (deps: @vertz/ui)
 ...

# List affected packages
$ vtz ci affected --base main
@vertz/ui
@vertz/ui-server
@vertz/ui-primitives (transitive)

# Machine-readable output
$ vtz ci ci --json > results.json
```

### GitHub Actions (minimal wrapper)

The logic that was in 490 lines of YAML (change detection, conditional jobs, filtering) moves into `ci.config.ts` — testable, type-safe, version-controlled as code. The YAML becomes a thin wrapper:

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request, push]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }  # full git history for change detection
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: vtz ci ci
```

## Implementation Phases (high-level)

Detailed phase files will be created in `plans/pipe/` after design approval.

### Phase 1: Foundation — `ci/` module + Config + Workspace
- New module at `native/vtz/src/ci/` (mod.rs, config.rs, workspace.rs, types.rs)
- `Ci(CiArgs)` variant in `Command` enum, wired in main.rs
- Config loading via Bun (spawn + sentinel markers + fallback to Node)
- Workspace resolver (reuse `pm/workspace.rs` patterns + `workspace:*` protocol)
- Basic sequential task execution (single command, root scope)
- CLI: `vtz ci <task>`
- Structured NDJSON execution logs from day 1

### Phase 2: Task Graph + Parallelism + Conditional Skip
- DAG construction with topological deps (`^` prefix) in `graph.rs`
- Cycle detection with clear error messages
- **Dependency edge types:** bare string (skip=continue) + `DepEdge` (`on: 'success' | 'always' | 'failure'`)
- **Conditional skip propagation:** when a task's `cond` is false, propagate skip to dependents based on edge type
- Parallel execution with work-stealing scheduler in `scheduler.rs`
- Per-package task execution (scope: 'package')
- Output buffering (per-task replay) in `output.rs`
- Signal handling (SIGINT → graceful shutdown)
- CLI: `vtz ci <workflow>`, `vtz ci graph`, `--concurrency`, `--dry-run`

### Phase 3: Change Detection + Affected Filtering
- Git-based change detection (committed + staged + untracked) in `changes.rs`
- File → package mapping
- Transitive affected calculation via dependency graph
- `cond.*` condition evaluation
- Shallow clone fallback + warning
- CLI: `vtz ci affected`, `vtz ci ci --all`/default affected

### Phase 4: Caching (Local + GitHub Actions)
- `CacheBackend` trait with `LocalFs` and `GitHubActions` implementations
- Content hashing (sha2) for files + command + env + platform + lockfile
- tar+zstd storage with permission preservation
- **Fallback cache keys** — ordered prefix matching for partial/stale cache hits
- LRU eviction with configurable max size (local)
- **GitHub Actions cache** via OpenDAL `Ghac` service (auto-detected from env vars)
- CLI: `vtz ci cache status`, `vtz ci cache clean`

### Phase 5: TypeScript SDK Package
- `@vertz/ci` npm package with full type definitions
- `pipe()`, `task()`, `cond.*` builders
- Discriminated union types for compile-time safety
- `Dep` type with string shorthand and `DepEdge` object form
- Type-level tests (`.test-d.ts`)
- README with migration guide from turbo.json

### Phase 6: S3/R2 Remote Cache + Polish
- S3-compatible remote cache backend (via OpenDAL S3 service)
- Cache manifest format (JSON, documented)
- Authentication (env-based credentials for S3/R2)
- GitHub Actions setup action or example
- CLI: `vtz ci cache push`

---

## Resolved Decisions

1. **Subcommand** → `vtz ci`
2. **Config file** → `ci.config.ts` at repo root
3. **Priority** → Parallel track. `vtz test` runs tests in a package; `vtz ci` orchestrates across the monorepo. Complementary.
4. **SaaS** → Not a priority now. Can extract later.
5. **OpenDAL** → Approved. Using Apache OpenDAL `Ghac` service for GitHub Actions cache backend.
6. **Phase ordering** → As designed (6 phases).

## Competitive Comparison

| Feature | `vtz ci` (proposed) | Turborepo | GitHub Actions | CircleCI |
|---|---|---|---|---|
| Config language | **TypeScript** | JSON | YAML | YAML |
| Skip task, continue dependents | **First-class** (bare string deps = skip continues) | N/A (task runner only) | Ugly `if: always()` hacks | `terminal` status (added 2024) |
| Dep conditions | **JS callbacks** with full `TaskResult` (duration, exitCode, cached, etc.) | N/A | Pseudo-expression language (unpredictable) | Compile-time pipeline params only |
| Rollback on failure | **`on: 'failure'` + callback** (e.g., rollback if duration > 90s) | N/A | Manual `if: failure()` per job | `failed`/`canceled` status deps |
| Monorepo change detection | **File-level + transitive deps** | Package-level filter | Manual `dorny/paths-filter` action | Dynamic config + path-filtering orb |
| CI cache | **Auto-detect GitHub Actions cache** + local + S3/R2 | Vercel Remote Cache (paid) or self-hosted | `actions/cache` (manual per-step) | Built-in `save_cache`/`restore_cache` |
| Fallback cache keys | **Ordered prefix matching** | No (exact hash only) | `restore-keys` (prefix match) | **Ordered prefix matching** (best-in-class) |
| Parallel execution | **Work-stealing scheduler** | Concurrent with dep ordering | Per-job parallelism | Per-job + test splitting |
| Local/CI parity | **Identical behavior** | Mostly (no remote cache locally) | Different tools entirely | Different tools entirely |
| Programmable logic | **Full TypeScript** | None | Limited `if:` expressions | Pipeline parameters (compile-time) |

---

## Review Findings Addressed (Rev 2)

### DX Review
| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | blocker | `pipe()` naming convention | Kept `pipe()` — consistent with "no define prefix" feedback. `defineConfig` is a third-party convention (Vite), not a vertz convention. |
| 2 | blocker | `task()` redundancy | Kept `task()` for overload shorthand and type narrowing. `tasks` record also accepts bare objects via `TaskDef` type. |
| 3 | blocker | `command`/`steps` not type-enforced | Fixed — `TaskDef = CommandTask \| StepsTask` discriminated union with `never` on the excluded field. |
| 4 | should-fix | `scope:'root'` + topo deps not enforced | Documented as runtime validation (Rust binary). TS branding provides intent; full type-level enforcement of `^` prefix strings isn't practical. |
| 5 | should-fix | `when` namespace collides | Renamed to `cond` — short, specific, no collision with common variable names. |
| 6 | should-fix | `filter` model incomplete | Expanded: `WorkflowFilter = 'affected' \| 'all' \| string[]` — supports package name patterns. |
| 7 | should-fix | `^` syntax opaque | Added "Dependency syntax" section with table explaining `^task` vs `task`. |
| 8 | should-fix | CLI/config precedence | Added "CLI override precedence" paragraph. CLI flags always win. |
| 9 | should-fix | `services` unspecified | Removed from API. Not in scope — handled externally (Docker Compose, CI services). |
| 10 | should-fix | `steps` failure semantics | Added "Steps failure semantics" section: stop on first failure. |
| 11 | nit | Config file location | Locked in: `ci.config.ts` at repo root. |
| 12 | nit | `dry-run` as subcommand | Changed to `--dry-run` flag on `pipe run`. |
| 13 | nit | Missing verbosity flags | Added `--verbose`, `--quiet`, `--log-level`. |
| 14 | nit | Cache type clarity | `TaskCacheConfig` requires both fields; type is already correct. |
| 15 | nit | Config composition | Added to non-goals: no `mergeConfig()`, plain object spread works. |
| 16 | nit | "Pipe" name collisions | Resolved: renamed to `vtz ci`. No standalone binary. |

### Product/Scope Review
| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | blocker | Resource allocation conflict | Added "Strategic Sequencing" section. Parallel track, lives inside vtz crate reusing existing infra. |
| 2 | should-fix | Conflates task runner / CI runner | Renamed title to "Monorepo Task Runner". Added scope clarification paragraph. |
| 3 | should-fix | Thin competitive moat | Added "Vertz-native integration" section with concrete differentiators (hybrid TS+Rust, vtz test integration, compiler module graph). |
| 4 | should-fix | SaaS not structurally supported | Added "SaaS-Forward Architecture" section: NDJSON logs, cache manifest format, --json output, run IDs. |
| 5 | should-fix | Bun dependency limits market | Config loader now tries bun → node+tsx → error. Runtime-agnostic from day 1. |
| 6 | should-fix | `when` conditions underspecified | `Condition` is now a full discriminated union with 5 variants. Extensible for future phases. |
| 7 | nit | Multi-language non-goal | Added: supports TypeScript and Rust only. |
| 8 | nit | Naming collisions | Resolved — `vtz ci` subcommand. No standalone binary. |
| 9 | nit | 490→10 line claim | Reframed: "logic moves from YAML to type-safe TypeScript." |
| 10 | nit | Phasing is good | Acknowledged, no change needed. |

### Technical Review
| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | blocker | Config loading fragile | Redesigned with sentinel markers, error handling, default export validation, runtime fallback chain. |
| 2 | blocker | Types don't enforce exclusion | Fixed — discriminated union `CommandTask \| StepsTask`. |
| 3 | blocker | `^` syntax ambiguous | Added explicit "Dependency syntax" table. Documented self-ref = error, cycle detection at load time. |
| 4 | should-fix | Change detection edge cases | Added three-part detection (committed + staged + untracked), shallow clone fallback, rename handling, merge-base semantics. |
| 5 | should-fix | Workspace resolution complexity | Documented: glob + negation, `workspace:*` protocol, `cargo metadata` for Rust, performance budget (<50ms). |
| 6 | should-fix | Cache invalidation incomplete | Added: lockfile hash (captures tool versions), platform in cache key, LRU eviction with maxSize, symlink handling, permission preservation. |
| 7 | should-fix | Process management gaps | Added: `sh -c` shell, SIGINT→SIGTERM→SIGKILL chain, per-task output buffering, exit code semantics. |
| 8 | should-fix | `services` hand-waved | Removed from API entirely. |
| 9 | should-fix | native/ workspace poor fit | Now lives inside `native/vtz/src/ci/` — same pattern as `pm/`. Reuses existing dependencies (sha2, tar, walkdir, tokio, clap, serde_json). |
| 10 | should-fix | `cond.changed()` scope ambiguity | Documented: uses same base ref as workflow's `filter: 'affected'`. Configurable via `--base`. |
| 11 | nit | `task()` overload conflict | Removed the overload that accepts both positional command and config object. `task(string)` is shorthand only. |
| 12 | nit | Name collisions | Deferred to user. |
| 13 | nit | Missing verbosity flags | Added. |
| 14 | nit | `.gitignore` | Will add `.pipe/` to `.gitignore` in Phase 1. |
| 15 | nit | `env` composition | Added `env` to `WorkflowConfig`. Precedence: `process.env` < `workflow.env` < `task.env`. |
