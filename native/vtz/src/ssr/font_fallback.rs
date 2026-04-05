/// Font fallback metric extraction for zero-CLS font loading.
///
/// Reads `.woff2` font files and computes CSS fallback metric overrides
/// (ascent-override, descent-override, line-gap-override, size-adjust)
/// so the browser's fallback font occupies the same space as the real font.
///
/// The `x_width_avg` is computed as a **weighted average** of glyph advance
/// widths using Latin character frequency tables, matching the algorithm in
/// `@capsizecss/unpack` (NOT the raw OS/2 `xAvgCharWidth` field).
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

// ─── Error type ──────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum FontFallbackError {
    #[error("failed to read font file: {0}")]
    Io(#[from] std::io::Error),
    #[error("failed to parse font file: {0}")]
    Parse(String),
    #[error("missing required font table: {0}")]
    MissingTable(String),
}

// ─── Types ───────────────────────────────────────────────────────

/// Metrics extracted from a font file.
///
/// `ascent`, `descent`, `line_gap`, and `units_per_em` are read from the
/// OS/2 and head tables. `x_width_avg` is a weighted average of glyph
/// advance widths using Latin character frequency tables.
#[derive(Debug, Clone)]
pub struct FontMetrics {
    pub ascent: i16,
    pub descent: i16,
    pub line_gap: i16,
    pub units_per_em: u16,
    /// Weighted average character width (Latin character frequencies).
    pub x_width_avg: i16,
}

/// Computed CSS fallback overrides for a single font.
///
/// All string fields are pre-formatted percentages (e.g., "94.52%").
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FallbackOverrides {
    pub ascent_override: String,
    pub descent_override: String,
    pub line_gap_override: String,
    pub size_adjust: String,
    /// Must be exactly "Arial", "Times New Roman", or "Courier New".
    pub fallback_font: String,
}

/// A font descriptor extracted from the JS theme module.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontDescriptorInfo {
    pub key: String,
    pub family: String,
    pub src_path: String,
    pub fallback: Vec<String>,
    pub adjust_font_fallback: AdjustFallback,
}

/// Controls automatic fallback font metric adjustment.
#[derive(Debug, Clone)]
pub enum AdjustFallback {
    /// `true` — auto-detect fallback base from `fallback` stack.
    Auto,
    /// `false` — skip this font.
    Disabled,
    /// Explicit system font name (e.g., "Arial").
    Explicit(String),
}

impl<'de> Deserialize<'de> for AdjustFallback {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        match value {
            serde_json::Value::Bool(true) => Ok(AdjustFallback::Auto),
            serde_json::Value::Bool(false) => Ok(AdjustFallback::Disabled),
            serde_json::Value::String(s) => Ok(AdjustFallback::Explicit(s)),
            _ => Err(serde::de::Error::custom(
                "adjustFontFallback must be true, false, or a font name string",
            )),
        }
    }
}

// ─── System font metrics (hardcoded, stable across OS versions) ──

struct SystemFontMetrics {
    units_per_em: u16,
    x_width_avg: i16,
}

const SYSTEM_FONT_ARIAL: SystemFontMetrics = SystemFontMetrics {
    units_per_em: 2048,
    x_width_avg: 904,
};

const SYSTEM_FONT_TIMES_NEW_ROMAN: SystemFontMetrics = SystemFontMetrics {
    units_per_em: 2048,
    x_width_avg: 819,
};

const SYSTEM_FONT_COURIER_NEW: SystemFontMetrics = SystemFontMetrics {
    units_per_em: 2048,
    x_width_avg: 1229,
};

fn get_system_font_metrics(name: &str) -> &'static SystemFontMetrics {
    match name {
        "Arial" => &SYSTEM_FONT_ARIAL,
        "Times New Roman" => &SYSTEM_FONT_TIMES_NEW_ROMAN,
        "Courier New" => &SYSTEM_FONT_COURIER_NEW,
        _ => &SYSTEM_FONT_ARIAL,
    }
}

// ─── Latin character frequency weights ───────────────────────────
//
// Ported from @capsizecss/unpack's Latin subset weighting table.
// Each entry is (character, frequency weight). Weights are based on
// English text character frequency analysis.

