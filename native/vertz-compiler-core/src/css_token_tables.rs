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
        // White-space
        "whitespace" => Some((&["white-space"], "raw")),
        // Text overflow
        "text-overflow" => Some((&["text-overflow"], "raw")),
        // Overflow wrap
        "overflow-wrap" => Some((&["overflow-wrap"], "raw")),
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
        // Truncate (multi-declaration)
        "truncate" => Some(&[
            ("overflow", "hidden"),
            ("white-space", "nowrap"),
            ("text-overflow", "ellipsis"),
        ]),
        // Whitespace keywords
        "whitespace-pre" => Some(&[("white-space", "pre")]),
        "whitespace-pre-wrap" => Some(&[("white-space", "pre-wrap")]),
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

/// Text alignment keywords (multi-mode: `text:center` is alignment, not color).
pub fn is_text_align_keyword(key: &str) -> bool {
    matches!(
        key,
        "center" | "left" | "right" | "justify" | "start" | "end"
    )
}

/// Border width values (multi-mode: `border:1` is width, not color).
pub fn is_border_width(key: &str) -> bool {
    key.parse::<f64>().is_ok()
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

/// Check if a name is a raw Tailwind palette (excludes `gray` which is a semantic namespace).
pub fn is_raw_palette(name: &str) -> bool {
    matches!(
        name,
        "slate"
            | "zinc"
            | "neutral"
            | "stone"
            | "red"
            | "orange"
            | "amber"
            | "yellow"
            | "lime"
            | "green"
            | "emerald"
            | "teal"
            | "cyan"
            | "sky"
            | "blue"
            | "indigo"
            | "violet"
            | "purple"
            | "fuchsia"
            | "pink"
            | "rose"
    )
}

/// Map shade string to array index (shades: 50,100,200,...,950).
fn shade_index(shade: &str) -> Option<usize> {
    match shade {
        "50" => Some(0),
        "100" => Some(1),
        "200" => Some(2),
        "300" => Some(3),
        "400" => Some(4),
        "500" => Some(5),
        "600" => Some(6),
        "700" => Some(7),
        "800" => Some(8),
        "900" => Some(9),
        "950" => Some(10),
        _ => None,
    }
}

/// Get all shades for a raw palette. Order: 50,100,200,300,400,500,600,700,800,900,950.
fn palette_shades(palette: &str) -> Option<&'static [&'static str; 11]> {
    match palette {
        "slate" => Some(&[
            "oklch(0.984 0.003 247.858)",
            "oklch(0.968 0.007 247.896)",
            "oklch(0.929 0.013 255.508)",
            "oklch(0.869 0.022 252.894)",
            "oklch(0.704 0.04 256.788)",
            "oklch(0.554 0.046 257.417)",
            "oklch(0.446 0.043 257.281)",
            "oklch(0.372 0.044 257.287)",
            "oklch(0.279 0.041 260.031)",
            "oklch(0.208 0.042 265.755)",
            "oklch(0.129 0.042 264.695)",
        ]),
        "zinc" => Some(&[
            "oklch(0.985 0 0)",
            "oklch(0.967 0.001 286.375)",
            "oklch(0.92 0.004 286.32)",
            "oklch(0.871 0.006 286.286)",
            "oklch(0.705 0.015 286.067)",
            "oklch(0.552 0.016 285.938)",
            "oklch(0.442 0.017 285.786)",
            "oklch(0.37 0.013 285.805)",
            "oklch(0.274 0.006 286.033)",
            "oklch(0.21 0.006 285.885)",
            "oklch(0.141 0.005 285.823)",
        ]),
        "neutral" => Some(&[
            "oklch(0.985 0 0)",
            "oklch(0.97 0 0)",
            "oklch(0.922 0 0)",
            "oklch(0.87 0 0)",
            "oklch(0.708 0 0)",
            "oklch(0.556 0 0)",
            "oklch(0.439 0 0)",
            "oklch(0.371 0 0)",
            "oklch(0.269 0 0)",
            "oklch(0.205 0 0)",
            "oklch(0.145 0 0)",
        ]),
        "stone" => Some(&[
            "oklch(0.985 0.001 106.423)",
            "oklch(0.97 0.001 106.424)",
            "oklch(0.923 0.003 48.717)",
            "oklch(0.869 0.005 56.366)",
            "oklch(0.709 0.01 56.259)",
            "oklch(0.553 0.013 58.071)",
            "oklch(0.444 0.011 73.639)",
            "oklch(0.374 0.01 67.558)",
            "oklch(0.268 0.007 34.298)",
            "oklch(0.216 0.006 56.043)",
            "oklch(0.147 0.004 49.25)",
        ]),
        "red" => Some(&[
            "oklch(0.971 0.013 17.38)",
            "oklch(0.936 0.032 17.717)",
            "oklch(0.885 0.062 18.334)",
            "oklch(0.808 0.114 19.571)",
            "oklch(0.704 0.191 22.216)",
            "oklch(0.637 0.237 25.331)",
            "oklch(0.577 0.245 27.325)",
            "oklch(0.505 0.213 27.518)",
            "oklch(0.444 0.177 26.899)",
            "oklch(0.396 0.141 25.723)",
            "oklch(0.258 0.092 26.042)",
        ]),
        "orange" => Some(&[
            "oklch(0.98 0.016 73.684)",
            "oklch(0.954 0.038 75.164)",
            "oklch(0.901 0.076 70.697)",
            "oklch(0.837 0.128 66.29)",
            "oklch(0.75 0.183 55.934)",
            "oklch(0.705 0.213 47.604)",
            "oklch(0.646 0.222 41.116)",
            "oklch(0.553 0.195 38.402)",
            "oklch(0.47 0.157 37.304)",
            "oklch(0.408 0.123 38.172)",
            "oklch(0.266 0.079 36.259)",
        ]),
        "amber" => Some(&[
            "oklch(0.987 0.022 95.277)",
            "oklch(0.962 0.059 95.617)",
            "oklch(0.924 0.12 95.746)",
            "oklch(0.879 0.169 91.605)",
            "oklch(0.828 0.189 84.429)",
            "oklch(0.769 0.188 70.08)",
            "oklch(0.666 0.179 58.318)",
            "oklch(0.555 0.163 48.998)",
            "oklch(0.473 0.137 46.201)",
            "oklch(0.414 0.112 45.904)",
            "oklch(0.279 0.077 45.635)",
        ]),
        "yellow" => Some(&[
            "oklch(0.987 0.026 102.212)",
            "oklch(0.973 0.071 103.193)",
            "oklch(0.945 0.129 101.54)",
            "oklch(0.905 0.182 98.111)",
            "oklch(0.852 0.199 91.936)",
            "oklch(0.795 0.184 86.047)",
            "oklch(0.681 0.162 75.834)",
            "oklch(0.554 0.135 66.442)",
            "oklch(0.476 0.114 61.907)",
            "oklch(0.421 0.095 57.708)",
            "oklch(0.286 0.066 53.813)",
        ]),
        "lime" => Some(&[
            "oklch(0.986 0.031 120.757)",
            "oklch(0.967 0.067 122.328)",
            "oklch(0.938 0.127 124.321)",
            "oklch(0.897 0.196 126.665)",
            "oklch(0.841 0.238 128.85)",
            "oklch(0.768 0.233 130.85)",
            "oklch(0.648 0.2 131.684)",
            "oklch(0.532 0.157 131.589)",
            "oklch(0.453 0.124 130.933)",
            "oklch(0.405 0.101 131.063)",
            "oklch(0.274 0.072 132.109)",
        ]),
        "green" => Some(&[
            "oklch(0.982 0.018 155.826)",
            "oklch(0.962 0.044 156.743)",
            "oklch(0.925 0.084 155.995)",
            "oklch(0.871 0.15 154.449)",
            "oklch(0.792 0.209 151.711)",
            "oklch(0.723 0.219 149.579)",
            "oklch(0.627 0.194 149.214)",
            "oklch(0.527 0.154 150.069)",
            "oklch(0.448 0.119 151.328)",
            "oklch(0.393 0.095 152.535)",
            "oklch(0.266 0.065 152.934)",
        ]),
        "emerald" => Some(&[
            "oklch(0.979 0.021 166.113)",
            "oklch(0.95 0.052 163.051)",
            "oklch(0.905 0.093 164.15)",
            "oklch(0.845 0.143 164.978)",
            "oklch(0.765 0.177 163.223)",
            "oklch(0.696 0.17 162.48)",
            "oklch(0.596 0.145 163.225)",
            "oklch(0.508 0.118 165.612)",
            "oklch(0.432 0.095 166.913)",
            "oklch(0.378 0.077 168.94)",
            "oklch(0.262 0.051 172.552)",
        ]),
        "teal" => Some(&[
            "oklch(0.984 0.014 180.72)",
            "oklch(0.953 0.051 180.801)",
            "oklch(0.91 0.096 180.426)",
            "oklch(0.855 0.138 181.071)",
            "oklch(0.777 0.152 181.912)",
            "oklch(0.704 0.14 182.503)",
            "oklch(0.6 0.118 184.704)",
            "oklch(0.511 0.096 186.391)",
            "oklch(0.437 0.078 188.216)",
            "oklch(0.386 0.063 188.416)",
            "oklch(0.277 0.046 192.524)",
        ]),
        "cyan" => Some(&[
            "oklch(0.984 0.019 200.873)",
            "oklch(0.956 0.045 203.388)",
            "oklch(0.917 0.08 205.041)",
            "oklch(0.865 0.127 207.078)",
            "oklch(0.789 0.154 211.53)",
            "oklch(0.715 0.143 215.221)",
            "oklch(0.609 0.126 221.723)",
            "oklch(0.52 0.105 223.128)",
            "oklch(0.45 0.085 224.283)",
            "oklch(0.398 0.07 227.392)",
            "oklch(0.302 0.056 229.695)",
        ]),
        "sky" => Some(&[
            "oklch(0.977 0.013 236.62)",
            "oklch(0.951 0.026 236.824)",
            "oklch(0.901 0.058 230.902)",
            "oklch(0.828 0.111 230.318)",
            "oklch(0.746 0.16 232.661)",
            "oklch(0.685 0.169 237.323)",
            "oklch(0.588 0.158 241.966)",
            "oklch(0.5 0.134 242.749)",
            "oklch(0.443 0.11 240.79)",
            "oklch(0.391 0.09 240.876)",
            "oklch(0.293 0.066 243.157)",
        ]),
        "blue" => Some(&[
            "oklch(0.97 0.014 254.604)",
            "oklch(0.932 0.032 255.585)",
            "oklch(0.882 0.059 254.128)",
            "oklch(0.809 0.105 251.813)",
            "oklch(0.707 0.165 254.624)",
            "oklch(0.623 0.214 259.815)",
            "oklch(0.546 0.245 262.881)",
            "oklch(0.488 0.243 264.376)",
            "oklch(0.424 0.199 265.638)",
            "oklch(0.379 0.146 265.522)",
            "oklch(0.282 0.091 267.935)",
        ]),
        "indigo" => Some(&[
            "oklch(0.962 0.018 272.314)",
            "oklch(0.93 0.034 272.788)",
            "oklch(0.87 0.065 274.039)",
            "oklch(0.785 0.115 274.713)",
            "oklch(0.673 0.182 276.935)",
            "oklch(0.585 0.233 277.117)",
            "oklch(0.511 0.262 276.966)",
            "oklch(0.457 0.24 277.023)",
            "oklch(0.398 0.195 277.366)",
            "oklch(0.359 0.144 278.697)",
            "oklch(0.257 0.09 281.288)",
        ]),
        "violet" => Some(&[
            "oklch(0.969 0.016 293.756)",
            "oklch(0.943 0.029 294.588)",
            "oklch(0.894 0.057 293.283)",
            "oklch(0.811 0.111 293.571)",
            "oklch(0.702 0.183 293.541)",
            "oklch(0.606 0.25 292.717)",
            "oklch(0.541 0.281 293.009)",
            "oklch(0.491 0.27 292.581)",
            "oklch(0.432 0.232 292.759)",
            "oklch(0.38 0.189 293.745)",
            "oklch(0.283 0.141 291.089)",
        ]),
        "purple" => Some(&[
            "oklch(0.977 0.014 308.299)",
            "oklch(0.946 0.033 307.174)",
            "oklch(0.902 0.063 306.703)",
            "oklch(0.827 0.119 306.383)",
            "oklch(0.714 0.203 305.504)",
            "oklch(0.627 0.265 303.9)",
            "oklch(0.558 0.288 302.321)",
            "oklch(0.496 0.265 301.924)",
            "oklch(0.438 0.218 303.724)",
            "oklch(0.381 0.176 304.987)",
            "oklch(0.291 0.149 302.717)",
        ]),
        "fuchsia" => Some(&[
            "oklch(0.977 0.017 320.058)",
            "oklch(0.952 0.037 318.852)",
            "oklch(0.903 0.076 319.62)",
            "oklch(0.833 0.145 321.434)",
            "oklch(0.74 0.238 322.16)",
            "oklch(0.667 0.295 322.15)",
            "oklch(0.591 0.293 322.896)",
            "oklch(0.518 0.253 323.949)",
            "oklch(0.452 0.211 324.591)",
            "oklch(0.401 0.17 325.612)",
            "oklch(0.293 0.136 325.661)",
        ]),
        "pink" => Some(&[
            "oklch(0.971 0.014 343.198)",
            "oklch(0.948 0.028 342.258)",
            "oklch(0.899 0.061 343.231)",
            "oklch(0.823 0.12 346.018)",
            "oklch(0.718 0.202 349.761)",
            "oklch(0.656 0.241 354.308)",
            "oklch(0.592 0.249 0.584)",
            "oklch(0.525 0.223 3.958)",
            "oklch(0.459 0.187 3.815)",
            "oklch(0.408 0.153 2.432)",
            "oklch(0.284 0.109 3.907)",
        ]),
        "rose" => Some(&[
            "oklch(0.969 0.015 12.422)",
            "oklch(0.941 0.03 12.58)",
            "oklch(0.892 0.058 10.001)",
            "oklch(0.81 0.117 11.638)",
            "oklch(0.712 0.194 13.428)",
            "oklch(0.645 0.246 16.439)",
            "oklch(0.586 0.253 17.585)",
            "oklch(0.514 0.222 16.935)",
            "oklch(0.455 0.188 13.697)",
            "oklch(0.41 0.159 10.272)",
            "oklch(0.271 0.105 12.094)",
        ]),
        _ => None,
    }
}

