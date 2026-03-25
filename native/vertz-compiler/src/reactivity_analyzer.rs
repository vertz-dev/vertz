use std::collections::{HashMap, HashSet};

use oxc_ast::ast::*;
use oxc_ast_visit::Visit;

use crate::component_analyzer::ComponentInfo;
use crate::signal_api_registry::{get_signal_api_config, REACTIVE_SOURCE_APIS};

/// Classification of a variable's reactivity.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReactivityKind {
    Signal,
    Computed,
    Static,
}

impl ReactivityKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            ReactivityKind::Signal => "signal",
            ReactivityKind::Computed => "computed",
            ReactivityKind::Static => "static",
        }
    }
}

/// Information about a variable inside a component.
pub struct VariableInfo {
    pub name: String,
    pub kind: ReactivityKind,
    pub start: u32,
    pub end: u32,
    pub signal_properties: Option<Vec<String>>,
    pub plain_properties: Option<Vec<String>>,
    pub field_signal_properties: Option<Vec<String>>,
    pub is_reactive_source: bool,
}

/// Internal variable metadata during collection phase.
struct VarMeta {
    name: String,
    start: u32,
    end: u32,
    is_let: bool,
    deps: HashSet<String>,
    /// Property accesses: variable_name → set of property names accessed
    property_accesses: HashMap<String, HashSet<String>>,
    is_function_def: bool,
    is_structural_literal: bool,
    is_signal_api: bool,
    signal_api_name: Option<String>,
    is_reactive_source: bool,
    /// For destructured bindings, the pre-classified kind
    destructured_kind: Option<DestructuredKind>,
}

/// Analyze variables within a component body and classify their reactivity.
pub fn analyze_reactivity<'a>(
    program: &Program<'a>,
    component: &ComponentInfo,
    import_aliases: &HashMap<String, String>,
) -> Vec<VariableInfo> {
    // Phase 1: Collect variable declarations and their dependencies
    let var_metas = collect_variables(program, component, import_aliases);

    // Phase 2: Classify based on JSX reachability
    classify_variables(program, component, var_metas)
}

/// Build import alias map: local_name → original_api_name
/// for signal API imports.
pub fn build_import_aliases<'a>(program: &Program<'a>) -> HashMap<String, String> {
    let mut aliases = HashMap::new();

    for stmt in &program.body {
        if let Statement::ImportDeclaration(import) = stmt {
            if let Some(ref specifiers) = import.specifiers {
                for spec in specifiers {
                    if let ImportDeclarationSpecifier::ImportSpecifier(named) = spec {
                        let imported_name = match &named.imported {
                            ModuleExportName::IdentifierName(id) => id.name.as_str(),
                            ModuleExportName::IdentifierReference(id) => id.name.as_str(),
                            ModuleExportName::StringLiteral(s) => s.value.as_str(),
                        };
                        let local_name = named.local.name.as_str();

                        // Check if the imported name is a known signal API
                        if get_signal_api_config(imported_name).is_some() {
                            aliases.insert(local_name.to_string(), imported_name.to_string());
                        }

                        // Check if it's a reactive source API
                        if REACTIVE_SOURCE_APIS.contains(imported_name) {
                            aliases.insert(local_name.to_string(), imported_name.to_string());
                        }
                    }
                }
            }
        }
    }

    aliases
}

/// Phase 1: Walk the component body and collect variable declarations.
fn collect_variables<'a>(
    program: &Program<'a>,
    component: &ComponentInfo,
    import_aliases: &HashMap<String, String>,
) -> Vec<VarMeta> {
    let mut metas = Vec::new();

    // Walk statements in the program body, filtering to component range
    for stmt in &program.body {
        collect_vars_from_statement(stmt, component, import_aliases, &mut metas);
    }

    metas
}

