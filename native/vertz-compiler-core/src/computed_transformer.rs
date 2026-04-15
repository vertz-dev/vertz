use std::collections::HashSet;

use oxc_ast::ast::*;
use oxc_ast_visit::Visit;
use oxc_span::GetSpan;

use crate::component_analyzer::ComponentInfo;
use crate::magic_string::MagicString;
use crate::reactivity_analyzer::VariableInfo;

/// Transform computed declarations and references.
pub fn transform_computeds(
    ms: &mut MagicString,
    program: &Program,
    component: &ComponentInfo,
    variables: &[VariableInfo],
) {
    let computeds: HashSet<String> = variables
        .iter()
        .filter(|v| v.kind.as_str() == "computed")
        .map(|v| v.name.clone())
        .collect();

    if computeds.is_empty() {
        return;
    }

    // Transform reads FIRST (before wrapping declarations changes positions)
    let mut read_walker = ComputedReadTransformer {
        ms,
        computeds: &computeds,
        component,
        shadowed_stack: Vec::new(),
    };
    for stmt in &program.body {
        read_walker.visit_statement(stmt);
    }

    // Then transform declarations
    let mut decl_walker = ComputedDeclTransformer {
        ms,
        computeds: &computeds,
        component,
    };
    for stmt in &program.body {
        decl_walker.visit_statement(stmt);
    }
}

/// Transform computed reads → `.value`
struct ComputedReadTransformer<'a, 'b> {
    ms: &'a mut MagicString,
    computeds: &'b HashSet<String>,
    component: &'b ComponentInfo,
    /// Stack of sets of names shadowed in nested scopes (function params, etc.)
    shadowed_stack: Vec<HashSet<String>>,
}

impl<'a, 'b> ComputedReadTransformer<'a, 'b> {
    fn is_shadowed(&self, name: &str) -> bool {
        self.shadowed_stack.iter().any(|s| s.contains(name))
    }
}

impl<'a, 'b, 'c> Visit<'c> for ComputedReadTransformer<'a, 'b> {
    fn visit_identifier_reference(&mut self, ident: &IdentifierReference<'c>) {
        let name = ident.name.as_str();
        if !self.computeds.contains(name) {
            return;
        }
        if ident.span.start < self.component.body_start || ident.span.end > self.component.body_end
        {
            return;
        }
        if self.is_shadowed(name) {
            return;
        }

        self.ms.append_right(ident.span.end, ".value");
    }

    fn visit_variable_declarator(&mut self, decl: &VariableDeclarator<'c>) {
        if let BindingPattern::BindingIdentifier(ref id) = decl.id {
            if self.computeds.contains(id.name.as_str()) {
                // Skip the binding identifier but DO walk the init expression
                // to transform references to other computeds (e.g., chained computeds)
                if let Some(ref init) = decl.init {
                    self.visit_expression(init);
                }
                return;
            }
        }
        oxc_ast_visit::walk::walk_variable_declarator(self, decl);
    }

    fn visit_object_property(&mut self, prop: &ObjectProperty<'c>) {
        // Unlike signals, computeds DO expand shorthand properties
        if prop.shorthand {
            if let PropertyKey::StaticIdentifier(ref key) = prop.key {
                let name = key.name.as_str();
                if self.computeds.contains(name)
                    && prop.span.start >= self.component.body_start
                    && prop.span.end <= self.component.body_end
                {
                    // Expand: { offset } → { offset: offset.value }
                    self.ms.overwrite(
                        prop.span.start,
                        prop.span.end,
                        &format!("{name}: {name}.value"),
                    );
                    return;
                }
            }
        }
        oxc_ast_visit::walk::walk_object_property(self, prop);
    }

    fn visit_arrow_function_expression(&mut self, func: &ArrowFunctionExpression<'c>) {
        let mut shadows = crate::signal_transformer::collect_param_names(&func.params);
        // For arrows nested INSIDE the component body, also shadow `const`/`let`
        // declarations in the arrow body. This prevents inner variables that
        // shadow an outer computed from getting `.value` appended.
        //
        // e.g.: `(event) => { const el = event.target; el.querySelectorAll(...) }`
        // must not become `el.value.querySelectorAll(...)` if `el` is an outer computed.
        if func.span.start >= self.component.body_start && func.span.end <= self.component.body_end
        {
            shadows.extend(crate::signal_transformer::collect_body_var_names(
                &func.body.statements,
            ));
        }
        self.shadowed_stack.push(shadows);
        oxc_ast_visit::walk::walk_arrow_function_expression(self, func);
        self.shadowed_stack.pop();
    }

    fn visit_function(&mut self, func: &Function<'c>, flags: oxc_syntax::scope::ScopeFlags) {
        let mut shadows = crate::signal_transformer::collect_param_names(&func.params);
        // For functions nested INSIDE the component body, also shadow `const`/`let`
        // declarations from the function body.
        if func.span.start >= self.component.body_start && func.span.end <= self.component.body_end
        {
            if let Some(ref body) = func.body {
                shadows.extend(crate::signal_transformer::collect_body_var_names(
                    &body.statements,
                ));
            }
        }
        self.shadowed_stack.push(shadows);
        oxc_ast_visit::walk::walk_function(self, func, flags);
        self.shadowed_stack.pop();
    }
}

/// Transform computed declarations → `computed(() => expr)`
struct ComputedDeclTransformer<'a, 'b> {
    ms: &'a mut MagicString,
    computeds: &'b HashSet<String>,
    component: &'b ComponentInfo,
}

impl<'a, 'b, 'c> Visit<'c> for ComputedDeclTransformer<'a, 'b> {
    fn visit_variable_declaration(&mut self, decl: &VariableDeclaration<'c>) {
        if !matches!(decl.kind, VariableDeclarationKind::Const) {
            return;
        }

        if decl.span.start < self.component.body_start || decl.span.end > self.component.body_end {
            return;
        }

        for declarator in &decl.declarations {
            if let BindingPattern::BindingIdentifier(ref id) = declarator.id {
                let name = id.name.as_str();
                if self.computeds.contains(name) {
                    if let Some(ref init) = declarator.init {
                        // Wrap: computed(() => expr)
                        self.ms.prepend_left(init.span().start, "computed(() => ");
                        self.ms.append_right(init.span().end, ")");
                    }
                }
            }
        }
    }
}
