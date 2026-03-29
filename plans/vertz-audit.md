# Design: `vertz audit` — Vulnerability Scanning

**Issue:** #2036
**Status:** Draft — Rev 4
**Author:** viniciusdacal

---

## API Surface

### CLI Interface

```bash
# Scan all installed packages for known vulnerabilities
vertz audit

# Machine-readable NDJSON output
vertz audit --json

# Attempt to update vulnerable packages to patched versions
vertz audit --fix

# Preview what --fix would change without modifying anything
vertz audit --fix --dry-run

# Show only vulnerabilities at or above a severity threshold
vertz audit --severity high    # critical, high, moderate, low (default: low — show all)
```

### Text Output (human-readable)

Status messages go to **stderr**, structured data (table) to **stdout** — consistent with existing PM commands (`outdated`, `list`).

```
# stderr:
Scanning 142 packages for vulnerabilities...

# stdout:
┌──────────┬──────────┬──────────┬───────────┬──────────────────────────────────┐
│ Severity │ Package  │ Version  │ Patched   │ Title                            │
├──────────┼──────────┼──────────┼───────────┼──────────────────────────────────┤
│ critical │ lodash   │ 4.17.15  │ >=4.17.21 │ Prototype Pollution              │
│          │ (direct) │          │           │ https://github.com/advisories/…  │
│ high     │ axios    │ 0.21.1   │ >=0.21.2  │ Server-Side Request Forgery      │
│          │ (direct) │          │           │ https://github.com/advisories/…  │
│ moderate │ tar      │ 6.1.0    │ >=6.1.9   │ Arbitrary File Overwrite         │
│          │ via npm  │          │           │ https://github.com/advisories/…  │
└──────────┴──────────┴──────────┴───────────┴──────────────────────────────────┘

# stderr:
3 vulnerabilities found (1 critical, 1 high, 1 moderate)
```

Each advisory URL is shown on a second line under the title. This keeps the table scannable while providing the link developers need to understand the advisory.

When `--severity` filters out results, the summary shows the excluded count:

```
# stderr (with --severity high):
2 vulnerabilities found (1 critical, 1 high). 1 below threshold not shown.
```

When no vulnerabilities are found:

```
# stderr:
Scanning 142 packages for vulnerabilities...
No vulnerabilities found.
```

### NDJSON Output (`--json`)

One JSON object per line, consistent with existing PM NDJSON pattern:

```jsonl
{"event":"audit_start","packages":142}
{"event":"advisory","name":"lodash","version":"4.17.15","severity":"critical","title":"Prototype Pollution","url":"https://github.com/advisories/GHSA-xxxx","patched":">=4.17.21","id":1234,"parent":null}
{"event":"advisory","name":"tar","version":"6.1.0","severity":"high","title":"Arbitrary File Overwrite","url":"https://github.com/advisories/GHSA-yyyy","patched":">=6.1.9","id":5678,"parent":"npm"}
{"event":"audit_complete","vulnerabilities":2,"critical":1,"high":1,"moderate":0,"low":0}
```

The `parent` field is `null` for direct dependencies, or the name of the direct dependency that transitively requires the vulnerable package.

### Exit Codes

| Exit code | Meaning |
|-----------|---------|
| 0 | No vulnerabilities found (at or above `--severity` threshold) |
| 1 | Vulnerabilities found OR error (network failure, no lockfile, etc.) |

Exit code 1 for both "vulnerabilities found" and "error" — consistent with the rest of the PM codebase (`outdated`, `install`, etc.) where only exit codes 0 and 1 are used. Errors are distinguishable via stderr messages and `--json` error events.

**`--severity` interaction with exit code:** When `--severity high` is specified, exit code is 0 if no vulnerabilities at or above "high" exist — even if lower-severity vulnerabilities are present. The summary line shows the filtered-out count: `"1 vulnerability found (1 critical). 3 below threshold not shown."`

### `--fix` Behavior

`vertz audit --fix` runs the audit, then for each vulnerability with a known patched version:

1. Determines if updating the package to the patched version is semver-compatible with the declared range
2. If compatible: updates the lockfile and reinstalls
3. If incompatible: reports it as "requires manual update" with the breaking version range

