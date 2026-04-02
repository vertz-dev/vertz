use std::collections::HashSet;

use oxc_ast::ast::*;
use oxc_span::GetSpan;

/// Injection kind for field selection.
#[derive(Debug, Clone, PartialEq)]
pub enum InjectionKind {
    /// No args: api.users.list() → insert `{ select: {...} }`
    InsertArg,
    /// First arg is object literal: api.users.list({ status }) → merge `, select: {...}`
    MergeIntoObject,
    /// First arg is not an object: api.users.get(id) → append `, { select: {...} }`
    AppendArg,
}

impl InjectionKind {
    pub fn as_str(&self) -> &str {
        match self {
            InjectionKind::InsertArg => "insert-arg",
            InjectionKind::MergeIntoObject => "merge-into-object",
            InjectionKind::AppendArg => "append-arg",
        }
    }
}

/// Nested field access for relation fields.
#[derive(Debug, Clone)]
pub struct NestedFieldAccess {
    /// Top-level entity field name (e.g., 'assignee')
    pub field: String,
    /// Nested path below the field (e.g., ['name'] for assignee.name)
    pub nested_path: Vec<String>,
}

/// Result of field selection analysis for a single query() call.
#[derive(Debug)]
pub struct QueryFieldSelection {
    /// Variable name assigned from query() call
    pub query_var: String,
    /// AST position where the injection should occur
    pub injection_pos: u32,
    /// How the select should be injected
    pub injection_kind: InjectionKind,
    /// Collected leaf field names
    pub fields: Vec<String>,
    /// True if any opaque access detected
    pub has_opaque_access: bool,
    /// Nested field access paths for relation fields
    pub nested_access: Vec<NestedFieldAccess>,
    /// Entity name inferred from descriptor chain
    pub inferred_entity_name: Option<String>,
}

/// Non-entity properties that should be excluded from field selection.
const NON_ENTITY_PROPS: &[&str] = &[
    // Signal properties
    "loading",
    "error",
    "revalidating",
    "refetch",
    "revalidate",
    "dispose",
    // Array methods
    "map",
    "filter",
    "find",
    "forEach",
    "some",
    "every",
    "reduce",
    "flatMap",
    "includes",
    "indexOf",
    "length",
    "slice",
    "sort",
];

/// Structural prefix properties that are not entity fields.
const STRUCTURAL_PROPS: &[&str] = &["data", "items"];

/// Info about a query variable found via `const x = query(descriptorCall(...))`.
struct QueryVarInfo {
    var_name: String,
    injection_pos: u32,
    injection_kind: InjectionKind,
    inferred_entity_name: Option<String>,
}

/// Analyze a single file's source code for query field access patterns.
pub fn analyze_field_selection(program: &Program, source: &str) -> Vec<QueryFieldSelection> {
    // Fast bail-out
    if !source.contains("query(") {
        return Vec::new();
    }

    let mut results = Vec::new();

    // Step 1: Find query() variable declarations
    let query_vars = find_query_variables(program, source);

    // Step 2: For each query variable, track field access throughout the file
    for qv in &query_vars {
        let mut fields = Vec::new();
        let mut nested_access = Vec::new();
        let mut has_opaque_access = false;

        track_field_access(
            program,
            &qv.var_name,
            &mut fields,
            &mut nested_access,
            &mut has_opaque_access,
        );

        // Deduplicate fields
        let unique_fields: Vec<String> = {
            let mut seen = HashSet::new();
            fields
                .into_iter()
                .filter(|f| seen.insert(f.clone()))
                .collect()
        };

        // Deduplicate nested access
        let deduped_nested = {
            let mut seen = HashSet::new();
            let mut result = Vec::new();
            for n in nested_access {
                let key = format!("{}:{}", n.field, n.nested_path.join("."));
                if seen.insert(key) {
                    result.push(n);
                }
            }
            result
        };

        results.push(QueryFieldSelection {
            query_var: qv.var_name.clone(),
            injection_pos: qv.injection_pos,
            injection_kind: qv.injection_kind.clone(),
            fields: unique_fields,
            has_opaque_access,
            nested_access: deduped_nested,
            inferred_entity_name: qv.inferred_entity_name.clone(),
        });
    }

    results
}

/// Find variable declarations of the form: const x = query(descriptorCall(...))
fn find_query_variables(program: &Program, source: &str) -> Vec<QueryVarInfo> {
    let mut results = Vec::new();

    for stmt in &program.body {
        find_query_vars_in_stmt(stmt, source, &mut results);
    }

    results
}

fn find_query_vars_in_stmt(stmt: &Statement, source: &str, results: &mut Vec<QueryVarInfo>) {
    match stmt {
        Statement::VariableDeclaration(var_decl) => {
            let stmt_start = var_decl.span.start;
            for declarator in &var_decl.declarations {
                check_query_declarator(declarator, source, results, stmt_start);
            }
        }
        Statement::ExportNamedDeclaration(export_decl) => {
            if let Some(Declaration::VariableDeclaration(var_decl)) = &export_decl.declaration {
                let stmt_start = export_decl.span.start;
                for declarator in &var_decl.declarations {
                    check_query_declarator(declarator, source, results, stmt_start);
                }
            }
        }
        // Also check inside function bodies (component functions)
        Statement::FunctionDeclaration(func_decl) => {
            if let Some(ref body) = func_decl.body {
                for inner_stmt in &body.statements {
                    find_query_vars_in_stmt(inner_stmt, source, results);
                }
            }
        }
        Statement::ExportDefaultDeclaration(export_default) => {
            if let ExportDefaultDeclarationKind::FunctionDeclaration(func_decl) =
                &export_default.declaration
            {
                if let Some(ref body) = func_decl.body {
                    for inner_stmt in &body.statements {
                        find_query_vars_in_stmt(inner_stmt, source, results);
                    }
                }
            }
        }
        _ => {}
    }
}

fn check_query_declarator(
    declarator: &VariableDeclarator,
    source: &str,
    results: &mut Vec<QueryVarInfo>,
    stmt_start: u32,
) {
    let Some(ref init) = declarator.init else {
        return;
    };

    let Expression::CallExpression(call) = init else {
        return;
    };

    // Check if it's query(...)
    let Expression::Identifier(callee) = &call.callee else {
        return;
    };
    if callee.name != "query" || call.arguments.is_empty() {
        return;
    }

    // Check for // @vertz-select-all pragma
    // Look for the comment before this variable declaration statement
    if has_pragma(source, stmt_start) {
        return;
    }

    // The inner argument should be a call expression (the descriptor call).
    // Supports both `query(api.task.list())` and `query(() => api.task.list())`.
    let inner_arg = call.arguments.first();
    let Some(inner_arg) = inner_arg else {
        return;
    };
    let inner_expr = inner_arg.to_expression();

    // Unwrap arrow function: query(() => api.task.list()) → api.task.list()
    let unwrapped: Option<&Expression> = match inner_expr {
        Expression::ArrowFunctionExpression(arrow) => {
            if arrow.expression && !arrow.body.statements.is_empty() {
                // Expression body: () => expr
                if let Statement::ExpressionStatement(es) = &arrow.body.statements[0] {
                    Some(&es.expression)
                } else {
                    None
                }
            } else if arrow.body.statements.len() == 1 {
                // Single return statement: () => { return expr }
                if let Statement::ReturnStatement(ret) = &arrow.body.statements[0] {
                    match &ret.argument {
                        Some(arg) => Some(arg),
                        None => None,
                    }
                } else {
                    None
                }
            } else {
                None
            }
        }
        _ => None,
    };
    let effective_expr = unwrapped.unwrap_or(inner_expr);

    let Expression::CallExpression(descriptor_call) = effective_expr else {
        return;
    };

    // Extract variable name
    let var_name = match &declarator.id {
        BindingPattern::BindingIdentifier(ref ident) => ident.name.as_str().to_string(),
        _ => return,
    };

    let (injection_pos, injection_kind) = compute_injection_point(descriptor_call);
    let inferred_entity_name = infer_entity_name(descriptor_call);

    results.push(QueryVarInfo {
        var_name,
        injection_pos,
        injection_kind,
        inferred_entity_name,
    });
}

