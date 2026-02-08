# Phase 7: `vertz dev` Command

**Prerequisites:** [Phase 6 -- Dev Server Infrastructure](./phase-06-dev-server-infrastructure.md)

**Goal:** Implement the full dev loop with watch mode, incremental compilation, process management, non-blocking typecheck, and the ServerStatus component.

---

## What to Implement

1. **Dev loop** -- `src/dev-server/dev-loop.ts` orchestrating watcher + compiler + process manager
2. **Dev command** -- `src/commands/dev.ts` with `devAction()` handler
3. **ServerStatus component** -- `src/ui/components/ServerStatus.tsx` showing server URLs and compilation stats
4. **Command registration** -- Wire `dev` command into `src/cli.ts` (replace stub)

---

## Files to Create/Modify

### New Files

```
packages/cli/src/
├── dev-server/
│   └── dev-loop.ts
├── commands/
│   └── dev.ts
└── ui/
    └── components/
        └── ServerStatus.tsx
```

### Test Files

```
packages/cli/src/
├── dev-server/
│   └── __tests__/
│       └── dev-loop.test.ts
├── commands/
│   └── __tests__/
│       └── dev.test.ts
└── ui/
    └── __tests__/
        └── components/
            └── server-status.test.tsx
```

### Modified Files

- `src/cli.ts` -- Replace dev command stub with real implementation

---

## Expected Behaviors to Test

### ServerStatus Component (`src/ui/__tests__/components/server-status.test.tsx`)

- [ ] Renders local URL
- [ ] Renders network URL when provided
- [ ] Renders docs URL when provided
- [ ] Renders compilation time
- [ ] Renders module count
- [ ] Renders route count
- [ ] Renders error count
- [ ] Uses arrow symbol (`➜`) for URL lines
- [ ] Shows success message with compilation stats

### Dev Loop (`src/dev-server/__tests__/dev-loop.test.ts`)

Use mock compiler, watcher, and process manager.

#### Initial compilation

- [ ] Loads config with `forceGenerate: true`
- [ ] Runs `initialCompile()` on the IncrementalCompiler
- [ ] Starts app process on successful compilation
- [ ] Renders server status on successful compilation
- [ ] Renders diagnostics on failed compilation
- [ ] Does not start app process on failed compilation (but keeps watching)

#### File change handling

- [ ] On incremental change: recompiles affected modules
- [ ] On incremental change with no errors: restarts app process
- [ ] On incremental change with errors: renders diagnostics, does not restart
- [ ] On full-recompile: renders full result, restarts process
- [ ] On reboot (config/env change): stops process, reloads config, recreates compiler, restarts

#### TypeCheck integration

- [ ] Starts non-blocking typecheck by default
- [ ] Skips typecheck when `--no-typecheck` is passed
- [ ] Renders typecheck diagnostics separately from compiler diagnostics

### Dev Command (`src/commands/__tests__/dev.test.ts`)

- [ ] Accepts `--port` flag to override default port
- [ ] Accepts `--host` flag to override default host
- [ ] Accepts `--open` flag to open browser on start
- [ ] Accepts `--no-typecheck` flag to disable background typecheck
- [ ] Starts the dev loop with resolved options
- [ ] Handles SIGINT gracefully (stops watcher, kills process, cleans up)
- [ ] Handles SIGTERM gracefully

---

## Quality Gates

After each GREEN:

```bash
bunx biome check --write packages/cli/src/dev-server/ packages/cli/src/commands/ packages/cli/src/ui/
bun run typecheck
```

---

## Notes

- This is the most complex command. Break the dev loop into clearly separated concerns: the loop itself, the rendering, and the process management. Each should be testable independently.
- The dev loop should be implemented as a function that accepts dependencies (compiler factory, watcher factory, process manager factory) so tests can inject mocks.
- The `forceGenerate: true` flag is critical -- it ensures the compiler still generates output files even when there are errors, so the dev server can show partial results.
- The "reboot" case (when `vertz.config.ts` or `.env` changes) is the most complex. It requires fully recreating the compiler and incremental compiler from scratch.
- Consider implementing the SIGINT/SIGTERM cleanup as a separate utility that can be tested.
- The TypeCheck integration uses `typecheckWatch()` as an AsyncGenerator. In tests, create a mock async generator that yields predefined results.
