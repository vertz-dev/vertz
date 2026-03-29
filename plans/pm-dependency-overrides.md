# Design: Dependency Overrides / Resolutions (#2037)

## API Surface

### package.json

Vertz reads both `"overrides"` (npm convention) and `"resolutions"` (yarn convention). If both exist, `"overrides"` takes priority and a warning is emitted.

```json
{
  "dependencies": {
    "express": "^4.18.0"
  },
  "overrides": {
    "qs": "6.11.0",
    "express>body-parser>qs": "6.11.0",
    "cookie": "$cookie",
    "@org/parser": "2.0.0"
  }
}
```

### Override Patterns

| Pattern | Meaning |
|---------|---------|
| `"qs": "6.11.0"` | Override `qs` everywhere in the tree |
| `"express>qs": "6.11.0"` | Override `qs` only when required by `express` |
| `"express>body-parser>qs": "6.11.0"` | Override `qs` only through `express` → `body-parser` path |
| `"cookie": "$cookie"` | Use the root `dependencies`/`devDependencies` version of `cookie` |
| `"@org/parser": "2.0.0"` | Override a scoped package everywhere |

Arbitrary nesting depth is supported (`a>b>c>d`), matching npm semantics.

#### `$name` Reference Syntax

The `$name` syntax inherits the version from your root `dependencies` or `devDependencies`. This avoids duplicating version strings.

- `"cookie": "$cookie"` — use the root version of `cookie`
- If `cookie` is not a direct dependency: `error: override "$cookie" references root dependency "cookie", but "cookie" is not in dependencies or devDependencies`
- Scoped: `"@org/foo": "$@org/foo"` — use the root version of `@org/foo`

#### Error Messages

| Scenario | Error |
|----------|-------|
| Invalid pattern syntax (`"express>>qs"`) | `error: invalid override pattern "express>>qs" — use "parent>child" format` |
| Override version not found on registry | `error: no version of "qs" matches "99.99.99"` |
| `$name` for non-direct dep | `error: override "$cookie" references root dependency "cookie", but "cookie" is not in dependencies or devDependencies` |
| Multi-hop used (supported) | N/A — arbitrary depth is supported |
| `"resolutions"` field found alongside `"overrides"` | `warning: both "overrides" and "resolutions" found — using "overrides" (Vertz uses npm-style overrides)` |
| `"resolutions"` found without `"overrides"` | `warning: "resolutions" field found — did you mean "overrides"? Vertz uses npm-style overrides. Reading as overrides.` |
| Yarn-style glob pattern (`**/qs`) | `error: yarn-style resolution patterns not supported — use "parent>child" npm override syntax` |
| Yarn-style `/` separator (`express/qs`) | `error: invalid override pattern "express/qs" — use ">" as the path separator. Did you mean "express>qs"?` |

#### Override Priority

When both a global and a scoped override exist for the same package, the more specific pattern wins:

```json
{
  "overrides": {
    "qs": "6.11.0",
    "express>qs": "6.12.0"
  }
}
```

`qs` under `express` resolves to `6.12.0`. `qs` everywhere else resolves to `6.11.0`.

### CLI Output

```
vertz install
  Resolving dependencies...
  Override: qs@6.5.3 → 6.11.0 (forced by overrides["qs"])
  Override: qs@6.5.3 → 6.12.0 (forced by overrides["express>qs"])
  Resolved 42 packages
```

Stale override warning:
```
  warning: override "qs": "6.11.0" is satisfied without override — consider removing
```

### Workspace Interaction

Only root `package.json` overrides are respected, matching npm behavior. Workspace package `overrides` fields are ignored. This is explicit: the root controls the dependency tree for the entire monorepo.

## Manifesto Alignment

- **Principle: Explicit over implicit** — Overrides are declared in `package.json`, visible to all developers.
- **Principle: Predictable** — Override warnings help keep config clean. Lockfile reflects actual resolved versions.
- **Principle: Compatible** — Supports both npm `overrides` and yarn `resolutions` (with migration warning).

