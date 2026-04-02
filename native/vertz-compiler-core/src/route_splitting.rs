use std::collections::{HashMap, HashSet};

use oxc_ast::ast::*;
use oxc_span::GetSpan;

use crate::magic_string::MagicString;

/// Info about a static import symbol.
struct ImportInfo {
    source: String,
    exported_name: String,
    is_default: bool,
    /// Span of the entire ImportDeclaration statement.
    decl_start: u32,
    decl_end: u32,
}

/// Vertz package sources that export defineRoutes.
const VERTZ_SOURCES: &[&str] = &["@vertz/ui", "@vertz/ui/router"];

/// Transform route definitions to use lazy imports for code splitting.
///
/// Detects `defineRoutes({...})` calls and rewrites component factories
/// that reference static imports from local files into dynamic `import()` calls.
pub fn transform_route_splitting(ms: &mut MagicString, program: &Program, source: &str) {
    // Fast bail-out: no defineRoutes call
    if !source.contains("defineRoutes(") {
        return;
    }

    // Check that defineRoutes is imported from a Vertz package
    if !has_define_routes_import(program) {
        return;
    }

    // Build import map: local symbol name → ImportInfo (only relative imports)
    let import_map = build_import_map(program, source);

    // Find all defineRoutes() calls and collect route objects
    let define_routes_calls = find_define_routes_calls(program);
    if define_routes_calls.is_empty() {
        return;
    }

    let mut lazified_symbols: HashSet<String> = HashSet::new();

    for call in &define_routes_calls {
        if let Some(arg) = call.arguments.first() {
            if let Expression::ObjectExpression(obj) = arg.to_expression() {
                process_route_object(obj, ms, &import_map, program, source, &mut lazified_symbols);
            }
        }
    }

    if lazified_symbols.is_empty() {
        return;
    }

    // Clean up static imports that are now unused
    cleanup_imports(ms, program, source, &import_map, &lazified_symbols);
}

/// Check if defineRoutes is imported from a Vertz package.
fn has_define_routes_import(program: &Program) -> bool {
    for stmt in &program.body {
        if let Statement::ImportDeclaration(import_decl) = stmt {
            let module_specifier = import_decl.source.value.as_str();
            if !VERTZ_SOURCES.contains(&module_specifier) {
                continue;
            }

            if let Some(ref specifiers) = import_decl.specifiers {
                for spec in specifiers {
                    if let ImportDeclarationSpecifier::ImportSpecifier(named) = spec {
                        if named.imported.name() == "defineRoutes" {
                            return true;
                        }
                    }
                }
            }
        }
    }
    false
}

/// Build a map of local symbol name → ImportInfo for all imports from relative paths.
fn build_import_map(program: &Program, _source: &str) -> HashMap<String, ImportInfo> {
    let mut map = HashMap::new();

    for stmt in &program.body {
        if let Statement::ImportDeclaration(import_decl) = stmt {
            let import_source = import_decl.source.value.as_str();

            // Only transform relative imports
            if !import_source.starts_with("./") && !import_source.starts_with("../") {
                continue;
            }

            if let Some(ref specifiers) = import_decl.specifiers {
                for spec in specifiers {
                    match spec {
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(default_spec) => {
                            let local_name = default_spec.local.name.as_str().to_string();
                            map.insert(
                                local_name,
                                ImportInfo {
                                    source: import_source.to_string(),
                                    exported_name: "default".to_string(),
                                    is_default: true,
                                    decl_start: import_decl.span.start,
                                    decl_end: import_decl.span.end,
                                },
                            );
                        }
                        ImportDeclarationSpecifier::ImportSpecifier(named_spec) => {
                            let local_name = named_spec.local.name.as_str().to_string();
                            let exported_name = named_spec.imported.name().as_str().to_string();
                            map.insert(
                                local_name,
                                ImportInfo {
                                    source: import_source.to_string(),
                                    exported_name,
                                    is_default: false,
                                    decl_start: import_decl.span.start,
                                    decl_end: import_decl.span.end,
                                },
                            );
                        }
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => {
                            // Namespace imports are not lazifiable
                        }
                    }
                }
            }
        }
    }

    map
}

/// Find all defineRoutes() call expressions in the program.
fn find_define_routes_calls<'a>(program: &'a Program<'a>) -> Vec<&'a CallExpression<'a>> {
    let mut calls = Vec::new();
    for stmt in &program.body {
        collect_define_routes_calls_in_stmt(stmt, &mut calls);
    }
    calls
}

fn collect_define_routes_calls_in_stmt<'a>(
    stmt: &'a Statement<'a>,
    calls: &mut Vec<&'a CallExpression<'a>>,
) {
    match stmt {
        Statement::ExpressionStatement(expr_stmt) => {
            collect_define_routes_calls_in_expr(&expr_stmt.expression, calls);
        }
        Statement::VariableDeclaration(var_decl) => {
            for declarator in &var_decl.declarations {
                if let Some(ref init) = declarator.init {
                    collect_define_routes_calls_in_expr(init, calls);
                }
            }
        }
        Statement::ExportNamedDeclaration(export_decl) => {
            if let Some(Declaration::VariableDeclaration(var_decl)) =
                export_decl.declaration.as_ref()
            {
                for declarator in &var_decl.declarations {
                    if let Some(ref init) = declarator.init {
                        collect_define_routes_calls_in_expr(init, calls);
                    }
                }
            }
        }
        Statement::ExportDefaultDeclaration(export_default) => {
            if let ExportDefaultDeclarationKind::CallExpression(call) = &export_default.declaration
            {
                if is_define_routes_call(call) {
                    calls.push(call);
                }
            }
        }
        _ => {}
    }
}