**`--fix` + `--severity` interaction:** `--severity` filters both what is displayed AND what is fixed. `vertz audit --fix --severity high` only fixes vulnerabilities at or above "high" — it does not silently fix lower-severity vulnerabilities that the user filtered out. Exit code reflects the filtered view (exit 0 if no vulns at or above threshold remain after fixing).

**`--fix` + `--dry-run`:** Shows what would be fixed without modifying the lockfile or reinstalling. Uses the same resolution logic to determine compatible patched versions.

**Multiple advisories for same package:** When a package has multiple advisories (e.g., lodash with 3 CVEs patched at `>=4.17.19`, `>=4.17.20`, `>=4.17.21`), `--fix` uses the strictest (highest minimum) patched version to resolve all advisories at once.

```
Scanning 142 packages for vulnerabilities...

3 vulnerabilities found (1 critical, 1 high, 1 moderate)

Fixed 2 vulnerabilities:
  lodash 4.17.15 → 4.17.21
  axios 0.21.1 → 0.21.2

1 vulnerability requires manual update:
  express 3.21.2 → 4.18.2 (range ^3.0.0 does not include >=4.18.2)
    Run: vertz add express@^4.18.2
```

NDJSON for `--fix`:

```jsonl
{"event":"fix_applied","name":"lodash","from":"4.17.15","to":"4.17.21"}
{"event":"fix_manual","name":"express","from":"3.21.2","patched":">=4.18.2","range":"^3.0.0","reason":"patched version outside declared range","suggestion":"vertz add express@^4.18.2"}
{"event":"audit_fix_complete","fixed":2,"manual":1}
```

---

## Data Source: npm Advisory API

The npm registry exposes a bulk advisory endpoint:

```
POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk
Content-Type: application/json

{
  "lodash": ["4.17.15"],
  "axios": ["0.21.1"],
  "tar": ["6.1.0"]
}
```

Response:

```json
{
  "lodash": [
    {
      "id": 1234,
      "title": "Prototype Pollution",
      "severity": "critical",
      "url": "https://github.com/advisories/GHSA-xxxx",
      "vulnerable_versions": "<4.17.21",
      "patched_versions": ">=4.17.21"
    }
  ]
}
```

This endpoint:
- Accepts a map of `package_name → [versions]`
- Returns only advisories that affect the specified versions
- Is the same endpoint used by `npm audit`
- No authentication required for public packages
- Rate-limited but generous (same as registry metadata)

### Batch Size & Concurrency

The npm bulk endpoint has no documented limit, but large payloads may be rejected. We batch into chunks of **100 packages** per request to stay safe, and run batches concurrently (up to 4 concurrent requests — lower than the registry metadata concurrency since advisory payloads are larger).

**Concurrency control:** Advisory batch concurrency is enforced at the orchestration layer via `buffer_unordered(4)` in `audit()`, NOT via the `RegistryClient` semaphore (which gates metadata fetches at 16 permits). This follows the same pattern as `outdated()` which uses `buffer_unordered(16)` at the call site.

**Deduplication:** The lockfile may contain multiple entries for the same package at the same version (e.g., `lodash@^4.17.0` and `lodash@~4.17.15` both resolving to `4.17.15`). The bulk request is built from unique `(name, version)` pairs. Advisory results are then fanned back out to all affected lockfile entries.

**ETag caching:** NOT applicable to advisory POST requests. The response varies by request body, so the `RegistryClient`'s ETag caching is not used for this endpoint.

### Partial Failure

If some batches succeed and others fail (HTTP 500, 429, timeout):
- Advisory POST requests are retried with the same retry logic as metadata fetches (3 retries, exponential backoff). POST retries are safe here since the endpoint is idempotent (read-only query).
- On partial failure after retries: report found vulnerabilities + emit a warning about unreachable batches. Do NOT treat partial failure as an error exit — return exit code 1 if vulns were found in successful batches, with a warning about incomplete results.
- NDJSON emits `{"event":"batch_error","batch":2,"error":"HTTP 500"}` for failed batches.

---

## Manifesto Alignment

### Principle 1: "If it builds, it works"
Audit doesn't change build behavior. It's a post-install validation step — consistent with the principle by surfacing problems early (before deploy, not at runtime).

