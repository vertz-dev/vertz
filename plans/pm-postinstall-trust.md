# Design: Postinstall Script Trust Allowlist (#2039)

## API Surface

### CLI

```bash
# Set trusted patterns (replaces entire list — prints removed entries)
vertz config set trust-scripts @vertz/* esbuild prisma

# Add to trusted patterns
vertz config add trust-scripts sharp

# Remove from trusted patterns
vertz config remove trust-scripts esbuild

# Show current trust list
vertz config get trust-scripts

# Install with all scripts forced to run (migration escape hatch)
vertz install --run-scripts

# Install with all scripts ignored (existing)
vertz install --ignore-scripts

# Initialize trust list from current lockfile (scans packages with postinstall)
vertz config init trust-scripts
```

### Config File (`.vertzrc`)

`.vertzrc` is the canonical Vertz-specific project config file. It is separate from `.npmrc` which is read only for npm registry compatibility (auth tokens, scoped registries). Future Vertz-specific configuration (auto-install, overrides UI, etc.) will live in `.vertzrc`. `.npmrc` will never gain Vertz-specific keys.

```json
{
  "trustScripts": ["@vertz/*", "esbuild", "prisma", "sharp"]
}
```

### Behavior During `install`/`add`

1. Collect all packages with postinstall scripts from the resolved graph.
2. Partition into **trusted** (matches a pattern in `trustScripts`) and **untrusted**.
3. **Trusted** — run (same as today).
4. **Untrusted (interactive TTY)** — prompt summary, then per-package:
   ```
   3 untrusted packages want to run postinstall scripts:
     esbuild: node install.js
     prisma: node scripts/postinstall.js
     sharp: node install/libvips.js

   Allow? [y/N/a(lways)/A(ll)]
   ```
   - `y` — run this one, don't remember
   - `N` (default) — skip this package's script
   - `a` — run and add this package to `trustScripts` in `.vertzrc`
   - `A` — run all remaining and add all to `trustScripts`
5. **Untrusted (non-interactive)** — skip and warn with actionable fix:
   ```
   warning: skipping untrusted postinstall for "esbuild" (node install.js)
   warning: skipping untrusted postinstall for "sharp" (node install/libvips.js)
   fix: vertz config add trust-scripts esbuild sharp
   ```
   Note: the fix command uses `add` (not `set`) to avoid overwriting existing trusted packages. If no `.vertzrc` exists, the fix command still uses `add` — it creates the file with the listed packages.
6. `--ignore-scripts` overrides everything — no scripts run at all.
7. `--run-scripts` forces all scripts to run regardless of trust list (migration escape hatch). Emits a warning: `"warning: --run-scripts bypasses trust list — all postinstall scripts will run"`.
8. `--run-scripts` and `--ignore-scripts` are mutually exclusive. Passing both is a CLI error: `"error: --run-scripts and --ignore-scripts cannot be used together"`. Enforced via Clap's `conflicts_with`.
9. **`--json` mode** suppresses interactive prompts (treats as non-interactive).

Non-interactive detection uses `std::io::stdin().is_terminal()` (TTY check), NOT the `CI` environment variable. Docker builds, cron jobs, and piped commands are all non-interactive.

### Pattern Matching

Two pattern types only (no generic glob — trust boundary must be predictable):

- **Exact name:** `esbuild` matches `esbuild` only
- **Scope prefix:** `@vertz/*` matches any `@vertz/<name>` package

Patterns match package names only, not versions. Trust applies to all versions of a matched package. A pattern like `prisma*` does NOT match — use exact names or scope wildcards.

Note: `@prisma/*` is needed for scoped packages like `@prisma/client`. The bare name `prisma` only matches the unscoped `prisma` package.

### Behavior During `vertz add`

When a developer explicitly runs `vertz add <package>`, the default prompt flips to `Y` (allow) instead of `N` (skip). The rationale: the developer just asked for this package — they likely want its postinstall to run.

Interactive prompt for `add`:
```
sharp has a postinstall script: node install/libvips.js

Allow and trust? [Y/n]
```

Note: `A` (trust all remaining) is omitted for `add` since it typically adds one package at a time. If the user answers `Y`, the script runs but is NOT auto-added to `.vertzrc` — use `a` for that (same as `install` prompt). Non-interactive `add` defaults to running the script (not skipping).

### Script Policy Model

The `install()` function uses a `ScriptPolicy` enum instead of boolean flags:

```rust
enum ScriptPolicy {
    TrustBased,   // Default — filter by .vertzrc trust list
    IgnoreAll,    // --ignore-scripts
    RunAll,       // --run-scripts
}
```

`add()` passes `ScriptPolicy::TrustBased` with an additional `is_add: bool` context flag so the trust filter can flip the default prompt.

## Manifesto Alignment

- **Principle: Safe by default** — Untrusted scripts are blocked by default in CI. The interactive prompt in TTY mode puts the developer in control.
- **Principle: Explicit over implicit** — Trust must be explicitly configured. No magic allowlist.
- **Principle: Fast** — Checking patterns is O(n×m) where n=packages with scripts, m=patterns. Negligible cost.

## Non-Goals

- **Per-script trust** — We trust at the package level, not the individual script level.
- **Version-pinned trust** — Trust is name-based because the decision is about the package maintainer, not a specific tarball. Lockfiles handle version pinning.
- **Script content analysis** — That's `vertz audit` territory.
- **Network sandbox** — We don't restrict what trusted scripts can access. Future work.
- **Global trust config** — Trust is project-level (`.vertzrc`), not user-level.
- **Convenience alias** — `vertz trust <pkg>` as shorthand for `vertz config add trust-scripts <pkg>`. Future DX improvement.