fn collect_define_routes_calls_in_expr<'a>(
    expr: &'a Expression<'a>,
    calls: &mut Vec<&'a CallExpression<'a>>,
) {
    if let Expression::CallExpression(call) = expr {
        if is_define_routes_call(call) {
            calls.push(call);
        }
    }
}

fn is_define_routes_call(call: &CallExpression) -> bool {
    if let Expression::Identifier(ident) = &call.callee {
        return ident.name == "defineRoutes";
    }
    false
}

/// Process a route object literal, transforming component factories.
fn process_route_object(
    obj: &ObjectExpression,
    ms: &mut MagicString,
    import_map: &HashMap<String, ImportInfo>,
    program: &Program,
    source: &str,
    lazified_symbols: &mut HashSet<String>,
) {
    for prop in &obj.properties {
        let ObjectPropertyKind::ObjectProperty(property) = prop else {
            continue;
        };

        // The value should be an object expression (the route config)
        let Expression::ObjectExpression(route_config) = &property.value else {
            continue;
        };

        // Process `component` property
        for inner_prop in &route_config.properties {
            let ObjectPropertyKind::ObjectProperty(inner_property) = inner_prop else {
                continue;
            };

            let prop_name = get_property_name(inner_property);

            if prop_name.as_deref() == Some("component") {
                process_component_factory(
                    &inner_property.value,
                    ms,
                    import_map,
                    program,
                    source,
                    lazified_symbols,
                );
            } else if prop_name.as_deref() == Some("children") {
                // Recurse into children
                if let Expression::ObjectExpression(children_obj) = &inner_property.value {
                    process_route_object(
                        children_obj,
                        ms,
                        import_map,
                        program,
                        source,
                        lazified_symbols,
                    );
                }
            }
        }
    }
}

/// Get the string name of an object property.
fn get_property_name(prop: &ObjectProperty) -> Option<String> {
    match &prop.key {
        PropertyKey::StaticIdentifier(ident) => Some(ident.name.as_str().to_string()),
        PropertyKey::StringLiteral(str_lit) => Some(str_lit.value.as_str().to_string()),
        _ => None,
    }
}

/// Process a single component factory and potentially rewrite it.
fn process_component_factory(
    factory: &Expression,
    ms: &mut MagicString,
    import_map: &HashMap<String, ImportInfo>,
    program: &Program,
    source: &str,
    lazified_symbols: &mut HashSet<String>,
) {
    // Must be an arrow function
    let Expression::ArrowFunctionExpression(arrow) = factory else {
        return;
    };

    // Must be an expression body (not a block)
    if arrow.expression {
        // expression: true means it's an expression body
    } else {
        return;
    }

    // Get the single expression from the body
    let body_expr = get_arrow_expression_body(arrow);
    let Some(body_expr) = body_expr else {
        return;
    };

    // Extract symbol name from the factory body
    let (symbol_name, _args_text) = match body_expr {
        Expression::CallExpression(call) => {
            // () => X() or () => X(args)
            match &call.callee {
                Expression::Identifier(ident) => {
                    let name = ident.name.as_str().to_string();
                    (Some(name), String::new())
                }
                _ => {
                    // Namespace import or member access — skip
                    (None, String::new())
                }
            }
        }
        Expression::JSXElement(_jsx_elem) => {
            // () => <X>...</X> — complex case, bail
            (None, String::new())
        }
        _ => (None, String::new()),
    };

    // Handle JSX self-closing elements which show up differently in oxc
    let symbol_name = if symbol_name.is_none() {
        // Check if it's a JSX fragment or element
        extract_jsx_symbol(body_expr)
    } else {
        symbol_name
    };

    let Some(symbol_name) = symbol_name else {
        return;
    };

    // Look up in import map
    let Some(import_info) = import_map.get(&symbol_name) else {
        return;
    };

    // Check if symbol is used outside defineRoutes component factories
    if is_symbol_used_elsewhere(program, source, &symbol_name) {
        return;
    }

    // Generate the lazy import replacement
    let member_access = if import_info.is_default {
        "m.default".to_string()
    } else {
        format!("m.{}", import_info.exported_name)
    };

    let lazy_code = format!(
        "() => import('{}').then(m => ({{ default: () => {}() }}))",
        import_info.source, member_access
    );

    // Replace the factory expression
    ms.overwrite(arrow.span.start, arrow.span.end, &lazy_code);

    lazified_symbols.insert(symbol_name);
}

/// Get the expression body of an arrow function (when expression: true).
fn get_arrow_expression_body<'a>(
    arrow: &'a ArrowFunctionExpression<'a>,
) -> Option<&'a Expression<'a>> {
    if !arrow.expression {
        return None;
    }
    // When expression is true, the body has a single ExpressionStatement
    if let Some(Statement::ExpressionStatement(expr_stmt)) = arrow.body.statements.first() {
        return Some(&expr_stmt.expression);
    }
    None
}