### Principle 2: "One way to do things"
Single command: `vertz audit`. No plugins, no third-party tools. One way to check vulnerabilities. Output format matches existing PM commands (`--json` for NDJSON, text for humans).

### Principle 3: "AI agents are first-class users"
`--json` produces structured NDJSON that agents can parse reliably. Exit codes are unambiguous. An agent can run `vertz audit --json`, parse the output, and decide whether to run `--fix` or escalate.

### Principle 7: "Performance is not optional"
Bulk API (one request per batch, not per-package). Concurrent batch requests. Lockfile-based — reads installed versions from `vertz.lock` without scanning `node_modules`.

### Principle 8: "No ceilings"
We own the audit implementation. If npm's advisory API is insufficient (coverage gaps, latency), we can add alternative data sources (GitHub Advisory Database, OSV) later without changing the user-facing API.

---

## Non-Goals

1. **License auditing** — checking license compatibility is a separate concern, not vulnerability scanning
2. **SBOM generation** — Software Bill of Materials is useful but orthogonal
3. **Continuous monitoring / webhooks** — audit is a point-in-time scan, not a daemon
4. **Custom advisory databases** — v1 uses npm's advisory API only. Extensibility can come later.
5. **Full transitive dependency path display** — we show which package@version is vulnerable and its direct dependency parent (for actionability), but NOT the full dependency chain. `vertz why <pkg>` provides the complete path.
6. **`--audit-level` in `vertz install`** — auto-audit during install is a separate feature
7. **Workspace-aware audit** — scanning across workspace packages is future work; v1 audits the root lockfile which already includes workspace deps

---

## Unknowns

1. **npm bulk advisory endpoint reliability** — The endpoint is undocumented but stable (used by npm CLI for years). Risk: npm could change/deprecate it.
   - **Resolution:** Accept the risk. npm CLI depends on it, so it's unlikely to disappear. If it does, we migrate to GitHub Advisory Database (GraphQL API) or OSV.dev (REST API). Note: these fallback sources have different characteristics — GitHub Advisory DB requires authentication beyond 60 req/hour (unauthenticated), and OSV.dev has a different schema and potentially different npm coverage. Migration would require design work, not just a URL swap.

2. **Private registry advisory support** — Private npm registries (Artifactory, Verdaccio) may not support `/-/npm/v1/security/advisories/bulk`.
   - **Resolution:** Defer. For v1, we always query the public npm registry for advisories, regardless of which registry the package was fetched from. This matches what npm/yarn/pnpm do.

---

## POC Results

No POC needed. The npm bulk advisory API is well-understood — it's the same endpoint used by `npm audit`. Our existing `RegistryClient` already handles npm registry requests with retries, ETag caching, and concurrency control. The audit module follows the same pattern as `outdated` (read lockfile → query registry → format results).

---

## Type Flow Map

No generics in public API. This is a CLI command with Rust-internal types:

```
vertz.lock → LockfileEntry{name, version, dependencies}
           → deduplicate (name, version) pairs, skip link: entries
           → BulkAdvisoryRequest{name → [version]}
           → POST registry/-/npm/v1/security/advisories/bulk (batched, buffer_unordered(4))
           → BulkAdvisoryResponse{name → [Advisory{id: u64, title, severity, url, vulnerable_versions, patched_versions}]}
           → fan out to all affected LockfileEntry instances
           → resolve parent: reverse-lookup direct dep that pulls in transitive
           → AuditEntry{name, version, severity, title, url, patched, id: u64, parent: Option<String>}
           → filter by --severity threshold
           → format_audit_text() / format_audit_json()
```

All types are concrete structs — no generics to trace.

---

## E2E Acceptance Test

### Happy path: vulnerabilities found

```rust
// Given a project with lodash@4.17.15 in vertz.lock (known vulnerable version)
// When running `vertz audit`
// Then exit code is 1
// And stderr contains "vulnerabilities found"
// And stdout (text mode) contains a table with severity, package, version, patched

// Given the same project
// When running `vertz audit --json`
// Then exit code is 1
// And stdout contains NDJSON lines with event:"advisory" for each vulnerability
// And the last line has event:"audit_complete" with vulnerability counts
```

### Happy path: no vulnerabilities

