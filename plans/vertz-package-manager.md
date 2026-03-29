# Vertz Package Manager — Design Document

> "If a dependency limits us, we replace it." — Vertz Vision, Principle 8

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-03-28 | Initial draft — Phase 2a: CLI commands, review fixes |
| 2 | 2026-03-28 | Address 5 blockers + 18 should-fix items from DX, Product, and Technical reviews. Reframe scope as Phase 2a, fix cherry-pick strategy, add `write_package_json` Value-based approach, parallelize downloads, add aliases, error output, behavioral acceptance criteria, deferred features section |

**Prior art:** Phase 1 engine code (commit `9a4609be4` on branch `feat/runtime-test-runner-pkg-manager`) was implemented and reviewed separately. This document covers **Phase 2a: CLI command wiring** — bringing the engine code onto the working branch, fixing review findings, adding CLI commands, and delivering a usable `vertz install`/`add`/`remove` experience.

---

## Executive Summary

Wire `vertz install`, `vertz add`, and `vertz remove` CLI commands into the Vertz native runtime, building on the Phase 1 engine (npm registry client, semver resolver, tarball fetcher, hardlink linker, lockfile, bin stubs). Fix critical Phase 1 bugs (`write_package_json` data loss, serial downloads), add multi-package support, and deliver progress output.

This is **Phase 2a** of the package manager — the minimum CLI surface for single-project use. Workspace support, postinstall scripts, `vertz why`/`vertz list`, `--json` output, and private registries are deferred to Phase 2b/3.

---

## Preconditions

1. **Phase 1 engine code.** Exists on branch `feat/runtime-test-runner-pkg-manager` (commit `9a4609be4`). Must be extracted (not cherry-picked — see Phase 1 strategy below).

