use oxc_ast::ast::*;
use oxc_ast_visit::Visit;

use crate::css_unitless;
use crate::magic_string::MagicString;

/// Classification of a css() call.
#[derive(Debug, PartialEq)]
enum CssCallKind {
    Static,
    Reactive,
}

/// Info about a detected css() call.
struct CssCallInfo {
    kind: CssCallKind,
    start: u32,
    end: u32,
    /// For static calls: extracted blocks with their `StyleBlock` trees.
    blocks: Vec<CssBlock>,
}

/// A single block in a css() call. Object-form only (`StyleBlock` tree).
struct CssBlock {
    name: String,
    nodes: Vec<StyleBlockNode>,
}

/// A node in a `StyleBlock` tree (object-form css() input).
enum StyleBlockNode {
    Declaration {
        /// Key as written in source: camelCase property or `--custom-prop`.
        camel_key: String,
        value: StyleDeclValue,
    },
    Selector {
        /// `&...` combinator (e.g. `&:hover`, `& > span`) or `@...` at-rule.
        selector: String,
        children: Vec<StyleBlockNode>,
    },
}

enum StyleDeclValue {
    String(String),
    Number(f64),
}

/// Transform static css() calls — extract CSS and replace with class name maps.
pub fn transform_css(ms: &mut MagicString, program: &Program, file_path: &str) -> String {
    let calls = find_css_calls(program);
    if calls.is_empty() {
        return String::new();
    }

    let mut all_css_rules: Vec<String> = Vec::new();

    // Process in reverse order so positions remain valid
    let mut sorted_calls = calls;
    sorted_calls.sort_by_key(|b| std::cmp::Reverse(b.start));

    for call in &sorted_calls {
        if call.kind != CssCallKind::Static {
            continue;
        }

        let mut class_names: Vec<(String, String)> = Vec::new();
        let mut css_rules: Vec<String> = Vec::new();

        for block in &call.blocks {
            let class_name = generate_class_name(file_path, &block.name);
            let rules = build_style_block_rules(&format!(".{class_name}"), &block.nodes);
            class_names.push((block.name.clone(), class_name));
            css_rules.extend(rules);
        }

        let call_css = css_rules.join("\n");
        all_css_rules.extend(css_rules);

        // Build replacement: Object.defineProperty({ blockName: '_hash', ... }, 'css', ...)
        // This preserves the `.css` property on the returned object, matching the runtime
        // css() contract (CSSOutput<T>) that consumers rely on.
        let replacement = build_replacement(&class_names, &call_css);
        ms.overwrite(call.start, call.end, &replacement);
    }

    all_css_rules.join("\n")
}

// ─── CSS Call Finder ──────────────────────────────────────────

struct CssCallFinder {
    calls: Vec<CssCallInfo>,
}

impl CssCallFinder {
    fn new() -> Self {
        Self { calls: Vec::new() }
    }
}

impl<'a> Visit<'a> for CssCallFinder {
    fn visit_call_expression(&mut self, call: &CallExpression<'a>) {
        if let Expression::Identifier(callee) = &call.callee {
            if callee.name.as_str() == "css" && !call.arguments.is_empty() {
                let first_arg = &call.arguments[0];
                if let Argument::ObjectExpression(obj) = first_arg {
                    let kind = classify_css_arg(obj);
                    let blocks = if kind == CssCallKind::Static {
                        extract_blocks(obj)
                    } else {
                        Vec::new()
                    };
                    self.calls.push(CssCallInfo {
                        kind,
                        start: call.span.start,
                        end: call.span.end,
                        blocks,
                    });
                }
            }
        }
        // Continue walking for nested calls
        oxc_ast_visit::walk::walk_call_expression(self, call);
    }
}

fn find_css_calls(program: &Program) -> Vec<CssCallInfo> {
    let mut finder = CssCallFinder::new();
    finder.visit_program(program);
    finder.calls
}

// ─── Classification ──────────────────────────────────────────

fn classify_css_arg(obj: &ObjectExpression) -> CssCallKind {
    for prop in &obj.properties {
        match prop {
            ObjectPropertyKind::ObjectProperty(p) => {
                if !is_static_css_value(&p.value) {
                    return CssCallKind::Reactive;
                }
            }
            ObjectPropertyKind::SpreadProperty(_) => return CssCallKind::Reactive,
        }
    }
    CssCallKind::Static
}

