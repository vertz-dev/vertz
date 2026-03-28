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
