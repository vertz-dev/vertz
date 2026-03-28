use oxc_ast::ast::*;
use oxc_span::GetSpan;

/// An extracted route from defineRoutes().
#[derive(Debug)]
pub struct ExtractedRoute {
    pub pattern: String,
    pub component_name: String,
    pub route_type: String, // "layout" or "page"
}

/// An extracted query() call from a component.
#[derive(Debug)]
pub struct ExtractedQuery {
    pub descriptor_chain: String,
    pub entity: Option<String>,
    pub operation: Option<String>,
    pub id_param: Option<String>,
}

/// Result of prefetch manifest analysis on a single file.
pub struct PrefetchAnalysis {
    pub routes: Vec<ExtractedRoute>,
    pub queries: Vec<ExtractedQuery>,
    pub route_params: Vec<String>,
}

/// Analyze a file for prefetch manifest data.
/// Extracts routes from defineRoutes() and queries from query() calls.
pub fn analyze_prefetch(program: &Program, source: &str) -> PrefetchAnalysis {
    let routes = extract_routes(program, source);
    let mut route_params = collect_use_params(program);

    // Also extract params from route patterns (e.g., `:projectId` in `/projects/:projectId`)
    for route in &routes {
        for segment in route.pattern.split('/') {
            if let Some(param) = segment.strip_prefix(':') {
                if !route_params.contains(&param.to_string()) {
                    route_params.push(param.to_string());
                }
            }
        }
    }

    let queries = extract_queries(program, &route_params);

    PrefetchAnalysis {
        routes,
        queries,
        route_params,
    }
}

// ─── Route Extraction ───────────────────────────────────────────

/// Extract routes from defineRoutes() calls in the program.
fn extract_routes(program: &Program, source: &str) -> Vec<ExtractedRoute> {
    // Find defineRoutes() call
    let route_obj = find_define_routes_arg(program);
    let Some(route_obj) = route_obj else {
        return Vec::new();
    };

    // Parse the object literal into nested routes
    let nested = parse_route_object(route_obj, source);

    // Flatten nested routes into full patterns
    flatten_routes(&nested, "")
}

/// Find the first defineRoutes() call argument (object literal).
fn find_define_routes_arg<'a>(program: &'a Program<'a>) -> Option<&'a ObjectExpression<'a>> {
    for stmt in &program.body {
        if let Some(obj) = find_define_routes_in_stmt(stmt) {
            return Some(obj);
        }
    }
    None
}

fn find_define_routes_in_stmt<'a>(stmt: &'a Statement<'a>) -> Option<&'a ObjectExpression<'a>> {
    match stmt {
        Statement::VariableDeclaration(var_decl) => {
            for declarator in &var_decl.declarations {
                if let Some(ref init) = declarator.init {
                    if let Some(obj) = find_define_routes_in_expr(init) {
                        return Some(obj);
                    }
                }
            }
        }
        Statement::ExpressionStatement(expr_stmt) => {
            if let Some(obj) = find_define_routes_in_expr(&expr_stmt.expression) {
                return Some(obj);
            }
        }
        Statement::ExportNamedDeclaration(export_decl) => {
            if let Some(Declaration::VariableDeclaration(var_decl)) =
                export_decl.declaration.as_ref()
            {
                for declarator in &var_decl.declarations {
                    if let Some(ref init) = declarator.init {
                        if let Some(obj) = find_define_routes_in_expr(init) {
                            return Some(obj);
                        }
                    }
                }
            }
        }
        Statement::ExportDefaultDeclaration(export_default) => {
            if let ExportDefaultDeclarationKind::CallExpression(call) = &export_default.declaration
            {
                if is_define_routes_call(call) {
                    if let Some(arg) = call.arguments.first() {
                        if let Expression::ObjectExpression(obj) = arg.to_expression() {
                            return Some(obj);
                        }
                    }
                }
            }
        }
        _ => {}
    }
    None
}

fn find_define_routes_in_expr<'a>(expr: &'a Expression<'a>) -> Option<&'a ObjectExpression<'a>> {
    if let Expression::CallExpression(call) = expr {
        if is_define_routes_call(call) {
            if let Some(arg) = call.arguments.first() {
                if let Expression::ObjectExpression(obj) = arg.to_expression() {
                    return Some(obj);
                }
            }
        }
    }
    None
}

