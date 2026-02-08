# Debug Dagger CI Failures

You are debugging a Dagger CI pipeline failure. The most common symptom is a cryptic error like:

```
ERROR: Encountered an unknown error while requesting data via graphql
```

**This is almost never a Dagger engine issue.** It is the Dagger CLI swallowing the actual CI error (lint, typecheck, test, or build failure) and reporting it as a generic GraphQL error.

## Step 1: Reproduce with verbose output

Run the full pipeline with `--progress plain` to see every step's output:

```bash
dagger call ci --progress plain
```

For maximum verbosity, combine flags:

```bash
dagger call ci --progress plain --debug
```

Or use increasing verbosity levels:

```bash
dagger call ci --progress plain -vvv
```

## Step 2: Isolate the failing step

The CI pipeline runs four steps in sequence: lint, build, typecheck, test. Run each individually:

```bash
dagger call lint --progress plain
dagger call build --progress plain
dagger call typecheck --progress plain
dagger call test --progress plain
```

The first one that fails is your culprit.

## Step 3: Debug interactively

Open a terminal in the Dagger container to inspect the environment:

```bash
dagger call base terminal
```

This drops you into a shell inside the container with dependencies installed. You can run commands manually to see what fails:

```bash
bun run lint
bun run --filter '*' build
bun run typecheck
bun test
```

## Step 4: Common failure causes

- **New package not excluded from lint:** Biome runs on `packages/` -- new packages with different coding styles or POC code may fail lint.
- **Missing dependencies in container:** The `bun install --frozen-lockfile` may fail if `bun.lock` is out of date.
- **Typecheck failures:** New packages need a `tsconfig.json` and proper `typecheck` script, or they need to be excluded.
- **Concurrent runs:** Multiple agents pushing at once share the same Dagger engine (Docker container). This generally works fine as Dagger handles concurrency, but can cause resource contention.

## Step 5: Dagger CLI flags reference

| Flag | Purpose |
|------|---------|
| `--progress plain` | Show full step-by-step output (no TUI) |
| `--debug` / `-d` | Show debug-level logs |
| `-v` / `-vv` / `-vvv` | Increasing verbosity levels |
| `--quiet` / `-q` | Reduce output (opposite of verbose) |
| `--silent` / `-s` | No progress output at all |

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DAGGER_NO_NAG=1` | Suppress the "Setup tracing" nag message |

## Key insight

When the pre-push hook (`lefthook.yml`) reports a Dagger error, the fix is almost always in the application code, not in Dagger configuration. Use `--progress plain` to see what actually failed, then fix the lint/typecheck/test error.