## Non-Goals

- **Peer dependency overrides** — Peer deps have separate resolution semantics. Future work.
- **`$` without name** (npm's "use parent's version") — We only support `$name` explicit references. The bare `$` is confusing and rarely used.
- **`"."` syntax** (npm's "use current package.json version") — Same rationale, too implicit.

## Unknowns

None identified — npm's `overrides` field is well-understood. We follow npm's semantics with the additions noted above.

## Type Flow Map

No generics — configuration + resolver modification.

## Resolver Integration Details

### Override Data Structure

```rust
struct OverrideRule {
    /// Path from root: ["express", "body-parser"] for "express>body-parser>qs"
    parent_path: Vec<String>,
    /// Target package name: "qs"
    target: String,
    /// Forced version: "6.11.0" (already resolved from $name if applicable)
    version: String,
}

struct OverrideMap {
    /// All parsed override rules, ordered by specificity (longer path = more specific)
    rules: Vec<OverrideRule>,
}
```

### Injection Point: Range Substitution at Call Sites

Before calling `resolve_version`, check if the `(parent_chain, dep_name)` matches an override rule. If so, substitute the `range` with the override version. This approach:

1. **Visited key:** Uses the **original range** (`qs@~6.5.0`), NOT the substituted version. This preserves the invariant that lockfile keys match what dependents declare in their `dependencies` maps. The override substitution happens **after** the visited check but **before** the `resolve_version` call. The resolved version in the graph entry will be the override version (e.g., `6.11.0`), and `overridden: true` marks it.
2. **Parent tracking:** `ResolveState` gains a `parent_chain: Vec<String>` field (owned, pushed/popped around recursive calls). This avoids lifetime conflicts with `async_recursion` and `&mut ResolveState`. The chain accumulates as: `[] → ["express"] → ["express", "body-parser"]`.
3. **Matching:** For each dep, scan `OverrideMap.rules` for the most specific match (longest `parent_path` suffix match on the current chain).

### Lockfile Keying for Overridden Entries

When an override forces a version outside the original range (e.g., `qs@~6.5.0` overridden to `6.11.0`):

- **Lockfile key** uses the **original range**: `qs@~6.5.0` (not the override version). This preserves the invariant that lockfile keys match what dependents declare.
- **`overridden: true`** field added to `LockfileEntry` so the reader knows this version was forced
- The **resolved version** in the entry is the override version (`6.11.0`), which may not satisfy the original range — that's the point of overrides
- `graph_to_lockfile()` preserves the original range as the key; the `version` field shows the actual resolved version

### `overrides` in `PackageJson` Struct

Add `overrides: BTreeMap<String, String>` to `PackageJson`. Update `write_package_json()` to preserve the field (write if non-empty, don't remove if already present). Also check for `resolutions` during parsing and merge into `overrides` with appropriate warning.

## Implementation Plan

### Phase 1: Override Parsing + Resolution Integration

**Scope:** Parse `overrides`/`resolutions` from `package.json`, apply during resolution, lockfile persistence.

1. Add `overrides: BTreeMap<String, String>` to `PackageJson` struct
2. Add `resolutions` parsing with migration warning
3. Add `parse_overrides()` → `OverrideMap` with `parent_path`, `target`, `version` fields
4. Resolve `$name` references against root deps at parse time
5. Add `parent_chain: Vec<String>` to `ResolveState` (owned, push/pop around recursive calls)
6. After visited check, before `resolve_version`: check `OverrideMap` for matching rule; substitute range if matched
7. Lockfile keying: use original range as key, resolved version is the override version, mark `overridden: true`
8. Emit override application info via `PmOutput`
9. Persist overrides through `write_package_json()`

**Acceptance criteria:**
```rust
// Global override
describe!("Given overrides { 'qs': '6.11.0' }", {
  describe!("When resolving express which depends on qs@~6.5.0", {
    it!("Then qs resolves to 6.11.0 instead of 6.5.3");
    it!("Then lockfile contains qs@6.11.0 with overridden: true");
  });
});

// Scoped override (depth-1)
describe!("Given overrides { 'express>qs': '6.11.0' }", {
  describe!("When resolving express and body-parser both depending on qs", {
    it!("Then qs under express is 6.11.0");
    it!("Then qs under body-parser is resolved normally");
  });
});

// Deep nested override
describe!("Given overrides { 'express>body-parser>qs': '6.11.0' }", {
  describe!("When express>body-parser>qs exists in the tree", {
    it!("Then qs under express>body-parser is 6.11.0");
    it!("Then qs under express (direct) is resolved normally");
  });
});

// $name reference
describe!("Given overrides { 'cookie': '$cookie' } and cookie in dependencies", {
  it!("Then transitive cookie uses the root dependency version");
});

// $name for missing root dep
describe!("Given overrides { 'cookie': '$cookie' } and cookie NOT in dependencies", {
  it!("Then error: '$cookie' references missing root dependency");
});

// resolutions alias
describe!("Given 'resolutions' in package.json without 'overrides'", {
  it!("Then reads resolutions as overrides with warning");
});

// Scoped package
describe!("Given overrides { '@org/parser': '2.0.0' }", {
  it!("Then @org/parser resolves to 2.0.0 everywhere");
});

// Override priority: specific > global
describe!("Given overrides { 'qs': '6.11.0', 'express>qs': '6.12.0' }", {
  it!("Then qs under express is 6.12.0");
  it!("Then qs elsewhere is 6.11.0");
});

// Frozen install with overrides
describe!("Given frozen install and overrides changed since lockfile", {
  it!("Then error: lockfile is out of date");
});
```

### Phase 2: Stale Override Warnings (merged into Phase 1)

**Scope:** Detect when overrides are no longer needed. This is trivially small (~20-30 lines) and completes the feature, so it is merged into Phase 1 rather than being a separate phase.

Algorithm: After resolution, for each override rule, check if the override version satisfies every original range that demanded the target package in the dependency tree. If all ranges are satisfied by the override version, the override is redundant.

This uses range-satisfaction heuristic (not full re-resolution) for performance.

1. After resolution, check each override against original ranges in the graph
2. If the override version satisfies all original ranges, emit warning
3. Add `--json` support for override warnings

**Acceptance criteria:**
```rust
describe!("Given override 'qs': '6.11.0' and all ranges satisfy >=6.11.0", {
  it!("Then warning: 'override qs is satisfied without override — consider removing'");
});

describe!("Given override 'qs': '6.11.0' and express still requires ~6.5.0", {
  it!("Then no warning (override is still needed)");
});
```

## E2E Acceptance Test

```
Developer has a project depending on express@4.18.0, which transitively requires qs@6.5.3.
A security advisory requires qs >= 6.11.0.

1. Developer adds "overrides": { "qs": "6.11.0" } to package.json
2. Developer runs `vertz install`
3. Output shows: "Override: qs@6.5.3 → 6.11.0 (forced by overrides["qs"])"
4. `node_modules/qs/package.json` version is 6.11.0
5. Lockfile contains qs@6.11.0 with overridden: true
6. Later, express updates to depend on qs@^6.11.0 natively
7. `vertz install` warns: "override 'qs' is satisfied without override — consider removing"

Scoped package scenario:
8. Developer adds "overrides": { "express>@org/parser": "2.0.0" } to package.json
9. `vertz install` overrides @org/parser only under express, not elsewhere

Migration from yarn:
10. Developer has "resolutions": { "qs": "6.11.0" } (no "overrides")
11. `vertz install` reads it with warning: "did you mean 'overrides'?"
12. Override is applied correctly
```
