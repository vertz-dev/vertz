use std::collections::{HashMap, HashSet};

use oxc_ast::ast::*;
use oxc_ast_visit::Visit;
use oxc_span::GetSpan;

use crate::component_analyzer::ComponentInfo;
use crate::magic_string::MagicString;
use crate::reactivity_analyzer::{ReactivityKind, VariableInfo};

/// Bundles all reactivity info the JSX transformer needs for deciding
/// between static and reactive codegen paths.
struct ReactivityContext {
    /// Names of signal/computed variables (their `.value` access is reactive)
    names: HashSet<String>,
    /// Signal API variables → their reactive property names
    /// (e.g., "tasks" → {"data", "loading", "error"})
    signal_api_props: HashMap<String, HashSet<String>>,
    /// Signal API variables that have field_signal_properties
    /// (e.g., form() — any `formVar.<fieldName>.<prop>.value` is reactive)
    field_signal_api_vars: HashSet<String>,
    /// Variables from reactive source APIs (e.g., useAuth(), useContext()).
    /// Any property access on these is reactive.
    reactive_sources: HashSet<String>,
    /// Callback-local reactive variables to inline: name → replacement expression.
    /// Set only when processing JSX inside a .map() callback with reactive locals.
    inline_locals: HashMap<String, String>,
    /// The component's __props parameter name (e.g., "__props").
    /// When set, __spread calls emit a third argument for reactive source:
    ///   __spread(el, rest, __props)
    /// Only set when the component had destructured props that were rewritten.
    props_param: Option<String>,
}

// ─── IDL properties ──────────────────────────────────────────────────────────

/// IDL properties that must use direct property assignment instead of setAttribute.
/// setAttribute doesn't reflect the displayed state for these after user interaction.
fn is_idl_property(tag_name: &str, attr_name: &str) -> bool {
    match tag_name {
        "input" => attr_name == "value" || attr_name == "checked",
        "select" | "textarea" => attr_name == "value",
        _ => false,
    }
}

/// Boolean IDL properties — boolean shorthand emits `.prop = true`.
fn is_boolean_idl_property(attr_name: &str) -> bool {
    attr_name == "checked"
}

/// Transform all JSX in a component body into DOM helper calls.
pub fn transform_jsx(
    ms: &mut MagicString,
    program: &Program,
    component: &ComponentInfo,
    variables: &[VariableInfo],
    hydration_id: Option<&str>,
) {
    let rx = ReactivityContext {
        names: variables
            .iter()
            .filter(|v| v.kind == ReactivityKind::Signal || v.kind == ReactivityKind::Computed)
            .map(|v| v.name.clone())
            .collect(),
        signal_api_props: variables
            .iter()
            .filter_map(|v| {
                v.signal_properties
                    .as_ref()
                    .map(|props| (v.name.clone(), props.iter().cloned().collect()))
            })
            .collect(),
        field_signal_api_vars: variables
            .iter()
            .filter(|v| v.field_signal_properties.is_some())
            .map(|v| v.name.clone())
            .collect(),
        reactive_sources: variables
            .iter()
            .filter(|v| v.is_reactive_source)
            .map(|v| v.name.clone())
            .collect(),
        inline_locals: HashMap::new(),
        // If the component had destructured props, transform_props rewrote them to __props.
        // Pass __props as the reactive source for __spread calls.
        props_param: if !component.destructured_prop_names.is_empty() {
            Some("__props".to_string())
        } else {
            None
        },
    };

    let mut counter = 0;

    // Find all top-level JSX nodes in the component body and transform them.
    // Nodes are collected depth-first, so inner (callback) JSX comes after outer JSX.
    // We process in REVERSE order so that inner JSX is transformed first — its IIFE
    // is then visible via get_transformed_slice() when the outer JSX reads expression text.
    let mut jsx_nodes = collect_top_level_jsx(program, component);
    jsx_nodes.reverse();

    // The first JSX node in source order (last after reverse) gets the hydration marker.
    // We use `is_first_root` to track this.
    let mut hydration_used = false;

    for jsx_info in &jsx_nodes {
        let mut transformed = transform_jsx_node(
            ms,
            program,
            jsx_info.start,
            jsx_info.end,
            &jsx_info.kind,
            &rx,
            &mut counter,
        );

        // Inject hydration marker into the first root element's IIFE.
        // The IIFE looks like: (() => { const __el0 = __element("tag"); ... return __el0; })()
        // We inject: __el0.setAttribute("data-v-id", "Name");
        if !hydration_used {
            if let Some(id) = hydration_id {
                if let Some(injected) = inject_hydration_attr(&transformed, id) {
                    transformed = injected;
                    hydration_used = true;
                }
            }
        }

        ms.overwrite(jsx_info.start, jsx_info.end, &transformed);
    }
}

/// Inject a `data-v-id` setAttribute call into the first __element() IIFE.
fn inject_hydration_attr(code: &str, component_name: &str) -> Option<String> {
    // Find pattern: `const __elN = __element("tag")`
    // Insert after the semicolon: `__elN.setAttribute("data-v-id", "Name");`
    let el_prefix = "const __el";
    let pos = code.find(el_prefix)?;
    let after = &code[pos..];

    // Extract the variable name (e.g., "__el0")
    let eq_pos = after.find(" = __element(")?;
    let var_name = &after[6..eq_pos]; // skip "const "
    let full_var = format!("__el{}", var_name);

    // Find the end of this statement (the semicolon after __element(...))
    let stmt_end = after.find("__element(")?;
    let rest = &after[stmt_end..];
    let paren_end = rest.find(')')?;
    let insert_pos = pos + stmt_end + paren_end + 1;

    // Check if there's already a semicolon
    let insert_text = format!(
        ";\n  {}.setAttribute(\"data-v-id\", \"{}\")",
        full_var, component_name
    );

    let mut result = String::with_capacity(code.len() + insert_text.len());
    result.push_str(&code[..insert_pos]);
    result.push_str(&insert_text);
    result.push_str(&code[insert_pos..]);
    Some(result)
}

// ─── JSX node collection ────────────────────────────────────────────────────

#[derive(Debug)]
struct JsxNodeInfo {
    start: u32,
    end: u32,
    kind: JsxNodeKind,
}

#[derive(Debug)]
enum JsxNodeKind {
    Element,
    Fragment,
}

fn collect_top_level_jsx(program: &Program, component: &ComponentInfo) -> Vec<JsxNodeInfo> {
    let mut collector = JsxCollector {
        component,
        nodes: Vec::new(),
        in_component: false,
        in_jsx: false,
        in_list_callback: 0,
    };
    for stmt in &program.body {
        collector.visit_statement(stmt);
    }
    collector.nodes
}

struct JsxCollector<'a> {
    component: &'a ComponentInfo,
    nodes: Vec<JsxNodeInfo>,
    in_component: bool,
    in_jsx: bool,
    /// Depth counter for .map() callback nesting. When > 0, arrow functions
    /// inside JSX should NOT reset `in_jsx`, because the List handler will
    /// transform inner JSX directly via `transform_jsx_node`.
    in_list_callback: u32,
}

impl<'a> JsxCollector<'a> {
    fn is_in_component(&self, start: u32, end: u32) -> bool {
        start >= self.component.body_start && end <= self.component.body_end
    }
}

impl<'a, 'c> Visit<'c> for JsxCollector<'a> {
    fn visit_call_expression(&mut self, call: &CallExpression<'c>) {
        // Detect .map() calls inside JSX — their callback JSX should NOT be
        // collected as separate top-level nodes. The List handler in transform_child
        // will transform inner JSX directly via transform_jsx_node.
        if self.in_component && self.in_jsx {
            let is_map = if let Expression::StaticMemberExpression(member) = &call.callee {
                member.property.name == "map"
            } else if let Some(MemberExpression::StaticMemberExpression(member)) =
                call.callee.as_member_expression()
            {
                member.property.name == "map"
            } else {
                false
            };
            if is_map {
                self.in_list_callback += 1;
                oxc_ast_visit::walk::walk_call_expression(self, call);
                self.in_list_callback -= 1;
                return;
            }
        }
        oxc_ast_visit::walk::walk_call_expression(self, call);
    }

    fn visit_function(&mut self, func: &Function<'c>, flags: oxc_syntax::scope::ScopeFlags) {
        let span = func.span;
        if span.start <= self.component.body_start && span.end >= self.component.body_end {
            let was = self.in_component;
            self.in_component = true;
            oxc_ast_visit::walk::walk_function(self, func, flags);
            self.in_component = was;
            return;
        }
        if self.in_component && self.is_in_component(span.start, span.end) {
            // Nested function inside component — if we're inside JSX, reset in_jsx
            // so that JSX inside callback expressions is collected separately.
            // But NOT inside .map() callbacks — those are handled by the List transform.
            let was_in_jsx = self.in_jsx;
            if self.in_jsx && self.in_list_callback == 0 {
                self.in_jsx = false;
            }
            oxc_ast_visit::walk::walk_function(self, func, flags);
            self.in_jsx = was_in_jsx;
            return;
        }
        oxc_ast_visit::walk::walk_function(self, func, flags);
    }

    fn visit_arrow_function_expression(&mut self, func: &ArrowFunctionExpression<'c>) {
        let span = func.span;
        if span.start <= self.component.body_start && span.end >= self.component.body_end {
            let was = self.in_component;
            self.in_component = true;
            oxc_ast_visit::walk::walk_arrow_function_expression(self, func);
            self.in_component = was;
            return;
        }
        if self.in_component && self.is_in_component(span.start, span.end) {
            // Nested arrow inside component — if we're inside JSX, reset in_jsx
            // so that JSX inside callback expressions (Array.from, .filter, etc.)
            // is collected as a separate node to be transformed independently.
            // But NOT inside .map() callbacks — those are handled by the List transform.
            let was_in_jsx = self.in_jsx;
            if self.in_jsx && self.in_list_callback == 0 {
                self.in_jsx = false;
            }
            oxc_ast_visit::walk::walk_arrow_function_expression(self, func);
            self.in_jsx = was_in_jsx;
            return;
        }
        oxc_ast_visit::walk::walk_arrow_function_expression(self, func);
    }

    fn visit_jsx_element(&mut self, elem: &JSXElement<'c>) {
        if !self.in_component {
            return;
        }
        if !self.in_jsx {
            // Top-level JSX element
            self.nodes.push(JsxNodeInfo {
                start: elem.span.start,
                end: elem.span.end,
                kind: JsxNodeKind::Element,
            });
            // Don't recurse — children are handled by transform
            let was = self.in_jsx;
            self.in_jsx = true;
            oxc_ast_visit::walk::walk_jsx_element(self, elem);
            self.in_jsx = was;
        }
        // If already in JSX, skip — nested JSX is handled by the transform
    }

    fn visit_jsx_fragment(&mut self, frag: &JSXFragment<'c>) {
        if !self.in_component {
            return;
        }
        if !self.in_jsx {
            self.nodes.push(JsxNodeInfo {
                start: frag.span.start,
                end: frag.span.end,
                kind: JsxNodeKind::Fragment,
            });
            let was = self.in_jsx;
            self.in_jsx = true;
            oxc_ast_visit::walk::walk_jsx_fragment(self, frag);
            self.in_jsx = was;
        }
    }
}

// ─── JSX transformation ─────────────────────────────────────────────────────

fn transform_jsx_node(
    ms: &MagicString,
    program: &Program,
    start: u32,
    end: u32,
    kind: &JsxNodeKind,
    rx: &ReactivityContext,
    counter: &mut u32,
) -> String {
    match kind {
        JsxNodeKind::Element => {
            let mut finder = ElementFinder {
                target_start: start,
                target_end: end,
                result: None,
            };
            for stmt in &program.body {
                finder.visit_statement(stmt);
                if finder.result.is_some() {
                    break;
                }
            }
            if let Some(info) = finder.result {
                transform_element(ms, program, &info, rx, counter)
            } else {
                ms.slice(start, end).to_string()
            }
        }
        JsxNodeKind::Fragment => {
            let mut finder = FragmentFinder {
                target_start: start,
                target_end: end,
                result: None,
            };
            for stmt in &program.body {
                finder.visit_statement(stmt);
                if finder.result.is_some() {
                    break;
                }
            }
            if let Some(info) = finder.result {
                transform_fragment(ms, program, &info, rx, counter)
            } else {
                ms.slice(start, end).to_string()
            }
        }
    }
}

// ─── AST finders ─────────────────────────────────────────────────────────────

// ─── Element info extraction ─────────────────────────────────────────────────

#[derive(Debug)]
struct ElementInfo {
    tag_name: String,
    is_component: bool,
    attrs: Vec<AttrInfo>,
    children: Vec<ChildInfo>,
}

#[derive(Debug)]
enum AttrInfo {
    Static {
        name: String,
        value: String,
    },
    Expression {
        name: String,
        expr_start: u32,
        expr_end: u32,
        is_reactive: bool,
    },
    BooleanShorthand {
        name: String,
    },
    Spread {
        expr_start: u32,
        expr_end: u32,
    },
}

#[derive(Debug)]
enum ChildInfo {
    Text(String),
    Expression {
        /// Start/end of inner expression (excluding { })
        expr_start: u32,
        expr_end: u32,
        is_literal: bool,
        expr_kind: ExprKind,
    },
    Element(ElementInfo),
    Fragment(FragmentInfo),
}

#[derive(Debug)]
enum ExprKind {
    Normal,
    Conditional {
        cond_start: u32,
        cond_end: u32,
        true_start: u32,
        true_end: u32,
        true_is_jsx: bool,
        false_start: u32,
        false_end: u32,
        false_is_jsx: bool,
    },
    LogicalAnd {
        left_start: u32,
        left_end: u32,
        right_start: u32,
        right_end: u32,
        right_is_jsx: bool,
    },
    List {
        source_start: u32,
        source_end: u32,
        callback_body_start: u32,
        callback_body_end: u32,
        item_param: String,
        index_param: Option<String>,
        key_expr: Option<String>,
        /// Const declarations inside block body callbacks: (name, init_start, init_end).
        /// Used to detect reactive callback-local variables that need inlining.
        callback_locals: Vec<(String, u32, u32)>,
    },
}

#[derive(Debug)]
struct FragmentInfo {
    children: Vec<ChildInfo>,
}

struct ElementFinder {
    target_start: u32,
    target_end: u32,
    result: Option<ElementInfo>,
}

