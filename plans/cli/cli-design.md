# @vertz/cli -- Package Design Plan

## Overview

The `@vertz/cli` package is the developer experience layer for Vertz. It provides the `vertz` binary that developers interact with daily -- dev server, production builds, code generation, validation, deployment, and project scaffolding.

The CLI uses **Ink** (React for terminals) for all output, providing rich, interactive terminal experiences with syntax-highlighted diagnostics, live compilation progress, and interactive prompts. The command routing layer uses **Commander** for argument parsing, with each command implemented as a self-contained module that renders its UI through Ink components.

The CLI is a **thin orchestration layer** -- it owns the terminal UX but delegates all heavy lifting to `@vertz/compiler`. The compiler produces `Diagnostic[]` with source context; the CLI renders them beautifully.

See also: [Compiler Design](../vertz-compiler-design.md), [Core API Design](../vertz-core-api-design.md), [Features](../vertz-features.md).

---

## Architecture

### Package Boundaries

```
@vertz/compiler  -- Pure library. No terminal I/O. Produces IR + Diagnostic[].
@vertz/cli       -- Terminal UX. Renders diagnostics. Orchestrates compiler + dev server.
create-vertz-app -- Standalone scaffolding package (npm create vertz-app).
```

The compiler never imports Ink or writes to stdout. The CLI never parses TypeScript ASTs. Clean separation.

### Package Structure

```
packages/cli/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── bunup.config.ts
├── bin/
│   └── vertz.ts                        # Entry point (#!/usr/bin/env node)
├── src/
│   ├── index.ts                        # Public API (createCLI, exported types)
│   ├── cli.ts                          # Commander program setup + command registration
│   ├── commands/
│   │   ├── dev.ts                      # vertz dev
│   │   ├── build.ts                    # vertz build
│   │   ├── generate.ts                 # vertz generate
│   │   ├── check.ts                    # vertz check
│   │   ├── deploy.ts                   # vertz deploy
│   │   └── routes.ts                   # vertz routes (route table display)
│   ├── ui/
│   │   ├── task-runner.ts              # TaskRunner interface (inspired by blimu)
│   │   ├── ink-adapter.tsx             # InkTaskRunner implementation
│   │   ├── components/
│   │   │   ├── TaskList.tsx            # Group + task hierarchy
│   │   │   ├── Task.tsx                # Individual task with pulsing dot
│   │   │   ├── Message.tsx             # Info/warn/error/success messages
│   │   │   ├── DiagnosticDisplay.tsx   # Code frame with syntax highlighting
│   │   │   ├── DiagnosticSummary.tsx   # Post-compilation summary
│   │   │   ├── CompilationProgress.tsx # Live pipeline progress
│   │   │   ├── RouteTable.tsx          # Pretty-printed route listing
│   │   │   ├── ServerStatus.tsx        # Dev server status bar
│   │   │   ├── SelectList.tsx          # Interactive select prompt
│   │   │   └── Banner.tsx              # Vertz branding header
│   │   └── theme.ts                    # Color palette, symbols, spacing constants
│   ├── dev-server/
│   │   ├── watcher.ts                  # File watcher (Bun native / chokidar fallback)
│   │   ├── process-manager.ts          # Child process lifecycle (start/restart/kill)
│   │   ├── dev-loop.ts                 # Watch -> compile -> restart orchestration
│   │   └── typecheck-worker.ts         # Non-blocking tsc --noEmit in background
│   ├── config/
│   │   ├── loader.ts                   # vertz.config.ts discovery and loading
│   │   └── defaults.ts                 # Default configuration values
│   ├── generators/
│   │   ├── module.ts                   # Generate module scaffold
│   │   ├── service.ts                  # Generate service file
│   │   ├── router.ts                   # Generate router file
│   │   ├── schema.ts                   # Generate schema file
│   │   └── templates/                  # Handlebars/string templates
│   │       ├── module-def.ts.hbs
│   │       ├── module.ts.hbs
│   │       ├── service.ts.hbs
│   │       ├── router.ts.hbs
│   │       └── schema.ts.hbs
│   ├── deploy/
│   │   ├── detector.ts                 # Detect deployment target from project
│   │   ├── railway.ts                  # Railway config generation
│   │   ├── fly.ts                      # Fly.io config generation
│   │   └── dockerfile.ts              # Dockerfile generation
│   └── utils/
│       ├── runtime-detect.ts           # Detect Bun vs Node
│       ├── paths.ts                    # Project root, config file discovery
│       ├── prompt.ts                   # Interactive prompt helpers (CI-aware)
│       ├── syntax-highlight.ts         # Shiki integration for code frames
│       └── format.ts                   # Duration, file size, path formatting
```

### Command Routing

Commander handles argument parsing and routes to command handlers. Each command is a function that receives parsed options and creates an Ink-powered UI:

```typescript
// bin/vertz.ts
#!/usr/bin/env node
import { createCLI } from '../src/cli.js';
createCLI().parse();

// src/cli.ts
import { Command } from 'commander';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('vertz')
    .description('Vertz -- Type-safe backend framework for LLMs')
    .version(/* from package.json */);

  devCommand(program);
  buildCommand(program);
  generateCommand(program);
  checkCommand(program);
  deployCommand(program);
  routesCommand(program);

  return program;
}
```

---

## Interactive Prompts for Missing Parameters

When a required parameter is missing from a CLI command, the CLI should **not** throw an error in interactive mode. Instead, it should present an interactive prompt so the user can pick or enter the missing value. This follows the same pattern as modern developer tools like Claude Code CLI, where missing information triggers guided interview-style prompts rather than hard failures.

### Design Principles

1. **Progressive disclosure**: Show only what's needed. If a flag is provided, skip its prompt. If all flags are provided, skip all prompts.
2. **Smart defaults**: When possible, pre-select the most likely option (e.g., detect deployment target from project files).
3. **CI-awareness**: When `CI=true` environment variable is set, skip all interactive prompts and throw a clear error listing the missing required parameters. CI environments cannot be interactive.

### CI Detection

```typescript
// utils/prompt.ts
export function isCI(): boolean {
  return process.env.CI === 'true' || process.env.CI === '1';
}

export function requireParam(name: string, value: string | undefined): string {
  if (value) return value;
  if (isCI()) {
    throw new Error(`Missing required parameter: --${name}. In CI mode, all parameters must be provided explicitly.`);
  }
  // In interactive mode, this function is not called -- the prompt handles it
  throw new Error(`Missing required parameter: --${name}`);
}
```