2. **Phase 1 review findings.** Three should-fix items (F1, F3, F4) from the Phase 1 adversarial review, plus two critical bugs discovered during design review:
   - **F1/F5:** `write_package_json` drops all unmodeled fields (`type`, `main`, `exports`, `engines`, etc.) — **data loss** (Issue #2005)
   - **F3:** Lockfile parser fragile to values containing `: `
   - **F4:** `graph_to_lockfile` transitive matching is name-only (picks wrong version)
   - **F14:** Downloads are serialized despite semaphore — 10x slower than intended
   - **F17:** `verify_integrity` silently skips non-sha512 algorithms

3. **New Cargo dependencies.** `async-recursion`, `flate2`, `node-semver`, `sha2`, `tar`, `indicatif`.

---

## The Problem

The Vertz runtime can compile, serve, and test TypeScript — but installing dependencies still requires an external tool (Bun, npm, yarn, pnpm). This means:

1. **Two tools instead of one.** Developers need both `vertz` and a package manager.
2. **LLM confusion.** An LLM must guess which package manager to use. `vertz add zod` is unambiguous.
3. **CI complexity.** CI pipelines need to install both the Vertz runtime and a separate package manager.

### After Phase 2a

```
vertz install              # Install all deps from package.json + vertz.lock
vertz add zod              # Add zod to dependencies, install, update lockfile
vertz add -D typescript    # Add to devDependencies
vertz remove zod           # Remove from deps, reinstall, update lockfile
```

One command. One lockfile (`vertz.lock`). No external tools for dependency management in single-project use.

---

## API Surface

### CLI Commands

```bash
# Install all dependencies
vertz install                     # From package.json + vertz.lock
vertz i                           # Alias for install
vertz install --frozen            # CI mode: fail if lockfile out of date
vertz install --frozen-lockfile   # Alias for --frozen (migration convenience)

# Add packages
vertz add zod                     # Add to dependencies (latest, ^ prefix)
vertz add zod@^3.24.0            # Add with explicit range (preserved as-is)
vertz add zod@3.24.4             # Add specific version (^ prefix added → "^3.24.4")
vertz add -D typescript           # Add to devDependencies
vertz add --dev typescript        # Same as -D
vertz add --exact zod             # Pin exact version (no ^ prefix → "3.24.4")
vertz add -E zod                  # Same as --exact
vertz add zod react               # Add multiple packages in one pass

# Remove packages
vertz remove zod                  # Remove from dependencies or devDependencies
vertz remove zod react            # Remove multiple packages
```

### CLI Aliases

| Command | Alias | Rationale |
|---|---|---|
| `vertz install` | `vertz i` | Universal muscle memory from npm/yarn/pnpm. Zero ambiguity. |
| `--frozen` | `--frozen-lockfile` | Migration convenience from npm ci / yarn --frozen-lockfile. |

No other aliases. `vertz add` is `vertz add`, not `vertz a`. `vertz remove` is `vertz remove`, not `vertz rm`. One obvious alias per command maximum — Principle 2.

### Version Specifier Behavior

| Input | Written to `package.json` | Notes |
|---|---|---|
| `vertz add zod` | `"zod": "^3.24.4"` | Latest version, caret prefix added |
| `vertz add zod@^3.24.0` | `"zod": "^3.24.0"` | Explicit range preserved as-is |
| `vertz add zod@~3.24.0` | `"zod": "~3.24.0"` | Explicit range preserved as-is |
| `vertz add zod@3.24.4` | `"zod": "^3.24.4"` | Bare version gets caret prefix |
| `vertz add --exact zod` | `"zod": "3.24.4"` | No prefix |
| `vertz add --exact zod@3.24.4` | `"zod": "3.24.4"` | Explicit + exact = exact |

Rule: if the specifier already contains `^`, `~`, `>=`, `||`, or similar range operators, preserve it as-is. Otherwise, add `^` prefix unless `--exact` is set.

### CLI Output

Progress output uses `indicatif` for spinner + progress bars. Non-TTY environments (CI) use plain `eprintln!` — detected via `std::io::IsTerminal` (stable since Rust 1.70, no external crate needed).

```
$ vertz add zod
Resolving dependencies...
Resolved 1 package
Downloading packages...
Downloaded 1 package
Linking packages...
Linked 1 package
+ zod@^3.24.4

$ vertz install
Resolving dependencies...
Resolved 142 packages
Downloading packages ████████████████████████ 142/142
Linking packages...
Linked 142 packages
Created 8 bin stubs
Done in 3.2s
```

### Error Output

Errors use a consistent format: `error: <message>` on stderr, with actionable context.

```
$ vertz add nonexistent-pkg
error: package "nonexistent-pkg" not found in npm registry

$ vertz add zod@99.0.0
error: no version of "zod" matches "99.0.0" (latest: 3.24.4)

$ vertz add zod@lol
error: invalid version specifier "lol" for package "zod"

$ vertz install --frozen
error: lockfile is out of date
  zod "^4.0.0" not found in vertz.lock
  Run `vertz install` to update

$ vertz remove loose-envify
error: package "loose-envify" is not a direct dependency
  It is installed as a dependency of "react"

$ vertz install  (network failure)
error: could not connect to registry.npmjs.org — check your network connection
```

### Lockfile Format (`vertz.lock`)

```
# vertz.lock v1 (custom format) — DO NOT EDIT
# Run "vertz install" to regenerate

react@^18.3.0:
  version "18.3.1"
  resolved "https://registry.npmjs.org/react/-/react-18.3.1.tgz"
  integrity "sha512-abc123"
  dependencies:
    "loose-envify" "^1.1.0"

zod@^3.24.0:
  version "3.24.4"
  resolved "https://registry.npmjs.org/zod/-/zod-3.24.4.tgz"
  integrity "sha512-def456"
```

Values are quoted to avoid parsing ambiguity with `: ` in values.

---

## Manifesto Alignment

### Principle 2: One way to do things
One package manager. `vertz add`, not "pick from npm/yarn/pnpm/bun". LLMs don't need to guess. One alias (`i` for install) is a convention accommodation, not a second path.

### Principle 3: AI agents are first-class users
`vertz add zod` — an LLM can use this correctly on the first prompt. Error output is structured and actionable — an LLM can parse "not found in npm registry" and suggest alternatives.

### Principle 7: Performance is not optional
Content-addressable store with hardlinks. Parallel downloads via `stream::buffer_unordered(16)`. Packages downloaded once, linked to every project. ETag caching for registry metadata.

### Principle 8: No ceilings
Own lockfile format (`vertz.lock`), own resolution algorithm. Not constrained by npm/yarn/pnpm design decisions.

### Tradeoffs accepted

- **No compatibility with existing lockfiles.** `vertz.lock` is a new format. Migrating from npm/yarn/pnpm requires `vertz install` to resolve fresh. Acceptable pre-v1.
- **npm registry only.** No GitHub Packages, no private registries (yet). Deferred to Phase 3.
- **No postinstall scripts.** Packages like `esbuild` and `prisma` that rely on postinstall scripts will not fully work. This is a known limitation documented in error output.

### Tradeoffs rejected

- **Separate lockfile per package manager.** We could have supported `bun.lock` or `package-lock.json` directly. Rejected because it couples us to someone else's format and limits future optimizations.
- **Global install (`-g` flag).** Rejected — `vertz` is a project tool, not a system tool. If requested, return clear error: "global installs are not supported."

---

## Non-Goals

1. **Private registry support** — npm registry only for now
2. **`peerDependencies` auto-install** — peers are tracked but not auto-resolved. `--peer`/`-P` flag is deferred to Phase 2b.
3. **`npm run` / scripts execution** — use `vertz` commands directly
4. **Publish to npm** — `vertz publish` is a separate feature
5. **Lockfile migration from other tools** — developers run `vertz install` fresh
6. **Optional dependencies** — tracked in types but not resolved
7. **Global install (`-g`)** — `vertz` is a project tool. Error message if attempted.

---

## Deferred Features (Phase 2b / Phase 3)

These features were part of the original package manager design scope and are planned but not included in Phase 2a:

| Feature | Target Phase | Notes |
|---|---|---|
| Monorepo workspace linking | Phase 2b | Currently handled by Bun workspaces |
| Postinstall scripts | Phase 2b | Required for esbuild, prisma, sharp |
| `vertz why <package>` | Phase 2b | Dependency tree inspection |
| `vertz list` | Phase 2b | Installed packages listing |
| `--json` NDJSON output | Phase 2b | Structured output for CI/LLM agents |
| `--peer`/`-P` flag | Phase 2b | Add to peerDependencies |
| `vertz update` | Phase 3 | Update packages to latest matching range |
| Private registries | Phase 3 | GitHub Packages, Artifactory, etc. |
| `vertz cache clean` | Phase 3 | Store management |
| `vertz dev` auto-install | Phase 3 | Auto-install on missing imports |
| Incremental linking | Phase 3 | Don't nuke node_modules on every install |

---

## Unknowns

### U1: Progress bar rendering in CI environments — Resolved

Detect TTY via `std::io::IsTerminal` (stable since Rust 1.70). Non-TTY falls back to plain `eprintln!`. No external crate needed.

### U2: Hardlink behavior across filesystems — Resolved

Copy fallback already exists in Phase 1. Cross-filesystem installs are rare. No change needed.

---

## POC Results

Phase 1 engine code (commit `9a4609be4`) serves as the POC. All core algorithms are implemented and tested:
- Registry client with ETag caching: 5 tests
- Semver resolver with range/tag/exact support: 7 tests
- Tarball extraction with security mitigations (path traversal, absolute paths, symlinks): 8 tests
- Hardlink linker with nested package support: 6 tests
- Bin stub generation: 5 tests
- Lockfile read/write with round-trip: 10 tests
- `PackageJson` parsing with bin field variants: 20 tests

---

## Type Flow Map

Implemented entirely in Rust. No TypeScript generics. The data flow is:

```
CLI args (clap)
  → PackageJson (serde)
    → RegistryClient.fetch_metadata() → PackageMetadata
      → resolve_all() → ResolvedGraph
        → TarballManager.fetch_and_extract() [parallel via buffer_unordered(16)]
          → linker::link_packages()
            → lockfile::write_lockfile()
```

All types are concrete structs — no generics that need type flow verification.

---

## E2E Acceptance Test

```typescript
describe('Feature: vertz add command', () => {
  describe('Given a project with an empty package.json', () => {
    describe('When running `vertz add zod`', () => {
      it('Then package.json has zod in dependencies with ^ prefix', () => {});
      it('Then all other package.json fields are preserved', () => {});
      it('Then vertz.lock is created with resolved version', () => {});
      it('Then node_modules/zod/package.json exists', () => {});
    });
  });

  describe('Given a project with existing dependencies', () => {
    describe('When running `vertz add -D typescript`', () => {
      it('Then typescript is added to devDependencies', () => {});
      it('Then existing dependencies are preserved', () => {});
      it('Then vertz.lock is updated with new entry', () => {});
    });
  });

  describe('Given a project with existing dependencies', () => {
    describe('When running `vertz add --exact zod`', () => {
      it('Then package.json has zod with exact version (no ^)', () => {});
    });
  });

  describe('Given a project', () => {
    describe('When running `vertz add zod@^3.24.0`', () => {
      it('Then package.json has "zod": "^3.24.0" (range preserved)', () => {});
    });
  });

  describe('Given a project', () => {
    describe('When running `vertz add @vertz/schema`', () => {
      it('Then package.json has scoped package in dependencies', () => {});
    });
  });

  describe('Given a project', () => {
    describe('When running `vertz add @vertz/schema@^0.1.0`', () => {
      it('Then package.json has scoped package with version range', () => {});
    });
  });

  describe('Given a project with zod in dependencies', () => {
    describe('When running `vertz remove zod`', () => {
      it('Then package.json no longer has zod', () => {});
      it('Then vertz.lock no longer has zod entry', () => {});
      it('Then node_modules/zod/ no longer exists', () => {});
    });
  });

  describe('Given a project with a valid vertz.lock', () => {
    describe('When running `vertz install --frozen`', () => {
      it('Then all packages are installed from lockfile', () => {});
      it('Then vertz.lock is not modified', () => {});
    });
  });

  describe('Given a project with an outdated vertz.lock', () => {
    describe('When running `vertz install --frozen`', () => {
      it('Then exits with error "lockfile is out of date"', () => {});
      it('Then no packages are installed', () => {});
    });
  });

  describe('Given a project with zod already in dependencies', () => {
    describe('When running `vertz add zod`', () => {
      it('Then updates zod to latest version', () => {});
    });
  });
});

describe('Feature: vertz remove error cases', () => {
  describe('Given a project without zod in any dependency field', () => {
    describe('When running `vertz remove zod`', () => {
      it('Then exits with error "package zod is not a direct dependency"', () => {});
    });
  });
});

describe('Feature: vertz add multiple packages', () => {
  describe('Given a project with an empty package.json', () => {
    describe('When running `vertz add zod react`', () => {
      it('Then both zod and react are in dependencies', () => {});
      it('Then vertz.lock has entries for both and their transitive deps', () => {});
      it('Then only one resolve/download/link pass is performed', () => {});
    });
  });
});

describe('Feature: package.json field preservation', () => {
  describe('Given a package.json with type, main, exports, engines, repository', () => {
    describe('When running `vertz add zod`', () => {
      it('Then all unmodeled fields are preserved in the output', () => {});
      it('Then field order is preserved from the original file', () => {});
    });
  });
});
```

---

## Implementation Plan

### Phase 1: Integrate engine code + fix critical bugs

**Goal:** Get Phase 1 engine code onto this branch and fix the two critical bugs (data loss, serial downloads) plus the three review findings.

**File extraction strategy** (not cherry-pick — avoids test runner conflicts):
```bash
# Extract only PM source files from the feature branch
git show feat/runtime-test-runner-pkg-manager:native/vertz-runtime/src/pm/mod.rs > native/vertz-runtime/src/pm/mod.rs
git show feat/runtime-test-runner-pkg-manager:native/vertz-runtime/src/pm/types.rs > native/vertz-runtime/src/pm/types.rs
git show feat/runtime-test-runner-pkg-manager:native/vertz-runtime/src/pm/registry.rs > native/vertz-runtime/src/pm/registry.rs
git show feat/runtime-test-runner-pkg-manager:native/vertz-runtime/src/pm/resolver.rs > native/vertz-runtime/src/pm/resolver.rs
git show feat/runtime-test-runner-pkg-manager:native/vertz-runtime/src/pm/tarball.rs > native/vertz-runtime/src/pm/tarball.rs
git show feat/runtime-test-runner-pkg-manager:native/vertz-runtime/src/pm/linker.rs > native/vertz-runtime/src/pm/linker.rs
git show feat/runtime-test-runner-pkg-manager:native/vertz-runtime/src/pm/bin.rs > native/vertz-runtime/src/pm/bin.rs
git show feat/runtime-test-runner-pkg-manager:native/vertz-runtime/src/pm/lockfile.rs > native/vertz-runtime/src/pm/lockfile.rs
```

Then manually: add `pub mod pm;` to `lib.rs`, add 6 Cargo dependencies.

**Critical bug fixes:**

1. **`write_package_json` data loss (F5/F20):** Rewrite to use `serde_json::Value` read-modify-write. Only update `dependencies` and `devDependencies` in the JSON value object — preserve all other fields and field order.

```rust
pub fn write_package_json(root_dir: &Path, pkg: &PackageJson) -> Result<...> {
    let path = root_dir.join("package.json");
    let existing = std::fs::read_to_string(&path)?;
    let mut value: serde_json::Value = serde_json::from_str(&existing)?;
    let obj = value.as_object_mut().ok_or("package.json is not an object")?;
    obj.insert("dependencies".into(), serde_json::to_value(&pkg.dependencies)?);
    obj.insert("devDependencies".into(), serde_json::to_value(&pkg.dev_dependencies)?);
    std::fs::write(&path, serde_json::to_string_pretty(&value)? + "\n")?;
    Ok(())
}
```

2. **Serial downloads (F14):** Replace sequential loop with parallel stream:

```rust
use futures_util::stream::{self, StreamExt};
let results: Vec<Result<_, _>> = stream::iter(packages_to_download)
    .map(|pkg| {
        let mgr = &tarball_mgr;
        async move { mgr.fetch_and_extract(&pkg.name, &pkg.version, &pkg.tarball_url, &pkg.integrity).await }
    })
    .buffer_unordered(16)
    .collect()
    .await;
```

3. **Lockfile quoting (F3):** Use quoted values in lockfile format to prevent `: ` ambiguity.

4. **Transitive lockfile matching (F4/F7):** Add semver range matching with fail-closed semantics — `Range::parse` + `satisfies()`, no name-only fallback.

5. **Integrity verification (F17):** Add `sha256` support via `sha2::Sha256`. Error on unknown algorithms instead of silently skipping.

**Acceptance criteria:**
```typescript
describe('Phase 1: Engine integration + critical fixes', () => {
  describe('Given the pm module is wired into lib.rs', () => {
    describe('When running cargo test', () => {
      it('Then all Phase 1 tests pass', () => {});
    });
  });

  describe('Given a package.json with type, exports, engines, repository', () => {
    describe('When calling write_package_json after adding a dependency', () => {
      it('Then all unmodeled fields are preserved', () => {});
      it('Then dependencies field is updated', () => {});
    });
  });

  describe('Given a lockfile value containing ": " characters', () => {
    describe('When writing and re-reading the lockfile', () => {
      it('Then the value round-trips correctly', () => {});
    });
  });

  describe('Given a graph with two versions of the same package', () => {
    describe('When generating lockfile with transitive deps', () => {
      it('Then the correct version is matched by semver range', () => {});
      it('Then name-only fallback is not used', () => {});
    });
  });

  describe('Given a tarball with sha256 integrity', () => {
    describe('When verifying integrity', () => {
      it('Then sha256 verification passes for valid hash', () => {});
      it('Then unknown algorithm returns an error', () => {});
    });
  });
});
```

### Phase 2: CLI commands + multi-package + batch efficiency

**Goal:** Add all three CLI commands (`install`, `add`, `remove`) with aliases, multi-package support, batch efficiency, and progress output.

**Steps:**
1. Add `Command::Install(InstallArgs)` with `--frozen` flag and `--frozen-lockfile` alias, and `#[command(alias = "i")]`
2. Add `Command::Add(AddArgs)` with `--dev`/`-D`, `--exact`/`-E`, `packages: Vec<String>`
3. Add `Command::Remove(RemoveArgs)` with `packages: Vec<String>`
4. Wire all commands to `pm::install()`, `pm::add()`, `pm::remove()` in `main.rs`
5. Refactor `pm::add()` to accept `&[&str]` and batch — mutate `package.json` for all packages, then single `install()` pass
6. Refactor `pm::remove()` to accept `&[&str]` — remove all from `package.json`, then single `install()` pass
7. Improve `pm::remove()` error message for transitive-only packages
8. Add progress output: spinner during resolve, progress bar during download, plain summary
9. TTY detection via `std::io::IsTerminal` — plain output in non-TTY
10. Handle `vertz add -g` with clear error: "global installs are not supported"

**Acceptance criteria:**
```typescript
describe('Phase 2: CLI commands', () => {
  // CLI parsing tests
  describe('Given the CLI with install subcommand', () => {
    describe('When parsing "vertz install"', () => {
      it('Then produces InstallArgs with frozen=false', () => {});
    });
    describe('When parsing "vertz i"', () => {
      it('Then produces InstallArgs (alias works)', () => {});
    });
    describe('When parsing "vertz install --frozen"', () => {
      it('Then produces InstallArgs with frozen=true', () => {});
    });
    describe('When parsing "vertz install --frozen-lockfile"', () => {
      it('Then produces InstallArgs with frozen=true (alias works)', () => {});
    });
  });

  describe('Given the CLI with add subcommand', () => {
    describe('When parsing "vertz add zod"', () => {
      it('Then produces AddArgs with packages=["zod"], dev=false, exact=false', () => {});
    });
    describe('When parsing "vertz add -D typescript"', () => {
      it('Then produces AddArgs with dev=true', () => {});
    });
    describe('When parsing "vertz add -E zod"', () => {
      it('Then produces AddArgs with exact=true', () => {});
    });
    describe('When parsing "vertz add zod react"', () => {
      it('Then produces AddArgs with packages=["zod", "react"]', () => {});
    });
  });

  describe('Given the CLI with remove subcommand', () => {
    describe('When parsing "vertz remove zod"', () => {
      it('Then produces RemoveArgs with packages=["zod"]', () => {});
    });
    describe('When parsing "vertz remove zod react"', () => {
      it('Then produces RemoveArgs with packages=["zod", "react"]', () => {});
    });
  });

  // Behavioral tests (Rust integration using tempdir)
  describe('Given a temp project with package.json containing react', () => {
    describe('When calling pm::add() with ["zod", "axios"]', () => {
      it('Then package.json contains zod AND axios in dependencies', () => {});
      it('Then install() is called exactly once (batch)', () => {});
    });
  });

  describe('Given a temp project with zod in dependencies', () => {
    describe('When calling pm::remove() with ["zod"]', () => {
      it('Then package.json no longer has zod', () => {});
    });
  });

  describe('Given a project where "lodash" is a transitive dep only', () => {
    describe('When calling pm::remove() with ["lodash"]', () => {
      it('Then returns error mentioning it is a transitive dependency', () => {});
    });
  });
});
```

### Phase 3: Integration test + polish

**Goal:** End-to-end integration test using real npm registry, progress output polish.

**Steps:**
1. Write Rust integration test (`tests/pm_integration.rs`) that runs the full lifecycle against real registry
2. Verify: add → lockfile created → node_modules populated → install --frozen → remove → cleaned
3. Test scoped packages (`@vertz/schema`) and version constraints (`zod@^3.24.0`)
4. Test package.json field preservation through the lifecycle
5. Polish progress output formatting
6. Add `.local.ts` integration test for binary-level testing (if runtime binary is built)

**Acceptance criteria:**
```typescript
describe('Phase 3: E2E integration', () => {
  describe('Given a temp project directory', () => {
    describe('When running the full add → install → remove lifecycle', () => {
      it('Then vertz add creates package.json entry, lockfile, and node_modules', () => {});
      it('Then vertz install from lockfile reproduces identical node_modules', () => {});
      it('Then vertz remove cleans up package.json, lockfile, and node_modules', () => {});
      it('Then vertz install --frozen fails when lockfile is stale', () => {});
      it('Then package.json unmodeled fields survive the full lifecycle', () => {});
    });
  });

  describe('Given a scoped package @scope/pkg', () => {
    describe('When running add with version constraint @scope/pkg@^1.0.0', () => {
      it('Then the @ splitting handles scoped names correctly', () => {});
      it('Then package.json has correct scoped entry', () => {});
    });
  });
});
```

---

## Dependencies Between Phases

```
Phase 1 (engine integration + critical bug fixes)
  ↓
Phase 2 (all CLI commands + batch + progress)
  ↓
Phase 3 (integration tests + polish)
```

Linear chain. Each phase builds on the previous.

---

## Key Files

| Component | Path |
|---|---|
| CLI args | `native/vertz-runtime/src/cli.rs` |
| CLI main | `native/vertz-runtime/src/main.rs` |
| PM orchestration | `native/vertz-runtime/src/pm/mod.rs` |
| Types | `native/vertz-runtime/src/pm/types.rs` |
| Registry client | `native/vertz-runtime/src/pm/registry.rs` |
| Resolver | `native/vertz-runtime/src/pm/resolver.rs` |
| Tarball manager | `native/vertz-runtime/src/pm/tarball.rs` |
| Linker | `native/vertz-runtime/src/pm/linker.rs` |
| Bin stubs | `native/vertz-runtime/src/pm/bin.rs` |
| Lockfile | `native/vertz-runtime/src/pm/lockfile.rs` |
| Cargo deps | `native/vertz-runtime/Cargo.toml` |