fn is_static_css_value(expr: &Expression) -> bool {
    match expr {
        Expression::ObjectExpression(obj) => is_static_style_block(obj),
        _ => false,
    }
}

/// Validate that an object expression can be extracted as a StyleBlock tree.
/// Accepts string/number declarations and nested `&`/`@` selector objects.
fn is_static_style_block(obj: &ObjectExpression) -> bool {
    if obj.properties.is_empty() {
        return false;
    }
    for prop in &obj.properties {
        match prop {
            ObjectPropertyKind::ObjectProperty(p) => {
                let key = extract_style_block_key(&p.key);
                let Some(key) = key else { return false };
                let is_selector = key.starts_with('&') || key.starts_with('@');
                if is_selector {
                    match &p.value {
                        Expression::ObjectExpression(inner) => {
                            if !is_static_style_block(inner) {
                                return false;
                            }
                        }
                        _ => return false,
                    }
                } else if !is_static_scalar_value(&p.value) {
                    return false;
                }
            }
            ObjectPropertyKind::SpreadProperty(_) => return false,
        }
    }
    true
}

/// Extract a StyleBlock key as a static string. Rejects numeric or computed keys.
fn extract_style_block_key(key: &PropertyKey) -> Option<String> {
    match key {
        PropertyKey::StaticIdentifier(id) => Some(id.name.to_string()),
        PropertyKey::StringLiteral(s) => Some(s.value.to_string()),
        _ => None,
    }
}

fn is_static_scalar_value(expr: &Expression) -> bool {
    match expr {
        Expression::StringLiteral(_) | Expression::NumericLiteral(_) => true,
        Expression::UnaryExpression(u) if u.operator == UnaryOperator::UnaryNegation => {
            matches!(&u.argument, Expression::NumericLiteral(_))
        }
        _ => false,
    }
}

// ─── Block Extraction ──────────────────────────────────────────

fn extract_blocks(obj: &ObjectExpression) -> Vec<CssBlock> {
    let mut blocks = Vec::new();
    for prop in &obj.properties {
        if let ObjectPropertyKind::ObjectProperty(p) = prop {
            let name = extract_property_name(&p.key);
            let nodes = if let Expression::ObjectExpression(block_obj) = &p.value {
                extract_style_block(block_obj)
            } else {
                Vec::new()
            };
            blocks.push(CssBlock { name, nodes });
        }
    }
    blocks
}

fn extract_style_block(obj: &ObjectExpression) -> Vec<StyleBlockNode> {
    let mut nodes = Vec::new();
    for prop in &obj.properties {
        if let ObjectPropertyKind::ObjectProperty(p) = prop {
            let Some(key) = extract_style_block_key(&p.key) else {
                continue;
            };
            let is_selector = key.starts_with('&') || key.starts_with('@');
            if is_selector {
                if let Expression::ObjectExpression(inner) = &p.value {
                    nodes.push(StyleBlockNode::Selector {
                        selector: key,
                        children: extract_style_block(inner),
                    });
                }
            } else if let Some(value) = extract_scalar_value(&p.value) {
                nodes.push(StyleBlockNode::Declaration {
                    camel_key: key,
                    value,
                });
            }
        }
    }
    nodes
}

fn extract_scalar_value(expr: &Expression) -> Option<StyleDeclValue> {
    match expr {
        Expression::StringLiteral(s) => Some(StyleDeclValue::String(s.value.to_string())),
        Expression::NumericLiteral(n) => Some(StyleDeclValue::Number(n.value)),
        Expression::UnaryExpression(u) if u.operator == UnaryOperator::UnaryNegation => {
            if let Expression::NumericLiteral(n) = &u.argument {
                Some(StyleDeclValue::Number(-n.value))
            } else {
                None
            }
        }
        _ => None,
    }
}

fn extract_property_name(key: &PropertyKey) -> String {
    match key {
        PropertyKey::StaticIdentifier(id) => id.name.to_string(),
        PropertyKey::StringLiteral(s) => s.value.to_string(),
        PropertyKey::NumericLiteral(n) => n.value.to_string(),
        _ => String::new(),
    }
}

// ─── Class Name Generation ──────────────────────────────────────

fn generate_class_name(file_path: &str, block_name: &str) -> String {
    let input = format!("{file_path}::{block_name}");
    let hash = djb2_hash(&input);
    format!("_{hash:08x}")
}