const LATIN_CHAR_WEIGHTS: &[(char, f64)] = &[
    ('0', 0.0053),
    ('1', 0.0023),
    ('2', 0.0026),
    ('3', 0.001),
    ('4', 0.0008),
    ('5', 0.0015),
    ('6', 0.0007),
    ('7', 0.0005),
    ('8', 0.0007),
    ('9', 0.0006),
    (' ', 0.154),
    (',', 0.0083),
    ('t', 0.0672),
    ('h', 0.0351),
    ('e', 0.0922),
    ('o', 0.0571),
    ('f', 0.017),
    ('P', 0.0023),
    ('p', 0.0163),
    ('l', 0.0304),
    ('\'', 0.0014),
    ('m', 0.0181),
    ('F', 0.0015),
    ('g', 0.0155),
    ('N', 0.0014),
    ('D', 0.0013),
    ('M', 0.0025),
    ('I', 0.0022),
    ('s', 0.0469),
    ('R', 0.0015),
    ('u', 0.0207),
    ('b', 0.0114),
    ('i', 0.0588),
    ('c', 0.0232),
    ('C', 0.0031),
    ('n', 0.0578),
    ('a', 0.0668),
    ('d', 0.0298),
    ('y', 0.0123),
    ('w', 0.011),
    ('B', 0.002),
    ('r', 0.0526),
    ('z', 0.0011),
    ('G', 0.0011),
    ('j', 0.0009),
    ('T', 0.0041),
    ('.', 0.0079),
    ('L', 0.0012),
    ('k', 0.0046),
    ('J', 0.0009),
    ('v', 0.0076),
    ('A', 0.004),
    ('H', 0.0013),
    ('E', 0.0011),
    ('S', 0.0041),
    (';', 0.0001),
    (':', 0.0008),
    ('/', 0.0001),
    ('%', 0.0001),
    ('Z', 0.0002),
    ('X', 0.0001),
    ('\u{00e1}', 0.0001), // á
    ('\u{00e9}', 0.0001), // é
    ('$', 0.0002),
    ('|', 0.0038),
    ('=', 0.0007),
    ('Q', 0.0001),
    ('[', 0.0021),
    (']', 0.0007),
    ('(', 0.001),
    (')', 0.001),
    ('"', 0.0012),
    ('-', 0.0018),
    ('x', 0.0025),
    ('V', 0.0005),
    ('K', 0.0007),
    ('Y', 0.0003),
    ('U', 0.0016),
    ('O', 0.0009),
    ('W', 0.0012),
    ('q', 0.0008),
];

// ─── Core functions ──────────────────────────────────────────────

/// Detect which system font to use as fallback base.
///
/// Scans the `fallback` array for generic CSS font family keywords:
/// - `sans-serif` or `system-ui` → Arial
/// - `serif` → Times New Roman
/// - `monospace` → Courier New
///
/// Defaults to Arial if no generic keyword is found.
pub fn detect_fallback_font(fallback: &[String]) -> &'static str {
    for f in fallback {
        let lower = f.to_lowercase();
        match lower.as_str() {
            "sans-serif" | "system-ui" => return "Arial",
            "serif" => return "Times New Roman",
            "monospace" => return "Courier New",
            _ => continue,
        }
    }
    "Arial"
}

/// Format a float as a percentage string with 2 decimal places.
fn format_percent(value: f64) -> String {
    format!("{:.2}%", value * 100.0)
}

/// Compute CSS fallback overrides from font metrics.
///
/// Uses the same formulas as `computeFallbackMetrics` in `font-metrics.ts`:
/// - `size_adjust = fontAvgWidth / fallbackAvgWidth` (normalized by UPM)
/// - `ascent_override = ascent / (UPM * size_adjust)`
/// - `descent_override = |descent| / (UPM * size_adjust)`
/// - `line_gap_override = lineGap / (UPM * size_adjust)`
pub fn compute_fallback_overrides(metrics: &FontMetrics, fallback_font: &str) -> FallbackOverrides {
    let system = get_system_font_metrics(fallback_font);

    let font_normalized_width = metrics.x_width_avg as f64 / metrics.units_per_em as f64;
    let system_normalized_width = system.x_width_avg as f64 / system.units_per_em as f64;
    let size_adjust = font_normalized_width / system_normalized_width;

    let ascent_override = metrics.ascent as f64 / (metrics.units_per_em as f64 * size_adjust);
    let descent_override =
        (metrics.descent as f64).abs() / (metrics.units_per_em as f64 * size_adjust);
    let line_gap_override = metrics.line_gap as f64 / (metrics.units_per_em as f64 * size_adjust);

    FallbackOverrides {
        ascent_override: format_percent(ascent_override),
        descent_override: format_percent(descent_override),
        line_gap_override: format_percent(line_gap_override),
        size_adjust: format_percent(size_adjust),
        fallback_font: fallback_font.to_string(),
    }
}

