use std::collections::HashSet;

use oxc_ast::ast::*;
use oxc_ast_visit::Visit;

use crate::component_analyzer::ComponentInfo;
use crate::reactivity_analyzer::{ReactivityKind, VariableInfo};

/// Mutation methods on arrays/objects that don't trigger reactivity on const.
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

/// Detect mutations on `const` variables that are referenced in JSX.
pub fn analyze_mutation_diagnostics(
    program: &Program,
    comp: &ComponentInfo,
    variables: &[VariableInfo],
    source: &str,
) -> Vec<crate::Diagnostic> {
    // Collect names of static const variables
    let static_consts: HashSet<&str> = variables
        .iter()
        .filter(|v| v.kind == ReactivityKind::Static)
        .map(|v| v.name.as_str())
        .collect();

    if static_consts.is_empty() {
        return Vec::new();
    }

    // Collect identifiers referenced in JSX expressions
    let mut jsx_collector = JsxRefCollector {
        comp,
        refs: HashSet::new(),
    };
    jsx_collector.visit_program(program);

    // Only flag consts that are both static and JSX-referenced
    let consts_in_jsx: HashSet<&str> = static_consts
        .iter()
        .filter(|name| jsx_collector.refs.contains(**name))
        .copied()
        .collect();

    if consts_in_jsx.is_empty() {
        return Vec::new();
    }

    // Find mutations on those consts
    let mut detector = MutationDetector {
        comp,
        source,
        consts_in_jsx: &consts_in_jsx,
        diagnostics: Vec::new(),
    };
    detector.visit_program(program);

    detector.diagnostics
}

// ─── JSX Reference Collector ──────────────────────────────────

struct JsxRefCollector<'a> {
    comp: &'a ComponentInfo,
    refs: HashSet<String>,
}

impl<'a, 'b> Visit<'b> for JsxRefCollector<'a> {
    fn visit_jsx_expression_container(&mut self, container: &JSXExpressionContainer<'b>) {
        if container.span.start >= self.comp.body_start && container.span.end <= self.comp.body_end
        {
            // Walk the expression inside the JSX container to collect identifiers
            if let Some(expr) = container.expression.as_expression() {
                self.collect_identifiers(expr);
            }
        }
        oxc_ast_visit::walk::walk_jsx_expression_container(self, container);
    }
}

impl<'a> JsxRefCollector<'a> {
    fn collect_identifiers(&mut self, expr: &Expression) {
        match expr {
            Expression::Identifier(id) => {
                self.refs.insert(id.name.to_string());
            }
            Expression::StaticMemberExpression(mem) => {
                self.collect_identifiers(&mem.object);
            }
            Expression::ComputedMemberExpression(mem) => {
                self.collect_identifiers(&mem.object);
                self.collect_identifiers(&mem.expression);
            }
            Expression::CallExpression(call) => {
                self.collect_identifiers(&call.callee);
                for arg in &call.arguments {
                    if let Argument::Identifier(id) = arg {
                        self.refs.insert(id.name.to_string());
                    }
                }
            }
            Expression::ConditionalExpression(cond) => {
                self.collect_identifiers(&cond.test);
                self.collect_identifiers(&cond.consequent);
                self.collect_identifiers(&cond.alternate);
            }
            Expression::BinaryExpression(bin) => {
                self.collect_identifiers(&bin.left);
                self.collect_identifiers(&bin.right);
            }
            Expression::TemplateLiteral(tpl) => {
                for expr in &tpl.expressions {
                    self.collect_identifiers(expr);
                }
            }
            _ => {}
        }
    }
}

// ─── Mutation Detector ──────────────────────────────────

struct MutationDetector<'a> {
    comp: &'a ComponentInfo,
    source: &'a str,
    consts_in_jsx: &'a HashSet<&'a str>,
    diagnostics: Vec<crate::Diagnostic>,
}

