# Font Fallback Extraction for SSR — Rust Runtime

**Status:** Draft (Rev 2 — addressing review feedback)
**Issue:** #2054
**Date:** 2026-04-04
**Follows:** `plans/archived/font-fallback-metrics.md` (Bun implementation, complete)

## Problem

The Bun dev server computes font fallback metrics at startup and passes them to `compileFonts()`, which generates adjusted `@font-face` CSS that prevents CLS when web fonts load. The Rust runtime (`vtz`) calls `ssrRenderSinglePass()` but never passes `fallbackMetrics`, so fallback `@font-face` declarations are never generated. Pages served by the Rust runtime suffer layout shift on custom fonts — a DX regression from the Bun server.

**After this change:** Running `vtz dev` produces the same zero-CLS font loading as the Bun server. No user action required.

## API Surface

### User API — zero changes

Users don't change anything. This is an internal runtime capability:

```ts
// This already works. The Rust runtime just needs to extract metrics and pass them through.
const sans = font('DM Sans', {
  weight: '100..1000',
  src: '/fonts/dm-sans.woff2',
  fallback: ['system-ui', 'sans-serif'],
});
```

### Rust — `font_fallback.rs` public API

```rust
/// Metrics extracted from a font file.
///
/// `ascent`, `descent`, `line_gap`, and `units_per_em` are read directly from
/// the OS/2 and head tables. `x_width_avg` is a **weighted average** of glyph
/// advance widths using Latin character frequency tables — matching the
/// algorithm in `@capsizecss/unpack` (NOT the raw OS/2 xAvgCharWidth field).
pub struct FontMetrics {
    pub ascent: i16,
    pub descent: i16,
    pub line_gap: i16,
    pub units_per_em: u16,
    /// Weighted average character width (Latin character frequencies).
    /// Computed by iterating glyphs and weighting by character frequency,
    /// NOT the raw OS/2 xAvgCharWidth field.
    pub x_width_avg: i16,
}

/// Computed CSS fallback overrides for a single font.
///
/// All string fields are pre-formatted percentages (e.g., "94.52%").
/// Field names serialize to camelCase for JS interop.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FallbackOverrides {
    pub ascent_override: String,   // e.g. "94.52%"
    pub descent_override: String,  // e.g. "24.60%"
    pub line_gap_override: String, // e.g. "0.00%"
    pub size_adjust: String,       // e.g. "104.88%"
    /// Must be exactly "Arial", "Times New Roman", or "Courier New".
    pub fallback_font: String,
}

/// A font descriptor extracted from the JS theme module.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontDescriptorInfo {
    pub key: String,
    pub family: String,
    pub src_path: String,
    pub fallback: Vec<String>,
    pub adjust_font_fallback: AdjustFallback,
}

pub enum AdjustFallback {
    Auto,           // true — auto-detect from fallback stack
    Disabled,       // false — skip
    Explicit(String), // "Arial" | "Times New Roman" | "Courier New"
}

/// Latin character frequency weights for xWidthAvg computation.
/// Matches the weightings from @capsizecss/unpack.
/// Key: Unicode code point, Value: frequency weight (sums to ~1.0).
const LATIN_CHAR_WEIGHTS: &[(char, f64)] = &[
    (' ', 0.154), ('e', 0.0922), ('t', 0.0672), ('a', 0.0612),
    // ... full table ported from capsize's weightings
];

/// Extract font metrics from a .woff2 file.
///
/// Reads OS/2, hhea, head tables for ascent/descent/lineGap/unitsPerEm.
/// Computes xWidthAvg as a weighted average of glyph advance widths
/// using Latin character frequency tables (matching @capsizecss/unpack).
pub fn extract_woff2_metrics(path: &Path) -> Result<FontMetrics, FontFallbackError>;

/// Detect which system font to use based on the CSS fallback stack.
///
/// Scans for generic CSS keywords:
/// - "sans-serif" | "system-ui" → "Arial"
/// - "serif" → "Times New Roman"
/// - "monospace" → "Courier New"
/// Defaults to "Arial" if no generic keyword found.
pub fn detect_fallback_font(fallback: &[String]) -> &'static str;

/// Compute CSS fallback overrides from font metrics.
pub fn compute_fallback_overrides(
    metrics: &FontMetrics,
    fallback_font: &str,
) -> FallbackOverrides;

/// Extract font descriptors from JS, compute metrics for all fonts.
///
/// For each descriptor:
/// 1. Resolve the .woff2 file path (root_dir, then root_dir/public/)
/// 2. Read and parse the font file
/// 3. Compute fallback overrides
///
/// Fonts that fail extraction are logged with a warning and skipped.
/// Returns a map of font key → fallback overrides.
pub fn extract_all_font_metrics(
    descriptors: &[FontDescriptorInfo],
    root_dir: &Path,
) -> HashMap<String, FallbackOverrides>;

/// Resolve a font URL path to a filesystem path.
///
/// Resolution order:
/// 1. If absolute path, check existence directly
/// 2. Try {root_dir}/{path}
/// 3. Try {root_dir}/public/{path}
///
/// Handles absolute paths for Google Fonts resolver cache.
pub fn resolve_font_path(url_path: &str, root_dir: &Path) -> Option<PathBuf>;
```