fn collect_vars_from_statement<'a>(
    stmt: &Statement<'a>,
    component: &ComponentInfo,
    import_aliases: &HashMap<String, String>,
    metas: &mut Vec<VarMeta>,
) {
    // Handle function declarations that are the component itself
    if let Statement::FunctionDeclaration(func) = stmt {
        if let Some(ref id) = func.id {
            if id.name.as_str() == component.name {
                if let Some(ref body) = func.body {
                    for body_stmt in &body.statements {
                        collect_vars_from_body_stmt(body_stmt, import_aliases, metas);
                    }
                }
                return;
            }
        }
    }

    // Handle export declarations wrapping the component
    if let Statement::ExportNamedDeclaration(export_decl) = stmt {
        if let Some(ref decl) = export_decl.declaration {
            collect_vars_from_exported_decl(decl, component, import_aliases, metas);
            return;
        }
    }

    // Handle variable declarations (const Foo = () => { ... })
    if let Statement::VariableDeclaration(var_decl) = stmt {
        for declarator in &var_decl.declarations {
            if let BindingPattern::BindingIdentifier(ref id) = declarator.id {
                if id.name.as_str() == component.name {
                    if let Some(ref init) = declarator.init {
                        collect_vars_from_component_init(init, import_aliases, metas);
                    }
                }
            }
        }
    }

    // Handle export default
    if let Statement::ExportDefaultDeclaration(export_default) = stmt {
        if let ExportDefaultDeclarationKind::FunctionDeclaration(ref func) =
            export_default.declaration
        {
            if let Some(ref id) = func.id {
                if id.name.as_str() == component.name {
                    if let Some(ref body) = func.body {
                        for body_stmt in &body.statements {
                            collect_vars_from_body_stmt(body_stmt, import_aliases, metas);
                        }
                    }
                }
            }
        }
    }
}

fn collect_vars_from_exported_decl<'a>(
    decl: &Declaration<'a>,
    component: &ComponentInfo,
    import_aliases: &HashMap<String, String>,
    metas: &mut Vec<VarMeta>,
) {
    match decl {
        Declaration::FunctionDeclaration(func) => {
            if let Some(ref id) = func.id {
                if id.name.as_str() == component.name {
                    if let Some(ref body) = func.body {
                        for body_stmt in &body.statements {
                            collect_vars_from_body_stmt(body_stmt, import_aliases, metas);
                        }
                    }
                }
            }
        }
        Declaration::VariableDeclaration(var_decl) => {
            for declarator in &var_decl.declarations {
                if let BindingPattern::BindingIdentifier(ref id) = declarator.id {
                    if id.name.as_str() == component.name {
                        if let Some(ref init) = declarator.init {
                            collect_vars_from_component_init(init, import_aliases, metas);
                        }
                    }
                }
            }
        }
        _ => {}
    }
}

fn collect_vars_from_component_init<'a>(
    expr: &Expression<'a>,
    import_aliases: &HashMap<String, String>,
    metas: &mut Vec<VarMeta>,
) {
    match expr {
        Expression::ArrowFunctionExpression(arrow) => {
            for stmt in &arrow.body.statements {
                collect_vars_from_body_stmt(stmt, import_aliases, metas);
            }
        }
        Expression::FunctionExpression(func) => {
            if let Some(ref body) = func.body {
                for stmt in &body.statements {
                    collect_vars_from_body_stmt(stmt, import_aliases, metas);
                }
            }
        }
        Expression::ParenthesizedExpression(paren) => {
            collect_vars_from_component_init(&paren.expression, import_aliases, metas);
        }
        Expression::TSAsExpression(ts_as) => {
            collect_vars_from_component_init(&ts_as.expression, import_aliases, metas);
        }
        Expression::TSSatisfiesExpression(ts_sat) => {
            collect_vars_from_component_init(&ts_sat.expression, import_aliases, metas);
        }
        _ => {}
    }
}

fn collect_vars_from_body_stmt<'a>(
    stmt: &Statement<'a>,
    import_aliases: &HashMap<String, String>,
    metas: &mut Vec<VarMeta>,
) {
    if let Statement::VariableDeclaration(var_decl) = stmt {
        let is_let = matches!(var_decl.kind, VariableDeclarationKind::Let);

        for declarator in &var_decl.declarations {
            match &declarator.id {
                BindingPattern::BindingIdentifier(id) => {
                    collect_binding_identifier(id, declarator, is_let, import_aliases, metas);
                }
                BindingPattern::ObjectPattern(obj_pattern) => {
                    // Handle destructured bindings: const { data, error } = query(...)
                    if let Some(ref init) = declarator.init {
                        collect_destructured_bindings(
                            obj_pattern,
                            init,
                            declarator,
                            import_aliases,
                            metas,
                        );
                    }
                }
                _ => {}
            }
        }
    }
}

