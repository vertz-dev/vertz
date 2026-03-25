use std::collections::{HashMap, HashSet};

use oxc_ast::ast::*;
use oxc_ast_visit::Visit;
use oxc_span::GetSpan;

use crate::component_analyzer::ComponentInfo;
use crate::magic_string::MagicString;

/// Info about a single destructured prop binding.
struct PropBinding {
    /// The original prop name (key in __props).
    prop_name: String,
    /// The local binding name (may differ for aliases).
    binding_name: String,
    /// Default value expression text, if any.
    default_value: Option<String>,
    /// Whether this is a rest element (...rest).
    is_rest: bool,
}

/// Info about a component's destructured props parameter.
struct DestructuredPropsInfo {
    bindings: Vec<PropBinding>,
    has_rest: bool,
    has_nested_destructuring: bool,
    /// Span of the entire parameter pattern (from `{` to `)` or type annotation end).
    param_start: u32,
    param_end: u32,
    /// Type annotation text, if present.
    type_annotation: Option<String>,
}

/// Transform destructured props into __props access pattern.
pub fn transform_props(
    ms: &mut MagicString,
    program: &Program,
    component: &ComponentInfo,
    source: &str,
) {
    // Find the component function and extract destructured props info
    let info = match extract_destructured_props(program, component, source) {
        Some(info) => info,
        None => return,
    };

    // Skip nested destructuring (unsupported)
    if info.has_nested_destructuring {
        return;
    }

    // Build binding map: binding_name → PropBinding
    let binding_map: HashMap<String, &PropBinding> = info
        .bindings
        .iter()
        .filter(|b| !b.is_rest)
        .map(|b| (b.binding_name.clone(), b))
        .collect();

    if binding_map.is_empty() && !info.has_rest {
        return;
    }

    // Step 1: Rewrite parameter `{ title, ...rest }: CardProps` → `__props: CardProps`
    let new_param = if let Some(ref type_ann) = info.type_annotation {
        format!("__props: {type_ann}")
    } else {
        "__props".to_string()
    };
    ms.overwrite(info.param_start, info.param_end, &new_param);

    // Step 2: Replace references in the component body
    let mut replacer = PropsRefReplacer {
        ms,
        binding_map: &binding_map,
        component,
        shadowed_stack: Vec::new(),
    };
    for stmt in &program.body {
        replacer.visit_statement(stmt);
    }

    // Step 3: Insert rest destructuring at body top if needed
    if info.has_rest {
        let rest_binding = info.bindings.iter().find(|b| b.is_rest);
        if let Some(rest) = rest_binding {
            let drops: Vec<String> = info
                .bindings
                .iter()
                .filter(|b| !b.is_rest)
                .enumerate()
                .map(|(i, b)| format!("{}: __$drop_{i}", b.prop_name))
                .collect();
            let rest_stmt = format!(
                " const {{ {}, ...{} }} = __props;",
                drops.join(", "),
                rest.binding_name
            );
            // Insert after opening { of body
            ms.append_right(component.body_start + 1, &rest_stmt);
        }
    }
}

/// Extract destructured props info from the component function.
fn extract_destructured_props<'a>(
    program: &Program<'a>,
    component: &ComponentInfo,
    source: &str,
) -> Option<DestructuredPropsInfo> {
    for stmt in &program.body {
        if let Some(info) = extract_from_statement(stmt, component, source) {
            return Some(info);
        }
    }
    None
}

