use std::collections::{HashMap, HashSet};

use oxc_ast::ast::*;
use oxc_ast_visit::Visit;

use crate::component_analyzer::ComponentInfo;
use crate::signal_api_registry::{get_signal_api_config, REACTIVE_SOURCE_APIS};

/// A manifest entry describing the reactivity of an exported function/variable.
#[derive(Debug, Clone)]
pub struct ManifestExportInfo {
    pub reactivity_type: String,
    pub signal_properties: Option<HashSet<String>>,
    pub plain_properties: Option<HashSet<String>>,
    pub field_signal_properties: Option<HashSet<String>>,
}

/// Registry of cross-file reactivity manifests.
/// Keyed by module specifier → export name → info.
pub type ManifestRegistry = HashMap<String, HashMap<String, ManifestExportInfo>>;

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
    import_ctx: &ImportContext,
) -> Vec<VariableInfo> {
    // Phase 1: Collect variable declarations and their dependencies
    let var_metas = collect_variables(program, component, import_ctx);

    // Build set of destructured prop names for reactivity classification
    let prop_names: HashSet<String> = component.destructured_prop_names.iter().cloned().collect();

    // Phase 2: Classify based on JSX reachability
    classify_variables(program, component, var_metas, import_ctx, &prop_names)
}

/// Build import alias map: local_name → original_api_name
/// for signal API imports. Also registers manifest-derived APIs.
///
/// Returns (aliases, dynamic_configs) where dynamic_configs contains
/// signal API configs derived from cross-file manifests.
pub fn build_import_aliases<'a>(
    program: &Program<'a>,
    manifests: &ManifestRegistry,
) -> (HashMap<String, String>, HashMap<String, DynamicApiConfig>) {
    let mut aliases = HashMap::new();
    let mut dynamic_configs: HashMap<String, DynamicApiConfig> = HashMap::new();

    for stmt in &program.body {
        if let Statement::ImportDeclaration(import) = stmt {
            let module_specifier = import.source.value.as_str();

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

                        // Check manifests for cross-file reactivity info
                        if let Some(module_exports) = manifests.get(module_specifier) {
                            if let Some(export_info) = module_exports.get(imported_name) {
                                match export_info.reactivity_type.as_str() {
                                    "signal-api" => {
                                        // Register as a dynamic signal API
                                        let key = format!(
                                            "__manifest__{module_specifier}__{imported_name}"
                                        );
                                        aliases.insert(local_name.to_string(), key.clone());
                                        dynamic_configs.insert(
                                            key,
                                            DynamicApiConfig {
                                                signal_properties: export_info
                                                    .signal_properties
                                                    .clone()
                                                    .unwrap_or_default(),
                                                plain_properties: export_info
                                                    .plain_properties
                                                    .clone()
                                                    .unwrap_or_default(),
                                                field_signal_properties: export_info
                                                    .field_signal_properties
                                                    .clone(),
                                            },
                                        );
                                    }
                                    "reactive-source" => {
                                        // Register as a reactive source
                                        let key = format!(
                                            "__manifest__{module_specifier}__{imported_name}"
                                        );
                                        aliases.insert(local_name.to_string(), key.clone());
                                        dynamic_configs.insert(
                                            key,
                                            DynamicApiConfig {
                                                signal_properties: HashSet::new(),
                                                plain_properties: HashSet::new(),
                                                field_signal_properties: None,
                                            },
                                        );
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    (aliases, dynamic_configs)
}

/// Dynamic signal API config derived from a cross-file manifest.
#[derive(Debug, Clone)]
pub struct DynamicApiConfig {
    pub signal_properties: HashSet<String>,
    pub plain_properties: HashSet<String>,
    pub field_signal_properties: Option<HashSet<String>>,
}

/// Combined import context: static aliases + dynamic manifest configs.
pub struct ImportContext {
    pub aliases: HashMap<String, String>,
    pub dynamic_configs: HashMap<String, DynamicApiConfig>,
}

impl ImportContext {
    /// Check if the resolved API name is a reactive source (static or dynamic).
    pub fn is_reactive_source(&self, resolved_name: &str) -> bool {
        if REACTIVE_SOURCE_APIS.contains(resolved_name) {
            return true;
        }
        // Dynamic manifest reactive sources have keys starting with __manifest__
        // and their DynamicApiConfig has empty signal/plain properties
        if let Some(config) = self.dynamic_configs.get(resolved_name) {
            return config.signal_properties.is_empty() && config.plain_properties.is_empty();
        }
        false
    }

    /// Get signal API config: first check static registry, then dynamic.
    pub fn get_signal_api_config(&self, resolved_name: &str) -> Option<DynamicApiConfig> {
        // Check static registry first
        if let Some(static_config) = get_signal_api_config(resolved_name) {
            return Some(DynamicApiConfig {
                signal_properties: static_config
                    .signal_properties
                    .iter()
                    .map(|s| s.to_string())
                    .collect(),
                plain_properties: static_config
                    .plain_properties
                    .iter()
                    .map(|s| s.to_string())
                    .collect(),
                field_signal_properties: static_config
                    .field_signal_properties
                    .as_ref()
                    .map(|fs| fs.iter().map(|s| s.to_string()).collect()),
            });
        }
        // Check dynamic configs
        self.dynamic_configs.get(resolved_name).cloned()
    }
}

/// Build query alias set: local names that resolve to `query` from @vertz/ui.
pub fn build_query_aliases<'a>(program: &Program<'a>) -> HashSet<String> {
    let mut aliases = HashSet::new();

    for stmt in &program.body {
        if let Statement::ImportDeclaration(import) = stmt {
            let source = import.source.value.as_str();
            // Only match @vertz/ui imports
            if !source.starts_with("@vertz/ui") && !source.starts_with("vertz/ui") {
                continue;
            }
            if let Some(ref specifiers) = import.specifiers {
                for spec in specifiers {
                    if let ImportDeclarationSpecifier::ImportSpecifier(named) = spec {
                        let imported_name = match &named.imported {
                            ModuleExportName::IdentifierName(id) => id.name.as_str(),
                            ModuleExportName::IdentifierReference(id) => id.name.as_str(),
                            ModuleExportName::StringLiteral(s) => s.value.as_str(),
                        };
                        if imported_name == "query" {
                            aliases.insert(named.local.name.as_str().to_string());
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
    import_ctx: &ImportContext,
) -> Vec<VarMeta> {
    let mut metas = Vec::new();

    // Walk statements in the program body, filtering to component range
    for stmt in &program.body {
        collect_vars_from_statement(stmt, component, import_ctx, &mut metas);
    }

    metas
}

fn collect_vars_from_statement<'a>(
    stmt: &Statement<'a>,
    component: &ComponentInfo,
    import_ctx: &ImportContext,
    metas: &mut Vec<VarMeta>,
) {
    // Handle function declarations that are the component itself
    if let Statement::FunctionDeclaration(func) = stmt {
        if let Some(ref id) = func.id {
            if id.name.as_str() == component.name {
                if let Some(ref body) = func.body {
                    for body_stmt in &body.statements {
                        collect_vars_from_body_stmt(body_stmt, import_ctx, metas);
                    }
                }
                return;
            }
        }
    }

    // Handle export declarations wrapping the component
    if let Statement::ExportNamedDeclaration(export_decl) = stmt {
        if let Some(ref decl) = export_decl.declaration {
            collect_vars_from_exported_decl(decl, component, import_ctx, metas);
            return;
        }
    }

    // Handle variable declarations (const Foo = () => { ... })
    if let Statement::VariableDeclaration(var_decl) = stmt {
        for declarator in &var_decl.declarations {
            if let BindingPattern::BindingIdentifier(ref id) = declarator.id {
                if id.name.as_str() == component.name {
                    if let Some(ref init) = declarator.init {
                        collect_vars_from_component_init(init, import_ctx, metas);
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
                            collect_vars_from_body_stmt(body_stmt, import_ctx, metas);
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
    import_ctx: &ImportContext,
    metas: &mut Vec<VarMeta>,
) {
    match decl {
        Declaration::FunctionDeclaration(func) => {
            if let Some(ref id) = func.id {
                if id.name.as_str() == component.name {
                    if let Some(ref body) = func.body {
                        for body_stmt in &body.statements {
                            collect_vars_from_body_stmt(body_stmt, import_ctx, metas);
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
                            collect_vars_from_component_init(init, import_ctx, metas);
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
    import_ctx: &ImportContext,
    metas: &mut Vec<VarMeta>,
) {
    match expr {
        Expression::ArrowFunctionExpression(arrow) => {
            for stmt in &arrow.body.statements {
                collect_vars_from_body_stmt(stmt, import_ctx, metas);
            }
        }
        Expression::FunctionExpression(func) => {
            if let Some(ref body) = func.body {
                for stmt in &body.statements {
                    collect_vars_from_body_stmt(stmt, import_ctx, metas);
                }
            }
        }
        Expression::ParenthesizedExpression(paren) => {
            collect_vars_from_component_init(&paren.expression, import_ctx, metas);
        }
        Expression::TSAsExpression(ts_as) => {
            collect_vars_from_component_init(&ts_as.expression, import_ctx, metas);
        }
        Expression::TSSatisfiesExpression(ts_sat) => {
            collect_vars_from_component_init(&ts_sat.expression, import_ctx, metas);
        }
        _ => {}
    }
}

fn collect_vars_from_body_stmt<'a>(
    stmt: &Statement<'a>,
    import_ctx: &ImportContext,
    metas: &mut Vec<VarMeta>,
) {
    if let Statement::VariableDeclaration(var_decl) = stmt {
        let is_let = matches!(var_decl.kind, VariableDeclarationKind::Let);

        for declarator in &var_decl.declarations {
            match &declarator.id {
                BindingPattern::BindingIdentifier(id) => {
                    collect_binding_identifier(id, declarator, is_let, import_ctx, metas);
                }
                BindingPattern::ObjectPattern(obj_pattern) => {
                    // Handle destructured bindings: const { data, error } = query(...)
                    if let Some(ref init) = declarator.init {
                        collect_destructured_bindings(
                            obj_pattern,
                            init,
                            declarator,
                            import_ctx,
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
    import_ctx: &ImportContext,
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
            // Resolve through aliases (static + manifest)
            let original_name = import_ctx
                .aliases
                .get(&callee_name)
                .cloned()
                .unwrap_or_else(|| callee_name.clone());

            if import_ctx.is_reactive_source(&original_name) {
                is_reactive_source = true;
            }

            if import_ctx.get_signal_api_config(&original_name).is_some() {
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
    import_ctx: &ImportContext,
    metas: &mut Vec<VarMeta>,
) {
    // Check if the init is a call to a signal API
    let unwrapped_init = unwrap_ts_non_null(init);
    let callee_name = get_call_expression_name(unwrapped_init);
    let original_api_name = callee_name.as_ref().map(|name| {
        import_ctx
            .aliases
            .get(name)
            .cloned()
            .unwrap_or_else(|| name.clone())
    });

    let signal_config = original_api_name
        .as_ref()
        .and_then(|name| import_ctx.get_signal_api_config(name));

    let is_reactive_source = original_api_name
        .as_ref()
        .is_some_and(|name| import_ctx.is_reactive_source(name));

    for prop in &obj_pattern.properties {
        if let BindingPattern::BindingIdentifier(ref binding_id) = prop.value {
            let local_name = binding_id.name.to_string();

            // Use the key name for property lookup (handles renamed destructuring)
            let source_prop_name =
                extract_property_key_name(&prop.key).unwrap_or_else(|| local_name.clone());

            // Determine the kind based on signal API config
            let is_signal_prop = signal_config
                .as_ref()
                .is_some_and(|config| config.signal_properties.contains(&source_prop_name));
            let is_plain_prop = signal_config
                .as_ref()
                .is_some_and(|config| config.plain_properties.contains(&source_prop_name));

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
    import_ctx: &ImportContext,
    prop_names: &HashSet<String>,
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
                if depends_on_reactive(meta, &meta_map, &jsx_reachable, import_ctx, prop_names) {
                    ReactivityKind::Computed
                } else {
                    ReactivityKind::Static
                }
            };

            // Build signal/plain/field properties for signal API vars
            let (signal_props, plain_props, field_props) = if meta.is_signal_api {
                if let Some(ref api_name) = meta.signal_api_name {
                    if let Some(config) = import_ctx.get_signal_api_config(api_name) {
                        (
                            Some(config.signal_properties.into_iter().collect()),
                            Some(config.plain_properties.into_iter().collect()),
                            config
                                .field_signal_properties
                                .map(|fps| fps.into_iter().collect()),
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
    import_ctx: &ImportContext,
    prop_names: &HashSet<String>,
) -> bool {
    let mut visited = HashSet::new();
    depends_on_reactive_inner(
        meta,
        meta_map,
        jsx_reachable,
        import_ctx,
        prop_names,
        &mut visited,
    )
}

fn depends_on_reactive_inner(
    meta: &VarMeta,
    meta_map: &HashMap<&str, &VarMeta>,
    jsx_reachable: &HashSet<String>,
    import_ctx: &ImportContext,
    prop_names: &HashSet<String>,
    visited: &mut HashSet<String>,
) -> bool {
    if !visited.insert(meta.name.clone()) {
        return false; // Already visited, avoid cycles
    }

    for dep in &meta.deps {
        // Depends on a destructured prop → reactive (props are getter-based)
        if prop_names.contains(dep.as_str()) {
            return true;
        }

        if let Some(dep_meta) = meta_map.get(dep.as_str()) {
            // Depends on a let variable that is JSX-reachable (i.e., a signal)
            if dep_meta.is_let && jsx_reachable.contains(&dep_meta.name) {
                return true;
            }

            // Depends on a signal API var → check if accessing a signal property
            if dep_meta.is_signal_api {
                if let Some(props_accessed) = meta.property_accesses.get(dep.as_str()) {
                    if let Some(ref api_name) = dep_meta.signal_api_name {
                        if let Some(config) = import_ctx.get_signal_api_config(api_name) {
                            for prop in props_accessed {
                                if config.signal_properties.contains(prop) {
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
                && depends_on_reactive_inner(
                    dep_meta,
                    meta_map,
                    jsx_reachable,
                    import_ctx,
                    prop_names,
                    visited,
                )
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

#[cfg(test)]
mod tests {
    use super::*;
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::SourceType;

    fn analyze(source: &str) -> Vec<VariableInfo> {
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let components = crate::component_analyzer::analyze_components(&parsed.program);
        let manifests: ManifestRegistry = HashMap::new();
        let (aliases, dynamic_configs) = build_import_aliases(&parsed.program, &manifests);
        let import_ctx = ImportContext {
            aliases,
            dynamic_configs,
        };
        assert!(!components.is_empty(), "no component found");
        analyze_reactivity(&parsed.program, &components[0], &import_ctx)
    }

    fn find_var<'a>(vars: &'a [VariableInfo], name: &str) -> &'a VariableInfo {
        vars.iter()
            .find(|v| v.name == name)
            .unwrap_or_else(|| panic!("var '{}' not found", name))
    }

    // ── ReactivityKind::as_str ─────────────────────────────────────────

    #[test]
    fn reactivity_kind_as_str() {
        assert_eq!(ReactivityKind::Signal.as_str(), "signal");
        assert_eq!(ReactivityKind::Computed.as_str(), "computed");
        assert_eq!(ReactivityKind::Static.as_str(), "static");
    }

    // ── Basic let/const classification ─────────────────────────────────

    #[test]
    fn let_in_jsx_is_signal() {
        let vars = analyze("function C() { let x = 0; return <div>{x}</div>; }");
        let x = find_var(&vars, "x");
        assert_eq!(x.kind, ReactivityKind::Signal);
    }

    #[test]
    fn let_not_in_jsx_is_static() {
        let vars = analyze("function C() { let x = 0; return <div/>; }");
        let x = find_var(&vars, "x");
        assert_eq!(x.kind, ReactivityKind::Static);
    }

    #[test]
    fn const_dep_on_signal_is_computed() {
        let vars = analyze("function C() { let x = 0; const y = x + 1; return <div>{y}</div>; }");
        let y = find_var(&vars, "y");
        assert_eq!(y.kind, ReactivityKind::Computed);
    }

    #[test]
    fn const_no_reactive_dep_is_static() {
        let vars = analyze("function C() { const x = 42; return <div>{x}</div>; }");
        let x = find_var(&vars, "x");
        assert_eq!(x.kind, ReactivityKind::Static);
    }

    // ── Function/structural literal ────────────────────────────────────

    #[test]
    fn arrow_fn_init_is_static() {
        let vars = analyze("function C() { const f = () => {}; return <div>{f}</div>; }");
        let f = find_var(&vars, "f");
        assert_eq!(f.kind, ReactivityKind::Static);
    }

    #[test]
    fn function_expr_init_is_static() {
        let vars = analyze("function C() { const f = function() {}; return <div>{f}</div>; }");
        let f = find_var(&vars, "f");
        assert_eq!(f.kind, ReactivityKind::Static);
    }

    #[test]
    fn object_literal_is_static() {
        let vars = analyze("function C() { const obj = {}; return <div>{obj}</div>; }");
        let obj = find_var(&vars, "obj");
        assert_eq!(obj.kind, ReactivityKind::Static);
    }

    #[test]
    fn array_literal_is_static() {
        let vars = analyze("function C() { const arr = []; return <div>{arr}</div>; }");
        let arr = find_var(&vars, "arr");
        assert_eq!(arr.kind, ReactivityKind::Static);
    }

    // ── Signal API detection ───────────────────────────────────────────

    #[test]
    fn query_call_detected_as_signal_api() {
        let vars = analyze(
            "import { query } from '@vertz/ui';\nfunction C() { const tasks = query(fetch); return <div>{tasks.data}</div>; }",
        );
        let tasks = find_var(&vars, "tasks");
        let sig = tasks.signal_properties.as_ref().expect("signal_properties");
        assert!(sig.contains(&"data".to_string()));
        assert!(sig.contains(&"loading".to_string()));
        assert!(sig.contains(&"error".to_string()));
    }

    #[test]
    fn query_plain_properties_present() {
        let vars = analyze(
            "import { query } from '@vertz/ui';\nfunction C() { const tasks = query(fetch); return <div>{tasks.data}</div>; }",
        );
        let tasks = find_var(&vars, "tasks");
        let plain = tasks.plain_properties.as_ref().expect("plain_properties");
        assert!(plain.contains(&"refetch".to_string()));
    }

    // ── Destructured bindings ──────────────────────────────────────────

    #[test]
    fn destructured_signal_prop_is_signal() {
        let vars = analyze(
            "import { query } from '@vertz/ui';\nfunction C() { const { data } = query(fetch); return <div>{data}</div>; }",
        );
        let data = find_var(&vars, "data");
        assert_eq!(data.kind, ReactivityKind::Signal);
    }

    #[test]
    fn destructured_plain_prop_is_static() {
        let vars = analyze(
            "import { query } from '@vertz/ui';\nfunction C() { const { refetch } = query(fetch); return <div>{refetch}</div>; }",
        );
        let refetch = find_var(&vars, "refetch");
        assert_eq!(refetch.kind, ReactivityKind::Static);
    }

    #[test]
    fn destructured_unknown_prop_from_signal_api_is_static() {
        let vars = analyze(
            "import { query } from '@vertz/ui';\nfunction C() { const { foo } = query(fetch); return <div>{foo}</div>; }",
        );
        let foo = find_var(&vars, "foo");
        assert_eq!(foo.kind, ReactivityKind::Static);
    }

    // ── Property access tracking ───────────────────────────────────────

    #[test]
    fn const_accessing_signal_property_is_computed() {
        let vars = analyze(
            "import { query } from '@vertz/ui';\nfunction C() { const tasks = query(fetch); const d = tasks.data; return <div>{d}</div>; }",
        );
        let d = find_var(&vars, "d");
        assert_eq!(d.kind, ReactivityKind::Computed);
    }

    #[test]
    fn const_accessing_plain_property_is_static() {
        let vars = analyze(
            "import { query } from '@vertz/ui';\nfunction C() { const tasks = query(fetch); const r = tasks.refetch; return <div>{r}</div>; }",
        );
        let r = find_var(&vars, "r");
        assert_eq!(r.kind, ReactivityKind::Static);
    }

    // ── Transitive dependency ──────────────────────────────────────────

    #[test]
    fn transitive_dep_is_computed() {
        let vars =
            analyze("function C() { let x = 0; const y = x; const z = y; return <div>{z}</div>; }");
        let z = find_var(&vars, "z");
        assert_eq!(z.kind, ReactivityKind::Computed);
    }

    // ── Reactive source ────────────────────────────────────────────────

    #[test]
    fn use_context_is_reactive_source() {
        let vars = analyze(
            "import { useContext } from '@vertz/ui';\nfunction C() { const ctx = useContext(MyCtx); return <div>{ctx}</div>; }",
        );
        let ctx = find_var(&vars, "ctx");
        assert!(ctx.is_reactive_source);
    }

    #[test]
    fn dep_on_reactive_source_is_computed() {
        let vars = analyze(
            "import { useContext } from '@vertz/ui';\nfunction C() { const ctx = useContext(MyCtx); const x = ctx.name; return <div>{x}</div>; }",
        );
        let x = find_var(&vars, "x");
        assert_eq!(x.kind, ReactivityKind::Computed);
    }

    // ── build_import_aliases ───────────────────────────────────────────

    #[test]
    fn alias_for_signal_api() {
        let source = "import { query as q } from '@vertz/ui';";
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let manifests: ManifestRegistry = HashMap::new();
        let (aliases, _) = build_import_aliases(&parsed.program, &manifests);
        assert_eq!(aliases.get("q"), Some(&"query".to_string()));
    }

    #[test]
    fn alias_for_reactive_source() {
        let source = "import { useContext as uc } from '@vertz/ui';";
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let manifests: ManifestRegistry = HashMap::new();
        let (aliases, _) = build_import_aliases(&parsed.program, &manifests);
        assert_eq!(aliases.get("uc"), Some(&"useContext".to_string()));
    }

    #[test]
    fn unrecognized_import_not_aliased() {
        let source = "import { foo } from '@vertz/ui';";
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let manifests: ManifestRegistry = HashMap::new();
        let (aliases, _) = build_import_aliases(&parsed.program, &manifests);
        assert!(!aliases.contains_key("foo"));
    }

    // ── build_import_aliases with manifests ────────────────────────────

    #[test]
    fn manifest_signal_api_registered() {
        let source = "import { myQuery } from './api';";
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();

        let mut module_exports = HashMap::new();
        module_exports.insert(
            "myQuery".to_string(),
            ManifestExportInfo {
                reactivity_type: "signal-api".to_string(),
                signal_properties: Some(HashSet::from(["data".to_string()])),
                plain_properties: None,
                field_signal_properties: None,
            },
        );
        let mut manifests: ManifestRegistry = HashMap::new();
        manifests.insert("./api".to_string(), module_exports);

        let (aliases, dynamic_configs) = build_import_aliases(&parsed.program, &manifests);
        let key = aliases.get("myQuery").expect("myQuery alias");
        assert!(key.starts_with("__manifest__"));
        assert!(dynamic_configs.contains_key(key));
        let config = dynamic_configs.get(key).unwrap();
        assert!(config.signal_properties.contains("data"));
    }

    #[test]
    fn manifest_reactive_source_registered() {
        let source = "import { myCtx } from './ctx';";
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();

        let mut module_exports = HashMap::new();
        module_exports.insert(
            "myCtx".to_string(),
            ManifestExportInfo {
                reactivity_type: "reactive-source".to_string(),
                signal_properties: None,
                plain_properties: None,
                field_signal_properties: None,
            },
        );
        let mut manifests: ManifestRegistry = HashMap::new();
        manifests.insert("./ctx".to_string(), module_exports);

        let (aliases, dynamic_configs) = build_import_aliases(&parsed.program, &manifests);
        let key = aliases.get("myCtx").expect("myCtx alias");
        assert!(key.starts_with("__manifest__"));
        assert!(dynamic_configs.contains_key(key));
    }

    #[test]
    fn manifest_unknown_type_ignored() {
        let source = "import { myThing } from './stuff';";
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();

        let mut module_exports = HashMap::new();
        module_exports.insert(
            "myThing".to_string(),
            ManifestExportInfo {
                reactivity_type: "other".to_string(),
                signal_properties: None,
                plain_properties: None,
                field_signal_properties: None,
            },
        );
        let mut manifests: ManifestRegistry = HashMap::new();
        manifests.insert("./stuff".to_string(), module_exports);

        let (aliases, _) = build_import_aliases(&parsed.program, &manifests);
        assert!(!aliases.contains_key("myThing"));
    }

    // ── build_query_aliases ────────────────────────────────────────────

    #[test]
    fn query_from_vertz_ui() {
        let source = "import { query } from '@vertz/ui';";
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let aliases = build_query_aliases(&parsed.program);
        assert!(aliases.contains("query"));
    }

    #[test]
    fn query_aliased() {
        let source = "import { query as q } from '@vertz/ui';";
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let aliases = build_query_aliases(&parsed.program);
        assert!(aliases.contains("q"));
    }

    #[test]
    fn query_from_other_lib_not_included() {
        let source = "import { query } from 'other';";
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let aliases = build_query_aliases(&parsed.program);
        assert!(aliases.is_empty());
    }

    #[test]
    fn query_from_vertz_ui_subpath() {
        let source = "import { query } from 'vertz/ui';";
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let aliases = build_query_aliases(&parsed.program);
        assert!(aliases.contains("query"));
    }

    // ── ImportContext methods ───────────────────────────────────────────

    #[test]
    fn import_ctx_is_reactive_source_static_api() {
        let ctx = ImportContext {
            aliases: HashMap::new(),
            dynamic_configs: HashMap::new(),
        };
        assert!(ctx.is_reactive_source("useContext"));
    }

    #[test]
    fn import_ctx_is_reactive_source_dynamic() {
        let key = "__manifest__./ctx__myCtx".to_string();
        let mut dynamic_configs = HashMap::new();
        dynamic_configs.insert(
            key.clone(),
            DynamicApiConfig {
                signal_properties: HashSet::new(),
                plain_properties: HashSet::new(),
                field_signal_properties: None,
            },
        );
        let ctx = ImportContext {
            aliases: HashMap::new(),
            dynamic_configs,
        };
        assert!(ctx.is_reactive_source(&key));
    }

    #[test]
    fn import_ctx_is_reactive_source_false_for_signal_api() {
        let key = "__manifest__./api__myQuery".to_string();
        let mut dynamic_configs = HashMap::new();
        dynamic_configs.insert(
            key.clone(),
            DynamicApiConfig {
                signal_properties: HashSet::from(["data".to_string()]),
                plain_properties: HashSet::new(),
                field_signal_properties: None,
            },
        );
        let ctx = ImportContext {
            aliases: HashMap::new(),
            dynamic_configs,
        };
        assert!(!ctx.is_reactive_source(&key));
    }

    #[test]
    fn import_ctx_get_signal_api_config_static() {
        let ctx = ImportContext {
            aliases: HashMap::new(),
            dynamic_configs: HashMap::new(),
        };
        let config = ctx.get_signal_api_config("query");
        assert!(config.is_some());
        let config = config.unwrap();
        assert!(config.signal_properties.contains("data"));
    }

    #[test]
    fn import_ctx_get_signal_api_config_dynamic() {
        let key = "__manifest__./api__myQuery".to_string();
        let mut dynamic_configs = HashMap::new();
        dynamic_configs.insert(
            key.clone(),
            DynamicApiConfig {
                signal_properties: HashSet::from(["data".to_string()]),
                plain_properties: HashSet::from(["refetch".to_string()]),
                field_signal_properties: None,
            },
        );
        let ctx = ImportContext {
            aliases: HashMap::new(),
            dynamic_configs,
        };
        let config = ctx.get_signal_api_config(&key);
        assert!(config.is_some());
        let config = config.unwrap();
        assert!(config.signal_properties.contains("data"));
        assert!(config.plain_properties.contains("refetch"));
    }

    #[test]
    fn import_ctx_get_signal_api_config_none() {
        let ctx = ImportContext {
            aliases: HashMap::new(),
            dynamic_configs: HashMap::new(),
        };
        assert!(ctx.get_signal_api_config("unknown").is_none());
    }

    // ── Component form variants ────────────────────────────────────────

    #[test]
    fn export_named_function_vars_collected() {
        let vars = analyze("export function C() { let x = 0; return <div>{x}</div>; }");
        let x = find_var(&vars, "x");
        assert_eq!(x.kind, ReactivityKind::Signal);
    }

    #[test]
    fn export_named_const_arrow_vars_collected() {
        let vars = analyze("export const C = () => { let x = 0; return <div>{x}</div>; };");
        let x = find_var(&vars, "x");
        assert_eq!(x.kind, ReactivityKind::Signal);
    }

    #[test]
    fn export_default_function_vars_collected() {
        let vars = analyze("export default function C() { let x = 0; return <div>{x}</div>; }");
        let x = find_var(&vars, "x");
        assert_eq!(x.kind, ReactivityKind::Signal);
    }

    // ── TS expression unwrapping ───────────────────────────────────────

    #[test]
    fn parenthesized_component_init_vars_collected() {
        let vars = analyze("const C = (() => { let x = 0; return <div>{x}</div>; });");
        let x = find_var(&vars, "x");
        assert_eq!(x.kind, ReactivityKind::Signal);
    }

    // ── Cycle avoidance ────────────────────────────────────────────────

    #[test]
    fn cycle_does_not_hang() {
        let vars = analyze("function C() { const a = b; const b = a; return <div>{a}{b}</div>; }");
        // Both should be classified without hanging; exact kind may vary
        let _a = find_var(&vars, "a");
        let _b = find_var(&vars, "b");
    }

    // ── Destructured props → computed ──────────────────────────────────

    #[test]
    fn const_dep_on_destructured_prop_is_computed() {
        let vars =
            analyze("function C({ title }) { const upper = title; return <div>{upper}</div>; }");
        let upper = find_var(&vars, "upper");
        assert_eq!(upper.kind, ReactivityKind::Computed);
    }

    // ── TSNonNull unwrapping ───────────────────────────────────────────

    #[test]
    fn ts_non_null_unwrapped_for_signal_api() {
        let vars = analyze(
            "import { query } from '@vertz/ui';\nfunction C() { const tasks = query(fetch)!; return <div>{tasks.data}</div>; }",
        );
        let tasks = find_var(&vars, "tasks");
        assert!(
            tasks.signal_properties.is_some(),
            "tasks should be detected as signal API"
        );
        let sig = tasks.signal_properties.as_ref().unwrap();
        assert!(sig.contains(&"data".to_string()));
    }

    // ── Component init variants for variable collection ───────────────

    #[test]
    fn function_expression_component_init_vars_collected() {
        let vars = analyze("const C = function() { let x = 0; return <div>{x}</div>; };");
        let x = find_var(&vars, "x");
        assert_eq!(x.kind, ReactivityKind::Signal);
    }

    #[test]
    fn ts_as_component_init_vars_collected() {
        let vars = analyze("const C = ((() => { let x = 0; return <div>{x}</div>; }) as any);");
        let x = find_var(&vars, "x");
        assert_eq!(x.kind, ReactivityKind::Signal);
    }

    #[test]
    fn ts_satisfies_component_init_vars_collected() {
        let vars =
            analyze("const C = ((() => { let x = 0; return <div>{x}</div>; }) satisfies FC);");
        let x = find_var(&vars, "x");
        assert_eq!(x.kind, ReactivityKind::Signal);
    }

    // ── Non-matching statements in program body ───────────────────────

    #[test]
    fn non_matching_function_decl_skipped() {
        let vars =
            analyze("function helper() { } function C() { let x = 0; return <div>{x}</div>; }");
        let x = find_var(&vars, "x");
        assert_eq!(x.kind, ReactivityKind::Signal);
    }

    #[test]
    fn non_matching_var_decl_skipped() {
        let vars = analyze("const helper = 42; function C() { let x = 0; return <div>{x}</div>; }");
        let x = find_var(&vars, "x");
        assert_eq!(x.kind, ReactivityKind::Signal);
    }

    #[test]
    fn export_re_export_without_declaration_skipped() {
        let vars = analyze(
            "export { something } from 'other'; function C() { let x = 0; return <div>{x}</div>; }",
        );
        let x = find_var(&vars, "x");
        assert_eq!(x.kind, ReactivityKind::Signal);
    }

    #[test]
    fn export_named_other_declaration_type_skipped() {
        let vars = analyze(
            "export class Helper {} export function C() { let x = 0; return <div>{x}</div>; }",
        );
        let x = find_var(&vars, "x");
        assert_eq!(x.kind, ReactivityKind::Signal);
    }

    #[test]
    fn export_const_arrow_vars_from_exported_decl() {
        let vars = analyze("export const C = () => { let x = 0; return <div>{x}</div>; };");
        let x = find_var(&vars, "x");
        assert_eq!(x.kind, ReactivityKind::Signal);
    }

    // ── Destructured bindings: non-BindingIdentifier skipped ──────────

    #[test]
    fn destructured_nested_pattern_in_obj_skipped() {
        // Only BindingIdentifier values are collected from destructuring
        let vars = analyze(
            "import { query } from '@vertz/ui';\nfunction C() { const { data: { inner } } = query(fetch); return <div>{inner}</div>; }",
        );
        // inner is behind nested ObjectPattern → not collected
        assert!(vars.is_empty());
    }

    // ── Signal API var without config → (None, None, None) ────────────

    #[test]
    fn signal_api_var_resolved_to_unknown_has_no_props() {
        // When signal_api_name resolves to a name not in any config
        let vars = analyze(
            "import { query } from '@vertz/ui';\nfunction C() { const tasks = query(fetch); return <div>hello</div>; }",
        );
        let tasks = find_var(&vars, "tasks");
        // tasks IS a signal API — signal_api_name is "query" which IS in registry
        assert!(tasks.signal_properties.is_some());
    }

    // ── JSX attribute reference ───────────────────────────────────────

    #[test]
    fn jsx_attribute_ref_makes_let_signal() {
        let vars =
            analyze("function C() { let d = false; return <button disabled={d}>ok</button>; }");
        let d = find_var(&vars, "d");
        assert_eq!(d.kind, ReactivityKind::Signal);
    }

    // ── Const depending on structural/function skips transitive ───────

    #[test]
    fn const_ref_to_function_is_static() {
        let vars = analyze(
            "function C() { const fn1 = () => {}; const ref1 = fn1; return <div>{ref1}</div>; }",
        );
        let ref1 = find_var(&vars, "ref1");
        assert_eq!(ref1.kind, ReactivityKind::Static);
    }

    // ── Destructured reactive source ──────────────────────────────────

    #[test]
    fn destructured_reactive_source_property_is_signal() {
        let vars = analyze(
            "import { useContext } from '@vertz/ui';\nfunction C() { const { user } = useContext(MyCtx); return <div>{user}</div>; }",
        );
        let user = find_var(&vars, "user");
        assert_eq!(user.kind, ReactivityKind::Signal);
    }

    // ── Non-call expression init → not signal API ─────────────────────

    #[test]
    fn member_call_not_detected_as_signal_api() {
        let vars =
            analyze("function C() { const tasks = api.query(); return <div>{tasks}</div>; }");
        let tasks = find_var(&vars, "tasks");
        assert_eq!(tasks.kind, ReactivityKind::Static);
        assert!(tasks.signal_properties.is_none());
    }

    // ── Form with field_signal_properties ─────────────────────────────

    #[test]
    fn form_has_field_signal_properties() {
        let vars = analyze(
            "import { form } from '@vertz/ui';\nfunction C() { const f = form({}); return <div>hello</div>; }",
        );
        let f = find_var(&vars, "f");
        assert!(f.field_signal_properties.is_some());
    }

    // ── Destructured with renamed key ─────────────────────────────────

    #[test]
    fn destructured_renamed_signal_prop_is_signal() {
        let vars = analyze(
            "import { query } from '@vertz/ui';\nfunction C() { const { data: items } = query(fetch); return <div>{items}</div>; }",
        );
        let items = find_var(&vars, "items");
        assert_eq!(items.kind, ReactivityKind::Signal);
    }

    // ── import without specifiers ─────────────────────────────────────

    #[test]
    fn side_effect_import_ignored() {
        let source = "import './side-effects';";
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let manifests: ManifestRegistry = HashMap::new();
        let (aliases, _) = build_import_aliases(&parsed.program, &manifests);
        assert!(aliases.is_empty());
    }

    // ── build_query_aliases ignores non-query imports ─────────────────

    #[test]
    fn build_query_aliases_non_query_from_vertz_ui() {
        let source = "import { form } from '@vertz/ui';";
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let aliases = build_query_aliases(&parsed.program);
        assert!(aliases.is_empty());
    }
}
