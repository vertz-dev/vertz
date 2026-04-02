use oxc_ast::ast::*;
use oxc_ast_visit::Visit;

use crate::component_analyzer::ComponentInfo;

/// Detect JSX expressions outside the return tree in component functions.
pub fn analyze_body_jsx(
    program: &Program,
    comp: &ComponentInfo,
    source: &str,
) -> Vec<crate::Diagnostic> {
    // Phase 1: Collect spans of nested functions and return statements
    let mut context_collector = ContextCollector {
        comp,
        nested_fn_spans: Vec::new(),
        return_spans: Vec::new(),
        fn_depth: 0,
    };
    context_collector.visit_program(program);

    // Phase 2: Collect all JSX element/fragment spans in the component body
    let mut jsx_collector = JsxCollector {
        comp,
        jsx_spans: Vec::new(),
    };
    jsx_collector.visit_program(program);

    // Phase 3: Filter and emit diagnostics
    let mut diagnostics = Vec::new();

    for &(jsx_start, jsx_end) in &jsx_collector.jsx_spans {
        // Skip if inside a nested function (deferred execution)
        let in_nested_fn = context_collector
            .nested_fn_spans
            .iter()
            .any(|(s, e)| jsx_start >= *s && jsx_end <= *e);
        if in_nested_fn {
            continue;
        }

        // Skip if inside a return statement
        let in_return = context_collector
            .return_spans
            .iter()
            .any(|(s, e)| jsx_start >= *s && jsx_end <= *e);
        if in_return {
            continue;
        }

        // Skip if this JSX is nested inside another body-level JSX (avoid double-flagging)
        let has_jsx_ancestor = jsx_collector.jsx_spans.iter().any(|(s, e)| {
            *s < jsx_start
                && jsx_end < *e
                && !context_collector
                    .nested_fn_spans
                    .iter()
                    .any(|(fs, fe)| *s >= *fs && *e <= *fe)
                && !context_collector
                    .return_spans
                    .iter()
                    .any(|(rs, re)| *s >= *rs && *e <= *re)
        });
        if has_jsx_ancestor {
            continue;
        }

        let (line, column) = crate::utils::offset_to_line_column(source, jsx_start as usize);
        diagnostics.push(crate::Diagnostic {
            message: "[jsx-outside-tree] JSX outside the return tree creates DOM elements eagerly \
                 during hydration, stealing SSR nodes from the render tree. Move this JSX \
                 into the return expression."
                .to_string(),
            line: Some(line),
            column: Some(column),
        });
    }

    diagnostics
}

// ─── Context Collector ──────────────────────────────────

struct ContextCollector<'a> {
    comp: &'a ComponentInfo,
    nested_fn_spans: Vec<(u32, u32)>,
    return_spans: Vec<(u32, u32)>,
    fn_depth: u32,
}

impl<'a> ContextCollector<'a> {
    fn in_component(&self, start: u32, end: u32) -> bool {
        start >= self.comp.body_start && end <= self.comp.body_end
    }
}

impl<'a, 'b> Visit<'b> for ContextCollector<'a> {
    fn visit_arrow_function_expression(&mut self, arrow: &ArrowFunctionExpression<'b>) {
        if self.in_component(arrow.span.start, arrow.span.end) {
            self.nested_fn_spans
                .push((arrow.span.start, arrow.span.end));
            self.fn_depth += 1;
            oxc_ast_visit::walk::walk_arrow_function_expression(self, arrow);
            self.fn_depth -= 1;
            return;
        }
        oxc_ast_visit::walk::walk_arrow_function_expression(self, arrow);
    }

    fn visit_function(&mut self, func: &Function<'b>, flags: oxc_syntax::scope::ScopeFlags) {
        if self.in_component(func.span.start, func.span.end)
            && func.span.start > self.comp.body_start
        {
            self.nested_fn_spans.push((func.span.start, func.span.end));
            self.fn_depth += 1;
            oxc_ast_visit::walk::walk_function(self, func, flags);
            self.fn_depth -= 1;
            return;
        }
        oxc_ast_visit::walk::walk_function(self, func, flags);
    }

