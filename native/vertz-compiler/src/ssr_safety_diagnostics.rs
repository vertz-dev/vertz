use std::collections::HashSet;

use oxc_ast::ast::*;
use oxc_ast_visit::Visit;
use oxc_span::GetSpan;

use crate::component_analyzer::ComponentInfo;

/// Browser-only global identifiers that crash during SSR.
const BROWSER_GLOBALS: &[&str] = &[
    "localStorage",
    "sessionStorage",
    "navigator",
    "IntersectionObserver",
    "ResizeObserver",
    "MutationObserver",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "requestIdleCallback",
    "cancelIdleCallback",
];

/// Browser-only document property accesses (document.<prop>).
const DOCUMENT_PROPERTIES: &[&str] = &[
    "querySelector",
    "querySelectorAll",
    "getElementById",
    "cookie",
];

/// Analyze a component body for browser-only API usage that would crash during SSR.
pub fn analyze_ssr_safety(
    program: &Program,
    comp: &ComponentInfo,
    source: &str,
) -> Vec<crate::Diagnostic> {
    // Phase 1: Collect spans of nested functions (arrow + function expressions)
    let mut fn_collector = NestedFunctionCollector {
        comp,
        function_spans: Vec::new(),
    };
    fn_collector.visit_program(program);

    // Phase 2: Collect spans of typeof operands (safe — typeof doesn't evaluate)
    let mut typeof_collector = TypeofOperandCollector {
        comp,
        safe_spans: HashSet::new(),
    };
    typeof_collector.visit_program(program);

    // Phase 3: Collect spans of if-block consequents guarded by typeof checks
    let mut guard_collector = TypeofGuardCollector {
        comp,
        guarded_spans: Vec::new(),
    };
    guard_collector.visit_program(program);

    // Phase 4: Find browser-only API usage at component top level
    let mut detector = SsrUnsafeDetector {
        comp,
        source,
        nested_fn_spans: &fn_collector.function_spans,
        typeof_safe_spans: &typeof_collector.safe_spans,
        guarded_spans: &guard_collector.guarded_spans,
        diagnostics: Vec::new(),
    };
    detector.visit_program(program);

    detector.diagnostics
}

// ─── Nested Function Collector ──────────────────────────────────

struct NestedFunctionCollector<'a> {
    comp: &'a ComponentInfo,
    function_spans: Vec<(u32, u32)>,
}

impl<'a> NestedFunctionCollector<'a> {
    fn in_component(&self, start: u32, end: u32) -> bool {
        start >= self.comp.body_start && end <= self.comp.body_end
    }
}

impl<'a, 'b> Visit<'b> for NestedFunctionCollector<'a> {
    fn visit_arrow_function_expression(&mut self, arrow: &ArrowFunctionExpression<'b>) {
        if self.in_component(arrow.span.start, arrow.span.end) {
            self.function_spans.push((arrow.span.start, arrow.span.end));
        }
        oxc_ast_visit::walk::walk_arrow_function_expression(self, arrow);
    }

    fn visit_function(&mut self, func: &Function<'b>, flags: oxc_syntax::scope::ScopeFlags) {
        // Only collect inner functions, not the component function itself
        if self.in_component(func.span.start, func.span.end)
            && func.span.start > self.comp.body_start
        {
            self.function_spans.push((func.span.start, func.span.end));
        }
        oxc_ast_visit::walk::walk_function(self, func, flags);
    }
}

// ─── Typeof Operand Collector ──────────────────────────────────

struct TypeofOperandCollector<'a> {
    comp: &'a ComponentInfo,
    safe_spans: HashSet<(u32, u32)>,
}

impl<'a, 'b> Visit<'b> for TypeofOperandCollector<'a> {
    fn visit_unary_expression(&mut self, expr: &UnaryExpression<'b>) {
        if expr.operator == UnaryOperator::Typeof
            && expr.span.start >= self.comp.body_start
            && expr.span.end <= self.comp.body_end
        {
            if let Expression::Identifier(id) = &expr.argument {
                self.safe_spans.insert((id.span.start, id.span.end));
            }
        }
        oxc_ast_visit::walk::walk_unary_expression(self, expr);
    }
}

// ─── Typeof Guard Collector ──────────────────────────────────

struct TypeofGuardCollector<'a> {
    comp: &'a ComponentInfo,
    guarded_spans: Vec<(u32, u32)>,
}