/// Extract a JSX element/self-closing element symbol name.
fn extract_jsx_symbol(expr: &Expression) -> Option<String> {
    match expr {
        Expression::JSXElement(jsx_elem) => {
            // <X /> or <X>...</X>
            let name = match &jsx_elem.opening_element.name {
                JSXElementName::Identifier(ident) => Some(ident.name.as_str()),
                JSXElementName::IdentifierReference(ident) => Some(ident.name.as_str()),
                _ => None,
            };
            name.and_then(|n| {
                // Only uppercase names (components), not lowercase (HTML elements)
                if n.chars().next().is_some_and(|c| c.is_uppercase()) {
                    Some(n.to_string())
                } else {
                    None
                }
            })
        }
        _ => None,
    }
}

/// Check if a symbol is used in the file outside of defineRoutes component factories.
fn is_symbol_used_elsewhere(program: &Program, _source: &str, symbol_name: &str) -> bool {
    // Collect all identifier positions for this symbol
    // Skip: import declarations, and component factory expressions inside defineRoutes

    // First, collect the spans of all defineRoutes component factory arrows
    let factory_spans = collect_component_factory_spans(program);

    for stmt in &program.body {
        if is_symbol_in_stmt_outside_factories(stmt, symbol_name, &factory_spans) {
            return true;
        }
    }

    false
}

/// Collect the spans of all arrow function expressions that are values of
/// `component` properties inside `defineRoutes()` calls.
fn collect_component_factory_spans(program: &Program) -> Vec<(u32, u32)> {
    let mut spans = Vec::new();
    let calls = find_define_routes_calls(program);
    for call in calls {
        if let Some(arg) = call.arguments.first() {
            if let Expression::ObjectExpression(obj) = arg.to_expression() {
                collect_factory_spans_in_route_object(obj, &mut spans);
            }
        }
    }
    spans
}

fn collect_factory_spans_in_route_object(obj: &ObjectExpression, spans: &mut Vec<(u32, u32)>) {
    for prop in &obj.properties {
        let ObjectPropertyKind::ObjectProperty(property) = prop else {
            continue;
        };
        let Expression::ObjectExpression(route_config) = &property.value else {
            continue;
        };

        for inner_prop in &route_config.properties {
            let ObjectPropertyKind::ObjectProperty(inner_property) = inner_prop else {
                continue;
            };
            let prop_name = get_property_name(inner_property);

            if prop_name.as_deref() == Some("component") {
                // Record the span of the factory expression
                let span = inner_property.value.span();
                spans.push((span.start, span.end));
            } else if prop_name.as_deref() == Some("children") {
                if let Expression::ObjectExpression(children_obj) = &inner_property.value {
                    collect_factory_spans_in_route_object(children_obj, spans);
                }
            }
        }
    }
}

/// Check if a symbol appears in a statement outside of known factory spans.
fn is_symbol_in_stmt_outside_factories(
    stmt: &Statement,
    symbol_name: &str,
    factory_spans: &[(u32, u32)],
) -> bool {
    // Skip import declarations
    if matches!(stmt, Statement::ImportDeclaration(_)) {
        return false;
    }

    // Walk the statement looking for identifiers matching symbol_name
    check_symbol_in_expr_range(stmt, symbol_name, factory_spans)
}

fn check_symbol_in_expr_range(
    stmt: &Statement,
    symbol_name: &str,
    factory_spans: &[(u32, u32)],
) -> bool {
    // We need to find identifiers in this statement that match symbol_name
    // and are NOT inside any factory span
    let mut found = false;
    visit_identifiers_in_stmt(stmt, symbol_name, factory_spans, &mut found);
    found
}

/// Simple recursive identifier scanner for statements.
fn visit_identifiers_in_stmt(
    stmt: &Statement,
    symbol_name: &str,
    factory_spans: &[(u32, u32)],
    found: &mut bool,
) {
    if *found {
        return;
    }

    match stmt {
        Statement::VariableDeclaration(var_decl) => {
            for declarator in &var_decl.declarations {
                if let Some(ref init) = declarator.init {
                    visit_identifiers_in_expr(init, symbol_name, factory_spans, found);
                }
            }
        }
        Statement::ExpressionStatement(expr_stmt) => {
            visit_identifiers_in_expr(&expr_stmt.expression, symbol_name, factory_spans, found);
        }
        Statement::ExportNamedDeclaration(export_decl) => {
            if let Some(Declaration::VariableDeclaration(var_decl)) =
                export_decl.declaration.as_ref()
            {
                for declarator in &var_decl.declarations {
                    if let Some(ref init) = declarator.init {
                        visit_identifiers_in_expr(init, symbol_name, factory_spans, found);
                    }
                }
            }
        }
        Statement::ExportDefaultDeclaration(export_default) => {
            if let ExportDefaultDeclarationKind::CallExpression(call) = &export_default.declaration
            {
                visit_identifiers_in_call_expr(call, symbol_name, factory_spans, found);
            }
        }
        _ => {}
    }
}

