//! CSS token resolution tables — embedded from @vertz/ui/internals token-tables.ts.
//! Single source of truth is the TS file; these must stay in sync.

/// Property mapping: shorthand → (CSS properties, value type).
pub fn property_map(key: &str) -> Option<(&[&str], &str)> {
    match key {
        // Padding
        "p" => Some((&["padding"], "spacing")),
        "px" => Some((&["padding-inline"], "spacing")),
        "py" => Some((&["padding-block"], "spacing")),
        "pt" => Some((&["padding-top"], "spacing")),
        "pr" => Some((&["padding-right"], "spacing")),
        "pb" => Some((&["padding-bottom"], "spacing")),
        "pl" => Some((&["padding-left"], "spacing")),
        // Margin
        "m" => Some((&["margin"], "spacing")),
        "mx" => Some((&["margin-inline"], "spacing")),
        "my" => Some((&["margin-block"], "spacing")),
        "mt" => Some((&["margin-top"], "spacing")),
        "mr" => Some((&["margin-right"], "spacing")),
        "mb" => Some((&["margin-bottom"], "spacing")),
        "ml" => Some((&["margin-left"], "spacing")),
        // Sizing
        "w" => Some((&["width"], "size")),
        "h" => Some((&["height"], "size")),
        "min-w" => Some((&["min-width"], "size")),
        "max-w" => Some((&["max-width"], "size")),
        "min-h" => Some((&["min-height"], "size")),
        "max-h" => Some((&["max-height"], "size")),
        // Colors
        "bg" => Some((&["background-color"], "color")),
        "text" => Some((&["color"], "color")),
        "border" => Some((&["border-color"], "color")),
        // Border width (directional)
        "border-r" => Some((&["border-right-width"], "raw")),
        "border-l" => Some((&["border-left-width"], "raw")),
        "border-t" => Some((&["border-top-width"], "raw")),
        "border-b" => Some((&["border-bottom-width"], "raw")),
        // Border radius
        "rounded" => Some((&["border-radius"], "radius")),
        // Shadow
        "shadow" => Some((&["box-shadow"], "shadow")),
        // Layout
        "gap" => Some((&["gap"], "spacing")),
        "items" => Some((&["align-items"], "alignment")),
        "justify" => Some((&["justify-content"], "alignment")),
        "grid-cols" => Some((&["grid-template-columns"], "raw")),
        // Typography
        "font" => Some((&["font-size"], "font-size")),
        "weight" => Some((&["font-weight"], "font-weight")),
        "leading" => Some((&["line-height"], "line-height")),
        "tracking" => Some((&["letter-spacing"], "raw")),
        "decoration" => Some((&["text-decoration"], "raw")),
        // List
        "list" => Some((&["list-style"], "raw")),
        // Ring
        "ring" => Some((&["outline"], "ring")),
        // Overflow
        "overflow" => Some((&["overflow"], "raw")),
        "overflow-x" => Some((&["overflow-x"], "raw")),
        "overflow-y" => Some((&["overflow-y"], "raw")),
        // Misc
        "cursor" => Some((&["cursor"], "raw")),
        "transition" => Some((&["transition"], "raw")),
        "resize" => Some((&["resize"], "raw")),
        "opacity" => Some((&["opacity"], "raw")),
        "inset" => Some((&["inset"], "raw")),
        "z" => Some((&["z-index"], "raw")),
        // View Transitions
        "vt-name" | "view-transition-name" => Some((&["view-transition-name"], "raw")),
        // Content
        "content" => Some((&["content"], "content")),
        _ => None,
    }
}