fn collect_binding_identifier<'a>(
    id: &BindingIdentifier<'a>,
    declarator: &VariableDeclarator<'a>,
    is_let: bool,
    import_aliases: &HashMap<String, String>,
    metas: &mut Vec<VarMeta>,
) {
    let name = id.name.to_string();
    let mut deps = HashSet::new();
    let mut property_accesses: HashMap<String, HashSet<String>> = HashMap::new();
    let mut is_function_def = false;
    let mut is_structural_literal = false;
    let mut is_signal_api = false;
    let mut signal_api_name = None;
    let mut is_reactive_source = false;

    if let Some(ref init) = declarator.init {
        // Collect identifier dependencies
        let mut dep_collector = DepCollector::new();
        dep_collector.visit_expression(init);
        deps = dep_collector.identifiers;
        property_accesses = dep_collector.property_accesses;

        // Check if init is a function/arrow definition
        is_function_def = is_function_expression(init);

        // Check if init is an object/array literal
        is_structural_literal = is_structural(init);

        // Check if init is a call to a signal API (unwrap NonNull first)
        let unwrapped_init = unwrap_ts_non_null(init);
        if let Some(callee_name) = get_call_expression_name(unwrapped_init) {
            // Resolve through aliases
            let original_name = import_aliases
                .get(&callee_name)
                .cloned()
                .unwrap_or_else(|| callee_name.clone());

            if REACTIVE_SOURCE_APIS.contains(original_name.as_str()) {
                is_reactive_source = true;
            }

            if get_signal_api_config(&original_name).is_some() {
                is_signal_api = true;
                signal_api_name = Some(original_name);
            }
        }
    }

    metas.push(VarMeta {
        name,
        start: declarator.span.start,
        end: declarator.span.end,
        is_let,
        deps,
        property_accesses,
        is_function_def,
        is_structural_literal,
        is_signal_api,
        signal_api_name,
        is_reactive_source,
        destructured_kind: None,
    });
}

fn collect_destructured_bindings<'a>(
    obj_pattern: &ObjectPattern<'a>,
    init: &Expression<'a>,
    declarator: &VariableDeclarator<'a>,
    import_aliases: &HashMap<String, String>,
    metas: &mut Vec<VarMeta>,
) {
    // Check if the init is a call to a signal API
    let unwrapped_init = unwrap_ts_non_null(init);
    let callee_name = get_call_expression_name(unwrapped_init);
    let original_api_name = callee_name.as_ref().map(|name| {
        import_aliases
            .get(name)
            .cloned()
            .unwrap_or_else(|| name.clone())
    });

    let signal_config = original_api_name
        .as_ref()
        .and_then(|name| get_signal_api_config(name));

    let is_reactive_source = original_api_name
        .as_ref()
        .is_some_and(|name| REACTIVE_SOURCE_APIS.contains(name.as_str()));

    for prop in &obj_pattern.properties {
        if let BindingPattern::BindingIdentifier(ref binding_id) = prop.value {
            let local_name = binding_id.name.to_string();

            // Use the key name for property lookup (handles renamed destructuring)
            let source_prop_name =
                extract_property_key_name(&prop.key).unwrap_or_else(|| local_name.clone());

            // Determine the kind based on signal API config
            let is_signal_prop = signal_config
                .is_some_and(|config| config.signal_properties.contains(source_prop_name.as_str()));
            let is_plain_prop = signal_config
                .is_some_and(|config| config.plain_properties.contains(source_prop_name.as_str()));

            // Destructured signal properties become signal variables,
            // destructured plain properties become static
            let kind_hint = if is_signal_prop {
                DestructuredKind::Signal
            } else if is_plain_prop || signal_config.is_some() {
                DestructuredKind::Static
            } else if is_reactive_source {
                DestructuredKind::ReactiveSource
            } else {
                DestructuredKind::Unknown
            };

            metas.push(VarMeta {
                name: local_name,
                start: declarator.span.start,
                end: declarator.span.end,
                is_let: false,
                deps: HashSet::new(),
                property_accesses: HashMap::new(),
                is_function_def: false,
                is_structural_literal: false,
                is_signal_api: false,
                signal_api_name: None,
                is_reactive_source: matches!(kind_hint, DestructuredKind::ReactiveSource),
                destructured_kind: Some(kind_hint),
            });
        }
    }
}

#[derive(Debug, Clone)]
enum DestructuredKind {
    Signal,
    Static,
    ReactiveSource,
    Unknown,
}

