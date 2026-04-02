use std::collections::HashSet;

use oxc_ast::ast::*;
use oxc_ast_visit::Visit;

use crate::component_analyzer::ComponentInfo;
use crate::reactivity_analyzer::VariableInfo;

/// Recognized array mutation methods.
const MUTATION_METHODS: &[&str] = &[
    "push",
    "pop",
    "shift",
    "unshift",
    "splice",
    "sort",
    "reverse",
    "fill",
    "copyWithin",
];

/// Info about a detected mutation on a signal variable.
#[derive(Debug, Clone)]
pub struct MutationInfo {
    pub variable_name: String,
    pub kind: MutationKind,
    pub start: u32,
    pub end: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MutationKind {
    MethodCall,
    PropertyAssignment,
    IndexAssignment,
    Delete,
    ObjectAssign,
}

/// Analyze a component body and detect mutations on signal variables.
pub fn analyze_mutations(
    program: &Program,
    component: &ComponentInfo,
    variables: &[VariableInfo],
) -> Vec<MutationInfo> {
    let signal_names: HashSet<String> = variables
        .iter()
        .filter(|v| v.kind.as_str() == "signal")
        .map(|v| v.name.clone())
        .collect();

    if signal_names.is_empty() {
        return Vec::new();
    }

    let mut detector = MutationDetector {
        signal_names: &signal_names,
        component,
        mutations: Vec::new(),
    };

    for stmt in &program.body {
        detector.visit_statement(stmt);
    }

    detector.mutations
}

struct MutationDetector<'a> {
    signal_names: &'a HashSet<String>,
    component: &'a ComponentInfo,
    mutations: Vec<MutationInfo>,
}

impl<'a> MutationDetector<'a> {
    fn in_component(&self, start: u32, end: u32) -> bool {
        start >= self.component.body_start && end <= self.component.body_end
    }
}

impl<'a, 'b> Visit<'b> for MutationDetector<'a> {
    fn visit_call_expression(&mut self, call: &CallExpression<'b>) {
        if !self.in_component(call.span.start, call.span.end) {
            oxc_ast_visit::walk::walk_call_expression(self, call);
            return;
        }

        // Check for method calls: signal.push(), signal.splice(), etc.
        if let Expression::StaticMemberExpression(ref member) = call.callee {
            let method_name = member.property.name.as_str();

            if MUTATION_METHODS.contains(&method_name) {
                if let Some(root_name) = get_root_identifier(&member.object) {
                    if self.signal_names.contains(&root_name) {
                        self.mutations.push(MutationInfo {
                            variable_name: root_name,
                            kind: MutationKind::MethodCall,
                            start: call.span.start,
                            end: call.span.end,
                        });
                        // Still walk children for self-referential mutations
                        oxc_ast_visit::walk::walk_call_expression(self, call);
                        return;
                    }
                }
            }
        }

        // Check for Object.assign(signal, ...)
        if let Expression::StaticMemberExpression(ref member) = call.callee {
            if member.property.name.as_str() == "assign" {
                if let Expression::Identifier(ref obj) = member.object {
                    if obj.name.as_str() == "Object" {
                        // Check first argument
                        if let Some(Argument::Identifier(ref ident)) = call.arguments.first() {
                            let name = ident.name.to_string();
                            if self.signal_names.contains(&name) {
                                self.mutations.push(MutationInfo {
                                    variable_name: name,
                                    kind: MutationKind::ObjectAssign,
                                    start: call.span.start,
                                    end: call.span.end,
                                });
                                oxc_ast_visit::walk::walk_call_expression(self, call);
                                return;
                            }
                        }
                    }
                }
            }
        }

        oxc_ast_visit::walk::walk_call_expression(self, call);
    }

