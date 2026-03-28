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