```rust
// Given a project with only zod@3.24.4 in vertz.lock (no known vulnerabilities)
// When running `vertz audit`
// Then exit code is 0
// And stderr contains "No vulnerabilities found"
```

### `--fix` with semver-compatible patch

```rust
// Given a project with lodash@4.17.15 (range: ^4.17.0, patched: >=4.17.21)
// When running `vertz audit --fix`
// Then lodash is updated to 4.17.21 in vertz.lock
// And exit code is 0 (all vulnerabilities fixed)
// And stderr contains "Fixed 1 vulnerability"
```

### `--fix` with semver-incompatible patch

```rust
// Given a project with express@3.21.2 (range: ^3.0.0, patched: >=4.18.2)
// When running `vertz audit --fix`
// Then express is NOT updated (range doesn't include 4.18.2)
// And exit code is 1 (unfixed vulnerabilities remain)
// And stderr contains "requires manual update"
```

### `--severity` filter

```rust
// Given a project with 1 critical and 2 moderate vulnerabilities
// When running `vertz audit --severity high`
// Then only the critical vulnerability is shown (moderate is below threshold)
// And exit code is 1 (critical is at or above "high")
// And summary includes "2 below threshold not shown"
```

### Error: no lockfile

```rust
// Given a project with no vertz.lock
// When running `vertz audit`
// Then exit code is 1
// And stderr contains "no lockfile found"
```

---

## Implementation Plan

### Phase 1: Core Audit with JSON + Severity Filter

Full E2E slice: `vertz audit` reads the lockfile, queries npm's bulk advisory API, displays results in text and NDJSON format, and supports `--severity` filtering. JSON output is included from day one because AI agents need machine-readable output immediately.

**Acceptance Criteria:**

```rust
describe!("Feature: vertz audit basic scan", {
  describe!("Given a lockfile with vulnerable packages", {
    describe!("When running audit()", {
      it!("Then returns AuditEntry list with severity, name, version, title, patched, url, id, parent", {})
      it!("Then sorts entries by severity (critical first, low last)", {})
    })
  })

  describe!("Given a lockfile with no vulnerable packages", {
    describe!("When running audit()", {
      it!("Then returns empty AuditEntry list", {})
    })
  })

  describe!("Given no lockfile exists", {
    describe!("When running audit()", {
      it!("Then returns an error with 'no lockfile found'", {})
    })
  })

  describe!("Given the advisory API returns an error", {
    describe!("When running audit()", {
      it!("Then returns an error with the API error message", {})
    })
  })
})

describe!("Feature: vertz audit text formatting", {
  describe!("Given vulnerabilities exist", {
    describe!("When formatting as text", {
      it!("Then renders a table with Severity, Package, Version, Patched, Title columns", {})
      it!("Then shows summary line with total and per-severity counts", {})
    })
  })

  describe!("Given no vulnerabilities", {
    describe!("When formatting as text", {
      it!("Then shows 'No vulnerabilities found.'", {})
    })
  })
})

describe!("Feature: vertz audit --json", {
  describe!("Given vulnerabilities exist", {
    describe!("When running audit with json=true", {
      it!("Then emits audit_start event with package count", {})
      it!("Then emits one advisory event per vulnerability with all fields", {})
      it!("Then emits audit_complete event with severity counts", {})
    })
  })
})

describe!("Feature: vertz audit --severity", {
  describe!("Given critical, high, and moderate vulnerabilities", {
    describe!("When running audit with severity=high", {
      it!("Then only critical and high are returned", {})
      it!("Then summary counts reflect filtered results", {})
      it!("Then summary shows count of below-threshold vulns not shown", {})
    })
  })

  describe!("Given only low vulnerabilities", {
    describe!("When running audit with severity=high", {
      it!("Then returns empty list (no vulns at or above threshold)", {})
      it!("Then exit code is 0", {})
    })
  })
})
```

**Implementation:**