    fn visit_assignment_expression(&mut self, expr: &AssignmentExpression<'b>) {
        if !self.in_component(expr.span.start, expr.span.end) {
            oxc_ast_visit::walk::walk_assignment_expression(self, expr);
            return;
        }

        // Check for property assignment: signal.prop = value
        match &expr.left {
            AssignmentTarget::StaticMemberExpression(member) => {
                if let Expression::Identifier(ref obj) = member.object {
                    let name = obj.name.to_string();
                    if self.signal_names.contains(&name) {
                        self.mutations.push(MutationInfo {
                            variable_name: name,
                            kind: MutationKind::PropertyAssignment,
                            start: expr.span.start,
                            end: expr.span.end,
                        });
                    }
                }
            }
            // Check for index assignment: signal[0] = value
            AssignmentTarget::ComputedMemberExpression(member) => {
                if let Expression::Identifier(ref obj) = member.object {
                    let name = obj.name.to_string();
                    if self.signal_names.contains(&name) {
                        self.mutations.push(MutationInfo {
                            variable_name: name,
                            kind: MutationKind::IndexAssignment,
                            start: expr.span.start,
                            end: expr.span.end,
                        });
                    }
                }
            }
            _ => {}
        }

        oxc_ast_visit::walk::walk_assignment_expression(self, expr);
    }

    fn visit_unary_expression(&mut self, expr: &UnaryExpression<'b>) {
        if !self.in_component(expr.span.start, expr.span.end) {
            oxc_ast_visit::walk::walk_unary_expression(self, expr);
            return;
        }

        // Check for delete signal.prop
        if expr.operator == UnaryOperator::Delete {
            if let Expression::StaticMemberExpression(ref member) = expr.argument {
                if let Expression::Identifier(ref obj) = member.object {
                    let name = obj.name.to_string();
                    if self.signal_names.contains(&name) {
                        self.mutations.push(MutationInfo {
                            variable_name: name,
                            kind: MutationKind::Delete,
                            start: expr.span.start,
                            end: expr.span.end,
                        });
                    }
                }
            }
        }

        oxc_ast_visit::walk::walk_unary_expression(self, expr);
    }
}