fn djb2_hash(s: &str) -> u32 {
    let mut hash: i32 = 5381;
    for byte in s.bytes() {
        hash = ((hash << 5).wrapping_add(hash)).wrapping_add(byte as i32);
    }
    hash as u32
}

// ─── camelCase → kebab-case ──────────────────────────────────────

/// camelCase → kebab-case, mirroring the TS implementation.
///
/// Matches every uppercase letter to `-<lower>`; the leading dash is desired
/// for vendor-prefix names like `WebkitTransform` → `-webkit-transform` or
/// `MsGridRow` → `-ms-grid-row`. The `ms*` prefix is capitalized first so the
/// leading dash is emitted the same way as `Webkit*` / `Moz*` prefixes.
fn camel_to_kebab(s: &str) -> String {
    let bytes = s.as_bytes();
    let needs_ms_fix =
        bytes.len() > 2 && bytes[0] == b'm' && bytes[1] == b's' && bytes[2].is_ascii_uppercase();
    let normalized: String = if needs_ms_fix {
        format!("Ms{}", &s[2..])
    } else {
        s.to_string()
    };

    let mut result = String::with_capacity(normalized.len() + 4);
    for c in normalized.chars() {
        if c.is_ascii_uppercase() {
            result.push('-');
            result.push(c.to_ascii_lowercase());
        } else {
            result.push(c);
        }
    }
    result
}

// ─── CSS Rule Building ──────────────────────────────────────────

fn format_css_rule(selector: &str, declarations: &[String]) -> String {
    let props: String = declarations
        .iter()
        .map(|d| format!("  {d}"))
        .collect::<Vec<_>>()
        .join("\n");
    format!("{selector} {{\n{props}\n}}")
}

// ─── StyleBlock (object-form) rendering ─────────────────────────────

/// Render a `StyleBlock` tree as CSS rules rooted at `class_selector`.
/// Mirrors the TS `renderStyleBlock` implementation in `packages/ui/src/css/css.ts`.
fn build_style_block_rules(class_selector: &str, nodes: &[StyleBlockNode]) -> Vec<String> {
    let mut declarations: Vec<String> = Vec::new();
    let mut nested_rules: Vec<String> = Vec::new();

    for node in nodes {
        match node {
            StyleBlockNode::Declaration { camel_key, value } => {
                let property = if camel_key.starts_with("--") {
                    camel_key.clone()
                } else {
                    camel_to_kebab(camel_key)
                };
                let formatted = format_style_value(camel_key, value);
                declarations.push(format!("{property}: {formatted};"));
            }
            StyleBlockNode::Selector { selector, children } => {
                if let Some(stripped) = selector.strip_prefix('@') {
                    let inner = build_style_block_rules(class_selector, children);
                    if !inner.is_empty() {
                        nested_rules.push(wrap_at_rule(&format!("@{stripped}"), &inner));
                    }
                } else {
                    let resolved = selector.replace('&', class_selector);
                    nested_rules.extend(build_style_block_rules(&resolved, children));
                }
            }
        }
    }

    let mut out = Vec::new();
    if !declarations.is_empty() {
        out.push(format_css_rule(class_selector, &declarations));
    }
    out.extend(nested_rules);
    out
}

fn format_style_value(camel_key: &str, value: &StyleDeclValue) -> String {
    match value {
        StyleDeclValue::String(s) => s.clone(),
        StyleDeclValue::Number(n) => {
            let num = format_number(*n);
            if *n == 0.0 || camel_key.starts_with("--") || css_unitless::is_unitless(camel_key) {
                num
            } else {
                format!("{num}px")
            }
        }
    }
}

fn format_number(n: f64) -> String {
    if n.is_finite() && n.fract() == 0.0 && n.abs() < 1e16 {
        format!("{}", n as i64)
    } else {
        format!("{n}")
    }
}