/// Resolve a raw palette shade to its oklch value.
pub fn resolve_palette_shade(palette: &str, shade: &str) -> Option<String> {
    let shades = palette_shades(palette)?;
    let idx = shade_index(shade)?;
    Some(shades[idx].to_string())
}

/// Resolve a color token (without opacity) to a CSS value.
fn resolve_color_token(token: &str) -> Option<String> {
    if let Some(dot_idx) = token.find('.') {
        let namespace = &token[..dot_idx];
        let shade = &token[dot_idx + 1..];
        // Semantic namespaces take precedence (CSS custom properties)
        if is_color_namespace(namespace) {
            return Some(format!("var(--color-{namespace}-{shade})"));
        }
        // Raw Tailwind palette fallback (direct oklch values)
        if is_raw_palette(namespace) {
            return resolve_palette_shade(namespace, shade);
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

/// Font family stacks (Tailwind v4).
pub fn font_family_scale(key: &str) -> Option<&'static str> {
    match key {
        "mono" => Some("ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace"),
        "sans" => Some("ui-sans-serif, system-ui, sans-serif, \"Apple Color Emoji\", \"Segoe UI Emoji\", \"Segoe UI Symbol\", \"Noto Color Emoji\""),
        "serif" => Some("ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif"),
        _ => None,
    }
}

/// Multi-mode property resolution. Some properties (like `font`, `text`, `border`) resolve
/// to different CSS properties depending on the value.
/// Returns Some((css_properties, resolved_value)) if this is a multi-mode match.
pub fn resolve_multi_mode(property: &str, value: &str) -> Option<(Vec<&'static str>, String)> {
    match property {
        "font" => {
            // Check font-family first, then font-weight, then font-size
            if let Some(family) = font_family_scale(value) {
                return Some((vec!["font-family"], family.to_string()));
            }
            if let Some(weight) = font_weight_scale(value) {
                return Some((vec!["font-weight"], weight.to_string()));
            }
            if let Some(size) = font_size_scale(value) {
                return Some((vec!["font-size"], size.to_string()));
            }
            None
        }
        "text" => {
            // Check text-align first, then fall through to color
            if is_text_align_keyword(value) {
                return Some((vec!["text-align"], value.to_string()));
            }
            if let Some(color) = resolve_color(value) {
                return Some((vec!["color"], color));
            }
            None
        }
        "border" => {
            // Check border-width first, then fall through to border-color
            if is_border_width(value) {
                return Some((vec!["border-width"], format!("{value}px")));
            }
            if let Some(color) = resolve_color(value) {
                return Some((vec!["border-color"], color));
            }
            None
        }
        _ => None,
    }
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

    // ── resolve_multi_mode ──────────────────────────────────────

    #[test]
    fn multi_mode_font_bold_resolves_to_font_weight() {
        let result = resolve_multi_mode("font", "bold");
        assert!(result.is_some(), "font:bold should resolve");
        let (props, val) = result.unwrap();
        assert_eq!(props, vec!["font-weight"]);
        assert_eq!(val, "700");
    }

    #[test]
    fn multi_mode_font_semibold_resolves_to_font_weight() {
        let result = resolve_multi_mode("font", "semibold");
        assert!(result.is_some(), "font:semibold should resolve");
        let (props, val) = result.unwrap();
        assert_eq!(props, vec!["font-weight"]);
        assert_eq!(val, "600");
    }

    #[test]
    fn multi_mode_font_lg_resolves_to_font_size() {
        let result = resolve_multi_mode("font", "lg");
        assert!(result.is_some(), "font:lg should resolve");
        let (props, val) = result.unwrap();
        assert_eq!(props, vec!["font-size"]);
        assert_eq!(val, "1.125rem");
    }

    #[test]
    fn multi_mode_font_unknown_returns_none() {
        assert!(resolve_multi_mode("font", "notavalue").is_none());
    }

    #[test]
    fn multi_mode_text_center_resolves_to_text_align() {
        let result = resolve_multi_mode("text", "center");
        assert!(result.is_some(), "text:center should resolve");
        let (props, val) = result.unwrap();
        assert_eq!(props, vec!["text-align"]);
        assert_eq!(val, "center");
    }

    #[test]
    fn multi_mode_text_left_resolves_to_text_align() {
        let result = resolve_multi_mode("text", "left");
        assert!(result.is_some(), "text:left should resolve");
        let (props, val) = result.unwrap();
        assert_eq!(props, vec!["text-align"]);
        assert_eq!(val, "left");
    }

    #[test]
    fn multi_mode_text_foreground_resolves_to_color() {
        let result = resolve_multi_mode("text", "foreground");
        assert!(result.is_some(), "text:foreground should resolve");
        let (props, val) = result.unwrap();
        assert_eq!(props, vec!["color"]);
        assert_eq!(val, "var(--color-foreground)");
    }

    #[test]
    fn multi_mode_text_unknown_returns_none() {
        assert!(resolve_multi_mode("text", "notavalue").is_none());
    }

    #[test]
    fn multi_mode_border_numeric_resolves_to_border_width() {
        let result = resolve_multi_mode("border", "1");
        assert!(result.is_some(), "border:1 should resolve");
        let (props, val) = result.unwrap();
        assert_eq!(props, vec!["border-width"]);
        assert_eq!(val, "1px");
    }

    #[test]
    fn multi_mode_border_color_resolves_to_border_color() {
        let result = resolve_multi_mode("border", "primary");
        assert!(result.is_some(), "border:primary should resolve");
        let (props, val) = result.unwrap();
        assert_eq!(props, vec!["border-color"]);
        assert_eq!(val, "var(--color-primary)");
    }

    #[test]
    fn multi_mode_unknown_property_returns_none() {
        assert!(resolve_multi_mode("bg", "primary").is_none());
    }
}
