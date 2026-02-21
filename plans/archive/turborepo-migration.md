# Plan: Migrate from Dagger to Turborepo

## Context

Dagger was introduced to give local/CI parity — run the same pipeline everywhere. In practice, it's been unreliable:

- **Dagger Engine instability** on GitHub Actions (not on official Docker registry, random failures)
- **No persistent cache** on ephemeral GitHub runners — cold engine every run, zero caching benefit
- **Extra abstraction layer** that adds complexity without determinism
- **Non-deterministic failures** — the opposite of what we need

We need CI that is **deterministic, cached, and identical locally and in CI**.

## Decision

**Replace Dagger with Turborepo.**

- Content-hash-based caching (same input → same output)
- Local ↔ CI parity (exact same commands)
- Remote cache for cross-environment reuse (local runs warm CI cache and vice versa)
- Zero engine dependency — just a CLI binary
- First-class Bun workspace support

## Current Monorepo (15 packages)

All packages have consistent scripts: `build`, `test`, `typecheck`

| Package | Scripts |
|---------|---------|
| @vertz/cli | build, test, typecheck |
| @vertz/cli-runtime | build, test, typecheck |
| @vertz/codegen | build, test, typecheck |
| @vertz/compiler | build, test, typecheck |
| @vertz/core | build, test, typecheck |
| @vertz/db | build, test, typecheck |
| @vertz/demo-toolkit | build, test, typecheck |
| @vertz/fetch | build, test, typecheck |
| @vertz/integration-tests | test, typecheck (no build) |
| @vertz/primitives | build, test, typecheck |
| @vertz/schema | build, test, typecheck |
| @vertz/testing | build, test, typecheck |
| @vertz/ui | build, test, typecheck |
| @vertz/ui-compiler | build, test, typecheck |
| @vertz/ui-server | build, test, typecheck |

## Implementation

### 1. Add Turborepo

```bash
bun add -D turbo
```

### 2. Create `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "package.json", "tsconfig.json", "bunup.config.ts"],
      "outputs": ["dist/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "package.json", "tsconfig.json"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "package.json", "tsconfig.json", "vitest.config.ts"],
      "outputs": ["coverage/**"],
      "env": ["DATABASE_TEST_URL"]
    },
    "lint": {
      "inputs": ["src/**", "package.json"],
      "outputs": []
    }
  }
}
```

Key design decisions:
- `dependsOn: ["^build"]` — typecheck and test depend on upstream packages being built first (needed for `.d.ts` resolution)
- `inputs` are explicit — only source files, config, and package.json trigger cache invalidation
- `outputs` are explicit — Turborepo caches and restores these

### 3. Update root `package.json` scripts

```json
{
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint",
    "ci": "turbo run lint build typecheck test",
    "ci:affected": "turbo run lint build typecheck test --filter=...[origin/main]"
  }
}
```

`ci:affected` replaces Dagger's `smart-ci` — only runs tasks for packages affected since `main`.

### 4. Update GitHub Actions (`ci.yml`)

Replace the Dagger steps with:

```yaml
jobs:
  check:
    name: Lint, typecheck, test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: CI pipeline
        run: |
          if [ "${{ github.event_name }}" = "push" ]; then
            bun run ci
          else
            bun run ci:affected
          fi
```

That's it. No Dagger engine, no special action, no container-in-container. Same commands locally and in CI.

### 5. Remote Cache (optional but recommended)

```bash
# Vercel remote cache (free)
bunx turbo login
bunx turbo link
```

Or self-hosted with `TURBO_TOKEN` and `TURBO_TEAM` env vars in GitHub Actions.

This means: developer runs tests locally → cache is stored remotely → CI hits cache → near-instant CI for unchanged packages.

### 6. Remove Dagger

- Delete `ci/` directory
- Delete `dagger.json`
- Remove `dagger/dagger-for-github` from CI workflow
- Remove `ci/` from `SOURCE_PATTERNS` in CI workflow
- Remove Dagger SDK from dependencies

### 7. Lint as a Turbo task

Currently lint runs globally (`biome check packages/`). Two options:
- **Keep global:** Run lint outside Turbo (simpler, Biome is fast)
- **Per-package:** Add `lint` script to each package.json (more granular caching)

Recommendation: Keep global for now. Biome is fast enough that caching lint per-package adds complexity without meaningful time savings.

## Adding a New Package (Checklist)

When creating a new `@vertz/*` package, ensure:

1. **`package.json` has the standard scripts:**
   ```json
   {
     "scripts": {
       "build": "bunup",
       "test": "vitest run",
       "typecheck": "tsc --noEmit"
     }
   }
   ```

2. **No `turbo.json` changes needed** — Turborepo auto-discovers workspace packages and applies the root `turbo.json` task definitions to all of them.

3. **Declare internal dependencies** in `package.json`:
   ```json
   {
     "dependencies": {
       "@vertz/core": "workspace:*"
     }
   }
   ```
   Turborepo uses these to build the dependency graph automatically.

4. **Add to coverage workflow** if the package needs coverage reporting (update `ci.yml` coverage job's package list).

5. **Run `bun install`** to update the lockfile.

6. **Verify:** `bun run ci` should pick up the new package automatically.

**The key insight:** Turborepo is zero-config for new packages. As long as the package has the standard scripts and proper `dependencies`, it just works. No registration step needed.

## Migration Order

1. Add `turbo` + `turbo.json` (non-breaking — Dagger still works)
2. Update root scripts to use `turbo run`
3. Verify locally: `bun run ci` works
4. Update CI workflow to drop Dagger
5. Remove `ci/` and `dagger.json`
6. Enable remote cache
7. Update `RULES.md` and process docs

## Rollback

If Turborepo has issues, reverting is trivial: change root scripts back to `bun run --filter` and restore the Dagger CI steps. The per-package scripts don't change at all.

## Success Criteria

- [ ] `bun run ci` runs identical pipeline locally and in GitHub Actions
- [ ] Cached runs complete in <30s for unchanged packages
- [ ] No dependency on external engines or registries
- [ ] New packages are auto-discovered without config changes
- [ ] Remote cache shared between local and CI environments
