use std::collections::{HashMap, HashSet};

use oxc_ast::ast::*;
use oxc_ast_visit::Visit;
use oxc_span::GetSpan;
use oxc_syntax::scope::ScopeFlags;

use crate::component_analyzer::ComponentInfo;
use crate::magic_string::MagicString;
use crate::reactivity_analyzer::VariableInfo;

/// Transform signal declarations and references.
pub fn transform_signals(
    ms: &mut MagicString,
    program: &Program,
    component: &ComponentInfo,
    variables: &[VariableInfo],
    mutation_ranges: &[(u32, u32)],
) {
    let signals: HashSet<String> = variables
        .iter()
        .filter(|v| v.kind.as_str() == "signal")
        .map(|v| v.name.clone())
        .collect();

    // Phase 1 & 2: Only run if there are signal variables
    if !signals.is_empty() {
        // Phase 1: Transform declarations
        let mut decl_walker = DeclTransformer {
            ms,
            signals: &signals,
            component,
        };
        for stmt in &program.body {
            decl_walker.visit_statement(stmt);
        }

        // Phase 2: Transform references (insert .value)
        let mut ref_walker = RefTransformer {
            ms,
            signals: &signals,
            component,
            mutation_ranges,
            shadowed_stack: Vec::new(),
        };
        for stmt in &program.body {
            ref_walker.visit_statement(stmt);
        }
    }

    // Phase 3: Transform signal API property accesses
    // Runs independently — signal API vars are static, not signals
    let mut signal_prop_vars: HashMap<String, HashSet<String>> = HashMap::new();
    let mut plain_prop_vars: HashMap<String, HashSet<String>> = HashMap::new();
    let mut field_signal_prop_vars: HashMap<String, HashSet<String>> = HashMap::new();

    for v in variables {
        if let Some(ref props) = v.signal_properties {
            signal_prop_vars.insert(v.name.clone(), props.iter().cloned().collect());
        }
        if let Some(ref props) = v.plain_properties {
            plain_prop_vars.insert(v.name.clone(), props.iter().cloned().collect());
        }
        if let Some(ref props) = v.field_signal_properties {
            field_signal_prop_vars.insert(v.name.clone(), props.iter().cloned().collect());
        }
    }

    transform_signal_api_properties(
        ms,
        program,
        component,
        &signal_prop_vars,
        &plain_prop_vars,
        &field_signal_prop_vars,
    );
}

/// Phase 1: Transform `let x = init` → `const x = signal(init, 'x')`
struct DeclTransformer<'a, 'b> {
    ms: &'a mut MagicString,
    signals: &'b HashSet<String>,
    component: &'b ComponentInfo,
}

impl<'a, 'b, 'c> Visit<'c> for DeclTransformer<'a, 'b> {
    fn visit_variable_declaration(&mut self, decl: &VariableDeclaration<'c>) {
        if !matches!(decl.kind, VariableDeclarationKind::Let) {
            return;
        }

        // Only process declarations within the component body
        if decl.span.start < self.component.body_start || decl.span.end > self.component.body_end {
            return;
        }

        for declarator in &decl.declarations {
            if let BindingPattern::BindingIdentifier(ref id) = declarator.id {
                let name = id.name.as_str();
                if self.signals.contains(name) {
                    if let Some(ref init) = declarator.init {
                        // Change `let` to `const`
                        self.ms
                            .overwrite(decl.span.start, decl.span.start + 3, "const");

                        // Wrap init: signal(init, 'name')
                        self.ms.prepend_left(init.span().start, "signal(");
                        self.ms
                            .append_right(init.span().end, &format!(", '{name}')"));
                    }
                }
            }
        }
    }
}

/// Phase 2: Transform signal references → `.value`
struct RefTransformer<'a, 'b> {
    ms: &'a mut MagicString,
    signals: &'b HashSet<String>,
    component: &'b ComponentInfo,
    mutation_ranges: &'b [(u32, u32)],
    /// Stack of sets of names shadowed in nested scopes (function params, etc.)
    shadowed_stack: Vec<HashSet<String>>,
}

impl<'a, 'b> RefTransformer<'a, 'b> {
    fn is_in_component(&self, start: u32, end: u32) -> bool {
        start >= self.component.body_start && end <= self.component.body_end
    }

    fn is_in_mutation_range(&self, pos: u32) -> bool {
        self.mutation_ranges
            .iter()
            .any(|(start, end)| pos >= *start && pos < *end)
    }

    fn is_signal(&self, name: &str) -> bool {
        self.signals.contains(name)
    }

    fn is_shadowed(&self, name: &str) -> bool {
        self.shadowed_stack.iter().any(|s| s.contains(name))
    }
}