### Command-Specific Prompt Behavior

#### `vertz new` (via `create-vertz-app`)

When run without a project name:

```
$ vertz new

  ? Project name: my-api
  ? Which runtime? (Use arrow keys)
  > Bun (recommended)
    Node.js
    Deno
  ? Include example module? (Y/n)
```

When run with a project name but no other flags:

```
$ vertz new my-api

  ? Which runtime? (Use arrow keys)
  > Bun (recommended)
    Node.js
    Deno
  ? Include example module? (Y/n)
```

When all flags are provided, no prompts are shown:

```
$ vertz new my-api --runtime bun --example
# No prompts, runs directly
```

#### `vertz generate`

When run without specifying what to generate:

```
$ vertz generate

  ? What would you like to generate? (Use arrow keys)
  > module    -- New module (module-def + module + folder)
    service   -- New service in a module
    router    -- New router in a module
    schema    -- New schema file
```

When the type is specified but the name is missing:

```
$ vertz generate module

  ? Module name: order
```

When type is specified and name is given but `--module` is required (for service, router, schema) and missing:

```
$ vertz generate service user-auth

  ? Which module? (Use arrow keys)
  > user
    order
    auth
    health
```

The module list is populated by scanning the project's `src/modules/` directory for existing modules.

#### `vertz deploy`

When run without a target and auto-detection fails:

```
$ vertz deploy

  ? Deployment target? (Use arrow keys)
  > Railway
    Fly.io
    Docker (Dockerfile only)
```

When auto-detection succeeds (e.g., `fly.toml` exists), skip the prompt and use the detected target, showing a confirmation:

```
$ vertz deploy

  Detected: Fly.io (fly.toml found)

  ✓ Generated deployment config
```

#### `vertz dev`

No interactive prompts needed -- all flags have sensible defaults (port 3000, host localhost, etc.).

#### `vertz build`

No interactive prompts needed -- runs with config defaults. Flags are optional overrides.

#### `vertz check`

No interactive prompts needed -- runs validation on the entire project.

#### `vertz routes`

When `--module` is provided, filter by that module. When not provided, show all routes (no prompt needed since showing all is the sensible default).

### Implementation Pattern

Each command handler follows this pattern:

```typescript
async function generateAction(type?: string, name?: string, options?: GenerateOptions) {
  const runner = await createTaskRunner();

  // Step 1: Resolve missing parameters via interactive prompts
  if (!type) {
    if (isCI()) {
      runner.error('Missing required argument: <type>. Options: module, service, router, schema');
      process.exit(1);
    }
    type = await runner.promptSelect({
      title: 'What would you like to generate?',
      choices: [
        { label: 'module  -- New module (module-def + module + folder)', value: 'module' },
        { label: 'service -- New service in a module', value: 'service' },
        { label: 'router  -- New router in a module', value: 'router' },
        { label: 'schema  -- New schema file', value: 'schema' },
      ],
    });
  }

  if (!name) {
    if (isCI()) {
      runner.error(`Missing required argument: <name> for "vertz generate ${type}"`);
      process.exit(1);
    }
    name = await runner.promptInput({ title: `${capitalize(type)} name:` });
  }

  // Step 2: Proceed with resolved parameters
  // ...
}
```

### TaskRunner Prompt Extensions

The `TaskRunner` interface is extended to support interactive prompts:

```typescript
export interface TaskRunner {
  // ... existing methods ...

  /** Show a select list and return the chosen value. Returns null if cancelled. */
  promptSelect(options: { title: string; choices: SelectOption[] }): Promise<string | null>;

  /** Show a text input prompt and return the entered value. Returns null if cancelled. */
  promptInput(options: { title: string; default?: string; validate?: (value: string) => string | null }): Promise<string | null>;

  /** Show a yes/no confirmation prompt. Returns true/false. */
  promptConfirm(options: { title: string; default?: boolean }): Promise<boolean>;
}
```

These prompt methods are implemented in `InkTaskRunner` using Ink's `useInput` hook and custom components (`SelectList`, `TextInput`, `Confirm`). In test environments, they can be stubbed to return predetermined values.

---

## Commands

### `vertz dev`

Development server with watch mode, incremental compilation, and live diagnostics.

```
vertz dev [--port <port>] [--host <host>] [--open] [--no-typecheck]
```

**Behavior:**

1. Load `vertz.config.ts`
2. Create compiler via `createCompiler({ ...config, forceGenerate: true })`
3. Create `IncrementalCompiler` and run `initialCompile()`
4. Display compilation progress with `CompilationProgress` component
5. If errors: render diagnostics with `DiagnosticDisplay`, keep watching (output still generated due to `forceGenerate`)
6. If success: start app process with `bun run` (fallback: `tsx`)
7. Start non-blocking typecheck via `typecheckWatch()` AsyncGenerator
8. Watch `src/` for changes, map events to `FileChange[]`
9. On file change: call `incremental.handleChanges(changes)`, handle by result kind:
   - `incremental` -- render affected modules + diagnostics, restart if no errors
   - `full-recompile` -- render full result, restart
   - `reboot` -- kill process, recreate compiler with fresh config, restart

**Terminal Output:**

```
  vertz v0.1.0

  ✓ Compiled in 240ms (4 modules, 12 routes, 0 errors)

  ➜ Local:   http://localhost:3000
  ➜ Network: http://192.168.1.42:3000
  ➜ Docs:    http://localhost:3000/openapi.json

  Press h + enter to show help
```

On file change with diagnostics:

```
  [14:32:15] File changed: src/modules/user/user.router.ts

  ⠋ Recompiling user module...

  VERTZ_MISSING_RESPONSE_SCHEMA  Missing response schema
  ╭─ src/modules/user/routers/user.router.ts:14:1
  │
  12 │ userRouter.get('/:id', {
  13 │   params: readUserParams,
  14 │   handler: async (ctx) => {
     │   ^^^^^^^ handler returns a value but no response schema is defined
  15 │     return ctx.userService.findById(ctx.params.id);
  16 │   },
  17 │ });
  │
  ╰─ hint: Add a `response` property with the expected return shape

  1 error, server not restarted. Fix the error and save to retry.
```

**Flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `--port <port>` | `3000` | Server port |
| `--host <host>` | `localhost` | Server host |
| `--open` | `false` | Open browser on start |
| `--no-typecheck` | `false` | Skip background typecheck |

### `vertz build`

Production build. Full compilation with blocking typecheck.

```
vertz build [--output <dir>] [--strict] [--no-emit]
```

**Behavior:**

1. Load `vertz.config.ts`
2. Create compiler via `createCompiler(config)`
3. Run `compiler.compile()` -- full analysis, validation, generation
4. Run blocking `typecheck({ tsconfigPath: 'tsconfig.json' })` -- type errors fail the build
5. Strict mode checks run automatically if `strict: true` in config or `--strict` flag
6. If no errors: all 5 output files generated to `config.compiler.outputDir`
7. Display summary with timing

**Terminal Output (success):**

```
  vertz build

  ✓ Schemas      12 files     18ms
  ✓ Middleware     3 files      4ms
  ✓ Modules        4 modules   22ms
  ✓ Validation     0 errors     8ms
  ✓ TypeCheck      0 errors   1.2s
  ✓ Generation     5 files     14ms

  ✓ Built successfully in 1.29s

  Output:
    .vertz/generated/openapi.json      (42 KB)
    .vertz/generated/boot.ts           (1.2 KB)
    .vertz/generated/routes.ts         (3.4 KB)
    .vertz/generated/schemas.ts        (8.7 KB)
    .vertz/generated/manifest.json     (12 KB)
```

**Terminal Output (failure):**

```
  vertz build

  ✓ Schemas      12 files     18ms
  ✓ Middleware     3 files      4ms
  ✓ Modules        4 modules   22ms
  ✗ Validation     2 errors

  VERTZ_MISSING_RESPONSE_SCHEMA  Missing response schema
  ╭─ src/modules/user/routers/user.router.ts:14:1
  │  ...code frame...
  ╰─ hint: Add a `response` property

  VERTZ_UNUSED_SERVICE  Unused service
  ╭─ src/modules/auth/auth.service.ts:1:1
  │  ...code frame...
  ╰─ hint: Remove the service or add it to module exports

  Build failed with 2 errors.
```

**Flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `--output <dir>` | `.vertz/generated` | Output directory |
| `--strict` | from config | Enable strict mode checks |
| `--no-emit` | `false` | Validate only, don't generate files |

### `vertz check`

Run compiler validators without building. Fast validation for CI or pre-commit.

```
vertz check [--strict] [--format <format>]
```

**Behavior:**

1. Load config, create compiler via `createCompiler(config)`
2. Run `compiler.analyze()` to build the IR
3. Run `compiler.validate(ir)` to get diagnostics
4. Optionally run `typecheck({ tsconfigPath: 'tsconfig.json' })`
5. Report all diagnostics (compiler + typecheck)
6. Exit 0 if no errors, 1 if errors

**Flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `--strict` | from config | Enable strict mode |
| `--format` | `pretty` | Output format: `pretty`, `json`, `github` (GitHub Actions annotations) |
| `--typecheck` | `true` | Also run tsc --noEmit |

The `--format github` flag outputs diagnostics as GitHub Actions annotations:

```
::error file=src/modules/user/user.router.ts,line=14,col=1::VERTZ_MISSING_RESPONSE_SCHEMA: Missing response schema
```

### `vertz generate`

Scaffold code following Vertz conventions.

```
vertz generate [<type>] [<name>] [--module <module>] [--dry-run]
```

**Subcommands:**

```
vertz generate module <name>          # New module (module-def + module + folder)
vertz generate service <name>         # New service in a module
vertz generate router <name>          # New router in a module
vertz generate schema <name>          # New schema file
```

**Behavior:**

1. If `<type>` is missing: prompt interactively (select from available generators)
2. If `<name>` is missing: prompt interactively (text input)
3. If `--module` not provided and type requires it (service, router, schema): prompt interactively (select from existing modules)
4. Generate files from templates following Vertz conventions
5. Show generated files list

**Example:**

```
$ vertz generate module order

  ✓ Generated module: order

    src/modules/order/
    ├── order.module-def.ts
    ├── order.module.ts
    └── schemas/

  Next: Add services with `vertz generate service <name> --module order`
```

**Flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `--module <name>` | (prompt) | Target module for service/router/schema |
| `--dry-run` | `false` | Show what would be generated without writing |

### `vertz routes`

Display the route table from compiled output.

```
vertz routes [--format <format>] [--module <module>]
```

**Terminal Output:**

```
  Routes (12 total)

  Module: user
  ┌─────────┬──────────────────────┬─────────────────────┬──────────────────┐
  │ Method  │ Path                 │ Operation ID        │ Middleware        │
  ├─────────┼──────────────────────┼─────────────────────┼──────────────────┤
  │ GET     │ /api/v1/users        │ user_listUsers      │ auth             │
  │ GET     │ /api/v1/users/:id    │ user_getUserById    │ auth             │
  │ POST    │ /api/v1/users        │ user_createUser     │ auth             │
  │ PUT     │ /api/v1/users/:id    │ user_updateUser     │ auth             │
  │ DELETE  │ /api/v1/users/:id    │ user_deleteUser     │ auth, admin      │
  └─────────┴──────────────────────┴─────────────────────┴──────────────────┘

  Module: order
  ┌─────────┬──────────────────────┬─────────────────────┬──────────────────┐
  │ ...     │ ...                  │ ...                 │ ...              │
  └─────────┴──────────────────────┴─────────────────────┴──────────────────┘
```

**Flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `--format` | `table` | Output format: `table`, `json`, `tree` |
| `--module` | all | Filter by module name |

### `vertz deploy`

Deployment helper. Generates configuration files for common platforms.

```
vertz deploy [--target <platform>] [--dry-run]
```

**Behavior:**

1. Auto-detect deployment target from project (e.g., `fly.toml` exists -> Fly.io)
2. If not detectable and `--target` not provided: prompt interactively (select from supported platforms)
3. Generate deployment configuration
4. Provide next-steps guidance

**Supported targets:**

- `railway` -- Generate `railway.toml`
- `fly` -- Generate `fly.toml` + Dockerfile
- `docker` -- Generate `Dockerfile` + `.dockerignore`

This is a convenience command, not a deployment pipeline. It generates config files -- the developer still pushes via the platform's own CLI.