/// Keyword map: single keywords → one or more CSS declarations.
/// Returns `(property, value)` pairs.
pub fn keyword_map(key: &str) -> Option<&[(&str, &str)]> {
    match key {
        // Display
        "flex" => Some(&[("display", "flex")]),
        "grid" => Some(&[("display", "grid")]),
        "block" => Some(&[("display", "block")]),
        "inline" => Some(&[("display", "inline")]),
        "hidden" => Some(&[("display", "none")]),
        "inline-flex" => Some(&[("display", "inline-flex")]),
        // Flex utilities
        "flex-1" => Some(&[("flex", "1 1 0%")]),
        "flex-col" => Some(&[("flex-direction", "column")]),
        "flex-row" => Some(&[("flex-direction", "row")]),
        "flex-wrap" => Some(&[("flex-wrap", "wrap")]),
        "flex-nowrap" => Some(&[("flex-wrap", "nowrap")]),
        // Position
        "fixed" => Some(&[("position", "fixed")]),
        "absolute" => Some(&[("position", "absolute")]),
        "relative" => Some(&[("position", "relative")]),
        "sticky" => Some(&[("position", "sticky")]),
        // Text
        "uppercase" => Some(&[("text-transform", "uppercase")]),
        "lowercase" => Some(&[("text-transform", "lowercase")]),
        "capitalize" => Some(&[("text-transform", "capitalize")]),
        // Outline
        "outline-none" => Some(&[("outline", "none")]),
        // Overflow
        "overflow-hidden" => Some(&[("overflow", "hidden")]),
        // User interaction
        "select-none" => Some(&[("user-select", "none")]),
        "pointer-events-none" => Some(&[("pointer-events", "none")]),
        // Text wrapping
        "whitespace-nowrap" => Some(&[("white-space", "nowrap")]),
        // Flex shrink
        "shrink-0" => Some(&[("flex-shrink", "0")]),
        // Font style
        "italic" => Some(&[("font-style", "italic")]),
        "not-italic" => Some(&[("font-style", "normal")]),
        // Transform scale
        "scale-0" => Some(&[("transform", "scale(0)")]),
        "scale-75" => Some(&[("transform", "scale(0.75)")]),
        "scale-90" => Some(&[("transform", "scale(0.9)")]),
        "scale-95" => Some(&[("transform", "scale(0.95)")]),
        "scale-100" => Some(&[("transform", "scale(1)")]),
        "scale-105" => Some(&[("transform", "scale(1.05)")]),
        "scale-110" => Some(&[("transform", "scale(1.1)")]),
        "scale-125" => Some(&[("transform", "scale(1.25)")]),
        "scale-150" => Some(&[("transform", "scale(1.5)")]),
        _ => None,
    }
}

/// Spacing scale: token → CSS value.
pub fn spacing_scale(key: &str) -> Option<&str> {
    match key {
        "0" => Some("0"),
        "0.5" => Some("0.125rem"),
        "1" => Some("0.25rem"),
        "1.5" => Some("0.375rem"),
        "2" => Some("0.5rem"),
        "2.5" => Some("0.625rem"),
        "3" => Some("0.75rem"),
        "3.5" => Some("0.875rem"),
        "4" => Some("1rem"),
        "5" => Some("1.25rem"),
        "6" => Some("1.5rem"),
        "7" => Some("1.75rem"),
        "8" => Some("2rem"),
        "9" => Some("2.25rem"),
        "10" => Some("2.5rem"),
        "11" => Some("2.75rem"),
        "12" => Some("3rem"),
        "14" => Some("3.5rem"),
        "16" => Some("4rem"),
        "20" => Some("5rem"),
        "24" => Some("6rem"),
        "28" => Some("7rem"),
        "32" => Some("8rem"),
        "36" => Some("9rem"),
        "40" => Some("10rem"),
        "44" => Some("11rem"),
        "48" => Some("12rem"),
        "52" => Some("13rem"),
        "56" => Some("14rem"),
        "60" => Some("15rem"),
        "64" => Some("16rem"),
        "72" => Some("18rem"),
        "80" => Some("20rem"),
        "96" => Some("24rem"),
        "auto" => Some("auto"),
        _ => None,
    }
}

/// Radius scale: token → CSS value.
pub fn radius_scale(key: &str) -> Option<&str> {
    match key {
        "none" => Some("0"),
        "xs" => Some("calc(var(--radius) * 0.33)"),
        "sm" => Some("calc(var(--radius) * 0.67)"),
        "md" => Some("var(--radius)"),
        "lg" => Some("calc(var(--radius) * 1.33)"),
        "xl" => Some("calc(var(--radius) * 2)"),
        "2xl" => Some("calc(var(--radius) * 2.67)"),
        "3xl" => Some("calc(var(--radius) * 4)"),
        "full" => Some("9999px"),
        _ => None,
    }
}

/// Shadow scale: token → CSS value.
pub fn shadow_scale(key: &str) -> Option<&str> {
    match key {
        "xs" => Some("0 1px 1px 0 rgb(0 0 0 / 0.03)"),
        "sm" => Some("0 1px 2px 0 rgb(0 0 0 / 0.05)"),
        "md" => Some("0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)"),
        "lg" => Some("0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)"),
        "xl" => Some("0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)"),
        "2xl" => Some("0 25px 50px -12px rgb(0 0 0 / 0.25)"),
        "none" => Some("none"),
        _ => None,
    }
}