/// Extract font metrics from a `.woff2` file.
///
/// Reads OS/2 table for ascent/descent/lineGap, head table for unitsPerEm,
/// and computes weighted xWidthAvg from individual glyph advance widths
/// using Latin character frequency tables (matching `@capsizecss/unpack`).
pub fn extract_woff2_metrics(path: &Path) -> Result<FontMetrics, FontFallbackError> {
    let data = std::fs::read(path)?;

    // WOFF2 files need decompression to TTF/OTF before parsing.
    // Check magic bytes: "wOF2" = 0x774F4632
    let is_woff2 = data.len() >= 4 && &data[..4] == b"wOF2";

    let decompressed;
    let font_data: &[u8] = if is_woff2 {
        decompressed = woff2_patched::decode::convert_woff2_to_ttf(&mut data.as_slice())
            .map_err(|e| FontFallbackError::Parse(format!("WOFF2 decode: {:?}", e)))?;
        &decompressed
    } else {
        &data
    };

    let font = skrifa::FontRef::from_index(font_data, 0)
        .map_err(|e| FontFallbackError::Parse(format!("{}", e)))?;

    parse_font_metrics(&font)
}

/// Parse font metrics from an already-loaded FontRef.
fn parse_font_metrics(font: &skrifa::FontRef<'_>) -> Result<FontMetrics, FontFallbackError> {
    use skrifa::raw::TableProvider;
    use skrifa::MetadataProvider;

    // Read OS/2 table
    let os2 = font
        .os2()
        .map_err(|_| FontFallbackError::MissingTable("OS/2".to_string()))?;

    // Read head table
    let head = font
        .head()
        .map_err(|_| FontFallbackError::MissingTable("head".to_string()))?;

    let ascent = os2.s_typo_ascender();
    let descent = os2.s_typo_descender();
    let line_gap = os2.s_typo_line_gap();
    let units_per_em = head.units_per_em();
    let raw_x_avg = os2.x_avg_char_width();

    // Compute weighted xWidthAvg from individual glyph advance widths.
    // This matches @capsizecss/unpack's avgWidthForSubset algorithm.
    let charmap = font.charmap();

    let x_width_avg = compute_weighted_x_width_avg(font, &charmap, raw_x_avg);

    Ok(FontMetrics {
        ascent,
        descent,
        line_gap,
        units_per_em,
        x_width_avg,
    })
}

/// Compute weighted average character width using Latin frequency table.
///
/// For each character in the frequency table:
/// 1. Map to glyph ID via cmap
/// 2. Read glyph advance width
/// 3. Multiply by frequency weight
///
/// Falls back to raw OS/2 xAvgCharWidth when a glyph is missing.
fn compute_weighted_x_width_avg(
    font: &skrifa::FontRef<'_>,
    charmap: &skrifa::charmap::Charmap<'_>,
    raw_x_avg: i16,
) -> i16 {
    use skrifa::MetadataProvider;

    let glyph_metrics = font.glyph_metrics(
        skrifa::instance::Size::unscaled(),
        skrifa::instance::LocationRef::default(),
    );

    let mut weighted_sum = 0.0;

    for &(ch, weight) in LATIN_CHAR_WEIGHTS {
        let advance_width = if let Some(glyph_id) = charmap.map(ch) {
            glyph_metrics
                .advance_width(glyph_id)
                .unwrap_or(raw_x_avg as f32) as f64
        } else {
            raw_x_avg as f64
        };

        weighted_sum += advance_width * weight;
    }

    weighted_sum.round() as i16
}