impl<'c> Visit<'c> for ElementFinder {
    fn visit_jsx_element(&mut self, elem: &JSXElement<'c>) {
        if elem.span.start == self.target_start && elem.span.end == self.target_end {
            self.result = Some(extract_element_info(elem));
            return;
        }
        oxc_ast_visit::walk::walk_jsx_element(self, elem);
    }

    fn visit_jsx_fragment(&mut self, frag: &JSXFragment<'c>) {
        // Must recurse into fragments — elements can be children of fragments,
        // e.g. when a && conditional inside a fragment contains a <div>.
        oxc_ast_visit::walk::walk_jsx_fragment(self, frag);
    }
}

struct FragmentFinder {
    target_start: u32,
    target_end: u32,
    result: Option<FragmentInfo>,
}

impl<'c> Visit<'c> for FragmentFinder {
    fn visit_jsx_fragment(&mut self, frag: &JSXFragment<'c>) {
        if frag.span.start == self.target_start && frag.span.end == self.target_end {
            self.result = Some(extract_fragment_info(frag));
            return;
        }
        oxc_ast_visit::walk::walk_jsx_fragment(self, frag);
    }
}

fn extract_element_info(elem: &JSXElement) -> ElementInfo {
    let tag_name = extract_tag_name(&elem.opening_element);
    let is_component = tag_name.starts_with(|c: char| c.is_ascii_uppercase());
    let attrs = extract_attrs(&elem.opening_element);
    let children = extract_children(&elem.children);

    ElementInfo {
        tag_name,
        is_component,
        attrs,
        children,
    }
}

fn extract_fragment_info(frag: &JSXFragment) -> FragmentInfo {
    let children = extract_children(&frag.children);
    FragmentInfo { children }
}

fn extract_tag_name(opening: &JSXOpeningElement) -> String {
    match &opening.name {
        JSXElementName::Identifier(id) => id.name.to_string(),
        JSXElementName::IdentifierReference(id) => id.name.to_string(),
        JSXElementName::NamespacedName(ns) => {
            format!("{}:{}", ns.namespace.name, ns.name.name)
        }
        JSXElementName::MemberExpression(member) => jsx_member_expr_name(member),
        JSXElementName::ThisExpression(_) => "this".to_string(),
    }
}

fn jsx_member_expr_name(member: &JSXMemberExpression) -> String {
    let obj = match &member.object {
        JSXMemberExpressionObject::IdentifierReference(id) => id.name.to_string(),
        JSXMemberExpressionObject::MemberExpression(inner) => jsx_member_expr_name(inner),
        JSXMemberExpressionObject::ThisExpression(_) => "this".to_string(),
    };
    format!("{}.{}", obj, member.property.name)
}

fn extract_attrs(opening: &JSXOpeningElement) -> Vec<AttrInfo> {
    let mut attrs = Vec::new();
    for attr in &opening.attributes {
        match attr {
            JSXAttributeItem::Attribute(jsx_attr) => {
                let name = match &jsx_attr.name {
                    JSXAttributeName::Identifier(id) => id.name.to_string(),
                    JSXAttributeName::NamespacedName(ns) => {
                        format!("{}:{}", ns.namespace.name, ns.name.name)
                    }
                };

                match &jsx_attr.value {
                    None => {
                        attrs.push(AttrInfo::BooleanShorthand { name });
                    }
                    Some(JSXAttributeValue::StringLiteral(s)) => {
                        attrs.push(AttrInfo::Static {
                            name,
                            value: s.value.to_string(),
                        });
                    }
                    Some(JSXAttributeValue::ExpressionContainer(expr_container)) => {
                        match &expr_container.expression {
                            JSXExpression::EmptyExpression(_) => {}
                            _ => {
                                let (expr_start, expr_end) =
                                    jsx_expr_span(&expr_container.expression);
                                let is_literal = is_jsx_expr_literal(&expr_container.expression);
                                attrs.push(AttrInfo::Expression {
                                    name,
                                    expr_start,
                                    expr_end,
                                    is_reactive: !is_literal,
                                });
                            }
                        }
                    }
                    Some(JSXAttributeValue::Element(_)) | Some(JSXAttributeValue::Fragment(_)) => {
                        // JSX as attribute value — rare but valid
                    }
                }
            }
            JSXAttributeItem::SpreadAttribute(spread) => {
                let span = spread.argument.span();
                attrs.push(AttrInfo::Spread {
                    expr_start: span.start,
                    expr_end: span.end,
                });
            }
        }
    }
    attrs
}

fn jsx_expr_span(expr: &JSXExpression) -> (u32, u32) {
    match expr {
        JSXExpression::EmptyExpression(e) => (e.span.start, e.span.end),
        _ => {
            let expr_inner = match expr {
                JSXExpression::BooleanLiteral(e) => (e.span.start, e.span.end),
                JSXExpression::NullLiteral(e) => (e.span.start, e.span.end),
                JSXExpression::NumericLiteral(e) => (e.span.start, e.span.end),
                JSXExpression::BigIntLiteral(e) => (e.span.start, e.span.end),
                JSXExpression::RegExpLiteral(e) => (e.span.start, e.span.end),
                JSXExpression::StringLiteral(e) => (e.span.start, e.span.end),
                JSXExpression::TemplateLiteral(e) => (e.span.start, e.span.end),
                _ => {
                    // For complex expressions, get span from the Expression enum
                    if let Some(e) = expr.as_expression() {
                        (e.span().start, e.span().end)
                    } else {
                        (0, 0)
                    }
                }
            };
            expr_inner
        }
    }
}

fn is_jsx_expr_literal(expr: &JSXExpression) -> bool {
    matches!(
        expr,
        JSXExpression::BooleanLiteral(_)
            | JSXExpression::NullLiteral(_)
            | JSXExpression::NumericLiteral(_)
            | JSXExpression::StringLiteral(_)
    )
}

fn extract_children(children: &oxc_allocator::Vec<JSXChild>) -> Vec<ChildInfo> {
    let mut result = Vec::new();
    for child in children {
        match child {
            JSXChild::Text(text) => {
                let cleaned = clean_jsx_text(&text.value);
                if !cleaned.is_empty() {
                    result.push(ChildInfo::Text(cleaned));
                }
            }
            JSXChild::ExpressionContainer(expr_container) => match &expr_container.expression {
                JSXExpression::EmptyExpression(_) => {}
                _ => {
                    let (expr_start, expr_end) = jsx_expr_span(&expr_container.expression);
                    let is_literal = is_jsx_expr_literal(&expr_container.expression);
                    let expr_kind = classify_expression(&expr_container.expression);
                    result.push(ChildInfo::Expression {
                        expr_start,
                        expr_end,
                        is_literal,
                        expr_kind,
                    });
                }
            },
            JSXChild::Element(elem) => {
                result.push(ChildInfo::Element(extract_element_info(elem)));
            }
            JSXChild::Fragment(frag) => {
                result.push(ChildInfo::Fragment(extract_fragment_info(frag)));
            }
            JSXChild::Spread(_) => {
                // JSX spread children — not common
            }
        }
    }
    result
}

fn classify_expression(expr: &JSXExpression) -> ExprKind {
    if let Some(e) = expr.as_expression() {
        classify_inner_expression(e)
    } else {
        ExprKind::Normal
    }
}

/// Try to classify a CallExpression as a .map() list pattern.
fn classify_map_call(call: &CallExpression) -> Option<ExprKind> {
    // Check callee: could be StaticMemberExpression directly, or via as_member_expression()
    let member = if let Expression::StaticMemberExpression(m) = &call.callee {
        Some(m.as_ref())
    } else if let Some(MemberExpression::StaticMemberExpression(m)) =
        call.callee.as_member_expression()
    {
        Some(&**m)
    } else {
        None
    };

    let member = member?;
    if member.property.name != "map" || call.arguments.is_empty() {
        return None;
    }

    let arrow = match call.arguments.first() {
        Some(Argument::ArrowFunctionExpression(a)) => a,
        _ => return None,
    };

    let item_param = arrow.params.items.first().and_then(|p| {
        if let BindingPattern::BindingIdentifier(id) = &p.pattern {
            Some(id.name.to_string())
        } else {
            None
        }
    })?;

    let index_param: Option<String> = arrow.params.items.get(1).and_then(|p| {
        if let BindingPattern::BindingIdentifier(id) = &p.pattern {
            Some(id.name.to_string())
        } else {
            None
        }
    });

    let source_start = member.object.span().start;
    let source_end = member.object.span().end;

    let key_expr = extract_key_from_arrow_body(&arrow.body, &item_param);

    let body_stmts = &arrow.body.statements;
    let (cb_start, cb_end) = if arrow.expression {
        if let Some(Statement::ExpressionStatement(es)) = body_stmts.first() {
            (es.expression.span().start, es.expression.span().end)
        } else {
            (arrow.body.span.start, arrow.body.span.end)
        }
    } else {
        (arrow.body.span.start, arrow.body.span.end)
    };

    // Extract const declarations from block body callbacks
    let callback_locals = if !arrow.expression {
        extract_callback_locals(body_stmts)
    } else {
        Vec::new()
    };

    Some(ExprKind::List {
        source_start,
        source_end,
        callback_body_start: cb_start,
        callback_body_end: cb_end,
        item_param,
        index_param,
        key_expr,
        callback_locals,
    })
}

/// Extract const declarations from a block body callback's statements.
/// Returns (variable_name, initializer_start, initializer_end) tuples.
fn extract_callback_locals(stmts: &[Statement]) -> Vec<(String, u32, u32)> {
    let mut locals = Vec::new();
    for stmt in stmts {
        if let Statement::VariableDeclaration(var_decl) = stmt {
            if var_decl.kind == VariableDeclarationKind::Const {
                for declarator in &var_decl.declarations {
                    if let BindingPattern::BindingIdentifier(id) = &declarator.id {
                        if let Some(ref init) = declarator.init {
                            locals.push((id.name.to_string(), init.span().start, init.span().end));
                        }
                    }
                }
            }
        }
    }
    locals
}

fn classify_inner_expression(expr: &Expression) -> ExprKind {
    match expr {
        Expression::ConditionalExpression(cond) => {
            let true_is_jsx = is_jsx_expression(&cond.consequent);
            let false_is_jsx = is_jsx_expression(&cond.alternate);
            // Always classify ternaries as Conditional — even when both branches
            // are non-JSX (e.g., string literals). The condition may reference
            // reactive variables, and __conditional() handles both JSX and text branches.
            // This matches ts-morph behavior which wraps ALL ternaries in JSX children.
            ExprKind::Conditional {
                cond_start: cond.test.span().start,
                cond_end: cond.test.span().end,
                true_start: cond.consequent.span().start,
                true_end: cond.consequent.span().end,
                true_is_jsx,
                false_start: cond.alternate.span().start,
                false_end: cond.alternate.span().end,
                false_is_jsx,
            }
        }
        Expression::LogicalExpression(logical) if logical.operator == LogicalOperator::And => {
            let right_is_jsx = is_jsx_expression(&logical.right);
            // Always classify logical AND as LogicalAnd — the left side (condition)
            // may reference reactive variables, and __conditional() handles both
            // JSX and non-JSX right-hand sides.
            ExprKind::LogicalAnd {
                left_start: logical.left.span().start,
                left_end: logical.left.span().end,
                right_start: logical.right.span().start,
                right_end: logical.right.span().end,
                right_is_jsx,
            }
        }
        Expression::CallExpression(call) => classify_map_call(call).unwrap_or(ExprKind::Normal),
        Expression::ChainExpression(chain) => {
            // Handle optional chaining: projects.data?.items.map(...)
            if let ChainElement::CallExpression(call) = &chain.expression {
                classify_map_call(call).unwrap_or(ExprKind::Normal)
            } else {
                ExprKind::Normal
            }
        }
        Expression::ParenthesizedExpression(paren) => classify_inner_expression(&paren.expression),
        _ => ExprKind::Normal,
    }
}

fn is_jsx_expression(expr: &Expression) -> bool {
    matches!(expr, Expression::JSXElement(_) | Expression::JSXFragment(_))
        || matches!(expr, Expression::ParenthesizedExpression(p) if is_jsx_expression(&p.expression))
}

fn extract_key_from_arrow_body(body: &FunctionBody, _item_param: &str) -> Option<String> {
    // Walk the body to find a JSX element with a key prop
    for stmt in &body.statements {
        if let Statement::ExpressionStatement(es) = stmt {
            if let Some(key) = extract_key_from_expr(&es.expression) {
                return Some(key);
            }
        }
        if let Statement::ReturnStatement(ret) = stmt {
            if let Some(ref arg) = ret.argument {
                if let Some(key) = extract_key_from_expr(arg) {
                    return Some(key);
                }
            }
        }
    }
    None
}

fn extract_key_from_expr(expr: &Expression) -> Option<String> {
    match expr {
        Expression::JSXElement(elem) => extract_key_from_jsx_attrs(&elem.opening_element),
        Expression::ParenthesizedExpression(p) => extract_key_from_expr(&p.expression),
        _ => None,
    }
}

fn extract_key_from_jsx_attrs(opening: &JSXOpeningElement) -> Option<String> {
    for attr in &opening.attributes {
        if let JSXAttributeItem::Attribute(jsx_attr) = attr {
            let name = match &jsx_attr.name {
                JSXAttributeName::Identifier(id) => id.name.as_str(),
                _ => continue,
            };
            if name != "key" {
                continue;
            }
            if let Some(JSXAttributeValue::ExpressionContainer(expr_container)) = &jsx_attr.value {
                if let Some(inner) = expr_container.expression.as_expression() {
                    // Return the raw text — we'll need MagicString for transformed text
                    return Some(format_expr_text(inner));
                }
            }
        }
    }
    None
}

fn format_expr_text(expr: &Expression) -> String {
    match expr {
        Expression::StaticMemberExpression(member) => {
            let obj = format_expr_text(&member.object);
            format!("{}.{}", obj, member.property.name)
        }
        Expression::Identifier(id) => id.name.to_string(),
        _ => String::new(),
    }
}

// ─── Code generation ─────────────────────────────────────────────────────────