/// Phase 2: Classify variables based on JSX reachability.
fn classify_variables<'a>(
    program: &Program<'a>,
    component: &ComponentInfo,
    metas: Vec<VarMeta>,
) -> Vec<VariableInfo> {
    // Step 1: Collect identifiers referenced in JSX
    let jsx_refs = collect_jsx_refs(program, component);

    // Step 2: Expand reachability transitively through const dependencies
    let mut jsx_reachable: HashSet<String> = jsx_refs.clone();
    let const_deps: HashMap<String, &HashSet<String>> = metas
        .iter()
        .filter(|m| !m.is_let)
        .map(|m| (m.name.clone(), &m.deps))
        .collect();

    // Fixed-point expansion
    loop {
        let mut changed = false;
        for (name, deps) in &const_deps {
            if jsx_reachable.contains(name.as_str()) {
                for dep in *deps {
                    if jsx_reachable.insert(dep.clone()) {
                        changed = true;
                    }
                }
            }
        }
        if !changed {
            break;
        }
    }

    // Build lookup maps
    let meta_map: HashMap<&str, &VarMeta> = metas.iter().map(|m| (m.name.as_str(), m)).collect();

    // Step 3: Classify each variable
    metas
        .iter()
        .map(|meta| {
            let kind = if let Some(ref dk) = meta.destructured_kind {
                // Destructured bindings are pre-classified
                match dk {
                    DestructuredKind::Signal => ReactivityKind::Signal,
                    DestructuredKind::Static => ReactivityKind::Static,
                    DestructuredKind::ReactiveSource => ReactivityKind::Signal,
                    DestructuredKind::Unknown => ReactivityKind::Static,
                }
            } else if meta.is_let {
                // let variables: signal if JSX-reachable
                if jsx_reachable.contains(&meta.name) {
                    ReactivityKind::Signal
                } else {
                    ReactivityKind::Static
                }
            } else if meta.is_signal_api {
                // Signal API vars are static (the object doesn't change)
                ReactivityKind::Static
            } else if meta.is_function_def || meta.is_structural_literal {
                // Functions and structural literals are stable references
                ReactivityKind::Static
            } else {
                // Check if this const depends on any reactive thing
                if depends_on_reactive(meta, &meta_map, &jsx_reachable) {
                    ReactivityKind::Computed
                } else {
                    ReactivityKind::Static
                }
            };

            // Build signal/plain/field properties for signal API vars
            let (signal_props, plain_props, field_props) = if meta.is_signal_api {
                if let Some(ref api_name) = meta.signal_api_name {
                    if let Some(config) = get_signal_api_config(api_name) {
                        (
                            Some(
                                config
                                    .signal_properties
                                    .iter()
                                    .map(|s| s.to_string())
                                    .collect(),
                            ),
                            Some(
                                config
                                    .plain_properties
                                    .iter()
                                    .map(|s| s.to_string())
                                    .collect(),
                            ),
                            config
                                .field_signal_properties
                                .as_ref()
                                .map(|fps| fps.iter().map(|s| s.to_string()).collect()),
                        )
                    } else {
                        (None, None, None)
                    }
                } else {
                    (None, None, None)
                }
            } else {
                (None, None, None)
            };

            VariableInfo {
                name: meta.name.clone(),
                kind,
                start: meta.start,
                end: meta.end,
                signal_properties: signal_props,
                plain_properties: plain_props,
                field_signal_properties: field_props,
                is_reactive_source: meta.is_reactive_source,
            }
        })
        .collect()
}

/// Check if a variable transitively depends on any reactive source.
fn depends_on_reactive(
    meta: &VarMeta,
    meta_map: &HashMap<&str, &VarMeta>,
    jsx_reachable: &HashSet<String>,
) -> bool {
    let mut visited = HashSet::new();
    depends_on_reactive_inner(meta, meta_map, jsx_reachable, &mut visited)
}

fn depends_on_reactive_inner(
    meta: &VarMeta,
    meta_map: &HashMap<&str, &VarMeta>,
    jsx_reachable: &HashSet<String>,
    visited: &mut HashSet<String>,
) -> bool {
    if !visited.insert(meta.name.clone()) {
        return false; // Already visited, avoid cycles
    }

    for dep in &meta.deps {
        if let Some(dep_meta) = meta_map.get(dep.as_str()) {
            // Depends on a let variable that is JSX-reachable (i.e., a signal)
            if dep_meta.is_let && jsx_reachable.contains(&dep_meta.name) {
                return true;
            }

            // Depends on a signal API var → check if accessing a signal property
            if dep_meta.is_signal_api {
                if let Some(props_accessed) = meta.property_accesses.get(dep.as_str()) {
                    if let Some(ref api_name) = dep_meta.signal_api_name {
                        if let Some(config) = get_signal_api_config(api_name) {
                            for prop in props_accessed {
                                if config.signal_properties.contains(prop.as_str()) {
                                    return true;
                                }
                            }
                        }
                    }
                }
                continue;
            }

            // Depends on a reactive source
            if dep_meta.is_reactive_source {
                return true;
            }

            // Depends on another const that is itself reactive (transitive)
            if !dep_meta.is_function_def
                && !dep_meta.is_structural_literal
                && !dep_meta.is_signal_api
                && depends_on_reactive_inner(dep_meta, meta_map, jsx_reachable, visited)
            {
                return true;
            }
        }
    }

    false
}