---

## Ink Components

### Design System

All components share a consistent visual language defined in `theme.ts`:

```typescript
// ui/theme.ts
export const symbols = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  pending: '○',
  running: '○',      // animated via PulsingDot
  complete: '●',
  arrow: '➜',
  tree: '⎿',
  boxTopLeft: '╭',
  boxBottomLeft: '╰',
  boxVertical: '│',
  boxHorizontal: '─',
} as const;

export const colors = {
  success: 'greenBright',
  error: 'redBright',
  warning: 'yellow',
  info: 'blueBright',
  muted: 'gray',
  accent: 'cyan',
  method: {
    GET: 'greenBright',
    POST: 'blueBright',
    PUT: 'yellow',
    DELETE: 'redBright',
    PATCH: 'magenta',
    HEAD: 'gray',
    OPTIONS: 'gray',
  },
} as const;
```

### Component Hierarchy

```
<App>
  <Banner />                           # "vertz v0.1.0"
  <CompilationProgress phases={...} /> # Live pipeline phases
  <DiagnosticDisplay diagnostics={[]}  # Code frames for errors
    highlighter={shiki} />
  <DiagnosticSummary stats={...} />    # "2 errors, 1 warning"
  <ServerStatus url="..." />           # "Local: http://localhost:3000"
  <RouteTable routes={[...]} />        # Route listing
  <TaskList groups={[...]} />          # Task groups (from blimu pattern)
</App>
```

### TaskRunner Pattern (from blimu)

The blimu CLI's `TaskRunner` abstraction is excellent and we adopt it directly. The pattern separates the **what** (task lifecycle: start, update, succeed, fail) from the **how** (Ink rendering). Commands interact with `TaskRunner` -- they never import Ink directly.

```typescript
// ui/task-runner.ts
export interface Task {
  update(message: string): void;
  succeed(message?: string): void;
  fail(message?: string): void;
}

export interface TaskGroup {
  task(name: string, fn: (task: Task) => Promise<void> | void): Promise<void>;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
  dismiss(): void;
}

export interface TaskRunner {
  group(name: string): TaskGroup;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
  promptSelect(options: { title: string; choices: SelectOption[] }): Promise<string | null>;
  promptInput(options: { title: string; default?: string; validate?: (value: string) => string | null }): Promise<string | null>;
  promptConfirm(options: { title: string; default?: boolean }): Promise<boolean>;
  cleanup(): void;
  wait(): Promise<void>;
}
```

Commands use it like this:

```typescript
// commands/build.ts
async function buildAction(options: BuildOptions) {
  const runner = await createTaskRunner();
  const buildGroup = runner.group('Building');

  const compiler = createCompiler(config);

  await buildGroup.task('Compile', async (task) => {
    task.update('Analyzing schemas...');
    const result = await compiler.compile();
    const errors = result.diagnostics.filter(d => d.severity === 'error');
    if (result.success) task.succeed('Compiled successfully');
    else task.fail(`${errors.length} errors`);
  });

  await buildGroup.task('TypeCheck', async (task) => {
    const result = await typecheck({ tsconfigPath: 'tsconfig.json' });
    if (result.success) task.succeed('No type errors');
    else task.fail(`${result.diagnostics.length} type errors`);
  });

  // ...
}
```

### DiagnosticDisplay Component

The flagship component. Renders compiler diagnostics as syntax-highlighted code frames.

```tsx
// ui/components/DiagnosticDisplay.tsx
interface DiagnosticDisplayProps {
  diagnostic: Diagnostic;
  highlighter: ShikiHighlighter;  // Pre-initialized Shiki instance
}

export const DiagnosticDisplay: React.FC<DiagnosticDisplayProps> = ({
  diagnostic,
  highlighter,
}) => {
  // Renders:
  // 1. Error code + severity badge + message
  // 2. File location (clickable in terminals that support it)
  // 3. Code frame with syntax highlighting (via Shiki)
  // 4. Underline on the exact span
  // 5. Hint/suggestion line
};
```

The code frame rendering uses `Diagnostic.sourceContext` from the compiler:

```
  VERTZ_MISSING_RESPONSE_SCHEMA  Missing response schema
  ╭─ src/modules/user/routers/user.router.ts:14:1
  │
  12 │ userRouter.get('/:id', {
  13 │   params: readUserParams,
  14 │   handler: async (ctx) => {
     │   ^^^^^^^ handler returns a value but no response schema is defined
  15 │     return ctx.userService.findById(ctx.params.id);
  16 │   },
  17 │ });
  │
  ╰─ hint: Add a `response` property with the expected return shape
```

### CompilationProgress Component

Live dashboard showing compiler pipeline progress:

```tsx
interface Phase {
  name: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;  // e.g., "(12 files)" or "(analyzing user module...)"
}

interface CompilationProgressProps {
  phases: Phase[];
}
```

Renders:

```
  ✓ Schemas     (12 files)
  ✓ Middleware   (3 files)
  ⠋ Modules     (analyzing user module...)
  ○ Validation
  ○ Generation
```

### ServerStatus Component

Persistent status bar during `vertz dev`:

```tsx
interface ServerStatusProps {
  localUrl: string;
  networkUrl?: string;
  docsUrl?: string;
  compileTime?: number;
  moduleCount?: number;
  routeCount?: number;
  errorCount?: number;
  warningCount?: number;
}
```

Renders:

```
  ✓ Compiled in 240ms (4 modules, 12 routes, 0 errors)

  ➜ Local:   http://localhost:3000
  ➜ Network: http://192.168.1.42:3000
  ➜ Docs:    http://localhost:3000/openapi.json
```

### RouteTable Component

Pretty-printed route listing:

```tsx
interface RouteTableProps {
  routes: Array<{
    method: string;
    path: string;
    operationId: string;
    moduleName: string;
    middleware: string[];
  }>;
  groupByModule?: boolean;
  format?: 'table' | 'tree';
}
```

### Banner Component

Simple branding header:

```tsx
export const Banner: React.FC = () => (
  <Text>
    <Text color="cyan" bold>vertz</Text>
    <Text dimColor> v{version}</Text>
  </Text>
);
```

---

## Compiler Integration

The CLI is a consumer of `@vertz/compiler`'s public API. Here's how each command calls the compiler:

### Compiler Public API (consumed by CLI)

