use std::collections::HashSet;

use oxc_ast::ast::*;
use oxc_ast_visit::Visit;
use oxc_span::GetSpan;
use oxc_syntax::scope::ScopeFlags;

use crate::component_analyzer::ComponentInfo;
use crate::magic_string::MagicString;
use crate::reactivity_analyzer::VariableInfo;
use crate::signal_transformer::collect_param_names;

/// Auto-wrap query() arguments in a thunk when they contain reactive deps.
///
/// Transforms:
///   query(api.brands.list({ offset: offset }))
/// Into:
///   query(() => api.brands.list({ offset: offset }))
///
/// This ensures that reactive reads (offset.value after signal transform)
/// happen inside the query's lifecycleEffect, enabling automatic re-fetch
/// when dependencies change.
pub fn transform_query_auto_thunk(
    ms: &mut MagicString,
    program: &Program,
    component: &ComponentInfo,
    variables: &[VariableInfo],
    query_aliases: &HashSet<String>,
) {
    // Collect reactive variable names (signals, computeds, and reactive sources)
    let reactive_vars: HashSet<String> = variables
        .iter()
        .filter(|v| {
            v.kind.as_str() == "signal" || v.kind.as_str() == "computed" || v.is_reactive_source
        })
        .map(|v| v.name.clone())
        .collect();

    if reactive_vars.is_empty() || query_aliases.is_empty() {
        return;
    }

    let mut walker = QueryThunkWalker {
        ms,
        component,
        reactive_vars: &reactive_vars,
        query_aliases,
    };

    for stmt in &program.body {
        walker.visit_statement(stmt);
    }
}

struct QueryThunkWalker<'a, 'b> {
    ms: &'a mut MagicString,
    component: &'b ComponentInfo,
    reactive_vars: &'b HashSet<String>,
    query_aliases: &'b HashSet<String>,
}

impl<'a, 'b> QueryThunkWalker<'a, 'b> {
    fn is_in_component(&self, start: u32, end: u32) -> bool {
        start >= self.component.body_start && end <= self.component.body_end
    }
}

impl<'a, 'b, 'c> Visit<'c> for QueryThunkWalker<'a, 'b> {
    fn visit_call_expression(&mut self, call: &CallExpression<'c>) {
        // Check if within component
        if !self.is_in_component(call.span.start, call.span.end) {
            oxc_ast_visit::walk::walk_call_expression(self, call);
            return;
        }

        // Check if callee is an identifier matching a query alias
        if let Expression::Identifier(ref ident) = call.callee {
            let callee_name = ident.name.as_str();
            if self.query_aliases.contains(callee_name) {
                // Get first argument
                if let Some(first_arg) = call.arguments.first() {
                    let expr = match first_arg {
                        Argument::SpreadElement(_) => {
                            // Don't transform spread arguments
                            oxc_ast_visit::walk::walk_call_expression(self, call);
                            return;
                        }
                        _ => first_arg.as_expression().unwrap(),
                    };

                    // Skip if already a function/arrow expression
                    if matches!(
                        expr,
                        Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_)
                    ) {
                        oxc_ast_visit::walk::walk_call_expression(self, call);
                        return;
                    }

                    // Check if the first argument references any reactive variables
                    if contains_reactive_ref(expr, self.reactive_vars) {
                        // Insert `() => ` before the argument
                        self.ms.prepend_left(expr.span().start, "() => ");
                    }
                }
            }
        }

        // Continue walking for nested calls
        oxc_ast_visit::walk::walk_call_expression(self, call);
    }
}

/// Check if an expression contains references to any reactive variables.
/// Skips identifiers that are property names, object literal keys, or shadowed.
fn contains_reactive_ref(expr: &Expression, reactive_vars: &HashSet<String>) -> bool {
    let mut checker = ReactiveRefChecker {
        reactive_vars,
        found: false,
        shadowed_stack: Vec::new(),
    };
    checker.visit_expression(expr);
    checker.found
}

struct ReactiveRefChecker<'a> {
    reactive_vars: &'a HashSet<String>,
    found: bool,
    shadowed_stack: Vec<HashSet<String>>,
}

impl<'a> ReactiveRefChecker<'a> {
    fn is_shadowed(&self, name: &str) -> bool {
        self.shadowed_stack.iter().any(|s| s.contains(name))
    }
}

impl<'a, 'c> Visit<'c> for ReactiveRefChecker<'a> {
    fn visit_identifier_reference(&mut self, ident: &IdentifierReference<'c>) {
        if self.found {
            return;
        }
        let name = ident.name.as_str();
        if self.reactive_vars.contains(name) && !self.is_shadowed(name) {
            self.found = true;
        }
    }

    // Skip property names in member expressions (obj.prop — skip prop)
    fn visit_member_expression(&mut self, expr: &MemberExpression<'c>) {
        if self.found {
            return;
        }
        // Only visit the object, not the property name
        match expr {
            MemberExpression::StaticMemberExpression(s) => {
                self.visit_expression(&s.object);
                // Don't visit s.property — it's the property name, not a variable ref
            }
            MemberExpression::ComputedMemberExpression(c) => {
                self.visit_expression(&c.object);
                self.visit_expression(&c.expression);
            }
            MemberExpression::PrivateFieldExpression(p) => {
                self.visit_expression(&p.object);
            }
        }
    }

    // Skip property names in object literals: { key: value } — skip key identifier
    fn visit_object_property(&mut self, prop: &ObjectProperty<'c>) {
        if self.found {
            return;
        }
        // For shorthand: { count } — the identifier IS the value reference
        if prop.shorthand {
            if let PropertyKey::StaticIdentifier(ref key) = prop.key {
                let name = key.name.as_str();
                if self.reactive_vars.contains(name) && !self.is_shadowed(name) {
                    self.found = true;
                }
            }
            return;
        }
        // For non-shorthand: only visit the value, not the key
        self.visit_expression(&prop.value);
    }

    fn visit_arrow_function_expression(&mut self, func: &ArrowFunctionExpression<'c>) {
        if self.found {
            return;
        }
        let shadows = collect_param_names(&func.params);
        self.shadowed_stack.push(shadows);
        oxc_ast_visit::walk::walk_arrow_function_expression(self, func);
        self.shadowed_stack.pop();
    }

    fn visit_function(&mut self, func: &Function<'c>, flags: ScopeFlags) {
        if self.found {
            return;
        }
        let shadows = collect_param_names(&func.params);
        self.shadowed_stack.push(shadows);
        oxc_ast_visit::walk::walk_function(self, func, flags);
        self.shadowed_stack.pop();
    }
}