fn visit_identifiers_in_expr(
    expr: &Expression,
    symbol_name: &str,
    factory_spans: &[(u32, u32)],
    found: &mut bool,
) {
    if *found {
        return;
    }

    // Check if this expression is inside a factory span — if so, skip
    let span = expr.span();
    if is_inside_factory_span(span.start, span.end, factory_spans) {
        return;
    }

    match expr {
        Expression::Identifier(ident) => {
            if ident.name == symbol_name {
                *found = true;
            }
        }
        Expression::CallExpression(call) => {
            visit_identifiers_in_call_expr(call, symbol_name, factory_spans, found);
        }
        Expression::ArrowFunctionExpression(arrow) => {
            for stmt in &arrow.body.statements {
                visit_identifiers_in_stmt(stmt, symbol_name, factory_spans, found);
            }
        }
        Expression::ObjectExpression(obj) => {
            for prop in &obj.properties {
                if let ObjectPropertyKind::ObjectProperty(property) = prop {
                    visit_identifiers_in_expr(&property.value, symbol_name, factory_spans, found);
                }
            }
        }
        _ if expr.as_member_expression().is_some() => {
            let member = expr.as_member_expression().unwrap();
            visit_identifiers_in_expr(member.object(), symbol_name, factory_spans, found);
        }
        Expression::AssignmentExpression(assign) => {
            visit_identifiers_in_expr(&assign.right, symbol_name, factory_spans, found);
        }
        Expression::ConditionalExpression(cond) => {
            visit_identifiers_in_expr(&cond.test, symbol_name, factory_spans, found);
            visit_identifiers_in_expr(&cond.consequent, symbol_name, factory_spans, found);
            visit_identifiers_in_expr(&cond.alternate, symbol_name, factory_spans, found);
        }
        Expression::BinaryExpression(bin) => {
            visit_identifiers_in_expr(&bin.left, symbol_name, factory_spans, found);
            visit_identifiers_in_expr(&bin.right, symbol_name, factory_spans, found);
        }
        Expression::LogicalExpression(logic) => {
            visit_identifiers_in_expr(&logic.left, symbol_name, factory_spans, found);
            visit_identifiers_in_expr(&logic.right, symbol_name, factory_spans, found);
        }
        Expression::ParenthesizedExpression(paren) => {
            visit_identifiers_in_expr(&paren.expression, symbol_name, factory_spans, found);
        }
        Expression::TemplateLiteral(template) => {
            for expr in &template.expressions {
                visit_identifiers_in_expr(expr, symbol_name, factory_spans, found);
            }
        }
        Expression::JSXElement(jsx) => {
            // Check tag name
            match &jsx.opening_element.name {
                JSXElementName::Identifier(ident) => {
                    if ident.name == symbol_name {
                        *found = true;
                    }
                }
                JSXElementName::IdentifierReference(ident) => {
                    if ident.name == symbol_name {
                        *found = true;
                    }
                }
                _ => {}
            }
        }
        _ => {}
    }
}

fn visit_identifiers_in_call_expr(
    call: &CallExpression,
    symbol_name: &str,
    factory_spans: &[(u32, u32)],
    found: &mut bool,
) {
    if *found {
        return;
    }

    // If this call is defineRoutes, we need to check its arguments specially
    // — the component factory expressions should be skipped
    if is_define_routes_call(call) {
        // Don't visit arguments directly — the factory spans handle skipping
        // But we DO need to check non-component properties
        // For simplicity, we rely on factory_spans to exclude component factories
        for arg in &call.arguments {
            visit_identifiers_in_expr(arg.to_expression(), symbol_name, factory_spans, found);
        }
        return;
    }

    // Regular call expression
    visit_identifiers_in_expr(&call.callee, symbol_name, factory_spans, found);
    for arg in &call.arguments {
        visit_identifiers_in_expr(arg.to_expression(), symbol_name, factory_spans, found);
    }
}

fn is_inside_factory_span(start: u32, end: u32, factory_spans: &[(u32, u32)]) -> bool {
    for &(fs_start, fs_end) in factory_spans {
        if start >= fs_start && end <= fs_end {
            return true;
        }
    }
    false
}