### Integration — persistent isolate init

After the SSR module loads and the app module is captured:

```rust
// 1. Extract font descriptor data from JS theme
let descriptors_json = runtime.execute_script(
    "<font-descriptors>",
    r#"(function() {
        const mod = globalThis.__vertz_app_module;
        if (!mod || !mod.theme || !mod.theme.fonts) return '[]';
        return JSON.stringify(Object.entries(mod.theme.fonts).map(([key, d]) => ({
            key,
            family: d.family,
            srcPath: typeof d.src === 'string' ? d.src : d.src?.[0]?.path || null,
            fallback: d.fallback || [],
            adjustFontFallback: d.adjustFontFallback ?? true,
        })).filter(d => d.srcPath));
    })()"#,
)?;

// 2. Parse descriptors, compute metrics in Rust
let descriptors: Vec<FontDescriptorInfo> = serde_json::from_str(&descriptors_json)?;
let metrics = extract_all_font_metrics(&descriptors, &root_dir);

// 3. Store metrics as global for SSR render calls
if !metrics.is_empty() {
    let metrics_json = serde_json::to_string(&metrics)?;
    runtime.execute_script_void(
        "<font-metrics>",
        &format!(
            "globalThis.__vertz_font_fallback_metrics = {};",
            metrics_json
        ),
    )?;
    eprintln!(
        "[vertz] Extracted font fallback metrics for {} font(s)",
        metrics.len()
    );
}
```

**Multi-source fonts:** For fonts with multiple `src` entries (e.g., separate files per weight/style), metrics are extracted from the primary (first) source file only. All entries share the same font family and therefore the same fallback metrics.

### Integration — SSR render JS

Modify `SSR_RENDER_FRAMEWORK_JS` to pass metrics:

```javascript
// Build options for ssrRenderSinglePass
const options = {};
// ... existing ssrAuth/cookies ...
if (globalThis.__vertz_font_fallback_metrics) {
    options.fallbackMetrics = globalThis.__vertz_font_fallback_metrics;
}
```

### Generated CSS (unchanged from Bun server)

```css
/* Existing @font-face (generated by compileFonts) */
@font-face {
  font-family: 'DM Sans';
  font-style: normal;
  font-weight: 100 1000;
  font-display: swap;
  src: url(/fonts/dm-sans.woff2) format('woff2');
}

/* NEW: fallback @font-face (generated by compileFonts with metrics) */
@font-face {
  font-family: 'DM Sans Fallback';
  src: local('Arial');
  ascent-override: 94.52%;
  descent-override: 24.60%;
  line-gap-override: 0.00%;
  size-adjust: 104.88%;
}

/* CSS var includes fallback */
:root {
  --font-sans: 'DM Sans', 'DM Sans Fallback', system-ui, sans-serif;
}
```

## Architecture

```
Server startup
│
├─ V8 isolate loads SSR module
│   └─ globalThis.__vertz_app_module = { theme: { fonts: { ... } } }
│
├─ Rust extracts font descriptors from JS ◄── NEW
│   └─ JSON array of { key, family, srcPath, fallback, adjustFontFallback }
│
├─ Rust reads .woff2 files, computes metrics ◄── NEW
│   └─ For each font: read binary → parse tables → compute weighted xWidthAvg → compute overrides
│
├─ Rust stores metrics as JS global ◄── NEW
│   └─ globalThis.__vertz_font_fallback_metrics = { sans: { ascentOverride: "94.52%", ... } }
│   └─ (camelCase keys via #[serde(rename_all = "camelCase")])
│
└─ Per-request SSR
    └─ ssrRenderSinglePass(module, url, { fallbackMetrics: globalThis.__vertz_font_fallback_metrics })
        └─ compileFonts() generates fallback @font-face ◄── existing JS code, unchanged
```