fn is_define_routes_call(call: &CallExpression) -> bool {
    if let Expression::Identifier(ident) = &call.callee {
        return ident.name == "defineRoutes";
    }
    false
}

/// Intermediate nested route structure.
struct NestedRoute {
    pattern: String,
    component_name: String,
    has_children: bool,
    children: Vec<NestedRoute>,
}

/// Parse a route object literal into nested routes.
fn parse_route_object<'a>(obj: &'a ObjectExpression<'a>, source: &str) -> Vec<NestedRoute> {
    let mut routes = Vec::new();

    for prop in &obj.properties {
        let ObjectPropertyKind::ObjectProperty(property) = prop else {
            continue;
        };

        // Get route pattern from property key
        let pattern = get_property_key_string(property, source);
        let Some(pattern) = pattern else {
            continue;
        };

        // Value should be an object expression (route config)
        let Expression::ObjectExpression(route_config) = &property.value else {
            continue;
        };

        let mut component_name: Option<String> = None;
        let mut children: Vec<NestedRoute> = Vec::new();

        for inner_prop in &route_config.properties {
            let ObjectPropertyKind::ObjectProperty(inner_property) = inner_prop else {
                continue;
            };

            let key = get_identifier_key(inner_property);
            let Some(key) = key else {
                continue;
            };

            if key == "component" {
                component_name = extract_component_name(&inner_property.value);
            } else if key == "children" {
                if let Expression::ObjectExpression(children_obj) = &inner_property.value {
                    children = parse_route_object(children_obj, source);
                }
            }
        }

        if let Some(name) = component_name {
            let has_children = !children.is_empty();
            routes.push(NestedRoute {
                pattern,
                component_name: name,
                has_children,
                children,
            });
        }
    }

    routes
}

/// Get the string key of an object property.
fn get_property_key_string(prop: &ObjectProperty, source: &str) -> Option<String> {
    match &prop.key {
        PropertyKey::StringLiteral(str_lit) => Some(str_lit.value.as_str().to_string()),
        PropertyKey::StaticIdentifier(ident) => Some(ident.name.as_str().to_string()),
        _ => {
            // For computed properties, try to get the source text
            let span = prop.key.span();
            let text = &source[span.start as usize..span.end as usize];
            // Strip quotes if present
            let trimmed = text.trim_matches(|c| c == '\'' || c == '"');
            Some(trimmed.to_string())
        }
    }
}

/// Get the identifier name from a property key.
fn get_identifier_key(prop: &ObjectProperty) -> Option<String> {
    match &prop.key {
        PropertyKey::StaticIdentifier(ident) => Some(ident.name.as_str().to_string()),
        PropertyKey::StringLiteral(str_lit) => Some(str_lit.value.as_str().to_string()),
        _ => None,
    }
}

/// Extract component name from a route's component property value.
fn extract_component_name(expr: &Expression) -> Option<String> {
    match expr {
        Expression::ArrowFunctionExpression(arrow) => {
            // () => ComponentName() or () => <ComponentName />
            let body_expr = get_arrow_body_expr(arrow)?;
            extract_component_name_from_expr(body_expr)
        }
        Expression::Identifier(ident) => {
            // Bare identifier: component: HomePage
            Some(ident.name.as_str().to_string())
        }
        _ => None,
    }
}

fn get_arrow_body_expr<'a>(arrow: &'a ArrowFunctionExpression<'a>) -> Option<&'a Expression<'a>> {
    if arrow.expression {
        if let Some(Statement::ExpressionStatement(expr_stmt)) = arrow.body.statements.first() {
            return Some(&expr_stmt.expression);
        }
    }
    None
}

fn extract_component_name_from_expr(expr: &Expression) -> Option<String> {
    match expr {
        Expression::ParenthesizedExpression(paren) => {
            extract_component_name_from_expr(&paren.expression)
        }
        Expression::CallExpression(call) => {
            // ComponentName() — function call
            if let Expression::Identifier(ident) = &call.callee {
                return Some(ident.name.as_str().to_string());
            }
            None
        }
        Expression::JSXElement(jsx) => {
            // <ComponentName /> or <ComponentName>...</ComponentName>
            match &jsx.opening_element.name {
                JSXElementName::Identifier(ident) => Some(ident.name.as_str().to_string()),
                JSXElementName::IdentifierReference(ident) => Some(ident.name.as_str().to_string()),
                _ => None,
            }
        }
        Expression::Identifier(ident) => Some(ident.name.as_str().to_string()),
        _ => None,
    }
}