impl<'a, 'b> Visit<'b> for TypeofGuardCollector<'a> {
    fn visit_if_statement(&mut self, stmt: &IfStatement<'b>) {
        if stmt.span.start >= self.comp.body_start
            && stmt.span.end <= self.comp.body_end
            && is_typeof_guard_test(&stmt.test)
        {
            let s = &stmt.consequent;
            self.guarded_spans.push((s.span().start, s.span().end));
        }
        oxc_ast_visit::walk::walk_if_statement(self, stmt);
    }
}

/// Check if an expression is a typeof guard test for a browser global or window.
fn is_typeof_guard_test(expr: &Expression) -> bool {
    match expr {
        Expression::BinaryExpression(bin) => {
            let typeof_side = match (&bin.left, &bin.right) {
                (Expression::UnaryExpression(unary), _) => Some(unary),
                (_, Expression::UnaryExpression(unary)) => Some(unary),
                _ => None,
            };

            if let Some(unary) = typeof_side {
                if unary.operator == UnaryOperator::Typeof {
                    if let Expression::Identifier(id) = &unary.argument {
                        let name = id.name.as_str();
                        return BROWSER_GLOBALS.contains(&name) || name == "window";
                    }
                }
            }
            false
        }
        _ => false,
    }
}

// ─── SSR Unsafe Detector ──────────────────────────────────

struct SsrUnsafeDetector<'a> {
    comp: &'a ComponentInfo,
    source: &'a str,
    nested_fn_spans: &'a [(u32, u32)],
    typeof_safe_spans: &'a HashSet<(u32, u32)>,
    guarded_spans: &'a [(u32, u32)],
    diagnostics: Vec<crate::Diagnostic>,
}

impl<'a> SsrUnsafeDetector<'a> {
    fn in_component(&self, start: u32) -> bool {
        start >= self.comp.body_start && start < self.comp.body_end
    }

    fn in_nested_function(&self, start: u32) -> bool {
        self.nested_fn_spans
            .iter()
            .any(|(fn_start, fn_end)| start >= *fn_start && start < *fn_end)
    }

    fn is_typeof_operand(&self, start: u32, end: u32) -> bool {
        self.typeof_safe_spans.contains(&(start, end))
    }

    fn in_typeof_guard(&self, start: u32) -> bool {
        self.guarded_spans
            .iter()
            .any(|(guard_start, guard_end)| start >= *guard_start && start < *guard_end)
    }

    fn report(&mut self, api_name: &str, span_start: u32) {
        let (line, column) = offset_to_line_column(self.source, span_start as usize);
        self.diagnostics.push(crate::Diagnostic {
            message: format!(
                "[ssr-unsafe-api] `{}` is a browser-only API that is not available during SSR. \
                 Move it inside onMount() or wrap in a typeof guard.",
                api_name
            ),
            line: Some(line),
            column: Some(column),
        });
    }
}

impl<'a, 'b> Visit<'b> for SsrUnsafeDetector<'a> {
    fn visit_static_member_expression(&mut self, member: &StaticMemberExpression<'b>) {
        if self.in_component(member.span.start) && !self.in_nested_function(member.span.start) {
            // Check for document.<property> pattern
            if let Expression::Identifier(ref obj) = member.object {
                if obj.name.as_str() == "document" {
                    let prop = member.property.name.as_str();
                    if DOCUMENT_PROPERTIES.contains(&prop)
                        && !self.in_typeof_guard(member.span.start)
                    {
                        let api_name = format!("document.{prop}");
                        self.report(&api_name, member.span.start);
                        // Don't walk children to avoid double-reporting
                        return;
                    }
                }
            }
        }
        oxc_ast_visit::walk::walk_static_member_expression(self, member);
    }

    fn visit_identifier_reference(&mut self, id: &IdentifierReference<'b>) {
        let start = id.span.start;
        let end = id.span.end;
        let name = id.name.as_str();

        if !self.in_component(start) {
            return;
        }
        if self.in_nested_function(start) {
            return;
        }
        if self.is_typeof_operand(start, end) {
            return;
        }
        if self.in_typeof_guard(start) {
            return;
        }

        if BROWSER_GLOBALS.contains(&name) {
            self.report(name, start);
        }
    }
}

fn offset_to_line_column(source: &str, offset: usize) -> (u32, u32) {
    let mut line = 1u32;
    let mut col = 1u32;
    for (i, ch) in source.char_indices() {
        if i >= offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }
    (line, col)
}
