//! Reactive guard pattern transformer.
//!
//! Transforms a component body of the shape:
//!
//! ```ignore
//! function Foo() {
//!   <setup stmts>
//!   if (cond1) return <jsxA>;
//!   if (cond2) return <jsxB>;
//!   return <jsxMain>;
//! }
//! ```
//!
//! into a mount-framed body that wraps the main return in a chain of
//! `__conditional(() => cond, () => branch, () => fallback)` calls so the
//! guard conditions are re-evaluated reactively:
//!
//! ```ignore
//! function Foo() {
//!   const __mfDepth = __pushMountFrame();
//!   try {
//!     <setup stmts>
//!     const __mfResult0 = __conditional(
//!       () => cond1,
//!       () => <jsxA>,
//!       () => __conditional(() => cond2, () => <jsxB>, () => <jsxMain>),
//!     );
//!     __flushMountFrame();
//!     return __mfResult0;
//!   } catch (__mfErr) { __discardMountFrame(__mfDepth); throw __mfErr; }
//! }
//! ```
//!
//! Runs AFTER the JSX transformer so that `get_transformed_slice` returns the
//! already-generated `__element(...)` IIFE text for each JSX expression, and
//! REPLACES the mount frame transformer for guard-pattern components.

use oxc_ast::ast::*;
use oxc_ast_visit::Visit;
use oxc_span::GetSpan;

use crate::component_analyzer::ComponentInfo;
use crate::magic_string::MagicString;

struct GuardInfo {
    if_stmt_start: u32,
    if_stmt_end: u32,
    cond_start: u32,
    cond_end: u32,
    jsx_start: u32,
    jsx_end: u32,
}

struct MainReturn {
    return_start: u32,
    return_end: u32,
    jsx_start: u32,
    jsx_end: u32,
}

struct GuardPattern {
    guards: Vec<GuardInfo>,
    main_return: MainReturn,
}

/// Attempt to transform the component as a reactive guard pattern.
///
/// Returns `true` if the pattern was recognised and transformed — the caller
/// should then skip the regular mount-frame transformer for this component.
pub fn try_transform_reactive_guards(
    ms: &mut MagicString,
    program: &Program,
    component: &ComponentInfo,
) -> bool {
    // Arrow-expression bodies (no block) can't have an early-return guard.
    if component.is_arrow_expression {
        return false;
    }

    let Some(pattern) = detect_guard_pattern(program, component) else {
        return false;
    };

    apply_transform(ms, component, &pattern);
    true
}

fn apply_transform(ms: &mut MagicString, component: &ComponentInfo, pattern: &GuardPattern) {
    // Read post-JSX-transform slices BEFORE we queue our own overwrites.
    // get_transformed_slice() surfaces the __element(...) IIFE text produced
    // by the JSX transformer and the `.value` appends from the signal
    // transformer on the conditions.
    let main_jsx_text =
        ms.get_transformed_slice(pattern.main_return.jsx_start, pattern.main_return.jsx_end);

    let guard_texts: Vec<(String, String)> = pattern
        .guards
        .iter()
        .map(|g| {
            let cond = ms.get_transformed_slice(g.cond_start, g.cond_end);
            let jsx = ms.get_transformed_slice(g.jsx_start, g.jsx_end);
            (cond, jsx)
        })
        .collect();

    let mut conditional_chain = main_jsx_text;
    for (cond, jsx) in guard_texts.iter().rev() {
        conditional_chain =
            format!("__conditional(() => ({cond}), () => ({jsx}), () => ({conditional_chain}))");
    }

    // 1. Inject mount-frame body wrapping (push + try-open after `{`).
    ms.append_right(
        component.body_start + 1,
        " const __mfDepth = __pushMountFrame();\ntry {",
    );

    // 2. Remove each early `if (cond) return jsx;` statement.
    for guard in &pattern.guards {
        ms.overwrite(guard.if_stmt_start, guard.if_stmt_end, "");
    }

    // 3. Replace the entire main return statement with a mount-framed
    //    `const __mfResult0 = <chain>; __flushMountFrame(); return __mfResult0;`.
    //    Overwriting the whole return statement (rather than just the JSX
    //    argument) wins over the JSX transformer's overwrite of the inner
    //    JSX span because our range strictly contains it.
    let main_replacement = format!(
        "const __mfResult0 = {conditional_chain}; __flushMountFrame(); return __mfResult0;"
    );
    ms.overwrite(
        pattern.main_return.return_start,
        pattern.main_return.return_end,
        &main_replacement,
    );

    // 4. Inject try-close/catch before the body's closing `}`.
    //    body_end is exclusive (points AFTER the `}`), so subtract 1.
    ms.prepend_left(
        component.body_end - 1,
        "\n} catch (__mfErr) { __discardMountFrame(__mfDepth); throw __mfErr; }\n",
    );
}