fn extract_from_statement<'a>(
    stmt: &Statement<'a>,
    component: &ComponentInfo,
    source: &str,
) -> Option<DestructuredPropsInfo> {
    match stmt {
        Statement::FunctionDeclaration(func) => {
            if let Some(ref id) = func.id {
                if id.name.as_str() == component.name {
                    return extract_from_params(&func.params, source);
                }
            }
        }
        Statement::VariableDeclaration(var_decl) => {
            for declarator in &var_decl.declarations {
                if let BindingPattern::BindingIdentifier(ref id) = declarator.id {
                    if id.name.as_str() == component.name {
                        if let Some(ref init) = declarator.init {
                            return extract_from_expr(init, source);
                        }
                    }
                }
            }
        }
        Statement::ExportNamedDeclaration(export_decl) => {
            if let Some(ref decl) = export_decl.declaration {
                match decl {
                    Declaration::FunctionDeclaration(func) => {
                        if let Some(ref id) = func.id {
                            if id.name.as_str() == component.name {
                                return extract_from_params(&func.params, source);
                            }
                        }
                    }
                    Declaration::VariableDeclaration(var_decl) => {
                        for declarator in &var_decl.declarations {
                            if let BindingPattern::BindingIdentifier(ref id) = declarator.id {
                                if id.name.as_str() == component.name {
                                    if let Some(ref init) = declarator.init {
                                        return extract_from_expr(init, source);
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
        Statement::ExportDefaultDeclaration(export_default) => {
            if let ExportDefaultDeclarationKind::FunctionDeclaration(ref func) =
                export_default.declaration
            {
                if let Some(ref id) = func.id {
                    if id.name.as_str() == component.name {
                        return extract_from_params(&func.params, source);
                    }
                }
            }
        }
        _ => {}
    }
    None
}

fn extract_from_expr<'a>(expr: &Expression<'a>, source: &str) -> Option<DestructuredPropsInfo> {
    match expr {
        Expression::ArrowFunctionExpression(arrow) => extract_from_params(&arrow.params, source),
        Expression::FunctionExpression(func) => extract_from_params(&func.params, source),
        Expression::ParenthesizedExpression(paren) => extract_from_expr(&paren.expression, source),
        Expression::TSAsExpression(ts_as) => extract_from_expr(&ts_as.expression, source),
        Expression::TSSatisfiesExpression(ts_sat) => extract_from_expr(&ts_sat.expression, source),
        _ => None,
    }
}

fn extract_from_params<'a>(
    params: &FormalParameters<'a>,
    source: &str,
) -> Option<DestructuredPropsInfo> {
    let first_param = params.items.first()?;

    if let BindingPattern::ObjectPattern(ref obj_pattern) = first_param.pattern {
        let mut bindings = Vec::new();
        let mut has_nested = false;

        for prop in &obj_pattern.properties {
            // Skip non-identifier keys (e.g., computed keys, string literals)
            let prop_name = match extract_prop_key_name(&prop.key) {
                Some(name) => name,
                None => continue,
            };

            match &prop.value {
                BindingPattern::BindingIdentifier(id) => {
                    bindings.push(PropBinding {
                        prop_name,
                        binding_name: id.name.to_string(),
                        default_value: None,
                        is_rest: false,
                    });
                }
                BindingPattern::AssignmentPattern(assign) => {
                    if let BindingPattern::BindingIdentifier(ref id) = assign.left {
                        let default_text = source
                            [assign.right.span().start as usize..assign.right.span().end as usize]
                            .to_string();
                        bindings.push(PropBinding {
                            prop_name,
                            binding_name: id.name.to_string(),
                            default_value: Some(default_text),
                            is_rest: false,
                        });
                    }
                }
                BindingPattern::ObjectPattern(_) | BindingPattern::ArrayPattern(_) => {
                    has_nested = true;
                }
            }
        }

        // Check for rest element
        let has_rest = obj_pattern.rest.is_some();
        if let Some(ref rest) = obj_pattern.rest {
            if let BindingPattern::BindingIdentifier(ref id) = rest.argument {
                bindings.push(PropBinding {
                    prop_name: String::new(),
                    binding_name: id.name.to_string(),
                    default_value: None,
                    is_rest: true,
                });
            }
        }

        // Determine param range: from pattern start to end of type annotation or closing paren
        let param_start = first_param.span.start;
        let param_end = first_param.span.end;

        // Extract type annotation if present (on FormalParameter, not BindingPattern)
        let type_annotation = first_param.type_annotation.as_ref().map(|ta| {
            let ts_span = ta.type_annotation.span();
            source[ts_span.start as usize..ts_span.end as usize].to_string()
        });

        Some(DestructuredPropsInfo {
            bindings,
            has_rest,
            has_nested_destructuring: has_nested,
            param_start,
            param_end,
            type_annotation,
        })
    } else {
        None
    }
}

fn extract_prop_key_name(key: &PropertyKey) -> Option<String> {
    match key {
        PropertyKey::StaticIdentifier(id) => Some(id.name.to_string()),
        _ => None,
    }
}

/// AST walker that replaces prop binding references with __props.propName.
struct PropsRefReplacer<'a, 'b> {
    ms: &'a mut MagicString,
    binding_map: &'b HashMap<String, &'b PropBinding>,
    component: &'b ComponentInfo,
    shadowed_stack: Vec<HashSet<String>>,
}

impl<'a, 'b> PropsRefReplacer<'a, 'b> {
    fn is_in_component(&self, start: u32, end: u32) -> bool {
        start >= self.component.body_start && end <= self.component.body_end
    }

    fn is_shadowed(&self, name: &str) -> bool {
        self.shadowed_stack.iter().any(|s| s.contains(name))
    }

    fn build_replacement(&self, binding: &PropBinding) -> String {
        if let Some(ref default) = binding.default_value {
            format!("(__props.{} ?? {})", binding.prop_name, default)
        } else {
            format!("__props.{}", binding.prop_name)
        }
    }
}

impl<'a, 'b, 'c> Visit<'c> for PropsRefReplacer<'a, 'b> {
    fn visit_identifier_reference(&mut self, ident: &IdentifierReference<'c>) {
        let name = ident.name.as_str();
        if !self.is_in_component(ident.span.start, ident.span.end) {
            return;
        }

        if let Some(binding) = self.binding_map.get(name) {
            if !self.is_shadowed(name) {
                let replacement = self.build_replacement(binding);
                self.ms
                    .overwrite(ident.span.start, ident.span.end, &replacement);
            }
        }
    }

    fn visit_object_property(&mut self, prop: &ObjectProperty<'c>) {
        // Handle shorthand: { title } → { title: __props.title }
        if prop.shorthand {
            if let PropertyKey::StaticIdentifier(ref key) = prop.key {
                let name = key.name.as_str();
                if self.is_in_component(prop.span.start, prop.span.end) {
                    if let Some(binding) = self.binding_map.get(name) {
                        if !self.is_shadowed(name) {
                            let replacement = self.build_replacement(binding);
                            self.ms.overwrite(
                                prop.span.start,
                                prop.span.end,
                                &format!("{name}: {replacement}"),
                            );
                            return;
                        }
                    }
                }
            }
        }
        oxc_ast_visit::walk::walk_object_property(self, prop);
    }

    fn visit_variable_declarator(&mut self, decl: &VariableDeclarator<'c>) {
        // Don't replace the binding name in a variable declaration: const title = ...
        if let BindingPattern::BindingIdentifier(ref id) = decl.id {
            if self.binding_map.contains_key(id.name.as_str()) {
                // This is a shadow — push it and walk init only
                let mut shadow = HashSet::new();
                shadow.insert(id.name.to_string());
                self.shadowed_stack.push(shadow);
                // Still walk the init expression (it's not shadowed yet at the point of init)
                // Actually the TS compiler considers const title = ... as shadowing
                // so we should NOT replace in the init either
                if let Some(ref init) = decl.init {
                    self.visit_expression(init);
                }
                // The shadow stays for the rest of this scope
                // But we need the scope visitor to pop it, so don't pop here
                // Actually, for simplicity, we handle shadowing differently:
                // visit_function and visit_arrow push/pop. For variable declarations,
                // we need to mark them as shadowed for the rest of the scope.
                // However, the walk will continue to siblings after this declarator.
                // Pop it here and handle via the arrow/function visitors.
                self.shadowed_stack.pop();
                return;
            }
        }
        oxc_ast_visit::walk::walk_variable_declarator(self, decl);
    }

    fn visit_arrow_function_expression(&mut self, func: &ArrowFunctionExpression<'c>) {
        // Don't shadow the component function's own params — those are the props we're replacing
        let is_component_fn = func.body.span.start == self.component.body_start
            && func.body.span.end == self.component.body_end;

        let mut shadows = if is_component_fn {
            HashSet::new()
        } else {
            crate::signal_transformer::collect_param_names(&func.params)
        };
        collect_block_var_names(&func.body, &mut shadows);
        self.shadowed_stack.push(shadows);
        oxc_ast_visit::walk::walk_arrow_function_expression(self, func);
        self.shadowed_stack.pop();
    }

    fn visit_function(&mut self, func: &Function<'c>, flags: oxc_syntax::scope::ScopeFlags) {
        // Don't shadow the component function's own params — those are the props we're replacing
        let is_component_fn = func.body.as_ref().is_some_and(|body| {
            body.span.start == self.component.body_start && body.span.end == self.component.body_end
        });

        let mut shadows = if is_component_fn {
            HashSet::new()
        } else {
            crate::signal_transformer::collect_param_names(&func.params)
        };
        if let Some(ref body) = func.body {
            collect_block_var_names(body, &mut shadows);
        }
        self.shadowed_stack.push(shadows);
        oxc_ast_visit::walk::walk_function(self, func, flags);
        self.shadowed_stack.pop();
    }
}

/// Collect variable names declared directly in a function body.
fn collect_block_var_names(body: &FunctionBody, names: &mut HashSet<String>) {
    for stmt in &body.statements {
        if let Statement::VariableDeclaration(var_decl) = stmt {
            for declarator in &var_decl.declarations {
                if let BindingPattern::BindingIdentifier(ref id) = declarator.id {
                    names.insert(id.name.to_string());
                }
            }
        }
    }
}