/// Resolve a font URL path to a filesystem path.
///
/// Resolution order:
/// 1. If absolute path, check existence directly
/// 2. Try `{root_dir}/{stripped_path}`
/// 3. Try `{root_dir}/public/{stripped_path}`
pub fn resolve_font_path(url_path: &str, root_dir: &Path) -> Option<PathBuf> {
    // Absolute paths (e.g., from Google Fonts resolver cache)
    if Path::new(url_path).is_absolute() {
        let p = PathBuf::from(url_path);
        if p.is_file() {
            return Some(p);
        }
    }

    let stripped = url_path.strip_prefix('/').unwrap_or(url_path);

    // Try root_dir/{path}
    let direct = root_dir.join(stripped);
    if direct.is_file() {
        return Some(direct);
    }

    // Try root_dir/public/{path}
    let public = root_dir.join("public").join(stripped);
    if public.is_file() {
        return Some(public);
    }

    None
}

/// Extract font metrics for all font descriptors.
///
/// For each descriptor:
/// 1. Skip if `adjust_font_fallback` is `Disabled`
/// 2. Skip if src_path doesn't end with `.woff2`
/// 3. Resolve font path, read file, compute metrics
/// 4. On error: log warning and continue to next font
///
/// Returns a map of font key → fallback overrides.
pub fn extract_all_font_metrics(
    descriptors: &[FontDescriptorInfo],
    root_dir: &Path,
) -> HashMap<String, FallbackOverrides> {
    let mut result = HashMap::new();

    for descriptor in descriptors {
        // Skip disabled fonts
        if matches!(descriptor.adjust_font_fallback, AdjustFallback::Disabled) {
            continue;
        }

        // Enforce woff2-only policy
        if !descriptor.src_path.to_lowercase().ends_with(".woff2") {
            continue;
        }

        // Resolve font file path
        let font_path = match resolve_font_path(&descriptor.src_path, root_dir) {
            Some(p) => p,
            None => {
                eprintln!(
                    "[vertz] Failed to extract font metrics for \"{}\" from \"{}\": font file not found",
                    descriptor.key, descriptor.src_path
                );
                continue;
            }
        };

        // Extract metrics from font file
        let metrics = match extract_woff2_metrics(&font_path) {
            Ok(m) => m,
            Err(e) => {
                eprintln!(
                    "[vertz] Failed to extract font metrics for \"{}\" from \"{}\": {}",
                    descriptor.key, descriptor.src_path, e
                );
                continue;
            }
        };

        // Determine fallback font
        let fallback_font = match &descriptor.adjust_font_fallback {
            AdjustFallback::Explicit(name) => name.as_str(),
            _ => detect_fallback_font(&descriptor.fallback),
        };

        let overrides = compute_fallback_overrides(&metrics, fallback_font);
        result.insert(descriptor.key.clone(), overrides);
    }

    result
}

