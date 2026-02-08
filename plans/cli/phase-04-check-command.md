# Phase 4: `vertz check` Command

**Prerequisites:** [Phase 3 -- DiagnosticDisplay and Syntax Highlighting](./phase-03-diagnostic-display.md)

**Goal:** Implement the simplest full command -- `vertz check`. This is the first command that integrates Commander routing, compiler API calls, diagnostic rendering, and exit codes. It serves as the template for all subsequent commands.

---

## What to Implement

1. **Check command** -- `src/commands/check.ts` with `checkAction()` handler
2. **Command registration** -- Wire `check` command into `src/cli.ts` (replace stub)
3. **Output formats** -- `pretty` (default, uses DiagnosticDisplay), `json` (machine-parseable), `github` (GitHub Actions annotations)
4. **Exit codes** -- Exit 0 on success, exit 1 on errors

---

## Files to Create/Modify

### New Files

```
packages/cli/src/
└── commands/
    └── check.ts
```

### Test Files

```
packages/cli/src/
└── commands/
    └── __tests__/
        └── check.test.ts
```

### Modified Files

- `src/cli.ts` -- Replace check command stub with real implementation

---

## Expected Behaviors to Test

### Check Command (`src/commands/__tests__/check.test.ts`)

Use a mock/stub compiler to control diagnostics output.

#### Core behavior

- [ ] Loads project config via `loadConfig()`
- [ ] Creates compiler via `createCompiler(config)`
- [ ] Calls `compiler.analyze()` to build the IR
- [ ] Calls `compiler.validate(ir)` to get diagnostics
- [ ] Reports diagnostics to the user
- [ ] Exits with code 0 when there are no errors
- [ ] Exits with code 1 when there are errors
- [ ] Warnings alone do not cause exit code 1

#### Pretty format (default)

- [ ] Renders diagnostics using DiagnosticDisplay component
- [ ] Renders summary using DiagnosticSummary component
- [ ] Shows success message when no errors

#### JSON format (`--format json`)

- [ ] Outputs valid JSON to stdout
- [ ] JSON contains `success` boolean field
- [ ] JSON contains `diagnostics` array field
- [ ] Each diagnostic includes `severity`, `code`, `message`, `file`, `line`, `column`
- [ ] Does not render Ink UI (no ANSI codes in output)

#### GitHub format (`--format github`)

- [ ] Outputs GitHub Actions annotation format
- [ ] Error diagnostics produce `::error file=...,line=...,col=...::` lines
- [ ] Warning diagnostics produce `::warning file=...,line=...,col=...::` lines
- [ ] Does not render Ink UI

#### Typecheck integration

- [ ] Runs typecheck by default (`--typecheck` defaults to `true`)
- [ ] Skips typecheck when `--no-typecheck` is passed
- [ ] Includes typecheck diagnostics in the output
- [ ] Typecheck errors cause exit code 1

#### Strict mode

- [ ] Uses strict mode from config by default
- [ ] `--strict` flag overrides config to enable strict mode
- [ ] Strict mode passes through to the compiler

---

## Quality Gates

After each GREEN:

```bash
bunx biome check --write packages/cli/src/commands/
bun run typecheck
```

---

## Notes

- This is the first command that touches `@vertz/compiler`. Use dependency injection or factory pattern so tests can provide a mock compiler.
- The `--format json` and `--format github` modes should bypass the Ink renderer entirely. Use `runner.cleanup()` or avoid creating the runner at all.
- The GitHub Actions annotation format is: `::error file={file},line={line},col={col}::{code}: {message}`
- `vertz check` does NOT generate output files. It only validates.
- This command has no interactive prompts -- all parameters have sensible defaults.
