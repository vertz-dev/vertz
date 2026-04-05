# Phase 1: Font Fallback Extraction

## Context

Port the font fallback metric extraction from `@vertz/ui-server` (Bun/TS) to the Rust runtime (`vtz`). The Rust runtime currently calls `ssrRenderSinglePass()` without `fallbackMetrics`, so pages suffer CLS. After this phase, `vtz dev` produces zero-CLS font loading identical to the Bun server.

Design doc: `plans/2054-font-fallback-ssr.md`

## Expected Metric Values (from TS implementation)

These are the canonical values the Rust implementation must match exactly:

| Font | Fallback | ascentOverride | descentOverride | lineGapOverride | sizeAdjust |
|------|----------|---------------|-----------------|-----------------|------------|
| DM Sans | Arial | 92.97% | 29.05% | 0.00% | 106.70% |
| DM Serif Display | Times New Roman | 92.89% | 30.04% | 0.00% | 111.53% |
| JetBrains Mono | Courier New | 102.02% | 30.00% | 0.00% | 99.98% |

Font fixtures: `packages/landing/public/fonts/` (dm-sans-latin.woff2, dm-serif-display-latin.woff2, jetbrains-mono-latin.woff2)

## Tasks

### Task 1: Core font metrics module — types, system fonts, detect fallback

**Files:** (3)
- `native/vtz/src/ssr/font_fallback.rs` (new)
- `native/vtz/src/ssr/mod.rs` (modify — add `pub mod font_fallback;`)
- `native/vtz/Cargo.toml` (modify — add `skrifa` dependency)

**What to implement:**

1. Add `skrifa` crate to `vtz/Cargo.toml` dependencies
2. Create `font_fallback.rs` with:
   - `FontMetrics` struct (ascent, descent, line_gap, units_per_em, x_width_avg)
   - `FallbackOverrides` struct with `#[serde(rename_all = "camelCase")]`
   - `FontDescriptorInfo` struct with `#[serde(rename_all = "camelCase")]`
   - `AdjustFallback` enum with custom Deserialize impl (bool | string)
   - `FontFallbackError` error type (using `thiserror`)
   - System font metrics constants (Arial, Times New Roman, Courier New) — hardcoded, matching `font-metrics.ts` lines 27-49
   - `detect_fallback_font(fallback: &[String]) -> &'static str` — scan for generic CSS keywords
   - `format_percent(value: f64) -> String` — format as "XX.XX%"
   - `compute_fallback_overrides(metrics: &FontMetrics, fallback_font: &str) -> FallbackOverrides` — same formulas as TS lines 80-109

3. Register module in `ssr/mod.rs`

**Acceptance criteria:**
- [ ] `detect_fallback_font` returns Arial for `["system-ui", "sans-serif"]`
- [ ] `detect_fallback_font` returns Times New Roman for `["Georgia", "serif"]`
- [ ] `detect_fallback_font` returns Courier New for `["monospace"]`
- [ ] `detect_fallback_font` returns Arial for empty array
- [ ] `detect_fallback_font` skips non-generic entries
- [ ] `compute_fallback_overrides` produces correct percentage strings given known input metrics
- [ ] `format_percent(0.9452)` returns `"94.52%"`
- [ ] `FallbackOverrides` serializes to camelCase JSON keys
- [ ] `FontDescriptorInfo` deserializes from camelCase JSON keys
- [ ] `AdjustFallback` deserializes from `true`, `false`, and `"Arial"` correctly
- [ ] Crate compiles with `cargo check`

---

### Task 2: woff2 metric extraction with weighted xWidthAvg

**Files:** (2)
- `native/vtz/src/ssr/font_fallback.rs` (modify)
- `native/vtz/tests/fixtures/fonts/` (new directory — symlink or copy test fonts)

**What to implement:**

1. Add the Latin character frequency table (82 entries, from `@capsizecss/unpack`):
   ```
   (' ', 0.154), ('e', 0.0922), ('t', 0.0672), ('a', 0.0668), ...
   ```

2. `extract_woff2_metrics(path: &Path) -> Result<FontMetrics, FontFallbackError>`:
   - Read file bytes with `std::fs::read`
   - Parse with `skrifa::FontRef::from_index(&data, 0)`
   - Read OS/2 table: `s_typo_ascender()`, `s_typo_descender()`, `s_typo_line_gap()`
   - Read head table: `units_per_em()`
   - Compute weighted xWidthAvg:
     a. Get cmap table for character → glyph ID mapping
     b. Get hmtx table for glyph advance widths
     c. For each (char, weight) in LATIN_CHAR_WEIGHTS:
        - Map char to glyph ID via cmap
        - Read glyph advance width from hmtx
        - If glyph not found, fall back to OS/2 xAvgCharWidth
        - Multiply advance width by weight
     d. Sum all weighted widths, round to i16
   - Return `FontMetrics`

