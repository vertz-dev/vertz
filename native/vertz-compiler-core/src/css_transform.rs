use oxc_ast::ast::*;
use oxc_ast_visit::Visit;

use crate::css_token_tables;
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
    /// For static calls: extracted blocks with their entries.
    blocks: Vec<CssBlock>,
}

/// A single block in a css() call: { blockName: ['shorthand', ...] }
struct CssBlock {
    name: String,
    entries: Vec<CssEntry>,
}

/// An entry in a css block's array value.
enum CssEntry {
    /// A shorthand string like 'bg:primary', 'p:4', 'flex'
    Shorthand(String),
    /// A nested object with selector → entries or raw declarations
    Nested {
        selector: String,
        entries: Vec<CssEntry>,
        raw_declarations: Vec<(String, String)>,
    },
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
    sorted_calls.sort_by(|a, b| b.start.cmp(&a.start));

    for call in &sorted_calls {
        if call.kind != CssCallKind::Static {
            continue;
        }

        let mut class_names: Vec<(String, String)> = Vec::new();
        let mut css_rules: Vec<String> = Vec::new();

        for block in &call.blocks {
            let class_name = generate_class_name(file_path, &block.name);
            let rules = build_css_rules(&class_name, &block.entries);
            class_names.push((block.name.clone(), class_name));
            css_rules.extend(rules);
        }

        all_css_rules.extend(css_rules);

        // Build replacement: { blockName: '_hash', ... }
        let replacement = build_replacement(&class_names);
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
        Expression::ArrayExpression(arr) => {
            for el in &arr.elements {
                match el {
                    ArrayExpressionElement::StringLiteral(_) => {}
                    ArrayExpressionElement::ObjectExpression(obj) => {
                        if !is_static_nested_object(obj) {
                            return false;
                        }
                    }
                    _ => return false,
                }
            }
            true
        }
        _ => false,
    }
}

fn is_static_nested_object(obj: &ObjectExpression) -> bool {
    for prop in &obj.properties {
        match prop {
            ObjectPropertyKind::ObjectProperty(p) => match &p.value {
                Expression::ArrayExpression(arr) => {
                    for el in &arr.elements {
                        match el {
                            ArrayExpressionElement::StringLiteral(_) => {}
                            ArrayExpressionElement::ObjectExpression(inner) => {
                                if !is_static_css_declarations(inner) {
                                    return false;
                                }
                            }
                            _ => return false,
                        }
                    }
                }
                Expression::ObjectExpression(inner) => {
                    if !is_static_css_declarations(inner) {
                        return false;
                    }
                }
                _ => return false,
            },
            ObjectPropertyKind::SpreadProperty(_) => return false,
        }
    }
    true
}

fn is_static_css_declarations(obj: &ObjectExpression) -> bool {
    if obj.properties.is_empty() {
        return false;
    }
    for prop in &obj.properties {
        match prop {
            ObjectPropertyKind::ObjectProperty(p) => {
                if !matches!(&p.value, Expression::StringLiteral(_)) {
                    return false;
                }
            }
            ObjectPropertyKind::SpreadProperty(_) => return false,
        }
    }
    true
}

// ─── Block Extraction ──────────────────────────────────────────

fn extract_blocks(obj: &ObjectExpression) -> Vec<CssBlock> {
    let mut blocks = Vec::new();
    for prop in &obj.properties {
        if let ObjectPropertyKind::ObjectProperty(p) = prop {
            let name = extract_property_name(&p.key);
            let entries = extract_entries(&p.value);
            blocks.push(CssBlock { name, entries });
        }
    }
    blocks
}

fn extract_property_name(key: &PropertyKey) -> String {
    match key {
        PropertyKey::StaticIdentifier(id) => id.name.to_string(),
        PropertyKey::StringLiteral(s) => s.value.to_string(),
        PropertyKey::NumericLiteral(n) => n.value.to_string(),
        _ => String::new(),
    }
}