impl<'a, 'b, 'c> Visit<'c> for RefTransformer<'a, 'b> {
    fn visit_identifier_reference(&mut self, ident: &IdentifierReference<'c>) {
        let name = ident.name.as_str();
        if !self.is_signal(name) {
            return;
        }
        if !self.is_in_component(ident.span.start, ident.span.end) {
            return;
        }
        if self.is_in_mutation_range(ident.span.start) {
            return;
        }
        if self.is_shadowed(name) {
            return;
        }

        // Append .value
        self.ms.append_right(ident.span.end, ".value");
    }

    fn visit_variable_declarator(&mut self, decl: &VariableDeclarator<'c>) {
        // Skip the declaration identifier itself and its initializer for signal declarations
        if let BindingPattern::BindingIdentifier(ref id) = decl.id {
            if self.is_signal(id.name.as_str()) {
                // Don't transform the init expression of a signal declaration
                // (it's already wrapped in signal())
                return;
            }
        }
        // Walk children for non-signal declarations
        oxc_ast_visit::walk::walk_variable_declarator(self, decl);
    }

    fn visit_assignment_expression(&mut self, expr: &AssignmentExpression<'c>) {
        if !self.is_in_component(expr.span.start, expr.span.end) {
            oxc_ast_visit::walk::walk_assignment_expression(self, expr);
            return;
        }

        // For assignments like `count = 5`, transform to `count.value = 5`
        if let AssignmentTarget::AssignmentTargetIdentifier(ident) = &expr.left {
            let name = ident.name.as_str();
            if self.is_signal(name)
                && !self.is_in_mutation_range(ident.span.start)
                && !self.is_shadowed(name)
            {
                self.ms.append_right(ident.span.end, ".value");
                // Walk only the right side
                self.visit_expression(&expr.right);
                return;
            }
        }
        oxc_ast_visit::walk::walk_assignment_expression(self, expr);
    }

    fn visit_update_expression(&mut self, expr: &UpdateExpression<'c>) {
        if !self.is_in_component(expr.span.start, expr.span.end) {
            return;
        }

        // For count++ or ++count, insert .value after the identifier
        if let SimpleAssignmentTarget::AssignmentTargetIdentifier(ref ident) = expr.argument {
            let name = ident.name.as_str();
            if self.is_signal(name)
                && !self.is_in_mutation_range(ident.span.start)
                && !self.is_shadowed(name)
            {
                self.ms.append_right(ident.span.end, ".value");
            }
        }
    }

    fn visit_object_property(&mut self, prop: &ObjectProperty<'c>) {
        if prop.shorthand {
            // Skip signal shorthand: { count } stays as { count } (SignalImpl object).
            // Signals must flow as SignalImpl objects through data structures (context
            // values, props) so that consumers can subscribe to changes. Eagerly
            // unwrapping here would break reactivity for context providers.
            // Note: computeds DO get expanded in shorthand — see computed_transformer.rs.
            return;
        }
        oxc_ast_visit::walk::walk_object_property(self, prop);
    }

    fn visit_member_expression(&mut self, expr: &MemberExpression<'c>) {
        oxc_ast_visit::walk::walk_member_expression(self, expr);
    }

    fn visit_arrow_function_expression(&mut self, func: &ArrowFunctionExpression<'c>) {
        let shadows = collect_param_names(&func.params);
        self.shadowed_stack.push(shadows);
        oxc_ast_visit::walk::walk_arrow_function_expression(self, func);
        self.shadowed_stack.pop();
    }

    fn visit_function(&mut self, func: &Function<'c>, flags: ScopeFlags) {
        let shadows = collect_param_names(&func.params);
        self.shadowed_stack.push(shadows);
        oxc_ast_visit::walk::walk_function(self, func, flags);
        self.shadowed_stack.pop();
    }
}

/// Collect parameter names from a function's formal parameters.
pub fn collect_param_names(params: &FormalParameters) -> HashSet<String> {
    let mut names = HashSet::new();
    for param in &params.items {
        collect_binding_pattern_names(&param.pattern, &mut names);
    }
    if let Some(ref rest) = params.rest {
        collect_binding_pattern_names(&rest.rest.argument, &mut names);
    }
    names
}

/// Recursively collect identifier names from a binding pattern.
fn collect_binding_pattern_names(pattern: &BindingPattern, names: &mut HashSet<String>) {
    match pattern {
        BindingPattern::BindingIdentifier(id) => {
            names.insert(id.name.to_string());
        }
        BindingPattern::ObjectPattern(obj) => {
            for prop in &obj.properties {
                collect_binding_pattern_names(&prop.value, names);
            }
            if let Some(ref rest) = obj.rest {
                collect_binding_pattern_names(&rest.argument, names);
            }
        }
        BindingPattern::ArrayPattern(arr) => {
            for elem in arr.elements.iter().flatten() {
                collect_binding_pattern_names(elem, names);
            }
            if let Some(ref rest) = arr.rest {
                collect_binding_pattern_names(&rest.argument, names);
            }
        }
        BindingPattern::AssignmentPattern(assign) => {
            collect_binding_pattern_names(&assign.left, names);
        }
    }
}