3. `resolve_font_path(url_path: &str, root_dir: &Path) -> Option<PathBuf>`:
   - If absolute path, check existence directly
   - Strip leading `/`, try `root_dir.join(stripped)`
   - Try `root_dir.join("public").join(stripped)`

4. Copy font test fixtures: symlink `packages/landing/public/fonts/*.woff2` into `native/vtz/tests/fixtures/fonts/`

**Acceptance criteria:**
- [ ] DM Sans metrics: ascentOverride=92.97%, descentOverride=29.05%, lineGapOverride=0.00%, sizeAdjust=106.70% (with Arial fallback)
- [ ] DM Serif Display metrics: ascentOverride=92.89%, descentOverride=30.04%, lineGapOverride=0.00%, sizeAdjust=111.53% (with Times New Roman fallback)
- [ ] JetBrains Mono metrics: ascentOverride=102.02%, descentOverride=30.00%, lineGapOverride=0.00%, sizeAdjust=99.98% (with Courier New fallback)
- [ ] Corrupt font file returns `Err`, no panic
- [ ] Missing font file returns `Err`, no panic
- [ ] `resolve_font_path("/fonts/dm-sans.woff2", root)` finds `root/public/fonts/dm-sans.woff2`
- [ ] `resolve_font_path` handles absolute paths

---

### Task 3: extract_all_font_metrics and full pipeline

**Files:** (1)
- `native/vtz/src/ssr/font_fallback.rs` (modify)

**What to implement:**

1. `extract_all_font_metrics(descriptors: &[FontDescriptorInfo], root_dir: &Path) -> HashMap<String, FallbackOverrides>`:
   - For each descriptor:
     - Skip if `adjust_font_fallback` is `Disabled`
     - Skip if src_path doesn't end with `.woff2`
     - Resolve font path via `resolve_font_path`
     - Extract metrics via `extract_woff2_metrics`
     - Determine fallback font: explicit > auto-detect from fallback stack
     - Compute overrides
     - On error: log warning with `[vertz]` prefix, continue to next font
   - Return HashMap of key → overrides

**Acceptance criteria:**
- [ ] Multiple fonts processed in one call, each with correct fallback font
- [ ] `adjustFontFallback: false` (Disabled) skips the font
- [ ] `adjustFontFallback: "Arial"` (Explicit) overrides auto-detection
- [ ] Missing font file logs warning with `[vertz]` prefix, continues processing
- [ ] Non-.woff2 src paths are skipped
- [ ] Empty descriptors list returns empty HashMap

---

### Task 4: V8 integration — extract descriptors, store metrics, pass to SSR

**Files:** (2)
- `native/vtz/src/runtime/persistent_isolate.rs` (modify)
- `native/vtz/src/ssr/font_fallback.rs` (modify — add `extract_font_descriptors_js` helper)

**What to implement:**

1. Add a JS snippet constant `EXTRACT_FONT_DESCRIPTORS_JS` that reads `globalThis.__vertz_app_module.theme.fonts` and returns JSON array of `{ key, family, srcPath, fallback, adjustFontFallback }`.

2. In `persistent_isolate.rs`, after the SSR module is loaded and `__vertz_app_module` is set:
   - Execute `EXTRACT_FONT_DESCRIPTORS_JS` to get font descriptors
   - Parse JSON into `Vec<FontDescriptorInfo>`
   - Call `extract_all_font_metrics(&descriptors, &root_dir)`
   - If metrics is non-empty, serialize to JSON and set as `globalThis.__vertz_font_fallback_metrics`
   - Log `[vertz] Extracted font fallback metrics for N font(s)`

3. Modify `SSR_RENDER_FRAMEWORK_JS` to add:
   ```javascript
   if (globalThis.__vertz_font_fallback_metrics) {
       options.fallbackMetrics = globalThis.__vertz_font_fallback_metrics;
   }
   ```

**Acceptance criteria:**
- [ ] Font descriptors are extracted from JS after module init
- [ ] Metrics are computed and stored as `globalThis.__vertz_font_fallback_metrics`
- [ ] JSON keys are camelCase (ascentOverride, not ascent_override)
- [ ] `SSR_RENDER_FRAMEWORK_JS` passes `fallbackMetrics` in options
- [ ] Apps without theme/fonts don't error (empty array → no metrics stored)
- [ ] Apps with fonts produce fallback `@font-face` CSS in SSR HTML response
- [ ] Cargo test passes
- [ ] Cargo clippy passes with no warnings
- [ ] Cargo fmt check passes