fn extract_entries(expr: &Expression) -> Vec<CssEntry> {
    let Expression::ArrayExpression(arr) = expr else {
        return Vec::new();
    };

    let mut entries = Vec::new();
    for el in &arr.elements {
        match el {
            ArrayExpressionElement::StringLiteral(s) => {
                entries.push(CssEntry::Shorthand(s.value.to_string()));
            }
            ArrayExpressionElement::ObjectExpression(obj) => {
                for prop in &obj.properties {
                    if let ObjectPropertyKind::ObjectProperty(p) = prop {
                        let selector = extract_property_key_string(&p.key);
                        let (nested_entries, raw_decls) = extract_nested_value(&p.value);
                        entries.push(CssEntry::Nested {
                            selector,
                            entries: nested_entries,
                            raw_declarations: raw_decls,
                        });
                    }
                }
            }
            _ => {}
        }
    }
    entries
}

fn extract_property_key_string(key: &PropertyKey) -> String {
    match key {
        PropertyKey::StaticIdentifier(id) => id.name.to_string(),
        PropertyKey::StringLiteral(s) => s.value.to_string(),
        _ => String::new(),
    }
}

fn extract_nested_value(expr: &Expression) -> (Vec<CssEntry>, Vec<(String, String)>) {
    let mut entries = Vec::new();
    let mut raw_decls = Vec::new();

    match expr {
        Expression::ArrayExpression(arr) => {
            for el in &arr.elements {
                match el {
                    ArrayExpressionElement::StringLiteral(s) => {
                        entries.push(CssEntry::Shorthand(s.value.to_string()));
                    }
                    ArrayExpressionElement::ObjectExpression(obj) => {
                        raw_decls.extend(extract_css_declarations(obj));
                    }
                    _ => {}
                }
            }
        }
        Expression::ObjectExpression(obj) => {
            raw_decls.extend(extract_css_declarations(obj));
        }
        _ => {}
    }

    (entries, raw_decls)
}

