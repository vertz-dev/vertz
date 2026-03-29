# Vertz Package Manager Phase 2b — Introspection & Agent Output

> "AI agents are first-class users." — Vertz Vision, Principle 3

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-03-29 | Initial draft — `vertz why`, `vertz list`, `--json` output, `vertz outdated` |
| 2 | 2026-03-29 | Address 2 blockers + 15 should-fix + 5 nitpicks from DX, Product, and Technical reviews. Add `list --all --json` schema with depth/parent fields, BFS graph construction algorithm, event emitter trait for `--json`, error event schema, exit codes, `rm` alias, `list <package>` filter, all-paths for `why`, `--depth` implies `--all`, abbreviated metadata for `outdated`, pre-release semantics, empty-state outputs, circular dep handling, multi-version `why` test, move `--json` on mutating commands to Phase 1 |

**Prior art:** Phase 2a (PR #2017) delivered `vertz install`, `vertz add`, `vertz remove` with batch support, parallel downloads, lockfile, and progress output. This document covers **Phase 2b: introspection commands and structured output** — giving developers and LLM agents tools to understand and query the dependency graph.

---

## Executive Summary

Add `vertz why`, `vertz list`, and `vertz outdated` commands with `--json` structured output support across all package manager commands. These are read-only introspection tools that don't modify `package.json` or `node_modules` — they query the resolved dependency graph and lockfile.

This phase prioritizes **LLM agent usability** (Principle 3): every command produces machine-parseable NDJSON output with `--json`, enabling agents to programmatically analyze dependencies, find unused packages, and diagnose version conflicts without scraping human-readable text.

**Note:** `vertz update` (modify `package.json` ranges to latest) is the immediate next priority after Phase 2b. `vertz outdated` intentionally pairs with `vertz update` — this phase ships the read-only half, Phase 2c ships the write half.

---

## The Problem

After Phase 2a, developers can install, add, and remove packages. But they can't answer:

1. **"Why is this package installed?"** — When `node_modules/` contains unexpected packages, there's no way to trace the dependency chain. `vertz why lodash` should show all paths.
2. **"What's installed?"** — No command lists installed packages with their versions. LLM agents must read `package.json` and `vertz.lock` manually.
3. **"What's outdated?"** — No way to check if newer versions are available within the current ranges, or if major updates exist.
4. **"How do I pipe this to another tool?"** — All output is human-readable `eprintln!`. CI pipelines, LLM agents, and scripts need structured JSON.

---

## API Surface

### `vertz why <package>`

Trace why a package is in the dependency tree. Shows **all** dependency paths from root dependencies, sorted shortest-first.

```bash
$ vertz why js-tokens
js-tokens@4.0.0
  react@^18.3.0 → loose-envify@^1.1.0 → js-tokens@^3.0.0 || ^4.0.0
  react-dom@^18.3.0 → loose-envify@^1.1.0 → js-tokens@^3.0.0 || ^4.0.0

$ vertz why react
react@18.3.1
  dependencies (direct)

$ vertz why nonexistent
error: package "nonexistent" is not installed

$ vertz why js-tokens --json
{"name":"js-tokens","version":"4.0.0","paths":[[{"name":"react","range":"^18.3.0","version":"18.3.1"},{"name":"loose-envify","range":"^1.1.0","version":"1.4.0"},{"name":"js-tokens","range":"^3.0.0 || ^4.0.0","version":"4.0.0"}]]}
```

When a package exists at **multiple versions** (due to hoisting), `vertz why` shows each version separately:

```bash
$ vertz why lodash
lodash@4.17.21
  dependencies (direct)

lodash@3.10.1
  legacy-lib@^1.0.0 → lodash@^3.0.0
```

Human output shows all paths (capped at 10, with "and N more paths — use --json for all"). JSON output always includes all paths.

#### Graph Construction Algorithm

`vertz why` constructs the dependency graph from lockfile data using BFS:

1. Read `package.json` to identify root (direct) dependencies with their ranges
2. For each root dep, look up `Lockfile::spec_key(name, range)` in lockfile entries
3. Build adjacency list: for each lockfile entry, edges go to `Lockfile::spec_key(dep_name, dep_range)` for each item in the entry's `dependencies` map
4. BFS from all root entries simultaneously, tracking paths via multi-parent tracking
5. BFS uses a visited set (`HashSet<String>`) to break circular dependencies — if a cycle exists, the shortest non-cyclic path is returned
6. When searching for the target package, match by **name** (not spec key) since the user provides just the package name

### `vertz list [package]`

List installed packages. By default, shows only direct dependencies. `--all` shows the full tree. Optional `[package]` positional argument filters by package name.

```bash
$ vertz list
dependencies:
  react@18.3.1
  zod@3.24.4

devDependencies:
  typescript@5.7.3

$ vertz list react
dependencies:
  react@18.3.1
    loose-envify@1.4.0
      js-tokens@4.0.0
    scheduler@0.23.2

$ vertz list --all
dependencies:
  react@18.3.1
    loose-envify@1.4.0
      js-tokens@4.0.0
    scheduler@0.23.2
      loose-envify@1.4.0
  zod@3.24.4

devDependencies:
  typescript@5.7.3

$ vertz list --all --depth 1
dependencies:
  react@18.3.1
    loose-envify@1.4.0
    scheduler@0.23.2
  zod@3.24.4

devDependencies:
  typescript@5.7.3

$ vertz list --json
{"type":"dependency","name":"react","version":"18.3.1","range":"^18.3.0","dev":false,"depth":0}
{"type":"dependency","name":"zod","version":"3.24.4","range":"^3.24.0","dev":false,"depth":0}
{"type":"dependency","name":"typescript","version":"5.7.3","range":"^5.0.0","dev":true,"depth":0}

$ vertz list --all --json
{"type":"dependency","name":"react","version":"18.3.1","range":"^18.3.0","dev":false,"depth":0}
{"type":"dependency","name":"loose-envify","version":"1.4.0","range":"^1.1.0","dev":false,"depth":1,"parent":"react"}
{"type":"dependency","name":"js-tokens","version":"4.0.0","range":"^3.0.0 || ^4.0.0","dev":false,"depth":2,"parent":"loose-envify"}
{"type":"dependency","name":"scheduler","version":"0.23.2","range":"^0.23.2","dev":false,"depth":1,"parent":"react"}
{"type":"dependency","name":"zod","version":"3.24.4","range":"^3.24.0","dev":false,"depth":0}
{"type":"dependency","name":"typescript","version":"5.7.3","range":"^5.0.0","dev":true,"depth":0}
```

**`--depth` implies `--all`.** Using `--depth 2` automatically enables tree traversal — no need to also pass `--all`. `--depth 0` is equivalent to no `--all` (direct deps only).

**No lockfile:**

```bash
$ vertz list   # (no vertz.lock present)
dependencies:
  react@^18.3.0 (not installed)
  zod@^3.24.0 (not installed)
```

JSON with no lockfile:
```json
{"type":"dependency","name":"react","version":null,"range":"^18.3.0","dev":false,"depth":0,"installed":false}
```

### `vertz outdated`

Check for newer versions of installed packages.

```bash
$ vertz outdated
Package      Current  Wanted   Latest
react        18.3.1   18.3.1   19.1.0
typescript   5.7.3    5.8.2    5.8.2

$ vertz outdated --json
{"name":"react","current":"18.3.1","wanted":"18.3.1","latest":"19.1.0","range":"^18.3.0","dev":false}
{"name":"typescript","current":"5.7.3","wanted":"5.8.2","latest":"5.8.2","range":"^5.0.0","dev":true}
```

- **Current**: The installed version (from lockfile)
- **Wanted**: The highest version satisfying the range in `package.json` (uses `resolve_version()`)
- **Latest**: The version tagged `latest` in the registry's `dist-tags` (always the stable release — pre-releases are on `next`/`beta` tags and are not shown)

**All up to date:**

```bash
$ vertz outdated
All packages are up to date.

$ vertz outdated --json
# (empty output — zero NDJSON lines)
```

**No dependencies:**

```bash
$ vertz outdated
No dependencies found.
```

**Network failure for one package:** If metadata fetch fails for one package, skip it and warn on stderr. Show results for packages that succeeded. This is informational, not critical — partial results are more useful than total failure.

### `--json` flag (all commands)

Add `--json` flag to `install`, `add`, `remove` (from Phase 2a) and the new commands. Output format is NDJSON (one JSON object per line) on **stdout**. Human progress remains on **stderr**.

#### Event Types

Events are categorized as **progress** (informational, can be skipped) or **terminal** (signals completion or failure):

| Event | Type | Description |
|---|---|---|
| `resolve` | progress | Dependency resolution started/complete |
| `download_progress` | progress | Download batch progress update |
| `link` | progress | Linking step complete |
| `added` | terminal | Package was added (for `add`) |
| `removed` | terminal | Package was removed (for `remove`) |
| `done` | terminal | Operation completed successfully |
| `error` | terminal | Operation failed |

#### Success Examples

```bash
$ vertz add zod --json
{"event":"resolve","packages":1}
{"event":"download_progress","completed":1,"total":1}
{"event":"link","packages":1,"files":42}
{"event":"added","name":"zod","version":"3.24.4","range":"^3.24.4"}
{"event":"done","elapsed_ms":1200}

$ vertz install --json
{"event":"resolve","packages":142}
{"event":"download_progress","completed":50,"total":142}
{"event":"download_progress","completed":142,"total":142}
{"event":"link","packages":142,"files":8431}
{"event":"done","elapsed_ms":3200}

$ vertz remove zod --json
{"event":"removed","name":"zod"}
{"event":"resolve","packages":141}
{"event":"link","packages":141,"files":8390}
{"event":"done","elapsed_ms":800}
```

#### Error Examples

```bash
$ vertz add nonexistent-pkg --json
{"event":"error","code":"PACKAGE_NOT_FOUND","message":"package \"nonexistent-pkg\" not found in npm registry"}

$ vertz install --frozen --json
{"event":"error","code":"LOCKFILE_STALE","message":"lockfile is out of date: zod \"^4.0.0\" not found in vertz.lock"}

$ vertz remove loose-envify --json
{"event":"error","code":"NOT_DIRECT_DEPENDENCY","message":"package is not a direct dependency: \"loose-envify\""}
```

Error codes enable programmatic handling without string parsing:

| Code | Meaning |
|---|---|
| `PACKAGE_NOT_FOUND` | Package doesn't exist on registry |
| `VERSION_NOT_FOUND` | No version matches specifier |
| `LOCKFILE_STALE` | Lockfile doesn't match package.json |
| `NOT_DIRECT_DEPENDENCY` | Package is transitive, can't be removed |
| `NETWORK_ERROR` | Registry unreachable |
| `INTEGRITY_FAILED` | Tarball hash mismatch |

### Exit Codes

| Exit Code | Meaning | Commands |
|---|---|---|
| 0 | Success | All commands |
| 1 | Error | All commands on failure |

`vertz outdated` exits 0 even when packages are outdated (it's informational). `vertz why` exits 1 when the package is not installed.

### CLI Flags Summary

| Command | New Flags | Description |
|---|---|---|
| `vertz why <package>` | `--json` | Show all dependency paths |
| `vertz list [package]` | `--all`, `--depth <n>`, `--json` | List installed packages |
| `vertz outdated` | `--json` | Check for newer versions |
| `vertz install` | `--json` (added) | Structured install events |
| `vertz add` | `--json` (added) | Structured add events |
| `vertz remove` | `--json` (added) | Structured remove events |

### CLI Aliases

| Command | Alias | Rationale |
|---|---|---|
| `vertz remove` | `vertz rm` | Universal Unix shorthand. No ambiguity — there's no other `rm` subcommand. |

---

## Manifesto Alignment

### Principle 3: AI agents are first-class users
Every command outputs structured NDJSON with `--json`. An LLM agent can:
- Run `vertz list --json` to understand the dependency graph
- Run `vertz why lodash --json` to trace dependency chains
- Run `vertz outdated --json` to suggest updates
- Parse events from `vertz add --json` to confirm success
- Check error codes programmatically without string parsing

### Principle 2: One way to do things
`vertz why` answers "why is this here?" — not `vertz explain`, not `vertz trace`, not `vertz deps`. One command, one verb, one answer. `rm` is the one allowed alias for `remove` (same word, universal shorthand).

### Principle 7: Performance is not optional
`vertz list` and `vertz why` read from the lockfile — no network, no registry calls. `vertz outdated` uses abbreviated registry metadata (much smaller payloads) with ETag caching.

### Tradeoffs accepted

- **NDJSON, not JSON array.** Streaming-friendly — an LLM can process partial output. Slightly harder to `jq` but better for large dependency trees.
- **`vertz outdated` hits the network.** Unlike `list`/`why`, this needs registry data. Acceptable because it's an explicit user request, not implicit. Uses ETag caching to minimize latency.
- **`vertz outdated` without `vertz update`.** Shows the problem but doesn't solve it — the write half ships in Phase 2c. Developers can use `vertz add <pkg>@latest` as a workaround.

### Tradeoffs rejected

- **`vertz audit`** — Security audit is a separate, complex feature requiring a vulnerability database. Not in scope.
- **`--peer`/`-P` flag for `vertz add`** — Peer dependency auto-installation is complex and interacts with resolution. Deferred to Phase 3.

---

## Non-Goals

1. **Security audit** — vulnerability scanning requires a separate database
2. **`vertz update`** — modifying `package.json` ranges (immediate next priority after Phase 2b)
3. **`vertz dedupe`** — hoisting optimization is internal to the resolver
4. **Colorized JSON output** — `--json` is for machines, not humans
5. **Interactive dependency selection** — terminal UIs are not in scope for Phase 2b
6. **Pre-release version tracking** — `latest` column uses `dist-tags.latest` only (stable releases)

---

## Unknowns

### U1: Should `vertz list` read from lockfile or node_modules? — Resolved

**Decision: lockfile.** Reading `node_modules/` is slow (filesystem walk) and fragile (partial installs, hardlinks). The lockfile is the source of truth for what *should* be installed. If `node_modules/` is missing, `vertz list` still works — it shows what would be installed, with "not installed" annotation.

### U2: NDJSON delimiter — Resolved

**Decision: newline-delimited JSON (one object per line).** Standard NDJSON. Each line is a valid JSON object. No top-level array wrapper. Compatible with `jq -c`, streaming parsers, and LLM context windows.

### U3: Full vs abbreviated registry metadata for `outdated` — Resolved

**Decision: abbreviated metadata.** `vertz outdated` only needs `dist-tags` and version keys — not tarball URLs, dependency maps, or full version metadata. The npm registry supports abbreviated responses via `Accept: application/vnd.npm.install-v1+json`, which are 10-100x smaller. Add a `fetch_metadata_abbreviated()` method to `RegistryClient` that uses this header. ETag caching applies to abbreviated responses too.

---

## POC Results

No POC needed. All data sources exist from Phase 2a:
- Lockfile parsing (`lockfile::read_lockfile`) — returns `Lockfile` with all entries
- Package metadata (`registry::RegistryClient::fetch_metadata`) — returns `PackageMetadata` with dist-tags
- Package.json parsing (`types::read_package_json`) — returns `PackageJson`

The new commands compose these existing APIs. The only new infrastructure is the `PmOutput` trait for event-based output (see Implementation Plan).

---

## Type Flow Map

All types are concrete Rust structs. No generics. Data flow for each command:

```
vertz why <pkg>:
  read_package_json() → PackageJson (root dep names + ranges)
  read_lockfile() → Lockfile
    → Build adjacency list from lockfile entries' dependencies
    → BFS from root entries (visited set breaks cycles)
    → Match target by name across all versions
    → Return all paths or --json

vertz list [pkg]:
  read_package_json() → PackageJson (direct deps)
  read_lockfile() → Lockfile (resolved versions + transitive deps for --all)
    → Optionally filter by [pkg] name
    → Walk tree to --depth limit
    → Return tree or --json (with depth + parent fields)

vertz outdated:
  read_package_json() → PackageJson (ranges)
  read_lockfile() → Lockfile (current versions)
  fetch_metadata_abbreviated() → dist-tags + version keys per dep
    → resolve_version() for wanted
    → dist-tags.latest for latest
    → Return table or --json
```

---

## Event Emitter Architecture

To support `--json` output on existing commands (`install`, `add`, `remove`) without scattering `if json { ... }` conditionals, use a trait-based event emitter:

```rust
/// Output handler for PM operations — either human-readable or NDJSON
pub trait PmOutput: Send + Sync {
    fn resolve_started(&self);
    fn resolve_complete(&self, count: usize);
    fn download_progress(&self, completed: usize, total: usize);
    fn link_complete(&self, packages: usize, files: usize);
    fn package_added(&self, name: &str, version: &str, range: &str);
    fn package_removed(&self, name: &str);
    fn done(&self, elapsed_ms: u64);
    fn error(&self, code: &str, message: &str);
}
```

Two implementations:

- **`TextOutput`** — wraps current `eprintln!` + `indicatif` behavior (default)
- **`JsonOutput`** — writes NDJSON lines to stdout via `println!`

The `install()`, `add()`, `remove()` functions receive `&dyn PmOutput` instead of hardcoding `eprintln!`. The CLI layer constructs the appropriate implementation based on `--json` flag.

This is a refactor of the existing functions but doesn't change behavior — `TextOutput` produces identical output to the current `eprintln!` calls.

---

## E2E Acceptance Test

```typescript
describe('Feature: vertz why', () => {
  describe('Given a project with react installed (which depends on loose-envify → js-tokens)', () => {
    describe('When running vertz why js-tokens', () => {
      it('Then shows all dependency paths to js-tokens', () => {});
    });
    describe('When running vertz why react', () => {
      it('Then shows "dependencies (direct)"', () => {});
    });
    describe('When running vertz why nonexistent', () => {
      it('Then exits with code 1 and error "package nonexistent is not installed"', () => {});
    });
    describe('When running vertz why js-tokens --json', () => {
      it('Then outputs valid JSON with name, version, and paths array of objects', () => {});
      it('Then each path entry has name, range, and version fields', () => {});
    });
  });

  describe('Given a lockfile with circular deps (A → B → A)', () => {
    describe('When calling pm::why("B")', () => {
      it('Then returns path [A, B] without infinite loop', () => {});
    });
  });

  describe('Given a lockfile with two versions of lodash (v3 nested, v4 root)', () => {
    describe('When calling pm::why("lodash")', () => {
      it('Then shows paths for BOTH versions separately', () => {});
    });
  });
});

describe('Feature: vertz list', () => {
  describe('Given a project with react (dep) and typescript (devDep) installed', () => {
    describe('When running vertz list', () => {
      it('Then shows direct dependencies grouped by type', () => {});
      it('Then does not show transitive dependencies', () => {});
    });
    describe('When running vertz list --all', () => {
      it('Then shows full dependency tree with indentation', () => {});
    });
    describe('When running vertz list --depth 1', () => {
      it('Then implies --all and shows one level of transitive deps', () => {});
    });
    describe('When running vertz list react', () => {
      it('Then shows react and its full subtree', () => {});
    });
    describe('When running vertz list --json', () => {
      it('Then outputs one NDJSON line per direct dependency with depth=0', () => {});
    });
    describe('When running vertz list --all --json', () => {
      it('Then outputs one NDJSON line per package including transitive deps', () => {});
      it('Then each line includes depth and parent fields', () => {});
    });
  });

  describe('Given a project with no lockfile', () => {
    describe('When running vertz list', () => {
      it('Then shows deps from package.json with "(not installed)" annotation', () => {});
    });
    describe('When running vertz list --json', () => {
      it('Then outputs lines with version=null and installed=false', () => {});
    });
  });
});

describe('Feature: vertz outdated', () => {
  describe('Given a project with is-number@7.0.0 installed (latest is 7.0.0)', () => {
    describe('When running vertz outdated', () => {
      it('Then shows the package with current, wanted, and latest versions', () => {});
    });
    describe('When running vertz outdated --json', () => {
      it('Then outputs one NDJSON line per dependency', () => {});
      it('Then each line has name, current, wanted, latest, range, dev fields', () => {});
    });
  });

  describe('Given all packages are up to date', () => {
    describe('When running vertz outdated', () => {
      it('Then prints "All packages are up to date." and exits 0', () => {});
    });
    describe('When running vertz outdated --json', () => {
      it('Then produces zero NDJSON lines', () => {});
    });
  });

  describe('Given no dependencies in package.json', () => {
    describe('When running vertz outdated', () => {
      it('Then prints "No dependencies found." and exits 0', () => {});
    });
  });
});

describe('Feature: --json flag on existing commands', () => {
  describe('Given a project', () => {
    describe('When running vertz add is-number --json', () => {
      it('Then stdout contains NDJSON events (resolve, download_progress, link, added, done)', () => {});
      it('Then stderr still shows human progress', () => {});
    });
    describe('When running vertz add nonexistent-pkg --json', () => {
      it('Then stdout contains error event with code PACKAGE_NOT_FOUND', () => {});
    });
    describe('When running vertz remove is-number --json', () => {
      it('Then stdout contains NDJSON events (removed, resolve, link, done)', () => {});
    });
  });
});

describe('Feature: rm alias', () => {
  describe('When running vertz rm zod', () => {
    it('Then behaves identically to vertz remove zod', () => {});
  });
});
```

---

## Implementation Plan

### Phase 1: `--json` infrastructure + `vertz list` + `--json` on existing commands

**Goal:** Build the `PmOutput` trait and NDJSON infrastructure, implement `vertz list`, and wire `--json` to existing `install`/`add`/`remove` commands. This is the highest-value phase for LLM agents.

**Steps:**
1. Add `PmOutput` trait + `TextOutput` + `JsonOutput` implementations (`pm/output.rs`)
2. Refactor `install()`, `add()`, `remove()` to accept `&dyn PmOutput` instead of `eprintln!`
3. Add `--json` flag to existing `InstallArgs`, `AddArgs`, `RemoveArgs`
4. Add `Command::List(ListArgs)` with `[package]`, `--all`, `--depth <n>`, `--json`
5. Add `rm` alias for `Command::Remove`
6. Implement `pm::list()` that reads lockfile + package.json, supports tree/filter/depth
7. Wire all CLI changes in `main.rs`
8. Add unit tests for: list grouping, tree depth, `--json` output, `rm` alias, error events

**Acceptance criteria:**
```typescript
describe('Phase 1: --json infra + vertz list', () => {
  describe('Given a lockfile with react, zod (deps) and typescript (devDep)', () => {
    describe('When calling pm::list() with default options', () => {
      it('Then returns direct deps grouped by dependency type', () => {});
    });
    describe('When calling pm::list() with all=true', () => {
      it('Then returns full transitive tree with depth/parent', () => {});
    });
    describe('When calling pm::list() with depth=1', () => {
      it('Then returns one level of transitive deps (--all implied)', () => {});
    });
    describe('When calling pm::list() with filter="react"', () => {
      it('Then shows react and its subtree only', () => {});
    });
  });

  describe('Given the CLI with --json flag', () => {
    describe('When parsing "vertz list --all --depth 2 --json"', () => {
      it('Then produces ListArgs with all=true, depth=Some(2), json=true', () => {});
    });
    describe('When parsing "vertz add zod --json"', () => {
      it('Then produces AddArgs with json=true', () => {});
    });
    describe('When parsing "vertz rm zod"', () => {
      it('Then produces RemoveArgs with packages=["zod"]', () => {});
    });
  });

  describe('Given PmOutput trait implementations', () => {
    describe('When TextOutput receives events', () => {
      it('Then produces eprintln output matching current behavior', () => {});
    });
    describe('When JsonOutput receives events', () => {
      it('Then produces valid NDJSON lines on stdout', () => {});
    });
    describe('When JsonOutput receives an error', () => {
      it('Then produces error event with code and message', () => {});
    });
  });
});
```

### Phase 2: `vertz why`

**Goal:** Implement dependency path tracing with BFS.

**Steps:**
1. Add `Command::Why(WhyArgs)` with `package: String`, `--json`
2. Implement `pm::why()` with BFS through lockfile dependency graph (see Graph Construction Algorithm above)
3. Handle multi-version packages — search by name, group results by version
4. Wire CLI → `pm::why()` in main.rs
5. Add unit tests for: direct dep, transitive path, multiple paths, multiple versions, circular deps, not found

**Acceptance criteria:**
```typescript
describe('Phase 2: vertz why', () => {
  describe('Given a lockfile with react → loose-envify → js-tokens', () => {
    describe('When calling pm::why("js-tokens")', () => {
      it('Then returns all paths to js-tokens', () => {});
    });
    describe('When calling pm::why("react")', () => {
      it('Then returns direct dependency marker', () => {});
    });
    describe('When calling pm::why("nonexistent")', () => {
      it('Then returns error "not installed" with exit code 1', () => {});
    });
  });

  describe('Given a lockfile with circular deps (A → B → A)', () => {
    describe('When calling pm::why("B")', () => {
      it('Then returns path [A, B] without infinite loop', () => {});
    });
  });

  describe('Given a lockfile with lodash@3.10.1 (nested) and lodash@4.17.21 (root)', () => {
    describe('When calling pm::why("lodash")', () => {
      it('Then shows both versions with their respective paths', () => {});
    });
  });

  describe('Given a lockfile where two root deps require the same transitive dep', () => {
    describe('When calling pm::why("shared-dep")', () => {
      it('Then shows all paths from both root deps', () => {});
    });
  });
});
```

### Phase 3: `vertz outdated` + integration tests

**Goal:** Implement outdated checking with abbreviated metadata and write integration tests for all new commands.

**Steps:**
1. Add `fetch_metadata_abbreviated()` to `RegistryClient` with `Accept: application/vnd.npm.install-v1+json` header
2. Add `Command::Outdated(OutdatedArgs)` with `--json`
3. Implement `pm::outdated()` — reads lockfile for current, fetches abbreviated metadata for wanted/latest
4. Handle edge cases: all up to date, no deps, network failure for individual packages (skip + warn)
5. Wire CLI → `pm::outdated()` in main.rs
6. Write integration tests (`tests/pm_introspection.rs`) against real npm registry

**Acceptance criteria:**
```typescript
describe('Phase 3: vertz outdated + integration', () => {
  describe('Given a project with is-number installed', () => {
    describe('When calling pm::outdated()', () => {
      it('Then returns current, wanted, and latest versions', () => {});
      it('Then "latest" uses dist-tags.latest (stable only, no pre-releases)', () => {});
    });
  });

  describe('Given all packages are up to date', () => {
    describe('When calling pm::outdated()', () => {
      it('Then returns empty list and prints "All packages are up to date."', () => {});
    });
  });

  describe('Given no dependencies', () => {
    describe('When calling pm::outdated()', () => {
      it('Then prints "No dependencies found."', () => {});
    });
  });

  // Integration tests (real registry)
  describe('Given a temp project with is-number added', () => {
    describe('When running pm::list()', () => {
      it('Then lists is-number as a direct dependency', () => {});
    });
    describe('When running pm::list("is-number")', () => {
      it('Then shows is-number and its subtree', () => {});
    });
    describe('When running pm::why("is-number")', () => {
      it('Then shows it as a direct dependency', () => {});
    });
    describe('When running pm::outdated()', () => {
      it('Then shows current version and latest', () => {});
    });
  });
});
```

---

## Dependencies Between Phases

```
Phase 1 (--json infra + PmOutput trait + vertz list + --json on existing commands)
  ↓
Phase 2 (vertz why)  [uses JSON infra from Phase 1; why logic itself is independent]
  ↓
Phase 3 (vertz outdated + abbreviated metadata + integration tests)
```

Phase 2's core `why` BFS logic is independent of `list`, but its `--json` output uses the infrastructure from Phase 1.

---

## Key Files

| Component | Path |
|---|---|
| Output trait + implementations | `native/vertz-runtime/src/pm/output.rs` (new) |
| CLI args | `native/vertz-runtime/src/cli.rs` |
| CLI main | `native/vertz-runtime/src/main.rs` |
| PM orchestration | `native/vertz-runtime/src/pm/mod.rs` |
| Lockfile reader | `native/vertz-runtime/src/pm/lockfile.rs` |
| Registry client | `native/vertz-runtime/src/pm/registry.rs` |
| Types | `native/vertz-runtime/src/pm/types.rs` |
| Introspection tests | `native/vertz-runtime/tests/pm_introspection.rs` (new) |
