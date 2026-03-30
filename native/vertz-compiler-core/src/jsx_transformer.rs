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
