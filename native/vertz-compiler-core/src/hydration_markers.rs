use oxc_ast::ast::*;

use crate::component_analyzer::ComponentInfo;

/// Determine which components are interactive (have `let` declarations)
/// and should receive hydration markers.
///
/// Returns a list of component names that need `data-v-id` markers.
pub fn find_interactive_components(program: &Program, components: &[ComponentInfo]) -> Vec<String> {
    let mut hydration_ids = Vec::new();

    for comp in components {
        let body = find_component_body(program, comp);
        if let Some(body) = body {
            if has_let_declaration(body) {
                hydration_ids.push(comp.name.clone());
            }
        }
    }

    hydration_ids
}

/// Find the FunctionBody for a component by matching body_start/body_end.
fn find_component_body<'a>(
    program: &'a Program<'a>,
    component: &ComponentInfo,
) -> Option<&'a FunctionBody<'a>> {
    for stmt in &program.body {
        if let Some(body) = find_body_in_statement(stmt, component) {
            return Some(body);
        }
    }
    None
}

fn find_body_in_statement<'a>(
    stmt: &'a Statement<'a>,
    component: &ComponentInfo,
) -> Option<&'a FunctionBody<'a>> {
    match stmt {
        Statement::FunctionDeclaration(func) => {
            if let Some(ref body) = func.body {
                if body.span.start == component.body_start && body.span.end == component.body_end {
                    return Some(body);
                }
            }
            None
        }
        Statement::VariableDeclaration(decl) => {
            for declarator in &decl.declarations {
                if let Some(ref init) = declarator.init {
                    if let Some(body) = find_body_in_expr(init, component) {
                        return Some(body);
                    }
                }
            }
            None
        }
        Statement::ExportNamedDeclaration(export_decl) => {
            if let Some(ref decl) = export_decl.declaration {
                match decl {
                    Declaration::FunctionDeclaration(func) => {
                        if let Some(ref body) = func.body {
                            if body.span.start == component.body_start
                                && body.span.end == component.body_end
                            {
                                return Some(body);
                            }
                        }
                    }
                    Declaration::VariableDeclaration(vd) => {
                        for declarator in &vd.declarations {
                            if let Some(ref init) = declarator.init {
                                if let Some(body) = find_body_in_expr(init, component) {
                                    return Some(body);
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            None
        }
        Statement::ExportDefaultDeclaration(export_default) => {
            if let ExportDefaultDeclarationKind::FunctionDeclaration(ref func) =
                export_default.declaration
            {
                if let Some(ref body) = func.body {
                    if body.span.start == component.body_start
                        && body.span.end == component.body_end
                    {
                        return Some(body);
                    }
                }
            }
            None
        }
        _ => None,
    }
}

fn find_body_in_expr<'a>(
    expr: &'a Expression<'a>,
    component: &ComponentInfo,
) -> Option<&'a FunctionBody<'a>> {
    match expr {
        Expression::ArrowFunctionExpression(arrow) => {
            if arrow.body.span.start == component.body_start
                && arrow.body.span.end == component.body_end
            {
                return Some(&arrow.body);
            }
            None
        }
        Expression::FunctionExpression(func) => {
            if let Some(ref body) = func.body {
                if body.span.start == component.body_start && body.span.end == component.body_end {
                    return Some(body);
                }
            }
            None
        }
        _ => None,
    }
}

/// Check if a function body contains any `let` variable declarations.
fn has_let_declaration(body: &FunctionBody) -> bool {
    for stmt in &body.statements {
        if let Statement::VariableDeclaration(decl) = stmt {
            if matches!(decl.kind, VariableDeclarationKind::Let) {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::component_analyzer::analyze_components;
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::SourceType;

    /// Parse source and return interactive component names.
    fn interactive_names(source: &str) -> Vec<String> {
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let components = analyze_components(&parsed.program);
        find_interactive_components(&parsed.program, &components)
    }

    // ========== function declarations ==========

    #[test]
    fn function_decl_with_let_is_interactive() {
        let names =
            interactive_names("function Counter() { let count = 0; return <div>{count}</div>; }");
        assert_eq!(names, vec!["Counter"]);
    }

    #[test]
    fn function_decl_without_let_is_not_interactive() {
        let names = interactive_names("function Header() { return <h1>Hello</h1>; }");
        assert!(names.is_empty());
    }

    #[test]
    fn function_decl_with_const_only_is_not_interactive() {
        let names = interactive_names("function Info() { const x = 1; return <div>{x}</div>; }");
        assert!(names.is_empty());
    }

    // ========== arrow functions (const =) ==========

    #[test]
    fn arrow_with_let_is_interactive() {
        let names = interactive_names(
            "const Counter = () => { let count = 0; return <div>{count}</div>; };",
        );
        assert_eq!(names, vec!["Counter"]);
    }

    #[test]
    fn arrow_without_let_is_not_interactive() {
        let names = interactive_names("const Header = () => { return <h1>Hi</h1>; };");
        assert!(names.is_empty());
    }

    // ========== function expressions (const = function) ==========

    #[test]
    fn function_expr_with_let_is_interactive() {
        let names = interactive_names(
            "const Counter = function() { let count = 0; return <div>{count}</div>; };",
        );
        assert_eq!(names, vec!["Counter"]);
    }

    #[test]
    fn function_expr_without_let_is_not_interactive() {
        let names = interactive_names("const Header = function() { return <h1>Hi</h1>; };");
        assert!(names.is_empty());
    }

    // ========== export named function declaration ==========

    #[test]
    fn export_named_function_with_let_is_interactive() {
        let names = interactive_names(
            "export function Counter() { let count = 0; return <div>{count}</div>; }",
        );
        assert_eq!(names, vec!["Counter"]);
    }

    #[test]
    fn export_named_function_without_let_is_not_interactive() {
        let names = interactive_names("export function Header() { return <h1>Hi</h1>; }");
        assert!(names.is_empty());
    }

    // ========== export named variable (arrow / function expr) ==========

    #[test]
    fn export_named_const_arrow_with_let_is_interactive() {
        let names = interactive_names(
            "export const Counter = () => { let count = 0; return <div>{count}</div>; };",
        );
        assert_eq!(names, vec!["Counter"]);
    }

    #[test]
    fn export_named_const_arrow_without_let_is_not_interactive() {
        let names = interactive_names("export const Header = () => { return <h1>Hi</h1>; };");
        assert!(names.is_empty());
    }

    #[test]
    fn export_named_const_func_expr_with_let_is_interactive() {
        let names = interactive_names(
            "export const Counter = function() { let count = 0; return <div>{count}</div>; };",
        );
        assert_eq!(names, vec!["Counter"]);
    }

    // ========== export default function ==========

    #[test]
    fn export_default_function_with_let_is_interactive() {
        let names = interactive_names(
            "export default function Counter() { let count = 0; return <div>{count}</div>; }",
        );
        assert_eq!(names, vec!["Counter"]);
    }

    #[test]
    fn export_default_function_without_let_is_not_interactive() {
        let names = interactive_names("export default function Header() { return <h1>Hi</h1>; }");
        assert!(names.is_empty());
    }

    // ========== multiple components ==========

    #[test]
    fn multiple_components_only_interactive_ones_returned() {
        let source = r#"
            function Counter() { let count = 0; return <div>{count}</div>; }
            function Header() { return <h1>Hi</h1>; }
            const Toggle = () => { let on = false; return <button>{on}</button>; };
        "#;
        let names = interactive_names(source);
        assert_eq!(names, vec!["Counter", "Toggle"]);
    }

    // ========== empty components list ==========

    #[test]
    fn empty_components_returns_empty() {
        let allocator = Allocator::default();
        let source = "const x = 1;";
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let result = find_interactive_components(&parsed.program, &[]);
        assert!(result.is_empty());
    }

    // ========== component with mismatched spans ==========

    #[test]
    fn component_info_with_wrong_spans_returns_empty() {
        let allocator = Allocator::default();
        let source = "function Counter() { let count = 0; return <div>{count}</div>; }";
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let fake_component = ComponentInfo {
            name: "Counter".to_string(),
            body_start: 999,
            body_end: 9999,
            is_arrow_expression: false,
            props_param: None,
            destructured_prop_names: vec![],
        };
        let result = find_interactive_components(&parsed.program, &[fake_component]);
        assert!(result.is_empty());
    }

    // ========== var declaration is not interactive ==========

    #[test]
    fn function_with_var_only_is_not_interactive() {
        let names =
            interactive_names("function Counter() { var count = 0; return <div>{count}</div>; }");
        assert!(names.is_empty());
    }

    // ========== non-component statements are skipped ==========

    #[test]
    fn non_component_statements_ignored() {
        let source = r#"
            const x = 1;
            if (true) {}
            function Counter() { let count = 0; return <div>{count}</div>; }
        "#;
        let names = interactive_names(source);
        assert_eq!(names, vec!["Counter"]);
    }
}
