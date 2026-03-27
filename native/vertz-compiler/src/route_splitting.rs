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