**Key insight:** We reuse the existing `compileFonts()` JS infrastructure. The Rust runtime only adds the capability the V8 isolate lacks: reading binary `.woff2` font files from disk and computing metric overrides. This mirrors exactly what the Bun server does — extract metrics at startup, pass to `compileFonts()`.

## Manifesto Alignment

**"If it builds, it works"** — Font fallback is automatic with zero user configuration. The runtime does the right thing by default.

**"One way to do things"** — Same `font()` API, same `compileFonts()` pipeline, same CSS output. The Rust runtime just fills in the data that the Bun server was providing.

**"Performance is not optional"** — Metrics are extracted at startup, not per-request. The only per-request cost is passing an already-computed object to `compileFonts()` (which caches its result via `compileThemeCached`).

**Tradeoffs:**
- We use V8 interop (extract descriptors from JS, store metrics as global) rather than parsing CSS. This couples us to the theme's JS structure but avoids fragile CSS parsing and reuses all existing codegen in `compileFonts()`.
- We add a Rust crate dependency for font file parsing (`skrifa` from fontations, or `ttf-parser` + woff2 decompression). This is a one-time startup cost.

**Rejected alternatives:**
- **Parse CSS for `@font-face`**: Fragile, misses the `adjustFontFallback` flag and fallback stack from the JS descriptor. Would require duplicating `compileFonts()` CSS generation logic in Rust.
- **V8 op for font reading**: Would require modifying `@vertz/ui-server` to call a Rust op, coupling the JS package to the runtime. The current approach keeps JS packages runtime-agnostic.
- **Port `@capsizecss/unpack` to V8**: The V8 isolate's `fs` ops may not fully support `node:fs/promises`. Adding a pure-Rust path is more reliable.

## Non-Goals

- **Font subsetting** — Not in scope. Subsetting is tracked separately.
- **Google Fonts fetching** — Google Fonts resolution is a separate pipeline (`google-fonts-resolver.ts`). This feature only handles local `.woff2` files already on disk. However, absolute paths from the Google Fonts cache are handled by `resolve_font_path`.
- **Runtime metric recomputation** — Metrics are computed once at startup. Font files don't change during a dev session. HMR changes to the theme module trigger isolate re-init, which recomputes metrics (see Known Limitations).
- **Non-woff2 formats** — Only `.woff2` is supported, matching the TS implementation.
- **Custom system font metrics** — Only Arial, Times New Roman, and Courier New are supported as fallback bases.

## Known Limitations

- **Adding a font file without changing source code requires a manual restart.** If a developer starts the dev server (font file missing → warning logged), then copies the font file into `public/fonts/`, the metrics won't be recomputed until the next isolate re-init. Editing any source file triggers the file watcher → isolate restart → metrics recomputed. This matches the Bun server behavior.

## Unknowns

### 1. Which Rust crate for woff2 parsing?