1. Add `AuditEntry`, `Advisory`, `Severity` types to `pm/types.rs`. `AuditEntry` includes `parent: Option<String>` for the direct dependency that pulls in the vulnerable transitive dep. Advisory `id` field uses `u64`.
2. Add `fetch_advisories_bulk()` to `pm/registry.rs` — POST to `/-/npm/v1/security/advisories/bulk` with batching (100 per request). No ETag caching (POST, body-dependent). Retry with same logic as metadata fetches (3 retries, exponential backoff — safe since endpoint is idempotent).
3. Add `audit()` function to `pm/mod.rs` — orchestrates lockfile read → deduplicate `(name, version)` pairs → batch → query via `buffer_unordered(4)` → fan results back to all affected entries → filter → sort. Skip `link:` entries (workspace packages).
4. Add `format_audit_text()` and `format_audit_json()` formatters. Text table includes direct dependency parent. Summary line shows below-threshold count when `--severity` filters results.
5. Add `AuditArgs` to `cli.rs` (with `--json` and `--severity` flags, `Severity` as `#[arg(value_enum)]`) and wire up `Command::Audit` in `main.rs`
6. Exit code: 0 (clean at or above threshold), 1 (vulns found or error)
7. Severity ordering: critical > high > moderate > low
8. `--severity` filtering: only show vulns at or above the threshold; exit code reflects filtered view

### Phase 2: `--fix` (Auto-Update Vulnerable Packages)

Attempt to update vulnerable packages to their patched versions when semver-compatible.

**Depends on:** Phase 1 (audit results), existing resolve + link pipeline

**Acceptance Criteria:**

```rust
describe!("Feature: vertz audit --fix", {
  describe!("Given a vulnerable package with a semver-compatible patch", {
    describe!("When running audit with fix=true", {
      it!("Then updates the package version in vertz.lock", {})
      it!("Then reports the fix in output", {})
      it!("Then exit code is 0 when all vulns are fixed", {})
    })
  })

  describe!("Given a vulnerable package with a semver-incompatible patch", {
    describe!("When running audit with fix=true", {
      it!("Then does NOT update the package", {})
      it!("Then reports it as 'requires manual update' with suggested command", {})
      it!("Then exit code is 1 (unfixed vulns remain)", {})
    })
  })

  describe!("Given mixed: some fixable, some not", {
    describe!("When running audit with fix=true", {
      it!("Then fixes compatible packages and reports incompatible ones", {})
      it!("Then exit code is 1 (some vulns unfixed)", {})
    })
  })
})
```

**Implementation:**

1. For each advisory with `patched_versions`, parse `patched_versions` as a `node_semver::Range`. When a package has multiple advisories, compute the intersection (strictest/highest minimum patched version).
2. Fetch the package's version list from the registry (via `fetch_metadata_abbreviated`). Find the highest version that satisfies BOTH the declared range in `package.json` AND the patched range.
3. If found: update lockfile entry to that version, re-link via the existing linker.
4. If no version satisfies both ranges: add to "manual" list with a suggested `vertz add <pkg>@<patched>` command.
5. When `--severity` is specified, only fix vulnerabilities at or above the threshold.
6. Report results in text/NDJSON format.

**No re-audit after fix.** The fix is deterministic: if a version satisfying both ranges was found and installed, the advisory is resolved by definition. Users can run `vertz audit` again manually to verify.

**Note:** We do NOT reuse `update()` directly — it re-resolves all packages and doesn't support targeted version constraints. Instead, we re-resolve individual packages with a dual-range constraint and use the existing `linker` to relink.

---

## Phase Dependencies

```
Phase 1 (core audit + json + severity) → Phase 2 (fix)
```

Linear — Phase 2 builds on Phase 1. No parallelism needed.

---

## Developer Walkthrough

```bash
# Developer installs deps
vertz install

# Check for vulnerabilities
vertz audit
# Output: table with 3 vulnerabilities (1 critical, 1 high, 1 moderate)
# Exit code: 1

# CI pipeline — machine-readable
vertz audit --json
# Output: NDJSON events, parseable by agents

# Only care about critical/high
vertz audit --severity high
# Output: filtered to 2 vulnerabilities, summary shows "1 below threshold not shown"

# Auto-fix what's possible
vertz audit --fix
# Output: "Fixed 2 vulnerabilities. 1 requires manual update."
# Exit code: 1 (still has unfixed vuln)

# After manually updating package.json for the remaining one
vertz audit
# Output: "No vulnerabilities found."
# Exit code: 0
```