impl<'a, 'b> Visit<'b> for MutationDetector<'a> {
    fn visit_call_expression(&mut self, call: &CallExpression<'b>) {
        if call.span.start >= self.comp.body_start && call.span.end <= self.comp.body_end {
            // Check for obj.method() pattern
            if let Expression::StaticMemberExpression(mem) = &call.callee {
                let method_name = mem.property.name.as_str();
                if MUTATION_METHODS.contains(&method_name) {
                    if let Some(root_name) = get_root_identifier(&mem.object) {
                        if self.consts_in_jsx.contains(root_name) {
                            let (line, column) = crate::utils::offset_to_line_column(
                                self.source,
                                call.span.start as usize,
                            );
                            self.diagnostics.push(crate::Diagnostic {
                                message: format!(
                                    "[non-reactive-mutation] `.{method_name}()` on `const {root_name}` \
                                     will not trigger UI updates. Change `const` to `let` to make it reactive.",
                                ),
                                line: Some(line),
                                column: Some(column),
                            });
                        }
                    }
                }
            }
        }
        oxc_ast_visit::walk::walk_call_expression(self, call);
    }

    fn visit_assignment_expression(&mut self, assign: &AssignmentExpression<'b>) {
        if assign.span.start >= self.comp.body_start && assign.span.end <= self.comp.body_end {
            // Check for obj.prop = value pattern
            if let AssignmentTarget::StaticMemberExpression(mem) = &assign.left {
                if let Expression::Identifier(obj) = &mem.object {
                    let root_name = obj.name.as_str();
                    if self.consts_in_jsx.contains(root_name) {
                        let (line, column) = crate::utils::offset_to_line_column(
                            self.source,
                            assign.span.start as usize,
                        );
                        self.diagnostics.push(crate::Diagnostic {
                            message: format!(
                                "[non-reactive-mutation] Property assignment on `const {root_name}` \
                                 will not trigger UI updates. Change `const` to `let` to make it reactive.",
                            ),
                            line: Some(line),
                            column: Some(column),
                        });
                    }
                }
            }
        }
        oxc_ast_visit::walk::walk_assignment_expression(self, assign);
    }
}