fn wrap_at_rule(at_rule: &str, inner_rules: &[String]) -> String {
    let indented: String = inner_rules
        .iter()
        .map(|rule| {
            rule.lines()
                .map(|l| format!("  {l}"))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!("{at_rule} {{\n{indented}\n}}")
}

// ─── Replacement Building ──────────────────────────────────────

fn build_replacement(class_names: &[(String, String)], css_text: &str) -> String {
    let entries: Vec<String> = class_names
        .iter()
        .map(|(name, class)| format!("{name}: '{class}'"))
        .collect();
    let obj = format!("{{ {} }}", entries.join(", "));

    // Attach the extracted CSS as a non-enumerable `.css` property, matching the
    // runtime css() behavior (Object.defineProperty with enumerable: false).
    let escaped_css = css_text
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
        .replace('\r', "\\r");
    format!("Object.defineProperty({obj}, 'css', {{ value: '{escaped_css}', enumerable: false }})")
}

#[cfg(test)]
mod tests {
    use super::*;
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::SourceType;

    fn transform(source: &str) -> (String, String) {
        let allocator = Allocator::default();
        let source_type = SourceType::tsx();
        let parser = Parser::new(&allocator, source, source_type);
        let parsed = parser.parse();
        let mut ms = crate::magic_string::MagicString::new(source);
        let css = transform_css(&mut ms, &parsed.program, "test.tsx");
        (ms.to_string(), css)
    }

    // ── No css() calls ───────────────────────────────────────────

    #[test]
    fn no_css_calls_returns_empty_css() {
        let (code, css) = transform("const x = 1;");
        assert_eq!(code, "const x = 1;");
        assert!(css.is_empty());
    }

    #[test]
    fn non_css_function_ignored() {
        let (code, css) = transform("notcss({ root: { padding: 16 } });");
        assert_eq!(code, "notcss({ root: { padding: 16 } });");
        assert!(css.is_empty());
    }

    #[test]
    fn css_with_no_arguments_ignored() {
        let (_, css) = transform("css();");
        assert!(css.is_empty());
    }

    #[test]
    fn css_with_non_object_argument_ignored() {
        let (_, css) = transform("css('string');");
        assert!(css.is_empty());
    }

    // ── Reactive classification ──────────────────────────────────

    #[test]
    fn reactive_spread_property_skipped() {
        let (code, css) = transform("const base = {}; const s = css({ ...base });");
        assert!(css.is_empty());
        assert!(
            code.contains("css("),
            "reactive should not be replaced: {}",
            code
        );
    }

    #[test]
    fn reactive_non_object_value_skipped() {
        let (code, css) = transform("const s = css({ root: someVar });");
        assert!(css.is_empty());
        assert!(
            code.contains("css("),
            "reactive should not be replaced: {}",
            code
        );
    }

    #[test]
    fn reactive_array_value_skipped() {
        let (code, css) = transform("const s = css({ root: ['flex'] });");
        assert!(css.is_empty());
        assert!(
            code.contains("css("),
            "array-form should not be extracted: {}",
            code
        );
    }

    #[test]
    fn reactive_string_value_skipped() {
        let (_, css) = transform("const s = css({ root: 'flex' });");
        assert!(css.is_empty());
    }

    // ── Block extraction: property name variants ─────────────────

    #[test]
    fn string_literal_property_key() {
        let source = r#"const s = css({ "root": { padding: 16 } });"#;
        let (code, css) = transform(source);
        assert!(!css.is_empty());
        assert!(code.contains("root:"), "code: {}", code);
    }

    #[test]
    fn numeric_property_key() {
        let source = r#"const s = css({ 0: { padding: 16 } });"#;
        let (_, css) = transform(source);
        assert!(!css.is_empty());
    }

    // ── Class name deterministic ─────────────────────────────────

    #[test]
    fn class_name_is_deterministic() {
        let (code1, _) = transform("const s = css({ root: { padding: 16 } });");
        let (code2, _) = transform("const s = css({ root: { padding: 16 } });");
        assert_eq!(code1, code2);
    }

    /// Parity gate: `generate_class_name(filePath, blockName)` must produce
    /// exactly the same class name as the TS runtime's
    /// `generateClassName(filePath, blockName, "")`. The expected hashes here
    /// mirror the ones in
    /// `packages/ui/src/css/__tests__/class-name-parity.test.ts`. If one side
    /// drifts, both tests fail and you must update both to match.
    #[test]
    fn class_name_parity_matches_ts_runtime() {
        let cases: &[(&str, &str, &str)] = &[
            (
                "packages/landing/src/components/hero.tsx",
                "badgeDotPing",
                "_d1f23282",
            ),
            (
                "packages/ui/src/css/__tests__/fixtures/example.tsx",
                "root",
                "_dbd94807",
            ),
            ("a.tsx", "b", "_ec9614e9"),
        ];
        for (file_path, block_name, expected) in cases {
            let actual = generate_class_name(file_path, block_name);
            assert_eq!(
                &actual, expected,
                "class-name parity drift: file_path={file_path} block_name={block_name}",
            );
        }
    }

    #[test]
    fn different_block_names_different_hashes() {
        let (code, _) =
            transform("const s = css({ root: { padding: 16 }, header: { display: 'grid' } });");
        assert!(code.contains("root:"), "code: {}", code);
        assert!(code.contains("header:"), "code: {}", code);
    }

    // ── Multiple blocks in one call ──────────────────────────────

    #[test]
    fn multiple_blocks_in_one_call() {
        let (code, css) =
            transform("const s = css({ root: { display: 'flex' }, item: { padding: 16 } });");
        assert!(css.contains("display: flex;"), "css: {}", css);
        assert!(css.contains("padding: 16px;"), "css: {}", css);
        assert!(code.contains("root:"), "code: {}", code);
        assert!(code.contains("item:"), "code: {}", code);
    }

    // ── Multiple css() calls in one file ─────────────────────────

    #[test]
    fn multiple_css_calls_in_file() {
        let source = r#"
const a = css({ root: { display: 'flex' } });
const b = css({ root: { display: 'grid' } });
"#;
        let (code, css) = transform(source);
        assert!(css.contains("display: flex;"), "css: {}", css);
        assert!(css.contains("display: grid;"), "css: {}", css);
        assert!(
            !code.contains("css("),
            "all calls should be replaced: {}",
            code
        );
    }

    // ── Nested css() call found by visitor ───────────────────────

    #[test]
    fn nested_css_call_in_arrow_function() {
        let source = "const fn = () => css({ root: { display: 'flex' } });";
        let (code, css) = transform(source);
        assert!(!css.is_empty(), "nested call should be found: css={}", css);
        assert!(!code.contains("css("), "should be replaced: {}", code);
    }

    // ── Replacement includes .css property ─────────────────────

    #[test]
    fn replacement_includes_css_property() {
        let (code, _) = transform("const s = css({ root: { display: 'flex', padding: 16 } });");
        assert!(
            code.contains("Object.defineProperty("),
            "replacement should use Object.defineProperty: {}",
            code
        );
        assert!(
            code.contains("'css'"),
            "replacement should define 'css' property: {}",
            code
        );
        assert!(
            code.contains("enumerable: false"),
            "css property should be non-enumerable: {}",
            code
        );
        assert!(
            code.contains("display: flex;"),
            "css property value should contain the CSS: {}",
            code
        );
    }

    // ── Full integration via compile() ───────────────────────────

    #[test]
    fn full_compile_extracts_css() {
        let source =
            r#"const styles = css({ root: { display: 'flex', padding: 16, color: 'red' } });"#;
        let result = crate::compile(
            source,
            crate::CompileOptions {
                filename: Some("component.tsx".to_string()),
                ..Default::default()
            },
        );
        assert!(
            result.css.is_some(),
            "should extract CSS: code={}",
            result.code
        );
        let css = result.css.unwrap();
        assert!(css.contains("display: flex;"), "css: {}", css);
        assert!(css.contains("padding: 16px;"), "css: {}", css);
        assert!(css.contains("color: red;"), "css: {}", css);
    }

    // ── Object-form css() input (StyleBlock) ──────────────────────────

    #[test]
    fn object_form_basic_declaration() {
        let source = r#"const s = css({ card: { padding: 16, color: 'red' } });"#;
        let (code, css) = transform(source);
        assert!(css.contains("padding: 16px;"), "css: {}", css);
        assert!(css.contains("color: red;"), "css: {}", css);
        assert!(code.contains("card:"), "code: {}", code);
        assert!(code.contains("Object.defineProperty("), "code: {}", code);
    }

    #[test]
    fn object_form_unitless_property_no_px() {
        let source = r#"const s = css({ card: { lineHeight: 1.5, opacity: 1, zIndex: 10 } });"#;
        let (_, css) = transform(source);
        assert!(css.contains("line-height: 1.5;"), "css: {}", css);
        assert!(css.contains("opacity: 1;"), "css: {}", css);
        assert!(css.contains("z-index: 10;"), "css: {}", css);
        assert!(!css.contains("px"), "unitless should not have px: {}", css);
    }

    #[test]
    fn object_form_zero_is_unitless() {
        let source = r#"const s = css({ card: { padding: 0 } });"#;
        let (_, css) = transform(source);
        assert!(css.contains("padding: 0;"), "css: {}", css);
        assert!(!css.contains("0px"), "0 should not get px suffix: {}", css);
    }

    #[test]
    fn object_form_camel_to_kebab() {
        let source = r#"const s = css({ card: { backgroundColor: 'blue', gridTemplateColumns: 'repeat(3, 1fr)' } });"#;
        let (_, css) = transform(source);
        assert!(css.contains("background-color: blue;"), "css: {}", css);
        assert!(
            css.contains("grid-template-columns: repeat(3, 1fr);"),
            "css: {}",
            css
        );
    }

    #[test]
    fn object_form_custom_property_passthrough() {
        let source = r#"const s = css({ card: { '--tone': 'muted', color: 'var(--tone)' } });"#;
        let (_, css) = transform(source);
        assert!(css.contains("--tone: muted;"), "css: {}", css);
        assert!(css.contains("color: var(--tone);"), "css: {}", css);
    }

    #[test]
    fn object_form_vendor_prefix_webkit() {
        let source =
            r#"const s = css({ card: { WebkitTransform: 'none', MozAppearance: 'none' } });"#;
        let (_, css) = transform(source);
        assert!(css.contains("-webkit-transform: none;"), "css: {}", css);
        assert!(css.contains("-moz-appearance: none;"), "css: {}", css);
    }

    #[test]
    fn object_form_nested_ampersand_selector() {
        let source = r#"const s = css({ card: { color: 'red', '&:hover': { color: 'blue' } } });"#;
        let (_, css) = transform(source);
        assert!(css.contains("color: red;"), "css: {}", css);
        assert!(css.contains(":hover"), "css: {}", css);
        assert!(css.contains("color: blue;"), "css: {}", css);
    }

    #[test]
    fn object_form_at_media_rule() {
        let source = r#"const s = css({ card: { padding: 8, '@media (min-width: 768px)': { padding: 16 } } });"#;
        let (_, css) = transform(source);
        assert!(css.contains("@media (min-width: 768px)"), "css: {}", css);
        assert!(css.contains("padding: 8px;"), "css: {}", css);
        assert!(css.contains("padding: 16px;"), "css: {}", css);
    }

    #[test]
    fn object_form_deeply_nested() {
        let source = r#"const s = css({ card: { '&:hover': { '& > span': { color: 'red' } } } });"#;
        let (_, css) = transform(source);
        assert!(css.contains(":hover > span"), "css: {}", css);
        assert!(css.contains("color: red;"), "css: {}", css);
    }

    #[test]
    fn object_form_reactive_when_value_is_variable() {
        let source = r#"const s = css({ card: { color: someVar } });"#;
        let (code, css) = transform(source);
        assert!(css.is_empty(), "reactive should not extract CSS");
        assert!(code.contains("css("), "reactive should not be replaced");
    }

    #[test]
    fn object_form_reactive_when_nested_has_spread() {
        let source = r#"const s = css({ card: { '&:hover': { ...base } } });"#;
        let (_, css) = transform(source);
        assert!(css.is_empty());
    }

    #[test]
    fn object_form_reactive_when_spread() {
        let source = r#"const s = css({ card: { ...base } });"#;
        let (_, css) = transform(source);
        assert!(css.is_empty());
    }

    #[test]
    fn object_form_class_name_deterministic() {
        let (code1, _) = transform("const s = css({ card: { padding: 16 } });");
        let (code2, _) = transform("const s = css({ card: { padding: 16 } });");
        assert_eq!(code1, code2);
    }

    #[test]
    fn object_form_empty_block_is_reactive() {
        let source = r#"const s = css({ card: {} });"#;
        let (_, css) = transform(source);
        // Empty object block has no usable declarations → treated as reactive.
        assert!(css.is_empty());
    }

    #[test]
    fn object_form_negative_numeric_value() {
        let source = r#"const s = css({ card: { marginTop: -8 } });"#;
        let (_, css) = transform(source);
        assert!(css.contains("margin-top: -8px;"), "css: {}", css);
    }
}