/// Flatten nested routes into full patterns.
fn flatten_routes(routes: &[NestedRoute], parent_pattern: &str) -> Vec<ExtractedRoute> {
    let mut flat = Vec::new();

    for route in routes {
        let full_pattern = join_patterns(parent_pattern, &route.pattern);

        flat.push(ExtractedRoute {
            pattern: full_pattern.clone(),
            component_name: route.component_name.clone(),
            route_type: if route.has_children {
                "layout".to_string()
            } else {
                "page".to_string()
            },
        });

        if !route.children.is_empty() {
            flat.extend(flatten_routes(&route.children, &full_pattern));
        }
    }

    flat
}

fn join_patterns(parent: &str, child: &str) -> String {
    if parent.is_empty() {
        return child.to_string();
    }
    if child == "/" {
        return parent.to_string();
    }
    let base = parent.strip_suffix('/').unwrap_or(parent);
    format!("{}{}", base, child)
}

// ─── Component Query Extraction ─────────────────────────────────

/// Collect route params from useParams() destructuring.
fn collect_use_params(program: &Program) -> Vec<String> {
    let mut params = Vec::new();

    for stmt in &program.body {
        collect_params_in_stmt(stmt, &mut params);
    }

    params
}

fn collect_params_in_stmt(stmt: &Statement, params: &mut Vec<String>) {
    match stmt {
        Statement::VariableDeclaration(var_decl) => {
            for declarator in &var_decl.declarations {
                check_use_params_declarator(declarator, params);
            }
        }
        Statement::FunctionDeclaration(func) => {
            if let Some(ref body) = func.body {
                for inner_stmt in &body.statements {
                    collect_params_in_stmt(inner_stmt, params);
                }
            }
        }
        Statement::ExportDefaultDeclaration(export_default) => {
            if let ExportDefaultDeclarationKind::FunctionDeclaration(func) =
                &export_default.declaration
            {
                if let Some(ref body) = func.body {
                    for inner_stmt in &body.statements {
                        collect_params_in_stmt(inner_stmt, params);
                    }
                }
            }
        }
        Statement::ExportNamedDeclaration(export_decl) => {
            if let Some(ref decl) = export_decl.declaration {
                if let Declaration::FunctionDeclaration(func) = decl {
                    if let Some(ref body) = func.body {
                        for inner_stmt in &body.statements {
                            collect_params_in_stmt(inner_stmt, params);
                        }
                    }
                } else if let Declaration::VariableDeclaration(var_decl) = decl {
                    for declarator in &var_decl.declarations {
                        check_use_params_declarator(declarator, params);
                    }
                }
            }
        }
        _ => {}
    }
}

fn check_use_params_declarator(declarator: &VariableDeclarator, params: &mut Vec<String>) {
    let Some(ref init) = declarator.init else {
        return;
    };

    // Check if init is useParams()
    let Expression::CallExpression(call) = init else {
        return;
    };
    let Expression::Identifier(callee) = &call.callee else {
        return;
    };
    if callee.name != "useParams" {
        return;
    }

    // Check if the binding is an object destructuring pattern
    if let BindingPattern::ObjectPattern(obj_pattern) = &declarator.id {
        for prop in &obj_pattern.properties {
            if let BindingPattern::BindingIdentifier(ref ident) = prop.value {
                params.push(ident.name.as_str().to_string());
            }
        }
    }
}

/// Extract query() calls from the program.
fn extract_queries(program: &Program, route_params: &[String]) -> Vec<ExtractedQuery> {
    let mut queries = Vec::new();

    for stmt in &program.body {
        extract_queries_in_stmt(stmt, route_params, &mut queries);
    }

    queries
}

