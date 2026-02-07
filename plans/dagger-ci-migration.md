# Plan: Migrate CI from raw GitHub Actions to Dagger

## Context

The current CI is a simple GitHub Actions YAML workflow (checkout → setup-bun → install → lint → build → typecheck → test). It works, but it's not runnable locally — the AI can't validate CI before opening a PR, and developers can't reproduce CI failures on their machines.

Dagger solves this by defining the CI pipeline as TypeScript code that runs identically locally and in CI. The key win: Claude Code can run `dagger call ci` before pushing, catching failures before they hit GitHub. This aligns with Vertz's "if it builds, it runs" philosophy — applied to the CI itself.

## Decisions

- **Module location:** `ci/` directory, `dagger.json` at repo root
- **Module runtime:** Bun (experimental) — fallback to Node if issues arise
- **Workload container:** `oven/bun:1` (official Bun Docker image)
- **CI runners:** GitHub-hosted (free) — no persistent Dagger cache, but acceptable for a small project. Switching to Depot later is a one-line change.
- **Caching:** `dag.cacheVolume("bun-cache")` for `bun install` cache. Works locally (Docker persists), cold on GitHub runners.

## Implementation

### Dagger module (`ci/src/index.ts`)

Functions exposed:
- **`base(source)`** → Container with Bun + deps installed
- **`lint(source)`** → biome check
- **`build(source)`** → bunup build across all packages
- **`typecheck(source)`** → build + tsc --noEmit (build needed for .d.ts resolution)
- **`test(source)`** → build + vitest run
- **`ci(source)`** → lint → build → typecheck → test (full pipeline)

### GitHub Actions workflow

Replaced raw Bun steps with a single Dagger call:
```yaml
- uses: dagger/dagger-for-github@v8
  with:
    version: "0.19.11"
    verb: call
    args: ci
```

### Usage

```bash
dagger call ci          # full pipeline
dagger call lint        # just lint
dagger call typecheck   # build + typecheck
dagger call test        # build + test
dagger call base terminal  # debug shell
```

## Learnings

1. **Dagger decorator introspector evaluates `@argument()` in isolation** — can't reference constants. Must inline arrays.
2. **`tsc --noEmit` produces no stdout** — chaining `.stdout()` on empty output causes graphql errors. Fixed by appending an `echo` sentinel.
3. **Workspace typecheck needs build first** — `@vertz/core` imports from `@vertz/schema`, which needs `.d.ts` files. Individual `typecheck` and `test` functions must build first.
4. **Dagger `.sync()` has issues with Bun runtime** — chaining `withExec()` calls works reliably; `await .sync()` does not.

## Caching Note

On GitHub-hosted runners, Dagger cache volumes don't persist between runs — each run starts cold. This is a known limitation without Depot or Dagger Cloud. For a small project like Vertz, cold `bun install` takes seconds, so this is acceptable. Locally, Docker keeps the engine running, so cache volumes persist and repeat runs are fast.