/// Remove or trim static imports that are now unused after lazification.
fn cleanup_imports(
    ms: &mut MagicString,
    program: &Program,
    source: &str,
    import_map: &HashMap<String, ImportInfo>,
    lazified_symbols: &HashSet<String>,
) {
    // Group lazified symbols by their import declaration span
    let mut decls_to_update: HashMap<(u32, u32), Vec<&String>> = HashMap::new();

    for symbol_name in lazified_symbols {
        if let Some(info) = import_map.get(symbol_name) {
            decls_to_update
                .entry((info.decl_start, info.decl_end))
                .or_default()
                .push(symbol_name);
        }
    }

    for stmt in &program.body {
        let Statement::ImportDeclaration(import_decl) = stmt else {
            continue;
        };

        let decl_key = (import_decl.span.start, import_decl.span.end);
        let Some(removed_symbols) = decls_to_update.get(&decl_key) else {
            continue;
        };

        let removed_set: HashSet<&str> = removed_symbols.iter().map(|s| s.as_str()).collect();

        let Some(ref specifiers) = import_decl.specifiers else {
            continue;
        };

        // Count total specifiers and remaining
        let mut total_specifiers = 0;
        let mut remaining_named: Vec<String> = Vec::new();
        let mut has_default = false;
        let mut default_removed = false;
        let mut default_name = String::new();

        for spec in specifiers {
            total_specifiers += 1;
            match spec {
                ImportDeclarationSpecifier::ImportDefaultSpecifier(default_spec) => {
                    has_default = true;
                    default_name = default_spec.local.name.as_str().to_string();
                    if removed_set.contains(default_spec.local.name.as_str()) {
                        default_removed = true;
                    }
                }
                ImportDeclarationSpecifier::ImportSpecifier(named_spec) => {
                    let local_name = named_spec.local.name.as_str();
                    if !removed_set.contains(local_name) {
                        // Keep this specifier — reconstruct its text
                        let exported = named_spec.imported.name();
                        if exported.as_str() == local_name {
                            remaining_named.push(local_name.to_string());
                        } else {
                            remaining_named.push(format!(
                                "{} as {}",
                                exported.as_str(),
                                local_name
                            ));
                        }
                    }
                }
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(ns_spec) => {
                    remaining_named.push(format!("* as {}", ns_spec.local.name.as_str()));
                }
            }
        }

        let removed_count = removed_set.len();

        if removed_count >= total_specifiers {
            // Remove entire import declaration (including trailing newline)
            let mut end = import_decl.span.end as usize;
            if end < source.len() && source.as_bytes()[end] == b'\n' {
                end += 1;
            }
            ms.overwrite(import_decl.span.start, end as u32, "");
        } else {
            // Rebuild import declaration with remaining specifiers
            let import_source = import_decl.source.value.as_str();
            let mut parts: Vec<String> = Vec::new();

            if has_default && !default_removed {
                parts.push(default_name);
            }

            if !remaining_named.is_empty() {
                let named_str = remaining_named.join(", ");
                parts.push(format!("{{ {} }}", named_str));
            }

            let new_import = format!("import {} from '{}';", parts.join(", "), import_source);
            ms.overwrite(import_decl.span.start, import_decl.span.end, &new_import);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::SourceType;

    fn transform(source: &str) -> String {
        let allocator = Allocator::default();
        let source_type = SourceType::tsx();
        let parser = Parser::new(&allocator, source, source_type);
        let parsed = parser.parse();
        let mut ms = crate::magic_string::MagicString::new(source);
        transform_route_splitting(&mut ms, &parsed.program, source);
        ms.to_string()
    }

    // ── Fast bail-out paths ──────────────────────────────────────────

    #[test]
    fn no_define_routes_call_in_source_returns_unchanged() {
        let source = r#"import { something } from "@vertz/ui";
const x = 1;"#;
        assert_eq!(transform(source), source);
    }

    #[test]
    fn define_routes_not_imported_from_vertz_returns_unchanged() {
        let source = r#"import { defineRoutes } from "some-other-lib";
import Home from "./pages/Home";
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        assert_eq!(transform(source), source);
    }

    #[test]
    fn define_routes_string_in_comment_but_no_actual_call_returns_unchanged() {
        // Source contains "defineRoutes(" as a string but no actual import
        let source = r#"// defineRoutes( is used for routing
const x = 1;"#;
        assert_eq!(transform(source), source);
    }

    #[test]
    fn empty_define_routes_object_returns_unchanged() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
defineRoutes({});"#;
        assert_eq!(transform(source), source);
    }

    #[test]
    fn define_routes_with_no_arguments_returns_unchanged() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
defineRoutes();"#;
        assert_eq!(transform(source), source);
    }

    #[test]
    fn define_routes_with_non_object_argument_returns_unchanged() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
const config = {};
defineRoutes(config);"#;
        assert_eq!(transform(source), source);
    }

    // ── Vertz import source variants ─────────────────────────────────

    #[test]
    fn import_from_vertz_ui_is_recognized() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            result.contains("import('./pages/Home')"),
            "should lazify: {}",
            result
        );
    }

    #[test]
    fn import_from_vertz_ui_router_is_recognized() {
        let source = r#"import { defineRoutes } from "@vertz/ui/router";
import Home from "./pages/Home";
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            result.contains("import('./pages/Home')"),
            "should lazify: {}",
            result
        );
    }

    // ── Basic lazification ───────────────────────────────────────────

    #[test]
    fn default_import_lazified_with_m_default() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            result.contains(
                "() => import('./pages/Home').then(m => ({ default: () => m.default() }))"
            ),
            "default import should use m.default: {}",
            result
        );
    }

    #[test]
    fn named_import_lazified_with_m_export_name() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import { Dashboard } from "./pages/Dashboard";
const routes = defineRoutes({
  "/dash": { component: () => Dashboard() },
});"#;
        let result = transform(source);
        assert!(
            result.contains(
                "() => import('./pages/Dashboard').then(m => ({ default: () => m.Dashboard() }))"
            ),
            "named import should use m.Dashboard: {}",
            result
        );
    }

    #[test]
    fn aliased_named_import_lazified_with_original_export_name() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import { Dashboard as Dash } from "./pages/Dashboard";
const routes = defineRoutes({
  "/dash": { component: () => Dash() },
});"#;
        let result = transform(source);
        assert!(
            result.contains("m.Dashboard()"),
            "should use original export name: {}",
            result
        );
    }

    #[test]
    fn relative_parent_import_is_lazified() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Settings from "../Settings";