/// Check for `// @vertz-select-all` pragma before a declaration.
fn has_pragma(source: &str, decl_start: u32) -> bool {
    // Look backwards from decl_start for a comment containing @vertz-select-all
    let before = &source[..decl_start as usize];

    // Find the last newline and get the preceding line
    // We need to check the comment on the line before the `const` keyword
    // The actual variable declaration might be preceded by whitespace and the const keyword
    // So we need to search backwards past the current line
    let trimmed = before.trim_end();
    if trimmed.ends_with("@vertz-select-all") {
        return true;
    }

    // Check if there's a line comment before this declaration
    // Search backwards for // @vertz-select-all
    let search_range = if trimmed.len() > 200 {
        &trimmed[trimmed.len() - 200..]
    } else {
        trimmed
    };

    // Find the last line that is a comment
    for line in search_range.lines().rev().take(3) {
        let trimmed_line = line.trim();
        if trimmed_line.contains("@vertz-select-all") {
            return true;
        }
        // Stop if we hit a non-empty, non-comment line
        if !trimmed_line.is_empty() && !trimmed_line.starts_with("//") {
            break;
        }
    }

    false
}

/// Compute injection point and kind for a descriptor call.
fn compute_injection_point(descriptor_call: &CallExpression) -> (u32, InjectionKind) {
    if descriptor_call.arguments.is_empty() {
        // Before closing paren
        return (descriptor_call.span.end - 1, InjectionKind::InsertArg);
    }

    let first_arg = descriptor_call.arguments.first().unwrap();

    if matches!(first_arg.to_expression(), Expression::ObjectExpression(_)) {
        // Merge into existing object literal
        let arg_end = first_arg.span().end;
        return (arg_end - 1, InjectionKind::MergeIntoObject);
    }

    // Non-object argument → append as new argument
    let last_arg = descriptor_call.arguments.last().unwrap();
    (last_arg.span().end, InjectionKind::AppendArg)
}

/// Infer entity name from a descriptor call chain.
/// e.g., api.tasks.list() → 'tasks'
fn infer_entity_name(call: &CallExpression) -> Option<String> {
    // Pattern: api.tasks.list() → callee is api.tasks.list
    if let Some(member) = call.callee.as_member_expression() {
        if let Some(MemberExpression::StaticMemberExpression(static_member)) =
            member.object().as_member_expression()
        {
            return Some(static_member.property.name.as_str().to_string());
        }
    }
    None
}

/// Track all field accesses on a query variable throughout the file.
fn track_field_access(
    program: &Program,
    var_name: &str,
    fields: &mut Vec<String>,
    nested_access: &mut Vec<NestedFieldAccess>,
    has_opaque_access: &mut bool,
) {
    for stmt in &program.body {
        track_field_access_in_stmt(stmt, var_name, fields, nested_access, has_opaque_access);
    }
}

fn track_field_access_in_stmt(
    stmt: &Statement,
    var_name: &str,
    fields: &mut Vec<String>,
    nested_access: &mut Vec<NestedFieldAccess>,
    has_opaque_access: &mut bool,
) {
    match stmt {
        Statement::FunctionDeclaration(func) => {
            if let Some(ref body) = func.body {
                for inner_stmt in &body.statements {
                    track_field_access_in_stmt(
                        inner_stmt,
                        var_name,
                        fields,
                        nested_access,
                        has_opaque_access,
                    );
                }
            }
        }
        Statement::ExportDefaultDeclaration(export_default) => {
            if let ExportDefaultDeclarationKind::FunctionDeclaration(func) =
                &export_default.declaration
            {
                if let Some(ref body) = func.body {
                    for inner_stmt in &body.statements {
                        track_field_access_in_stmt(
                            inner_stmt,
                            var_name,
                            fields,
                            nested_access,
                            has_opaque_access,
                        );
                    }
                }
            }
        }
        Statement::ReturnStatement(ret) => {
            if let Some(ref expr) = ret.argument {
                track_field_access_in_expr(
                    expr,
                    var_name,
                    fields,
                    nested_access,
                    has_opaque_access,
                );
            }
        }
        Statement::ExpressionStatement(expr_stmt) => {
            track_field_access_in_expr(
                &expr_stmt.expression,
                var_name,
                fields,
                nested_access,
                has_opaque_access,
            );
        }
        Statement::VariableDeclaration(var_decl) => {
            for declarator in &var_decl.declarations {
                if let Some(ref init) = declarator.init {
                    track_field_access_in_expr(
                        init,
                        var_name,
                        fields,
                        nested_access,
                        has_opaque_access,
                    );
                }
            }
        }
        Statement::IfStatement(if_stmt) => {
            track_field_access_in_expr(
                &if_stmt.test,
                var_name,
                fields,
                nested_access,
                has_opaque_access,
            );
            track_field_access_in_stmt(
                &if_stmt.consequent,
                var_name,
                fields,
                nested_access,
                has_opaque_access,
            );
            if let Some(ref alt) = if_stmt.alternate {
                track_field_access_in_stmt(alt, var_name, fields, nested_access, has_opaque_access);
            }
        }
        Statement::BlockStatement(block) => {
            for inner_stmt in &block.body {
                track_field_access_in_stmt(
                    inner_stmt,
                    var_name,
                    fields,
                    nested_access,
                    has_opaque_access,
                );
            }
        }
        _ => {}
    }
}