/// Font size scale: token → CSS value.
pub fn font_size_scale(key: &str) -> Option<&str> {
    match key {
        "xs" => Some("0.75rem"),
        "sm" => Some("0.875rem"),
        "base" => Some("1rem"),
        "lg" => Some("1.125rem"),
        "xl" => Some("1.25rem"),
        "2xl" => Some("1.5rem"),
        "3xl" => Some("1.875rem"),
        "4xl" => Some("2.25rem"),
        "5xl" => Some("3rem"),
        _ => None,
    }
}

/// Font weight scale: token → CSS value.
pub fn font_weight_scale(key: &str) -> Option<&str> {
    match key {
        "thin" => Some("100"),
        "extralight" => Some("200"),
        "light" => Some("300"),
        "normal" => Some("400"),
        "medium" => Some("500"),
        "semibold" => Some("600"),
        "bold" => Some("700"),
        "extrabold" => Some("800"),
        "black" => Some("900"),
        _ => None,
    }
}

/// Line height scale: token → CSS value.
pub fn line_height_scale(key: &str) -> Option<&str> {
    match key {
        "none" => Some("1"),
        "tight" => Some("1.25"),
        "snug" => Some("1.375"),
        "normal" => Some("1.5"),
        "relaxed" => Some("1.625"),
        "loose" => Some("2"),
        _ => None,
    }
}

/// Alignment map: token → CSS value.
pub fn alignment_map(key: &str) -> Option<&str> {
    match key {
        "start" => Some("flex-start"),
        "end" => Some("flex-end"),
        "center" => Some("center"),
        "between" => Some("space-between"),
        "around" => Some("space-around"),
        "evenly" => Some("space-evenly"),
        "stretch" => Some("stretch"),
        "baseline" => Some("baseline"),
        _ => None,
    }
}

/// Size keywords: token → CSS value.
pub fn size_keywords(key: &str) -> Option<&str> {
    match key {
        "full" => Some("100%"),
        "svw" => Some("100svw"),
        "dvw" => Some("100dvw"),
        "min" => Some("min-content"),
        "max" => Some("max-content"),
        "fit" => Some("fit-content"),
        "auto" => Some("auto"),
        "xs" => Some("20rem"),
        "sm" => Some("24rem"),
        "md" => Some("28rem"),
        "lg" => Some("32rem"),
        "xl" => Some("36rem"),
        "2xl" => Some("42rem"),
        "3xl" => Some("48rem"),
        "4xl" => Some("56rem"),
        "5xl" => Some("64rem"),
        "6xl" => Some("72rem"),
        "7xl" => Some("80rem"),
        _ => None,
    }
}

/// Content keywords: token → CSS value.
pub fn content_map(key: &str) -> Option<&str> {
    match key {
        "empty" => Some("''"),
        "none" => Some("none"),
        _ => None,
    }
}

/// Pseudo prefix → CSS pseudo-selector.
pub fn pseudo_map(key: &str) -> Option<&str> {
    match key {
        "hover" => Some(":hover"),
        "focus" => Some(":focus"),
        "focus-visible" => Some(":focus-visible"),
        "active" => Some(":active"),
        "disabled" => Some(":disabled"),
        "first" => Some(":first-child"),
        "last" => Some(":last-child"),
        _ => None,
    }
}

/// Check if a key is a pseudo prefix.
pub fn is_pseudo_prefix(key: &str) -> bool {
    pseudo_map(key).is_some()
}

/// Color namespace set.
pub fn is_color_namespace(key: &str) -> bool {
    matches!(
        key,
        "primary"
            | "secondary"
            | "accent"
            | "background"
            | "foreground"
            | "muted"
            | "surface"
            | "destructive"
            | "danger"
            | "success"
            | "warning"
            | "info"
            | "border"
            | "ring"
            | "input"
            | "card"
            | "popover"
            | "gray"
            | "primary-foreground"
            | "secondary-foreground"
            | "accent-foreground"
            | "destructive-foreground"
            | "muted-foreground"
            | "card-foreground"
            | "popover-foreground"
    )
}

/// CSS color keywords that pass through without resolution.
pub fn is_css_color_keyword(key: &str) -> bool {
    matches!(
        key,
        "transparent" | "inherit" | "currentColor" | "initial" | "unset" | "white" | "black"
    )
}

/// Height-axis properties that use vh units.
pub fn is_height_axis(property: &str) -> bool {
    matches!(property, "h" | "min-h" | "max-h")
}

