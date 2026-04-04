# Phase 5: TypeScript SDK Package

## Context

Phases 1-4 deliver the full Rust engine. This phase creates the `@vertz/ci` npm package — the TypeScript SDK that developers use to write `ci.config.ts`. It provides `pipe()`, `task()`, `cond.*` builders, discriminated union types for compile-time safety, and the loader script that the Rust binary spawns.

Design doc: `plans/pipe-ci-runner.md`

Depends on: Phase 1 (config loading protocol), Phase 3 (condition types)

## Tasks

### Task 1: Package scaffold + core types

**Files:**
- `packages/ci/package.json` (new)
- `packages/ci/tsconfig.json` (new)
- `packages/ci/src/types.ts` (new)
- `packages/ci/src/index.ts` (new)

**What to implement:**

Create the `@vertz/ci` package at `packages/ci/`.

`package.json`:
```json
{
  "name": "@vertz/ci",
  "version": "0.0.1",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "bunup",
    "typecheck": "tsc --noEmit"
  }
}
```

`types.ts` — all public types exactly as specified in the design doc:

```typescript
export interface PipeConfig {
  secrets?: string[];
  workspace?: WorkspaceConfig;
  tasks: Record<string, TaskDef>;
  workflows?: Record<string, WorkflowConfig>;
  cache?: CacheConfig;
}

export type TaskDef = CommandTask | StepsTask;

interface TaskBase {
  deps?: Dep[];
  cond?: Condition;
  cache?: TaskCacheConfig;
  env?: Record<string, string>;
  timeout?: number;
}

export type CommandTask =
  | (TaskBase & { command: string; steps?: never; scope?: 'package' })
  | (TaskBase & { command: string; steps?: never; scope: 'root'; deps?: RootDep[] });

export type StepsTask =
  | (TaskBase & { steps: string[]; command?: never; scope?: 'package' })
  | (TaskBase & { steps: string[]; command?: never; scope: 'root'; deps?: RootDep[] });

type RootDep = string & { __brand?: 'rootDep' };

export interface TaskResult {
  status: 'success' | 'failed' | 'skipped';
  exitCode: number | null;
  duration: number;
  package: string | null;
  task: string;
  cached: boolean;
}

export type Dep = string | DepEdge;

export interface DepEdge {
  task: string;
  on: 'success' | 'always' | 'failure' | ((result: TaskResult) => boolean);
}

export interface TaskCacheConfig {
  inputs: string[];
  outputs: string[];
}

export interface WorkflowConfig {
  run: string[];
  filter?: WorkflowFilter;
  env?: Record<string, string>;
}

export type WorkflowFilter = 'affected' | 'all' | string[];

export interface CacheConfig {
  local?: string;
  remote?: string | false;
  maxSize?: number;
}

export type Condition =
  | ChangedCondition
  | BranchCondition
  | EnvCondition
  | AllCondition
  | AnyCondition;

interface ChangedCondition { type: 'changed'; patterns: string[] }
interface BranchCondition { type: 'branch'; names: string[] }
interface EnvCondition { type: 'env'; name: string; value?: string }
interface AllCondition { type: 'all'; conditions: Condition[] }
interface AnyCondition { type: 'any'; conditions: Condition[] }

export interface WorkspaceConfig {
  packages?: string[];
  native?: { root: string; members: string[] };
}
```

`index.ts` — re-export types and builder functions (Task 2).

**Acceptance criteria:**
- [ ] Package compiles with `bun run build`
- [ ] `bun run typecheck` passes
- [ ] `TaskDef = CommandTask | StepsTask` — mutually exclusive via `never`
- [ ] `DepEdge.on` accepts `'success' | 'always' | 'failure' | callback`
- [ ] `Condition` is a discriminated union by `type` field
- [ ] `TaskCacheConfig` requires both `inputs` and `outputs`
- [ ] `WorkflowFilter` accepts all three forms

---

### Task 2: Builder functions (`pipe`, `task`, `cond`)

**Files:**
- `packages/ci/src/builders.ts` (new)
- `packages/ci/src/index.ts` (modified — export builders)

**What to implement:**

**`pipe(config)`** — validates and returns the config. Intercepts function values in `on:` fields and registers them in a callback registry:

```typescript
const callbacks = new Map<number, (result: TaskResult) => boolean>();
let nextId = 0;

export function pipe(config: PipeConfig): PipeConfig {
  // Walk config.tasks, find DepEdge with function on:
  // Replace functions with { type: 'callback', id: N }
  // Register in callbacks map
  for (const [name, taskDef] of Object.entries(config.tasks)) {
    if (taskDef.deps) {
      taskDef.deps = taskDef.deps.map(dep => {
        if (typeof dep === 'object' && typeof dep.on === 'function') {
          const id = nextId++;
          callbacks.set(id, dep.on);
          return { task: dep.task, on: { type: 'callback', id } } as unknown as DepEdge;
        }
        return dep;
      });
    }
  }
  return config;
}

// Exposed for loader script
export function getCallbacks(): Map<number, (result: TaskResult) => boolean> {
  return callbacks;
}
```