fn track_field_access_in_expr(
    expr: &Expression,
    var_name: &str,
    fields: &mut Vec<String>,
    nested_access: &mut Vec<NestedFieldAccess>,
    has_opaque_access: &mut bool,
) {
    // Check property access chains
    if let Some(_member) = expr.as_member_expression() {
        let chain = build_property_chain(expr);
        if let Some(chain) = &chain {
            if !chain.is_empty() && chain[0] == var_name {
                if let Some(result) = extract_field_from_chain(chain) {
                    fields.push(result.field.clone());
                    if !result.nested_path.is_empty() {
                        nested_access.push(result);
                    }
                }
            }
        }
    }

    match expr {
        Expression::CallExpression(call) => {
            // Check for array method callbacks: varName.data.items.map(item => item.field)
            if let Some(MemberExpression::StaticMemberExpression(static_member)) =
                call.callee.as_member_expression()
            {
                let method_name = static_member.property.name.as_str();
                if matches!(
                    method_name,
                    "map" | "filter" | "find" | "forEach" | "some" | "every"
                ) {
                    let obj_chain = build_property_chain(&static_member.object);
                    if let Some(ref chain) = obj_chain {
                        if !chain.is_empty()
                            && chain[0] == var_name
                            && (chain.contains(&"items".to_string())
                                || chain.contains(&"data".to_string()))
                        {
                            // Analyze callback
                            if let Some(callback) = call.arguments.first() {
                                let callback_expr = callback.to_expression();
                                let param_name = get_callback_param_name(callback_expr);
                                if let Some(param_name) = param_name {
                                    // Determine if this is a relation-level map
                                    // (not on .items but on a relation field like .members)
                                    let parent_result = extract_field_from_chain(chain);
                                    let parent_field = parent_result
                                        .as_ref()
                                        .filter(|r| r.nested_path.is_empty())
                                        .map(|r| r.field.clone());

                                    let mut cb_fields = Vec::new();
                                    let mut cb_nested = Vec::new();
                                    let mut cb_opaque = false;

                                    track_callback_field_access(
                                        callback_expr,
                                        &param_name,
                                        &mut cb_fields,
                                        &mut cb_nested,
                                        &mut cb_opaque,
                                    );

                                    if let Some(ref pf) = parent_field {
                                        // Relation-level map — nest under parent
                                        fields.push(pf.clone());
                                        for f in &cb_fields {
                                            nested_access.push(NestedFieldAccess {
                                                field: pf.clone(),
                                                nested_path: vec![f.clone()],
                                            });
                                        }
                                        for n in &cb_nested {
                                            nested_access.push(NestedFieldAccess {
                                                field: pf.clone(),
                                                nested_path: {
                                                    let mut path = vec![n.field.clone()];
                                                    path.extend(n.nested_path.clone());
                                                    path
                                                },
                                            });
                                        }
                                    } else {
                                        // Standard .items.map() — top-level fields
                                        fields.extend(cb_fields);
                                        nested_access.extend(cb_nested);
                                    }

                                    if cb_opaque {
                                        *has_opaque_access = true;
                                    }

                                    return; // Don't recurse further into this call
                                }
                            }
                        }
                    }
                }
            }

            // Detect opaque access: passing query variable (or .data) as a function argument
            // e.g., console.log(tasks.data) — tasks.data escapes without field access
            for arg in &call.arguments {
                let arg_expr = arg.to_expression();
                let chain = build_property_chain(arg_expr);
                if let Some(ref chain) = chain {
                    if !chain.is_empty() && chain[0] == var_name {
                        // Check if access stops at structural level (data, items)
                        // without further field access
                        let path = &chain[1..];
                        let all_structural =
                            path.iter().all(|p| STRUCTURAL_PROPS.contains(&p.as_str()));
                        if all_structural {
                            *has_opaque_access = true;
                        }
                    }
                }
            }

            // Recurse into call arguments
            track_field_access_in_expr(
                &call.callee,
                var_name,
                fields,
                nested_access,
                has_opaque_access,
            );
            for arg in &call.arguments {
                track_field_access_in_expr(
                    arg.to_expression(),
                    var_name,
                    fields,
                    nested_access,
                    has_opaque_access,
                );
            }
        }
        Expression::ParenthesizedExpression(paren) => {
            track_field_access_in_expr(
                &paren.expression,
                var_name,
                fields,
                nested_access,
                has_opaque_access,
            );
        }
        Expression::ConditionalExpression(cond) => {
            track_field_access_in_expr(
                &cond.test,
                var_name,
                fields,
                nested_access,
                has_opaque_access,
            );
            track_field_access_in_expr(
                &cond.consequent,
                var_name,
                fields,
                nested_access,
                has_opaque_access,
            );
            track_field_access_in_expr(
                &cond.alternate,
                var_name,
                fields,
                nested_access,
                has_opaque_access,
            );
        }
        Expression::JSXElement(jsx) => {
            // Check JSX attributes for prop flows and field access
            for attr in &jsx.opening_element.attributes {
                if let JSXAttributeItem::Attribute(jsx_attr) = attr {
                    if let Some(JSXAttributeValue::ExpressionContainer(container)) =
                        jsx_attr.value.as_ref()
                    {
                        if let Some(expr) = container.expression.as_expression() {
                            track_field_access_in_expr(
                                expr,
                                var_name,
                                fields,
                                nested_access,
                                has_opaque_access,
                            );
                        }
                    }
                }
            }
            // Recurse into children
            for child in &jsx.children {
                match child {
                    JSXChild::ExpressionContainer(container) => {
                        if let Some(expr) = container.expression.as_expression() {
                            track_field_access_in_expr(
                                expr,
                                var_name,
                                fields,
                                nested_access,
                                has_opaque_access,
                            );
                        }
                    }
                    JSXChild::Element(child_elem) => {
                        track_field_access_in_jsx_element(
                            child_elem,
                            var_name,
                            fields,
                            nested_access,
                            has_opaque_access,
                        );
                    }
                    _ => {}
                }
            }
        }
        Expression::ArrowFunctionExpression(arrow) => {
            for stmt in &arrow.body.statements {
                track_field_access_in_stmt(
                    stmt,
                    var_name,
                    fields,
                    nested_access,
                    has_opaque_access,
                );
            }
        }
        Expression::ObjectExpression(obj) => {
            for prop in &obj.properties {
                match prop {
                    ObjectPropertyKind::ObjectProperty(property) => {
                        track_field_access_in_expr(
                            &property.value,
                            var_name,
                            fields,
                            nested_access,
                            has_opaque_access,
                        );
                    }
                    ObjectPropertyKind::SpreadProperty(spread) => {
                        // Check if spreading query data
                        let chain = build_property_chain(&spread.argument);
                        if let Some(ref chain) = chain {
                            if !chain.is_empty() && chain[0] == var_name {
                                *has_opaque_access = true;
                            }
                        }
                        // Also check if spreading a callback param
                        if let Expression::Identifier(ident) = &spread.argument {
                            if ident.name == var_name {
                                *has_opaque_access = true;
                            }
                        }
                    }
                }
            }
        }
        Expression::ChainExpression(chain_expr) => {
            // Optional chaining: tasks.data?.map(...)
            match &chain_expr.expression {
                ChainElement::CallExpression(call) => {
                    // Treat like a regular call expression — check for array method patterns
                    if let Some(MemberExpression::StaticMemberExpression(static_member)) =
                        call.callee.as_member_expression()
                    {
                        let method_name = static_member.property.name.as_str();
                        if matches!(
                            method_name,
                            "map" | "filter" | "find" | "forEach" | "some" | "every"
                        ) {
                            let obj_chain = build_property_chain(&static_member.object);
                            if let Some(ref chain) = obj_chain {
                                if !chain.is_empty()
                                    && chain[0] == var_name
                                    && (chain.contains(&"items".to_string())
                                        || chain.contains(&"data".to_string()))
                                {
                                    if let Some(callback) = call.arguments.first() {
                                        let callback_expr = callback.to_expression();
                                        let param_name = get_callback_param_name(callback_expr);
                                        if let Some(param_name) = param_name {
                                            let parent_result = extract_field_from_chain(chain);
                                            let parent_field = parent_result
                                                .as_ref()
                                                .filter(|r| r.nested_path.is_empty())
                                                .map(|r| r.field.clone());

                                            let mut cb_fields = Vec::new();
                                            let mut cb_nested = Vec::new();
                                            let mut cb_opaque = false;

                                            track_callback_field_access(
                                                callback_expr,
                                                &param_name,
                                                &mut cb_fields,
                                                &mut cb_nested,
                                                &mut cb_opaque,
                                            );

                                            if let Some(ref pf) = parent_field {
                                                fields.push(pf.clone());
                                                for f in &cb_fields {
                                                    nested_access.push(NestedFieldAccess {
                                                        field: pf.clone(),
                                                        nested_path: vec![f.clone()],
                                                    });
                                                }
                                            } else {
                                                fields.extend(cb_fields);
                                                nested_access.extend(cb_nested);
                                            }

                                            if cb_opaque {
                                                *has_opaque_access = true;
                                            }

                                            return;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    // Recurse into call arguments
                    track_field_access_in_expr(
                        &call.callee,
                        var_name,
                        fields,
                        nested_access,
                        has_opaque_access,
                    );
                    for arg in &call.arguments {
                        track_field_access_in_expr(
                            arg.to_expression(),
                            var_name,
                            fields,
                            nested_access,
                            has_opaque_access,
                        );
                    }
                }
                ChainElement::StaticMemberExpression(member) => {
                    // Check chain property access
                    let chain = build_property_chain_from_chain_element(&chain_expr.expression);
                    if let Some(ref chain) = chain {
                        if !chain.is_empty() && chain[0] == var_name {
                            if let Some(result) = extract_field_from_chain(chain) {
                                fields.push(result.field.clone());
                                if !result.nested_path.is_empty() {
                                    nested_access.push(result);
                                }
                            }
                        }
                    }
                    // Recurse into the object
                    track_field_access_in_expr(
                        &member.object,
                        var_name,
                        fields,
                        nested_access,
                        has_opaque_access,
                    );
                }
                _ => {}
            }
        }
        _ if expr.as_member_expression().is_some() => {
            // Already handled at the top of this function
        }
        _ => {}
    }
}

/// Recurse into a JSX element's attributes and children for field access tracking.
fn track_field_access_in_jsx_element(
    jsx: &JSXElement,
    var_name: &str,
    fields: &mut Vec<String>,
    nested_access: &mut Vec<NestedFieldAccess>,
    has_opaque_access: &mut bool,
) {
    for attr in &jsx.opening_element.attributes {
        if let JSXAttributeItem::Attribute(jsx_attr) = attr {
            if let Some(JSXAttributeValue::ExpressionContainer(container)) = jsx_attr.value.as_ref()
            {
                if let Some(expr) = container.expression.as_expression() {
                    track_field_access_in_expr(
                        expr,
                        var_name,
                        fields,
                        nested_access,
                        has_opaque_access,
                    );
                }
            }
        }
    }
    for child in &jsx.children {
        match child {
            JSXChild::ExpressionContainer(container) => {
                if let Some(expr) = container.expression.as_expression() {
                    track_field_access_in_expr(
                        expr,
                        var_name,
                        fields,
                        nested_access,
                        has_opaque_access,
                    );
                }
            }
            JSXChild::Element(child_elem) => {
                track_field_access_in_jsx_element(
                    child_elem,
                    var_name,
                    fields,
                    nested_access,
                    has_opaque_access,
                );
            }
            _ => {}
        }
    }
}

/// Build a property access chain from an expression.
/// e.g., users.data.items → ['users', 'data', 'items']
fn build_property_chain(expr: &Expression) -> Option<Vec<String>> {
    let mut chain = Vec::new();
    let mut current = expr;

    loop {
        if let Expression::ChainExpression(chain_expr) = current {
            // Unwrap optional chaining: a?.b → a.b for chain analysis
            match &chain_expr.expression {
                ChainElement::StaticMemberExpression(member) => {
                    chain.push(member.property.name.as_str().to_string());
                    current = &member.object;
                    continue;
                }
                ChainElement::ComputedMemberExpression(computed) => {
                    current = &computed.object;
                    continue;
                }
                ChainElement::CallExpression(call) => {
                    // e.g., tasks.data?.map() — skip the call, continue with callee object
                    current = &call.callee;
                    continue;
                }
                _ => return None,
            }
        }

        if let Some(member) = current.as_member_expression() {
            match member {
                MemberExpression::StaticMemberExpression(static_member) => {
                    chain.push(static_member.property.name.as_str().to_string());
                    current = &static_member.object;
                }
                MemberExpression::ComputedMemberExpression(computed) => {
                    // Element access like items[0] — skip the index, continue with object
                    current = &computed.object;
                }
                _ => return None,
            }
        } else if let Expression::Identifier(ident) = current {
            chain.push(ident.name.as_str().to_string());
            chain.reverse();
            return Some(chain);
        } else {
            return None;
        }
    }
}

/// Build property chain from a ChainElement (for optional chaining).
fn build_property_chain_from_chain_element(elem: &ChainElement) -> Option<Vec<String>> {
    match elem {
        ChainElement::StaticMemberExpression(member) => {
            let mut chain = build_property_chain(&member.object)?;
            chain.push(member.property.name.as_str().to_string());
            Some(chain)
        }
        ChainElement::ComputedMemberExpression(computed) => build_property_chain(&computed.object),
        _ => None,
    }
}

/// Extract the entity field name and nested path from a property chain.
fn extract_field_from_chain(chain: &[String]) -> Option<NestedFieldAccess> {
    // Skip the variable name
    let path = &chain[1..];

    // Strip structural prefix properties: data, items
    let structural: HashSet<&str> = STRUCTURAL_PROPS.iter().copied().collect();
    let mut prefix_end = 0;
    while prefix_end < path.len() && structural.contains(path[prefix_end].as_str()) {
        prefix_end += 1;
    }
    let field_parts = &path[prefix_end..];

    // Skip known non-entity properties
    let non_entity: HashSet<&str> = NON_ENTITY_PROPS.iter().copied().collect();
    if field_parts.len() == 1 && non_entity.contains(field_parts[0].as_str()) {
        return None;
    }

    if field_parts.is_empty() {
        return None;
    }

    // Filter non-entity props from nested path
    let nested_path: Vec<String> = field_parts[1..]
        .iter()
        .filter(|p| !non_entity.contains(p.as_str()))
        .cloned()
        .collect();

    Some(NestedFieldAccess {
        field: field_parts[0].clone(),
        nested_path,
    })
}

/// Get the parameter name from a callback expression.
fn get_callback_param_name(expr: &Expression) -> Option<String> {
    match expr {
        Expression::ArrowFunctionExpression(arrow) => {
            if let Some(param) = arrow.params.items.first() {
                if let BindingPattern::BindingIdentifier(ref ident) = param.pattern {
                    return Some(ident.name.as_str().to_string());
                }
            }
            None
        }
        Expression::FunctionExpression(func) => {
            if let Some(param) = func.params.items.first() {
                if let BindingPattern::BindingIdentifier(ref ident) = param.pattern {
                    return Some(ident.name.as_str().to_string());
                }
            }
            None
        }
        _ => None,
    }
}

/// Track field access within a callback function body.
fn track_callback_field_access(
    callback: &Expression,
    param_name: &str,
    fields: &mut Vec<String>,
    nested_access: &mut Vec<NestedFieldAccess>,
    has_opaque_access: &mut bool,
) {
    match callback {
        Expression::ArrowFunctionExpression(arrow) => {
            for stmt in &arrow.body.statements {
                track_callback_stmt(stmt, param_name, fields, nested_access, has_opaque_access);
            }
        }
        Expression::FunctionExpression(func) => {
            if let Some(ref body) = func.body {
                for stmt in &body.statements {
                    track_callback_stmt(stmt, param_name, fields, nested_access, has_opaque_access);
                }
            }
        }
        _ => {}
    }
}

/// Recurse into JSX element children for callback field tracking.
fn track_callback_expr_in_jsx(
    jsx: &JSXElement,
    param_name: &str,
    fields: &mut Vec<String>,
    nested_access: &mut Vec<NestedFieldAccess>,
    has_opaque_access: &mut bool,
) {
    for attr in &jsx.opening_element.attributes {
        if let JSXAttributeItem::Attribute(jsx_attr) = attr {
            if let Some(JSXAttributeValue::ExpressionContainer(container)) = jsx_attr.value.as_ref()
            {
                if let Some(inner_expr) = container.expression.as_expression() {
                    track_callback_expr(
                        inner_expr,
                        param_name,
                        fields,
                        nested_access,
                        has_opaque_access,
                    );
                }
            }
        }
    }
    for child in &jsx.children {
        match child {
            JSXChild::ExpressionContainer(container) => {
                if let Some(inner_expr) = container.expression.as_expression() {
                    track_callback_expr(
                        inner_expr,
                        param_name,
                        fields,
                        nested_access,
                        has_opaque_access,
                    );
                }
            }
            JSXChild::Element(child_elem) => {
                track_callback_expr_in_jsx(
                    child_elem,
                    param_name,
                    fields,
                    nested_access,
                    has_opaque_access,
                );
            }
            _ => {}
        }
    }
}

fn track_callback_stmt(
    stmt: &Statement,
    param_name: &str,
    fields: &mut Vec<String>,
    nested_access: &mut Vec<NestedFieldAccess>,
    has_opaque_access: &mut bool,
) {
    match stmt {
        Statement::ExpressionStatement(expr_stmt) => {
            track_callback_expr(
                &expr_stmt.expression,
                param_name,
                fields,
                nested_access,
                has_opaque_access,
            );
        }
        Statement::ReturnStatement(ret) => {
            if let Some(ref arg) = ret.argument {
                track_callback_expr(arg, param_name, fields, nested_access, has_opaque_access);
            }
        }
        _ => {}
    }
}

fn track_callback_expr(
    expr: &Expression,
    param_name: &str,
    fields: &mut Vec<String>,
    nested_access: &mut Vec<NestedFieldAccess>,
    has_opaque_access: &mut bool,
) {
    // Check property access: param.field
    if expr.as_member_expression().is_some() {
        let chain = build_property_chain(expr);
        if let Some(ref chain) = chain {
            if chain.len() >= 2 && chain[0] == param_name {
                let field = &chain[1];
                fields.push(field.clone());
                if chain.len() > 2 {
                    nested_access.push(NestedFieldAccess {
                        field: field.clone(),
                        nested_path: chain[2..].to_vec(),
                    });
                }
            }
        }
    }

    // Dynamic key access → opaque
    if let Expression::ComputedMemberExpression(computed) = expr {
        if let Expression::Identifier(ident) = &computed.object {
            if ident.name == param_name {
                // Check if it's not a numeric literal (array index)
                if !matches!(&computed.expression, Expression::NumericLiteral(_)) {
                    *has_opaque_access = true;
                }
            }
        }
    }

    match expr {
        Expression::CallExpression(call) => {
            track_callback_expr(
                &call.callee,
                param_name,
                fields,
                nested_access,
                has_opaque_access,
            );
            for arg in &call.arguments {
                track_callback_expr(
                    arg.to_expression(),
                    param_name,
                    fields,
                    nested_access,
                    has_opaque_access,
                );
            }
        }
        Expression::ParenthesizedExpression(paren) => {
            track_callback_expr(
                &paren.expression,
                param_name,
                fields,
                nested_access,
                has_opaque_access,
            );
        }
        Expression::JSXElement(jsx) => {
            for attr in &jsx.opening_element.attributes {
                if let JSXAttributeItem::Attribute(jsx_attr) = attr {
                    if let Some(JSXAttributeValue::ExpressionContainer(container)) =
                        jsx_attr.value.as_ref()
                    {
                        if let Some(inner_expr) = container.expression.as_expression() {
                            track_callback_expr(
                                inner_expr,
                                param_name,
                                fields,
                                nested_access,
                                has_opaque_access,
                            );
                        }
                    }
                }
            }
            for child in &jsx.children {
                match child {
                    JSXChild::ExpressionContainer(container) => {
                        if let Some(inner_expr) = container.expression.as_expression() {
                            track_callback_expr(
                                inner_expr,
                                param_name,
                                fields,
                                nested_access,
                                has_opaque_access,
                            );
                        }
                    }
                    JSXChild::Element(child_elem) => {
                        track_callback_expr_in_jsx(
                            child_elem,
                            param_name,
                            fields,
                            nested_access,
                            has_opaque_access,
                        );
                    }
                    _ => {}
                }
            }
        }
        Expression::ObjectExpression(obj) => {
            for prop in &obj.properties {
                match prop {
                    ObjectPropertyKind::ObjectProperty(property) => {
                        track_callback_expr(
                            &property.value,
                            param_name,
                            fields,
                            nested_access,
                            has_opaque_access,
                        );
                    }
                    ObjectPropertyKind::SpreadProperty(spread) => {
                        if let Expression::Identifier(ident) = &spread.argument {
                            if ident.name == param_name {
                                *has_opaque_access = true;
                            }
                        }
                    }
                }
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::SourceType;

    fn analyze(source: &str) -> Vec<QueryFieldSelection> {
        let allocator = Allocator::default();
        let source_type = SourceType::tsx();
        let parser = Parser::new(&allocator, source, source_type);
        let parsed = parser.parse();
        analyze_field_selection(&parsed.program, source)
    }

    // ── InjectionKind::as_str ──────────────────────────────────────────

    #[test]
    fn injection_kind_as_str_insert_arg() {
        assert_eq!(InjectionKind::InsertArg.as_str(), "insert-arg");
    }

    #[test]
    fn injection_kind_as_str_merge_into_object() {
        assert_eq!(InjectionKind::MergeIntoObject.as_str(), "merge-into-object");
    }

    #[test]
    fn injection_kind_as_str_append_arg() {
        assert_eq!(InjectionKind::AppendArg.as_str(), "append-arg");
    }

    // ── Fast bail-out ──────────────────────────────────────────────────

    #[test]
    fn returns_empty_when_source_has_no_query_call() {
        let results = analyze("const x = fetch('/api');");
        assert!(results.is_empty());
    }

    // ── Basic query variable detection ─────────────────────────────────

    #[test]
    fn detects_basic_query_variable() {
        let results = analyze("const tasks = query(api.tasks.list());");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].query_var, "tasks");
    }

    #[test]
    fn ignores_query_call_without_arguments() {
        let results = analyze("const tasks = query();");
        assert!(results.is_empty());
    }

    #[test]
    fn ignores_non_call_inner_argument() {
        let results = analyze("const tasks = query(someVariable);");
        assert!(results.is_empty());
    }

    #[test]
    fn ignores_non_identifier_callee() {
        let results = analyze("const tasks = obj.query(api.tasks.list());");
        assert!(results.is_empty());
    }

    #[test]
    fn ignores_destructuring_pattern() {
        let results = analyze("const { data } = query(api.tasks.list());");
        assert!(results.is_empty());
    }

    #[test]
    fn ignores_declarator_without_init() {
        // This shouldn't match because there's no initializer
        let results = analyze("let tasks; tasks = query(api.tasks.list());");
        assert!(results.is_empty());
    }

    // ── Arrow function wrapping ────────────────────────────────────────

    #[test]
    fn detects_query_with_arrow_expression_body() {
        let results = analyze("const tasks = query(() => api.tasks.list());");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].query_var, "tasks");
    }

    #[test]
    fn detects_query_with_arrow_return_statement() {
        let results = analyze("const tasks = query(() => { return api.tasks.list(); });");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].query_var, "tasks");
    }

    #[test]
    fn ignores_arrow_with_no_return() {
        let results = analyze("const tasks = query(() => { console.log('hi'); });");
        assert!(results.is_empty());
    }

    #[test]
    fn ignores_arrow_with_multiple_statements() {
        let results =
            analyze("const tasks = query(() => { const x = 1; return api.tasks.list(); });");
        assert!(results.is_empty());
    }

    #[test]
    fn ignores_arrow_with_return_no_argument() {
        let results = analyze("const tasks = query(() => { return; });");
        assert!(results.is_empty());
    }

    // ── Export named declaration ────────────────────────────────────────

    #[test]
    fn detects_exported_query_variable() {
        let results = analyze("export const tasks = query(api.tasks.list());");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].query_var, "tasks");
    }

    // ── Inside function declaration ────────────────────────────────────

    #[test]
    fn detects_query_inside_function_body() {
        let source = r#"
function App() {
    const tasks = query(api.tasks.list());
    return tasks.data.name;
}
"#;
        let results = analyze(source);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].query_var, "tasks");
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── Inside export default function ─────────────────────────────────

    #[test]
    fn detects_query_inside_export_default_function() {
        let source = r#"
export default function App() {
    const tasks = query(api.tasks.list());
    return tasks.data.title;
}
"#;
        let results = analyze(source);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].query_var, "tasks");
        assert!(results[0].fields.contains(&"title".to_string()));
    }

    // ── Injection kinds ────────────────────────────────────────────────

    #[test]
    fn insert_arg_when_descriptor_has_no_arguments() {
        let results = analyze("const tasks = query(api.tasks.list());");
        assert_eq!(results[0].injection_kind, InjectionKind::InsertArg);
    }

    #[test]
    fn merge_into_object_when_first_arg_is_object_literal() {
        let results = analyze("const tasks = query(api.tasks.list({ status: 'active' }));");
        assert_eq!(results[0].injection_kind, InjectionKind::MergeIntoObject);
    }

    #[test]
    fn append_arg_when_first_arg_is_not_object() {
        let results = analyze("const tasks = query(api.tasks.get(id));");
        assert_eq!(results[0].injection_kind, InjectionKind::AppendArg);
    }

    // ── @vertz-select-all pragma ───────────────────────────────────────

    #[test]
    fn skips_query_with_select_all_pragma_inline() {
        let source = "// @vertz-select-all\nconst tasks = query(api.tasks.list());";
        let results = analyze(source);
        assert!(results.is_empty());
    }

    #[test]
    fn skips_query_with_select_all_pragma_with_whitespace() {
        let source = "  // @vertz-select-all  \nconst tasks = query(api.tasks.list());";
        let results = analyze(source);
        assert!(results.is_empty());
    }

    #[test]
    fn does_not_skip_when_pragma_is_far_away() {
        // Pragma on a non-adjacent non-comment line shouldn't match
        let source = "// @vertz-select-all\nconst x = 1;\nconst tasks = query(api.tasks.list());";
        let results = analyze(source);
        assert_eq!(results.len(), 1);
    }

    // ── Entity name inference ──────────────────────────────────────────

    #[test]
    fn infers_entity_name_from_descriptor_chain() {
        let results = analyze("const tasks = query(api.tasks.list());");
        assert_eq!(results[0].inferred_entity_name, Some("tasks".to_string()));
    }

    #[test]
    fn no_entity_name_for_simple_call() {
        let results = analyze("const tasks = query(listTasks());");
        assert_eq!(results[0].inferred_entity_name, None);
    }

    // ── Simple field access ────────────────────────────────────────────

    #[test]
    fn tracks_simple_field_access_through_data() {
        let source = r#"
const tasks = query(api.tasks.list());
console.log(tasks.data.name);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    #[test]
    fn tracks_field_access_through_data_items() {
        let source = r#"
const tasks = query(api.tasks.list());
console.log(tasks.data.items.title);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"title".to_string()));
    }

    // ── Structural prefix stripping ────────────────────────────────────

    #[test]
    fn strips_data_prefix_from_field_chain() {
        let source = r#"
const tasks = query(api.tasks.list());
const name = tasks.data.name;
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
        assert!(!results[0].fields.contains(&"data".to_string()));
    }

    #[test]
    fn strips_items_prefix_from_field_chain() {
        let source = r#"
const tasks = query(api.tasks.list());
const title = tasks.data.items.title;
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"title".to_string()));
        assert!(!results[0].fields.contains(&"items".to_string()));
    }

    // ── Non-entity prop filtering ──────────────────────────────────────

    #[test]
    fn excludes_loading_signal_property() {
        let source = r#"
const tasks = query(api.tasks.list());
if (tasks.data.loading) {}
"#;
        let results = analyze(source);
        assert!(results[0].fields.is_empty());
    }

    #[test]
    fn excludes_error_signal_property() {
        let source = r#"
const tasks = query(api.tasks.list());
if (tasks.data.error) {}
"#;
        let results = analyze(source);
        assert!(results[0].fields.is_empty());
    }

    #[test]
    fn excludes_length_array_property() {
        let source = r#"
const tasks = query(api.tasks.list());
const n = tasks.data.length;
"#;
        let results = analyze(source);
        assert!(results[0].fields.is_empty());
    }

    // ── Nested field access ────────────────────────────────────────────

    #[test]
    fn tracks_nested_field_access() {
        let source = r#"
const tasks = query(api.tasks.list());
const x = tasks.data.assignee.name;
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"assignee".to_string()));
        assert_eq!(results[0].nested_access.len(), 1);
        assert_eq!(results[0].nested_access[0].field, "assignee");
        assert_eq!(results[0].nested_access[0].nested_path, vec!["name"]);
    }

    #[test]
    fn tracks_deeply_nested_field_access() {
        let source = r#"
const tasks = query(api.tasks.list());
const x = tasks.data.assignee.address.city;
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"assignee".to_string()));
        let nested = results[0]
            .nested_access
            .iter()
            .find(|n| n.field == "assignee")
            .unwrap();
        assert_eq!(nested.nested_path, vec!["address", "city"]);
    }

    // ── Deduplication ──────────────────────────────────────────────────

    #[test]
    fn deduplicates_repeated_field_access() {
        let source = r#"
const tasks = query(api.tasks.list());
const a = tasks.data.name;
const b = tasks.data.name;
"#;
        let results = analyze(source);
        let name_count = results[0].fields.iter().filter(|f| *f == "name").count();
        assert_eq!(name_count, 1);
    }

    #[test]
    fn deduplicates_nested_access() {
        let source = r#"
const tasks = query(api.tasks.list());
const a = tasks.data.assignee.name;
const b = tasks.data.assignee.name;
"#;
        let results = analyze(source);
        let nested_count = results[0]
            .nested_access
            .iter()
            .filter(|n| n.field == "assignee" && n.nested_path == vec!["name"])
            .count();
        assert_eq!(nested_count, 1);
    }

    // ── Array method callbacks ─────────────────────────────────────────

    #[test]
    fn tracks_fields_in_map_callback() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.map(t => t.name);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    #[test]
    fn tracks_fields_in_filter_callback() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.filter(t => t.done);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"done".to_string()));
    }

    #[test]
    fn tracks_fields_in_find_callback() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.find(t => t.id);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"id".to_string()));
    }

    #[test]
    fn tracks_fields_in_foreach_callback() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.forEach(t => console.log(t.title));
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"title".to_string()));
    }

    #[test]
    fn tracks_fields_in_some_callback() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.some(t => t.active);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"active".to_string()));
    }

    #[test]
    fn tracks_fields_in_every_callback() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.every(t => t.valid);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"valid".to_string()));
    }

    #[test]
    fn tracks_fields_in_callback_with_function_expression() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.map(function(t) { return t.name; });
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    #[test]
    fn tracks_nested_field_in_callback() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.map(t => t.assignee.name);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"assignee".to_string()));
        let nested = results[0]
            .nested_access
            .iter()
            .find(|n| n.field == "assignee")
            .unwrap();
        assert_eq!(nested.nested_path, vec!["name"]);
    }

    // ── Relation-level map ─────────────────────────────────────────────

    #[test]
    fn tracks_relation_level_map() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.members.map(m => m.name);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"members".to_string()));
        let nested = results[0]
            .nested_access
            .iter()
            .find(|n| n.field == "members" && n.nested_path == vec!["name"])
            .unwrap();
        assert_eq!(nested.field, "members");
    }

    #[test]
    fn tracks_relation_level_map_with_nested_callback_access() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.members.map(m => m.address.city);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"members".to_string()));
        let nested = results[0]
            .nested_access
            .iter()
            .find(|n| n.field == "members" && n.nested_path == vec!["address", "city"]);
        assert!(nested.is_some());
    }

    // ── Opaque access ──────────────────────────────────────────────────

    #[test]
    fn detects_opaque_access_when_data_passed_as_arg() {
        let source = r#"
const tasks = query(api.tasks.list());
console.log(tasks.data);
"#;
        let results = analyze(source);
        assert!(results[0].has_opaque_access);
    }

    #[test]
    fn detects_opaque_access_when_items_passed_as_arg() {
        let source = r#"
const tasks = query(api.tasks.list());
console.log(tasks.data.items);
"#;
        let results = analyze(source);
        assert!(results[0].has_opaque_access);
    }

    #[test]
    fn no_opaque_access_for_specific_field() {
        let source = r#"
const tasks = query(api.tasks.list());
console.log(tasks.data.name);
"#;
        let results = analyze(source);
        assert!(!results[0].has_opaque_access);
    }

    #[test]
    fn detects_opaque_access_from_object_spread() {
        let source = r#"
const tasks = query(api.tasks.list());
const obj = { ...tasks.data };
"#;
        let results = analyze(source);
        assert!(results[0].has_opaque_access);
    }

    #[test]
    fn detects_opaque_access_from_callback_spread() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.map(item => ({ ...item }));