    fn visit_return_statement(&mut self, stmt: &ReturnStatement<'b>) {
        // Only collect return statements at the component body level (not in nested functions)
        if stmt.span.start >= self.comp.body_start
            && stmt.span.end <= self.comp.body_end
            && self.fn_depth == 0
        {
            self.return_spans.push((stmt.span.start, stmt.span.end));
        }
        oxc_ast_visit::walk::walk_return_statement(self, stmt);
    }
}

// ─── JSX Collector ──────────────────────────────────

struct JsxCollector<'a> {
    comp: &'a ComponentInfo,
    jsx_spans: Vec<(u32, u32)>,
}

impl<'a, 'b> Visit<'b> for JsxCollector<'a> {
    fn visit_jsx_element(&mut self, el: &JSXElement<'b>) {
        if el.span.start >= self.comp.body_start && el.span.end <= self.comp.body_end {
            self.jsx_spans.push((el.span.start, el.span.end));
        }
        oxc_ast_visit::walk::walk_jsx_element(self, el);
    }

    fn visit_jsx_fragment(&mut self, frag: &JSXFragment<'b>) {
        if frag.span.start >= self.comp.body_start && frag.span.end <= self.comp.body_end {
            self.jsx_spans.push((frag.span.start, frag.span.end));
        }
        oxc_ast_visit::walk::walk_jsx_fragment(self, frag);
    }
}

#[cfg(test)]
mod tests {
    use crate::{compile, CompileOptions};

    fn compile_tsx(source: &str) -> Vec<crate::Diagnostic> {
        let result = compile(
            source,
            CompileOptions {
                filename: Some("test.tsx".to_string()),
                ..Default::default()
            },
        );
        result.diagnostics.unwrap_or_default()
    }

    fn has_body_jsx_diagnostic(diagnostics: &[crate::Diagnostic]) -> bool {
        diagnostics
            .iter()
            .any(|d| d.message.contains("[jsx-outside-tree]"))
    }

    // ── JSX in return → no diagnostic ──────────────────────────────

    #[test]
    fn no_diagnostic_for_jsx_in_return() {
        let diagnostics = compile_tsx(
            r#"function App() {
    return <div>Hello</div>;
}"#,
        );
        assert!(!has_body_jsx_diagnostic(&diagnostics));
    }

    // ── JSX outside return → diagnostic ────────────────────────────

    #[test]
    fn diagnostic_for_jsx_outside_return() {
        let diagnostics = compile_tsx(
            r#"function App() {
    const el = <span>outside</span>;
    return <div>Hello</div>;
}"#,
        );
        assert!(has_body_jsx_diagnostic(&diagnostics));
    }

    // ── JSX in nested function → no diagnostic ─────────────────────

    #[test]
    fn no_diagnostic_for_jsx_in_arrow_function() {
        let diagnostics = compile_tsx(
            r#"function App() {
    const render = () => <span>nested</span>;
    return <div>Hello</div>;
}"#,
        );
        assert!(!has_body_jsx_diagnostic(&diagnostics));
    }

    #[test]
    fn no_diagnostic_for_jsx_in_function_expression() {
        let diagnostics = compile_tsx(
            r#"function App() {
    const render = function() { return <span>nested</span>; };
    return <div>Hello</div>;
}"#,
        );
        assert!(!has_body_jsx_diagnostic(&diagnostics));
    }

    // ── JSX fragment outside return → diagnostic ───────────────────

    #[test]
    fn diagnostic_for_fragment_outside_return() {
        let diagnostics = compile_tsx(
            r#"function App() {
    const el = <><span>frag</span></>;
    return <div>Hello</div>;
}"#,
        );
        assert!(has_body_jsx_diagnostic(&diagnostics));
    }

    // ── Diagnostic has line/column info ─────────────────────────────

    #[test]
    fn diagnostic_includes_line_and_column() {
        let diagnostics = compile_tsx(
            r#"function App() {
    const el = <span>outside</span>;
    return <div>Hello</div>;
}"#,
        );
        let diag = diagnostics
            .iter()
            .find(|d| d.message.contains("[jsx-outside-tree]"))
            .unwrap();
        assert!(diag.line.is_some());
        assert!(diag.column.is_some());
    }

    // ── No component → no diagnostics ──────────────────────────────

    #[test]
    fn no_diagnostic_when_no_component() {
        let diagnostics = compile_tsx("const x = 1;");
        assert!(!has_body_jsx_diagnostic(&diagnostics));
    }
}
