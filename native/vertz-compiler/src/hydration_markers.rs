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
