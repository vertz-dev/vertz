# Phase 1: Font Fallback Extraction

- **Author:** Implementation agent
- **Reviewer:** Adversarial review agent (Claude Opus 4.6)
- **Commits:** current branch HEAD
- **Date:** 2026-04-04

## Changed Files

- `native/vtz/src/ssr/font_fallback.rs` (new)
- `native/vtz/src/ssr/mod.rs` (modified — 1 line added)
- `native/vtz/Cargo.toml` (modified — 3 dependencies added)
- `native/vtz/src/runtime/persistent_isolate.rs` (modified — ~85 lines added)
- `plans/2054-font-fallback-ssr.md` (new)
- `plans/2054-font-fallback-ssr/phase-01-font-fallback.md` (new)

## CI Status

- [x] Quality gates passed (cargo test --all: 4057 tests, cargo clippy clean, cargo fmt clean)
- [x] All 31 font_fallback unit tests pass
- [x] Parity tests match TS implementation values (DM Sans, DM Serif Display, JetBrains Mono)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests alongside implementation)
- [x] Type flow verified (Rust structs to JSON to V8 global to SSR options)
- [x] Quality gates clean (test + clippy + fmt)
- [ ] No security issues (see Finding 2)
- [ ] JS snippet matches design doc API (see Finding 1)
- [x] Public API matches design doc

## Findings

### BLOCKER: Finding 1 — `EXTRACT_FONT_DESCRIPTORS_JS` does not handle array `src` field

**File:** `native/vtz/src/runtime/persistent_isolate.rs`, line 1018

**Problem:** The JS snippet that extracts font descriptors from the app module uses:

```javascript
srcPath: f.src || '',
```

The `FontDescriptor.src` field in `@vertz/ui` is typed as `string | FontSrc[]` (see `packages/ui/src/css/font.ts:83`). When `src` is an array (e.g., multiple weight/style variants), `f.src || ''` evaluates to the array (arrays are truthy), and `JSON.stringify` will serialize `srcPath` as a JSON array. The Rust side then tries to deserialize this as a `String`, which will fail with a serde error. The entire font descriptor extraction would fail for that font.

The design doc correctly specified:

```javascript
srcPath: typeof d.src === 'string' ? d.src : d.src?.[0]?.path || null,
```

The TS implementation (`font-metrics.ts:114-121`) also correctly handles this via `getPrimarySrcPath()`, which extracts the first `path` from an array src.

**Impact:** Any app using array-form `src` (e.g., separate files per weight/style) will fail to get font fallback metrics. The error is caught and logged, so it won't crash, but the feature silently degrades.

**Fix:** Change line 1018 to:

```javascript
srcPath: typeof f.src === 'string' ? f.src : (Array.isArray(f.src) && f.src[0] ? f.src[0].path || '' : ''),
```

---

### SHOULD-FIX: Finding 2 — No path traversal guard in `resolve_font_path`

**File:** `native/vtz/src/ssr/font_fallback.rs`, lines 380-404

**Problem:** The `resolve_font_path` function joins user-provided URL paths directly onto `root_dir` without checking for `..` components. A path like `/../../../etc/passwd` would resolve to a file outside the project root. The absolute-path branch also accepts any absolute path without validating it's within the project.

**Mitigating factors:** The data comes from the developer's own theme module (`globalThis.__vertz_app_module.theme.fonts`), not from user input. This is a local dev server, not a production endpoint. The function only reads files (no writes/deletes).

**Fix:** Add a canonicalization check after joining:

```rust
let resolved = root_dir.join(stripped);
let canonical = resolved.canonicalize().ok()?;
let root_canonical = root_dir.canonicalize().ok()?;
if !canonical.starts_with(&root_canonical) {
    return None;
}
```

Or at minimum, reject paths containing `..` components.

---

### SHOULD-FIX: Finding 3 — Division by zero produces invalid CSS for degenerate fonts

**File:** `native/vtz/src/ssr/font_fallback.rs`, lines 256-263

**Problem:** If a font has `units_per_em = 0` (corrupt but parseable font) or `x_width_avg = 0`, the division at line 256 or 258 produces `NaN` or `Infinity`. `format!("{:.2}%", NaN * 100.0)` produces `"NaN%"` and `format!("{:.2}%", Infinity * 100.0)` produces `"inf%"`. These strings would be injected into the V8 global and ultimately into CSS `@font-face` declarations, producing invalid CSS.