**Options:**
- `skrifa` (from Google's fontations) — modern, handles woff2 natively, actively maintained
- `ttf-parser` + `woff2-decoder` — ttf-parser is mature but doesn't handle woff2 decompression; needs a separate crate
- Manual table reading with `brotli` decompression — maximum control, more code

**Resolution:** POC in Phase 1. Evaluate `skrifa` first (simplest API), fall back to `ttf-parser` + `woff2-decoder` if `skrifa`'s dependency footprint is too large. The `vtz` binary already pulls in heavy dependencies (`deno_core`, `oxc_*`, `reqwest`, `rusqlite`), so the incremental cost of `skrifa` (~200-300KB) is likely negligible.

**Criteria:** Must parse woff2 files and provide access to:
- OS/2 table: `sTypoAscender`, `sTypoDescender`, `sTypoLineGap`
- head table: `unitsPerEm`
- hmtx table: per-glyph advance widths (for weighted xWidthAvg computation)
- cmap table: character-to-glyph mapping (for weighted xWidthAvg computation)
- Must not panic on corrupt/truncated files.

### 2. Exact xWidthAvg algorithm parity

`@capsizecss/unpack` computes `xWidthAvg` as a **weighted average of individual glyph advance widths** using Latin character frequency tables (87 characters), NOT the raw OS/2 `xAvgCharWidth` field. The Rust implementation must replicate this exact algorithm:

1. For each character in the Latin frequency table, look up the glyph ID via cmap
2. Read the glyph's advance width from hmtx
3. Multiply by the character's frequency weight
4. Sum all weighted widths
5. Round to nearest integer

If the raw OS/2 field is used instead, `size-adjust` values will diverge, causing visible CLS differences between the Bun and Rust servers. The E2E test (Test 4) validates exact numeric parity.

**Resolution:** Port the capsize Latin frequency table to Rust. Add a cross-implementation parity test that runs both TS and Rust extraction on the same font file and asserts identical values.

### 3. Font path resolution across platforms

Font `src` paths in descriptors are URL paths (e.g., `/fonts/dm-sans.woff2`). The TS implementation resolves these relative to the project root and `public/` directory, and also handles absolute paths (for Google Fonts cache).

**Resolution:** Port `resolveFilePath` logic from `font-metrics.ts`:
1. If absolute path, check existence directly
2. Try `{root_dir}/{stripped_path}`
3. Try `{root_dir}/public/{stripped_path}`

## POC Results

None yet. Phase 1 includes a POC for woff2 parsing crate selection and xWidthAvg algorithm validation.

## Type Flow Map

```
FontDescriptorInfo (Rust, deserialized from JS JSON via #[serde(rename_all = "camelCase")])
    │
    ├─ key: String ──────────────────── → HashMap key in metrics map
    ├─ src_path: String ─────────────── → resolve_font_path() → extract_woff2_metrics()
    ├─ fallback: Vec<String> ─────────── → detect_fallback_font(&fallback)
    └─ adjust_font_fallback: AdjustFallback → skip/auto/explicit branch
                                              │
FontMetrics (from .woff2 file parsing)        │
    │  (ascent, descent, line_gap from OS/2)  │
    │  (units_per_em from head)               │
    │  (x_width_avg: weighted glyph average)  │
    │                                         │
    └─ compute_fallback_overrides() ←─────────┘
         │
    FallbackOverrides (serialized via #[serde(rename_all = "camelCase")])
         │
         └─ serde_json::to_string → globalThis.__vertz_font_fallback_metrics
              │                      { "sans": { "ascentOverride": "94.52%", ... } }
              │
              └─ passed to ssrRenderSinglePass(options.fallbackMetrics)
                   │
                   └─ compileThemeCached(theme, fallbackMetrics) [existing JS]
                        │
                        └─ compileFonts(fonts, { fallbackMetrics }) [existing JS]
                             │
                             └─ buildFallbackFontFace(family, metrics) [existing JS]
                                  │
                                  └─ @font-face CSS in SSR response
```

Every type flows end-to-end from Rust struct to CSS output. No dead types. JSON serialization uses `#[serde(rename_all = "camelCase")]` on both `FontDescriptorInfo` (deserialize) and `FallbackOverrides` (serialize) to match JS naming conventions.

## Error Handling

When a font file cannot be read or parsed, a warning is logged and processing continues for remaining fonts. No font fallback CSS is generated for the failed font, but all other fonts get their fallback declarations.

**Warning log format** (matches the Bun server's `console.warn` format):
```
[vertz] Failed to extract font metrics for "sans" from "/fonts/dm-sans.woff2": <error message>
```

The `extract_all_font_metrics` function returns a `HashMap` — missing entries indicate skipped fonts. One corrupt font file never blocks other fonts from getting fallback metrics.

## Implementation Phases

This is a single-phase feature (scope is small and self-contained). The implementation is broken into tasks within one phase.

### Phase 1: Font Fallback Extraction

**Tasks:**

1. **POC: Crate selection + xWidthAvg algorithm validation**
   - Evaluate `skrifa` for woff2 parsing
   - Port the Latin character frequency table from capsize
   - Validate numeric parity with the TS implementation on the same .woff2 file

2. **Core: `font_fallback.rs`**
   - System font metrics (hardcoded)
   - `extract_woff2_metrics()` with weighted xWidthAvg
   - `detect_fallback_font()`
   - `compute_fallback_overrides()`
   - `resolve_font_path()`
   - `extract_all_font_metrics()`
   - Unit tests for all functions

3. **Integration: persistent isolate + SSR render**
   - Extract font descriptors from JS after module init
   - Compute metrics and store as JS global
   - Modify `SSR_RENDER_FRAMEWORK_JS` to pass `fallbackMetrics`
   - Integration test: SSR response contains fallback CSS

4. **Parity test: Rust vs TS output**
   - Run both implementations on the same .woff2 files
   - Assert identical metric values to 2 decimal places

## E2E Acceptance Test

### Test 1: Font with fallback metrics generates fallback CSS

```rust
#[test]
fn ssr_response_includes_font_fallback_css() {
    // Given: a Vertz app with a theme that declares a font with .woff2 src
    // When: the Rust runtime starts and serves an SSR page
    // Then: the HTML response contains a fallback @font-face declaration

    let html = ssr_render("/");
    assert!(html.contains("DM Sans Fallback"));
    assert!(html.contains("ascent-override:"));
    assert!(html.contains("descent-override:"));
    assert!(html.contains("size-adjust:"));
    assert!(html.contains("src: local('Arial')"));
}
```

### Test 2: Font with adjustFontFallback: false is skipped

```rust
#[test]
fn ssr_response_skips_disabled_fallback() {
    // Given: a font descriptor with adjustFontFallback: false
    // When: the Rust runtime serves an SSR page
    // Then: no fallback @font-face is generated for that font

    let html = ssr_render("/");
    assert!(!html.contains("Disabled Font Fallback"));
}
```

### Test 3: No fonts → no fallback CSS injected

```rust
#[test]
fn ssr_response_without_fonts_has_no_fallback() {
    // Given: a Vertz app with no font declarations
    // When: the Rust runtime serves an SSR page
    // Then: no fallback @font-face CSS is present

    let html = ssr_render("/");
    assert!(!html.contains("Fallback"));
    assert!(!html.contains("ascent-override"));
}
```

### Test 4: Metric values match TS implementation (Arial fallback)

```rust
#[test]
fn fallback_metrics_match_typescript_implementation_arial() {
    // Given: the same .woff2 file used by the TS tests (DM Sans)
    // When: extracting metrics in Rust with Arial as fallback
    // Then: the computed overrides match the TS output exactly

    let metrics = extract_woff2_metrics(Path::new("fixtures/dm-sans-latin.woff2")).unwrap();
    let overrides = compute_fallback_overrides(&metrics, "Arial");

    // These values must match what @capsizecss/unpack produces
    assert_eq!(overrides.ascent_override, "94.52%");
    assert_eq!(overrides.descent_override, "24.60%");
    assert_eq!(overrides.line_gap_override, "0.00%");
    assert_eq!(overrides.size_adjust, "104.88%");
}
```

### Test 5: Explicit fallback font override (Times New Roman)

```rust
#[test]
fn explicit_fallback_font_override_times_new_roman() {
    // Given: a font descriptor with adjustFontFallback: "Times New Roman"
    // When: extracting metrics
    // Then: Times New Roman is used as the fallback base, not Arial

    let metrics = extract_woff2_metrics(Path::new("fixtures/dm-serif-display-latin.woff2")).unwrap();
    let overrides = compute_fallback_overrides(&metrics, "Times New Roman");

    assert_eq!(overrides.fallback_font, "Times New Roman");
    // size-adjust differs because Times New Roman has different xWidthAvg than Arial
    assert_ne!(
        overrides.size_adjust,
        compute_fallback_overrides(&metrics, "Arial").size_adjust
    );
}
```

### Test 6: Corrupt/missing font file is handled gracefully

```rust
#[test]
fn corrupt_font_file_logs_warning_and_continues() {
    // Given: a font descriptor pointing to a corrupt .woff2 file
    // When: extracting metrics
    // Then: the function returns an error, no panic, other fonts still processed

    let result = extract_woff2_metrics(Path::new("fixtures/corrupt.woff2"));
    assert!(result.is_err());
}
```

### Test 7: Cross-implementation parity (Rust vs TS)

```rust
#[test]
fn rust_and_typescript_produce_identical_metrics() {
    // Given: the same .woff2 font files used in packages/ui-server/src/__tests__/font-metrics.test.ts
    // When: running both TS and Rust extraction
    // Then: all metric values match to 2 decimal places

    // Test against: dm-sans-latin.woff2, dm-serif-display-latin.woff2, jetbrains-mono-latin.woff2
    for (font_file, fallback) in PARITY_TEST_CASES {
        let rust_overrides = extract_and_compute(font_file, fallback);
        let ts_overrides = read_ts_expected_values(font_file, fallback);
        assert_eq!(rust_overrides.ascent_override, ts_overrides.ascent_override);
        assert_eq!(rust_overrides.descent_override, ts_overrides.descent_override);
        assert_eq!(rust_overrides.line_gap_override, ts_overrides.line_gap_override);
        assert_eq!(rust_overrides.size_adjust, ts_overrides.size_adjust);
    }
}
```