fn extract_queries_in_stmt(
    stmt: &Statement,
    route_params: &[String],
    queries: &mut Vec<ExtractedQuery>,
) {
    match stmt {
        Statement::VariableDeclaration(var_decl) => {
            for declarator in &var_decl.declarations {
                if let Some(ref init) = declarator.init {
                    extract_queries_in_expr(init, route_params, queries);
                }
            }
        }
        Statement::ExpressionStatement(expr_stmt) => {
            extract_queries_in_expr(&expr_stmt.expression, route_params, queries);
        }
        Statement::FunctionDeclaration(func) => {
            if let Some(ref body) = func.body {
                for inner_stmt in &body.statements {
                    extract_queries_in_stmt(inner_stmt, route_params, queries);
                }
            }
        }
        Statement::ExportDefaultDeclaration(export_default) => {
            if let ExportDefaultDeclarationKind::FunctionDeclaration(func) =
                &export_default.declaration
            {
                if let Some(ref body) = func.body {
                    for inner_stmt in &body.statements {
                        extract_queries_in_stmt(inner_stmt, route_params, queries);
                    }
                }
            }
        }
        Statement::ExportNamedDeclaration(export_decl) => {
            if let Some(ref decl) = export_decl.declaration {
                if let Declaration::FunctionDeclaration(func) = decl {
                    if let Some(ref body) = func.body {
                        for inner_stmt in &body.statements {
                            extract_queries_in_stmt(inner_stmt, route_params, queries);
                        }
                    }
                } else if let Declaration::VariableDeclaration(var_decl) = decl {
                    for declarator in &var_decl.declarations {
                        if let Some(ref init) = declarator.init {
                            extract_queries_in_expr(init, route_params, queries);
                        }
                    }
                }
            }
        }
        Statement::ReturnStatement(ret) => {
            if let Some(ref arg) = ret.argument {
                extract_queries_in_expr(arg, route_params, queries);
            }
        }
        Statement::IfStatement(if_stmt) => {
            extract_queries_in_stmt(&if_stmt.consequent, route_params, queries);
            if let Some(ref alt) = if_stmt.alternate {
                extract_queries_in_stmt(alt, route_params, queries);
            }
        }
        Statement::BlockStatement(block) => {
            for inner_stmt in &block.body {
                extract_queries_in_stmt(inner_stmt, route_params, queries);
            }
        }
        _ => {}
    }
}

fn extract_queries_in_expr(
    expr: &Expression,
    route_params: &[String],
    queries: &mut Vec<ExtractedQuery>,
) {
    if let Expression::CallExpression(call) = expr {
        // Check if it's query(...)
        if let Expression::Identifier(callee) = &call.callee {
            if callee.name == "query" && !call.arguments.is_empty() {
                if let Some(query) = extract_query_info(
                    call.arguments.first().unwrap().to_expression(),
                    route_params,
                ) {
                    queries.push(query);
                }
            }
        }
    }
}

/// Extract full query info from a query() argument.
fn extract_query_info(arg: &Expression, route_params: &[String]) -> Option<ExtractedQuery> {
    // query(api.entity.method(...)) — the arg is a call expression
    if let Expression::CallExpression(call) = arg {
        let chain = extract_property_access_chain(&call.callee)?;
        let (entity, operation) = parse_entity_operation(&chain);

        let mut query = ExtractedQuery {
            descriptor_chain: chain,
            entity,
            operation: operation.clone(),
            id_param: None,
        };

        // Extract argument bindings based on operation type
        if operation.as_deref() == Some("get") && !call.arguments.is_empty() {
            let id_arg = call.arguments.first().unwrap().to_expression();
            if let Expression::Identifier(ident) = id_arg {
                if route_params.contains(&ident.name.as_str().to_string()) {
                    query.id_param = Some(ident.name.as_str().to_string());
                }
            }
        }

        return Some(query);
    }

    // query(descriptor) — a variable reference
    if let Expression::Identifier(ident) = arg {
        return Some(ExtractedQuery {
            descriptor_chain: ident.name.as_str().to_string(),
            entity: None,
            operation: None,
            id_param: None,
        });
    }

    None
}

/// Extract a property access chain like api.projects.list → "api.projects.list"
fn extract_property_access_chain(expr: &Expression) -> Option<String> {
    match expr {
        Expression::Identifier(ident) => Some(ident.name.as_str().to_string()),
        _ if expr.as_member_expression().is_some() => {
            let member = expr.as_member_expression().unwrap();
            if let MemberExpression::StaticMemberExpression(static_member) = member {
                let left = extract_property_access_chain(&static_member.object)?;
                Some(format!("{}.{}", left, static_member.property.name.as_str()))
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Parse entity name and operation from a descriptor chain.
fn parse_entity_operation(chain: &str) -> (Option<String>, Option<String>) {
    let parts: Vec<&str> = chain.split('.').collect();
    // Expected format: api.<entity>.<operation>
    if parts.len() >= 3 {
        (Some(parts[1].to_string()), Some(parts[2].to_string()))
    } else {
        (None, None)
    }
}