/// Collect all identifiers referenced within JSX expressions in a component.
fn collect_jsx_refs<'a>(program: &Program<'a>, component: &ComponentInfo) -> HashSet<String> {
    let mut collector = JsxRefCollector {
        refs: HashSet::new(),
        component_body_start: component.body_start,
        component_body_end: component.body_end,
        in_jsx_expr: false,
    };

    // Walk the entire program — the collector filters by component range
    for stmt in &program.body {
        collector.visit_statement(stmt);
    }

    collector.refs
}

/// Collects identifier references that appear inside JSX expression containers.
struct JsxRefCollector {
    refs: HashSet<String>,
    component_body_start: u32,
    component_body_end: u32,
    in_jsx_expr: bool,
}

impl<'a> Visit<'a> for JsxRefCollector {
    fn visit_jsx_expression_container(&mut self, container: &JSXExpressionContainer<'a>) {
        if container.span.start >= self.component_body_start
            && container.span.end <= self.component_body_end
        {
            let was_in_jsx = self.in_jsx_expr;
            self.in_jsx_expr = true;
            oxc_ast_visit::walk::walk_jsx_expression_container(self, container);
            self.in_jsx_expr = was_in_jsx;
        }
    }

    fn visit_identifier_reference(&mut self, ident: &IdentifierReference<'a>) {
        if self.in_jsx_expr {
            self.refs.insert(ident.name.to_string());
        }
    }
}

/// Collects identifier dependencies and property accesses from an expression.
struct DepCollector {
    identifiers: HashSet<String>,
    property_accesses: HashMap<String, HashSet<String>>,
}

impl DepCollector {
    fn new() -> Self {
        Self {
            identifiers: HashSet::new(),
            property_accesses: HashMap::new(),
        }
    }
}

impl<'a> Visit<'a> for DepCollector {
    fn visit_identifier_reference(&mut self, ident: &IdentifierReference<'a>) {
        self.identifiers.insert(ident.name.to_string());
    }

    fn visit_member_expression(&mut self, expr: &MemberExpression<'a>) {
        // Track property accesses: obj.prop → property_accesses[obj] = {prop}
        if let MemberExpression::StaticMemberExpression(ref static_member) = expr {
            if let Expression::Identifier(ref obj_ident) = static_member.object {
                let obj_name = obj_ident.name.to_string();
                let prop_name = static_member.property.name.to_string();
                self.property_accesses
                    .entry(obj_name.clone())
                    .or_default()
                    .insert(prop_name);
                self.identifiers.insert(obj_name);
                return; // Don't walk children (we've handled the object)
            }
        }

        // For other member expressions, walk normally
        oxc_ast_visit::walk::walk_member_expression(self, expr);
    }
}

/// Check if an expression is a function/arrow expression.
fn is_function_expression(expr: &Expression) -> bool {
    match expr {
        Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => true,
        Expression::ParenthesizedExpression(paren) => is_function_expression(&paren.expression),
        Expression::TSAsExpression(ts_as) => is_function_expression(&ts_as.expression),
        Expression::TSSatisfiesExpression(ts_sat) => is_function_expression(&ts_sat.expression),
        _ => false,
    }
}

/// Check if an expression is an object or array literal.
fn is_structural(expr: &Expression) -> bool {
    match expr {
        Expression::ObjectExpression(_) | Expression::ArrayExpression(_) => true,
        Expression::ParenthesizedExpression(paren) => is_structural(&paren.expression),
        _ => false,
    }
}

/// Extract the name from a PropertyKey, if it's a static identifier.
fn extract_property_key_name(key: &PropertyKey) -> Option<String> {
    if let PropertyKey::StaticIdentifier(id) = key {
        Some(id.name.to_string())
    } else {
        None
    }
}

/// Unwrap TSNonNullExpression (the `!` postfix operator).
fn unwrap_ts_non_null<'a, 'b>(expr: &'b Expression<'a>) -> &'b Expression<'a> {
    if let Expression::TSNonNullExpression(ts_nn) = expr {
        unwrap_ts_non_null(&ts_nn.expression)
    } else {
        expr
    }
}

/// Extract the callee function name from a call expression, if it's a simple identifier call.
fn get_call_expression_name(expr: &Expression) -> Option<String> {
    if let Expression::CallExpression(call) = expr {
        match &call.callee {
            Expression::Identifier(id) => Some(id.name.to_string()),
            _ => None,
        }
    } else {
        None
    }
}
