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

#[cfg(test)]
mod tests {
    use crate::{compile, CompileOptions};

    fn compile_tsx(source: &str) -> crate::CompileResult {
        compile(
            source,
            CompileOptions {
                filename: Some("test.tsx".to_string()),
                ..Default::default()
            },
        )
    }

    // ── Basic thunk wrapping ─────────────────────────────────────

    #[test]
    fn wraps_query_arg_with_thunk_when_reactive_var_present() {
        let result = compile_tsx(
            r#"import { query } from '@vertz/ui';
function App() {
    let offset = 0;
    const q = query(fetch('/api', { offset }));
    return <div>{offset}</div>;
}"#,
        );
        assert!(
            result.code.contains("() => "),
            "expected thunk wrapper, code: {}",
            result.code
        );
    }

    #[test]
    fn no_thunk_when_no_reactive_vars() {
        let result = compile_tsx(
            r#"import { query } from '@vertz/ui';
function App() {
    const q = query(fetch('/api'));
    return <div>hello</div>;
}"#,
        );
        // No reactive vars → no thunk wrapping
        assert!(
            !result.code.contains("() => fetch"),
            "should not wrap, code: {}",
            result.code
        );
    }

    // ── Skip already-wrapped functions ───────────────────────────

    #[test]
    fn skip_arrow_function_argument() {
        let result = compile_tsx(
            r#"import { query } from '@vertz/ui';
function App() {
    let offset = 0;
    const q = query(() => fetch('/api', { offset }));
    return <div>{offset}</div>;
}"#,
        );
        // Already an arrow function — should NOT double-wrap
        assert!(
            !result.code.contains("() => () =>"),
            "should not double-wrap, code: {}",
            result.code
        );
    }

    #[test]
    fn skip_function_expression_argument() {
        let result = compile_tsx(
            r#"import { query } from '@vertz/ui';
function App() {
    let offset = 0;
    const q = query(function() { return fetch('/api', { offset }); });
    return <div>{offset}</div>;
}"#,
        );
        assert!(
            !result.code.contains("() => function"),
            "should not wrap function expression, code: {}",
            result.code
        );
    }

    // ── Skip spread arguments ────────────────────────────────────

    #[test]
    fn skip_spread_argument() {
        let result = compile_tsx(
            r#"import { query } from '@vertz/ui';
function App() {
    let args = [];
    const q = query(...args);
    return <div>{args.length}</div>;
}"#,
        );
        // Spread arguments should not be wrapped
        assert!(
            !result.code.contains("() => ..."),
            "should not wrap spread, code: {}",
            result.code
        );
    }

    // ── Shorthand object properties ──────────────────────────────

    #[test]
    fn detects_reactive_var_in_shorthand_object_property() {
        let result = compile_tsx(
            r#"import { query } from '@vertz/ui';
function App() {
    let offset = 0;
    const q = query(apiCall({ offset }));
    return <div>{offset}</div>;
}"#,
        );
        assert!(
            result.code.contains("() => "),
            "shorthand prop should trigger thunk, code: {}",
            result.code
        );
    }

    // ── Aliased query import ─────────────────────────────────────

    #[test]
    fn works_with_aliased_query_import() {
        let result = compile_tsx(
            r#"import { query as myQuery } from '@vertz/ui';
function App() {
    let offset = 0;
    const q = myQuery(fetch('/api', { offset }));
    return <div>{offset}</div>;
}"#,
        );
        assert!(
            result.code.contains("() => "),
            "aliased query should still wrap, code: {}",
            result.code
        );
    }

    // ── Non-query callee not affected ────────────────────────────

    #[test]
    fn non_query_callee_not_wrapped() {
        let result = compile_tsx(
            r#"import { query } from '@vertz/ui';
function App() {
    let offset = 0;
    const result = someOtherFn(fetch('/api', { offset }));
    return <div>{offset}</div>;
}"#,
        );
        // someOtherFn is not query — should not wrap
        assert!(
            !result.code.contains("() => fetch"),
            "non-query should not wrap, code: {}",
            result.code
        );
    }

    // ── Member expression property skipping ──────────────────────

    #[test]
    fn skips_property_names_in_member_expressions() {
        // If reactive var name appears as a property (not object), should not trigger
        let result = compile_tsx(
            r#"import { query } from '@vertz/ui';
function App() {
    let offset = 0;
    const q = query(api.offset);
    return <div>{offset}</div>;
}"#,
        );
        // `offset` in `api.offset` is a property name, not a variable reference
        assert!(
            !result.code.contains("() => api"),
            "property name should not trigger thunk, code: {}",
            result.code
        );
    }

    // ── Shadowed variables ───────────────────────────────────────

    #[test]
    fn shadowed_var_in_arrow_does_not_trigger_thunk() {
        let result = compile_tsx(
            r#"import { query } from '@vertz/ui';
function App() {
    let offset = 0;
    const q = query(((offset) => doSomething(offset))(5));
    return <div>{offset}</div>;
}"#,
        );
        // offset is shadowed by the arrow param, so no reactive ref
        assert!(
            !result.code.contains("() => ((offset)"),
            "shadowed var should not trigger thunk, code: {}",
            result.code
        );
    }

    // ── No query import → no transform ───────────────────────────

    #[test]
    fn no_query_import_no_transform() {
        let result = compile_tsx(
            r#"function App() {
    let offset = 0;
    const q = query(fetch('/api', { offset }));
    return <div>{offset}</div>;
}"#,
        );
        // query is not imported from @vertz/ui — should not wrap
        assert!(
            !result.code.contains("() => fetch"),
            "no import should not wrap, code: {}",
            result.code
        );
    }

    // ── Computed member expression visits both parts ──────────────

    #[test]
    fn computed_member_expression_detects_reactive_in_expression() {
        let result = compile_tsx(
            r#"import { query } from '@vertz/ui';
function App() {
    let idx = 0;
    const q = query(items[idx]);
    return <div>{idx}</div>;
}"#,
        );
        assert!(
            result.code.contains("() => "),
            "computed member expr should detect reactive, code: {}",
            result.code
        );
    }

    // ── No arguments → no crash ──────────────────────────────────

    #[test]
    fn query_with_no_args_does_not_crash() {
        let result = compile_tsx(
            r#"import { query } from '@vertz/ui';
function App() {
    let x = 0;
    const q = query();
    return <div>{x}</div>;
}"#,
        );
        // Should not panic
        assert!(!result.code.is_empty());
    }

    // ── Object property key not treated as reference ─────────────

    #[test]
    fn object_key_not_treated_as_reactive_ref() {
        let result = compile_tsx(
            r#"import { query } from '@vertz/ui';
function App() {
    let offset = 0;
    const q = query(doStuff({ offset: 42 }));
    return <div>{offset}</div>;
}"#,
        );
        // `offset` in `{ offset: 42 }` is a key, not a reactive reference
        // The value is 42 (literal), not a reactive var
        assert!(
            !result.code.contains("() => doStuff"),
            "object key should not trigger thunk, code: {}",
            result.code
        );
    }
}