```typescript
// What the CLI imports from @vertz/compiler
import {
  createCompiler,
  IncrementalCompiler,
  typecheck,
  typecheckWatch,
  defineConfig,
  buildManifest,
  type Compiler,
  type CompileResult,
  type VertzConfig,
  type AppIR,
  type Diagnostic,
  type FileChange,
  type IncrementalResult,
} from '@vertz/compiler';
```

#### Factory: `createCompiler(config?: VertzConfig): Compiler`

Creates a `Compiler` instance. Resolves config with defaults, creates a `ts-morph` Project from `tsconfig.json`, and wires up analyzers, validators, and generators.

```typescript
const compiler = createCompiler(userConfig);
```

#### Compiler class methods:

```typescript
class Compiler {
  getConfig(): ResolvedConfig;
  async analyze(): Promise<AppIR>;           // Phase 1: AST analysis -> IR
  async validate(ir: AppIR): Promise<Diagnostic[]>;  // Phase 2: cross-cutting checks
  async generate(ir: AppIR): Promise<void>;  // Phase 3: write 5 output files
  async compile(): Promise<CompileResult>;   // All 3 phases in sequence
}

interface CompileResult {
  success: boolean;        // true if no error-severity diagnostics
  ir: AppIR;              // full IR with diagnostics merged in
  diagnostics: Diagnostic[];
}
```

#### IncrementalCompiler (for `vertz dev`):

```typescript
class IncrementalCompiler {
  constructor(compiler: Compiler);
  async initialCompile(): Promise<CompileResult>;
  async handleChanges(changes: FileChange[]): Promise<IncrementalResult>;
  getCurrentIR(): AppIR;
}

type FileChange = { path: string; kind: 'added' | 'modified' | 'deleted' };

type IncrementalResult =
  | { kind: 'reboot'; reason: string }           // .env or vertz.config.ts changed
  | { kind: 'full-recompile' }                    // app entry file changed
  | { kind: 'incremental'; affectedModules: string[]; diagnostics: Diagnostic[] };
```

The `IncrementalCompiler` categorizes changed files by naming convention (`*.schema.ts`, `*.router.ts`, `*.service.ts`, `*.module.ts`, `middleware/` directory, `.env*`, `vertz.config.ts`, entry file) and determines the minimal scope of re-analysis. It merges partial IR updates into the full IR via `mergeIR()`, then re-validates and regenerates.

#### Typecheck (separate from compiler):

```typescript
// One-shot typecheck (for `vertz build`)
const result = await typecheck({ tsconfigPath: 'tsconfig.json' });
// result.success: boolean, result.diagnostics: TypecheckDiagnostic[]

// Watch mode typecheck (for `vertz dev`)
for await (const result of typecheckWatch({ tsconfigPath: 'tsconfig.json' })) {
  // Each result emitted after tsc reports "Found N errors"
  renderTypecheckDiagnostics(result.diagnostics);
}
```

#### Standalone generator access (for selective generation):

Individual generators can be imported and used directly. Useful for `vertz routes` which only needs the manifest:

```typescript
import { buildManifest, buildRouteTable } from '@vertz/compiler';

const manifest = buildManifest(ir);    // manifest.json data
const routes = buildRouteTable(ir);    // route table data
```

### Command -> Compiler Mapping

| Command | Compiler API | Generates Files? |
|---------|-------------|-----------------|
| `vertz dev` | `IncrementalCompiler.initialCompile()` then `.handleChanges()` + `typecheckWatch()` | Yes (via compiler) |
| `vertz build` | `compiler.compile()` + `typecheck()` (blocking) | Yes |
| `vertz check` | `compiler.analyze()` + `compiler.validate(ir)` + optionally `typecheck()` | No |
| `vertz routes` | `compiler.analyze()` then `buildRouteTable(ir)` or `buildManifest(ir)` | No |
| `vertz generate` | No compiler needed | Yes (scaffolded files) |
| `vertz deploy` | No compiler needed | Yes (deployment configs) |

### Config Types

```typescript
interface VertzConfig {
  strict?: boolean;           // default false
  forceGenerate?: boolean;    // default false -- generate even with errors (useful for dev)
  compiler?: Partial<CompilerConfig>;
}

interface CompilerConfig {
  sourceDir: string;          // default 'src'
  outputDir: string;          // default '.vertz/generated'
  entryFile: string;          // default 'src/app.ts'
  schemas: { enforceNaming: boolean; enforcePlacement: boolean; };
  openapi: { output: string; info: { title: string; version: string; description?: string } };
  validation: { requireResponseSchema: boolean; detectDeadCode: boolean; };
}
```

The CLI sets `forceGenerate: true` for `vertz dev` so partial output is available even with errors, and `forceGenerate: false` for `vertz build` where errors should block generation.

### Diagnostic Flow

```
Compiler produces:
  Diagnostic {
    severity: 'error' | 'warning' | 'info',
    code: 'VERTZ_MISSING_RESPONSE_SCHEMA',  // descriptive snake_case codes
    message: 'Missing response schema',
    file: 'src/modules/user/user.router.ts',
    line: 14, column: 1,
    endLine: 14, endColumn: 8,
    suggestion: 'Add a `response` property...',
    sourceContext: {
      lines: [
        { number: 12, text: "userRouter.get('/:id', {" },
        { number: 13, text: "  params: readUserParams," },
        { number: 14, text: "  handler: async (ctx) => {" },
        { number: 15, text: "    return ctx.userService.findById(ctx.params.id);" },
        { number: 16, text: "  }," },
        { number: 17, text: "});" },
      ],
      highlightStart: 2,
      highlightLength: 7,
    },
  }

CLI renders via:
  <DiagnosticDisplay diagnostic={d} highlighter={shiki} />
```

---

## Plugin System for Generators

`vertz generate` supports custom generators via the config file. This enables third-party packages (e.g., `@vertz/database`) to add their own scaffolding commands.

### Configuration

```typescript
// vertz.config.ts
import { defineConfig } from '@vertz/compiler';
import { databaseGenerator } from '@vertz/database/cli';

export default defineConfig({
  generators: {
    repository: databaseGenerator.repository,
    migration: databaseGenerator.migration,
  },
});
```

### Generator Interface