**Impact:** Low probability (requires a corrupt-but-parseable font), but if triggered, the invalid CSS could cause browser parsing errors that affect other font declarations.

**Fix:** Add a guard at the top of `compute_fallback_overrides`:

```rust
if metrics.units_per_em == 0 || metrics.x_width_avg == 0 {
    // Degenerate font — return safe defaults that produce no visual shift
    return FallbackOverrides {
        ascent_override: "100.00%".to_string(),
        descent_override: "0.00%".to_string(),
        line_gap_override: "0.00%".to_string(),
        size_adjust: "100.00%".to_string(),
        fallback_font: fallback_font.to_string(),
    };
}
```

---

### SHOULD-FIX: Finding 4 — Integration tests silently skip when fixtures are missing

**File:** `native/vtz/src/ssr/font_fallback.rs`, lines 660-708 and 804-864

**Problem:** Six tests use `if !path.exists() { eprintln!("Skipping..."); return; }` to silently skip when font fixture files are missing. These are the parity tests that validate exact metric values. If the fixture path changes or the landing package is restructured, these tests would silently stop running, and the parity guarantee would be lost. In CI, if the landing package fonts are not present, all parity tests are silently skipped.

**Impact:** The most critical tests (exact-value parity with the TS implementation) could silently stop running without anyone noticing.

**Fix:** Either:
1. Copy fixture fonts into `native/vtz/tests/fixtures/fonts/` so they are always available (the phase plan mentioned this in Task 2 but it wasn't done), or
2. Use `#[ignore]` with a message and document that they require font fixtures, so they appear as "ignored" in test output rather than silently passing, or
3. At minimum, panic with a clear message so CI fails loudly if fixtures are missing.

---

### SHOULD-FIX: Finding 5 — Design doc E2E test values are stale

**File:** `plans/2054-font-fallback-ssr.md`, lines 460-464

**Problem:** The design doc's Test 4 asserts `ascent_override: "94.52%"` for DM Sans with Arial fallback, but the actual computed value (verified by passing tests) is `"92.97%"`. The design doc was written before exact values were validated and was never updated. The values "94.52%" appear to be from an older/different font metric or a different formula.

**Impact:** Future developers reading the design doc will be confused about which values are correct. The design doc should be the source of truth.

**Fix:** Update the design doc E2E test values to match the actual computed values:

| Font | Fallback | ascentOverride | descentOverride | lineGapOverride | sizeAdjust |
|------|----------|---------------|-----------------|-----------------|------------|
| DM Sans | Arial | 92.97% | 29.05% | 0.00% | 106.70% |

---

### NIT: Finding 6 — Comment says "87 characters" but table has 81 entries

**File:** `native/vtz/src/ssr/font_fallback.rs`, line 131 (comment block)

The comment references "Latin character frequency tables" but there's no explicit count. The design doc section (line 69 of phase plan) says "82 entries" and the design doc API surface says "87 characters". The actual table has 81 entries with weights summing to ~1.0003. The count doesn't affect correctness (the weights sum correctly), but the documentation is inconsistent.

---

### NIT: Finding 7 — `serde_json::Value::String(s) => s.clone()` allocates unnecessarily

**File:** `native/vtz/src/runtime/persistent_isolate.rs`, lines 565-568

```rust
let raw = match &json_val {
    serde_json::Value::String(s) => s.clone(),
    other => other.to_string(),
};
```

The `s.clone()` creates a new allocation. Since `json_val` is owned and consumed after this match, the code could match on `json_val` (by value) and use `s` directly:

```rust
let raw = match json_val {
    serde_json::Value::String(s) => s,
    other => other.to_string(),
};
```

This avoids one string allocation. Minor optimization, not blocking.

## Summary

**1 BLOCKER, 4 SHOULD-FIX, 2 NIT.**

The core Rust implementation (`font_fallback.rs`) is well-written. The metric extraction algorithm, formula computation, and type serialization all match the TS implementation exactly, as proven by the parity tests. Error handling is thorough with proper `thiserror` usage and graceful degradation.

The critical issue is the **V8 integration JS snippet** (`EXTRACT_FONT_DESCRIPTORS_JS`) which does not handle the `FontSrc[]` case for the `src` field, deviating from the design doc's specification and the TS implementation's `getPrimarySrcPath()` logic. This must be fixed before merge.

## Resolution

Pending. Author needs to address the BLOCKER (Finding 1) and ideally the SHOULD-FIX items before merge.