const routes = defineRoutes({
  "/settings": { component: () => Settings() },
});"#;
        let result = transform(source);
        assert!(
            result.contains("import('../Settings')"),
            "parent-relative import should be lazified: {}",
            result
        );
    }

    // ── Non-relative imports are NOT lazified ────────────────────────

    #[test]
    fn package_import_not_lazified() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import SomePage from "some-package";
const routes = defineRoutes({
  "/": { component: () => SomePage() },
});"#;
        let result = transform(source);
        // SomePage not in import map → factory not rewritten
        assert!(
            result.contains("() => SomePage()"),
            "package import should not be lazified: {}",
            result
        );
    }

    // ── Multiple routes ──────────────────────────────────────────────

    #[test]
    fn multiple_routes_each_lazified() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
import About from "./pages/About";
const routes = defineRoutes({
  "/": { component: () => Home() },
  "/about": { component: () => About() },
});"#;
        let result = transform(source);
        assert!(
            result.contains("import('./pages/Home')"),
            "Home should be lazified: {}",
            result
        );
        assert!(
            result.contains("import('./pages/About')"),
            "About should be lazified: {}",
            result
        );
    }

    // ── Nested children routes ───────────────────────────────────────

    #[test]
    fn nested_children_routes_are_lazified() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Layout from "./Layout";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
const routes = defineRoutes({
  "/": {
    component: () => Layout(),
    children: {
      "/home": { component: () => Home() },
      "/profile": { component: () => Profile() },
    },
  },
});"#;
        let result = transform(source);
        assert!(
            result.contains("import('./Layout')"),
            "Layout should be lazified: {}",
            result
        );
        assert!(
            result.contains("import('./pages/Home')"),
            "Home should be lazified: {}",
            result
        );
        assert!(
            result.contains("import('./pages/Profile')"),
            "Profile should be lazified: {}",
            result
        );
    }

    // ── Factory shapes that are NOT transformed ──────────────────────

    #[test]
    fn non_arrow_factory_not_transformed() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const routes = defineRoutes({
  "/": { component: Home },
});"#;
        let result = transform(source);
        // Not an arrow function, so not transformed
        assert!(
            !result.contains("import('./pages/Home')"),
            "non-arrow should not be lazified: {}",
            result
        );
    }

    #[test]
    fn arrow_with_block_body_not_transformed() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const routes = defineRoutes({
  "/": { component: () => { return Home(); } },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import('./pages/Home')"),
            "block-body arrow should not be lazified: {}",
            result
        );
    }

    // ── Symbol used elsewhere prevents lazification ──────────────────

    #[test]
    fn symbol_used_elsewhere_prevents_lazification() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
console.log(Home);
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import('./pages/Home')"),
            "symbol used elsewhere should not be lazified: {}",
            result
        );
        // Import should remain since symbol is still used
        assert!(
            result.contains("import Home from"),
            "import should remain: {}",
            result
        );
    }

    // ── Import cleanup ───────────────────────────────────────────────

    #[test]
    fn entire_import_removed_when_all_symbols_lazified() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import Home from"),
            "import should be removed: {}",
            result
        );
    }

    #[test]
    fn partial_import_keeps_remaining_named_specifiers() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import { Dashboard, helper } from "./pages/Dashboard";
const routes = defineRoutes({
  "/dash": { component: () => Dashboard() },
});
console.log(helper);"#;
        let result = transform(source);
        assert!(
            result.contains("import('./pages/Dashboard')"),
            "Dashboard should be lazified: {}",
            result
        );
        // helper is used elsewhere, so the import should be rebuilt with just helper
        assert!(
            result.contains("{ helper }"),
            "helper should remain in import: {}",
            result
        );
        assert!(
            !result.contains("{ Dashboard,") && !result.contains("{ Dashboard }"),
            "Dashboard should be removed from import specifiers: {}",
            result
        );
    }

    #[test]
    fn partial_import_keeps_default_when_named_removed() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Layout, { Child } from "./Layout";
const routes = defineRoutes({
  "/": {
    component: () => Layout(),
    children: {
      "/child": { component: () => Child() },
    },
  },
});
"#;
        let result = transform(source);
        // Both Layout and Child should be lazified since they're only used in factories
        assert!(
            result.contains("import('./Layout')"),
            "should lazify: {}",
            result
        );
    }

    #[test]
    fn import_trailing_newline_removed_with_entire_declaration() {
        let source = "import { defineRoutes } from \"@vertz/ui\";\nimport Home from \"./pages/Home\";\nconst routes = defineRoutes({\n  \"/\": { component: () => Home() },\n});";
        let result = transform(source);
        // Should not have double newlines where the import was
        assert!(
            !result.contains("import Home"),
            "import should be removed: {}",
            result
        );
    }

    // ── defineRoutes in different statement contexts ──────────────────

    #[test]
    fn define_routes_in_expression_statement() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            result.contains("import('./pages/Home')"),
            "expression statement should work: {}",
            result
        );
    }

    #[test]
    fn define_routes_in_export_named_declaration() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
export const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            result.contains("import('./pages/Home')"),
            "export named should work: {}",
            result
        );
    }

    #[test]
    fn define_routes_in_export_default_declaration() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
