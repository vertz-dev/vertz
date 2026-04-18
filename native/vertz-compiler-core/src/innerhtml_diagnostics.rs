use oxc_ast::ast::*;
use oxc_ast_visit::Visit;

use crate::component_analyzer::ComponentInfo;
use crate::utils::offset_to_line_column;

/// SVG tags that must use real child elements — `innerHTML` is unsupported.
/// Mirrors `packages/ui/src/dom/svg-tags.ts::SVG_TAGS`.
const SVG_TAGS: &[&str] = &[
    "svg",
    "path",
    "circle",
    "ellipse",
    "rect",
    "line",
    "polyline",
    "polygon",
    "g",
    "defs",
    "symbol",
    "use",
    "text",
    "tspan",
    "image",
    "foreignObject",
    "filter",
    "feGaussianBlur",
    "feOffset",
    "feColorMatrix",
    "feBlend",
    "feMerge",
    "feMergeNode",
    "feComposite",
    "feFlood",
    "linearGradient",
    "radialGradient",
    "stop",
    "pattern",
    "clipPath",
    "mask",
    "animate",
    "animateTransform",
    "set",
    "marker",
    "desc",
];

fn is_svg_tag(tag: &str) -> bool {
    SVG_TAGS.contains(&tag)
}

/// Detect raw-HTML injection misuse on JSX elements.
///
/// Emits four diagnostics:
/// - **E0761** — `innerHTML` together with JSX children.
/// - **E0762** — `dangerouslySetInnerHTML` attribute (React-only; rejected).
/// - **E0764** — `innerHTML` on an SVG element.
/// - **W0763** — `ref={(el) => { el.innerHTML = … }}` pattern (SSR-silent).
pub fn analyze_innerhtml(
    program: &Program,
    comp: &ComponentInfo,
    source: &str,
) -> Vec<crate::Diagnostic> {
    let mut visitor = InnerHtmlVisitor {
        comp,
        source,
        diagnostics: Vec::new(),
    };
    visitor.visit_program(program);
    visitor.diagnostics
}

struct InnerHtmlVisitor<'a> {
    comp: &'a ComponentInfo,
    source: &'a str,
    diagnostics: Vec<crate::Diagnostic>,
}

impl<'a> InnerHtmlVisitor<'a> {
    fn in_component(&self, start: u32, end: u32) -> bool {
        start >= self.comp.body_start && end <= self.comp.body_end
    }

    fn emit(&mut self, message: String, offset: u32) {
        let (line, column) = offset_to_line_column(self.source, offset as usize);
        self.diagnostics.push(crate::Diagnostic {
            message,
            line: Some(line),
            column: Some(column),
        });
    }
}