```typescript
// @vertz/compiler (or @vertz/cli)
export interface GeneratorDefinition {
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
  options?: Array<{
    name: string;
    flag: string;
    description: string;
    default?: string;
  }>;
  run(context: GeneratorContext): Promise<GeneratedFile[]>;
}

export interface GeneratorContext {
  name: string;                    // The argument passed (e.g., "order")
  options: Record<string, string>; // Parsed CLI options
  projectRoot: string;
  sourceDir: string;
  config: VertzConfig;
}

export interface GeneratedFile {
  path: string;                    // Relative to project root
  content: string;
}
```

### Usage

```
$ vertz generate repository order --module order

  ✓ Generated repository: order

    src/modules/order/
    └── order.repository.ts
```

The CLI discovers generators from `vertz.config.ts` and registers them as subcommands of `vertz generate`. When `vertz generate` is run without a type argument, custom generators from plugins appear in the interactive selection list alongside built-in generators.

---

## Dev Server Architecture

### Overview

The dev server is the most complex command. It orchestrates:
1. File watching
2. Incremental compilation
3. App process management (start/restart/kill)
4. Non-blocking typecheck
5. Live terminal UI updates

### Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                   Dev Loop                       │
│                                                  │
│  ┌──────────┐    ┌──────────┐    ┌───────────┐  │
│  │ Watcher  │───>│ Compiler │───>│  Process   │  │
│  │          │    │ (incr.)  │    │  Manager   │  │
│  └──────────┘    └──────────┘    └───────────┘  │
│       │                │               │         │
│       │          ┌─────┴─────┐         │         │
│       │          │ Diagnostic│         │         │
│       │          │   Stream  │         │         │
│       │          └─────┬─────┘         │         │
│       │                │               │         │
│  ┌────┴────────────────┴───────────────┴──────┐  │
│  │              Ink Renderer                   │  │
│  │  (CompilationProgress + DiagnosticDisplay   │  │
│  │   + ServerStatus)                           │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌──────────────────────────┐                    │
│  │  TypeCheck Worker        │  (non-blocking)    │
│  │  tsc --noEmit --watch    │                    │
│  └──────────────────────────┘                    │
│                                                  │
└─────────────────────────────────────────────────┘
```

### File Watcher

```typescript
// dev-server/watcher.ts
export interface WatchEvent {
  type: 'change' | 'add' | 'remove';
  path: string;
}

export interface Watcher {
  on(event: 'change', handler: (events: WatchEvent[]) => void): void;
  close(): void;
}

// Uses Bun's native watcher when available, chokidar as fallback
export function createWatcher(dir: string, options?: WatcherOptions): Watcher;
```

The watcher batches rapid changes (debounce of 100ms) to avoid recompiling on every keystroke during save.

### Process Manager

```typescript
// dev-server/process-manager.ts
export interface ProcessManager {
  start(entryPoint: string, env?: Record<string, string>): Promise<void>;
  restart(): Promise<void>;
  stop(): Promise<void>;
  onOutput(handler: (line: string) => void): void;
  onError(handler: (line: string) => void): void;
  isRunning(): boolean;
}
```

The process manager:
- Spawns the app as a child process using `bun run` (fallback: `tsx`)
- On restart: sends SIGTERM, waits 2s, then SIGKILL if still alive
- Pipes stdout/stderr through the Ink renderer
- Handles graceful shutdown on CLI exit (SIGINT/SIGTERM)

### Dev Loop

The dev loop uses `IncrementalCompiler` for efficient recompilation and `typecheckWatch()` as a parallel AsyncGenerator for non-blocking type checking.

```typescript
// dev-server/dev-loop.ts
import {
  createCompiler,
  IncrementalCompiler,
  typecheckWatch,
  type FileChange,
} from '@vertz/compiler';

export async function startDevLoop(options: DevOptions): Promise<void> {
  const config = await loadConfig();
  const compiler = createCompiler({ ...config, forceGenerate: true });
  const incremental = new IncrementalCompiler(compiler);
  const watcher = createWatcher(compiler.getConfig().compiler.sourceDir);
  const appProcess = createProcessManager();

  // Initial compilation
  const result = await incremental.initialCompile();
  renderCompilationResult(result);

  if (result.success) {
    await appProcess.start(compiler.getConfig().compiler.entryFile);
    renderServerStatus(/* ... */);
  }

  // Start non-blocking typecheck (AsyncGenerator)
  if (!options.noTypecheck) {
    (async () => {
      for await (const tchk of typecheckWatch({ tsconfigPath: 'tsconfig.json' })) {
        renderTypecheckDiagnostics(tchk.diagnostics);
      }
    })();
  }

  // Watch loop
  watcher.on('change', async (events) => {
    const changes: FileChange[] = events.map(e => ({
      path: e.path,
      kind: e.type === 'add' ? 'added' : e.type === 'remove' ? 'deleted' : 'modified',
    }));

    const result = await incremental.handleChanges(changes);

    switch (result.kind) {
      case 'reboot':
        // .env or vertz.config.ts changed -- full restart
        await appProcess.stop();
        const freshConfig = await loadConfig();
        const freshCompiler = createCompiler({ ...freshConfig, forceGenerate: true });
        // Re-initialize incremental compiler with fresh compiler
        const freshIncremental = new IncrementalCompiler(freshCompiler);
        const freshResult = await freshIncremental.initialCompile();
        renderCompilationResult(freshResult);
        if (freshResult.success) {
          await appProcess.start(freshCompiler.getConfig().compiler.entryFile);
        }
        break;

      case 'full-recompile':
        // App entry file changed -- result already contains full recompile
        renderCompilationResult(result);
        await appProcess.restart();
        break;

      case 'incremental':
        // Partial recompile of affected modules
        renderIncrementalResult(result.affectedModules, result.diagnostics);
        const hasErrors = result.diagnostics.some(d => d.severity === 'error');
        if (!hasErrors) {
          await appProcess.restart();
        }
        break;
    }
  });
}
```

### TypeCheck Integration

The compiler exports `typecheckWatch()` as an AsyncGenerator, which the CLI consumes directly. No custom worker class needed -- the compiler handles spawning `tsc --noEmit --watch` and parsing its output.

```typescript
// The CLI just iterates the generator:
for await (const result of typecheckWatch({ tsconfigPath: 'tsconfig.json' })) {
  // result.success: boolean
  // result.diagnostics: TypecheckDiagnostic[]
  renderTypecheckDiagnostics(result.diagnostics);
}
```

TypeScript errors from the background typecheck are rendered below the compiler diagnostics with a distinct visual treatment (dimmer, grouped under a "TypeCheck" header) to distinguish them from Vertz compiler diagnostics.

---

## Syntax Highlighting

Code frames use **Shiki** for syntax highlighting in the terminal. Shiki produces ANSI escape codes that render correctly in modern terminals.

```typescript
// utils/syntax-highlight.ts
import { createHighlighter, type Highlighter } from 'shiki';