// ─── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── detect_fallback_font ────────────────────────────────────

    #[test]
    fn detect_fallback_arial_for_sans_serif() {
        assert_eq!(
            detect_fallback_font(&["system-ui".into(), "sans-serif".into()]),
            "Arial"
        );
    }

    #[test]
    fn detect_fallback_arial_for_system_ui() {
        assert_eq!(detect_fallback_font(&["system-ui".into()]), "Arial");
    }

    #[test]
    fn detect_fallback_times_for_serif() {
        assert_eq!(
            detect_fallback_font(&["Georgia".into(), "serif".into()]),
            "Times New Roman"
        );
    }

    #[test]
    fn detect_fallback_courier_for_monospace() {
        assert_eq!(detect_fallback_font(&["monospace".into()]), "Courier New");
    }

    #[test]
    fn detect_fallback_arial_for_empty() {
        assert_eq!(detect_fallback_font(&[]), "Arial");
    }

    #[test]
    fn detect_fallback_arial_for_no_generic() {
        assert_eq!(
            detect_fallback_font(&["Georgia".into(), "Verdana".into()]),
            "Arial"
        );
    }

    #[test]
    fn detect_fallback_skips_non_generic_entries() {
        assert_eq!(
            detect_fallback_font(&["Helvetica".into(), "Georgia".into(), "serif".into()]),
            "Times New Roman"
        );
    }

    #[test]
    fn detect_fallback_case_insensitive() {
        assert_eq!(detect_fallback_font(&["Sans-Serif".into()]), "Arial");
    }

    // ─── format_percent ──────────────────────────────────────────

    #[test]
    fn format_percent_standard() {
        assert_eq!(format_percent(0.9452), "94.52%");
    }

    #[test]
    fn format_percent_zero() {
        assert_eq!(format_percent(0.0), "0.00%");
    }

    #[test]
    fn format_percent_over_100() {
        assert_eq!(format_percent(1.0670), "106.70%");
    }

    // ─── compute_fallback_overrides ──────────────────────────────

    #[test]
    fn compute_overrides_with_known_metrics() {
        // Use DM Sans-like metrics to verify the formula
        let metrics = FontMetrics {
            ascent: 1000,
            descent: -200,
            line_gap: 0,
            units_per_em: 1000,
            x_width_avg: 500,
        };
        let overrides = compute_fallback_overrides(&metrics, "Arial");

        // Verify fields are formatted as percentages
        assert!(overrides.ascent_override.ends_with('%'));
        assert!(overrides.descent_override.ends_with('%'));
        assert!(overrides.line_gap_override.ends_with('%'));
        assert!(overrides.size_adjust.ends_with('%'));
        assert_eq!(overrides.fallback_font, "Arial");
    }

    #[test]
    fn compute_overrides_zero_line_gap() {
        let metrics = FontMetrics {
            ascent: 800,
            descent: -200,
            line_gap: 0,
            units_per_em: 1000,
            x_width_avg: 500,
        };
        let overrides = compute_fallback_overrides(&metrics, "Arial");
        assert_eq!(overrides.line_gap_override, "0.00%");
    }

    // ─── FallbackOverrides serialization ─────────────────────────

    #[test]
    fn fallback_overrides_serializes_camel_case() {
        let overrides = FallbackOverrides {
            ascent_override: "94.52%".to_string(),
            descent_override: "24.60%".to_string(),
            line_gap_override: "0.00%".to_string(),
            size_adjust: "104.88%".to_string(),
            fallback_font: "Arial".to_string(),
        };
        let json = serde_json::to_string(&overrides).unwrap();
        assert!(json.contains("\"ascentOverride\""));
        assert!(json.contains("\"descentOverride\""));
        assert!(json.contains("\"lineGapOverride\""));
        assert!(json.contains("\"sizeAdjust\""));
        assert!(json.contains("\"fallbackFont\""));
        // Must NOT contain snake_case
        assert!(!json.contains("ascent_override"));
        assert!(!json.contains("fallback_font"));
    }

    // ─── FontDescriptorInfo deserialization ───────────────────────

    #[test]
    fn font_descriptor_deserializes_camel_case() {
        let json = r#"{
            "key": "sans",
            "family": "DM Sans",
            "srcPath": "/fonts/dm-sans.woff2",
            "fallback": ["system-ui", "sans-serif"],
            "adjustFontFallback": true
        }"#;
        let info: FontDescriptorInfo = serde_json::from_str(json).unwrap();
        assert_eq!(info.key, "sans");
        assert_eq!(info.src_path, "/fonts/dm-sans.woff2");
        assert!(matches!(info.adjust_font_fallback, AdjustFallback::Auto));
    }

    #[test]
    fn adjust_font_fallback_deserializes_false() {
        let json = r#"{
            "key": "sans",
            "family": "DM Sans",
            "srcPath": "/fonts/dm-sans.woff2",
            "fallback": [],
            "adjustFontFallback": false
        }"#;
        let info: FontDescriptorInfo = serde_json::from_str(json).unwrap();
        assert!(matches!(
            info.adjust_font_fallback,
            AdjustFallback::Disabled
        ));
    }

    #[test]
    fn adjust_font_fallback_deserializes_explicit_string() {
        let json = r#"{
            "key": "display",
            "family": "DM Serif",
            "srcPath": "/fonts/dm-serif.woff2",
            "fallback": ["serif"],
            "adjustFontFallback": "Times New Roman"
        }"#;
        let info: FontDescriptorInfo = serde_json::from_str(json).unwrap();
        match info.adjust_font_fallback {
            AdjustFallback::Explicit(ref name) => assert_eq!(name, "Times New Roman"),
            _ => panic!("Expected AdjustFallback::Explicit"),
        }
    }

    // ─── extract_woff2_metrics (integration) ─────────────────────

    /// Path to test font fixtures (packages/landing/public/fonts/).
    fn fixtures_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packages/landing/public/fonts")
    }

    #[test]
    fn extract_dm_sans_metrics_match_typescript() {
        let path = fixtures_dir().join("dm-sans-latin.woff2");
        if !path.exists() {
            eprintln!("Skipping: fixture not found at {:?}", path);
            return;
        }
        let metrics = extract_woff2_metrics(&path).unwrap();
        let overrides = compute_fallback_overrides(&metrics, "Arial");

        assert_eq!(overrides.ascent_override, "92.97%");
        assert_eq!(overrides.descent_override, "29.05%");
        assert_eq!(overrides.line_gap_override, "0.00%");
        assert_eq!(overrides.size_adjust, "106.70%");
        assert_eq!(overrides.fallback_font, "Arial");
    }

    #[test]
    fn extract_dm_serif_metrics_match_typescript() {
        let path = fixtures_dir().join("dm-serif-display-latin.woff2");
        if !path.exists() {
            eprintln!("Skipping: fixture not found at {:?}", path);
            return;
        }
        let metrics = extract_woff2_metrics(&path).unwrap();
        let overrides = compute_fallback_overrides(&metrics, "Times New Roman");

        assert_eq!(overrides.ascent_override, "92.89%");
        assert_eq!(overrides.descent_override, "30.04%");
        assert_eq!(overrides.line_gap_override, "0.00%");
        assert_eq!(overrides.size_adjust, "111.53%");
        assert_eq!(overrides.fallback_font, "Times New Roman");
    }

    #[test]
    fn extract_jetbrains_mono_metrics_match_typescript() {
        let path = fixtures_dir().join("jetbrains-mono-latin.woff2");
        if !path.exists() {
            eprintln!("Skipping: fixture not found at {:?}", path);
            return;
        }
        let metrics = extract_woff2_metrics(&path).unwrap();
        let overrides = compute_fallback_overrides(&metrics, "Courier New");

        assert_eq!(overrides.ascent_override, "102.02%");
        assert_eq!(overrides.descent_override, "30.00%");
        assert_eq!(overrides.line_gap_override, "0.00%");
        assert_eq!(overrides.size_adjust, "99.98%");
        assert_eq!(overrides.fallback_font, "Courier New");
    }

    #[test]
    fn extract_woff2_corrupt_file_returns_error() {
        let tmp = tempfile::tempdir().unwrap();
        let corrupt_path = tmp.path().join("corrupt.woff2");
        std::fs::write(&corrupt_path, [0u8, 1, 2, 3, 4, 5]).unwrap();

        let result = extract_woff2_metrics(&corrupt_path);
        assert!(result.is_err());
    }

    #[test]
    fn extract_woff2_missing_file_returns_error() {
        let result = extract_woff2_metrics(Path::new("/nonexistent/font.woff2"));
        assert!(result.is_err());
    }

    // ─── resolve_font_path ───────────────────────────────────────

    #[test]
    fn resolve_font_path_from_public_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let fonts_dir = tmp.path().join("public/fonts");
        std::fs::create_dir_all(&fonts_dir).unwrap();
        std::fs::write(fonts_dir.join("test.woff2"), "fake").unwrap();

        let result = resolve_font_path("/fonts/test.woff2", tmp.path());
        assert!(result.is_some());
        assert!(result.unwrap().ends_with("public/fonts/test.woff2"));
    }

    #[test]
    fn resolve_font_path_from_root_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let fonts_dir = tmp.path().join("fonts");
        std::fs::create_dir_all(&fonts_dir).unwrap();
        std::fs::write(fonts_dir.join("test.woff2"), "fake").unwrap();

        let result = resolve_font_path("/fonts/test.woff2", tmp.path());
        assert!(result.is_some());
        assert!(result.unwrap().ends_with("fonts/test.woff2"));
    }

    #[test]
    fn resolve_font_path_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let result = resolve_font_path("/fonts/nonexistent.woff2", tmp.path());
        assert!(result.is_none());
    }

    #[test]
    fn resolve_font_path_absolute() {
        let tmp = tempfile::tempdir().unwrap();
        let font_file = tmp.path().join("cached-font.woff2");
        std::fs::write(&font_file, "fake").unwrap();

        let result = resolve_font_path(font_file.to_str().unwrap(), tmp.path());
        assert!(result.is_some());
    }

    // ─── extract_all_font_metrics ────────────────────────────────

    #[test]
    fn extract_all_skips_disabled() {
        let descriptors = vec![FontDescriptorInfo {
            key: "sans".to_string(),
            family: "Test".to_string(),
            src_path: "/fonts/test.woff2".to_string(),
            fallback: vec!["sans-serif".to_string()],
            adjust_font_fallback: AdjustFallback::Disabled,
        }];
        let result = extract_all_font_metrics(&descriptors, Path::new("/tmp"));
        assert!(result.is_empty());
    }

    #[test]
    fn extract_all_skips_non_woff2() {
        let descriptors = vec![FontDescriptorInfo {
            key: "sans".to_string(),
            family: "Test".to_string(),
            src_path: "/fonts/test.ttf".to_string(),
            fallback: vec!["sans-serif".to_string()],
            adjust_font_fallback: AdjustFallback::Auto,
        }];
        let result = extract_all_font_metrics(&descriptors, Path::new("/tmp"));
        assert!(result.is_empty());
    }

    #[test]
    fn extract_all_empty_descriptors() {
        let result = extract_all_font_metrics(&[], Path::new("/tmp"));
        assert!(result.is_empty());
    }

    #[test]
    fn extract_all_with_real_fonts() {
        let fixtures = fixtures_dir();
        if !fixtures.exists() {
            eprintln!("Skipping: fixtures dir not found");
            return;
        }
        let root = fixtures.parent().unwrap().parent().unwrap(); // packages/landing

        let descriptors = vec![
            FontDescriptorInfo {
                key: "sans".to_string(),
                family: "DM Sans".to_string(),
                src_path: "/public/fonts/dm-sans-latin.woff2".to_string(),
                fallback: vec!["system-ui".to_string(), "sans-serif".to_string()],
                adjust_font_fallback: AdjustFallback::Auto,
            },
            FontDescriptorInfo {
                key: "display".to_string(),
                family: "DM Serif Display".to_string(),
                src_path: "/public/fonts/dm-serif-display-latin.woff2".to_string(),
                fallback: vec!["Georgia".to_string(), "serif".to_string()],
                adjust_font_fallback: AdjustFallback::Auto,
            },
            FontDescriptorInfo {
                key: "mono".to_string(),
                family: "JetBrains Mono".to_string(),
                src_path: "/public/fonts/jetbrains-mono-latin.woff2".to_string(),
                fallback: vec!["monospace".to_string()],
                adjust_font_fallback: AdjustFallback::Auto,
            },
        ];

        let result = extract_all_font_metrics(&descriptors, root);
        assert_eq!(result.len(), 3);
        assert_eq!(result["sans"].fallback_font, "Arial");
        assert_eq!(result["display"].fallback_font, "Times New Roman");
        assert_eq!(result["mono"].fallback_font, "Courier New");
    }

    #[test]
    fn extract_all_with_explicit_fallback_override() {
        let fixtures = fixtures_dir();
        if !fixtures.exists() {
            eprintln!("Skipping: fixtures dir not found");
            return;
        }
        let root = fixtures.parent().unwrap().parent().unwrap();

        let descriptors = vec![FontDescriptorInfo {
            key: "display".to_string(),
            family: "DM Serif Display".to_string(),
            src_path: "/public/fonts/dm-serif-display-latin.woff2".to_string(),
            fallback: vec!["Georgia".to_string(), "serif".to_string()],
            adjust_font_fallback: AdjustFallback::Explicit("Arial".to_string()),
        }];

        let result = extract_all_font_metrics(&descriptors, root);
        assert_eq!(result.len(), 1);
        // Explicit override should use Arial, not auto-detected Times New Roman
        assert_eq!(result["display"].fallback_font, "Arial");
    }
}