impl<'a, 'b> Visit<'b> for InnerHtmlVisitor<'a> {
    fn visit_jsx_element(&mut self, elem: &JSXElement<'b>) {
        let opening = &elem.opening_element;
        if !self.in_component(opening.span.start, opening.span.end) {
            oxc_ast_visit::walk::walk_jsx_element(self, elem);
            return;
        }

        let tag_name = jsx_element_tag(&opening.name);

        let mut has_inner_html = false;
        let mut inner_html_span: u32 = opening.span.start;

        for attr in &opening.attributes {
            let JSXAttributeItem::Attribute(named) = attr else {
                continue;
            };
            let name_text = match &named.name {
                JSXAttributeName::Identifier(id) => id.name.as_str(),
                JSXAttributeName::NamespacedName(_) => continue,
            };
            match name_text {
                "innerHTML" => {
                    has_inner_html = true;
                    inner_html_span = named.span.start;
                    if let Some(ref tag) = tag_name {
                        if is_svg_tag(tag) {
                            self.emit(
                                format!(
                                    "error[E0764]: 'innerHTML' is not supported on SVG elements (<{tag}>). \
                                     Use JSX children instead."
                                ),
                                named.span.start,
                            );
                        }
                    }
                }
                "dangerouslySetInnerHTML" => {
                    self.emit(
                        "error[E0762]: 'dangerouslySetInnerHTML' is a React prop. \
                         Vertz uses 'innerHTML={string}' directly. \
                         Pass the string value, not `{ __html: ... }`."
                            .to_string(),
                        named.span.start,
                    );
                }
                "ref" => {
                    if let Some(JSXAttributeValue::ExpressionContainer(container)) = &named.value {
                        if let Some(expr) = container.expression.as_expression() {
                            if ref_body_starts_with_inner_html(expr) {
                                self.emit(
                                    "warning[W0763]: Setting .innerHTML inside a ref callback doesn't \
                                     render during SSR and isn't reactive. \
                                     Use 'innerHTML={…}' instead."
                                        .to_string(),
                                    named.span.start,
                                );
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        if has_inner_html && has_non_empty_children(&elem.children) {
            let tag_label = tag_name.as_deref().unwrap_or("element");
            self.emit(
                format!(
                    "error[E0761]: <{tag_label}> has both 'innerHTML={{…}}' and JSX children. \
                     innerHTML replaces all children — delete the children, or delete innerHTML \
                     and use JSX instead."
                ),
                inner_html_span,
            );
        }

        oxc_ast_visit::walk::walk_jsx_element(self, elem);
    }
}

fn jsx_element_tag(name: &JSXElementName) -> Option<String> {
    match name {
        JSXElementName::Identifier(id) => Some(id.name.to_string()),
        JSXElementName::IdentifierReference(id) => Some(id.name.to_string()),
        JSXElementName::NamespacedName(ns) => {
            Some(format!("{}:{}", ns.namespace.name, ns.name.name))
        }
        JSXElementName::MemberExpression(_) | JSXElementName::ThisExpression(_) => None,
    }
}

/// True if the element has any JSX child that is not whitespace-only text
/// or an empty expression `{}`. Self-closing elements have no children at
/// the AST level (empty `children` vec).
fn has_non_empty_children(children: &oxc_allocator::Vec<JSXChild>) -> bool {
    for child in children {
        match child {
            JSXChild::Text(text) => {
                if text.value.chars().any(|c| !c.is_whitespace()) {
                    return true;
                }
            }
            JSXChild::ExpressionContainer(expr_container) => match &expr_container.expression {
                JSXExpression::EmptyExpression(_) => {}
                _ => return true,
            },
            JSXChild::Element(_) | JSXChild::Fragment(_) | JSXChild::Spread(_) => return true,
        }
    }
    false
}

/// Detect `(el) => { el.innerHTML = … }` or `(el) => el.innerHTML = …` where
/// the first statement of the body is the innerHTML assignment. Multi-
/// statement bodies that do other work first are intentionally NOT matched.
fn ref_body_starts_with_inner_html(expr: &Expression) -> bool {
    let Expression::ArrowFunctionExpression(arrow) = expr else {
        return false;
    };
    let Some(param_name) = first_param_name(arrow) else {
        return false;
    };

    if arrow.expression {
        // body is a single ExpressionStatement wrapping the expression
        if let Some(Statement::ExpressionStatement(stmt)) = arrow.body.statements.first() {
            return is_inner_html_assignment(&stmt.expression, &param_name);
        }
        return false;
    }

    match arrow.body.statements.first() {
        Some(Statement::ExpressionStatement(stmt)) => {
            is_inner_html_assignment(&stmt.expression, &param_name)
        }
        _ => false,
    }
}

fn first_param_name(arrow: &ArrowFunctionExpression) -> Option<String> {
    let item = arrow.params.items.first()?;
    if let BindingPattern::BindingIdentifier(id) = &item.pattern {
        Some(id.name.to_string())
    } else {
        None
    }
}

fn is_inner_html_assignment(expr: &Expression, param_name: &str) -> bool {
    let Expression::AssignmentExpression(assign) = expr else {
        return false;
    };
    let AssignmentTarget::StaticMemberExpression(member) = &assign.left else {
        return false;
    };
    if member.property.name != "innerHTML" {
        return false;
    }
    let Expression::Identifier(id) = &member.object else {
        return false;
    };
    id.name.as_str() == param_name
}

#[cfg(test)]
mod tests {
    use crate::{compile, CompileOptions};

    fn diag_codes(source: &str) -> Vec<String> {
        let result = compile(
            source,
            CompileOptions {
                filename: Some("test.tsx".to_string()),
                ..Default::default()
            },
        );
        result
            .diagnostics
            .unwrap_or_default()
            .into_iter()
            .map(|d| d.message)
            .collect()
    }

    fn has_code(diagnostics: &[String], code: &str) -> bool {
        diagnostics.iter().any(|m| m.contains(code))
    }

    // ── E0761: innerHTML + children ────────────────────────────────

    #[test]
    fn e0761_inner_html_with_text_children() {
        let msgs = diag_codes(
            r#"export function App() {
    return <pre innerHTML={x}>children</pre>;
}"#,
        );
        assert!(has_code(&msgs, "E0761"), "{:?}", msgs);
    }

    #[test]
    fn e0761_inner_html_with_jsx_children() {
        let msgs = diag_codes(
            r#"export function App() {
    return <div innerHTML={x}><span>y</span></div>;
}"#,
        );
        assert!(has_code(&msgs, "E0761"), "{:?}", msgs);
    }

    #[test]
    fn e0761_not_raised_for_self_closing() {
        let msgs = diag_codes(
            r#"export function App() {
    return <pre innerHTML={x} />;
}"#,
        );
        assert!(!has_code(&msgs, "E0761"), "{:?}", msgs);
    }

    #[test]
    fn e0761_not_raised_for_empty_pair() {
        let msgs = diag_codes(
            r#"export function App() {
    return <pre innerHTML={x}></pre>;
}"#,
        );
        assert!(!has_code(&msgs, "E0761"), "{:?}", msgs);
    }

    #[test]
    fn e0761_not_raised_for_whitespace_only_body() {
        let msgs = diag_codes(
            r#"export function App() {
    return <pre innerHTML={x}>
    </pre>;
}"#,
        );
        assert!(!has_code(&msgs, "E0761"), "{:?}", msgs);
    }

    // ── E0762: dangerouslySetInnerHTML ─────────────────────────────

    #[test]
    fn e0762_dangerously_set_inner_html_flagged() {
        let msgs = diag_codes(
            r#"export function App() {
    return <pre dangerouslySetInnerHTML={{ __html: x }} />;
}"#,
        );
        assert!(has_code(&msgs, "E0762"), "{:?}", msgs);
    }

