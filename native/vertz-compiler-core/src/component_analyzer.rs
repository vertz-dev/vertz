use oxc_ast::ast::*;
use oxc_ast_visit::Visit;

/// Detected component function information.
pub struct ComponentInfo {
    pub name: String,
    pub body_start: u32,
    pub body_end: u32,
    /// Whether this component is an arrow function with expression body (no block).
    pub is_arrow_expression: bool,
    /// Props parameter name (e.g., "props"), or None if no params or destructured.
    pub props_param: Option<String>,
    /// Names of destructured props (e.g., ["title", "onClick"]).
    /// Empty if no destructured props or non-destructured parameter.
    pub destructured_prop_names: Vec<String>,
}

/// Analyze a program and detect function components (functions that return JSX).
pub fn analyze_components<'a>(program: &Program<'a>) -> Vec<ComponentInfo> {
    let mut components = Vec::new();

    for stmt in &program.body {
        collect_from_statement(stmt, &mut components);
    }

    components
}

fn collect_from_statement<'a>(stmt: &Statement<'a>, components: &mut Vec<ComponentInfo>) {
    match stmt {
        // function Foo() { return <div/>; }
        Statement::FunctionDeclaration(func) => {
            if let Some(ref id) = func.id {
                if let Some(ref body) = func.body {
                    if contains_jsx_in_body(body) {
                        components.push(ComponentInfo {
                            name: id.name.to_string(),
                            body_start: body.span.start,
                            body_end: body.span.end,
                            is_arrow_expression: false,
                            props_param: extract_props_param(&func.params),
                            destructured_prop_names: extract_destructured_prop_names(&func.params),
                        });
                    }
                }
            }
        }

        // const Foo = () => <div/>; OR const Foo = function() { ... };
        Statement::VariableDeclaration(var_decl) => {
            collect_from_var_decl(var_decl, components);
        }

        // export function Foo() { ... } OR export const Foo = () => ...
        Statement::ExportNamedDeclaration(export_decl) => {
            if let Some(ref decl) = export_decl.declaration {
                collect_from_declaration(decl, components);
            }
        }

        // export default function Foo() { ... }
        Statement::ExportDefaultDeclaration(export_default) => {
            if let ExportDefaultDeclarationKind::FunctionDeclaration(ref func) =
                export_default.declaration
            {
                if let Some(ref id) = func.id {
                    if let Some(ref body) = func.body {
                        if contains_jsx_in_body(body) {
                            components.push(ComponentInfo {
                                name: id.name.to_string(),
                                body_start: body.span.start,
                                body_end: body.span.end,
                                is_arrow_expression: false,
                                props_param: extract_props_param(&func.params),
                                destructured_prop_names: extract_destructured_prop_names(
                                    &func.params,
                                ),
                            });
                        }
                    }
                }
            }
        }

        _ => {}
    }
}

fn collect_from_declaration<'a>(decl: &Declaration<'a>, components: &mut Vec<ComponentInfo>) {
    match decl {
        Declaration::FunctionDeclaration(func) => {
            if let Some(ref id) = func.id {
                if let Some(ref body) = func.body {
                    if contains_jsx_in_body(body) {
                        components.push(ComponentInfo {
                            name: id.name.to_string(),
                            body_start: body.span.start,
                            body_end: body.span.end,
                            is_arrow_expression: false,
                            props_param: extract_props_param(&func.params),
                            destructured_prop_names: extract_destructured_prop_names(&func.params),
                        });
                    }
                }
            }
        }
        Declaration::VariableDeclaration(var_decl) => {
            collect_from_var_decl(var_decl, components);
        }
        _ => {}
    }
}

fn collect_from_var_decl<'a>(
    var_decl: &VariableDeclaration<'a>,
    components: &mut Vec<ComponentInfo>,
) {
    for declarator in &var_decl.declarations {
        if let BindingPattern::BindingIdentifier(ref id) = declarator.id {
            if let Some(ref init) = declarator.init {
                check_expression_for_component(init, &id.name, components);
            }
        }
    }
}