## Unknowns

None identified — straightforward feature building on existing `scripts.rs` infrastructure.

## Type Flow Map

No generics involved — this is configuration + string matching + prompting.

## Concurrent Write Safety

`.vertzrc` writes use advisory file locking via the `fs2` crate (`lock_exclusive()` on the file handle). Reads do not acquire locks. The contention window is small (writes are rare and fast), but the lock prevents data loss when concurrent `vertz install` processes write trust list updates (e.g., interactive prompt `A` response writing to `.vertzrc` mid-install).

## Config Infrastructure Note

`.vertzrc` is the canonical Vertz-specific config file. Phase 1 establishes the `.vertzrc` config infrastructure that #2034 (auto-install) and future PM features will reuse. `.vertzrc` was chosen over `package.json#vertz` to keep `package.json` clean of tool-specific config (separation of concerns: `.npmrc` for npm registry compat, `.vertzrc` for Vertz config, `package.json` for the dependency tree). `.vertzrc` should be committed to version control — it is a project-level team decision, not a personal preference file.

## Implementation Plan

### Phase 1: Config Infrastructure + Trust Filtering

**Scope:** `.vertzrc` read/write with file locking, pattern matching, `ScriptPolicy` enum, trust-based script filtering, `--run-scripts` flag, actionable warnings.

1. Add `.vertzrc` config file support (JSON format) with `trustScripts: string[]`
2. Add `load_vertzrc()` and `save_vertzrc()` to config module with `fs2` advisory file locking
3. Add `match_trust_pattern()` — exact name or `@scope/*` matching (no generic glob)
4. Replace `ignore_scripts: bool` in `install()` with `ScriptPolicy` enum (`TrustBased`, `IgnoreAll`, `RunAll`)
5. Add `--run-scripts` flag with `conflicts_with = "ignore_scripts"` in Clap
6. Modify `install()` to partition postinstall packages into `(trusted, untrusted)` tuples
7. Non-interactive mode: skip untrusted, emit actionable warning with `add` fix command
8. `add()` passes `ScriptPolicy::TrustBased` with `is_add: true` context

**Acceptance criteria:**
```rust
describe!("Given a .vertzrc with trustScripts = ['esbuild', '@vertz/*']", {
  describe!("When install runs with esbuild and sharp having postinstall", {
    it!("Then esbuild's postinstall runs");
    it!("Then sharp's postinstall is skipped with warning");
    it!("Then warning includes 'fix: vertz config add trust-scripts sharp'");
  });
});

describe!("Given no .vertzrc file", {
  describe!("When install runs in non-interactive mode", {
    it!("Then all postinstall scripts are skipped with warnings");
    it!("Then fix command lists all skipped packages");
  });
});

describe!("Given --ignore-scripts flag", {
  describe!("When install runs", {
    it!("Then no postinstall scripts run regardless of trust list");
  });
});

describe!("Given --run-scripts flag", {
  describe!("When install runs with untrusted packages", {
    it!("Then all postinstall scripts run (trust list ignored)");
  });
});
```

### Phase 2: CLI Config Commands + Interactive Prompt

**Scope:** `vertz config set/add/remove/get/init trust-scripts`, interactive TTY prompt.

1. Add `Command::Config` to CLI with subcommands `set`, `add`, `remove`, `get`, `init`
2. Implement config subcommand handlers
3. `set` prints removed entries when replacing (destructive action visibility)
4. `init` scans lockfile for packages with postinstall, generates trust list
5. Add interactive prompt using `tokio::task::spawn_blocking` for stdin reading
6. Prompt response `A` (trust All remaining) for batch approval
7. TTY detection via `std::io::stdin().is_terminal()`

**Acceptance criteria:**
```rust
describe!("Given vertz config set trust-scripts esbuild prisma", {
  it!("Then .vertzrc contains trustScripts: ['esbuild', 'prisma']");
});

describe!("Given existing trustScripts and vertz config set trust-scripts esbuild", {
  it!("Then prints 'removed: prisma' for entries that were dropped");
});

describe!("Given vertz config add trust-scripts sharp", {
  it!("Then .vertzrc trustScripts gains 'sharp' without losing existing entries");
});

describe!("Given vertz config init trust-scripts with packages having postinstall", {
  it!("Then .vertzrc trustScripts contains all packages with postinstall scripts");
});

describe!("Given interactive TTY with untrusted package", {
  describe!("When user responds 'A' (trust all)", {
    it!("Then all remaining untrusted scripts run");
    it!("Then all are added to .vertzrc trustScripts");
  });
});
```

## E2E Acceptance Test

```
Developer has a project with esbuild (postinstall: "node install.js") and sharp (postinstall: "node install/libvips.js").

Migration path:
1. Developer upgrades vertz. No .vertzrc exists.
2. `vertz install` in CI: both scripts skipped with warnings + fix command
3. Developer runs `vertz config init trust-scripts` → .vertzrc created with both packages
4. `vertz install` in CI: both scripts run (trusted)

Normal workflow:
1. `vertz config set trust-scripts esbuild`
2. `vertz install` → esbuild runs, sharp skipped with warning
3. `vertz config add trust-scripts sharp`
4. Delete node_modules, `vertz install` → both run

Emergency override:
1. `vertz install --run-scripts` → all scripts run, trust list ignored
```
