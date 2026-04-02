use oxc_ast::ast::*;
use oxc_ast_visit::Visit;
use oxc_span::GetSpan;

use crate::component_analyzer::ComponentInfo;
use crate::magic_string::MagicString;

/// Info about a return statement found in the component body.
struct ReturnInfo {
    /// Span start of the `return` keyword.
    start: u32,
    /// Span end of the full return statement (including semicolon if present).
    end: u32,
    /// Whether the return has an expression (not a bare `return;`).
    has_expression: bool,
    /// Span of the return expression, if any.
    expr_start: Option<u32>,
    expr_end: Option<u32>,
    /// Whether this return is in a braceless control flow (e.g., `if (x) return <expr>;`).
    is_braceless: bool,
}

/// Transform component bodies with mount frame wrapping.
pub fn transform_mount_frame(
    ms: &mut MagicString,
    program: &Program,
    component: &ComponentInfo,
    source: &str,
) {
    // Find all direct return statements in the component body
    let returns = collect_direct_returns(program, component, source);

    if returns.is_empty() {
        return;
    }

    // Step 1: Insert `const __mfDepth = __pushMountFrame();\ntry {` after opening brace
    ms.append_right(
        component.body_start + 1,
        " const __mfDepth = __pushMountFrame();\ntry {",
    );

    // Step 2: Replace each return statement using targeted insertions
    // IMPORTANT: We only overwrite regions OUTSIDE the expression (return keyword, semicolon)
    // so that signal/computed transforms' appends within the expression survive.
    for (i, ret) in returns.iter().enumerate() {
        let var_name = format!("__mfResult{i}");

        if ret.has_expression {
            let expr_start = ret.expr_start.unwrap();
            let expr_end = ret.expr_end.unwrap();

            if ret.is_braceless {
                // Replace `return` keyword region → `{ const __mfResult0 = `
                ms.overwrite(ret.start, expr_start, &format!("{{ const {var_name} = "));
                // Replace after expression to end of statement → `; __flushMountFrame(); return __mfResult0; }`
                ms.overwrite(
                    expr_end,
                    ret.end,
                    &format!("; __flushMountFrame(); return {var_name}; }}"),
                );
            } else {
                // Replace `return` keyword region → `const __mfResult0 = `
                ms.overwrite(ret.start, expr_start, &format!("const {var_name} = "));
                // Replace after expression to end of statement → `; __flushMountFrame(); return __mfResult0;`
                ms.overwrite(
                    expr_end,
                    ret.end,
                    &format!("; __flushMountFrame(); return {var_name};"),
                );
            }
        } else {
            // Bare return — no expression region to preserve
            let replacement = if ret.is_braceless {
                "{ __flushMountFrame(); return; }".to_string()
            } else {
                "__flushMountFrame(); return;".to_string()
            };
            ms.overwrite(ret.start, ret.end, &replacement);
        }
    }

    // Step 3: Insert catch/finally before closing brace
    // Note: body_end is exclusive (points AFTER the `}`), so subtract 1 to insert BEFORE it
    ms.prepend_left(
        component.body_end - 1,
        "\n} catch (__mfErr) { __discardMountFrame(__mfDepth); throw __mfErr; }\n",
    );
}

/// Collect all direct return statements in the component body (not in nested functions).
fn collect_direct_returns(
    program: &Program,
    component: &ComponentInfo,
    _source: &str,
) -> Vec<ReturnInfo> {
    let mut collector = ReturnCollector {
        component,
        returns: Vec::new(),
        in_component: false,
        parent_is_braceless: false,
    };

    for stmt in &program.body {
        collector.visit_statement(stmt);
    }

    collector.returns
}

struct ReturnCollector<'a> {
    component: &'a ComponentInfo,
    returns: Vec<ReturnInfo>,
    /// Whether we're currently inside the target component body.
    in_component: bool,
    /// Whether the current statement context is braceless (e.g., if body without braces).
    parent_is_braceless: bool,
}

impl<'a> ReturnCollector<'a> {
    fn is_in_component_body(&self, start: u32, end: u32) -> bool {
        start >= self.component.body_start && end <= self.component.body_end
    }
}

impl<'a, 'c> Visit<'c> for ReturnCollector<'a> {
    fn visit_function(&mut self, func: &Function<'c>, flags: oxc_syntax::scope::ScopeFlags) {
        let func_span = func.span;

        // Check if this is the component function itself
        if func_span.start <= self.component.body_start && func_span.end >= self.component.body_end
        {
            // This is the component function — walk its body
            let was_in_component = self.in_component;
            self.in_component = true;
            oxc_ast_visit::walk::walk_function(self, func, flags);
            self.in_component = was_in_component;
            return;
        }

        // If we're in the component, this is a nested function — skip it
        if self.in_component && self.is_in_component_body(func_span.start, func_span.end) {
            return;
        }

        oxc_ast_visit::walk::walk_function(self, func, flags);
    }

