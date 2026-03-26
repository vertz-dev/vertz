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