fn check_expression_for_component<'a>(
    expr: &Expression<'a>,
    name: &str,
    components: &mut Vec<ComponentInfo>,
) {
    match expr {
        // const Foo = () => <div/>;
        Expression::ArrowFunctionExpression(arrow) => {
            if arrow_contains_jsx(arrow) {
                let (start, end) = arrow_body_range(arrow);
                components.push(ComponentInfo {
                    name: name.to_string(),
                    body_start: start,
                    body_end: end,
                    is_arrow_expression: arrow.expression,
                    props_param: extract_props_param_from_items(&arrow.params.items),
                    destructured_prop_names: extract_destructured_props_from_items(
                        &arrow.params.items,
                    ),
                });
            }
        }

        // const Foo = function() { return <div/>; };
        Expression::FunctionExpression(func) => {
            if let Some(ref body) = func.body {
                if contains_jsx_in_body(body) {
                    components.push(ComponentInfo {
                        name: name.to_string(),
                        body_start: body.span.start,
                        body_end: body.span.end,
                        is_arrow_expression: false,
                        props_param: extract_props_param(&func.params),
                        destructured_prop_names: extract_destructured_prop_names(&func.params),
                    });
                }
            }
        }

        // Unwrap parentheses: const Foo = (() => <div/>);
        Expression::ParenthesizedExpression(paren) => {
            check_expression_for_component(&paren.expression, name, components);
        }

        // Unwrap TS type assertions: const Foo = (() => <div/>) as Component;
        Expression::TSAsExpression(ts_as) => {
            check_expression_for_component(&ts_as.expression, name, components);
        }
        Expression::TSSatisfiesExpression(ts_sat) => {
            check_expression_for_component(&ts_sat.expression, name, components);
        }

        _ => {}
    }
}

/// Extract the props parameter name from a FormalParameters node.
/// Returns Some("paramName") for simple identifier parameters, None for destructured or no params.
fn extract_props_param<'a>(params: &FormalParameters<'a>) -> Option<String> {
    extract_props_param_from_items(&params.items)
}

/// Extract the props parameter name from a list of FormalParameter items.
fn extract_props_param_from_items<'a>(items: &[FormalParameter<'a>]) -> Option<String> {
    if items.len() != 1 {
        return None;
    }
    if let BindingPattern::BindingIdentifier(ref id) = items[0].pattern {
        Some(id.name.to_string())
    } else {
        None // Destructured pattern
    }
}

/// Extract destructured prop names from a FormalParameters node.
/// Returns names like ["title", "onClick"] for `({ title, onClick }: Props)`.
fn extract_destructured_prop_names<'a>(params: &FormalParameters<'a>) -> Vec<String> {
    extract_destructured_props_from_items(&params.items)
}

fn extract_destructured_props_from_items<'a>(items: &[FormalParameter<'a>]) -> Vec<String> {
    if items.len() != 1 {
        return Vec::new();
    }
    if let BindingPattern::ObjectPattern(ref obj_pattern) = items[0].pattern {
        obj_pattern
            .properties
            .iter()
            .filter_map(|prop| {
                if let BindingPattern::BindingIdentifier(ref id) = prop.value {
                    Some(id.name.to_string())
                } else {
                    None
                }
            })
            .collect()
    } else {
        Vec::new()
    }
}

fn arrow_contains_jsx<'a>(arrow: &ArrowFunctionExpression<'a>) -> bool {
    contains_jsx_in_body(&arrow.body)
}

fn arrow_body_range<'a>(arrow: &ArrowFunctionExpression<'a>) -> (u32, u32) {
    (arrow.body.span.start, arrow.body.span.end)
}

fn contains_jsx_in_body<'a>(body: &FunctionBody<'a>) -> bool {
    let mut detector = JsxDetector { found: false };
    for stmt in &body.statements {
        detector.visit_statement(stmt);
        if detector.found {
            return true;
        }
    }
    detector.found
}

/// Simple visitor that checks if any JSX node exists in a subtree.
struct JsxDetector {
    found: bool,
}

impl<'a> Visit<'a> for JsxDetector {
    fn visit_jsx_element(&mut self, _elem: &JSXElement<'a>) {
        self.found = true;
    }

    fn visit_jsx_fragment(&mut self, _frag: &JSXFragment<'a>) {
        self.found = true;
    }
}