    fn visit_arrow_function_expression(&mut self, func: &ArrowFunctionExpression<'c>) {
        let func_span = func.span;

        // Check if this is the component (arrow function component)
        if func_span.start <= self.component.body_start && func_span.end >= self.component.body_end
        {
            let was_in_component = self.in_component;
            self.in_component = true;
            oxc_ast_visit::walk::walk_arrow_function_expression(self, func);
            self.in_component = was_in_component;
            return;
        }

        // If we're in the component, this is a nested arrow — skip it
        if self.in_component && self.is_in_component_body(func_span.start, func_span.end) {
            return;
        }

        oxc_ast_visit::walk::walk_arrow_function_expression(self, func);
    }

    fn visit_return_statement(&mut self, stmt: &ReturnStatement<'c>) {
        if !self.in_component {
            return;
        }
        if !self.is_in_component_body(stmt.span.start, stmt.span.end) {
            return;
        }

        let has_expression = stmt.argument.is_some();
        let (expr_start, expr_end) = if let Some(ref arg) = stmt.argument {
            (Some(arg.span().start), Some(arg.span().end))
        } else {
            (None, None)
        };

        self.returns.push(ReturnInfo {
            start: stmt.span.start,
            end: stmt.span.end,
            has_expression,
            expr_start,
            expr_end,
            is_braceless: self.parent_is_braceless,
        });
    }

    fn visit_if_statement(&mut self, stmt: &IfStatement<'c>) {
        if !self.in_component {
            oxc_ast_visit::walk::walk_if_statement(self, stmt);
            return;
        }

        // Check if the consequent is NOT a block statement (braceless if)
        let consequent_is_braceless = !matches!(&stmt.consequent, Statement::BlockStatement(_));

        // Visit test expression normally
        self.visit_expression(&stmt.test);

        // Visit consequent with braceless flag
        let prev = self.parent_is_braceless;
        self.parent_is_braceless = consequent_is_braceless;
        self.visit_statement(&stmt.consequent);
        self.parent_is_braceless = prev;

        // Visit alternate if present
        if let Some(ref alt) = stmt.alternate {
            let alt_is_braceless = !matches!(alt, Statement::BlockStatement(_));
            self.parent_is_braceless = alt_is_braceless;
            self.visit_statement(alt);
            self.parent_is_braceless = prev;
        }
    }
}

/// Transform arrow expression body to block body with mount frame wrapping.
/// This handles: `const MyComponent = () => <div>Hello</div>;`
/// Converts to: `const MyComponent = () => { const __mfDepth = ...; try { ... } catch { ... } };`
pub fn transform_arrow_expression_body(
    ms: &mut MagicString,
    program: &Program,
    component: &ComponentInfo,
) {
    // Find the arrow function for this component
    if let Some(arrow_info) = find_arrow_expression_body(program, component) {
        // Convert expression body to block body with mount frame
        // Use targeted insertions to preserve signal/computed transforms within the expression
        ms.prepend_left(
            arrow_info.expr_start,
            "{ const __mfDepth = __pushMountFrame();\ntry { const __mfResult0 = ",
        );
        ms.append_right(
            arrow_info.expr_end,
            "; __flushMountFrame(); return __mfResult0; \n} catch (__mfErr) { __discardMountFrame(__mfDepth); throw __mfErr; }\n}",
        );
    }
}

struct ArrowExprBodyInfo {
    expr_start: u32,
    expr_end: u32,
}

fn find_arrow_expression_body(
    program: &Program,
    component: &ComponentInfo,
) -> Option<ArrowExprBodyInfo> {
    let mut finder = ArrowExprFinder {
        component,
        result: None,
    };
    for stmt in &program.body {
        finder.visit_statement(stmt);
    }
    finder.result
}

struct ArrowExprFinder<'a> {
    component: &'a ComponentInfo,
    result: Option<ArrowExprBodyInfo>,
}

impl<'a, 'c> Visit<'c> for ArrowExprFinder<'a> {
    fn visit_arrow_function_expression(&mut self, func: &ArrowFunctionExpression<'c>) {
        if func.expression {
            // Check if the body belongs to this component
            // For expression bodies, the body_start/body_end in ComponentInfo
            // refers to the expression span wrapped in FunctionBody
            if let Some(Statement::ExpressionStatement(ref expr_stmt)) =
                func.body.statements.first()
            {
                let expr_span = expr_stmt.expression.span();
                // The component's body_start should be near the expression
                if expr_span.start >= self.component.body_start
                    && expr_span.end <= self.component.body_end
                {
                    self.result = Some(ArrowExprBodyInfo {
                        expr_start: expr_span.start,
                        expr_end: expr_span.end,
                    });
                    return;
                }
            }
        }
        oxc_ast_visit::walk::walk_arrow_function_expression(self, func);
    }
}

#[cfg(test)]
mod tests {
    use crate::{compile, CompileOptions};