fn transform_element(
    ms: &MagicString,
    program: &Program,
    info: &ElementInfo,
    rx: &ReactivityContext,
    counter: &mut u32,
) -> String {
    if info.is_component {
        return transform_component(ms, program, info, rx, counter);
    }

    let el_var = gen_var(counter);
    let mut stmts: Vec<String> = Vec::new();

    stmts.push(format!(
        "const {} = __element({})",
        el_var,
        json_quote(&info.tag_name)
    ));

    // Process attributes
    for attr in &info.attrs {
        if let Some(stmt) = process_attr(ms, attr, &el_var, &info.tag_name, rx) {
            stmts.push(stmt);
        }
    }

    // Process children
    let has_children = !info.children.is_empty();
    if has_children {
        stmts.push(format!("__enterChildren({})", el_var));
    }

    for child in &info.children {
        if let Some(stmt) = transform_child(ms, program, child, &el_var, rx, counter) {
            stmts.push(stmt);
        }
    }

    if has_children {
        stmts.push("__exitChildren()".to_string());
    }

    format!(
        "(() => {{\n{}\n  return {};\n}})()",
        stmts
            .iter()
            .map(|s| format!("  {};", s))
            .collect::<Vec<_>>()
            .join("\n"),
        el_var
    )
}

fn transform_component(
    ms: &MagicString,
    program: &Program,
    info: &ElementInfo,
    rx: &ReactivityContext,
    counter: &mut u32,
) -> String {
    let mut props: Vec<String> = Vec::new();

    for attr in &info.attrs {
        match attr {
            AttrInfo::Static { name, value } => {
                if name == "key" {
                    continue;
                }
                props.push(format!("{}: {}", quote_prop_key(name), json_quote(value)));
            }
            AttrInfo::Expression {
                name,
                expr_start,
                expr_end,
                is_reactive,
            } => {
                if name == "key" {
                    continue;
                }
                // Use slice_with_transformed_jsx to handle JSX nested inside prop values
                // (e.g., fallback={() => <div>Not found</div>})
                let expr_text =
                    slice_with_transformed_jsx(ms, program, *expr_start, *expr_end, rx, counter);
                // For component props, ALL non-literal expressions become getters.
                // This is by design: getter-backed props enable cross-component
                // reactivity — the child reads lazily when signals change.
                if *is_reactive {
                    props.push(format!(
                        "get {}() {{ return {}; }}",
                        quote_getter_key(name),
                        expr_text
                    ));
                } else {
                    props.push(format!("{}: {}", quote_prop_key(name), expr_text));
                }
            }
            AttrInfo::BooleanShorthand { name } => {
                if name == "key" {
                    continue;
                }
                props.push(format!("{}: true", quote_prop_key(name)));
            }
            AttrInfo::Spread {
                expr_start,
                expr_end,
            } => {
                let expr_text = ms.get_transformed_slice(*expr_start, *expr_end);
                props.push(format!("...{}", expr_text));
            }
        }
    }

    // Handle children
    if !info.children.is_empty() {
        let non_empty: Vec<&ChildInfo> = info
            .children
            .iter()
            .filter(|c| match c {
                ChildInfo::Text(t) => !t.is_empty(),
                _ => true,
            })
            .collect();

        if !non_empty.is_empty() {
            let children_thunk = build_children_thunk(ms, program, &non_empty, rx, counter);
            if !children_thunk.is_empty() {
                props.push(format!("children: {}", children_thunk));
            }
        }
    }

    if props.is_empty() {
        format!("{}({{}})", info.tag_name)
    } else {
        format!("{}({{ {} }})", info.tag_name, props.join(", "))
    }
}

fn build_children_thunk(
    ms: &MagicString,
    program: &Program,
    children: &[&ChildInfo],
    rx: &ReactivityContext,
    counter: &mut u32,
) -> String {
    let mut values: Vec<String> = Vec::new();

    for child in children {
        if let Some(v) = transform_child_as_value(ms, program, child, rx, counter) {
            values.push(v);
        }
    }

    if values.is_empty() {
        return String::new();
    }
    if values.len() == 1 {
        return format!("() => {}", values[0]);
    }
    format!("() => [{}]", values.join(", "))
}

fn transform_child_as_value(
    ms: &MagicString,
    program: &Program,
    child: &ChildInfo,
    rx: &ReactivityContext,
    counter: &mut u32,
) -> Option<String> {
    match child {
        ChildInfo::Text(text) => Some(format!("__staticText({})", json_quote(text))),
        ChildInfo::Expression {
            expr_start,
            expr_end,
            is_literal,
            expr_kind,
            ..
        } => {
            // Conditionals
            if let ExprKind::Conditional { .. } = expr_kind {
                return Some(transform_conditional_code(
                    ms, program, expr_kind, rx, counter,
                ));
            }
            if let ExprKind::LogicalAnd { .. } = expr_kind {
                return Some(transform_conditional_code(
                    ms, program, expr_kind, rx, counter,
                ));
            }

            // List in component children → __listValue
            if let ExprKind::List {
                source_start,
                source_end,
                callback_body_start,
                callback_body_end,
                item_param,
                index_param,
                key_expr,
                callback_locals,
            } = expr_kind
            {
                let source_text = ms.get_transformed_slice(*source_start, *source_end);
                let key_fn = build_key_fn(key_expr, item_param, index_param.as_deref());

                // Build inline_locals for reactive callback-local variables
                let extended_rx = build_extended_rx_for_list(ms, callback_locals, rx);

                let render_body = {
                    let body_jsx =
                        find_jsx_in_span(program, *callback_body_start, *callback_body_end);
                    if let Some(jsx) = body_jsx {
                        let jsx_code = transform_jsx_node(
                            ms,
                            program,
                            jsx.start,
                            jsx.end,
                            &jsx.kind,
                            &extended_rx,
                            counter,
                        );
                        // For block body callbacks, include full body with pre-return code
                        if !callback_locals.is_empty() {
                            let before = ms.get_transformed_slice(*callback_body_start, jsx.start);
                            let after = ms.get_transformed_slice(jsx.end, *callback_body_end);
                            format!("{}{}{}", before, jsx_code, after)
                        } else {
                            jsx_code
                        }
                    } else {
                        ms.get_transformed_slice(*callback_body_start, *callback_body_end)
                    }
                };

                let render_fn = format!("({}) => {}", item_param, render_body);
                return Some(format!(
                    "__listValue(() => {}, {}, {})",
                    source_text, key_fn, render_fn
                ));
            }

            let expr_text = ms.get_transformed_slice(*expr_start, *expr_end);
            let is_truly_reactive =
                !is_literal && is_expr_reactive_in_scope(ms, *expr_start, *expr_end, rx);
            if is_truly_reactive {
                let expr_text = apply_inline_subs(&expr_text, rx);
                Some(format!("__child(() => {})", expr_text))
            } else {
                Some(expr_text)
            }
        }
        ChildInfo::Element(info) => Some(transform_element(ms, program, info, rx, counter)),
        ChildInfo::Fragment(info) => Some(transform_fragment(ms, program, info, rx, counter)),
    }
}

fn transform_fragment(
    ms: &MagicString,
    program: &Program,
    info: &FragmentInfo,
    rx: &ReactivityContext,
    counter: &mut u32,
) -> String {
    let frag_var = gen_var(counter);
    let mut stmts: Vec<String> = Vec::new();

    stmts.push(format!(
        "const {} = document.createDocumentFragment()",
        frag_var
    ));

    for child in &info.children {
        if let Some(stmt) = transform_child(ms, program, child, &frag_var, rx, counter) {
            stmts.push(stmt);
        }
    }

    format!(
        "(() => {{\n{}\n  return {};\n}})()",
        stmts
            .iter()
            .map(|s| format!("  {};", s))
            .collect::<Vec<_>>()
            .join("\n"),
        frag_var
    )
}

fn process_attr(
    ms: &MagicString,
    attr: &AttrInfo,
    el_var: &str,
    tag_name: &str,
    rx: &ReactivityContext,
) -> Option<String> {
    match attr {
        AttrInfo::Static { name, value } => {
            if name == "key" {
                return None;
            }
            let attr_name = if name == "className" {
                "class"
            } else {
                name.as_str()
            };
            Some(format!(
                "{}.setAttribute({}, {})",
                el_var,
                json_quote(attr_name),
                json_quote(value)
            ))
        }
        AttrInfo::Expression {
            name,
            expr_start,
            expr_end,
            is_reactive,
        } => {
            if name == "key" {
                return None;
            }
            let raw_name = name.as_str();
            let attr_name = if raw_name == "className" {
                "class"
            } else {
                raw_name
            };

            let expr_text = ms.get_transformed_slice(*expr_start, *expr_end);
            let use_property = is_idl_property(tag_name, attr_name);

            // Ref
            if attr_name == "ref" {
                return Some(format!("{}.current = {}", expr_text, el_var));
            }

            // Event handler: onClick → __on(el, "click", handler)
            if attr_name.starts_with("on") && attr_name.len() > 2 {
                let event_name = format!(
                    "{}{}",
                    attr_name.chars().nth(2).unwrap().to_lowercase(),
                    &attr_name[3..]
                );
                return Some(format!(
                    "__on({}, {}, {})",
                    el_var,
                    json_quote(&event_name),
                    expr_text
                ));
            }

            // Reactive expression → __attr or __prop
            let is_reactive_in_scope =
                *is_reactive && is_expr_reactive_in_scope(ms, *expr_start, *expr_end, rx);

            if is_reactive_in_scope {
                // Apply inline substitutions for reactive callback locals
                // (e.g., replace `isActive` with `(__props.selected.includes(label.id))`)
                let expr_text = apply_inline_subs(&expr_text, rx);

                // If expr_text starts with '{', it's an object literal —
                // wrap in parens so `() => { ... }` isn't parsed as a block body.
                let needs_parens = expr_text.trim_start().starts_with('{');
                let wrapped = if needs_parens {
                    format!("({})", expr_text)
                } else {
                    expr_text.to_string()
                };
                if use_property {
                    return Some(format!(
                        "__prop({}, {}, () => {})",
                        el_var,
                        json_quote(attr_name),
                        wrapped
                    ));
                }
                return Some(format!(
                    "__attr({}, {}, () => {})",
                    el_var,
                    json_quote(attr_name),
                    wrapped
                ));
            }

            // Static expression → guarded setAttribute/property
            // Guards against null/false/undefined and handles boolean true → ""
            if attr_name == "style" {
                Some(format!(
                    "{{ const __v = {}; if (__v != null && __v !== false) {}.setAttribute(\"style\", typeof __v === \"object\" ? __styleStr(__v) : __v === true ? \"\" : String(__v)); }}",
                    expr_text, el_var
                ))
            } else if use_property {
                Some(format!(
                    "{{ const __v = {}; if (__v != null) {}.{} = __v; }}",
                    expr_text, el_var, attr_name
                ))
            } else {
                Some(format!(
                    "{{ const __v = {}; if (__v != null && __v !== false) {}.setAttribute({}, __v === true ? \"\" : __v); }}",
                    expr_text, el_var, json_quote(attr_name)
                ))
            }
        }
        AttrInfo::BooleanShorthand { name } => {
            if name == "key" {
                return None;
            }
            let attr_name = if name == "className" {
                "class"
            } else {
                name.as_str()
            };
            // IDL boolean properties use direct assignment
            if is_idl_property(tag_name, attr_name) {
                let value = if is_boolean_idl_property(attr_name) {
                    "true"
                } else {
                    "\"\""
                };
                return Some(format!("{}.{} = {}", el_var, attr_name, value));
            }
            Some(format!(
                "{}.setAttribute({}, \"\")",
                el_var,
                json_quote(attr_name)
            ))
        }
        AttrInfo::Spread {
            expr_start,
            expr_end,
        } => {
            let expr_text = ms.get_transformed_slice(*expr_start, *expr_end);
            if let Some(ref pp) = rx.props_param {
                Some(format!("__spread({}, {}, {})", el_var, expr_text, pp))
            } else {
                Some(format!("__spread({}, {})", el_var, expr_text))
            }
        }
    }
}

fn transform_child(
    ms: &MagicString,
    program: &Program,
    child: &ChildInfo,
    parent_var: &str,
    rx: &ReactivityContext,
    counter: &mut u32,
) -> Option<String> {
    match child {
        ChildInfo::Text(text) => Some(format!(
            "__append({}, __staticText({}))",
            parent_var,
            json_quote(text)
        )),
        ChildInfo::Expression {
            expr_start,
            expr_end,
            is_literal,
            expr_kind,
            ..
        } => {
            // Conditional
            if let ExprKind::Conditional { .. } = expr_kind {
                let code = transform_conditional_code(ms, program, expr_kind, rx, counter);
                return Some(format!("__append({}, {})", parent_var, code));
            }
            if let ExprKind::LogicalAnd { .. } = expr_kind {
                let code = transform_conditional_code(ms, program, expr_kind, rx, counter);
                return Some(format!("__append({}, {})", parent_var, code));
            }

            // List
            if let ExprKind::List {
                source_start,
                source_end,
                callback_body_start,
                callback_body_end,
                item_param,
                index_param,
                key_expr,
                callback_locals,
            } = expr_kind
            {
                let source_text = ms.get_transformed_slice(*source_start, *source_end);
                let key_fn = build_key_fn(key_expr, item_param, index_param.as_deref());

                // Build inline_locals for reactive callback-local variables
                let extended_rx = build_extended_rx_for_list(ms, callback_locals, rx);

                // Inner JSX in .map() callbacks is NOT collected as a separate
                // top-level node — the List handler transforms it directly here.
                let render_body = {
                    let body_jsx =
                        find_jsx_in_span(program, *callback_body_start, *callback_body_end);
                    if let Some(jsx) = body_jsx {
                        let jsx_code = transform_jsx_node(
                            ms,
                            program,
                            jsx.start,
                            jsx.end,
                            &jsx.kind,
                            &extended_rx,
                            counter,
                        );
                        // For block body callbacks, include full body with pre-return code
                        if !callback_locals.is_empty() {
                            let before = ms.get_transformed_slice(*callback_body_start, jsx.start);
                            let after = ms.get_transformed_slice(jsx.end, *callback_body_end);
                            format!("{}{}{}", before, jsx_code, after)
                        } else {
                            jsx_code
                        }
                    } else {
                        ms.get_transformed_slice(*callback_body_start, *callback_body_end)
                    }
                };

                let render_fn = format!("({}) => {}", item_param, render_body);
                return Some(format!(
                    "__list({}, () => {}, {}, {})",
                    parent_var, source_text, key_fn, render_fn
                ));
            }

            let expr_text = ms.get_transformed_slice(*expr_start, *expr_end);

            // Use __child() only for truly reactive expressions (references a signal/computed).
            // Use __insert() for static non-literal expressions (no effect overhead).
            let is_truly_reactive =
                !is_literal && is_expr_reactive_in_scope(ms, *expr_start, *expr_end, rx);
            if is_truly_reactive {
                let expr_text = apply_inline_subs(&expr_text, rx);
                Some(format!(
                    "__append({}, __child(() => {}))",
                    parent_var, expr_text
                ))
            } else {
                Some(format!("__insert({}, {})", parent_var, expr_text))
            }
        }
        ChildInfo::Element(info) => {
            let code = transform_element(ms, program, info, rx, counter);
            Some(format!("__append({}, {})", parent_var, code))
        }
        ChildInfo::Fragment(info) => {
            let code = transform_fragment(ms, program, info, rx, counter);
            Some(format!("__append({}, {})", parent_var, code))
        }
    }
}