"#;
        let results = analyze(source);
        assert!(results[0].has_opaque_access);
    }

    #[test]
    fn detects_opaque_from_computed_member_in_callback() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.map(item => item[key]);
"#;
        let results = analyze(source);
        assert!(results[0].has_opaque_access);
    }

    #[test]
    fn no_opaque_from_numeric_index_in_callback() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.map(item => item[0]);
"#;
        let results = analyze(source);
        assert!(!results[0].has_opaque_access);
    }

    // ── JSX attributes ─────────────────────────────────────────────────

    #[test]
    fn tracks_field_in_jsx_attribute() {
        let source = r#"
const tasks = query(api.tasks.list());
const el = <div title={tasks.data.name} />;
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── JSX children ───────────────────────────────────────────────────

    #[test]
    fn tracks_field_in_jsx_children() {
        let source = r#"
const tasks = query(api.tasks.list());
const el = <div>{tasks.data.name}</div>;
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── Nested JSX elements ────────────────────────────────────────────

    #[test]
    fn tracks_field_in_nested_jsx_element() {
        let source = r#"
const tasks = query(api.tasks.list());
const el = <div><span>{tasks.data.title}</span></div>;
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"title".to_string()));
    }

    #[test]
    fn tracks_field_in_nested_jsx_attribute() {
        let source = r#"
const tasks = query(api.tasks.list());
const el = <div><span className={tasks.data.status} /></div>;
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"status".to_string()));
    }

    // ── JSX in callbacks ───────────────────────────────────────────────

    #[test]
    fn tracks_field_in_callback_jsx_children() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.map(t => <div>{t.name}</div>);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    #[test]
    fn tracks_field_in_callback_jsx_attribute() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.map(t => <div className={t.status} />);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"status".to_string()));
    }

    #[test]
    fn tracks_field_in_callback_nested_jsx() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.map(t => <div><span>{t.title}</span></div>);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"title".to_string()));
    }

    // ── Conditional expressions ────────────────────────────────────────

    #[test]
    fn tracks_field_in_ternary_test() {
        let source = r#"
const tasks = query(api.tasks.list());
const x = tasks.data.active ? 'yes' : 'no';
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"active".to_string()));
    }

    #[test]
    fn tracks_field_in_ternary_consequent() {
        let source = r#"
const tasks = query(api.tasks.list());
const x = true ? tasks.data.name : 'default';
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    #[test]
    fn tracks_field_in_ternary_alternate() {
        let source = r#"
const tasks = query(api.tasks.list());
const x = false ? 'default' : tasks.data.title;
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"title".to_string()));
    }

    // ── Optional chaining ──────────────────────────────────────────────

    #[test]
    fn tracks_field_through_optional_chain_static_member() {
        let source = r#"
const tasks = query(api.tasks.list());
const x = tasks?.data?.name;
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    #[test]
    fn tracks_fields_in_optional_chain_map() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data?.map(t => t.name);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── If statement ───────────────────────────────────────────────────

    #[test]
    fn tracks_field_in_if_test() {
        let source = r#"
function App() {
    const tasks = query(api.tasks.list());
    if (tasks.data.ready) { console.log('ok'); }
}
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"ready".to_string()));
    }

    #[test]
    fn tracks_field_in_if_consequent() {
        let source = r#"
function App() {
    const tasks = query(api.tasks.list());
    if (true) { console.log(tasks.data.name); }
}
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    #[test]
    fn tracks_field_in_if_alternate() {
        let source = r#"
function App() {
    const tasks = query(api.tasks.list());
    if (false) {} else { console.log(tasks.data.title); }
}
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"title".to_string()));
    }

    // ── Block statement ────────────────────────────────────────────────

    #[test]
    fn tracks_field_in_block_statement() {
        let source = r#"
function App() {
    const tasks = query(api.tasks.list());
    if (true) {
        const x = tasks.data.name;
    }
}
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── Variable declaration ───────────────────────────────────────────

    #[test]
    fn tracks_field_in_variable_init() {
        let source = r#"
const tasks = query(api.tasks.list());
const name = tasks.data.name;
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── Return statement ───────────────────────────────────────────────

    #[test]
    fn tracks_field_in_return_statement() {
        let source = r#"
function App() {
    const tasks = query(api.tasks.list());
    return tasks.data.title;
}
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"title".to_string()));
    }

    // ── Object property values ─────────────────────────────────────────

    #[test]
    fn tracks_field_in_object_property_value() {
        let source = r#"
const tasks = query(api.tasks.list());
const obj = { name: tasks.data.name };
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── Parenthesized expression ───────────────────────────────────────

    #[test]
    fn tracks_field_in_parenthesized_expression() {
        let source = r#"
const tasks = query(api.tasks.list());
const x = (tasks.data.name);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── Arrow function expression ──────────────────────────────────────

    #[test]
    fn tracks_field_in_arrow_expression_body() {
        let source = r#"
const tasks = query(api.tasks.list());
const fn1 = () => tasks.data.name;
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── Multiple query variables ───────────────────────────────────────

    #[test]
    fn tracks_multiple_query_variables_independently() {
        let source = r#"
const tasks = query(api.tasks.list());
const users = query(api.users.list());
const t = tasks.data.title;
const u = users.data.email;
"#;
        let results = analyze(source);
        assert_eq!(results.len(), 2);

        let tasks_result = results.iter().find(|r| r.query_var == "tasks").unwrap();
        let users_result = results.iter().find(|r| r.query_var == "users").unwrap();

        assert!(tasks_result.fields.contains(&"title".to_string()));
        assert!(!tasks_result.fields.contains(&"email".to_string()));

        assert!(users_result.fields.contains(&"email".to_string()));
        assert!(!users_result.fields.contains(&"title".to_string()));
    }

    // ── Multiple fields collected ──────────────────────────────────────

    #[test]
    fn collects_multiple_distinct_fields() {
        let source = r#"
const tasks = query(api.tasks.list());
const a = tasks.data.name;
const b = tasks.data.title;
const c = tasks.data.status;
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
        assert!(results[0].fields.contains(&"title".to_string()));
        assert!(results[0].fields.contains(&"status".to_string()));
    }

    // ── Injection position ─────────────────────────────────────────────

    #[test]
    fn injection_pos_before_closing_paren_for_no_args() {
        let source = "const tasks = query(api.tasks.list());";
        let results = analyze(source);
        // api.tasks.list() — pos should be just before the closing paren of list()
        let pos = results[0].injection_pos as usize;
        assert_eq!(&source[pos..pos + 1], ")");
    }

    #[test]
    fn injection_pos_before_closing_brace_for_object_arg() {
        let source = "const tasks = query(api.tasks.list({ status: 'a' }));";
        let results = analyze(source);
        let pos = results[0].injection_pos as usize;
        // Should point just before the closing } of the object literal
        assert_eq!(&source[pos..pos + 1], "}");
    }

    #[test]
    fn injection_pos_after_last_arg_for_non_object() {
        let source = "const tasks = query(api.tasks.get(id));";
        let results = analyze(source);
        let pos = results[0].injection_pos as usize;
        // Should point right after "id"
        assert_eq!(&source[pos..pos + 1], ")");
    }

    // ── Opaque access edge cases ───────────────────────────────────────

    #[test]
    fn no_opaque_when_callback_passes_param_to_function() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.map(t => someFunc(t));
"#;
        let results = analyze(source);
        // Passing param to function in callback is not tracked as opaque
        // (only spread and computed key access trigger opaque in callbacks)
        assert!(!results[0].has_opaque_access);
    }

    // ── Non-entity props in nested path filtering ──────────────────────

    #[test]
    fn filters_non_entity_props_from_nested_path() {
        let source = r#"
const tasks = query(api.tasks.list());
const x = tasks.data.assignee.length;
"#;
        let results = analyze(source);
        // assignee is the field, length is filtered from nested path
        assert!(results[0].fields.contains(&"assignee".to_string()));
        let nested = results[0]
            .nested_access
            .iter()
            .find(|n| n.field == "assignee");
        // nested_path should be empty since length is filtered
        if let Some(n) = nested {
            assert!(n.nested_path.is_empty());
        }
    }

    // ── ChainExpression static member access ───────────────────────────

    #[test]
    fn handles_chain_expression_structural_only() {
        let source = r#"
const tasks = query(api.tasks.list());
const x = tasks?.data;
"#;
        let results = analyze(source);
        // tasks?.data is structural-only access, no entity fields
        assert!(results[0].fields.is_empty());
    }

    // ── Call expression recurse into callee and args ────────────────────

    #[test]
    fn tracks_field_in_call_expression_argument() {
        let source = r#"
const tasks = query(api.tasks.list());
someFunc(tasks.data.name);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── Opaque: passing variable itself as arg ─────────────────────────

    #[test]
    fn opaque_when_passing_query_var_directly_as_arg() {
        let source = r#"
const tasks = query(api.tasks.list());
someFunc(tasks);
"#;
        let results = analyze(source);
        assert!(results[0].has_opaque_access);
    }

    // ── Callback return statement ──────────────────────────────────────

    #[test]
    fn tracks_field_in_callback_return_statement() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.map(t => { return t.name; });
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── Callback with non-identifier param is ignored ──────────────────

    #[test]
    fn ignores_callback_without_identifier_param() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.map(([a, b]) => a);
"#;
        let results = analyze(source);
        // Destructured param — no param name extracted, callback not tracked
        assert!(results[0].fields.is_empty());
    }

    // ── Export named non-variable is ignored ────────────────────────────

    #[test]
    fn ignores_export_named_function_declaration() {
        let results = analyze("export function query() {}");
        assert!(results.is_empty());
    }

    // ── Callback JSX attributes in nested elements ─────────────────────

    #[test]
    fn tracks_field_in_callback_nested_jsx_attribute() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.map(t => <div><span title={t.name} /></div>);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── Optional chain map with relation ───────────────────────────────

    #[test]
    fn optional_chain_map_with_items() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data?.items?.map(t => t.name);
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── Callback object expression tracking ────────────────────────────

    #[test]
    fn tracks_field_in_callback_object_property() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.map(t => ({ label: t.name }));
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── Callback parenthesized expression ──────────────────────────────

    #[test]
    fn tracks_field_in_callback_parenthesized_expr() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.map(t => (t.name));
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── Callback call expression in body ───────────────────────────────

    #[test]
    fn tracks_field_in_callback_call_expression() {
        let source = r#"
const tasks = query(api.tasks.list());
tasks.data.items.map(t => String(t.name));
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── Computed member in chain ───────────────────────────────────────

    #[test]
    fn tracks_field_through_computed_index_access() {
        let source = r#"
const tasks = query(api.tasks.list());
const x = tasks.data.items[0].name;
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }

    // ── all NON_ENTITY_PROPS are excluded ──────────────────────────────

    #[test]
    fn excludes_all_signal_properties() {
        for prop in &[
            "loading",
            "error",
            "revalidating",
            "refetch",
            "revalidate",
            "dispose",
        ] {
            let source = format!(
                "const tasks = query(api.tasks.list());\nconst x = tasks.data.{};",
                prop
            );
            let results = analyze(&source);
            assert!(
                results[0].fields.is_empty(),
                "expected '{}' to be excluded",
                prop
            );
        }
    }

    #[test]
    fn excludes_all_array_method_properties() {
        for prop in &[
            "map", "filter", "find", "forEach", "some", "every", "reduce", "flatMap", "includes",
            "indexOf", "length", "slice", "sort",
        ] {
            let source = format!(
                "const tasks = query(api.tasks.list());\nconst x = tasks.data.{};",
                prop
            );
            let results = analyze(&source);
            assert!(
                results[0].fields.is_empty(),
                "expected '{}' to be excluded",
                prop
            );
        }
    }

    // ── Pragma edge cases ──────────────────────────────────────────────

    #[test]
    fn pragma_with_blank_line_before_decl() {
        let source = "// @vertz-select-all\n\nconst tasks = query(api.tasks.list());";
        let results = analyze(source);
        assert!(results.is_empty());
    }

    #[test]
    fn no_pragma_match_on_code_line() {
        let source = "const y = 1;\nconst tasks = query(api.tasks.list());";
        let results = analyze(source);
        assert_eq!(results.len(), 1);
    }

    // ── Export named with arrow in query ────────────────────────────────

    #[test]
    fn export_with_arrow_wrapper() {
        let results = analyze("export const tasks = query(() => api.tasks.list());");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].query_var, "tasks");
    }

    // ── Chain expression computed member ────────────────────────────────

    #[test]
    fn chain_computed_member_continues_chain() {
        let source = r#"
const tasks = query(api.tasks.list());
const x = tasks?.data?.[0]?.name;
"#;
        let results = analyze(source);
        assert!(results[0].fields.contains(&"name".to_string()));
    }
}