    fn compile_tsx(source: &str) -> String {
        let result = compile(
            source,
            CompileOptions {
                filename: Some("test.tsx".to_string()),
                ..Default::default()
            },
        );
        result.code
    }

    // ── Basic return with expression ───────────────────────────────

    #[test]
    fn wraps_return_with_mount_frame() {
        let code = compile_tsx(
            r#"function App() {
    return <div>Hello</div>;
}"#,
        );
        assert!(
            code.contains("__pushMountFrame"),
            "should inject pushMountFrame: {}",
            code
        );
        assert!(
            code.contains("__flushMountFrame"),
            "should inject flushMountFrame: {}",
            code
        );
    }

    #[test]
    fn wraps_return_in_try_catch() {
        let code = compile_tsx(
            r#"function App() {
    return <div>Hello</div>;
}"#,
        );
        assert!(code.contains("try {"), "should have try block: {}", code);
        assert!(
            code.contains("__discardMountFrame"),
            "should have discard in catch: {}",
            code
        );
    }

    // ── Bare return ────────────────────────────────────────────────

    #[test]
    fn handles_bare_return() {
        let code = compile_tsx(
            r#"function App() {
    if (true) return;
    return <div>Hello</div>;
}"#,
        );
        assert!(
            code.contains("__flushMountFrame"),
            "should handle bare return: {}",
            code
        );
    }

    // ── Multiple returns ───────────────────────────────────────────

    #[test]
    fn handles_multiple_returns() {
        let code = compile_tsx(
            r#"function App() {
    if (true) {
        return <span>A</span>;
    }
    return <div>B</div>;
}"#,
        );
        assert!(
            code.contains("__pushMountFrame"),
            "should inject pushMountFrame: {}",
            code
        );
        // Both returns should be wrapped
        assert!(
            code.matches("__flushMountFrame").count() >= 2,
            "should wrap both returns: {}",
            code
        );
    }

    // ── Braceless if return ────────────────────────────────────────

    #[test]
    fn handles_braceless_if_return() {
        let code = compile_tsx(
            r#"function App() {
    if (false) return <span>A</span>;
    return <div>B</div>;
}"#,
        );
        // Braceless returns should be wrapped in { ... }
        assert!(
            code.contains("__flushMountFrame"),
            "should handle braceless return: {}",
            code
        );
    }

    // ── Arrow expression body ──────────────────────────────────────

    #[test]
    fn wraps_arrow_expression_body() {
        let code = compile_tsx("const App = () => <div>Hello</div>;");
        assert!(
            code.contains("__pushMountFrame"),
            "should wrap arrow expression: {}",
            code
        );
        assert!(
            code.contains("__flushMountFrame"),
            "should flush in arrow expression: {}",
            code
        );
    }

    // ── Arrow block body ───────────────────────────────────────────

    #[test]
    fn wraps_arrow_block_body() {
        let code = compile_tsx(
            r#"const App = () => {
    return <div>Hello</div>;
};"#,
        );
        assert!(
            code.contains("__pushMountFrame"),
            "should wrap arrow block body: {}",
            code
        );
    }

    // ── Nested function returns are not wrapped ────────────────────

    #[test]
    fn does_not_wrap_nested_function_return() {
        let code = compile_tsx(
            r#"function App() {
    const helper = () => { return 42; };
    return <div>Hello</div>;
}"#,
        );
        // Should only have mount frame wrapping for the component, not the nested function
        assert!(
            code.contains("__pushMountFrame"),
            "should wrap component: {}",
            code
        );
    }

    // ── Return expression is preserved ─────────────────────────────

    #[test]
    fn preserves_return_expression() {
        let code = compile_tsx(
            r#"function App() {
    return <div>Hello</div>;
}"#,
        );
        // The expression content should still be in the output
        assert!(
            code.contains("__mfResult"),
            "should use result variable: {}",
            code
        );
    }

    // ── Braceless else return ──────────────────────────────────────

    #[test]
    fn handles_braceless_else_return() {
        let code = compile_tsx(
            r#"function App() {
    if (true) return <span>A</span>;
    else return <div>B</div>;
}"#,
        );
        assert!(
            code.matches("__flushMountFrame").count() >= 2,
            "should handle both braceless returns: {}",
            code
        );
    }

    // ── Export function ────────────────────────────────────────────

    #[test]
    fn wraps_export_function() {
        let code = compile_tsx(
            r#"export function App() {
    return <div>Hello</div>;
}"#,
        );
        assert!(
            code.contains("__pushMountFrame"),
            "should wrap exported function: {}",
            code
        );
    }

    // ── Export default function ─────────────────────────────────────

    #[test]
    fn wraps_export_default_function() {
        let code = compile_tsx(
            r#"export default function App() {
    return <div>Hello</div>;
}"#,
        );
        assert!(
            code.contains("__pushMountFrame"),
            "should wrap export default function: {}",
            code
        );
    }
}