fn transform_conditional_code(
    ms: &MagicString,
    program: &Program,
    kind: &ExprKind,
    rx: &ReactivityContext,
    counter: &mut u32,
) -> String {
    match kind {
        ExprKind::Conditional {
            cond_start,
            cond_end,
            true_start,
            true_end,
            true_is_jsx,
            false_start,
            false_end,
            false_is_jsx,
        } => {
            let cond_text =
                apply_inline_subs(&ms.get_transformed_slice(*cond_start, *cond_end), rx);
            let true_branch = transform_branch(
                ms,
                program,
                *true_start,
                *true_end,
                *true_is_jsx,
                rx,
                counter,
            );
            let false_branch = transform_branch(
                ms,
                program,
                *false_start,
                *false_end,
                *false_is_jsx,
                rx,
                counter,
            );
            format!(
                "__conditional(() => {}, () => {}, () => {})",
                cond_text, true_branch, false_branch
            )
        }
        ExprKind::LogicalAnd {
            left_start,
            left_end,
            right_start,
            right_end,
            right_is_jsx,
        } => {
            let cond_text =
                apply_inline_subs(&ms.get_transformed_slice(*left_start, *left_end), rx);
            let true_branch = transform_branch(
                ms,
                program,
                *right_start,
                *right_end,
                *right_is_jsx,
                rx,
                counter,
            );
            format!(
                "__conditional(() => {}, () => {}, () => null)",
                cond_text, true_branch
            )
        }
        _ => String::new(),
    }
}

fn transform_branch(
    ms: &MagicString,
    program: &Program,
    start: u32,
    end: u32,
    is_jsx: bool,
    rx: &ReactivityContext,
    counter: &mut u32,
) -> String {
    if is_jsx {
        let jsx = find_jsx_in_span(program, start, end);
        if let Some(jsx) = jsx {
            return transform_jsx_node(ms, program, jsx.start, jsx.end, &jsx.kind, rx, counter);
        }
    }
    // Check for nested ternary in non-JSX branches — ts-morph wraps every
    // nested ternary in its own __conditional(), even when branches are strings.
    if let Some(cond) = find_conditional_in_span(program, start, end) {
        let true_is_jsx = cond.true_is_jsx;
        let false_is_jsx = cond.false_is_jsx;
        let kind = ExprKind::Conditional {
            cond_start: cond.cond_start,
            cond_end: cond.cond_end,
            true_start: cond.true_start,
            true_end: cond.true_end,
            true_is_jsx,
            false_start: cond.false_start,
            false_end: cond.false_end,
            false_is_jsx,
        };
        return transform_conditional_code(ms, program, &kind, rx, counter);
    }
    ms.get_transformed_slice(start, end)
}

struct ConditionalSpanInfo {
    cond_start: u32,
    cond_end: u32,
    true_start: u32,
    true_end: u32,
    true_is_jsx: bool,
    false_start: u32,
    false_end: u32,
    false_is_jsx: bool,
}