/// Walk up a member expression chain to find the root identifier.
fn get_root_identifier(expr: &Expression) -> Option<String> {
    match expr {
        Expression::Identifier(id) => Some(id.name.to_string()),
        Expression::StaticMemberExpression(member) => get_root_identifier(&member.object),
        Expression::ComputedMemberExpression(member) => get_root_identifier(&member.object),
        _ => None,
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

    // Mutation analyzer is tested via compile() since it requires AST.
    // When mutations are detected on `let` variables (classified as Signal),
    // the mutation_transformer wraps them with peek()/notify().

    // ── MethodCall mutations ─────────────────────────────────────

    #[test]
    fn detects_push_mutation() {
        let result = compile_tsx(
            r#"function App() {
    let items = [];
    items.push(1);
    return <div>{items.length}</div>;
}"#,
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
        assert!(result.code.contains(".notify()"), "code: {}", result.code);
    }

    #[test]
    fn detects_pop_mutation() {
        let result = compile_tsx(
            r#"function App() {
    let items = [1, 2];
    items.pop();
    return <div>{items.length}</div>;
}"#,
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
    }

    #[test]
    fn detects_shift_mutation() {
        let result = compile_tsx(
            r#"function App() {
    let items = [1];
    items.shift();
    return <div>{items.length}</div>;
}"#,
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
    }

    #[test]
    fn detects_unshift_mutation() {
        let result = compile_tsx(
            r#"function App() {
    let items = [];
    items.unshift(1);
    return <div>{items.length}</div>;
}"#,
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
    }

    #[test]
    fn detects_splice_mutation() {
        let result = compile_tsx(
            r#"function App() {
    let items = [1, 2, 3];
    items.splice(0, 1);
    return <div>{items.length}</div>;
}"#,
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
    }

    #[test]
    fn detects_sort_mutation() {
        let result = compile_tsx(
            r#"function App() {
    let items = [3, 1, 2];
    items.sort();
    return <div>{items.length}</div>;
}"#,
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
    }

    #[test]
    fn detects_reverse_mutation() {
        let result = compile_tsx(
            r#"function App() {
    let items = [1, 2];
    items.reverse();
    return <div>{items.length}</div>;
}"#,
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
    }

    #[test]
    fn detects_fill_mutation() {
        let result = compile_tsx(
            r#"function App() {
    let items = [1, 2, 3];
    items.fill(0);
    return <div>{items.length}</div>;
}"#,
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
    }

    #[test]
    fn detects_copy_within_mutation() {
        let result = compile_tsx(
            r#"function App() {
    let items = [1, 2, 3];
    items.copyWithin(0, 1);
    return <div>{items.length}</div>;
}"#,
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
    }

    // ── PropertyAssignment ───────────────────────────────────────

    #[test]
    fn detects_property_assignment() {
        let result = compile_tsx(
            r#"function App() {
    let obj = { name: '' };
    obj.name = 'test';
    return <div>{obj.name}</div>;
}"#,
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
        assert!(result.code.contains(".notify()"), "code: {}", result.code);
    }

    // ── IndexAssignment ──────────────────────────────────────────

    #[test]
    fn detects_index_assignment() {
        let result = compile_tsx(
            r#"function App() {
    let items = [1, 2, 3];
    items[0] = 99;
    return <div>{items.length}</div>;
}"#,
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
        assert!(result.code.contains(".notify()"), "code: {}", result.code);
    }

    // ── Delete ───────────────────────────────────────────────────

    #[test]
    fn detects_delete_mutation() {
        let result = compile_tsx(
            r#"function App() {
    let obj = { key: 'val' };
    delete obj.key;
    return <div>{obj.key}</div>;
}"#,
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
        assert!(result.code.contains(".notify()"), "code: {}", result.code);
    }

    // ── ObjectAssign ─────────────────────────────────────────────

    #[test]
    fn detects_object_assign_mutation() {
        let result = compile_tsx(
            r#"function App() {
    let obj = { a: 1 };
    Object.assign(obj, { b: 2 });
    return <div>{obj.a}</div>;
}"#,
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
        assert!(result.code.contains(".notify()"), "code: {}", result.code);
    }

    // ── No mutation on non-signal (const) variables ──────────────

    #[test]
    fn no_mutation_detected_for_const_variables() {
        // const variables are not classified as Signal, so no peek/notify
        let result = compile_tsx(
            r#"function App() {
    const items = [];
    items.push(1);
    return <div>{items.length}</div>;
}"#,
        );
        // const items is Static, not Signal — mutation_analyzer skips it
        // (mutation_diagnostics will warn instead)
        assert!(!result.code.contains(".peek()"), "code: {}", result.code);
    }

    // ── No mutation for non-JSX-reachable let variables ──────────

    #[test]
    fn no_mutation_for_let_not_in_jsx() {
        let result = compile_tsx(
            r#"function App() {
    let items = [];
    items.push(1);
    return <div>hello</div>;
}"#,
        );
        // items is let but not in JSX, so classified as Static
        assert!(!result.code.contains(".peek()"), "code: {}", result.code);
    }

    // ── Multiple mutations in same component ─────────────────────

    #[test]
    fn multiple_mutations_detected() {
        let result = compile_tsx(
            r#"function App() {
    let items = [];
    items.push(1);
    items.pop();
    return <div>{items.length}</div>;
}"#,
        );
        // Both mutations should be transformed
        let peek_count = result.code.matches(".peek()").count();
        assert!(
            peek_count >= 2,
            "expected 2+ peek() calls, got {}: {}",
            peek_count,
            result.code
        );
    }

    // ── Non-mutation methods not detected ─────────────────────────

    #[test]
    fn non_mutation_methods_not_transformed() {
        let result = compile_tsx(
            r#"function App() {
    let items = [1, 2, 3];
    const mapped = items.map(x => x * 2);
    return <div>{items.length}</div>;
}"#,
        );
        // .map() is not a mutation method — should not get peek/notify
        // (items.length in JSX will get .value transform instead)
        assert!(
            !result.code.contains("items.peek().map"),
            "code: {}",
            result.code
        );
    }

    // ── Chained member expression detects root ───────────────────

    #[test]
    fn chained_member_expression_detects_root_signal() {
        let result = compile_tsx(
            r#"function App() {
    let data = { nested: [] };
    data.nested.push(1);
    return <div>{data.nested.length}</div>;
}"#,
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
    }

    // ── Mutations on different variables ─────────────────────────

    #[test]
    fn mutations_on_different_signal_variables() {
        let result = compile_tsx(
            r#"function App() {
    let a = [];
    let b = { x: 1 };
    a.push(1);
    b.x = 2;
    return <div>{a.length}{b.x}</div>;
}"#,
        );
        assert!(result.code.contains("a.peek()"), "code: {}", result.code);
        assert!(result.code.contains("b.peek()"), "code: {}", result.code);
    }
}