fn get_root_identifier<'a>(expr: &'a Expression) -> Option<&'a str> {
    match expr {
        Expression::Identifier(id) => Some(id.name.as_str()),
        Expression::StaticMemberExpression(mem) => get_root_identifier(&mem.object),
        Expression::ComputedMemberExpression(mem) => get_root_identifier(&mem.object),
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

    fn has_mutation_diag(result: &crate::CompileResult) -> bool {
        result
            .diagnostics
            .as_ref()
            .map(|ds| {
                ds.iter()
                    .any(|d| d.message.contains("non-reactive-mutation"))
            })
            .unwrap_or(false)
    }

    fn mutation_diags(result: &crate::CompileResult) -> Vec<&crate::Diagnostic> {
        result
            .diagnostics
            .as_ref()
            .map(|ds| {
                ds.iter()
                    .filter(|d| d.message.contains("non-reactive-mutation"))
                    .collect()
            })
            .unwrap_or_default()
    }

    // ── Method call mutations on const → diagnostic ──────────────

    #[test]
    fn push_on_const_in_jsx_produces_diagnostic() {
        let result = compile_tsx(
            r#"function App() {
    const items = [];
    items.push(1);
    return <div>{items.length}</div>;
}"#,
        );
        assert!(
            has_mutation_diag(&result),
            "diags: {:?}",
            result.diagnostics
        );
        let diags = mutation_diags(&result);
        assert!(diags[0].message.contains(".push()"));
        assert!(diags[0].message.contains("const items"));
    }

    #[test]
    fn pop_on_const_in_jsx_produces_diagnostic() {
        let result = compile_tsx(
            r#"function App() {
    const items = [1, 2];
    items.pop();
    return <div>{items.length}</div>;
}"#,
        );
        assert!(has_mutation_diag(&result));
        assert!(mutation_diags(&result)[0].message.contains(".pop()"));
    }

    #[test]
    fn shift_on_const_in_jsx_produces_diagnostic() {
        let result = compile_tsx(
            r#"function App() {
    const items = [1];
    items.shift();
    return <div>{items.length}</div>;
}"#,
        );
        assert!(has_mutation_diag(&result));
        assert!(mutation_diags(&result)[0].message.contains(".shift()"));
    }

    #[test]
    fn unshift_on_const_in_jsx_produces_diagnostic() {
        let result = compile_tsx(
            r#"function App() {
    const items = [];
    items.unshift(1);
    return <div>{items.length}</div>;
}"#,
        );
        assert!(has_mutation_diag(&result));
        assert!(mutation_diags(&result)[0].message.contains(".unshift()"));
    }

    #[test]
    fn splice_on_const_in_jsx_produces_diagnostic() {
        let result = compile_tsx(
            r#"function App() {
    const items = [1, 2, 3];
    items.splice(0, 1);
    return <div>{items.length}</div>;
}"#,
        );
        assert!(has_mutation_diag(&result));
        assert!(mutation_diags(&result)[0].message.contains(".splice()"));
    }

    #[test]
    fn sort_on_const_in_jsx_produces_diagnostic() {
        let result = compile_tsx(
            r#"function App() {
    const items = [3, 1, 2];
    items.sort();
    return <div>{items.length}</div>;
}"#,
        );
        assert!(has_mutation_diag(&result));
        assert!(mutation_diags(&result)[0].message.contains(".sort()"));
    }

    #[test]
    fn reverse_on_const_in_jsx_produces_diagnostic() {
        let result = compile_tsx(
            r#"function App() {
    const items = [1, 2];
    items.reverse();
    return <div>{items.length}</div>;
}"#,
        );
        assert!(has_mutation_diag(&result));
        assert!(mutation_diags(&result)[0].message.contains(".reverse()"));
    }

    #[test]
    fn fill_on_const_in_jsx_produces_diagnostic() {
        let result = compile_tsx(
            r#"function App() {
    const items = [1, 2, 3];
    items.fill(0);
    return <div>{items.length}</div>;
}"#,
        );
        assert!(has_mutation_diag(&result));
        assert!(mutation_diags(&result)[0].message.contains(".fill()"));
    }

    #[test]
    fn copy_within_on_const_in_jsx_produces_diagnostic() {
        let result = compile_tsx(
            r#"function App() {
    const items = [1, 2, 3];
    items.copyWithin(0, 1);
    return <div>{items.length}</div>;
}"#,
        );
        assert!(has_mutation_diag(&result));
        assert!(mutation_diags(&result)[0].message.contains(".copyWithin()"));
    }

    // ── Property assignment mutation on const → diagnostic ───────

    #[test]
    fn property_assignment_on_const_in_jsx_produces_diagnostic() {
        let result = compile_tsx(
            r#"function App() {
    const obj = { name: '' };
    obj.name = 'test';
    return <div>{obj.name}</div>;
}"#,
        );
        assert!(
            has_mutation_diag(&result),
            "diags: {:?}",
            result.diagnostics
        );
        let diags = mutation_diags(&result);
        assert!(diags[0].message.contains("Property assignment"));
        assert!(diags[0].message.contains("const obj"));
    }

    // ── No diagnostic when const not in JSX ──────────────────────

    #[test]
    fn no_diagnostic_when_const_not_in_jsx() {
        let result = compile_tsx(
            r#"function App() {
    const items = [];
    items.push(1);
    return <div>hello</div>;
}"#,
        );
        assert!(
            !has_mutation_diag(&result),
            "diags: {:?}",
            result.diagnostics
        );
    }

    // ── No diagnostic for let variables ──────────────────────────

    #[test]
    fn no_diagnostic_for_let_variables() {
        let result = compile_tsx(
            r#"function App() {
    let items = [];
    items.push(1);
    return <div>{items.length}</div>;
}"#,
        );
        assert!(
            !has_mutation_diag(&result),
            "diags: {:?}",
            result.diagnostics
        );
    }

    // ── Non-mutating methods produce no diagnostic ───────────────

    #[test]
    fn non_mutation_methods_no_diagnostic() {
        let result = compile_tsx(
            r#"function App() {
    const items = [1, 2, 3];
    const mapped = items.map(x => x * 2);
    return <div>{items.length}</div>;
}"#,
        );
        assert!(
            !has_mutation_diag(&result),
            "diags: {:?}",
            result.diagnostics
        );
    }

    // ── Line and column in diagnostics ───────────────────────────

    #[test]
    fn diagnostic_includes_line_and_column() {
        let result = compile_tsx(
            r#"function App() {
    const items = [];
    items.push(1);
    return <div>{items.length}</div>;
}"#,
        );
        let diags = mutation_diags(&result);
        assert!(!diags.is_empty());
        assert!(diags[0].line.is_some());
        assert!(diags[0].column.is_some());
    }

    // ── Multiple diagnostics ─────────────────────────────────────

    #[test]
    fn multiple_mutations_produce_multiple_diagnostics() {
        let result = compile_tsx(
            r#"function App() {
    const items = [];
    items.push(1);
    items.pop();
    return <div>{items.length}</div>;
}"#,
        );
        let diags = mutation_diags(&result);
        assert!(diags.len() >= 2, "expected 2+ diags, got: {:?}", diags);
    }

    #[test]
    fn diagnostics_on_different_const_vars() {
        let result = compile_tsx(
            r#"function App() {
    const a = [];
    const b = [];
    a.push(1);
    b.push(2);
    return <div>{a.length}{b.length}</div>;
}"#,
        );
        let diags = mutation_diags(&result);
        assert!(diags.len() >= 2, "expected 2+ diags, got: {:?}", diags);
    }

    // ── Diagnostic message suggests changing to let ──────────────

    #[test]
    fn diagnostic_suggests_let() {
        let result = compile_tsx(
            r#"function App() {
    const items = [];
    items.push(1);
    return <div>{items.length}</div>;
}"#,
        );
        let diags = mutation_diags(&result);
        assert!(diags[0].message.contains("Change `const` to `let`"));
    }

    // ── JSX reference collection patterns ────────────────────────

    #[test]
    fn jsx_member_expression_reference() {
        let result = compile_tsx(
            r#"function App() {
    const obj = { name: 'x' };
    obj.name = 'y';
    return <div>{obj.name}</div>;
}"#,
        );
        assert!(has_mutation_diag(&result));
    }

    #[test]
    fn jsx_conditional_expression_reference() {
        let result = compile_tsx(
            r#"function App() {
    const items = [];
    items.push(1);
    return <div>{items.length > 0 ? 'yes' : 'no'}</div>;
}"#,
        );
        assert!(has_mutation_diag(&result));
    }

    #[test]
    fn jsx_binary_expression_reference() {
        let result = compile_tsx(
            r#"function App() {
    const items = [];
    items.push(1);
    return <div>{items.length + 1}</div>;
}"#,
        );
        assert!(has_mutation_diag(&result));
    }

    #[test]
    fn jsx_template_literal_reference() {
        let result = compile_tsx(
            r#"function App() {
    const items = [];
    items.push(1);
    return <div>{`count: ${items.length}`}</div>;
}"#,
        );
        assert!(has_mutation_diag(&result));
    }

    #[test]
    fn jsx_call_expression_reference() {
        let result = compile_tsx(
            r#"function App() {
    const items = [];
    items.push(1);
    return <div>{items.join(',')}</div>;
}"#,
        );
        // items is referenced via call expression callee in JSX
        assert!(has_mutation_diag(&result));
    }

    // ── Chained member expression ────────────────────────────────

    #[test]
    fn chained_member_expression_detects_root() {
        let result = compile_tsx(
            r#"function App() {
    const obj = { nested: [] };
    obj.nested.push(1);
    return <div>{obj.nested.length}</div>;
}"#,
        );
        assert!(has_mutation_diag(&result));
    }

    // ── Property assignment with both push and assign ────────────

    #[test]
    fn mixed_mutation_types_produce_diagnostics() {
        let result = compile_tsx(
            r#"function App() {
    const obj = { items: [], name: '' };
    obj.items.push(1);
    obj.name = 'test';
    return <div>{obj.name}</div>;
}"#,
        );
        let diags = mutation_diags(&result);
        assert!(diags.len() >= 2, "expected 2+ diags, got: {:?}", diags);
    }
}