/// Phase 3: Transform signal API property accesses → `.value`
fn transform_signal_api_properties(
    ms: &mut MagicString,
    program: &Program,
    component: &ComponentInfo,
    signal_prop_vars: &HashMap<String, HashSet<String>>,
    _plain_prop_vars: &HashMap<String, HashSet<String>>,
    field_signal_prop_vars: &HashMap<String, HashSet<String>>,
) {
    if signal_prop_vars.is_empty() && field_signal_prop_vars.is_empty() {
        return;
    }

    let mut walker = SignalApiPropTransformer {
        ms,
        component,
        signal_prop_vars,
        field_signal_prop_vars,
        processed_ranges: Vec::new(),
    };

    for stmt in &program.body {
        walker.visit_statement(stmt);
    }
}

struct SignalApiPropTransformer<'a, 'b> {
    ms: &'a mut MagicString,
    component: &'b ComponentInfo,
    signal_prop_vars: &'b HashMap<String, HashSet<String>>,
    field_signal_prop_vars: &'b HashMap<String, HashSet<String>>,
    processed_ranges: Vec<(u32, u32)>,
}

impl<'a, 'b, 'c> Visit<'c> for SignalApiPropTransformer<'a, 'b> {
    fn visit_member_expression(&mut self, expr: &MemberExpression<'c>) {
        let span = match expr {
            MemberExpression::StaticMemberExpression(s) => s.span,
            MemberExpression::ComputedMemberExpression(c) => c.span,
            MemberExpression::PrivateFieldExpression(p) => p.span,
        };

        if span.start < self.component.body_start || span.end > self.component.body_end {
            oxc_ast_visit::walk::walk_member_expression(self, expr);
            return;
        }

        // Check for 3-level field signal chains first (Pass 1):
        // taskForm.title.error → taskForm.title.error.value
        if let MemberExpression::StaticMemberExpression(ref outer) = expr {
            let leaf_prop = outer.property.name.as_str();

            // Check if the object is itself a member expression (making this 3+ level)
            if let Expression::StaticMemberExpression(ref mid) = outer.object {
                let mid_prop = mid.property.name.as_str();

                // Check if root is an identifier with field signal properties
                if let Expression::Identifier(ref root_ident) = mid.object {
                    let root_name = root_ident.name.as_str();
                    if let Some(field_props) = self.field_signal_prop_vars.get(root_name) {
                        // Skip if mid property is a signal property (e.g., taskForm.submitting.value
                        // is an explicit .value on a signal prop, NOT a field signal chain)
                        let mid_is_signal_prop = self
                            .signal_prop_vars
                            .get(root_name)
                            .is_some_and(|sp| sp.contains(mid_prop));

                        if !mid_is_signal_prop && field_props.contains(leaf_prop) {
                            // Don't add .value if already present
                            let already_processed = self
                                .processed_ranges
                                .iter()
                                .any(|(s, e)| span.start >= *s && span.end <= *e);
                            if !already_processed {
                                self.ms.append_right(span.end, ".value");
                                self.processed_ranges.push((span.start, span.end));
                                return;
                            }
                        }
                    }
                }
            }
        }

        // Check for 2-level signal property accesses (Pass 2):
        // tasks.error → tasks.error.value
        if let MemberExpression::StaticMemberExpression(ref static_member) = expr {
            if let Expression::Identifier(ref obj_ident) = static_member.object {
                let obj_name = obj_ident.name.as_str();
                let prop_name = static_member.property.name.as_str();

                if let Some(signal_props) = self.signal_prop_vars.get(obj_name) {
                    if signal_props.contains(prop_name) {
                        let already_processed = self
                            .processed_ranges
                            .iter()
                            .any(|(s, e)| span.start >= *s && span.end <= *e);
                        if !already_processed {
                            // Skip if the developer already wrote .value after this expression
                            let after = self.ms.slice(span.end, (span.end + 6).min(self.ms.len()));
                            if after == ".value" {
                                // Already has .value — don't add another
                                self.processed_ranges.push((span.start, span.end + 6));
                                return;
                            }
                            self.ms.append_right(span.end, ".value");
                            self.processed_ranges.push((span.start, span.end));
                            return;
                        }
                    }
                }
            }
        }

        oxc_ast_visit::walk::walk_member_expression(self, expr);
    }
}
