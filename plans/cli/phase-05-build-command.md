# Phase 5: `vertz build` Command

**Prerequisites:** [Phase 4 -- `vertz check` Command](./phase-04-check-command.md)

**Goal:** Implement the production build command with full compilation, blocking typecheck, file generation, and the CompilationProgress component.

---

## What to Implement

1. **Build command** -- `src/commands/build.ts` with `buildAction()` handler
2. **CompilationProgress component** -- `src/ui/components/CompilationProgress.tsx` showing live pipeline phases
3. **Command registration** -- Wire `build` command into `src/cli.ts` (replace stub)
4. **Output summary** -- Display generated files with sizes and total build time

---

## Files to Create/Modify

### New Files

```
packages/cli/src/
├── commands/
│   └── build.ts
└── ui/
    └── components/
        └── CompilationProgress.tsx
```

### Test Files

```
packages/cli/src/
├── commands/
│   └── __tests__/
│       └── build.test.ts
└── ui/
    └── __tests__/
        └── components/
            └── compilation-progress.test.tsx
```

### Modified Files

- `src/cli.ts` -- Replace build command stub with real implementation

---

## Expected Behaviors to Test

### CompilationProgress Component (`src/ui/__tests__/components/compilation-progress.test.tsx`)

- [ ] Renders all phases with their names
- [ ] Shows pending symbol for phases with 'pending' status
- [ ] Shows running indicator for phases with 'running' status
- [ ] Shows success symbol for phases with 'done' status
- [ ] Shows error symbol for phases with 'error' status
- [ ] Renders detail text next to phase name (e.g., "(12 files)")
- [ ] Handles empty phases array

### Build Command (`src/commands/__tests__/build.test.ts`)

Use a mock/stub compiler.

#### Core behavior

- [ ] Loads project config via `loadConfig()`
- [ ] Creates compiler via `createCompiler(config)` (without `forceGenerate`)
- [ ] Calls `compiler.compile()` for full compilation
- [ ] Runs blocking `typecheck()` after compilation
- [ ] Exits with code 0 on success
- [ ] Exits with code 1 when compilation has errors
- [ ] Exits with code 1 when typecheck has errors

#### Progress display

- [ ] Shows compilation progress phases (Schemas, Middleware, Modules, Validation, TypeCheck, Generation)
- [ ] Updates phase status as compilation progresses
- [ ] Shows build timing on success

#### Output summary

- [ ] Lists generated output files on success
- [ ] Shows file sizes for each generated file
- [ ] Shows total build time
- [ ] Does not show output file list on failure

#### Flags

- [ ] `--output <dir>` overrides the output directory in config
- [ ] `--strict` enables strict mode checks
- [ ] `--no-emit` validates without generating files
- [ ] `--no-emit` skips the Generation phase

#### Error handling

- [ ] Renders diagnostics with DiagnosticDisplay on failure
- [ ] Shows "Build failed with N errors" message on failure
- [ ] TypeCheck errors are displayed after compiler diagnostics

---

## Quality Gates

After each GREEN:

```bash
bunx biome check --write packages/cli/src/commands/ packages/cli/src/ui/
bun run typecheck
```

---

## Notes

- The build command uses `forceGenerate: false` (the default) -- errors should block file generation.
- The `--no-emit` flag is useful for CI where you only want validation without generating files. It essentially makes `build` behave like `check` but with all build-phase validations.
- Build timing should use `performance.now()` or similar high-resolution timer.
- The CompilationProgress component receives phases as props. The command handler manages phase state transitions.