let highlighter: Highlighter | null = null;

export async function getHighlighter(): Promise<Highlighter> {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ['github-dark'],
      langs: ['typescript'],
    });
  }
  return highlighter;
}

export function highlightCode(code: string): string {
  // Returns ANSI-escaped highlighted code for terminal rendering
}
```

The highlighter is initialized once (lazily) and reused across all diagnostic renders. This avoids the startup cost of loading the grammar on every recompile.

---

## Dependencies

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@vertz/compiler` | `workspace:*` | Compiler API |
| `commander` | `^14.x` | CLI argument parsing |
| `ink` | `^5.x` | React for terminals |
| `ink-spinner` | `^5.x` | Spinner animations |
| `react` | `^18.x` | Required by Ink |
| `shiki` | `^3.x` | Syntax highlighting for code frames |
| `chokidar` | `^4.x` | File watching (Node fallback) |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | `^5.7` | Type checking |
| `vitest` | `^3.x` | Testing |
| `bunup` | `latest` | Build tool (matching other packages) |
| `@types/react` | `^18.x` | React types |
| `@types/node` | `^22.x` | Node types |
| `ink-testing-library` | `^4.x` | Test Ink components |

### Why Commander over Pastel/Clipanion

- **Commander** is the most widely used CLI framework in Node.js. LLMs know it well (Vertz north star: "My LLM nailed it on the first try").
- **Pastel** couples routing to Ink components, making each command a React component. We want commands as plain functions that optionally render Ink UI -- some commands (`check --format json`) don't need a UI at all.
- **Commander** is stable, battle-tested, and has a small API surface.

### Why Shiki over Prism

- Shiki produces ANSI output natively (via `shiki/ansi`), designed for terminal use.
- Same grammar engine as VS Code (TextMate grammars), so highlighting matches what developers see in their editor.
- Prism is browser-first and requires additional work for terminal output.

---

## Configuration Loading

### Discovery

`vertz.config.ts` is discovered by walking up from `cwd()`:

```typescript
// config/loader.ts
export async function loadConfig(cwd?: string): Promise<VertzConfig> {
  const configPath = findConfigFile(cwd ?? process.cwd());
  if (!configPath) return defaultConfig;

  // Use jiti for runtime TypeScript config loading
  const jiti = createJiti(configPath);
  const raw = await jiti.import(configPath);
  return mergeWithDefaults(raw.default ?? raw);
}

function findConfigFile(from: string): string | null {
  // Walk up looking for vertz.config.ts, vertz.config.js, vertz.config.mjs
}
```

### Default Configuration

The CLI extends `VertzConfig` (from `@vertz/compiler`) with CLI-specific options for dev server and generators:

```typescript
// config/defaults.ts
import type { VertzConfig } from '@vertz/compiler';

// CLI extends VertzConfig with dev/generator options
export interface CLIConfig extends VertzConfig {
  dev?: {
    port?: number;
    host?: string;
    open?: boolean;
    typecheck?: boolean;
  };
  generators?: Record<string, GeneratorDefinition>;
}

export const defaultCLIConfig: CLIConfig = {
  // VertzConfig defaults (compiler resolves these too, but CLI shows them in help)
  strict: false,
  forceGenerate: false,
  compiler: {
    sourceDir: 'src',
    outputDir: '.vertz/generated',
    entryFile: 'src/app.ts',
    schemas: {
      enforceNaming: true,
      enforcePlacement: true,
    },
    openapi: {
      output: '.vertz/generated/openapi.json',
      info: { title: 'Vertz API', version: '1.0.0' },
    },
    validation: {
      requireResponseSchema: true,
      detectDeadCode: true,
    },
  },
  // CLI-specific defaults
  dev: {
    port: 3000,
    host: 'localhost',
    open: false,
    typecheck: true,
  },
  generators: {},
};
```

---

## `create-vertz-app` (Scaffolding)

Separate package for `npm create vertz-app` / `bun create vertz-app`. This is a standalone CLI that scaffolds a new Vertz project.

```
$ bun create vertz-app my-api

  Creating Vertz project: my-api

  ? Which runtime? (Use arrow keys)
  > Bun (recommended)
    Node.js
    Deno

  ? Include example module? (Y/n)

  ✓ Project created

    cd my-api
    bun install
    bun run dev

  Happy coding!
```

### What it scaffolds

```
my-api/
├── package.json
├── tsconfig.json
├── vertz.config.ts
├── .env
├── .env.example
├── .gitignore
├── src/
│   ├── env.ts
│   ├── app.ts
│   ├── main.ts                    # Entry point
│   ├── middlewares/
│   │   └── request-id.middleware.ts
│   └── modules/
│       └── health/                # Example module
│           ├── health.module-def.ts
│           ├── health.module.ts
│           ├── health.service.ts
│           ├── health.router.ts
│           └── schemas/
│               └── health-check.schema.ts
```

`create-vertz-app` is a separate package because:
1. It's used once per project, shouldn't be in `@vertz/cli`
2. It follows the npm `create-*` convention (`npm create vertz-app` just works)
3. It can be lightweight (no compiler dependency)

---

## Implementation Phases (TDD)

Each phase is detailed in its own file. Phases must be implemented in order -- each builds on the previous.