fn extract_css_declarations(obj: &ObjectExpression) -> Vec<(String, String)> {
    let mut decls = Vec::new();
    for prop in &obj.properties {
        if let ObjectPropertyKind::ObjectProperty(p) = prop {
            if let Expression::StringLiteral(val) = &p.value {
                let name = extract_property_key_string(&p.key);
                decls.push((name, val.value.to_string()));
            }
        }
    }
    decls
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

// ─── CSS Rule Building ──────────────────────────────────────────

fn build_css_rules(class_name: &str, entries: &[CssEntry]) -> Vec<String> {
    let mut rules: Vec<String> = Vec::new();
    let mut base_decls: Vec<String> = Vec::new();
    let mut pseudo_decls: Vec<(String, Vec<String>)> = Vec::new();

    for entry in entries {
        match entry {
            CssEntry::Shorthand(value) => {
                if let Some(parsed) = parse_shorthand(value) {
                    if let Some(resolved) = resolve_shorthand(&parsed) {
                        if let Some(pseudo) = &parsed.pseudo {
                            // Find or create pseudo entry
                            if let Some(existing) =
                                pseudo_decls.iter_mut().find(|(p, _)| p == pseudo)
                            {
                                existing.1.extend(resolved);
                            } else {
                                pseudo_decls.push((pseudo.clone(), resolved));
                            }
                        } else {
                            base_decls.extend(resolved);
                        }
                    }
                }
            }
            CssEntry::Nested {
                selector,
                entries: nested_entries,
                raw_declarations,
            } => {
                let mut nested_decls: Vec<String> = Vec::new();
                for ne in nested_entries {
                    if let CssEntry::Shorthand(value) = ne {
                        if let Some(parsed) = parse_shorthand(value) {
                            if let Some(resolved) = resolve_shorthand(&parsed) {
                                nested_decls.extend(resolved);
                            }
                        }
                    }
                }
                for (prop, val) in raw_declarations {
                    nested_decls.push(format!("{prop}: {val};"));
                }
                if !nested_decls.is_empty() {
                    if selector.starts_with('@') {
                        rules.push(format_at_rule(
                            selector,
                            &format!(".{class_name}"),
                            &nested_decls,
                        ));
                    } else {
                        let resolved_selector = selector.replace('&', &format!(".{class_name}"));
                        rules.push(format_css_rule(&resolved_selector, &nested_decls));
                    }
                }
            }
        }
    }

    if !base_decls.is_empty() {
        rules.insert(0, format_css_rule(&format!(".{class_name}"), &base_decls));
    }

    for (pseudo, decls) in &pseudo_decls {
        rules.push(format_css_rule(&format!(".{class_name}{pseudo}"), decls));
    }

    rules
}

fn format_css_rule(selector: &str, declarations: &[String]) -> String {
    let props: String = declarations
        .iter()
        .map(|d| format!("  {d}"))
        .collect::<Vec<_>>()
        .join("\n");
    format!("{selector} {{\n{props}\n}}")
}

fn format_at_rule(at_rule: &str, class_selector: &str, declarations: &[String]) -> String {
    let props: String = declarations
        .iter()
        .map(|d| format!("    {d}"))
        .collect::<Vec<_>>()
        .join("\n");
    format!("{at_rule} {{\n  {class_selector} {{\n{props}\n  }}\n}}")
}

// ─── Shorthand Parsing ──────────────────────────────────────────

struct ParsedShorthand {
    property: String,
    value: Option<String>,
    pseudo: Option<String>,
}

fn parse_shorthand(input: &str) -> Option<ParsedShorthand> {
    let parts: Vec<&str> = input.split(':').collect();
    match parts.len() {
        1 => Some(ParsedShorthand {
            property: parts[0].to_string(),
            value: None,
            pseudo: None,
        }),
        2 => {
            if css_token_tables::is_pseudo_prefix(parts[0]) {
                Some(ParsedShorthand {
                    property: parts[1].to_string(),
                    value: None,
                    pseudo: css_token_tables::pseudo_map(parts[0]).map(|s| s.to_string()),
                })
            } else {
                Some(ParsedShorthand {
                    property: parts[0].to_string(),
                    value: Some(parts[1].to_string()),
                    pseudo: None,
                })
            }
        }
        3 => {
            if css_token_tables::is_pseudo_prefix(parts[0]) {
                Some(ParsedShorthand {
                    property: parts[1].to_string(),
                    value: Some(parts[2].to_string()),
                    pseudo: css_token_tables::pseudo_map(parts[0]).map(|s| s.to_string()),
                })
            } else {
                None
            }
        }
        _ => None,
    }
}

fn resolve_shorthand(parsed: &ParsedShorthand) -> Option<Vec<String>> {
    let property = &parsed.property;

    // Check keyword map first (value-less keywords)
    if parsed.value.is_none() {
        if let Some(decls) = css_token_tables::keyword_map(property) {
            return Some(decls.iter().map(|(p, v)| format!("{p}: {v};")).collect());
        }
        return None;
    }

    let value = parsed.value.as_deref().unwrap();

    if let Some((css_properties, value_type)) = css_token_tables::property_map(property) {
        let resolved = css_token_tables::resolve_value(value, value_type, property)?;
        return Some(
            css_properties
                .iter()
                .map(|p| format!("{p}: {resolved};"))
                .collect(),
        );
    }

    None
}

// ─── Replacement Building ──────────────────────────────────────

fn build_replacement(class_names: &[(String, String)]) -> String {
    let entries: Vec<String> = class_names
        .iter()
        .map(|(name, class)| format!("{name}: '{class}'"))
        .collect();
    format!("{{ {} }}", entries.join(", "))
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
        let (code, css) = transform("notcss({ root: ['flex'] });");
        assert_eq!(code, "notcss({ root: ['flex'] });");
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

    // ── Static classification ────────────────────────────────────

    #[test]
    fn static_css_call_extracts_css_and_replaces() {
        let (code, css) = transform("const s = css({ root: ['flex', 'p:4'] });");
        // Code should be replaced with class name map
        assert!(code.contains("root:"), "should have replacement: {}", code);
        assert!(code.contains("'_"), "should have hash class: {}", code);
        // CSS should contain the declarations
        assert!(css.contains("display: flex;"), "css: {}", css);
        assert!(css.contains("padding: 1rem;"), "css: {}", css);
    }

    #[test]
    fn reactive_spread_property_skipped() {
        let (code, css) = transform("const base = {}; const s = css({ ...base });");
        assert!(css.is_empty());
        // Original code should remain (spread = reactive, not transformed)
        assert!(
            code.contains("css("),
            "reactive should not be replaced: {}",
            code
        );
    }

    #[test]
    fn reactive_non_array_value_skipped() {
        let (code, css) = transform("const s = css({ root: someVar });");
        assert!(css.is_empty());
        assert!(
            code.contains("css("),
            "reactive should not be replaced: {}",
            code
        );
    }

    #[test]
    fn reactive_array_with_non_string_element_skipped() {
        let (code, css) = transform("const s = css({ root: [someVar] });");
        assert!(css.is_empty());
        assert!(
            code.contains("css("),
            "reactive should not be replaced: {}",
            code
        );
    }

    // ── Static nested objects ────────────────────────────────────

    #[test]
    fn static_nested_object_with_string_values_is_static() {
        let source = r#"const s = css({ root: ['flex', { '&:hover': { color: 'red' } }] });"#;
        let (code, css) = transform(source);
        assert!(!css.is_empty(), "nested static should produce CSS");
        assert!(code.contains("'_"), "should have hash: {}", code);
    }

    #[test]
    fn nested_object_with_non_string_value_is_reactive() {
        let source = r#"const s = css({ root: [{ '&:hover': { color: someVar } }] });"#;
        let (code, css) = transform(source);
        assert!(css.is_empty());
        assert!(code.contains("css("), "should remain reactive: {}", code);
    }

    #[test]
    fn nested_object_with_spread_is_reactive() {
        let source = r#"const s = css({ root: [{ ...base }] });"#;
        let (_code, css) = transform(source);
        assert!(css.is_empty());
    }

    #[test]
    fn nested_object_array_value_with_string_literals_is_static() {
        let source = r#"const s = css({ root: [{ '&:hover': ['bg:primary'] }] });"#;
        let (_code, css) = transform(source);
        assert!(!css.is_empty(), "should be static: css={}", css);
    }

    #[test]
    fn nested_object_array_with_non_string_is_reactive() {
        let source = r#"const s = css({ root: [{ '&:hover': [someVar] }] });"#;
        let (_code, css) = transform(source);
        assert!(css.is_empty());
    }

    #[test]
    fn empty_declarations_object_is_not_static() {
        let source = r#"const s = css({ root: [{}] });"#;
        let (_code, css) = transform(source);
        assert!(css.is_empty(), "empty decls should be reactive");
    }

    #[test]
    fn nested_object_with_inner_spread_is_reactive() {
        let source = r#"const s = css({ root: [{ '&:hover': { ...base } }] });"#;
        let (_, css) = transform(source);
        assert!(css.is_empty());
    }

    // ── Block extraction: property name variants ─────────────────

    #[test]
    fn string_literal_property_key() {
        let source = r#"const s = css({ "root": ['flex'] });"#;
        let (code, css) = transform(source);
        assert!(!css.is_empty());
        assert!(code.contains("root:"), "code: {}", code);
    }

    #[test]
    fn numeric_property_key() {
        let source = r#"const s = css({ 0: ['flex'] });"#;
        let (_, css) = transform(source);
        assert!(!css.is_empty());
    }

    // ── Shorthand parsing ────────────────────────────────────────

    #[test]
    fn keyword_shorthand() {
        let (_, css) = transform("const s = css({ root: ['flex'] });");
        assert!(css.contains("display: flex;"), "css: {}", css);
    }

    #[test]
    fn property_value_shorthand() {
        let (_, css) = transform("const s = css({ root: ['bg:primary'] });");
        assert!(
            css.contains("background-color: var(--color-primary);"),
            "css: {}",
            css
        );
    }

    #[test]
    fn pseudo_keyword_shorthand() {
        let (_, css) = transform("const s = css({ root: ['hover:flex'] });");
        assert!(css.contains(":hover"), "css: {}", css);
        assert!(css.contains("display: flex;"), "css: {}", css);
    }

    #[test]
    fn pseudo_property_value_shorthand() {
        let (_, css) = transform("const s = css({ root: ['hover:bg:primary'] });");
        assert!(css.contains(":hover"), "css: {}", css);
        assert!(
            css.contains("background-color: var(--color-primary);"),
            "css: {}",
            css
        );
    }

    #[test]
    fn four_part_shorthand_ignored() {
        // parse_shorthand returns None for 4+ parts
        let (_, css) = transform("const s = css({ root: ['a:b:c:d'] });");
        // No valid shorthand → no CSS for that entry, but block still created
        // The rule might be empty (just the class rule won't have declarations)
        // Key point: doesn't crash
        assert!(
            !css.contains("a:"),
            "should not produce CSS for invalid: {}",
            css
        );
    }

    #[test]
    fn three_part_non_pseudo_first_ignored() {
        // "bg:p:4" — bg is not a pseudo prefix, so parse_shorthand returns None
        let (_, css) = transform("const s = css({ root: ['bg:p:4'] });");
        assert!(
            !css.contains("padding"),
            "non-pseudo 3-part should be ignored: {}",
            css
        );
    }

    #[test]
    fn unknown_keyword_produces_no_css() {
        let (_, css) = transform("const s = css({ root: ['unknownkw'] });");
        // Unknown keyword → resolve_shorthand returns None → no declaration
        assert!(
            !css.contains("unknownkw"),
            "unknown keyword should not appear: {}",
            css
        );
    }

    #[test]
    fn unknown_property_with_value_produces_no_css() {
        let (_, css) = transform("const s = css({ root: ['foo:bar'] });");
        assert!(!css.contains("foo"), "unknown property: {}", css);
    }

    // ── Same pseudo grouped ──────────────────────────────────────

    #[test]
    fn same_pseudo_declarations_grouped() {
        let (_, css) =
            transform("const s = css({ root: ['hover:bg:primary', 'hover:text:foreground'] });");
        // Both should be in the same :hover rule
        let hover_count = css.matches(":hover").count();
        assert_eq!(hover_count, 1, "should group into one :hover rule: {}", css);
    }

    // ── Nested entry: selector with & replacement ────────────────

    #[test]
    fn nested_entry_with_ampersand_selector() {
        let source = r#"const s = css({ root: [{ '& > span': ['flex'] }] });"#;
        let (_, css) = transform(source);
        assert!(css.contains("> span"), "css: {}", css);
        assert!(css.contains("display: flex;"), "css: {}", css);
    }

    // ── Nested entry: at-rule ────────────────────────────────────

    #[test]
    fn nested_entry_with_at_rule() {
        let source = r#"const s = css({ root: [{ '@media (min-width: 768px)': ['flex'] }] });"#;
        let (_, css) = transform(source);
        assert!(css.contains("@media (min-width: 768px)"), "css: {}", css);
        assert!(css.contains("display: flex;"), "css: {}", css);
    }

    // ── Nested entry: raw declarations ───────────────────────────

    #[test]
    fn nested_raw_declarations() {
        let source = r#"const s = css({ root: [{ '&:focus': { outline: 'none', border: '1px solid red' } }] });"#;
        let (_, css) = transform(source);
        assert!(css.contains("outline: none;"), "css: {}", css);
        assert!(css.contains("border: 1px solid red;"), "css: {}", css);
    }

    // ── Nested entry: mixed shorthands + raw declarations ────────

    #[test]
    fn nested_mixed_shorthands_and_raw() {
        let source = r#"const s = css({ root: [{ '&:hover': ['flex', { color: 'red' }] }] });"#;
        let (_, css) = transform(source);
        assert!(css.contains("display: flex;"), "css: {}", css);
        assert!(css.contains("color: red;"), "css: {}", css);
    }

    // ── Empty nested declarations → no rule ──────────────────────

    #[test]
    fn empty_nested_entry_no_rule() {
        // Nested with shorthands that don't resolve → no declarations → no rule
        let source = r#"const s = css({ root: [{ '&:hover': ['unknownkw'] }] });"#;
        let (_, css) = transform(source);
        assert!(
            !css.contains(":hover"),
            "empty nested should not produce rule: {}",
            css
        );
    }

    // ── Class name deterministic ─────────────────────────────────

    #[test]
    fn class_name_is_deterministic() {
        let (code1, _) = transform("const s = css({ root: ['flex'] });");
        let (code2, _) = transform("const s = css({ root: ['flex'] });");
        assert_eq!(code1, code2);
    }

    #[test]
    fn different_block_names_different_hashes() {
        let (code, _) = transform("const s = css({ root: ['flex'], header: ['grid'] });");
        // Both block names should appear with different hashes
        assert!(code.contains("root:"), "code: {}", code);
        assert!(code.contains("header:"), "code: {}", code);
    }

    // ── Multiple blocks in one call ──────────────────────────────

    #[test]
    fn multiple_blocks_in_one_call() {
        let (code, css) = transform("const s = css({ root: ['flex'], item: ['p:4'] });");
        assert!(css.contains("display: flex;"), "css: {}", css);
        assert!(css.contains("padding: 1rem;"), "css: {}", css);
        assert!(code.contains("root:"), "code: {}", code);
        assert!(code.contains("item:"), "code: {}", code);
    }

    // ── Multiple css() calls in one file ─────────────────────────

    #[test]
    fn multiple_css_calls_in_file() {
        let source = r#"
const a = css({ root: ['flex'] });
const b = css({ root: ['grid'] });
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

    // ── Non-array entry value → empty entries ────────────────────

    #[test]
    fn non_array_block_value_produces_empty_entries() {
        // Block value is a string, not an array → extract_entries returns empty
        // But the block still exists → classify sees string which is not an array → Reactive
        let (_, css) = transform("const s = css({ root: 'flex' });");
        assert!(css.is_empty());
    }

    // ── Nested css() call found by visitor ───────────────────────

    #[test]
    fn nested_css_call_in_arrow_function() {
        let source = "const fn = () => css({ root: ['flex'] });";
        let (code, css) = transform(source);
        assert!(!css.is_empty(), "nested call should be found: css={}", css);
        assert!(!code.contains("css("), "should be replaced: {}", code);
    }

    // ── Nested value: other expression type → empty ──────────────

    #[test]
    fn nested_value_non_array_non_object() {
        // If nested value is a string literal (not array/object), extract_nested_value
        // returns empty entries and empty raw_decls
        let source = r#"const s = css({ root: [{ '&:hover': 'invalid' }] });"#;
        // This won't be static because nested value is a string (not array/obj of strings)
        let (_, css) = transform(source);
        assert!(css.is_empty());
    }

    // ── Property with multiple CSS properties (e.g., px → padding-inline) ──

    #[test]
    fn multi_property_shorthand() {
        let (_, css) = transform("const s = css({ root: ['px:4'] });");
        assert!(css.contains("padding-inline: 1rem;"), "css: {}", css);
    }

    // ── Full integration via compile() ───────────────────────────

    #[test]
    fn full_compile_extracts_css() {
        let source = r#"const styles = css({ root: ['flex', 'p:4', 'bg:primary'] });"#;
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
        assert!(css.contains("padding: 1rem;"), "css: {}", css);
    }
}