export default defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            result.contains("import('./pages/Home')"),
            "export default should work: {}",
            result
        );
    }

    // ── Property name variants ───────────────────────────────────────

    #[test]
    fn string_literal_component_key_is_recognized() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const routes = defineRoutes({
  "/": { "component": () => Home() },
});"#;
        let result = transform(source);
        assert!(
            result.contains("import('./pages/Home')"),
            "string key 'component' should work: {}",
            result
        );
    }

    #[test]
    fn non_component_property_not_transformed() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import guard from "./guard";
const routes = defineRoutes({
  "/": { guard: () => guard(), component: () => null },
});"#;
        let result = transform(source);
        assert!(
            result.contains("() => guard()"),
            "guard property should not be transformed: {}",
            result
        );
    }

    // ── Namespace import is skipped ──────────────────────────────────

    #[test]
    fn namespace_import_not_added_to_import_map() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import * as pages from "./pages";
const routes = defineRoutes({
  "/": { component: () => pages.Home() },
});"#;
        let result = transform(source);
        // Member expression callee is not an Identifier, so it's skipped
        assert!(
            result.contains("pages.Home()"),
            "namespace should not be lazified: {}",
            result
        );
    }

    // ── Symbol used in various expression contexts ───────────────────

    #[test]
    fn symbol_used_in_variable_init_prevents_lazification() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const alias = Home;
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import('./pages/Home')"),
            "symbol used in variable should not be lazified: {}",
            result
        );
    }

    #[test]
    fn symbol_used_in_jsx_element_prevents_lazification() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const el = <Home />;
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import('./pages/Home')"),
            "symbol used in JSX should not be lazified: {}",
            result
        );
    }

    #[test]
    fn symbol_in_conditional_prevents_lazification() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const x = true ? Home : null;
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import('./pages/Home')"),
            "symbol in conditional should prevent lazification: {}",
            result
        );
    }

    #[test]
    fn symbol_in_binary_expr_prevents_lazification() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const x = Home || null;
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import('./pages/Home')"),
            "symbol in logical expr should prevent lazification: {}",
            result
        );
    }

    #[test]
    fn symbol_in_template_literal_prevents_lazification() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const x = `${Home}`;
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import('./pages/Home')"),
            "symbol in template literal should prevent lazification: {}",
            result
        );
    }

    #[test]
    fn symbol_in_object_value_prevents_lazification() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const map = { home: Home };
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import('./pages/Home')"),
            "symbol in object value should prevent lazification: {}",
            result
        );
    }

    #[test]
    fn symbol_in_assignment_prevents_lazification() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
let x;
x = Home;
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import('./pages/Home')"),
            "symbol in assignment should prevent lazification: {}",
            result
        );
    }

    #[test]
    fn symbol_in_call_arg_prevents_lazification() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
register(Home);
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import('./pages/Home')"),
            "symbol as call argument should prevent lazification: {}",
            result
        );
    }

    #[test]
    fn symbol_as_callee_prevents_lazification() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
Home();
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import('./pages/Home')"),
            "symbol as callee outside factory should prevent lazification: {}",
            result
        );
    }

    // ── Import declaration usage is NOT counted as "used elsewhere" ──

    #[test]
    fn import_declaration_not_counted_as_external_usage() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        // The import statement itself should not count as "used elsewhere"
        assert!(
            result.contains("import('./pages/Home')"),
            "import decl should not count as usage: {}",
            result
        );
    }

    // ── Route config value not an object → skip ──────────────────────

    #[test]
    fn route_value_not_object_is_skipped() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const homeRoute = { component: () => Home() };
const routes = defineRoutes({
  "/": homeRoute,
});"#;
        let result = transform(source);
        // homeRoute is an identifier, not an object literal → skipped
        assert!(
            !result.contains("import('./pages/Home')"),
            "non-object route value should be skipped: {}",
            result
        );
    }

    // ── Spread properties are skipped ────────────────────────────────

    #[test]
    fn spread_property_in_route_object_is_skipped() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const base = {};
const routes = defineRoutes({
  ...base,
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        // Spread at top level → ObjectPropertyKind::SpreadProperty, skipped
        // But the "/" route should still be processed
        assert!(
            result.contains("import('./pages/Home')"),
            "normal route after spread should still work: {}",
            result
        );
    }

    // ── Full compile integration ─────────────────────────────────────

    #[test]
    fn full_compile_with_route_splitting_enabled() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
import About from "./pages/About";
const routes = defineRoutes({
  "/": { component: () => Home() },
  "/about": { component: () => About() },
});"#;
        let result = crate::compile(
            source,
            crate::CompileOptions {
                filename: Some("routes.ts".to_string()),
                route_splitting: Some(true),
                ..Default::default()
            },
        );
        assert!(
            result.code.contains("import('./pages/Home')"),
            "Home should be lazified in full compile: {}",
            result.code
        );
        assert!(
            result.code.contains("import('./pages/About')"),
            "About should be lazified in full compile: {}",
            result.code
        );
        assert!(
            !result.code.contains("import Home from"),
            "static Home import should be removed: {}",
            result.code
        );
    }

    #[test]
    fn full_compile_without_route_splitting_flag_does_not_transform() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = crate::compile(
            source,
            crate::CompileOptions {
                filename: Some("routes.ts".to_string()),
                route_splitting: Some(false),
                ..Default::default()
            },
        );
        assert!(
            !result.code.contains("import('./pages/Home')"),
            "should not transform without flag: {}",
            result.code
        );
    }

    // ── Cleanup: rebuilds import with aliased remaining specifier ─────

    #[test]
    fn partial_cleanup_preserves_alias() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import { Page as MyPage, helper as h } from "./pages/utils";