| Phase | Name | Plan |
|-------|------|------|
| 1 | Package Skeleton and Config Loading | [phase-01-scaffold-and-config.md](./phase-01-scaffold-and-config.md) |
| 2 | Theme and Core UI Components | [phase-02-theme-and-ui-components.md](./phase-02-theme-and-ui-components.md) |
| 3 | DiagnosticDisplay and Syntax Highlighting | [phase-03-diagnostic-display.md](./phase-03-diagnostic-display.md) |
| 4 | `vertz check` | [phase-04-check-command.md](./phase-04-check-command.md) |
| 5 | `vertz build` | [phase-05-build-command.md](./phase-05-build-command.md) |
| 6 | Dev Server Infrastructure | [phase-06-dev-server-infrastructure.md](./phase-06-dev-server-infrastructure.md) |
| 7 | `vertz dev` | [phase-07-dev-command.md](./phase-07-dev-command.md) |
| 8 | `vertz generate` | [phase-08-generate-command.md](./phase-08-generate-command.md) |
| 9 | `vertz routes` | [phase-09-routes-command.md](./phase-09-routes-command.md) |
| 10 | `vertz deploy` | [phase-10-deploy-command.md](./phase-10-deploy-command.md) |
| 11 | `create-vertz-app` | [phase-11-create-vertz-app.md](./phase-11-create-vertz-app.md) |

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Commander for argument parsing** | Most popular CLI framework. LLMs know it. Simple API surface. Clean separation from Ink rendering. |
| **TaskRunner abstraction (blimu pattern)** | Commands don't import Ink directly. TaskRunner is testable without a terminal. Matches existing team patterns. |
| **Shiki for syntax highlighting** | ANSI output built-in. Same grammars as VS Code. TypeScript support excellent. |
| **Separate `create-vertz-app`** | Follows npm convention. Used once per project. No heavy dependencies. |
| **chokidar as Node fallback** | Bun's native watcher is fastest but Node needs a polyfill. chokidar is battle-tested. |
| **`--format github` on check** | First-class CI support. GitHub Actions annotations show errors inline in PRs. |
| **Plugin system for generators** | Extensible without forking. `@vertz/database` adds `vertz generate repository`. |
| **Non-blocking typecheck in dev** | TypeScript checking is slow (1-3s). Don't block the server restart. Show errors separately. |
| **Config via jiti** | Runtime TypeScript loading without requiring build step. Same approach as Vite, Nuxt, Astro. |
| **CLI as thin orchestrator** | CLI owns terminal UX. Compiler owns analysis + generation. Neither reaches into the other's domain. |
| **Interactive prompts for missing params** | Better DX than hard errors. Guides the user through the flow. Disabled automatically in CI (`CI=true`). |

---

## Patterns Adopted from Blimu CLI

The blimu CLI (`~/blimu-dev/blimu-ts/packages/cli`) provides several patterns we adopt:

1. **TaskRunner/TaskGroup/Task hierarchy** -- Clean abstraction over Ink rendering. Commands express intent ("task started", "task succeeded"), TaskRunner handles visual representation.

2. **PulsingDot animation** -- The `○` that cycles through dim/normal/bright states. More elegant than spinner text. Adopted for running state indicators.

3. **Tree connector (`⎿`) for sub-items** -- Visual hierarchy without heavy box-drawing. First sub-item gets the connector, subsequent items are indented.

4. **Group dismissal** -- `group.dismiss()` removes completed groups from display, keeping the terminal clean during multi-step workflows.

5. **Lazy Ink initialization** -- `ensureRendering()` only mounts the Ink app on first use. Commands that output JSON (`--format json`) never start Ink.

6. **Process cleanup on SIGINT/SIGTERM** -- Ensures cursor is restored even on Ctrl+C.

---

## Open Items

- [ ] **Keyboard shortcuts in dev mode** -- `h + enter` for help, `r + enter` for manual restart, `o + enter` to open in browser. Need to design the keyboard handling without conflicting with child process I/O.
- [ ] **HMR vs full restart** -- Current design always restarts the process on recompile. Could we do HMR for certain changes (e.g., handler-only changes)?
- [ ] **Telemetry** -- Anonymous usage analytics (opt-in). Which commands are used most, compilation times, error frequencies.
- [ ] **Plugin lifecycle hooks** -- Should plugins be able to hook into the dev loop (e.g., run a custom step after compilation)?
- [ ] **Multi-project workspaces** -- How does `vertz dev` work in a monorepo with multiple Vertz apps?
- [ ] **Error overlay in browser** -- Like Vite's error overlay, show compiler errors in the browser during dev mode.
- [ ] **Shiki bundle size** -- Shiki loads large grammar files. Should we use a lighter subset or bundle only the TypeScript grammar?
- [ ] **Windows support** -- ANSI codes, path separators, process management (`SIGTERM` vs `taskkill`).

---

## Verification

After implementation:

1. `bun test` -- all unit and component tests pass
2. `bun run build` -- package builds with no TypeScript errors
3. `vertz build` runs full compilation and generates all 5 output files
4. `vertz dev` watches files and restarts correctly on changes
5. `vertz check` validates and reports diagnostics with code frames
6. `vertz generate` scaffolds files following conventions
7. `vertz routes` displays route table from compiled output
8. `vertz deploy` generates deployment configuration for Railway/Fly
9. Diagnostics render with syntax-highlighted TypeScript code frames
10. `--format json` output is machine-parseable
11. `--format github` output produces valid GitHub Actions annotations
12. All commands handle `Ctrl+C` gracefully (cursor restored, processes killed)
13. Interactive prompts work correctly for all commands with missing parameters
14. `CI=true` skips interactive prompts and throws clear errors for missing parameters

---

## Development Process: Strict TDD

All development on the CLI **must** follow the strict Test-Driven Development process as defined in the project rules:

- **[`.claude/rules/tdd.md`](../../.claude/rules/tdd.md)** -- The core TDD process: Red -> Green -> Quality Gates -> Refactor, one test at a time.
- **[`.claude/rules/ultra-tdd.md`](../../.claude/rules/ultra-tdd.md)** -- Extended TDD guidelines including triangulation, type-level TDD, and the full execution checklist.

### Key Requirements

1. **No production code without a failing test.** Every line of production code must be driven by a test that demanded it.
2. **One test at a time.** Write one failing test, make it pass, run quality gates, refactor. Then repeat.
3. **Quality gates after every GREEN.** Run `bunx biome check --write <files>` and `bun run typecheck` after every passing test. Fix issues immediately.
4. **Triangulation for generalization.** Hard-code first, then add a second test that breaks the hard-code, forcing real logic.
5. **Type-level TDD for type constraints.** Use `@ts-expect-error` as the RED test for type-only changes. Run `bun run typecheck` to verify implementation types.
6. **Never skip or disable linting, type checking, or tests.** No `@ts-ignore`, no `.skip`, no `--no-verify`. Fix the code, not the rules.

Each phase plan includes specific behaviors to test. Implement them in order, one test at a time. The test output is the proof that TDD is working.
