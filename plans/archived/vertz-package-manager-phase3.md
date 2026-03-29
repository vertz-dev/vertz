# Vertz Package Manager — Phase 3: Complete Feature Set

> "If a dependency limits us, we replace it." — Vertz Vision, Principle 8

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-03-29 | Initial draft — all remaining PM features |
| 2 | 2026-03-29 | Address all blockers + should-fix from DX, Product, and Technical reviews. Key changes: (1) `--latest` preserves range operators, (2) `update` explicitly removes lockfile entries before re-resolving, (3) postinstall uses copy instead of hardlink for packages with scripts, (4) split Phase 3e into 3e/3f, private registries moved to 3g, (5) `--peer` moved to standalone Phase 3a-peer, (6) add `--dry-run` to update, (7) `.npmrc` env var interpolation, (8) workspace lockfile strategy, (9) `write_package_json` extended for peerDeps, (10) manifest keys include nest_path, (11) postinstall security acknowledged |

**Prior art:** Phase 2a (CLI commands, PR #2017) and Phase 2b (introspection & agent output, PR #2022) are merged to main. This document covers all remaining package manager features to reach parity with a usable standalone tool.

---

## Executive Summary

Complete the Vertz package manager with the remaining features from the Phase 2a deferred list: `vertz update`, `--peer`/`-P` flag, `vertz cache clean`, postinstall script execution, incremental linking, monorepo workspace support, and private registry authentication. After this work, `vertz` is a complete single-binary replacement for npm/yarn/pnpm for single-project and monorepo use.

---

## The Problem

After Phase 2a and 2b, `vertz` handles install/add/remove/list/why/outdated. But developers still hit walls:

1. **No `vertz update`** — `outdated` tells you what's stale but you can't fix it without manual `add` calls.
2. **No peer deps** — Libraries with peerDependencies can't express their contracts.
3. **No cache management** — Cache grows unbounded with no cleanup.
4. **No postinstall** — Packages like `esbuild`, `prisma`, `sharp` don't work (they need postinstall to download platform binaries).
5. **Full node_modules nuke on every install** — Slow for large projects.
6. **No workspace linking** — Monorepo packages can't reference each other.
7. **No private registries** — Enterprise users can't use internal packages.

---

## API Surface

### `vertz update` (Phase 3a)

```bash
vertz update                # Update all packages to latest matching their ranges
vertz update zod            # Update specific package only
vertz update zod react      # Update multiple specific packages
vertz update --latest       # Ignore ranges, update to absolute latest (rewrites package.json)
vertz update --dry-run      # Preview what would change without modifying files
vertz update --json         # NDJSON output
```

**Semantics:** `vertz update` differs from `vertz install` — it removes lockfile entries for targeted packages (or all packages if none specified) and re-resolves, picking the latest version matching the existing range. `vertz install` respects lockfile pins. This distinction is critical.

**`--latest` preserves range operators:** If a dependency uses `~3.24.0`, `--latest` rewrites to `~4.0.1` (not `^4.0.1`). The range operator prefix (`^`, `~`, `>=`, etc.) is preserved. Only the version number changes.

**Developer workflow:** Run `vertz outdated` to see what's available, then `vertz update zod typescript` to update specific packages. `vertz update` (no args) updates everything.

Output:
```
$ vertz update
Updated 3 packages:
  zod: 3.24.2 → 3.24.4 (^3.24.0)
  react: 18.3.0 → 18.3.1 (^18.3.0)
  typescript: 5.6.2 → 5.7.3 (^5.6.0)

$ vertz update --latest
Updated 2 packages (ranges updated):
  zod: 3.24.2 → 4.0.1 (^3.24.0 → ^4.0.1)
  typescript: 5.6.2 → 5.8.0 (~5.6.0 → ~5.8.0)

$ vertz update --dry-run
Would update 3 packages:
  zod: 3.24.2 → 3.24.4 (^3.24.0)
  react: 18.3.0 → 18.3.1 (^18.3.0)
  typescript: 5.6.2 → 5.7.3 (^5.6.0)
No changes written.

$ vertz update  # (when nothing is outdated)
All packages are up to date.
```

**Without lockfile:** `vertz update` without a `vertz.lock` exits with error: `error: no lockfile found. Run "vertz install" first.`

**JSON output schema:**
```json
{"event":"update","name":"zod","from":"3.24.2","to":"3.24.4","range":"^3.24.0"}
{"event":"update","name":"react","from":"18.3.0","to":"18.3.1","range":"^18.3.0"}
{"event":"done","updated":2,"elapsed_ms":1234}
```

### `--peer`/`-P` flag (Phase 3a-peer)

```bash
vertz add -P react          # Add to peerDependencies
vertz add --peer react      # Same
vertz add -P -D react       # Error: cannot use --peer and --dev together
```

**Peer dependencies are NOT auto-installed.** Adding via `vertz add -P react` records the dependency in `peerDependencies` but does not install it into `node_modules/`. This is the standard behavior — peer deps are the consuming project's responsibility. To also install it locally for development, run `vertz add react && vertz add -P react`.

### `vertz cache` subcommands (Phase 3b)

```bash
vertz cache clean           # Remove all cached packages and metadata
vertz cache clean --metadata  # Only clear registry metadata cache (keeps store)
vertz cache list            # Show cache location and size
vertz cache path            # Print cache directory path (for CI cache keys)
vertz cache list --json     # NDJSON output
vertz cache clean --json    # NDJSON output
```

Output:
```
$ vertz cache path
/Users/dev/.vertz/cache/npm

$ vertz cache list
Cache location: ~/.vertz/cache/npm
  Registry metadata: 12.4 MB (342 entries)
  Package store: 1.2 GB (1,847 packages)
  Total: 1.2 GB

$ vertz cache clean
Removed 1.2 GB from cache (1,847 packages, 342 metadata entries)
```

JSON output:
```json
{"location":"/Users/dev/.vertz/cache/npm","metadata_bytes":12400000,"metadata_entries":342,"store_bytes":1200000000,"store_packages":1847}
```

### Postinstall Scripts (Phase 3c)

```bash
vertz install               # Runs postinstall scripts after linking
vertz install --ignore-scripts  # Skip postinstall scripts
vertz add esbuild           # Runs esbuild's postinstall after install
```

Output (success):
```
$ vertz add esbuild
Resolving dependencies...
Resolved 1 package
Downloading packages...
Downloaded 1 package
Linking packages...
Linked 1 package
Running scripts...
  esbuild: postinstall ✓ (1.2s)
+ esbuild@0.24.2
```

Output (failure):
```
Running scripts...
  esbuild: postinstall FAIL (exit code 1)
    Error: Could not determine platform-specific binary to download
  sharp: postinstall ✓ (3.4s)
```

Output (timeout):
```
Running scripts...
  prisma: postinstall FAIL (timed out after 60s)
```

Only `postinstall` scripts are supported (not `preinstall`, `prepare`, `prepublish`, etc.). Scripts run with a 60-second timeout.

**Hardlink vs. copy for script packages:** Packages that have `postinstall` scripts are **copied** from the global store instead of hardlinked. This prevents scripts from corrupting the global store when they write files to their own directory (e.g., esbuild downloading platform binaries). Non-script packages continue to use hardlinks.

**Security:** Postinstall scripts are the #1 vector for npm supply-chain attacks. We acknowledge this risk and match npm/yarn/pnpm behavior for now (no sandboxing). Future work may add:
- Script allowlist (only run scripts for explicitly trusted packages)
- First-install prompt ("Package X wants to run a postinstall script. Allow? [y/N]")
- `vertz config set trust-scripts @vertz/*` for org-level trust

For now, `--ignore-scripts` is the safety mechanism. The `--ignore-scripts` flag is intentionally not the default — too many packages (esbuild, prisma, sharp, sqlite3) require postinstall to function. If scripts are skipped and a package requires them, the package will appear installed but won't work at runtime. The error will come from the package itself (e.g., "esbuild binary not found"), not from Vertz.

**Platform:** Unix only (`sh -c`). Windows postinstall support is a non-goal for Phase 3 — the Vertz runtime targets macOS/Linux.

### Incremental Linking (Phase 3d)

No API change. `vertz install` becomes faster by only relinking changed packages instead of nuking `node_modules`.

```
$ vertz install
Resolving dependencies...
Resolved 142 packages (0 changed)
Linking packages...
Linked 0 packages (142 cached)
Done in 0.4s
```

The manifest at `node_modules/.vertz-manifest.json` tracks the installed state. Keys are `package@version@nest_path` (nest_path included to detect hoisting changes). A corrupted or missing manifest triggers a full relink (same behavior as `--force`).

**Postinstall-aware:** Packages with `postinstall` scripts are marked `"has_scripts": true` in the manifest. On incremental install, these packages always re-run their scripts (even if the version hasn't changed), since script output may depend on environment. If this becomes a performance issue, we can add script output hashing later.

Add `--force` flag to `InstallArgs` to skip incremental check and do full nuke+relink.

### Workspace Support (Phase 3e: Discovery + Linking, Phase 3f: `-w` Flag + Advanced)

**Phase 3e — Basic workspace install:**

```bash
# In a monorepo root with workspaces in package.json:
vertz install               # Install all deps + link workspace packages
```

`package.json` workspace field (npm-standard `workspaces` plural only):
```json
{
  "workspaces": ["packages/*"]
}
```

Workspace packages are symlinked into root `node_modules/` (not hardlinked from store). Cross-workspace dependencies resolve to the local source, not the registry.

**Lockfile strategy:** One lockfile at root (`vertz.lock`). Workspace package dependencies are listed in the lockfile with a `link:` protocol instead of a registry URL:

```
@myorg/shared@link:packages/shared:
  version "0.1.0"
  resolved "link:packages/shared"
```

External deps from all workspaces are merged and resolved together (single resolution pass), then hoisted to root `node_modules/`. Each workspace's `dependencies` and `devDependencies` are included in the resolution. If two workspaces require conflicting versions of the same external package, the hoisting algorithm handles it (majority version at root, minority nested).

**Cycle detection:** Only circular production `dependencies` are an error. Circular `devDependencies` are allowed (common pattern: A devDepends on B for testing, B devDepends on A).

Error message:
```
error: workspace dependency cycle detected
  @myorg/api → @myorg/shared → @myorg/api
  Remove the circular dependency from one of the packages' "dependencies" field.
  (Circular devDependencies are allowed.)
```

**`--frozen` with workspaces:** `vertz install --frozen` validates the root lockfile covers all workspace dependencies. If any workspace added a dependency not in the lockfile, `--frozen` fails.

**Phase 3f — Workspace `-w` flag and advanced features:**

```bash
vertz add zod -w @myorg/api       # Add to workspace by package name (preferred)
vertz add zod -w packages/api     # Add to workspace by directory path (also works)
vertz remove zod -w @myorg/api    # Remove from workspace
```

The `-w` flag accepts either the workspace package **name** (from its `package.json`) or the directory **path**. Package name is the documented/preferred form — it's what an LLM knows from reading `package.json`, and it doesn't break when directories are reorganized.

### Private Registry Support (Phase 3g)

```bash
# .npmrc at project root or ~/.npmrc
registry=https://npm.internal.company.com
//npm.internal.company.com/:_authToken=${NPM_TOKEN}
@myorg:registry=https://npm.internal.company.com
```

Scoped registry support: `@myorg` packages go to the configured registry, everything else to the default.

**`.npmrc` parsing:**
- INI-like format. Comments with `#` or `;` at line start.
- `${ENV_VAR}` interpolation — critical for CI/CD where auth tokens come from environment variables. Missing env vars produce a clear error: `error: .npmrc references undefined environment variable $NPM_TOKEN`.
- **Merge semantics:** Both project `.npmrc` and `~/.npmrc` are read. Project takes precedence **per-key** (not wholesale replacement). If `~/.npmrc` has `@myorg:registry=...` and project `.npmrc` has `registry=...`, both apply.
- Keys parsed: `registry`, `@scope:registry`, `//<host>/:_authToken`, `always-auth`. Everything else is ignored.

**`RegistryClient` changes:** The client needs per-request URL and auth resolution, not just a constructor change. Each `fetch_metadata()` call resolves the correct registry URL for the package (checking scoped config first, then default). Auth tokens are matched by registry URL prefix (not just hostname — some registries use paths like `//npm.pkg.github.com/`). ETag cache paths must incorporate the registry host to avoid cross-registry cache collisions.

**Testing strategy:** Unit tests verify `.npmrc` parsing and config resolution. Integration tests use a mock HTTP layer (reqwest's mock adapter or a local test server) to verify the `Authorization: Bearer` header is attached when a token is configured. No real private registry needed in CI.

---

## Manifesto Alignment

### Principle 2: One way to do things
`vertz update` is the single way to update. No `vertz upgrade` alias — that's two ways. `--latest` is the escape hatch for breaking range constraints.

### Principle 3: AI agents are first-class users
All new commands support `--json` for NDJSON output. `vertz update --json` emits one line per updated package. `vertz update --dry-run --json` gives machine-readable previews. Postinstall script output is captured and available in JSON mode. The `-w` flag accepts package names (not just paths) so LLMs can use workspace names from `package.json`.

### Principle 7: Performance is not optional
Incremental linking skips unchanged packages. Cache stores verified tarballs. Workspace linking uses symlinks (zero copy). Packages without scripts use hardlinks (zero copy).

### Principle 8: No ceilings
Own postinstall runner. Own workspace linker. Own registry authentication. Not constrained by npm's `node_modules/.package-lock.json` or pnpm's `node_modules/.pnpm`.

### Tradeoffs accepted

- **Only `postinstall` scripts, not the full lifecycle.** `preinstall`, `prepare`, `prepublish` are npm publishing concerns. `postinstall` covers 99% of real use cases (esbuild, prisma, sharp, etc.).
- **No lockfile-less mode.** `vertz install` always writes `vertz.lock`. This is intentional — lockfiles are non-negotiable for reproducibility.
- **Workspace symlinks, not hardlinks.** Workspace packages need to reflect source changes immediately. Symlinks achieve this; hardlinks would require re-linking on every change.
- **No postinstall sandboxing (yet).** Postinstall is the #1 npm supply-chain attack vector. We match npm/yarn/pnpm behavior for now. Script allowlisting is planned for a future phase. `--ignore-scripts` is the current safety mechanism.
- **Copy (not hardlink) for packages with scripts.** Postinstall scripts write to their package directory (e.g., esbuild downloads binaries). Using hardlinks would corrupt the global store. Copy is slower but safe. This only applies to packages that declare `postinstall` — the vast majority of packages still use hardlinks.
- **Unix-only postinstall.** `sh -c` only. Windows support for script execution is a non-goal for Phase 3.

### Tradeoffs rejected

- **Running `prepare` scripts.** These are for git-installed packages (build from source). Rare use case, high complexity, deferred indefinitely.
- **`pnpm`-style virtual store.** Content-addressable hardlinks from a flat store is simpler and achieves the same space savings without the symlink complexity.
- **`.yarnrc.yml` support.** Only `.npmrc` is supported. One config format. Principle 2.

---

## Non-Goals

1. **`vertz publish`** — Publishing to npm is a separate feature
2. **`vertz exec` / `vertz run`** — Script execution beyond postinstall
3. **Git-hosted dependencies** — `github:user/repo` specifiers
4. **`prepare` / `prepublish` lifecycle scripts** — Publishing concern
5. **npm audit / vulnerability scanning** — Separate security feature
6. **Overrides / resolutions** — Forced version pinning
7. **Patch dependencies** — `patch-package` style patching
8. **`vertz dev` auto-install** — Deferred to dev-server integration phase (requires Rust-side import analysis, different scope)
9. **Windows postinstall support** — `cmd /c` / PowerShell script execution
10. **Bun's `"workspace"` (singular) field** — Only npm-standard `"workspaces"` (plural) is supported

---

## Deferred Features (Future)

| Feature | Notes |
|---|---|
| `vertz dev` auto-install | Requires import analysis in the compiler/dev-server |
| Git-hosted dependencies | `github:user/repo` URL specifiers |
| `vertz audit` | Security vulnerability scanning |
| Overrides/resolutions | Force specific versions |
| Optional dependencies | Conditional install based on platform |
| Postinstall allowlist | Trust-based script execution (`vertz config set trust-scripts @vertz/*`) |

---

## Unknowns

### U1: Postinstall script timeout — Resolved

60-second default timeout. Some packages (prisma, sharp) download large binaries in postinstall. 60s is generous but bounded. If a script times out, it's killed and the error is reported with the timeout value: `error: postinstall script for "prisma" timed out after 60s`. No `--script-timeout` flag (YAGNI — can be added later if needed).

### U2: Workspace cycle detection — Resolved

Only circular production `dependencies` are errors. Circular `devDependencies` are allowed (common monorepo pattern). Error message lists the cycle path and suggests removing from `dependencies`.

### U3: `.npmrc` format complexity — Resolved

Parse only the keys we need: `registry`, `@scope:registry`, `//<host>/:_authToken`, `always-auth`. Support `${ENV_VAR}` interpolation (critical for CI). Ignore everything else. Merge project + home `.npmrc` per-key (project takes precedence).

### U4: `vertz update` vs `vertz install` semantics — Resolved

`vertz install` respects lockfile pins — if a version is in `vertz.lock`, it uses that version. `vertz update` removes lockfile entries for targeted packages (and their transitive deps), then re-resolves to pick the latest version matching the existing range. This is the key distinction. Without a lockfile, `vertz update` errors: `no lockfile found, run "vertz install" first`.

---

## POC Results

No POC needed. All features build incrementally on the existing Phase 2a/2b engine. The architecture (registry client → resolver → tarball → linker) extends naturally.

---

## Type Flow Map

All Rust, no TypeScript generics. New types are concrete structs:

```
vertz update:
  OutdatedEntry (existing) → remove lockfile entries → install() re-resolves → updated lockfile
  --latest: extract range operator prefix → rewrite range with new version + same prefix

vertz cache:
  cache_dir (PathBuf) → fs::remove_dir_all / recursive dir walk for size

Postinstall:
  VersionMetadata.scripts (new field) → ResolvedPackage.scripts (new field)
  → linker copies (not hardlinks) packages with scripts
  → Command::new("sh").arg("-c").arg(script) → timeout → output capture

Workspace:
  PackageJson.workspaces (new field) → glob expand → WorkspacePackage { name, path, pkg }
  → lockfile entries with "link:" protocol
  → symlink into node_modules
  → external deps merged from all workspaces → single resolution pass

Private registry:
  .npmrc parse → RegistryConfig { default_url, scoped: Map<scope, url>, tokens: Map<url_prefix, token> }
  → RegistryClient resolves per-request URL + auth header
  → ETag cache keyed by registry host + package name (avoid cross-registry collisions)

write_package_json:
  Extended to also write peerDependencies (same pattern as dependencies/devDependencies)
```

---

## E2E Acceptance Test

```typescript
describe('Feature: vertz update', () => {
  describe('Given a project with outdated dependencies', () => {
    describe('When running `vertz update`', () => {
      it('Then packages are updated to latest matching their ranges', () => {});
      it('Then vertz.lock is updated with new versions', () => {});
      it('Then package.json ranges are NOT changed', () => {});
    });
  });

  describe('Given a project with outdated dependencies', () => {
    describe('When running `vertz update --latest`', () => {
      it('Then packages are updated to absolute latest', () => {});
      it('Then package.json ranges ARE updated preserving range operator', () => {});
    });
  });

  describe('Given a project with ~3.24.0 range', () => {
    describe('When running `vertz update --latest`', () => {
      it('Then range becomes ~<latest> (tilde preserved, not ^)', () => {});
    });
  });

  describe('Given a project', () => {
    describe('When running `vertz update zod`', () => {
      it('Then only zod is updated', () => {});
      it('Then other packages remain at current versions', () => {});
    });
  });

  describe('Given a project', () => {
    describe('When running `vertz update --dry-run`', () => {
      it('Then shows what would change', () => {});
      it('Then no files are modified', () => {});
    });
  });

  describe('Given no lockfile', () => {
    describe('When running `vertz update`', () => {
      it('Then exits with error "no lockfile found"', () => {});
    });
  });

  describe('Given a project with outdated dependencies', () => {
    describe('When running `vertz update --json`', () => {
      it('Then emits NDJSON with event/name/from/to/range fields', () => {});
    });
  });
});

describe('Feature: peer dependencies', () => {
  describe('Given a project', () => {
    describe('When running `vertz add -P react`', () => {
      it('Then react is added to peerDependencies', () => {});
      it('Then react is NOT in dependencies or devDependencies', () => {});
      it('Then react is NOT installed in node_modules', () => {});
    });
  });

  describe('Given a project', () => {
    describe('When running `vertz add -P -D react`', () => {
      it('Then exits with error about conflicting flags', () => {});
    });
  });

  describe('Given a project with react in peerDependencies', () => {
    describe('When running `vertz remove react`', () => {
      it('Then react is removed from peerDependencies', () => {});
    });
  });
});

describe('Feature: cache management', () => {
  describe('Given cached packages', () => {
    describe('When running `vertz cache clean`', () => {
      it('Then cache directory is empty', () => {});
      it('Then subsequent install re-downloads', () => {});
    });
  });

  describe('When running `vertz cache list`', () => {
    it('Then shows cache location and size breakdown', () => {});
  });

  describe('When running `vertz cache list --json`', () => {
    it('Then emits JSON with location, metadata_bytes, store_bytes', () => {});
  });

  describe('When running `vertz cache path`', () => {
    it('Then prints only the cache directory path', () => {});
  });
});

describe('Feature: postinstall scripts', () => {
  describe('Given a package with a postinstall script', () => {
    describe('When running `vertz install`', () => {
      it('Then the postinstall script runs after linking', () => {});
      it('Then script output is captured', () => {});
      it('Then the package is copied (not hardlinked) from store', () => {});
    });
  });

  describe('Given a package with a postinstall script', () => {
    describe('When running `vertz install --ignore-scripts`', () => {
      it('Then the postinstall script does NOT run', () => {});
    });
  });

  describe('Given a postinstall script that times out', () => {
    describe('When running `vertz install`', () => {
      it('Then the script is killed and error reports timeout duration', () => {});
      it('Then other packages still install successfully', () => {});
    });
  });

  describe('Given a postinstall script that fails', () => {
    describe('When running `vertz install`', () => {
      it('Then error shows exit code and stderr output', () => {});
      it('Then other scripts still run', () => {});
    });
  });
});

describe('Feature: incremental linking', () => {
  describe('Given node_modules is already populated', () => {
    describe('When running `vertz install` with no changes', () => {
      it('Then no packages are re-linked', () => {});
      it('Then output shows "0 packages linked (N cached)"', () => {});
    });
  });

  describe('Given one package version changed', () => {
    describe('When running `vertz install`', () => {
      it('Then only the changed package is re-linked', () => {});
      it('Then unchanged packages remain untouched', () => {});
    });
  });

  describe('Given a corrupted or missing manifest', () => {
    describe('When running `vertz install`', () => {
      it('Then falls back to full relink (no error)', () => {});
    });
  });

  describe('Given --force flag', () => {
    describe('When running `vertz install --force`', () => {
      it('Then all packages are re-linked regardless of manifest', () => {});
    });
  });
});

describe('Feature: workspace support', () => {
  describe('Given a monorepo with workspaces field', () => {
    describe('When running `vertz install`', () => {
      it('Then workspace packages are symlinked into node_modules', () => {});
      it('Then external deps are installed normally', () => {});
      it('Then cross-workspace deps resolve to local source', () => {});
      it('Then root vertz.lock includes link: entries for workspaces', () => {});
    });
  });

  describe('Given a workspace cycle in dependencies (a → b → a)', () => {
    describe('When running `vertz install`', () => {
      it('Then exits with error listing the cycle', () => {});
    });
  });

  describe('Given a workspace cycle in devDependencies only', () => {
    describe('When running `vertz install`', () => {
      it('Then installs successfully (circular devDeps allowed)', () => {});
    });
  });

  describe('Given a monorepo with workspaces', () => {
    describe('When running `vertz add zod -w @myorg/api`', () => {
      it('Then packages/api/package.json has zod in dependencies', () => {});
      it('Then root package.json is unchanged', () => {});
    });
  });

  describe('Given a monorepo with workspaces', () => {
    describe('When running `vertz add zod -w packages/api`', () => {
      it('Then also works with directory path (not just name)', () => {});
    });
  });
});

describe('Feature: private registries', () => {
  describe('Given an .npmrc with a custom registry', () => {
    describe('When resolving config', () => {
      it('Then default registry URL is custom', () => {});
    });
  });

  describe('Given an .npmrc with scoped registry', () => {
    describe('When resolving registry for @myorg/pkg', () => {
      it('Then uses the scoped registry', () => {});
    });
    describe('When resolving registry for zod', () => {
      it('Then uses default registry (npmjs)', () => {});
    });
  });

  describe('Given an .npmrc with //host/:_authToken=${NPM_TOKEN}', () => {
    describe('When NPM_TOKEN is set in environment', () => {
      it('Then includes Authorization: Bearer <token> header', () => {});
    });
    describe('When NPM_TOKEN is NOT set in environment', () => {
      it('Then exits with error about missing env var', () => {});
    });
  });

  describe('Given both project .npmrc and ~/.npmrc', () => {
    describe('When loading config', () => {
      it('Then merges per-key with project taking precedence', () => {});
    });
  });
});
```

---

## Implementation Plan

### Phase 3a: `vertz update`

**Goal:** Add `vertz update` command leveraging existing `outdated()` infrastructure.

**Steps:**
1. Add `UpdateArgs` to cli.rs with `packages: Vec<String>`, `--latest`, `--dry-run`, `--json` flags
2. Add `Command::Update` to enum and wire in main.rs
3. Implement `pm::update()`:
   - Call `outdated()` to get current/wanted/latest for all packages
   - Filter to targeted packages (or all if none specified)
   - If `--dry-run`: print what would change, return
   - If `--latest`: extract range operator prefix from existing range, rewrite to `<prefix><latest>`, update `package.json`
   - Remove lockfile entries for targeted packages and their transitive deps
   - Call `install()` to re-resolve (picks latest matching range since lockfile entries are gone)
4. Without lockfile: error `no lockfile found, run "vertz install" first`
5. Add `PmOutput::package_updated(name, from, to, range)` event
6. Unit tests for update logic, range operator preservation, dry-run, no-lockfile error
7. JSON output: one NDJSON line per update event

**Acceptance criteria:**
```typescript
describe('Phase 3a: vertz update', () => {
  describe('Given CLI parsing', () => {
    describe('When parsing "vertz update"', () => {
      it('Then produces UpdateArgs with empty packages, latest=false, dry_run=false', () => {});
    });
    describe('When parsing "vertz update zod --latest --dry-run"', () => {
      it('Then produces UpdateArgs with packages=["zod"], latest=true, dry_run=true', () => {});
    });
    describe('When parsing "vertz update --json"', () => {
      it('Then produces UpdateArgs with json=true', () => {});
    });
  });

  describe('Given a project with zod@3.24.2 installed (range ^3.24.0, latest 3.24.4)', () => {
    describe('When calling update()', () => {
      it('Then resolves to 3.24.4 without changing package.json range', () => {});
      it('Then lockfile is updated with 3.24.4', () => {});
    });
  });

  describe('Given a project with zod@3.24.2 installed (range ~3.24.0, latest 4.0.1)', () => {
    describe('When calling update() with latest=true', () => {
      it('Then package.json range is updated to ~4.0.1 (tilde preserved)', () => {});
    });
  });

  describe('Given a project with outdated deps', () => {
    describe('When calling update() with dry_run=true', () => {
      it('Then no files are modified', () => {});
      it('Then returns list of what would change', () => {});
    });
  });

  describe('Given no lockfile', () => {
    describe('When calling update()', () => {
      it('Then returns error "no lockfile found"', () => {});
    });
  });
});
```

### Phase 3a-peer: `--peer` flag for `vertz add`

**Goal:** Add `--peer`/`-P` flag to `vertz add` to write to `peerDependencies`.

**Steps:**
1. Add `--peer`/`-P` flag to `AddArgs` in cli.rs
2. Validate: `--peer` + `--dev` → error
3. Extend `pm::add()` to accept `peer: bool` — writes to `peerDependencies` field
4. Update `write_package_json()` in types.rs to also persist `peerDependencies` (same read-modify-write pattern as `dependencies`/`devDependencies`)
5. Update `pm::remove()` to also check `peer_dependencies` field
6. Peer deps are NOT installed into node_modules (just recorded in package.json)
7. Unit tests for peer flag parsing, peer+dev conflict, write/remove from peerDependencies

**Acceptance criteria:**
```typescript
describe('Phase 3a-peer: --peer flag', () => {
  describe('Given CLI parsing', () => {
    describe('When parsing "vertz add -P react"', () => {
      it('Then produces AddArgs with peer=true', () => {});
    });
    describe('When parsing "vertz add -P -D react"', () => {
      it('Then exits with error about conflicting flags', () => {});
    });
  });

  describe('Given a project', () => {
    describe('When calling add() with peer=true for react', () => {
      it('Then react is in peerDependencies in package.json', () => {});
      it('Then react is NOT in dependencies', () => {});
    });
  });

  describe('Given a project with react in peerDependencies', () => {
    describe('When calling remove() for react', () => {
      it('Then react is removed from peerDependencies', () => {});
    });
  });

  describe('Given a package.json with existing peerDependencies', () => {
    describe('When write_package_json is called', () => {
      it('Then peerDependencies field is persisted', () => {});
      it('Then other fields are preserved', () => {});
    });
  });
});
```

### Phase 3b: `vertz cache` subcommands

**Goal:** Add `vertz cache clean`, `vertz cache list`, and `vertz cache path` for cache management.

**Steps:**
1. Add `CacheCommand` enum with `Clean`, `List`, `Path` subcommands to cli.rs
2. `cache clean` — remove `~/.vertz/cache/npm/` (or just `registry-metadata/` with `--metadata`)
3. `cache list` — recursive dir walk, count entries and total size
4. `cache path` — print cache directory path (single line, no decoration)
5. Add `--json` flag to `clean` and `list`
6. Wire in main.rs

**Acceptance criteria:**
```typescript
describe('Phase 3b: cache management', () => {
  describe('Given cached data exists', () => {
    describe('When running cache clean', () => {
      it('Then the cache directory is removed', () => {});
      it('Then reports bytes removed', () => {});
    });
  });

  describe('Given cached data exists', () => {
    describe('When running cache clean --metadata', () => {
      it('Then only registry-metadata/ is removed', () => {});
      it('Then store/ is preserved', () => {});
    });
  });

  describe('Given cached data exists', () => {
    describe('When running cache list', () => {
      it('Then shows cache location', () => {});
      it('Then shows metadata count and size', () => {});
      it('Then shows store count and size', () => {});
    });
  });

  describe('Given cached data exists', () => {
    describe('When running cache list --json', () => {
      it('Then emits JSON with location, metadata_bytes, store_bytes fields', () => {});
    });
  });

  describe('When running cache path', () => {
    it('Then prints only the directory path', () => {});
  });
});
```

### Phase 3c: Postinstall Script Execution

**Goal:** Run `postinstall` scripts after linking, with timeout and output capture.

**Steps:**
1. Add `scripts` field to `VersionMetadata` in types.rs: `pub scripts: Option<BTreeMap<String, String>>`
2. Add `scripts` field to `ResolvedPackage` — populated during resolution from `VersionMetadata`
3. In linker: detect packages with `postinstall` in scripts → **copy** instead of hardlink
4. Create `scripts.rs` module with `run_postinstall_scripts()`:
   - Iterate resolved packages with `postinstall` script
   - Execute via `tokio::process::Command::new("sh").arg("-c").arg(script)`
   - Working directory: `node_modules/<package>` (the copy, not the store)
   - 60-second timeout via `tokio::time::timeout`
   - Capture stdout/stderr
   - On timeout: kill process, report error with duration
   - On failure: report exit code + stderr, continue to next script
5. Add `--ignore-scripts` flag to `InstallArgs` and `AddArgs`
6. Extend `PmOutput` with `script_started(name, script)`, `script_complete(name, duration_ms)`, `script_error(name, error)`
7. Run scripts sequentially (not parallel — scripts may have ordering expectations)
8. Unit tests with mock scripts (echo, exit 1, sleep)

**Acceptance criteria:**
```typescript
describe('Phase 3c: postinstall scripts', () => {
  describe('Given a resolved package with postinstall script "echo hello"', () => {
    describe('When running scripts after linking', () => {
      it('Then the script executes and output is captured', () => {});
      it('Then script_complete event fires with duration', () => {});
    });
  });

  describe('Given a postinstall script that exits with code 1', () => {
    describe('When running scripts', () => {
      it('Then script_error fires with exit code and stderr', () => {});
      it('Then other scripts still run', () => {});
    });
  });

  describe('Given a postinstall script that exceeds timeout', () => {
    describe('When running scripts', () => {
      it('Then the script is killed', () => {});
      it('Then error message includes "timed out after 60s"', () => {});
    });
  });

  describe('Given --ignore-scripts flag', () => {
    describe('When installing', () => {
      it('Then no postinstall scripts run', () => {});
    });
  });

  describe('Given a package with postinstall script', () => {
    describe('When linking', () => {
      it('Then package is copied (not hardlinked) from store', () => {});
      it('Then global store is not modified by script execution', () => {});
    });
  });
});
```

### Phase 3d: Incremental Linking

**Goal:** Skip re-linking unchanged packages to make `vertz install` fast for no-change cases.

**Steps:**
1. After resolution, compute manifest: `package@version@nest_path` → `{ version, nest_path, has_scripts }`
2. Before linking, read existing `node_modules/.vertz-manifest.json` (missing or corrupt → full relink)
3. Compare old vs new manifest:
   - Same key with same version → skip (unless `has_scripts`, which always re-runs)
   - New key → link
   - Removed key → delete from node_modules
   - Changed version → relink
4. Write updated manifest after linking
5. Add `--force` flag to `InstallArgs` to skip incremental check
6. Output: "Linked N packages (M cached)"

**Acceptance criteria:**
```typescript
describe('Phase 3d: incremental linking', () => {
  describe('Given node_modules populated from previous install', () => {
    describe('When running install with identical lockfile', () => {
      it('Then no packages are re-linked', () => {});
      it('Then manifest is unchanged', () => {});
      it('Then output shows "0 packages linked (N cached)"', () => {});
    });
  });

  describe('Given one package version changed', () => {
    describe('When running install', () => {
      it('Then only the changed package is re-linked', () => {});
      it('Then unchanged packages keep their files', () => {});
    });
  });

  describe('Given hoisting changed (same version, different nest_path)', () => {
    describe('When running install', () => {
      it('Then the package is re-linked at new location', () => {});
    });
  });

  describe('Given a corrupted manifest', () => {
    describe('When running install', () => {
      it('Then falls back to full relink without error', () => {});
    });
  });

  describe('Given --force flag', () => {
    describe('When running install', () => {
      it('Then all packages are re-linked regardless of manifest', () => {});
    });
  });
});
```

### Phase 3e: Workspace Support — Discovery + Linking

**Goal:** Basic monorepo workspace support — discover workspaces, symlink into node_modules, merge deps.

**Steps:**
1. Add `workspaces` field to `PackageJson` in types.rs: `pub workspaces: Option<Vec<String>>`
2. Create `workspace.rs` module:
   - `discover_workspaces(root_dir)` — expand glob patterns, read each workspace's `package.json`
   - `WorkspacePackage { name, path, pkg }` struct
   - `validate_workspace_graph()` — detect cycles in production deps (allow devDep cycles)
3. Modify `install()`:
   - If `workspaces` field exists in root package.json, enter workspace mode
   - Merge all workspace external deps + root deps into single resolution pass
   - Link external deps to root `node_modules/` (existing linker)
   - Symlink workspace packages: `node_modules/<ws-name>` → `<ws-dir>`
4. Lockfile: workspace deps use `link:` protocol (`resolved "link:packages/shared"`)
5. `--frozen` validates lockfile covers all workspace deps

**Acceptance criteria:**
```typescript
describe('Phase 3e: workspace discovery + linking', () => {
  describe('Given a monorepo with packages/a and packages/b', () => {
    describe('When packages/a depends on packages/b', () => {
      describe('When running install', () => {
        it('Then node_modules/b is a symlink to packages/b', () => {});
        it('Then external deps are in root node_modules', () => {});
        it('Then vertz.lock has link: entries for workspaces', () => {});
      });
    });
  });

  describe('Given a workspace cycle in dependencies', () => {
    describe('When running install', () => {
      it('Then exits with error listing the cycle', () => {});
    });
  });

  describe('Given a workspace cycle in devDependencies only', () => {
    describe('When running install', () => {
      it('Then installs successfully', () => {});
    });
  });

  describe('Given workspace globs like "packages/*"', () => {
    describe('When discovering workspaces', () => {
      it('Then expands glob and finds all matching dirs with package.json', () => {});
    });
  });
});
```

### Phase 3f: Workspace `-w` Flag + Advanced

**Goal:** Add `-w` flag to `add`/`remove` for workspace-specific operations.

**Steps:**
1. Add `--workspace`/`-w` flag to `AddArgs` and `RemoveArgs` in cli.rs
2. `-w` accepts package name (e.g., `@myorg/api`) or directory path (e.g., `packages/api`)
3. Resolve package name → directory by scanning discovered workspaces
4. `vertz add zod -w @myorg/api` modifies `packages/api/package.json`, then runs workspace install
5. `vertz remove zod -w @myorg/api` removes from workspace package.json

**Acceptance criteria:**
```typescript
describe('Phase 3f: workspace -w flag', () => {
  describe('Given a monorepo', () => {
    describe('When running add zod -w @myorg/api (by name)', () => {
      it('Then packages/api/package.json has zod', () => {});
      it('Then root package.json is unchanged', () => {});
    });
  });

  describe('Given a monorepo', () => {
    describe('When running add zod -w packages/api (by path)', () => {
      it('Then packages/api/package.json has zod', () => {});
    });
  });

  describe('Given -w with unknown workspace name', () => {
    describe('When running add', () => {
      it('Then exits with error "workspace not found"', () => {});
    });
  });
});
```

### Phase 3g: Private Registry Support

**Goal:** Read `.npmrc` for custom registries and auth tokens.

**Steps:**
1. Create `config.rs` module — parse `.npmrc` files
2. `parse_npmrc(content)` — INI-like parser with:
   - Comment handling (`#`, `;`)
   - `${ENV_VAR}` interpolation (error on undefined vars)
   - Key extraction: `registry`, `@scope:registry`, `//<url>/:_authToken`, `always-auth`
3. `load_registry_config(root_dir)` — read project `.npmrc` then `~/.npmrc`, merge per-key
4. `RegistryConfig` struct: `default_url`, `scoped: BTreeMap<String, String>`, `tokens: BTreeMap<String, String>`
5. Modify `RegistryClient::new()` to accept `RegistryConfig`
6. `registry_url_for_package(name)` — check scoped config, fall back to default
7. `auth_header_for_url(url)` — match token by URL prefix
8. Update ETag cache paths to include registry host (avoid cross-registry collisions)
9. Unit tests: `.npmrc` parsing, env var interpolation, scoped resolution, auth matching, config merge
10. Integration test: mock HTTP server verifying `Authorization` header

**Acceptance criteria:**
```typescript
describe('Phase 3g: private registries', () => {
  describe('Given .npmrc with registry=https://custom.registry.com', () => {
    describe('When resolving config', () => {
      it('Then default registry URL is custom', () => {});
    });
  });

  describe('Given .npmrc with @myorg:registry=https://private.registry.com', () => {
    describe('When resolving registry for @myorg/pkg', () => {
      it('Then uses private.registry.com', () => {});
    });
    describe('When resolving registry for zod', () => {
      it('Then uses default registry (npmjs)', () => {});
    });
  });

  describe('Given .npmrc with //host/:_authToken=${NPM_TOKEN}', () => {
    describe('When NPM_TOKEN is set', () => {
      it('Then Authorization: Bearer <token> header is included', () => {});
    });
    describe('When NPM_TOKEN is NOT set', () => {
      it('Then returns error about undefined env var', () => {});
    });
  });

  describe('Given both project .npmrc and ~/.npmrc', () => {
    describe('When loading config', () => {
      it('Then merges per-key with project taking precedence', () => {});
    });
  });

  describe('Given .npmrc with comments and empty lines', () => {
    describe('When parsing', () => {
      it('Then comments and empty lines are ignored', () => {});
    });
  });

  describe('Given a registry with a path (//npm.pkg.github.com/)', () => {
    describe('When matching auth tokens', () => {
      it('Then matches by URL prefix (not just hostname)', () => {});
    });
  });
});
```

---

## Dependencies Between Phases

```
Phase 3a (update)            ─┐
Phase 3a-peer (peer flag)     │
Phase 3b (cache)              ├─ Independent, any order
Phase 3g (private registries) ─┘

Phase 3c (postinstall) ← can run anytime after 3a-peer (needs write_package_json peerDeps fix)

Phase 3d (incremental linking) ← after 3c (manifest must account for script packages)

Phase 3e (workspace discovery) ← after 3d (incremental should be stable before workspace changes install flow)

Phase 3f (workspace -w flag) ← after 3e (needs workspace discovery)
```

Recommended order: 3a → 3a-peer → 3b → 3g → 3c → 3d → 3e → 3f

---

## Key Files

| Component | Path |
|---|---|
| CLI args | `native/vertz-runtime/src/cli.rs` |
| CLI main | `native/vertz-runtime/src/main.rs` |
| PM orchestration | `native/vertz-runtime/src/pm/mod.rs` |
| Types | `native/vertz-runtime/src/pm/types.rs` |
| Registry client | `native/vertz-runtime/src/pm/registry.rs` |
| Registry config (new) | `native/vertz-runtime/src/pm/config.rs` |
| Resolver | `native/vertz-runtime/src/pm/resolver.rs` |
| Tarball manager | `native/vertz-runtime/src/pm/tarball.rs` |
| Linker | `native/vertz-runtime/src/pm/linker.rs` |
| Bin stubs | `native/vertz-runtime/src/pm/bin.rs` |
| Lockfile | `native/vertz-runtime/src/pm/lockfile.rs` |
| Output | `native/vertz-runtime/src/pm/output.rs` |
| Scripts (new) | `native/vertz-runtime/src/pm/scripts.rs` |
| Workspace (new) | `native/vertz-runtime/src/pm/workspace.rs` |