// ─── Pattern detection ──────────────────────────────────────────────────────

fn detect_guard_pattern(program: &Program, component: &ComponentInfo) -> Option<GuardPattern> {
    let body = find_component_body_statements(program, component)?;

    // Walk statements: skip any number of non-guard leading statements (setup),
    // then collect consecutive guard ifs, then require a single main return as
    // the last statement.
    let mut i = 0;
    let n = body.len();

    // Phase 1: advance until we hit a guard-if or a bare return.
    while i < n {
        match body[i] {
            Statement::IfStatement(_) => {
                if extract_guard_from_if(&body[i]).is_some() {
                    break;
                }
                // An if-statement that isn't a clean guard disqualifies the
                // pattern — bail so we don't silently skip meaningful
                // branching that the developer wrote.
                return None;
            }
            Statement::ReturnStatement(_) => break,
            _ => i += 1,
        }
    }

    // Phase 2: collect guards.
    let mut guards = Vec::new();
    while i < n {
        match body[i] {
            Statement::IfStatement(_) => {
                let guard = extract_guard_from_if(&body[i])?;
                guards.push(guard);
                i += 1;
            }
            _ => break,
        }
    }

    if guards.is_empty() {
        return None;
    }

    // Phase 3: final statement must be a `return <jsx>;` with nothing after.
    if i != n - 1 {
        return None;
    }
    let Statement::ReturnStatement(ret) = &body[i] else {
        return None;
    };
    let arg = ret.argument.as_ref()?;
    let jsx = find_jsx_in_expr(arg)?;
    let jsx_span = jsx.span();

    Some(GuardPattern {
        guards,
        main_return: MainReturn {
            return_start: ret.span.start,
            return_end: ret.span.end,
            jsx_start: jsx_span.start,
            jsx_end: jsx_span.end,
        },
    })
}

fn extract_guard_from_if(stmt: &Statement) -> Option<GuardInfo> {
    let Statement::IfStatement(if_stmt) = stmt else {
        return None;
    };

    // Reject if the guard has an `else` branch — a guard is a one-armed
    // short-circuit; `if (...) return else ...` reshapes control flow in a
    // way that the simple __conditional chain doesn't preserve.
    if if_stmt.alternate.is_some() {
        return None;
    }

    let (jsx_start, jsx_end) = extract_return_jsx_span(&if_stmt.consequent)?;
    let cond_span = if_stmt.test.span();

    Some(GuardInfo {
        if_stmt_start: if_stmt.span.start,
        if_stmt_end: if_stmt.span.end,
        cond_start: cond_span.start,
        cond_end: cond_span.end,
        jsx_start,
        jsx_end,
    })
}

/// Extract the JSX span from the consequent of an `if` where the consequent
/// is exactly `return <jsx>;` (braceless or in a single-statement block).
fn extract_return_jsx_span(consequent: &Statement) -> Option<(u32, u32)> {
    let ret = match consequent {
        Statement::ReturnStatement(ret) => ret,
        Statement::BlockStatement(block) => {
            if block.body.len() != 1 {
                return None;
            }
            if let Statement::ReturnStatement(ret) = &block.body[0] {
                ret
            } else {
                return None;
            }
        }
        _ => return None,
    };
    let arg = ret.argument.as_ref()?;
    let jsx = find_jsx_in_expr(arg)?;
    let span = jsx.span();
    Some((span.start, span.end))
}

fn find_jsx_in_expr<'a, 'b>(expr: &'a Expression<'b>) -> Option<&'a Expression<'b>> {
    match expr {
        Expression::JSXElement(_) | Expression::JSXFragment(_) => Some(expr),
        Expression::ParenthesizedExpression(paren) => find_jsx_in_expr(&paren.expression),
        _ => None,
    }
}

// ─── Locating the component body's statement list ───────────────────────────

fn find_component_body_statements<'a, 'b>(
    program: &'a Program<'b>,
    component: &'a ComponentInfo,
) -> Option<&'a [Statement<'b>]> {
    let mut finder = BodyStmtsFinder {
        component,
        result: None,
    };
    for stmt in &program.body {
        finder.visit_statement(stmt);
        if finder.result.is_some() {
            break;
        }
    }
    finder.result
}