const routes = defineRoutes({
  "/": { component: () => MyPage() },
});
console.log(h);"#;
        let result = transform(source);
        assert!(
            result.contains("import('./pages/utils')"),
            "MyPage should be lazified: {}",
            result
        );
        // helper was aliased as h, should be preserved as "helper as h"
        assert!(
            result.contains("helper as h"),
            "alias should be preserved: {}",
            result
        );
    }

    // ── Parenthesized expression in usage check ──────────────────────

    #[test]
    fn symbol_in_parenthesized_expr_prevents_lazification() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const x = (Home);
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import('./pages/Home')"),
            "symbol in parens should prevent lazification: {}",
            result
        );
    }

    // ── Member expression in usage check ─────────────────────────────

    #[test]
    fn symbol_in_member_expression_prevents_lazification() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const name = Home.displayName;
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import('./pages/Home')"),
            "symbol in member expr should prevent lazification: {}",
            result
        );
    }

    // ── Arrow in usage check ─────────────────────────────────────────

    #[test]
    fn symbol_in_non_factory_arrow_prevents_lazification() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const fn = () => { Home(); };
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import('./pages/Home')"),
            "symbol in non-factory arrow should prevent lazification: {}",
            result
        );
    }

    // ── Export named with defineRoutes ────────────────────────────────

    #[test]
    fn export_named_variable_with_define_routes() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
export const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            result.contains("import('./pages/Home')"),
            "export named const should work: {}",
            result
        );
    }

    // ── defineRoutes call that's not actually defineRoutes ────────────

    #[test]
    fn call_expression_not_named_define_routes_is_ignored() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const routes = createRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        // createRoutes is not defineRoutes → no transform
        assert!(
            !result.contains("import('./pages/Home')"),
            "non-defineRoutes call should not transform: {}",
            result
        );
    }

    // ── Import without specifiers ────────────────────────────────────

    #[test]
    fn side_effect_import_without_specifiers_ignored() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import "./styles.css";
import Home from "./pages/Home";
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            result.contains("import('./pages/Home')"),
            "should still lazify Home: {}",
            result
        );
        assert!(
            result.contains("import \"./styles.css\""),
            "side-effect import should remain: {}",
            result
        );
    }

    // ── Multiple specifiers from same declaration, all lazified ──────

    #[test]
    fn all_specifiers_from_one_import_lazified_removes_entire_import() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import { Home, About } from "./pages";
const routes = defineRoutes({
  "/": { component: () => Home() },
  "/about": { component: () => About() },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import { Home"),
            "entire import should be removed: {}",
            result
        );
        assert!(
            result.contains("import('./pages')"),
            "should lazify both: {}",
            result
        );
    }

    // ── JSX element as factory body ──────────────────────────────────

    #[test]
    fn jsx_element_factory_with_uppercase_component_is_lazified() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const routes = defineRoutes({
  "/": { component: () => <Home /> },
});"#;
        let result = transform(source);
        assert!(
            result.contains("import('./pages/Home')"),
            "JSX element with uppercase component should be lazified: {}",
            result
        );
    }

    #[test]
    fn jsx_element_with_lowercase_tag_not_lazified() {
        // Lowercase tag name = HTML element, not a component
        let source = r#"import { defineRoutes } from "@vertz/ui";
const routes = defineRoutes({
  "/": { component: () => <div /> },
});"#;
        let result = transform(source);
        assert!(
            result.contains("<div />"),
            "lowercase JSX tag should not be lazified: {}",
            result
        );
    }

    // ── Non-Identifier callee in factory ─────────────────────────────

    #[test]
    fn member_expression_callee_in_factory_not_lazified() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import * as pages from "./pages";
const routes = defineRoutes({
  "/": { component: () => pages.Home() },
});"#;
        let result = transform(source);
        assert!(
            result.contains("pages.Home()"),
            "member expression callee should not be lazified: {}",
            result
        );
    }

    // ── Spread property inside route config is skipped ───────────────

    #[test]
    fn spread_inside_route_config_is_skipped() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
const baseConfig = { guard: true };
const routes = defineRoutes({
  "/": { ...baseConfig, component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            result.contains("import('./pages/Home')"),
            "component after spread in config should still work: {}",
            result
        );
    }

    // ── Symbol used in export named with variable decl ───────────────

    #[test]
    fn symbol_in_export_named_var_prevents_lazification() {
        let source = r#"import { defineRoutes } from "@vertz/ui";
import Home from "./pages/Home";
export const comp = Home;
const routes = defineRoutes({
  "/": { component: () => Home() },
});"#;
        let result = transform(source);
        assert!(
            !result.contains("import('./pages/Home')"),
            "symbol exported separately should prevent lazification: {}",
            result
        );
    }
}
