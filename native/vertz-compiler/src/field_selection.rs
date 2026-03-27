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