**`task()` overloads:**
```typescript
export function task(command: string): CommandTask;
export function task(config: TaskDef): TaskDef;
export function task(input: string | TaskDef): TaskDef {
  if (typeof input === 'string') {
    return { command: input };
  }
  return input;
}
```

**`cond.*` builders:**
```typescript
export const cond = {
  changed(...patterns: string[]): ChangedCondition {
    return { type: 'changed', patterns };
  },
  branch(...names: string[]): BranchCondition {
    return { type: 'branch', names };
  },
  env(name: string, value?: string): EnvCondition {
    return { type: 'env', name, value };
  },
  all(...conditions: Condition[]): AllCondition {
    return { type: 'all', conditions };
  },
  any(...conditions: Condition[]): AnyCondition {
    return { type: 'any', conditions };
  },
};
```

**Acceptance criteria:**
- [ ] `pipe()` intercepts function `on:` values and assigns callback IDs
- [ ] `pipe()` stores callbacks in registry accessible to loader script
- [ ] `task('bun test')` returns `CommandTask` with command field
- [ ] `task({ command: 'bun test', deps: ['^build'] })` returns as-is
- [ ] `cond.changed('src/**')` returns `{ type: 'changed', patterns: ['src/**'] }`
- [ ] `cond.all(cond.changed('native/**'), cond.branch('main'))` composes correctly
- [ ] All builders return correct discriminated union variants
- [ ] `bun run typecheck` passes
- [ ] `bun test` passes

---

### Task 3: Loader script + type-level tests

**Files:**
- `packages/ci/src/loader.ts` (new)
- `packages/ci/src/types.test-d.ts` (new)
- `packages/ci/src/__tests__/builders.test.ts` (new)

**What to implement:**

**`loader.ts`** — the script spawned by the Rust binary:
```typescript
import { createInterface } from 'node:readline';

const callbacks = new Map<number, (result: any) => boolean>();
let nextId = 0;

// Register callback interception
globalThis.__pipeRegisterCallback = (fn: Function) => {
  const id = nextId++;
  callbacks.set(id, fn as any);
  return id;
};

// Load user config
const configPath = process.argv[2];
if (!configPath) {
  process.stderr.write('error: no config path provided\n');
  process.exit(1);
}

const mod = await import(configPath);
const config = mod.default;

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

This file is exported from the package so the Rust binary can find it at `node_modules/@vertz/ci/dist/loader.js`.

**Type-level tests** (`types.test-d.ts`):
```typescript
import { pipe, task, cond } from './index';
import type { TaskDef, CommandTask, StepsTask, DepEdge } from './types';

// Valid: command task
pipe({ tasks: { build: task({ command: 'bun run build' }) } });

// Valid: steps task
pipe({ tasks: { checks: task({ steps: ['lint', 'test'] }) } });

// Valid: task shorthand
pipe({ tasks: { build: task('bun run build') } });

// @ts-expect-error — command and steps are mutually exclusive
pipe({ tasks: { build: task({ command: 'build', steps: ['a'] }) } });

// @ts-expect-error — cache requires both inputs AND outputs
pipe({ tasks: { build: task({ command: 'build', cache: { inputs: ['src/**'] } }) } });

// Valid: all dep edge types
pipe({
  tasks: {
    build: task('build'),
    test: task({
      command: 'test',
      deps: [
        'build',                                    // bare string
        { task: 'build', on: 'success' },          // shortcut
        { task: 'build', on: 'always' },           // shortcut
        { task: 'build', on: 'failure' },          // shortcut
        { task: 'build', on: (r) => r.cached },    // callback
      ],
    }),
  },
});

// @ts-expect-error — invalid on value
const badEdge: DepEdge = { task: 'build', on: 'maybe' };

// Valid: all condition types
cond.changed('src/**', 'package.json');
cond.branch('main', 'release/*');
cond.env('CI');
cond.env('NODE_ENV', 'production');
cond.all(cond.changed('native/**'), cond.branch('main'));
cond.any(cond.env('CI'), cond.branch('main'));

// Valid: secrets
pipe({ secrets: ['NPM_TOKEN'], tasks: {} });

// Valid: workflow filter types
pipe({
  tasks: { build: task('build') },
  workflows: {
    ci: { run: ['build'], filter: 'affected' },
    full: { run: ['build'], filter: 'all' },
    subset: { run: ['build'], filter: ['@vertz/ui', '@vertz/core'] },
  },
});
```

**Unit tests** (`builders.test.ts`):
- `pipe()` intercepts function callbacks and assigns IDs
- `task(string)` returns CommandTask
- `task(object)` returns as-is
- `cond.*` builders return correct discriminant
- Callback registry is populated correctly

**Acceptance criteria:**
- [ ] Loader script sends config JSON and handles callback eval protocol
- [ ] Loader script exits on `{"shutdown": true}`
- [ ] Loader script handles callback errors gracefully
- [ ] All type-level tests pass (`bun run typecheck`)
- [ ] `@ts-expect-error` directives are all necessary (not unused)
- [ ] Unit tests for builders pass (`bun test`)
- [ ] `bun run lint` passes
- [ ] Package exports loader.js for Rust binary to find