/// Resolve a color token to a CSS value.
pub fn resolve_color(value: &str) -> Option<String> {
    // Check for opacity modifier: 'primary/50', 'primary.700/50'
    if let Some(slash_idx) = value.rfind('/') {
        let color_part = &value[..slash_idx];
        let opacity_str = &value[slash_idx + 1..];
        if let Ok(opacity) = opacity_str.parse::<u32>() {
            if opacity <= 100 {
                if let Some(resolved) = resolve_color_token(color_part) {
                    return Some(format!(
                        "color-mix(in oklch, {resolved} {opacity}%, transparent)"
                    ));
                }
            }
        }
        return None;
    }
    resolve_color_token(value)
}

/// Resolve a color token (without opacity) to a CSS value.
fn resolve_color_token(token: &str) -> Option<String> {
    if let Some(dot_idx) = token.find('.') {
        let namespace = &token[..dot_idx];
        let shade = &token[dot_idx + 1..];
        if is_color_namespace(namespace) {
            return Some(format!("var(--color-{namespace}-{shade})"));
        }
        return None;
    }
    if is_color_namespace(token) {
        return Some(format!("var(--color-{token})"));
    }
    if is_css_color_keyword(token) {
        return Some(token.to_string());
    }
    None
}

/// Resolve a value token based on its type.
pub fn resolve_value(value: &str, value_type: &str, property: &str) -> Option<String> {
    match value_type {
        "spacing" => spacing_scale(value).map(|v| v.to_string()),
        "color" => resolve_color(value),
        "radius" => radius_scale(value).map(|v| v.to_string()),
        "shadow" => shadow_scale(value).map(|v| v.to_string()),
        "size" => resolve_size(value, property),
        "alignment" => alignment_map(value).map(|v| v.to_string()),
        "font-size" => font_size_scale(value).map(|v| v.to_string()),
        "font-weight" => font_weight_scale(value).map(|v| v.to_string()),
        "line-height" => line_height_scale(value).map(|v| v.to_string()),
        "ring" => resolve_ring(value),
        "content" => content_map(value).map(|v| v.to_string()),
        "raw" => {
            // grid-cols: number → repeat(N, minmax(0, 1fr))
            if property == "grid-cols" {
                if let Ok(num) = value.parse::<u32>() {
                    if num > 0 {
                        return Some(format!("repeat({}, minmax(0, 1fr))", num));
                    }
                }
            }
            Some(value.to_string())
        }
        _ => Some(value.to_string()),
    }
}

fn resolve_size(value: &str, property: &str) -> Option<String> {
    if value == "screen" {
        return if is_height_axis(property) {
            Some("100vh".to_string())
        } else {
            Some("100vw".to_string())
        };
    }
    if let Some(v) = spacing_scale(value) {
        return Some(v.to_string());
    }
    if let Some(v) = size_keywords(value) {
        return Some(v.to_string());
    }
    // Fraction: N/M → percentage (integers only, matching TS regex /^(\d+)\/(\d+)$/)
    if let Some(slash_idx) = value.find('/') {
        let num_str = &value[..slash_idx];
        let den_str = &value[slash_idx + 1..];
        if let (Ok(num), Ok(den)) = (num_str.parse::<u64>(), den_str.parse::<u64>()) {
            if den != 0 {
                let pct = (num as f64 / den as f64) * 100.0;
                if pct % 1.0 == 0.0 {
                    return Some(format!("{}%", pct as i64));
                }
                return Some(format!("{:.6}%", pct));
            }
        }
    }
    None
}