struct BodyStmtsFinder<'a, 'b> {
    component: &'a ComponentInfo,
    result: Option<&'a [Statement<'b>]>,
}

impl<'a, 'b> BodyStmtsFinder<'a, 'b> {
    fn body_matches(&self, body: &oxc_span::Span) -> bool {
        body.start == self.component.body_start && body.end == self.component.body_end
    }
}

impl<'a, 'b> Visit<'b> for BodyStmtsFinder<'a, 'b> {
    fn visit_function(&mut self, func: &Function<'b>, flags: oxc_syntax::scope::ScopeFlags) {
        if let Some(ref body) = func.body {
            if self.body_matches(&body.span) {
                // SAFETY: the body's lifetime outlives this visitor — oxc stores
                // the program in an arena, and the visitor's 'b parameter ties
                // the returned slice to that arena.
                let stmts: &[Statement<'b>] = unsafe {
                    std::mem::transmute::<&[Statement<'b>], &'a [Statement<'b>]>(&body.statements)
                };
                self.result = Some(stmts);
                return;
            }
        }
        oxc_ast_visit::walk::walk_function(self, func, flags);
    }

    fn visit_arrow_function_expression(&mut self, func: &ArrowFunctionExpression<'b>) {
        if self.body_matches(&func.body.span) {
            let stmts: &[Statement<'b>] = unsafe {
                std::mem::transmute::<&[Statement<'b>], &'a [Statement<'b>]>(&func.body.statements)
            };
            self.result = Some(stmts);
            return;
        }
        oxc_ast_visit::walk::walk_arrow_function_expression(self, func);
    }
}

#[cfg(test)]
mod tests {
    use crate::{compile, CompileOptions};

    fn compile_tsx(source: &str) -> String {
        compile(
            source,
            CompileOptions {
                filename: Some("test.tsx".to_string()),
                ..Default::default()
            },
        )
        .code
    }

    #[test]
    fn simple_guard_becomes_reactive_conditional() {
        let out = compile_tsx(
            "function App() {\n  if (props.loading) return <div>Loading</div>;\n  return <div>Content</div>;\n}",
        );
        assert!(
            out.contains("__conditional(() =>"),
            "expected __conditional wrapping, got: {out}"
        );
        // Only one mount frame flush — we produce a single final return.
        let flushes = out.matches("__flushMountFrame()").count();
        assert_eq!(flushes, 1, "expected single flush, got: {out}");
    }

    #[test]
    fn non_guard_component_is_left_to_mount_frame() {
        let out = compile_tsx("function App() { return <div>hi</div>; }");
        assert!(
            !out.contains("__conditional("),
            "unexpected __conditional in plain component: {out}"
        );
        assert!(
            out.contains("__pushMountFrame()"),
            "expected mount frame: {out}"
        );
    }

    #[test]
    fn multiple_guards_nest_conditionals() {
        let out = compile_tsx(
            "function App(props) {\n  if (props.loading) return <div>L</div>;\n  if (props.error) return <div>E</div>;\n  return <div>ok</div>;\n}",
        );
        let conds = out.matches("__conditional(").count();
        assert!(conds >= 2, "expected nested conditionals, got: {out}");
    }

    #[test]
    fn braced_guard_block_is_recognised() {
        let out = compile_tsx(
            "function App(props) {\n  if (props.loading) {\n    return <div>L</div>;\n  }\n  return <div>ok</div>;\n}",
        );
        assert!(
            out.contains("__conditional(() =>"),
            "expected conditional wrap for braced guard, got: {out}"
        );
    }

    #[test]
    fn guard_with_else_branch_is_rejected() {
        // An `if/else` both returning is NOT a guard — fall back to mount frame per-return.
        let out = compile_tsx(
            "function App(props) {\n  if (props.a) return <div>A</div>;\n  else return <div>B</div>;\n}",
        );
        assert!(
            !out.contains("__conditional(() =>"),
            "if/else with two returns should not be rewritten: {out}"
        );
    }

    #[test]
    fn non_guard_if_disqualifies_pattern() {
        // An `if` without a return disqualifies — don't silently reorder logic.
        let out = compile_tsx(
            "function App(props) {\n  if (props.a) { doSomething(); }\n  if (props.b) return <div>B</div>;\n  return <div>main</div>;\n}",
        );
        assert!(
            !out.contains("__conditional(() =>"),
            "non-guard if should block the pattern, got: {out}"
        );
    }
}