    #[test]
    fn e0762_not_raised_for_normal_props() {
        let msgs = diag_codes(
            r#"export function App() {
    return <pre innerHTML={x} />;
}"#,
        );
        assert!(!has_code(&msgs, "E0762"), "{:?}", msgs);
    }

    // ── E0764: innerHTML on SVG ────────────────────────────────────

    #[test]
    fn e0764_svg_root_flagged() {
        let msgs = diag_codes(
            r#"export function App() {
    return <svg innerHTML={x} />;
}"#,
        );
        assert!(has_code(&msgs, "E0764"), "{:?}", msgs);
    }

    #[test]
    fn e0764_svg_path_flagged() {
        let msgs = diag_codes(
            r#"export function App() {
    return <path innerHTML={x} />;
}"#,
        );
        assert!(has_code(&msgs, "E0764"), "{:?}", msgs);
    }

    #[test]
    fn e0764_not_raised_for_html_element() {
        let msgs = diag_codes(
            r#"export function App() {
    return <div innerHTML={x} />;
}"#,
        );
        assert!(!has_code(&msgs, "E0764"), "{:?}", msgs);
    }

    // ── W0763: ref-body innerHTML pattern ──────────────────────────

    #[test]
    fn w0763_block_body_flagged() {
        let msgs = diag_codes(
            r#"export function App() {
    return <pre ref={(el) => { el.innerHTML = x; }} />;
}"#,
        );
        assert!(has_code(&msgs, "W0763"), "{:?}", msgs);
    }

    #[test]
    fn w0763_expression_body_flagged() {
        let msgs = diag_codes(
            r#"export function App() {
    return <pre ref={(el) => el.innerHTML = x} />;
}"#,
        );
        assert!(has_code(&msgs, "W0763"), "{:?}", msgs);
    }

    #[test]
    fn w0763_not_raised_when_first_stmt_is_not_inner_html() {
        let msgs = diag_codes(
            r#"export function App() {
    return <pre ref={(el) => { doSomething(); el.innerHTML = x; }} />;
}"#,
        );
        assert!(!has_code(&msgs, "W0763"), "{:?}", msgs);
    }

    #[test]
    fn w0763_not_raised_for_focus_ref() {
        let msgs = diag_codes(
            r#"export function App() {
    return <pre ref={(el) => { el.focus(); }} />;
}"#,
        );
        assert!(!has_code(&msgs, "W0763"), "{:?}", msgs);
    }
}
