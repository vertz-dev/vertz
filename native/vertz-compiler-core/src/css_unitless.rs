//! CSS properties that accept unitless numeric values (no 'px' suffix).
//! Mirror of `packages/ui/src/css/unitless-properties.ts`. Parity enforced by
//! `packages/ui/src/css/__tests__/unitless-parity.test.ts`.

/// Return true if a camelCase CSS property name is unitless.
pub fn is_unitless(camel_property: &str) -> bool {
    matches!(
        camel_property,
        "animationIterationCount"
            | "aspectRatio"
            | "borderImageOutset"
            | "borderImageSlice"
            | "borderImageWidth"
            | "boxFlex"
            | "boxFlexGroup"
            | "boxOrdinalGroup"
            | "columnCount"
            | "columns"
            | "flex"
            | "flexGrow"
            | "flexPositive"
            | "flexShrink"
            | "flexNegative"
            | "flexOrder"
            | "gridArea"
            | "gridRow"
            | "gridRowEnd"
            | "gridRowSpan"
            | "gridRowStart"
            | "gridColumn"
            | "gridColumnEnd"
            | "gridColumnSpan"
            | "gridColumnStart"
            | "fontWeight"
            | "lineClamp"
            | "lineHeight"
            | "opacity"
            | "order"
            | "orphans"
            | "tabSize"
            | "widows"
            | "zIndex"
            | "zoom"
            | "fillOpacity"
            | "floodOpacity"
            | "stopOpacity"
            | "strokeDasharray"
            | "strokeDashoffset"
            | "strokeMiterlimit"
            | "strokeOpacity"
            | "strokeWidth"
            | "scale"
    )
}

/// Static list of all unitless property names (camelCase). Used by the parity
/// script and by tests.
pub const UNITLESS_PROPERTIES: &[&str] = &[
    "animationIterationCount",
    "aspectRatio",
    "borderImageOutset",
    "borderImageSlice",
    "borderImageWidth",
    "boxFlex",
    "boxFlexGroup",
    "boxOrdinalGroup",
    "columnCount",
    "columns",
    "flex",
    "flexGrow",
    "flexPositive",
    "flexShrink",
    "flexNegative",
    "flexOrder",
    "gridArea",
    "gridRow",
    "gridRowEnd",
    "gridRowSpan",
    "gridRowStart",
    "gridColumn",
    "gridColumnEnd",
    "gridColumnSpan",
    "gridColumnStart",
    "fontWeight",
    "lineClamp",
    "lineHeight",
    "opacity",
    "order",
    "orphans",
    "tabSize",
    "widows",
    "zIndex",
    "zoom",
    "fillOpacity",
    "floodOpacity",
    "stopOpacity",
    "strokeDasharray",
    "strokeDashoffset",
    "strokeMiterlimit",
    "strokeOpacity",
    "strokeWidth",
    "scale",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn common_unitless_properties_detected() {
        assert!(is_unitless("opacity"));
        assert!(is_unitless("zIndex"));
        assert!(is_unitless("lineHeight"));
        assert!(is_unitless("fontWeight"));
        assert!(is_unitless("flex"));
    }

    #[test]
    fn dimensional_properties_not_unitless() {
        assert!(!is_unitless("padding"));
        assert!(!is_unitless("margin"));
        assert!(!is_unitless("width"));
        assert!(!is_unitless("height"));
    }

    #[test]
    fn unknown_properties_not_unitless() {
        assert!(!is_unitless("notARealProperty"));
    }

    #[test]
    fn exported_list_matches_matcher() {
        for name in UNITLESS_PROPERTIES {
            assert!(is_unitless(name), "{} should be unitless", name);
        }
    }
}