fn resolve_ring(value: &str) -> Option<String> {
    let num: f64 = value.parse().ok()?;
    if num < 0.0 || num.is_nan() {
        return None;
    }
    Some(format!("{}px solid var(--color-ring)", num))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── property_map: exercise every arm + unknown ────────────────

    #[test]
    fn property_map_all_known_keys() {
        let keys = [
            "p",
            "px",
            "py",
            "pt",
            "pr",
            "pb",
            "pl",
            "m",
            "mx",
            "my",
            "mt",
            "mr",
            "mb",
            "ml",
            "w",
            "h",
            "min-w",
            "max-w",
            "min-h",
            "max-h",
            "bg",
            "text",
            "border",
            "border-r",
            "border-l",
            "border-t",
            "border-b",
            "rounded",
            "shadow",
            "gap",
            "items",
            "justify",
            "grid-cols",
            "font",
            "weight",
            "leading",
            "tracking",
            "decoration",
            "list",
            "ring",
            "overflow",
            "overflow-x",
            "overflow-y",
            "cursor",
            "transition",
            "resize",
            "opacity",
            "inset",
            "z",
            "vt-name",
            "view-transition-name",
            "content",
        ];
        for key in &keys {
            assert!(property_map(key).is_some(), "expected Some for '{}'", key);
        }
    }

    #[test]
    fn property_map_unknown_returns_none() {
        assert!(property_map("unknown").is_none());
    }

    #[test]
    fn property_map_spot_checks() {
        let (props, vtype) = property_map("p").unwrap();
        assert_eq!(props, &["padding"]);
        assert_eq!(vtype, "spacing");

        let (props, vtype) = property_map("bg").unwrap();
        assert_eq!(props, &["background-color"]);
        assert_eq!(vtype, "color");

        let (props, vtype) = property_map("grid-cols").unwrap();
        assert_eq!(props, &["grid-template-columns"]);
        assert_eq!(vtype, "raw");

        // vt-name and view-transition-name both map to same thing
        assert_eq!(
            property_map("vt-name"),
            property_map("view-transition-name")
        );
    }

    // ── keyword_map: exercise every arm + unknown ────────────────

    #[test]
    fn keyword_map_all_known_keys() {
        let keys = [
            "flex",
            "grid",
            "block",
            "inline",
            "hidden",
            "inline-flex",
            "flex-1",
            "flex-col",
            "flex-row",
            "flex-wrap",
            "flex-nowrap",
            "fixed",
            "absolute",
            "relative",
            "sticky",
            "uppercase",
            "lowercase",
            "capitalize",
            "outline-none",
            "overflow-hidden",
            "select-none",
            "pointer-events-none",
            "whitespace-nowrap",
            "shrink-0",
            "italic",
            "not-italic",
            "scale-0",
            "scale-75",
            "scale-90",
            "scale-95",
            "scale-100",
            "scale-105",
            "scale-110",
            "scale-125",
            "scale-150",
        ];
        for key in &keys {
            assert!(keyword_map(key).is_some(), "expected Some for '{}'", key);
        }
    }

    #[test]
    fn keyword_map_unknown_returns_none() {
        assert!(keyword_map("nonexistent").is_none());
    }

    #[test]
    fn keyword_map_spot_checks() {
        let decls = keyword_map("flex").unwrap();
        assert_eq!(decls, &[("display", "flex")]);

        let decls = keyword_map("hidden").unwrap();
        assert_eq!(decls, &[("display", "none")]);

        let decls = keyword_map("scale-150").unwrap();
        assert_eq!(decls, &[("transform", "scale(1.5)")]);
    }

    // ── spacing_scale: exercise every arm + unknown ──────────────

    #[test]
    fn spacing_scale_all_known_keys() {
        let keys = [
            "0", "0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "5", "6", "7", "8", "9", "10",
            "11", "12", "14", "16", "20", "24", "28", "32", "36", "40", "44", "48", "52", "56",
            "60", "64", "72", "80", "96", "auto",
        ];
        for key in &keys {
            assert!(spacing_scale(key).is_some(), "expected Some for '{}'", key);
        }
    }

    #[test]
    fn spacing_scale_unknown_returns_none() {
        assert!(spacing_scale("999").is_none());
    }

    #[test]
    fn spacing_scale_spot_checks() {
        assert_eq!(spacing_scale("0"), Some("0"));
        assert_eq!(spacing_scale("4"), Some("1rem"));
        assert_eq!(spacing_scale("auto"), Some("auto"));
    }

    // ── radius_scale ─────────────────────────────────────────────

    #[test]
    fn radius_scale_all_known_keys() {
        let keys = ["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "full"];
        for key in &keys {
            assert!(radius_scale(key).is_some(), "expected Some for '{}'", key);
        }
    }

    #[test]
    fn radius_scale_unknown_returns_none() {
        assert!(radius_scale("unknown").is_none());
    }

    #[test]
    fn radius_scale_spot_checks() {
        assert_eq!(radius_scale("none"), Some("0"));
        assert_eq!(radius_scale("full"), Some("9999px"));
    }

    // ── shadow_scale ─────────────────────────────────────────────

    #[test]
    fn shadow_scale_all_known_keys() {
        let keys = ["xs", "sm", "md", "lg", "xl", "2xl", "none"];
        for key in &keys {
            assert!(shadow_scale(key).is_some(), "expected Some for '{}'", key);
        }
    }

    #[test]
    fn shadow_scale_unknown_returns_none() {
        assert!(shadow_scale("unknown").is_none());
    }

    // ── font_size_scale ──────────────────────────────────────────

    #[test]
    fn font_size_scale_all_known_keys() {
        let keys = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl"];
        for key in &keys {
            assert!(
                font_size_scale(key).is_some(),
                "expected Some for '{}'",
                key
            );
        }
    }

    #[test]
    fn font_size_scale_unknown_returns_none() {
        assert!(font_size_scale("unknown").is_none());
    }

    // ── font_weight_scale ────────────────────────────────────────

    #[test]
    fn font_weight_scale_all_known_keys() {
        let keys = [
            "thin",
            "extralight",
            "light",
            "normal",
            "medium",
            "semibold",
            "bold",
            "extrabold",
            "black",
        ];
        for key in &keys {
            assert!(
                font_weight_scale(key).is_some(),
                "expected Some for '{}'",
                key
            );
        }
    }

    #[test]
    fn font_weight_scale_unknown_returns_none() {
        assert!(font_weight_scale("unknown").is_none());
    }

    #[test]
    fn font_weight_spot_checks() {
        assert_eq!(font_weight_scale("bold"), Some("700"));
        assert_eq!(font_weight_scale("thin"), Some("100"));
    }

    // ── line_height_scale ────────────────────────────────────────

    #[test]
    fn line_height_scale_all_known_keys() {
        let keys = ["none", "tight", "snug", "normal", "relaxed", "loose"];
        for key in &keys {
            assert!(
                line_height_scale(key).is_some(),
                "expected Some for '{}'",
                key
            );
        }
    }

    #[test]
    fn line_height_scale_unknown_returns_none() {
        assert!(line_height_scale("unknown").is_none());
    }

    // ── alignment_map ────────────────────────────────────────────

    #[test]
    fn alignment_map_all_known_keys() {
        let keys = [
            "start", "end", "center", "between", "around", "evenly", "stretch", "baseline",
        ];
        for key in &keys {
            assert!(alignment_map(key).is_some(), "expected Some for '{}'", key);
        }
    }

    #[test]
    fn alignment_map_unknown_returns_none() {
        assert!(alignment_map("unknown").is_none());
    }

    #[test]
    fn alignment_map_spot_checks() {
        assert_eq!(alignment_map("center"), Some("center"));
        assert_eq!(alignment_map("between"), Some("space-between"));
    }

    // ── size_keywords ────────────────────────────────────────────

    #[test]
    fn size_keywords_all_known_keys() {
        let keys = [
            "full", "svw", "dvw", "min", "max", "fit", "auto", "xs", "sm", "md", "lg", "xl", "2xl",
            "3xl", "4xl", "5xl", "6xl", "7xl",
        ];
        for key in &keys {
            assert!(size_keywords(key).is_some(), "expected Some for '{}'", key);
        }
    }

    #[test]
    fn size_keywords_unknown_returns_none() {
        assert!(size_keywords("unknown").is_none());
    }

    // ── content_map ──────────────────────────────────────────────

    #[test]
    fn content_map_all_known_keys() {
        assert_eq!(content_map("empty"), Some("''"));
        assert_eq!(content_map("none"), Some("none"));
    }

    #[test]
    fn content_map_unknown_returns_none() {
        assert!(content_map("unknown").is_none());
    }

    // ── pseudo_map ───────────────────────────────────────────────

    #[test]
    fn pseudo_map_all_known_keys() {
        let keys = [
            "hover",
            "focus",
            "focus-visible",
            "active",
            "disabled",
            "first",
            "last",
        ];
        for key in &keys {
            assert!(pseudo_map(key).is_some(), "expected Some for '{}'", key);
        }
    }

    #[test]
    fn pseudo_map_unknown_returns_none() {
        assert!(pseudo_map("unknown").is_none());
    }

    #[test]
    fn pseudo_map_spot_checks() {
        assert_eq!(pseudo_map("hover"), Some(":hover"));
        assert_eq!(pseudo_map("focus-visible"), Some(":focus-visible"));
    }

    // ── is_pseudo_prefix ─────────────────────────────────────────

    #[test]
    fn is_pseudo_prefix_true_and_false() {
        assert!(is_pseudo_prefix("hover"));
        assert!(!is_pseudo_prefix("notapseudo"));
    }

    // ── is_color_namespace ───────────────────────────────────────

    #[test]
    fn is_color_namespace_all_known() {
        let namespaces = [
            "primary",
            "secondary",
            "accent",
            "background",
            "foreground",
            "muted",
            "surface",
            "destructive",
            "danger",
            "success",
            "warning",
            "info",
            "border",
            "ring",
            "input",
            "card",
            "popover",
            "gray",
            "primary-foreground",
            "secondary-foreground",
            "accent-foreground",
            "destructive-foreground",
            "muted-foreground",
            "card-foreground",
            "popover-foreground",
        ];
        for ns in &namespaces {
            assert!(is_color_namespace(ns), "expected true for '{}'", ns);
        }
    }

    #[test]
    fn is_color_namespace_false_for_unknown() {
        assert!(!is_color_namespace("unknown"));
    }

    // ── is_css_color_keyword ─────────────────────────────────────

    #[test]
    fn is_css_color_keyword_all_known() {
        let keywords = [
            "transparent",
            "inherit",
            "currentColor",
            "initial",
            "unset",
            "white",
            "black",
        ];
        for kw in &keywords {
            assert!(is_css_color_keyword(kw), "expected true for '{}'", kw);
        }
    }

    #[test]
    fn is_css_color_keyword_false_for_unknown() {
        assert!(!is_css_color_keyword("red"));
    }

    // ── is_height_axis ───────────────────────────────────────────

    #[test]
    fn is_height_axis_true_for_height_properties() {
        assert!(is_height_axis("h"));
        assert!(is_height_axis("min-h"));
        assert!(is_height_axis("max-h"));
    }

    #[test]
    fn is_height_axis_false_for_non_height() {
        assert!(!is_height_axis("w"));
        assert!(!is_height_axis("min-w"));
    }

    // ── resolve_color ────────────────────────────────────────────

    #[test]
    fn resolve_color_plain_namespace() {
        assert_eq!(
            resolve_color("primary"),
            Some("var(--color-primary)".to_string())
        );
    }

    #[test]
    fn resolve_color_with_shade() {
        assert_eq!(
            resolve_color("primary.700"),
            Some("var(--color-primary-700)".to_string())
        );
    }

    #[test]
    fn resolve_color_with_opacity() {
        let result = resolve_color("primary/50").unwrap();
        assert!(
            result.contains("color-mix"),
            "expected color-mix: {}",
            result
        );
        assert!(result.contains("50%"), "expected 50%: {}", result);
    }

    #[test]
    fn resolve_color_shade_with_opacity() {
        let result = resolve_color("primary.700/50").unwrap();
        assert!(result.contains("color-mix"));
        assert!(result.contains("var(--color-primary-700)"));
    }

    #[test]
    fn resolve_color_opacity_over_100_returns_none() {
        assert!(resolve_color("primary/101").is_none());
    }

    #[test]
    fn resolve_color_invalid_opacity_returns_none() {
        assert!(resolve_color("primary/abc").is_none());
    }

    #[test]
    fn resolve_color_unknown_namespace_returns_none() {
        assert!(resolve_color("notacolor").is_none());
    }

    #[test]
    fn resolve_color_unknown_namespace_with_shade_returns_none() {
        assert!(resolve_color("notacolor.700").is_none());
    }

    #[test]
    fn resolve_color_css_keyword() {
        assert_eq!(
            resolve_color("transparent"),
            Some("transparent".to_string())
        );
        assert_eq!(resolve_color("white"), Some("white".to_string()));
    }

    #[test]
    fn resolve_color_unknown_with_opacity_returns_none() {
        assert!(resolve_color("notacolor/50").is_none());
    }

    // ── resolve_value ────────────────────────────────────────────

    #[test]
    fn resolve_value_spacing() {
        assert_eq!(resolve_value("4", "spacing", "p"), Some("1rem".to_string()));
    }

    #[test]
    fn resolve_value_color() {
        assert_eq!(
            resolve_value("primary", "color", "bg"),
            Some("var(--color-primary)".to_string())
        );
    }

    #[test]
    fn resolve_value_radius() {
        assert_eq!(
            resolve_value("full", "radius", "rounded"),
            Some("9999px".to_string())
        );
    }

    #[test]
    fn resolve_value_shadow() {
        assert!(resolve_value("sm", "shadow", "shadow").is_some());
    }

    #[test]
    fn resolve_value_size() {
        assert_eq!(resolve_value("full", "size", "w"), Some("100%".to_string()));
    }

    #[test]
    fn resolve_value_alignment() {
        assert_eq!(
            resolve_value("center", "alignment", "items"),
            Some("center".to_string())
        );
    }

    #[test]
    fn resolve_value_font_size() {
        assert_eq!(
            resolve_value("lg", "font-size", "font"),
            Some("1.125rem".to_string())
        );
    }

    #[test]
    fn resolve_value_font_weight() {
        assert_eq!(
            resolve_value("bold", "font-weight", "weight"),
            Some("700".to_string())
        );
    }

    #[test]
    fn resolve_value_line_height() {
        assert_eq!(
            resolve_value("tight", "line-height", "leading"),
            Some("1.25".to_string())
        );
    }

    #[test]
    fn resolve_value_ring() {
        let result = resolve_value("2", "ring", "ring").unwrap();
        assert!(result.contains("2px solid"), "result: {}", result);
    }

    #[test]
    fn resolve_value_content() {
        assert_eq!(
            resolve_value("empty", "content", "content"),
            Some("''".to_string())
        );
    }

    #[test]
    fn resolve_value_raw_passthrough() {
        assert_eq!(
            resolve_value("hidden", "raw", "overflow"),
            Some("hidden".to_string())
        );
    }

    #[test]
    fn resolve_value_raw_grid_cols_number() {
        assert_eq!(
            resolve_value("3", "raw", "grid-cols"),
            Some("repeat(3, minmax(0, 1fr))".to_string())
        );
    }

    #[test]
    fn resolve_value_raw_grid_cols_zero() {
        // 0 is not > 0, so falls through to raw passthrough
        assert_eq!(
            resolve_value("0", "raw", "grid-cols"),
            Some("0".to_string())
        );
    }

    #[test]
    fn resolve_value_raw_grid_cols_non_number() {
        assert_eq!(
            resolve_value("auto", "raw", "grid-cols"),
            Some("auto".to_string())
        );
    }

    #[test]
    fn resolve_value_unknown_type_passthrough() {
        assert_eq!(
            resolve_value("anything", "unknown-type", "x"),
            Some("anything".to_string())
        );
    }

    // ── resolve_size ─────────────────────────────────────────────

    #[test]
    fn resolve_size_screen_height_axis() {
        assert_eq!(
            resolve_value("screen", "size", "h"),
            Some("100vh".to_string())
        );
    }

    #[test]
    fn resolve_size_screen_width_axis() {
        assert_eq!(
            resolve_value("screen", "size", "w"),
            Some("100vw".to_string())
        );
    }

    #[test]
    fn resolve_size_spacing_fallback() {
        assert_eq!(resolve_value("4", "size", "w"), Some("1rem".to_string()));
    }

    #[test]
    fn resolve_size_keyword_fallback() {
        assert_eq!(
            resolve_value("fit", "size", "w"),
            Some("fit-content".to_string())
        );
    }

    #[test]
    fn resolve_size_fraction_even() {
        assert_eq!(resolve_value("1/2", "size", "w"), Some("50%".to_string()));
    }

    #[test]
    fn resolve_size_fraction_repeating() {
        let result = resolve_value("1/3", "size", "w").unwrap();
        assert!(result.contains("33."), "expected ~33.x%: {}", result);
        assert!(result.ends_with('%'));
    }

    #[test]
    fn resolve_size_fraction_zero_denominator() {
        assert!(resolve_value("1/0", "size", "w").is_none());
    }

    #[test]
    fn resolve_size_no_match() {
        assert!(resolve_value("notasize", "size", "w").is_none());
    }

    // ── resolve_ring ─────────────────────────────────────────────

    #[test]
    fn resolve_ring_valid_integer() {
        let result = resolve_value("2", "ring", "ring").unwrap();
        assert_eq!(result, "2px solid var(--color-ring)");
    }

    #[test]
    fn resolve_ring_valid_float() {
        let result = resolve_value("1.5", "ring", "ring").unwrap();
        assert_eq!(result, "1.5px solid var(--color-ring)");
    }

    #[test]
    fn resolve_ring_zero() {
        let result = resolve_value("0", "ring", "ring").unwrap();
        assert_eq!(result, "0px solid var(--color-ring)");
    }

    #[test]
    fn resolve_ring_negative_returns_none() {
        assert!(resolve_value("-1", "ring", "ring").is_none());
    }

    #[test]
    fn resolve_ring_non_number_returns_none() {
        assert!(resolve_value("abc", "ring", "ring").is_none());
    }
}