fn find_conditional_in_span(
    program: &Program,
    start: u32,
    end: u32,
) -> Option<ConditionalSpanInfo> {
    let mut finder = ConditionalSpanFinder {
        target_start: start,
        target_end: end,
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

struct ConditionalSpanFinder {
    target_start: u32,
    target_end: u32,
    result: Option<ConditionalSpanInfo>,
}

impl<'c> Visit<'c> for ConditionalSpanFinder {
    fn visit_conditional_expression(&mut self, cond: &ConditionalExpression<'c>) {
        if self.result.is_some() {
            return;
        }
        let span = cond.span;
        if span.start >= self.target_start && span.end <= self.target_end {
            self.result = Some(ConditionalSpanInfo {
                cond_start: cond.test.span().start,
                cond_end: cond.test.span().end,
                true_start: cond.consequent.span().start,
                true_end: cond.consequent.span().end,
                true_is_jsx: is_jsx_expression(&cond.consequent),
                false_start: cond.alternate.span().start,
                false_end: cond.alternate.span().end,
                false_is_jsx: is_jsx_expression(&cond.alternate),
            });
            return;
        }
        oxc_ast_visit::walk::walk_conditional_expression(self, cond);
    }
}

/// Read a slice from MagicString, transforming any JSX nodes found within.
/// This handles patterns like `() => <div>Not found</div>` inside prop values.
fn slice_with_transformed_jsx(
    ms: &MagicString,
    program: &Program,
    start: u32,
    end: u32,
    rx: &ReactivityContext,
    counter: &mut u32,
) -> String {
    // Collect all JSX nodes in this span
    let jsx_nodes = collect_jsx_in_span(program, start, end);

    if jsx_nodes.is_empty() {
        return ms.get_transformed_slice(start, end);
    }

    // Build text by reading gaps from MagicString and inserting transformed JSX
    let mut result = String::new();
    let mut cursor = start;

    for jsx in &jsx_nodes {
        // Read gap before this JSX node
        if cursor < jsx.start {
            result.push_str(&ms.get_transformed_slice(cursor, jsx.start));
        }
        // Transform and insert the JSX
        let transformed =
            transform_jsx_node(ms, program, jsx.start, jsx.end, &jsx.kind, rx, counter);
        result.push_str(&transformed);
        cursor = jsx.end;
    }

    // Read remaining text after last JSX node
    if cursor < end {
        result.push_str(&ms.get_transformed_slice(cursor, end));
    }

    result
}

/// Collect all JSX nodes within a span, sorted by position.
fn collect_jsx_in_span(program: &Program, start: u32, end: u32) -> Vec<JsxNodeInfo> {
    let mut collector = JsxInSpanCollector {
        target_start: start,
        target_end: end,
        results: Vec::new(),
    };
    for stmt in &program.body {
        collector.visit_statement(stmt);
    }
    collector.results.sort_by_key(|n| n.start);
    collector.results
}

struct JsxInSpanCollector {
    target_start: u32,
    target_end: u32,
    results: Vec<JsxNodeInfo>,
}

impl<'c> Visit<'c> for JsxInSpanCollector {
    fn visit_jsx_element(&mut self, elem: &JSXElement<'c>) {
        if elem.span.start >= self.target_start && elem.span.end <= self.target_end {
            self.results.push(JsxNodeInfo {
                start: elem.span.start,
                end: elem.span.end,
                kind: JsxNodeKind::Element,
            });
            // Don't recurse into JSX children — we transform the outermost JSX node
            return;
        }
        oxc_ast_visit::walk::walk_jsx_element(self, elem);
    }

    fn visit_jsx_fragment(&mut self, frag: &JSXFragment<'c>) {
        if frag.span.start >= self.target_start && frag.span.end <= self.target_end {
            self.results.push(JsxNodeInfo {
                start: frag.span.start,
                end: frag.span.end,
                kind: JsxNodeKind::Fragment,
            });
            return;
        }
        oxc_ast_visit::walk::walk_jsx_fragment(self, frag);
    }
}

fn find_jsx_in_span(program: &Program, start: u32, end: u32) -> Option<JsxNodeInfo> {
    let mut finder = JsxSpanFinder {
        target_start: start,
        target_end: end,
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

struct JsxSpanFinder {
    target_start: u32,
    target_end: u32,
    result: Option<JsxNodeInfo>,
}

impl<'c> Visit<'c> for JsxSpanFinder {
    fn visit_jsx_element(&mut self, elem: &JSXElement<'c>) {
        if self.result.is_some() {
            return;
        }
        if elem.span.start >= self.target_start && elem.span.end <= self.target_end {
            self.result = Some(JsxNodeInfo {
                start: elem.span.start,
                end: elem.span.end,
                kind: JsxNodeKind::Element,
            });
            return;
        }
        oxc_ast_visit::walk::walk_jsx_element(self, elem);
    }

    fn visit_jsx_fragment(&mut self, frag: &JSXFragment<'c>) {
        if self.result.is_some() {
            return;
        }
        if frag.span.start >= self.target_start && frag.span.end <= self.target_end {
            self.result = Some(JsxNodeInfo {
                start: frag.span.start,
                end: frag.span.end,
                kind: JsxNodeKind::Fragment,
            });
            return;
        }
        oxc_ast_visit::walk::walk_jsx_fragment(self, frag);
    }
}

// ─── Reactivity check ────────────────────────────────────────────────────────

/// Check if an expression references any reactive variable.
/// This reads the transformed slice from MagicString and checks if any reactive
/// name appears with `.value` suffix (which signals the signal transformer ran).
fn is_expr_reactive_in_scope(
    ms: &MagicString,
    start: u32,
    end: u32,
    rx: &ReactivityContext,
) -> bool {
    let text = ms.get_transformed_slice(start, end);
    is_text_reactive(&text, rx)
}

/// Check if a text string references any reactive source.
/// Used both for JSX attribute/child expressions and for analyzing
/// callback-local variable initializers.
fn is_text_reactive(text: &str, rx: &ReactivityContext) -> bool {
    // Check for __props.* access — props are getter-based and always reactive.
    // After props destructuring, `{ title }` becomes `__props.title`, and prop
    // access must be tracked reactively (parents pass getters that return signal values).
    if text.contains("__props.") {
        return true;
    }
    // Check for signal/computed .value access
    for name in &rx.names {
        let pattern = format!("{}.value", name);
        // Use word-boundary matching to avoid false positives
        // (e.g., signal "x" matching "fox.value")
        if contains_word_boundary(text, &pattern) {
            return true;
        }
    }
    // Check for signal API property access (e.g., tasks.data, tasks.loading)
    for (api_var, props) in &rx.signal_api_props {
        for prop in props {
            let pattern = format!("{}.{}", api_var, prop);
            if contains_word_boundary(text, &pattern) {
                return true;
            }
        }
    }
    // Check for field signal property access (e.g., taskForm.title.error.value).
    // The signal transformer appends .value to recognized field signal properties,
    // so we look for `<api_var>.<anything>...<.value>` patterns.
    for api_var in &rx.field_signal_api_vars {
        let prefix = format!("{}.", api_var);
        if let Some(pos) = text.find(&prefix) {
            let remainder = &text[pos + prefix.len()..];
            if remainder.contains(".value") {
                return true;
            }
        }
    }
    // Check for reactive source API property access (e.g., auth.user, auth.user.avatarUrl).
    // Any property access on a reactive source variable is reactive.
    for rs_var in &rx.reactive_sources {
        let pattern = format!("{}.", rs_var);
        if text.contains(&pattern) && contains_word_boundary(text, rs_var) {
            return true;
        }
    }
    // Check for references to inlined reactive callback locals.
    // These are variables like `isActive` inside .map() callbacks whose
    // initializers depend on reactive sources (__props., .value, etc.).
    for name in rx.inline_locals.keys() {
        if contains_word_boundary(text, name) {
            return true;
        }
    }
    false
}

/// Check if `pattern` appears in `text` at a word boundary.
/// The character before the pattern must not be alphanumeric or underscore.
fn contains_word_boundary(text: &str, pattern: &str) -> bool {
    let mut start = 0;
    while let Some(pos) = text[start..].find(pattern) {
        let abs_pos = start + pos;
        // Check that the char before is not part of an identifier
        let ok_before = if abs_pos == 0 {
            true
        } else {
            let prev = text.as_bytes()[abs_pos - 1];
            !prev.is_ascii_alphanumeric() && prev != b'_' && prev != b'$'
        };
        if ok_before {
            return true;
        }
        start = abs_pos + 1;
    }
    false
}

/// Apply inline substitutions for reactive callback-local variables.
/// Replaces references to inline_locals with their full expressions,
/// so that the resulting code directly references __props. or .value
/// instead of an opaque local variable name.
fn apply_inline_subs(text: &str, rx: &ReactivityContext) -> String {
    if rx.inline_locals.is_empty() {
        return text.to_string();
    }
    let mut result = text.to_string();
    for (name, replacement) in &rx.inline_locals {
        result = word_boundary_replace(&result, name, &format!("({})", replacement));
    }
    result
}

/// Replace all word-boundary occurrences of `pattern` with `replacement` in `text`.
fn word_boundary_replace(text: &str, pattern: &str, replacement: &str) -> String {
    if !text.contains(pattern) {
        return text.to_string();
    }
    let mut result = String::with_capacity(text.len());
    let mut search_start = 0;
    while search_start < text.len() {
        let Some(pos) = text[search_start..].find(pattern) else {
            result.push_str(&text[search_start..]);
            break;
        };
        let abs_pos = search_start + pos;

        // Check word boundaries
        let before_ok = if abs_pos == 0 {
            true
        } else {
            let prev = text.as_bytes()[abs_pos - 1];
            !prev.is_ascii_alphanumeric() && prev != b'_' && prev != b'$'
        };
        let after_pos = abs_pos + pattern.len();
        let after_ok = if after_pos >= text.len() {
            true
        } else {
            let next = text.as_bytes()[after_pos];
            !next.is_ascii_alphanumeric() && next != b'_' && next != b'$'
        };

        if before_ok && after_ok {
            result.push_str(&text[search_start..abs_pos]);
            result.push_str(replacement);
            search_start = after_pos;
        } else {
            result.push_str(&text[search_start..abs_pos + pattern.len()]);
            search_start = after_pos;
        }
    }
    result
}

/// Build a key function string for __list/__listValue.
/// Includes index param when the key expression references it as a variable.
fn build_key_fn(key_expr: &Option<String>, item_param: &str, index_param: Option<&str>) -> String {
    match key_expr {
        Some(k) => {
            // Include index param when the key expression references it
            // (not as part of a property access like item.index)
            if let Some(idx) = index_param {
                if key_references_index(k, idx) {
                    return format!("({}, {}) => {}", item_param, idx, k);
                }
            }
            format!("({}) => {}", item_param, k)
        }
        None => "null".to_string(),
    }
}

/// Check if a key expression references the index parameter as a standalone variable.
fn key_references_index(key_expr: &str, index_param: &str) -> bool {
    let mut start = 0;
    while let Some(pos) = key_expr[start..].find(index_param) {
        let abs_pos = start + pos;
        let after_pos = abs_pos + index_param.len();

        // Check char before is not part of identifier or a dot (property access)
        let ok_before = if abs_pos == 0 {
            true
        } else {
            let prev = key_expr.as_bytes()[abs_pos - 1];
            !prev.is_ascii_alphanumeric() && prev != b'_' && prev != b'$' && prev != b'.'
        };

        // Check char after is not part of identifier
        let ok_after = if after_pos >= key_expr.len() {
            true
        } else {
            let next = key_expr.as_bytes()[after_pos];
            !next.is_ascii_alphanumeric() && next != b'_' && next != b'$'
        };

        if ok_before && ok_after {
            return true;
        }
        start = abs_pos + 1;
    }
    false
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn gen_var(counter: &mut u32) -> String {
    let v = format!("__el{}", counter);
    *counter += 1;
    v
}

fn json_quote(s: &str) -> String {
    let escaped = s
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t");
    format!("\"{}\"", escaped)
}

fn quote_prop_key(name: &str) -> String {
    // Check if the name is a valid JS identifier
    if is_valid_js_identifier(name) {
        name.to_string()
    } else {
        json_quote(name)
    }
}

/// Quote a property name for use in a getter (`get name() {}` or `get ['hyphenated']() {}`).
fn quote_getter_key(name: &str) -> String {
    if is_valid_js_identifier(name) {
        name.to_string()
    } else {
        format!("[{}]", json_quote(name))
    }
}

fn is_valid_js_identifier(name: &str) -> bool {
    name.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
        && name
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic() || c == '_' || c == '$')
}

/// Collapse JSX text whitespace per React/Babel rules.
fn clean_jsx_text(raw: &str) -> String {
    if !raw.contains('\n') && !raw.contains('\r') {
        return raw.to_string();
    }

    // Normalize \r\n and \r to \n, then split
    let normalized = raw.replace("\r\n", "\n").replace('\r', "\n");
    let lines: Vec<&str> = normalized.split('\n').collect();
    let mut cleaned: Vec<String> = Vec::new();

    for (i, line) in lines.iter().enumerate() {
        let mut line = line.replace('\t', " ");
        if i > 0 {
            line = line.trim_start().to_string();
        }
        if i < lines.len() - 1 {
            line = line.trim_end().to_string();
        }
        if !line.is_empty() {
            cleaned.push(line);
        }
    }

    cleaned.join(" ")
}

/// Build an extended ReactivityContext for .map() callback bodies.
/// Analyzes callback-local `const` declarations and marks reactive ones
/// in `inline_locals` so they get inlined into JSX attribute/child expressions.
fn build_extended_rx_for_list(
    ms: &MagicString,
    callback_locals: &[(String, u32, u32)],
    rx: &ReactivityContext,
) -> ReactivityContext {
    if callback_locals.is_empty() {
        // Return a context with empty inline_locals (same as parent)
        return ReactivityContext {
            names: rx.names.clone(),
            signal_api_props: rx.signal_api_props.clone(),
            field_signal_api_vars: rx.field_signal_api_vars.clone(),
            reactive_sources: rx.reactive_sources.clone(),
            inline_locals: HashMap::new(),
            props_param: rx.props_param.clone(),
        };
    }

    let mut inline_locals = HashMap::new();
    for (name, init_start, init_end) in callback_locals {
        let transformed_init = ms.get_transformed_slice(*init_start, *init_end);
        if is_text_reactive(&transformed_init, rx) {
            inline_locals.insert(name.clone(), transformed_init);
        }
    }

    ReactivityContext {
        names: rx.names.clone(),
        signal_api_props: rx.signal_api_props.clone(),
        field_signal_api_vars: rx.field_signal_api_vars.clone(),
        reactive_sources: rx.reactive_sources.clone(),
        inline_locals,
        props_param: rx.props_param.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::component_analyzer::analyze_components;
    use crate::reactivity_analyzer::{
        analyze_reactivity, build_import_aliases, ImportContext, ManifestRegistry,
    };
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::SourceType;

    /// Helper: parse source, extract components & reactivity, transform JSX, return result.
    fn transform(source: &str) -> String {
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let mut ms = MagicString::new(source);
        let components = analyze_components(&parsed.program);
        let manifests: ManifestRegistry = HashMap::new();
        let (aliases, dynamic_configs) = build_import_aliases(&parsed.program, &manifests);
        let import_ctx = ImportContext {
            aliases,
            dynamic_configs,
        };
        for comp in &components {
            let vars = analyze_reactivity(&parsed.program, comp, &import_ctx);
            transform_jsx(&mut ms, &parsed.program, comp, &vars, None);
        }
        ms.to_string()
    }

    /// Helper: transform with hydration id on the first component.
    fn transform_with_hydration(source: &str, hydration_id: &str) -> String {
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let mut ms = MagicString::new(source);
        let components = analyze_components(&parsed.program);
        let manifests: ManifestRegistry = HashMap::new();
        let (aliases, dynamic_configs) = build_import_aliases(&parsed.program, &manifests);
        let import_ctx = ImportContext {
            aliases,
            dynamic_configs,
        };
        for (i, comp) in components.iter().enumerate() {
            let vars = analyze_reactivity(&parsed.program, comp, &import_ctx);
            let hid = if i == 0 { Some(hydration_id) } else { None };
            transform_jsx(&mut ms, &parsed.program, comp, &vars, hid);
        }
        ms.to_string()
    }

    // ========== Utility functions ==========

    #[test]
    fn gen_var_produces_numbered_names() {
        assert_eq!(gen_var(&mut 0), "__el0");
        assert_eq!(gen_var(&mut 5), "__el5");
        assert_eq!(gen_var(&mut 42), "__el42");
    }

    #[test]
    fn json_quote_escapes_and_wraps() {
        assert_eq!(json_quote("hello"), r#""hello""#);
        assert_eq!(json_quote(r#"say "hi""#), r#""say \"hi\"""#);
        assert_eq!(json_quote("line\nnew"), r#""line\nnew""#);
    }

    #[test]
    fn is_valid_js_identifier_accepts_valid() {
        assert!(is_valid_js_identifier("foo"));
        assert!(is_valid_js_identifier("_bar"));
        assert!(is_valid_js_identifier("$baz"));
        assert!(is_valid_js_identifier("camelCase"));
        assert!(is_valid_js_identifier("snake_case"));
    }

    #[test]
    fn is_valid_js_identifier_rejects_invalid() {
        assert!(!is_valid_js_identifier("123abc"));
        assert!(!is_valid_js_identifier("kebab-case"));
        assert!(!is_valid_js_identifier("with space"));
        assert!(!is_valid_js_identifier(""));
        assert!(!is_valid_js_identifier("data-attr"));
    }

    #[test]
    fn quote_prop_key_valid_identifier() {
        assert_eq!(quote_prop_key("foo"), "foo");
        assert_eq!(quote_prop_key("onClick"), "onClick");
    }

    #[test]
    fn quote_prop_key_invalid_identifier() {
        assert_eq!(quote_prop_key("data-attr"), r#""data-attr""#);
        assert_eq!(quote_prop_key("aria-label"), r#""aria-label""#);
    }

    #[test]
    fn quote_getter_key_valid_identifier() {
        assert_eq!(quote_getter_key("foo"), "foo");
    }

    #[test]
    fn quote_getter_key_invalid_identifier() {
        assert_eq!(quote_getter_key("data-attr"), r#"["data-attr"]"#);
    }

    #[test]
    fn clean_jsx_text_simple() {
        assert_eq!(clean_jsx_text("hello"), "hello");
    }

    #[test]
    fn clean_jsx_text_multiline() {
        assert_eq!(clean_jsx_text("hello\n    world"), "hello world");
    }

    #[test]
    fn clean_jsx_text_all_whitespace() {
        assert_eq!(clean_jsx_text("\n    \n    "), "");
    }

    #[test]
    fn clean_jsx_text_tabs() {
        assert_eq!(clean_jsx_text("a\n\tb"), "a b");
    }

    // ========== IDL properties ==========

    #[test]
    fn is_idl_property_input_value() {
        assert!(is_idl_property("input", "value"));
        assert!(is_idl_property("input", "checked"));
    }

    #[test]
    fn is_idl_property_select_textarea() {
        assert!(is_idl_property("select", "value"));
        assert!(is_idl_property("textarea", "value"));
    }

    #[test]
    fn is_idl_property_non_idl() {
        assert!(!is_idl_property("div", "value"));
        assert!(!is_idl_property("input", "class"));
    }

    #[test]
    fn is_boolean_idl_property_checked() {
        assert!(is_boolean_idl_property("checked"));
        assert!(!is_boolean_idl_property("value"));
        assert!(!is_boolean_idl_property("disabled"));
    }

    // ========== contains_word_boundary ==========

    #[test]
    fn contains_word_boundary_standalone() {
        assert!(contains_word_boundary("x + y", "x"));
        assert!(contains_word_boundary("x + y", "y"));
    }

    #[test]
    fn contains_word_boundary_not_inside_identifier() {
        assert!(!contains_word_boundary("fox", "x"));
        assert!(!contains_word_boundary("prefix_x", "x"));
    }

    #[test]
    fn contains_word_boundary_at_start_end() {
        assert!(contains_word_boundary("x", "x"));
        assert!(contains_word_boundary("x.value", "x"));
        assert!(contains_word_boundary("a + x", "x"));
    }

    // ========== word_boundary_replace ==========

    #[test]
    fn word_boundary_replace_standalone() {
        assert_eq!(
            word_boundary_replace("x + y", "x", "replaced"),
            "replaced + y"
        );
    }

    #[test]
    fn word_boundary_replace_not_inside_identifier() {
        assert_eq!(word_boundary_replace("fox", "x", "replaced"), "fox");
    }

    #[test]
    fn word_boundary_replace_multiple_occurrences() {
        assert_eq!(word_boundary_replace("x + x", "x", "z"), "z + z");
    }

    // ========== key_references_index ==========

    #[test]
    fn key_references_index_standalone() {
        assert!(key_references_index("idx", "idx"));
    }

    #[test]
    fn key_references_index_in_expression() {
        assert!(key_references_index("item.id + idx", "idx"));
    }

    #[test]
    fn key_references_index_not_present() {
        assert!(!key_references_index("item.id", "idx"));
    }

    #[test]
    fn key_references_index_inside_word() {
        assert!(!key_references_index("index_of", "index"));
    }

    // ========== Basic element transformation ==========

    #[test]
    fn static_div_with_text() {
        let result = transform(
            r#"export function App() {
    return <div>hello</div>;
}"#,
        );
        assert!(result.contains("__element(\"div\")"), "result: {result}");
        assert!(
            result.contains("__staticText(\"hello\")"),
            "result: {result}"
        );
    }

    #[test]
    fn iife_wraps_element() {
        let result = transform(
            r#"export function App() {
    return <div>hello</div>;
}"#,
        );
        assert!(result.contains("(() => {"), "result: {result}");
        assert!(result.contains("return __el0;"), "result: {result}");
        assert!(result.contains("})()"), "result: {result}");
    }

    #[test]
    fn enter_exit_children() {
        let result = transform(
            r#"export function App() {
    return <div>hello</div>;
}"#,
        );
        assert!(
            result.contains("__enterChildren(__el0)"),
            "result: {result}"
        );
        assert!(result.contains("__exitChildren()"), "result: {result}");
    }

    // ========== Static attributes ==========

    #[test]
    fn static_string_attribute() {
        let result = transform(
            r#"export function App() {
    return <div id="main">text</div>;
}"#,
        );
        assert!(
            result.contains(r#"__el0.setAttribute("id", "main")"#),
            "result: {result}"
        );
    }

    #[test]
    fn classname_mapped_to_class() {
        let result = transform(
            r#"export function App() {
    return <div className="foo">text</div>;
}"#,
        );
        assert!(
            result.contains(r#"setAttribute("class""#),
            "result: {result}"
        );
    }

    #[test]
    fn html_for_preserved_on_element() {
        let result = transform(
            r#"export function App() {
    return <label htmlFor="name">text</label>;
}"#,
        );
        // JSX transformer preserves htmlFor as-is (no mapping to "for")
        assert!(
            result.contains(r#"setAttribute("htmlFor""#),
            "result: {result}"
        );
    }

    // ========== Boolean shorthand attributes ==========

    #[test]
    fn boolean_shorthand_attribute() {
        let result = transform(
            r#"export function App() {
    return <input disabled />;
}"#,
        );
        assert!(
            result.contains(r#"setAttribute("disabled", "")"#),
            "result: {result}"
        );
    }

    #[test]
    fn boolean_idl_property_shorthand() {
        let result = transform(
            r#"export function App() {
    return <input checked />;
}"#,
        );
        assert!(result.contains(".checked = true"), "result: {result}");
    }

    // ========== Expression attributes ==========

    #[test]
    fn expression_attribute_non_reactive() {
        let result = transform(
            r#"export function App(props) {
    return <div id={props.id}>text</div>;
}"#,
        );
        assert!(result.contains(r#"setAttribute("id""#), "result: {result}");
    }

    #[test]
    fn expression_attribute_reactive() {
        let result = transform(
            r#"export function App() {
    let cls = "active";
    return <div className={cls}>text</div>;
}"#,
        );
        assert!(
            result.contains("__attr(") || result.contains("setAttribute"),
            "result: {result}"
        );
    }

    // ========== IDL property handling ==========

    #[test]
    fn input_static_value_uses_set_attribute() {
        let result = transform(
            r#"export function App() {
    return <input value="test" />;
}"#,
        );
        // Static value on input uses setAttribute, not direct property
        assert!(
            result.contains(r#"setAttribute("value", "test")"#),
            "result: {result}"
        );
    }

    #[test]
    fn textarea_static_value_uses_set_attribute() {
        let result = transform(
            r#"export function App() {
    return <textarea value="test"></textarea>;
}"#,
        );
        // Static value on textarea uses setAttribute, not direct property
        assert!(
            result.contains(r#"setAttribute("value", "test")"#),
            "result: {result}"
        );
    }

    // ========== Event handlers ==========

    #[test]
    fn on_click_event_handler() {
        let result = transform(
            r#"export function App() {
    return <button onClick={handler}>click</button>;
}"#,
        );
        assert!(
            result.contains(r#"__on(__el0, "click""#),
            "result: {result}"
        );
    }

    #[test]
    fn on_change_event_handler() {
        let result = transform(
            r#"export function App() {
    return <input onChange={handler} />;
}"#,
        );
        assert!(
            result.contains(r#"__on(__el0, "change""#),
            "result: {result}"
        );
    }

    // ========== Ref attribute ==========

    #[test]
    fn ref_attribute() {
        let result = transform(
            r#"export function App() {
    return <div ref={myRef}>text</div>;
}"#,
        );
        assert!(result.contains(".current = __el0"), "result: {result}");
    }

    // ========== Spread attributes ==========

    #[test]
    fn spread_attribute() {
        let result = transform(
            r#"export function App(props) {
    return <div {...props}>text</div>;
}"#,
        );
        assert!(result.contains("__spread("), "result: {result}");
    }

    // ========== Void / self-closing elements ==========

    #[test]
    fn self_closing_element() {
        let result = transform(
            r#"export function App() {
    return <img />;
}"#,
        );
        assert!(result.contains("__element(\"img\")"), "result: {result}");
        // No __enterChildren for void elements with no children
        assert!(!result.contains("__enterChildren"), "result: {result}");
    }

    // ========== Nested elements ==========

    #[test]
    fn nested_elements() {
        let result = transform(
            r#"export function App() {
    return <div><span>inner</span></div>;
}"#,
        );
        assert!(result.contains("__element(\"div\")"), "result: {result}");
        assert!(result.contains("__element(\"span\")"), "result: {result}");
    }

    // ========== Fragment ==========

    #[test]
    fn empty_fragment() {
        let result = transform(
            r#"export function App() {
    return <></>;
}"#,
        );
        assert!(
            result.contains("createDocumentFragment"),
            "result: {result}"
        );
    }

    #[test]
    fn fragment_with_children() {
        let result = transform(
            r#"export function App() {
    return <><div>a</div><span>b</span></>;
}"#,
        );
        assert!(
            result.contains("createDocumentFragment"),
            "result: {result}"
        );
        assert!(result.contains("__element(\"div\")"), "result: {result}");
        assert!(result.contains("__element(\"span\")"), "result: {result}");
    }

    // ========== Component call ==========

    #[test]
    fn component_call_no_props() {
        let result = transform(
            r#"export function App() {
    return <Child />;
}"#,
        );
        assert!(result.contains("Child({"), "result: {result}");
    }

    #[test]
    fn component_call_with_static_prop() {
        let result = transform(
            r#"export function App() {
    return <Child name="Alice" />;
}"#,
        );
        assert!(result.contains("Child("), "result: {result}");
        assert!(result.contains(r#"name: "Alice""#), "result: {result}");
    }

    #[test]
    fn component_call_preserves_classname() {
        let result = transform(
            r#"export function App() {
    return <Child className="foo" />;
}"#,
        );
        // JSX transformer preserves className for component props (no mapping to class)
        assert!(result.contains(r#"className: "foo""#), "result: {result}");
    }

    #[test]
    fn component_with_children() {
        let result = transform(
            r#"export function App() {
    return <Wrapper>content</Wrapper>;
}"#,
        );
        assert!(result.contains("children:"), "result: {result}");
    }

    #[test]
    fn component_with_boolean_shorthand() {
        let result = transform(
            r#"export function App() {
    return <Toggle active />;
}"#,
        );
        assert!(result.contains("active: true"), "result: {result}");
    }

    #[test]
    fn component_with_spread() {
        let result = transform(
            r#"export function App(props) {
    return <Child {...props} />;
}"#,
        );
        assert!(result.contains("...props"), "result: {result}");
    }

    // ========== Conditional rendering (ternary) ==========

    #[test]
    fn ternary_conditional_in_children() {
        let result = transform(
            r#"export function App(props) {
    return <div>{props.ok ? <span>yes</span> : <p>no</p>}</div>;
}"#,
        );
        assert!(result.contains("__conditional("), "result: {result}");
    }

    // ========== Logical AND ==========

    #[test]
    fn logical_and_in_children() {
        let result = transform(
            r#"export function App(props) {
    return <div>{props.show && <span>visible</span>}</div>;
}"#,
        );
        assert!(result.contains("__conditional("), "result: {result}");
    }

    // ========== List rendering (.map) ==========

    #[test]
    fn map_call_produces_list() {
        let result = transform(
            r#"export function App(props) {
    return <ul>{props.items.map(item => <li>{item}</li>)}</ul>;
}"#,
        );
        assert!(result.contains("__list("), "result: {result}");
    }

    #[test]
    fn map_call_with_key() {
        let result = transform(
            r#"export function App(props) {
    return <ul>{props.items.map(item => <li key={item.id}>{item.name}</li>)}</ul>;
}"#,
        );
        assert!(result.contains("__list("), "result: {result}");
    }

    #[test]
    fn map_call_with_index() {
        let result = transform(
            r#"export function App(props) {
    return <ul>{props.items.map((item, idx) => <li key={idx}>{item}</li>)}</ul>;
}"#,
        );
        assert!(result.contains("__list("), "result: {result}");
    }

    // ========== Expression children ==========

    #[test]
    fn static_expression_child() {
        let result = transform(
            r#"export function App(props) {
    return <div>{props.name}</div>;
}"#,
        );
        assert!(result.contains("__insert("), "result: {result}");
    }

    #[test]
    fn literal_expression_child() {
        let result = transform(
            r#"export function App() {
    return <div>{42}</div>;
}"#,
        );
        assert!(result.contains("__insert("), "result: {result}");
    }

    #[test]
    fn static_let_variable_uses_insert() {
        // A plain `let count = 0` without mutation is classified as Static,
        // so the transformer uses __insert (not __child which is for reactive)
        let result = transform(
            r#"export function App() {
    let count = 0;
    return <div>{count}</div>;
}"#,
        );
        assert!(result.contains("__insert("), "result: {result}");
    }

    // ========== Hydration marker ==========

    #[test]
    fn hydration_marker_injected() {
        let result = transform_with_hydration(
            r#"export function App() {
    return <div>hello</div>;
}"#,
            "App",
        );
        assert!(result.contains(r#"data-v-id"#), "result: {result}");
        assert!(result.contains(r#""App""#), "result: {result}");
    }

    #[test]
    fn hydration_marker_not_injected_without_id() {
        let result = transform(
            r#"export function App() {
    return <div>hello</div>;
}"#,
        );
        assert!(!result.contains("data-v-id"), "result: {result}");
    }

    // ========== Multiple children ==========

    #[test]
    fn multiple_text_and_expression_children() {
        let result = transform(
            r#"export function App(props) {
    return <div>Hello {props.name}!</div>;
}"#,
        );
        assert!(result.contains("__staticText("), "result: {result}");
        assert!(result.contains("__insert("), "result: {result}");
    }

    // ========== Empty element ==========

    #[test]
    fn empty_element_no_children() {
        let result = transform(
            r#"export function App() {
    return <div></div>;
}"#,
        );
        assert!(result.contains("__element(\"div\")"), "result: {result}");
    }

    // ========== Multiple components ==========

    #[test]
    fn multiple_components_transformed_independently() {
        let result = transform(
            r#"export function A() {
    return <div>a</div>;
}
export function B() {
    return <span>b</span>;
}"#,
        );
        assert!(result.contains("__element(\"div\")"), "result: {result}");
        assert!(result.contains("__element(\"span\")"), "result: {result}");
    }

    // ========== Namespaced element ==========

    #[test]
    fn namespaced_attribute() {
        let result = transform(
            r#"export function App() {
    return <svg xmlns:xlink="http://www.w3.org/1999/xlink">text</svg>;
}"#,
        );
        assert!(result.contains("xmlns:xlink"), "result: {result}");
    }

    // ========== inject_hydration_attr ==========

    #[test]
    fn inject_hydration_attr_into_code() {
        let code = r#"(() => { const __el0 = __element("div"); return __el0; })()"#;
        let result = inject_hydration_attr(code, "MyComp");
        assert!(result.is_some(), "should inject hydration");
        let injected = result.unwrap();
        assert!(
            injected.contains(r#"setAttribute("data-v-id", "MyComp")"#),
            "injected: {injected}"
        );
    }

    #[test]
    fn inject_hydration_attr_no_element() {
        let code = "some code without element";
        assert!(inject_hydration_attr(code, "MyComp").is_none());
    }

    // ========== Deeply nested JSX ==========

    #[test]
    fn deeply_nested_jsx_elements() {
        let result = transform(
            r#"export function App() {
    return <div><ul><li><span>deep</span></li></ul></div>;
}"#,
        );
        assert!(result.contains("__element(\"div\")"), "result: {result}");
        assert!(result.contains("__element(\"ul\")"), "result: {result}");
        assert!(result.contains("__element(\"li\")"), "result: {result}");
        assert!(result.contains("__element(\"span\")"), "result: {result}");
    }

    // ========== Component with expression prop ==========

    #[test]
    fn component_with_expression_prop() {
        let result = transform(
            r#"export function App(props) {
    return <Card count={props.count} />;
}"#,
        );
        assert!(result.contains("Card("), "result: {result}");
        assert!(result.contains("count"), "result: {result}");
    }

    // ========== Style attribute ==========

    #[test]
    fn style_attribute_on_element() {
        let result = transform(
            r#"export function App() {
    return <div style="color: red">text</div>;
}"#,
        );
        assert!(
            result.contains(r#"setAttribute("style""#),
            "result: {result}"
        );
    }

    // ========== Multiple attributes ==========

    #[test]
    fn multiple_attributes() {
        let result = transform(
            r#"export function App() {
    return <div id="main" role="button">text</div>;
}"#,
        );
        assert!(
            result.contains(r#"setAttribute("id", "main")"#),
            "result: {result}"
        );
        assert!(
            result.contains(r#"setAttribute("role", "button")"#),
            "result: {result}"
        );
    }

    // ========== Parenthesized JSX ==========

    #[test]
    fn parenthesized_jsx_return() {
        let result = transform(
            r#"export function App() {
    return (<div>hello</div>);
}"#,
        );
        assert!(result.contains("__element(\"div\")"), "result: {result}");
    }

    // ========== No JSX in component ==========

    #[test]
    fn no_jsx_in_component() {
        let result = transform(
            r#"export function App() {
    return null;
}"#,
        );
        // No transformation should occur — no JSX
        assert!(!result.contains("__element"), "result: {result}");
    }

    // ========== Map with block body ==========

    #[test]
    fn map_with_block_body() {
        let result = transform(
            r#"export function App(props) {
    return <ul>{props.items.map(item => {
        return <li>{item}</li>;
    })}</ul>;
}"#,
        );
        assert!(result.contains("__list("), "result: {result}");
    }

    // ========== Map with fragment body ==========

    #[test]
    fn map_with_fragment_body() {
        let result = transform(
            r#"export function App(props) {
    return <div>{props.items.map(item => <><span>{item}</span></>)}</div>;
}"#,
        );
        assert!(result.contains("__list("), "result: {result}");
    }

    // ========== Empty component ==========

    #[test]
    fn empty_source() {
        let result = transform("");
        assert_eq!(result, "");
    }

    // ========== Arrow function component ==========

    #[test]
    fn arrow_block_body_component() {
        let result = transform(
            r#"export const App = () => {
    return <div>hello</div>;
};"#,
        );
        assert!(result.contains("__element(\"div\")"), "result: {result}");
    }

    // ========== Nested ternary ==========

    #[test]
    fn nested_ternary() {
        let result = transform(
            r#"export function App(props) {
    return <div>{props.a ? <span>a</span> : props.b ? <span>b</span> : <span>c</span>}</div>;
}"#,
        );
        assert!(result.contains("__conditional("), "result: {result}");
    }

    // ========== Conditional with non-JSX branches ==========

    #[test]
    fn ternary_with_non_jsx_branches() {
        let result = transform(
            r#"export function App(props) {
    return <div>{props.ok ? "yes" : "no"}</div>;
}"#,
        );
        // Even with non-JSX branches, ternaries produce __conditional()
        assert!(result.contains("__conditional("), "result: {result}");
    }

    // ========== Multiple children types mixed ==========

    #[test]
    fn mixed_children_types() {
        let result = transform(
            r#"export function App(props) {
    return <div>text <span>element</span> {props.expr}</div>;
}"#,
        );
        assert!(result.contains("__staticText("), "result: {result}");
        assert!(result.contains("__element(\"span\")"), "result: {result}");
    }

    // ========== Component with multiple children ==========

    #[test]
    fn component_with_multiple_children() {
        let result = transform(
            r#"export function App() {
    return <Wrapper><div>a</div><span>b</span></Wrapper>;
}"#,
        );
        assert!(result.contains("children:"), "result: {result}");
    }

    // ========== data-* attributes ==========

    #[test]
    fn data_attributes() {
        let result = transform(
            r#"export function App() {
    return <div data-testid="foo">text</div>;
}"#,
        );
        assert!(result.contains(r#""data-testid""#), "result: {result}");
    }

    // ========== build_key_fn ==========

    #[test]
    fn build_key_fn_simple_key() {
        let key = build_key_fn(&Some("item.id".to_string()), "item", None);
        assert_eq!(key, "(item) => item.id");
    }

    #[test]
    fn build_key_fn_with_index_in_key() {
        let key = build_key_fn(&Some("idx".to_string()), "item", Some("idx"));
        assert_eq!(key, "(item, idx) => idx");
    }

    #[test]
    fn build_key_fn_index_not_referenced() {
        let key = build_key_fn(&Some("item.id".to_string()), "item", Some("idx"));
        assert_eq!(key, "(item) => item.id");
    }

    #[test]
    fn build_key_fn_no_key() {
        let key = build_key_fn(&None, "item", None);
        assert_eq!(key, "null");
    }

    // ========== Reactive expression with .value ==========

    #[test]
    fn is_text_reactive_with_signal_value() {
        let rx = ReactivityContext {
            names: HashSet::from(["count".to_string()]),
            signal_api_props: HashMap::new(),
            field_signal_api_vars: HashSet::new(),
            reactive_sources: HashSet::new(),
            inline_locals: HashMap::new(),
            props_param: None,
        };
        assert!(is_text_reactive("count.value", &rx));
    }

    #[test]
    fn is_text_reactive_with_signal_api_prop() {
        let rx = ReactivityContext {
            names: HashSet::new(),
            signal_api_props: HashMap::from([(
                "tasks".to_string(),
                HashSet::from(["data".to_string(), "loading".to_string()]),
            )]),
            field_signal_api_vars: HashSet::new(),
            reactive_sources: HashSet::new(),
            inline_locals: HashMap::new(),
            props_param: None,
        };
        assert!(is_text_reactive("tasks.data", &rx));
        assert!(is_text_reactive("tasks.loading", &rx));
        assert!(!is_text_reactive("tasks.refetch", &rx));
    }

    #[test]
    fn is_text_reactive_with_reactive_source() {
        let rx = ReactivityContext {
            names: HashSet::new(),
            signal_api_props: HashMap::new(),
            field_signal_api_vars: HashSet::new(),
            reactive_sources: HashSet::from(["auth".to_string()]),
            inline_locals: HashMap::new(),
            props_param: None,
        };
        assert!(is_text_reactive("auth.user", &rx));
    }

    #[test]
    fn is_text_reactive_with_props() {
        let rx = ReactivityContext {
            names: HashSet::new(),
            signal_api_props: HashMap::new(),
            field_signal_api_vars: HashSet::new(),
            reactive_sources: HashSet::new(),
            inline_locals: HashMap::new(),
            props_param: Some("__props".to_string()),
        };
        assert!(is_text_reactive("__props.name", &rx));
    }

    #[test]
    fn is_text_reactive_with_inline_locals() {
        let rx = ReactivityContext {
            names: HashSet::new(),
            signal_api_props: HashMap::new(),
            field_signal_api_vars: HashSet::new(),
            reactive_sources: HashSet::new(),
            inline_locals: HashMap::from([("isActive".to_string(), "x.value".to_string())]),
            props_param: None,
        };
        assert!(is_text_reactive("isActive", &rx));
    }

    #[test]
    fn is_text_reactive_non_reactive() {
        let rx = ReactivityContext {
            names: HashSet::new(),
            signal_api_props: HashMap::new(),
            field_signal_api_vars: HashSet::new(),
            reactive_sources: HashSet::new(),
            inline_locals: HashMap::new(),
            props_param: None,
        };
        assert!(!is_text_reactive("someVar", &rx));
        assert!(!is_text_reactive("42", &rx));
    }

    // ========== apply_inline_subs ==========

    #[test]
    fn apply_inline_subs_replaces_locals() {
        let rx = ReactivityContext {
            names: HashSet::new(),
            signal_api_props: HashMap::new(),
            field_signal_api_vars: HashSet::new(),
            reactive_sources: HashSet::new(),
            inline_locals: HashMap::from([(
                "isActive".to_string(),
                "item.active.value".to_string(),
            )]),
            props_param: None,
        };
        let result = apply_inline_subs("isActive ? 'yes' : 'no'", &rx);
        assert_eq!(result, "(item.active.value) ? 'yes' : 'no'");
    }

    #[test]
    fn apply_inline_subs_no_inline_locals() {
        let rx = ReactivityContext {
            names: HashSet::new(),
            signal_api_props: HashMap::new(),
            field_signal_api_vars: HashSet::new(),
            reactive_sources: HashSet::new(),
            inline_locals: HashMap::new(),
            props_param: None,
        };
        let result = apply_inline_subs("x + y", &rx);
        assert_eq!(result, "x + y");
    }

    // ========== Reactive attribute detection ==========

    #[test]
    fn is_text_reactive_field_signal_api() {
        let rx = ReactivityContext {
            names: HashSet::new(),
            signal_api_props: HashMap::new(),
            field_signal_api_vars: HashSet::from(["form".to_string()]),
            reactive_sources: HashSet::new(),
            inline_locals: HashMap::new(),
            props_param: None,
        };
        assert!(is_text_reactive("form.email.value", &rx));
    }

    // ========== Destructured props ==========

    #[test]
    fn spread_with_destructured_props_includes_props_param() {
        let result = transform(
            r#"export function App({ name, ...rest }) {
    return <div {...rest}>text</div>;
}"#,
        );
        assert!(result.contains("__spread("), "result: {result}");
    }

    // ========== Nested component in element ==========

    #[test]
    fn nested_component_in_element() {
        let result = transform(
            r#"export function App() {
    return <div><Child name="test" /></div>;
}"#,
        );
        assert!(result.contains("__element(\"div\")"), "result: {result}");
        assert!(result.contains("Child("), "result: {result}");
    }

    // ========== Fragments ==========

    #[test]
    fn fragment_basic() {
        let result = transform(
            r#"export function App() {
    return <><span>a</span><span>b</span></>;
}"#,
        );
        assert!(
            result.contains("document.createDocumentFragment()"),
            "result: {result}"
        );
    }

    #[test]
    fn fragment_with_text_and_elements() {
        let result = transform(
            r#"export function App() {
    return <>text<div>child</div></>;
}"#,
        );
        assert!(
            result.contains("document.createDocumentFragment()"),
            "result: {result}"
        );
        assert!(result.contains("__staticText("), "result: {result}");
        assert!(result.contains("__element(\"div\")"), "result: {result}");
    }

    #[test]
    fn nested_fragment_as_child() {
        let result = transform(
            r#"export function App() {
    return <div><>inner</></div>;
}"#,
        );
        assert!(
            result.contains("document.createDocumentFragment()"),
            "result: {result}"
        );
    }

    // ========== Namespaced JSX names ==========

    #[test]
    fn namespaced_tag_name() {
        let result = transform(
            r#"export function App() {
    return <svg:rect width="100" />;
}"#,
        );
        assert!(
            result.contains("__element(\"svg:rect\")"),
            "result: {result}"
        );
    }

    // ========== Member expression JSX names ==========

    #[test]
    fn member_expression_tag_name() {
        let result = transform(
            r#"export function App() {
    return <icons.Home size={24} />;
}"#,
        );
        // Member expression starting with lowercase is treated as element
        assert!(
            result.contains(r#"__element("icons.Home")"#),
            "result: {result}"
        );
    }

    // ========== JSX attribute as element value (rare) ==========

    #[test]
    fn expression_attribute_with_literal_number() {
        let result = transform(
            r#"export function App() {
    return <input tabIndex={0} />;
}"#,
        );
        // Literal expression attribute — not reactive
        assert!(result.contains("setAttribute"), "result: {result}");
    }

    // ========== Empty expression container ==========

    #[test]
    fn empty_expression_container_ignored() {
        let result = transform(
            r#"export function App() {
    return <div>{/* comment */}</div>;
}"#,
        );
        // Empty expression from a comment should not produce __insert or __child
        assert!(!result.contains("__insert("), "result: {result}");
        assert!(!result.contains("__child("), "result: {result}");
    }

    // ========== List rendering (.map) ==========

    #[test]
    fn list_map_basic() {
        let result = transform(
            r#"export function App() {
    const items = [1, 2, 3];
    return <div>{items.map(item => <span>{item}</span>)}</div>;
}"#,
        );
        assert!(result.contains("__list("), "result: {result}");
    }

    #[test]
    fn list_map_with_key() {
        let result = transform(
            r#"export function App() {
    const items = [{ id: 1 }];
    return <div>{items.map(item => <span key={item.id}>{item.id}</span>)}</div>;
}"#,
        );
        assert!(result.contains("__list("), "result: {result}");
        assert!(result.contains("item.id"), "result: {result}");
    }

    #[test]
    fn list_map_with_index() {
        let result = transform(
            r#"export function App() {
    const items = [1, 2, 3];
    return <div>{items.map((item, index) => <span key={index}>{item}</span>)}</div>;
}"#,
        );
        assert!(result.contains("__list("), "result: {result}");
    }

    #[test]
    fn list_map_with_block_body() {
        let result = transform(
            r#"export function App() {
    const items = [1, 2, 3];
    return <div>{items.map(item => {
        const label = "Item: " + item;
        return <span>{label}</span>;
    })}</div>;
}"#,
        );
        assert!(result.contains("__list("), "result: {result}");
    }

    // ========== Component props: expression props become getters ==========

    #[test]
    fn component_expression_prop_reactive_getter() {
        // props.name is reactive (__props reference), so it becomes a getter
        let result = transform(
            r#"export function App({ name }) {
    return <Child title={name} />;
}"#,
        );
        assert!(result.contains("get title()"), "result: {result}");
    }

    #[test]
    fn component_literal_expression_prop() {
        let result = transform(
            r#"export function App() {
    return <Child count={42} />;
}"#,
        );
        assert!(result.contains("count: 42"), "result: {result}");
    }

    #[test]
    fn component_boolean_shorthand_prop() {
        let result = transform(
            r#"export function App() {
    return <Child active />;
}"#,
        );
        assert!(result.contains("active: true"), "result: {result}");
    }

    #[test]
    fn component_spread_prop() {
        let result = transform(
            r#"export function App() {
    const opts = { a: 1 };
    return <Child {...opts} />;
}"#,
        );
        assert!(result.contains("...opts"), "result: {result}");
    }

    #[test]
    fn component_children_single() {
        let result = transform(
            r#"export function App() {
    return <Wrapper><div>content</div></Wrapper>;
}"#,
        );
        assert!(result.contains("children: () =>"), "result: {result}");
    }

    #[test]
    fn component_children_multiple() {
        let result = transform(
            r#"export function App() {
    return <Wrapper><span>a</span><span>b</span></Wrapper>;
}"#,
        );
        // Multiple children → children: () => [...]
        assert!(result.contains("children: () => ["), "result: {result}");
    }

    #[test]
    fn component_key_prop_skipped() {
        let result = transform(
            r#"export function App() {
    return <Child key="k" name="test" />;
}"#,
        );
        // key should not appear in props
        assert!(!result.contains("key:"), "result: {result}");
        assert!(result.contains("name:"), "result: {result}");
    }

    // ========== Reactive attribute expressions ==========

    #[test]
    fn reactive_attr_uses_attr_helper() {
        // Use query API which is in SIGNAL_API_REGISTRY — tasks.data is reactive
        let result = transform(
            r#"import { query } from 'vertz';
export function App() {
    const tasks = query('/api/tasks');
    return <div class={tasks.data}>text</div>;
}"#,
        );
        assert!(result.contains("__attr("), "result: {result}");
    }

    #[test]
    fn reactive_attr_object_literal_wrapped_in_parens() {
        // Reactive style object literal starting with { needs parens
        let result = transform(
            r#"export function App({ color }) {
    return <div style={{ color: color }}>text</div>;
}"#,
        );
        // The expression should be wrapped: () => ({...})
        assert!(
            result.contains("__attr(") || result.contains("__styleStr"),
            "result: {result}"
        );
    }

    #[test]
    fn reactive_idl_property_uses_prop_helper() {
        // Use query API — tasks.data is reactive, value on input → __prop
        let result = transform(
            r#"import { query } from 'vertz';
export function App() {
    const tasks = query('/api/tasks');
    return <input value={tasks.data} />;
}"#,
        );
        assert!(result.contains("__prop("), "result: {result}");
    }

    #[test]
    fn static_expression_attr_guarded() {
        // Static non-literal expression → guarded setAttribute
        let result = transform(
            r#"export function App() {
    const cls = "foo";
    return <div class={cls}>text</div>;
}"#,
        );
        // Static expression → guarded with null check
        assert!(
            result.contains("const __v =") || result.contains("setAttribute"),
            "result: {result}"
        );
    }

    #[test]
    fn static_style_expression_attr() {
        let result = transform(
            r#"export function App() {
    const s = "color: red";
    return <div style={s}>text</div>;
}"#,
        );
        // Static style expression → guarded style setAttribute with __styleStr logic
        assert!(
            result.contains("__styleStr") || result.contains("style"),
            "result: {result}"
        );
    }

    #[test]
    fn static_idl_property_expression() {
        // Static non-literal value on input
        let result = transform(
            r#"export function App() {
    const v = "hello";
    return <input value={v} />;
}"#,
        );
        // Static IDL property expression → guarded direct assignment
        assert!(
            result.contains("const __v =") || result.contains(".value ="),
            "result: {result}"
        );
    }

    // ========== Boolean shorthand on IDL properties ==========

    #[test]
    fn boolean_shorthand_idl_property_checked() {
        let result = transform(
            r#"export function App() {
    return <input checked />;
}"#,
        );
        // checked is boolean IDL → direct assignment: .checked = true
        assert!(result.contains(".checked = true"), "result: {result}");
    }

    // ========== Ref attribute ==========

    #[test]
    fn ref_attribute_assignment() {
        let result = transform(
            r#"export function App() {
    const myRef = {};
    return <div ref={myRef}>text</div>;
}"#,
        );
        assert!(result.contains(".current ="), "result: {result}");
    }

    // ========== Conditional rendering ==========

    #[test]
    fn logical_and_conditional() {
        let result = transform(
            r#"export function App(props) {
    return <div>{props.show && <span>visible</span>}</div>;
}"#,
        );
        assert!(result.contains("__conditional("), "result: {result}");
        assert!(result.contains("null"), "result: {result}");
    }

    #[test]
    fn nested_ternary_deep() {
        let result = transform(
            r#"export function App(props) {
    return <div>{props.a ? <span>A</span> : props.b ? <span>B</span> : <span>C</span>}</div>;
}"#,
        );
        // Nested ternary → nested __conditional calls
        let conditional_count = result.matches("__conditional(").count();
        assert!(
            conditional_count >= 2,
            "expected nested conditionals, result: {result}"
        );
    }

    #[test]
    fn ternary_with_jsx_both_branches() {
        let result = transform(
            r#"export function App(props) {
    return <div>{props.ok ? <span>yes</span> : <span>no</span>}</div>;
}"#,
        );
        assert!(result.contains("__conditional("), "result: {result}");
        assert!(result.contains("__element(\"span\")"), "result: {result}");
    }

    // ========== Deeply nested JSX ==========

    #[test]
    fn deeply_nested_elements() {
        let result = transform(
            r#"export function App() {
    return <div><section><article><p>deep</p></article></section></div>;
}"#,
        );
        assert!(result.contains("__element(\"div\")"), "result: {result}");
        assert!(result.contains("__element(\"p\")"), "result: {result}");
    }

    // ========== Self-closing tags ==========

    #[test]
    fn self_closing_element_no_children() {
        let result = transform(
            r#"export function App() {
    return <br />;
}"#,
        );
        assert!(result.contains("__element(\"br\")"), "result: {result}");
        // No __enterChildren for self-closing
        assert!(!result.contains("__enterChildren"), "result: {result}");
    }

    // ========== className → class mapping on elements ==========

    #[test]
    fn classname_mapped_to_class_on_element() {
        let result = transform(
            r#"export function App() {
    return <div className="container">text</div>;
}"#,
        );
        // On elements, className → class
        assert!(
            result.contains(r#"setAttribute("class""#),
            "result: {result}"
        );
    }

    // ========== Spread without props_param ==========

    #[test]
    fn spread_without_destructured_props() {
        let result = transform(
            r#"export function App() {
    const data = { a: 1 };
    return <div {...data}>text</div>;
}"#,
        );
        assert!(result.contains("__spread("), "result: {result}");
        // No third argument (props_param) when component has no destructured props
        let spread_idx = result.find("__spread(").unwrap();
        let spread_call = &result[spread_idx..];
        let close_paren = spread_call.find(')').unwrap();
        let args = &spread_call[..close_paren];
        // Should be __spread(el, expr) without third param
        assert_eq!(args.matches(',').count(), 1, "result: {result}");
    }

    // ========== Component with JSX in prop value ==========

    #[test]
    fn component_with_jsx_prop_value() {
        let result = transform(
            r#"export function App() {
    return <Layout header={() => <div>Header</div>}>content</Layout>;
}"#,
        );
        // JSX inside prop expression → slice_with_transformed_jsx transforms it
        assert!(result.contains("Layout("), "result: {result}");
        assert!(result.contains("__element(\"div\")"), "result: {result}");
    }

    // ========== Reactivity: signal API props ==========

    #[test]
    fn is_text_reactive_signal_api_props() {
        let rx = ReactivityContext {
            names: HashSet::new(),
            signal_api_props: HashMap::from([(
                "tasks".to_string(),
                HashSet::from(["data".to_string(), "loading".to_string()]),
            )]),
            field_signal_api_vars: HashSet::new(),
            reactive_sources: HashSet::new(),
            inline_locals: HashMap::new(),
            props_param: None,
        };
        assert!(is_text_reactive("tasks.data", &rx));
        assert!(is_text_reactive("tasks.loading", &rx));
        assert!(!is_text_reactive("tasks.other", &rx));
    }

    // ========== Reactivity: reactive sources ==========

    #[test]
    fn is_text_reactive_reactive_sources() {
        let rx = ReactivityContext {
            names: HashSet::new(),
            signal_api_props: HashMap::new(),
            field_signal_api_vars: HashSet::new(),
            reactive_sources: HashSet::from(["auth".to_string()]),
            inline_locals: HashMap::new(),
            props_param: None,
        };
        assert!(is_text_reactive("auth.user", &rx));
        assert!(is_text_reactive("auth.user.avatarUrl", &rx));
        // Just "auth" alone without property access is not reactive
        assert!(!is_text_reactive("auth", &rx));
    }

    // ========== Reactivity: inline locals ==========

    #[test]
    fn is_text_reactive_inline_locals() {
        let rx = ReactivityContext {
            names: HashSet::new(),
            signal_api_props: HashMap::new(),
            field_signal_api_vars: HashSet::new(),
            reactive_sources: HashSet::new(),
            inline_locals: HashMap::from([("isActive".to_string(), "__props.active".to_string())]),
            props_param: None,
        };
        assert!(is_text_reactive("isActive ? 'yes' : 'no'", &rx));
    }

    // ========== apply_inline_subs ==========

    #[test]
    fn apply_inline_subs_replaces_local() {
        let rx = ReactivityContext {
            names: HashSet::new(),
            signal_api_props: HashMap::new(),
            field_signal_api_vars: HashSet::new(),
            reactive_sources: HashSet::new(),
            inline_locals: HashMap::from([("isActive".to_string(), "__props.active".to_string())]),
            props_param: None,
        };
        let result = apply_inline_subs("isActive ? 'yes' : 'no'", &rx);
        assert!(result.contains("(__props.active)"), "result: {result}");
    }

    #[test]
    fn apply_inline_subs_empty_locals() {
        let rx = ReactivityContext {
            names: HashSet::new(),
            signal_api_props: HashMap::new(),
            field_signal_api_vars: HashSet::new(),
            reactive_sources: HashSet::new(),
            inline_locals: HashMap::new(),
            props_param: None,
        };
        assert_eq!(apply_inline_subs("foo", &rx), "foo");
    }

    // ========== key_references_index (additional) ==========

    #[test]
    fn key_references_index_embedded_in_expression() {
        assert!(key_references_index("item.id + '-' + index", "index"));
    }

    #[test]
    fn key_references_index_as_part_of_longer_name() {
        // "indexValue" should NOT match "index"
        assert!(!key_references_index("item.indexValue", "index"));
    }

    // ========== clean_jsx_text ==========

    #[test]
    fn clean_jsx_text_no_newlines() {
        assert_eq!(clean_jsx_text("hello world"), "hello world");
    }

    #[test]
    fn clean_jsx_text_with_newlines() {
        let result = clean_jsx_text("hello\n  world");
        assert_eq!(result, "hello world");
    }

    #[test]
    fn clean_jsx_text_crlf() {
        let result = clean_jsx_text("hello\r\nworld");
        assert_eq!(result, "hello world");
    }

    #[test]
    fn clean_jsx_text_cr() {
        let result = clean_jsx_text("hello\rworld");
        assert_eq!(result, "hello world");
    }

    #[test]
    fn clean_jsx_text_tabs_in_multiline() {
        let result = clean_jsx_text("hello\n\tworld");
        assert_eq!(result, "hello world");
    }

    #[test]
    fn clean_jsx_text_empty_lines_trimmed() {
        let result = clean_jsx_text("hello\n   \nworld");
        assert_eq!(result, "hello world");
    }

    // ========== json_quote ==========

    #[test]
    fn json_quote_escapes_special_chars() {
        assert_eq!(json_quote("he\"llo"), r#""he\"llo""#);
        assert_eq!(json_quote("a\\b"), r#""a\\b""#);
        assert_eq!(json_quote("a\nb"), r#""a\nb""#);
        assert_eq!(json_quote("a\rb"), r#""a\rb""#);
        assert_eq!(json_quote("a\tb"), r#""a\tb""#);
    }

    // ========== is_valid_js_identifier ==========

    #[test]
    fn is_valid_js_identifier_valid() {
        assert!(is_valid_js_identifier("foo"));
        assert!(is_valid_js_identifier("$bar"));
        assert!(is_valid_js_identifier("_baz"));
        assert!(is_valid_js_identifier("a123"));
    }

    #[test]
    fn is_valid_js_identifier_invalid() {
        assert!(!is_valid_js_identifier("data-id"));
        assert!(!is_valid_js_identifier("123abc"));
        assert!(!is_valid_js_identifier(""));
    }

    // ========== Nested JSX callback in non-map context ==========

    #[test]
    fn jsx_in_non_map_callback_collected_separately() {
        // JSX inside Array.from callback (not .map) is collected as separate node
        let result = transform(
            r#"export function App() {
    return <div>{Array.from({ length: 3 }, (_, i) => <span>{i}</span>)}</div>;
}"#,
        );
        // The JSX inside the callback should still be transformed
        assert!(
            result.contains("__element(\"span\")") || result.contains("__insert("),
            "result: {result}"
        );
    }

    // ========== List rendering in component children ==========

    #[test]
    fn list_map_as_component_child() {
        let result = transform(
            r#"export function App() {
    const items = [1, 2, 3];
    return <Wrapper>{items.map(item => <span>{item}</span>)}</Wrapper>;
}"#,
        );
        // In component children context → __listValue
        assert!(result.contains("__listValue("), "result: {result}");
    }

    // ========== Fragment child in element ==========

    #[test]
    fn fragment_child_in_element_children() {
        let result = transform(
            r#"export function App() {
    return <div><>nested fragment</></div>;
}"#,
        );
        assert!(
            result.contains("document.createDocumentFragment()"),
            "result: {result}"
        );
    }

    // ========== Conditional in component children ==========

    #[test]
    fn ternary_in_component_children() {
        let result = transform(
            r#"export function App(props) {
    return <Wrapper>{props.ok ? <span>yes</span> : <span>no</span>}</Wrapper>;
}"#,
        );
        assert!(result.contains("__conditional("), "result: {result}");
    }

    #[test]
    fn logical_and_in_component_children() {
        let result = transform(
            r#"export function App(props) {
    return <Wrapper>{props.ok && <span>shown</span>}</Wrapper>;
}"#,
        );
        assert!(result.contains("__conditional("), "result: {result}");
    }

    // ========== Optional chaining with map ==========

    #[test]
    fn optional_chaining_map() {
        let result = transform(
            r#"export function App() {
    const data = null;
    return <div>{data?.items.map(item => <span>{item}</span>)}</div>;
}"#,
        );
        // Optional chaining map → __list
        assert!(
            result.contains("__list(") || result.contains("__insert("),
            "result: {result}"
        );
    }

    // ========== Parenthesized expression ==========

    #[test]
    fn parenthesized_ternary_expression() {
        let result = transform(
            r#"export function App(props) {
    return <div>{(props.ok ? "yes" : "no")}</div>;
}"#,
        );
        assert!(result.contains("__conditional("), "result: {result}");
    }

    // ========== Data attribute (hyphenated) ==========

    #[test]
    fn data_attribute_hyphenated() {
        let result = transform(
            r#"export function App() {
    return <div data-testid="foo">text</div>;
}"#,
        );
        assert!(
            result.contains(r#"setAttribute("data-testid""#),
            "result: {result}"
        );
    }

    // ========== Key attribute filtered from element attrs ==========

    #[test]
    fn key_attribute_filtered_from_element() {
        let result = transform(
            r#"export function App() {
    return <div key="k" id="main">text</div>;
}"#,
        );
        // key should not appear in setAttribute calls
        assert!(
            !result.contains(r#"setAttribute("key""#),
            "result: {result}"
        );
        assert!(result.contains(r#"setAttribute("id""#), "result: {result}");
    }

    // ========== Multiple components in same file ==========

    #[test]
    fn multiple_components_transformed() {
        let result = transform(
            r#"export function Header() {
    return <header>head</header>;
}
export function Footer() {
    return <footer>foot</footer>;
}"#,
        );
        assert!(result.contains("__element(\"header\")"), "result: {result}");
        assert!(result.contains("__element(\"footer\")"), "result: {result}");
    }

    // ========== Component with no props ==========

    #[test]
    fn component_no_props() {
        let result = transform(
            r#"export function App() {
    return <Child />;
}"#,
        );
        assert!(result.contains("Child({})"), "result: {result}");
    }

    // ========== Event handler with expression ==========

    #[test]
    fn event_handler_inline_arrow() {
        let result = transform(
            r#"export function App() {
    return <button onClick={() => console.log("clicked")}>click</button>;
}"#,
        );
        assert!(result.contains("__on("), "result: {result}");
        assert!(result.contains("\"click\""), "result: {result}");
    }

    // ========== Reactive child with signal .value ==========

    #[test]
    fn reactive_child_with_signal_value() {
        // After signal transform, signal access looks like count.value
        // We simulate by creating a signal variable in the analyzer
        let result = transform(
            r#"import { query } from 'vertz';
export function App() {
    const tasks = query('/api/tasks');
    return <div>{tasks.data}</div>;
}"#,
        );
        // tasks is a signal API → tasks.data is reactive → __child
        assert!(result.contains("__child("), "result: {result}");
    }

    // ========== Conditional with jsx branch transform ==========

    #[test]
    fn conditional_jsx_true_branch_transformed() {
        let result = transform(
            r#"export function App(props) {
    return <div>{props.logged ? <span>Hello</span> : "Guest"}</div>;
}"#,
        );
        assert!(result.contains("__conditional("), "result: {result}");
        assert!(result.contains("__element(\"span\")"), "result: {result}");
    }

    // ========== Component children: text only ==========

    #[test]
    fn component_children_text_only() {
        let result = transform(
            r#"export function App() {
    return <Wrapper>just text</Wrapper>;
}"#,
        );
        assert!(result.contains("children:"), "result: {result}");
        assert!(result.contains("__staticText("), "result: {result}");
    }

    // ========== Component children: expression child ==========

    #[test]
    fn component_children_expression() {
        let result = transform(
            r#"export function App() {
    const x = 5;
    return <Wrapper>{x}</Wrapper>;
}"#,
        );
        assert!(result.contains("children:"), "result: {result}");
    }

    // ========== Reactive component children ==========

    #[test]
    fn component_children_reactive_expression() {
        // Use query API — tasks.data is reactive → __child in component children
        let result = transform(
            r#"import { query } from 'vertz';
export function App() {
    const tasks = query('/api/tasks');
    return <Wrapper>{tasks.data}</Wrapper>;
}"#,
        );
        assert!(result.contains("children:"), "result: {result}");
        assert!(result.contains("__child("), "result: {result}");
    }

    // ========== Static expression attribute with guard for null ==========

    #[test]
    fn static_expression_attr_null_guard() {
        let result = transform(
            r#"export function App() {
    const cls = getClass();
    return <div class={cls}>text</div>;
}"#,
        );
        // Static non-literal expression → guarded with null/false check
        assert!(result.contains("const __v ="), "result: {result}");
        assert!(
            result.contains("__v != null && __v !== false"),
            "result: {result}"
        );
    }

    // ========== Key attribute as expression on element ==========

    #[test]
    fn key_expression_attr_filtered() {
        let result = transform(
            r#"export function App() {
    const k = "mykey";
    return <div key={k} id="main">text</div>;
}"#,
        );
        assert!(
            !result.contains("\"key\""),
            "key attr should be filtered, result: {result}"
        );
    }

    // ========== Boolean shorthand key attribute filtered ==========

    #[test]
    fn key_boolean_shorthand_filtered() {
        let result = transform(
            r#"export function App() {
    return <div key id="main">text</div>;
}"#,
        );
        assert!(result.contains(r#"setAttribute("id""#), "result: {result}");
    }

    // ========== Component key expression prop skipped ==========

    #[test]
    fn component_key_expression_prop_skipped() {
        let result = transform(
            r#"export function App() {
    return <Child key={1} name="test" />;
}"#,
        );
        assert!(!result.contains("key:"), "result: {result}");
    }

    // ========== Component key boolean shorthand skipped ==========

    #[test]
    fn component_key_boolean_shorthand_skipped() {
        let result = transform(
            r#"export function App() {
    return <Child key name="test" />;
}"#,
        );
        assert!(!result.contains("key:"), "result: {result}");
    }
}
