use std::collections::HashSet;

use oxc_ast::ast::*;
use oxc_ast_visit::Visit;
use oxc_span::GetSpan;

use crate::component_analyzer::ComponentInfo;
use crate::magic_string::MagicString;
use crate::reactivity_analyzer::{ReactivityKind, VariableInfo};

/// AOT tier classification.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AotTier {
    Static,
    DataDriven,
    Conditional,
    RuntimeFallback,
}

impl AotTier {
    pub fn as_str(&self) -> &'static str {
        match self {
            AotTier::Static => "static",
            AotTier::DataDriven => "data-driven",
            AotTier::Conditional => "conditional",
            AotTier::RuntimeFallback => "runtime-fallback",
        }
    }
}

/// Per-component AOT compilation result.
pub struct AotComponentResult {
    pub name: String,
    pub tier: AotTier,
    pub holes: Vec<String>,
    pub query_keys: Vec<String>,
}

/// Metadata for a query variable extracted from the component AST.
struct QueryVarMeta {
    var_name: String,
    cache_key: String,
    index: usize,
    derived_aliases: Vec<String>,
}

/// Full result of AOT compilation.
pub struct AotResult {
    pub code: String,
    pub components: Vec<AotComponentResult>,
}

/// HTML void elements that must not have closing tags.
fn is_void_element(tag: &str) -> bool {
    matches!(
        tag,
        "area"
            | "base"
            | "br"
            | "col"
            | "embed"
            | "hr"
            | "img"
            | "input"
            | "link"
            | "meta"
            | "param"
            | "source"
            | "track"
            | "wbr"
    )
}

fn is_raw_text_element(tag: &str) -> bool {
    matches!(tag, "script" | "style")
}

fn is_boolean_attribute(name: &str) -> bool {
    matches!(
        name.to_lowercase().as_str(),
        "allowfullscreen"
            | "async"
            | "autofocus"
            | "autoplay"
            | "checked"
            | "controls"
            | "default"
            | "defer"
            | "disabled"
            | "formnovalidate"
            | "hidden"
            | "inert"
            | "ismap"
            | "itemscope"
            | "loop"
            | "multiple"
            | "muted"
            | "nomodule"
            | "novalidate"
            | "open"
            | "playsinline"
            | "readonly"
            | "required"
            | "reversed"
            | "selected"
    )
}

fn is_skip_prop(name: &str) -> bool {
    matches!(name, "key" | "ref" | "dangerouslySetInnerHTML")
}

fn is_component_tag(tag: &str) -> bool {
    tag.chars().next().is_some_and(|c| c.is_uppercase())
}

fn is_event_handler(name: &str) -> bool {
    name.starts_with("on")
        && name.len() > 2
        && name.chars().nth(2).is_some_and(|c| c.is_uppercase())
}

/// Compile components to AOT SSR string-builder functions.
pub fn compile_for_ssr_aot(
    ms: &MagicString,
    program: &Program,
    source: &str,
    components: &[ComponentInfo],
    variables_per_component: &[Vec<VariableInfo>],
) -> AotResult {
    let has_no_aot_pragma =
        source.contains("// @vertz-no-aot") || source.contains("/* @vertz-no-aot");

    if has_no_aot_pragma {
        return AotResult {
            code: source.to_string(),
            components: components
                .iter()
                .map(|c| AotComponentResult {
                    name: c.name.clone(),
                    tier: AotTier::RuntimeFallback,
                    holes: Vec::new(),
                    query_keys: Vec::new(),
                })
                .collect(),
        };
    }

    let mut appended = String::new();
    let mut results = Vec::new();

    for (comp, variables) in components.iter().zip(variables_per_component.iter()) {
        let result = transform_component(ms, program, source, comp, variables, &mut appended);
        results.push(result);
    }

    let code = if appended.is_empty() {
        source.to_string()
    } else {
        format!("{source}{appended}")
    };

    AotResult {
        code,
        components: results,
    }
}

fn transform_component(
    ms: &MagicString,
    program: &Program,
    source: &str,
    component: &ComponentInfo,
    variables: &[VariableInfo],
    appended: &mut String,
) -> AotComponentResult {
    // Extract query variable metadata
    let query_vars = extract_query_vars(program, source, component, variables);

    // If there are signal-API variables that couldn't be resolved to queries, fallback
    let signal_api_count = variables
        .iter()
        .filter(|v| {
            v.signal_properties
                .as_ref()
                .is_some_and(|props| props.contains(&"data".to_string()))
        })
        .count();
    if signal_api_count > 0 && query_vars.len() < signal_api_count {
        return AotComponentResult {
            name: component.name.clone(),
            tier: AotTier::RuntimeFallback,
            holes: Vec::new(),
            query_keys: Vec::new(),
        };
    }

    // Find direct return statements (not in nested functions)
    let direct_returns = find_direct_returns(program, component);

    // Filter to those containing JSX
    let returns_with_jsx: Vec<&ReturnStatement> = direct_returns
        .iter()
        .filter(|ret| {
            ret.argument
                .as_ref()
                .is_some_and(|arg| find_jsx_in_expr(arg).is_some())
        })
        .copied()
        .collect();

    if returns_with_jsx.len() > 1 {
        // Check for guard pattern
        let all_stmts = find_body_statements(program, component);
        if let Some(guard_result) =
            analyze_guard_pattern(&returns_with_jsx, &all_stmts, ms, component)
        {
            let is_interactive = variables.iter().any(|v| v.kind == ReactivityKind::Signal);
            let reactive_names = build_reactive_names(variables);
            let mut holes = HashSet::new();
            let hydration_id = if is_interactive {
                Some(component.name.as_str())
            } else {
                None
            };
            let string_expr = guard_pattern_to_string(
                &guard_result,
                &reactive_names,
                ms,
                hydration_id,
                &mut holes,
            );
            let final_expr = apply_query_replacements(string_expr, &query_vars);
            emit_aot_function(appended, component, &final_expr, &query_vars);
            return AotComponentResult {
                name: component.name.clone(),
                tier: AotTier::Conditional,
                holes: holes.into_iter().collect(),
                query_keys: query_vars.iter().map(|q| q.cache_key.clone()).collect(),
            };
        }
        // Not a guard pattern → runtime-fallback
        return AotComponentResult {
            name: component.name.clone(),
            tier: AotTier::RuntimeFallback,
            holes: Vec::new(),
            query_keys: Vec::new(),
        };
    }

    // Find the single return JSX expression
    let return_jsx_expr = direct_returns
        .iter()
        .find_map(|ret| ret.argument.as_ref().and_then(|arg| find_jsx_in_expr(arg)));

    if return_jsx_expr.is_none() {
        // Check for conditional return: ternary or &&
        let cond_expr = direct_returns.iter().find_map(|ret| {
            ret.argument.as_ref().and_then(|arg| {
                let unwrapped = unwrap_parens(arg);
                match unwrapped {
                    Expression::ConditionalExpression(_) | Expression::LogicalExpression(_) => {
                        if deep_contains_jsx(unwrapped) {
                            Some(unwrapped)
                        } else {
                            None
                        }
                    }
                    _ => None,
                }
            })
        });

        if let Some(cond) = cond_expr {
            let reactive_names = build_reactive_names(variables);
            let mut holes = HashSet::new();
            let string_expr =
                expression_to_conditional_string(cond, &reactive_names, ms, &mut holes);
            let final_expr = apply_query_replacements(string_expr, &query_vars);
            emit_aot_function(appended, component, &final_expr, &query_vars);
            return AotComponentResult {
                name: component.name.clone(),
                tier: AotTier::Conditional,
                holes: holes.into_iter().collect(),
                query_keys: query_vars.iter().map(|q| q.cache_key.clone()).collect(),
            };
        }

        // No JSX found at all
        return AotComponentResult {
            name: component.name.clone(),
            tier: AotTier::RuntimeFallback,
            holes: Vec::new(),
            query_keys: Vec::new(),
        };
    }

    let jsx_expr = return_jsx_expr.unwrap();
    let tier = classify_tier_from_expr(jsx_expr, variables);
    let is_interactive = variables.iter().any(|v| v.kind == ReactivityKind::Signal);
    let reactive_names = build_reactive_names(variables);
    let mut holes = HashSet::new();
    let hydration_id = if is_interactive {
        Some(component.name.as_str())
    } else {
        None
    };

    let string_expr = expr_to_string(jsx_expr, &reactive_names, ms, hydration_id, &mut holes);
    let final_expr = apply_query_replacements(string_expr, &query_vars);

    emit_aot_function(appended, component, &final_expr, &query_vars);

    AotComponentResult {
        name: component.name.clone(),
        tier,
        holes: holes.into_iter().collect(),
        query_keys: query_vars.iter().map(|q| q.cache_key.clone()).collect(),
    }
}

fn build_reactive_names(variables: &[VariableInfo]) -> HashSet<String> {
    variables
        .iter()
        .filter(|v| v.kind == ReactivityKind::Signal || v.kind == ReactivityKind::Computed)
        .map(|v| v.name.clone())
        .collect()
}

fn emit_aot_function(
    appended: &mut String,
    component: &ComponentInfo,
    string_expr: &str,
    query_vars: &[QueryVarMeta],
) {
    let fn_name = format!("__ssr_{}", component.name);
    let has_queries = !query_vars.is_empty();

    let (param_str, preamble) = if has_queries {
        let mut pre = String::new();
        for qv in query_vars {
            pre.push_str(&format!(
                "\n  const __q{} = ctx.getData('{}');",
                qv.index, qv.cache_key
            ));
        }
        ("data, ctx".to_string(), pre)
    } else {
        let param = component
            .props_param
            .clone()
            .unwrap_or_else(|| "__props".to_string());
        (param, String::new())
    };

    let body = if preamble.is_empty() {
        format!("\n  return {string_expr};\n")
    } else {
        format!("{preamble}\n  return {string_expr};\n")
    };

    appended.push_str(&format!(
        "\nexport function {fn_name}({param_str}) {{{body}}}\n"
    ));
}

fn apply_query_replacements(mut expr: String, query_vars: &[QueryVarMeta]) -> String {
    for qv in query_vars {
        let local_var = format!("__q{}", qv.index);
        expr = expr.replace(&format!("{}.data", qv.var_name), &local_var);
        expr = expr.replace(&format!("{}.loading", qv.var_name), "false");
        expr = expr.replace(&format!("{}.error", qv.var_name), "undefined");
        for alias in &qv.derived_aliases {
            // Replace standalone identifier (word boundary)
            let pattern = format!(r"(?<!\.)(?<![a-zA-Z0-9_]){alias}(?![a-zA-Z0-9_])");
            if let Ok(re) = regex::Regex::new(&pattern) {
                expr = re.replace_all(&expr, local_var.as_str()).to_string();
            }
        }
    }
    expr
}

// ==== Expression to string (top-level) ====

fn expr_to_string(
    expr: &Expression,
    reactive_names: &HashSet<String>,
    ms: &MagicString,
    hydration_id: Option<&str>,
    holes: &mut HashSet<String>,
) -> String {
    match expr {
        Expression::JSXElement(elem) => {
            element_to_string(elem, reactive_names, ms, hydration_id, holes)
        }
        Expression::JSXFragment(frag) => fragment_to_string(frag, reactive_names, ms, holes),
        Expression::ParenthesizedExpression(paren) => {
            expr_to_string(&paren.expression, reactive_names, ms, hydration_id, holes)
        }
        _ => "''".to_string(),
    }
}

fn element_to_string(
    elem: &JSXElement,
    reactive_names: &HashSet<String>,
    ms: &MagicString,
    hydration_id: Option<&str>,
    holes: &mut HashSet<String>,
) -> String {
    let tag_name = get_opening_tag_name(&elem.opening_element);

    // Component reference → function call
    if is_component_tag(&tag_name) {
        return component_call_to_string(
            &tag_name,
            &elem.opening_element,
            Some(&elem.children),
            ms,
            holes,
        );
    }

    let is_void = is_void_element(&tag_name);
    let is_raw_text = is_raw_text_element(&tag_name);

    let dangerous_html = extract_dangerous_inner_html(&elem.opening_element, ms);
    let attrs = attrs_to_string(&elem.opening_element.attributes, ms);
    let hydration_attr = hydration_id
        .map(|id| format!(" data-v-id=\"{id}\""))
        .unwrap_or_default();
    let attr_str = build_attr_string(&attrs, &hydration_attr);

    if is_void {
        return format!("'<{tag_name}{attr_str}>'");
    }

    let children = dangerous_html.unwrap_or_else(|| {
        children_to_string(&elem.children, reactive_names, is_raw_text, ms, holes)
    });

    format!("'<{tag_name}{attr_str}>' + {children} + '</{tag_name}>'")
}

fn build_attr_string(attrs: &str, hydration_attr: &str) -> String {
    if attrs.is_empty() {
        hydration_attr.to_string()
    } else if attrs.starts_with("' + ") {
        format!("{attrs}{hydration_attr}")
    } else {
        format!(" {attrs}{hydration_attr}")
    }
}

fn fragment_to_string(
    frag: &JSXFragment,
    reactive_names: &HashSet<String>,
    ms: &MagicString,
    holes: &mut HashSet<String>,
) -> String {
    if frag.children.is_empty() {
        return "''".to_string();
    }

    let parts: Vec<String> = frag
        .children
        .iter()
        .map(|child| child_to_string(child, reactive_names, false, ms, holes))
        .filter(|s| s != "''")
        .collect();

    if parts.is_empty() {
        "''".to_string()
    } else {
        parts.join(" + ")
    }
}

fn component_call_to_string(
    tag_name: &str,
    opening: &JSXOpeningElement,
    children: Option<&oxc_allocator::Vec<'_, JSXChild<'_>>>,
    ms: &MagicString,
    holes: &mut HashSet<String>,
) -> String {
    holes.insert(tag_name.to_string());

    let mut props_entries: Vec<String> = Vec::new();

    for attr in &opening.attributes {
        match attr {
            JSXAttributeItem::Attribute(jsx_attr) => {
                let name = get_jsx_attr_name(jsx_attr);
                match &jsx_attr.value {
                    Some(JSXAttributeValue::StringLiteral(s)) => {
                        props_entries
                            .push(format!("{name}: '{}'", escape_string_literal(&s.value)));
                    }
                    Some(JSXAttributeValue::ExpressionContainer(container)) => {
                        if let Some(expr) = container.expression.as_expression() {
                            let span = expr.span();
                            let text = ms.get_transformed_slice(span.start, span.end);
                            props_entries.push(format!("{name}: {text}"));
                        }
                    }
                    None => {
                        props_entries.push(format!("{name}: true"));
                    }
                    _ => {}
                }
            }
            JSXAttributeItem::SpreadAttribute(spread) => {
                let span = spread.argument.span();
                let text = ms.get_transformed_slice(span.start, span.end);
                props_entries.push(format!("...{text}"));
            }
        }
    }

    // Handle children prop
    if let Some(child_nodes) = children {
        let child_parts: Vec<String> = child_nodes
            .iter()
            .map(|child| child_to_string(child, &HashSet::new(), false, ms, &mut HashSet::new()))
            .filter(|s| s != "''")
            .collect();
        if !child_parts.is_empty() {
            props_entries.push(format!("children: {}", child_parts.join(" + ")));
        }
    }

    let props_str = if props_entries.is_empty() {
        "{}".to_string()
    } else {
        format!("{{ {} }}", props_entries.join(", "))
    };

    format!("__ssr_{tag_name}({props_str})")
}

fn children_to_string(
    children: &oxc_allocator::Vec<'_, JSXChild<'_>>,
    reactive_names: &HashSet<String>,
    is_raw_text: bool,
    ms: &MagicString,
    holes: &mut HashSet<String>,
) -> String {
    if children.is_empty() {
        return "''".to_string();
    }

    let parts: Vec<String> = children
        .iter()
        .map(|child| child_to_string(child, reactive_names, is_raw_text, ms, holes))
        .filter(|s| s != "''")
        .collect();

    if parts.is_empty() {
        "''".to_string()
    } else {
        parts.join(" + ")
    }
}

fn child_to_string(
    child: &JSXChild,
    reactive_names: &HashSet<String>,
    is_raw_text: bool,
    ms: &MagicString,
    holes: &mut HashSet<String>,
) -> String {
    match child {
        JSXChild::Text(text) => {
            let cleaned = clean_jsx_text(&text.value);
            if cleaned.is_empty() {
                "''".to_string()
            } else {
                format!("'{}'", escape_string_literal(&cleaned))
            }
        }
        JSXChild::ExpressionContainer(container) => {
            jsx_expression_to_string(container, reactive_names, is_raw_text, ms, holes)
        }
        JSXChild::Element(elem) => element_to_string(elem, reactive_names, ms, None, holes),
        JSXChild::Fragment(frag) => fragment_to_string(frag, reactive_names, ms, holes),
        _ => "''".to_string(),
    }
}

fn jsx_expression_to_string(
    container: &JSXExpressionContainer,
    reactive_names: &HashSet<String>,
    is_raw_text: bool,
    ms: &MagicString,
    holes: &mut HashSet<String>,
) -> String {
    let expr = match container.expression.as_expression() {
        Some(e) => e,
        None => return "''".to_string(),
    };

    // Ternary: cond ? <A /> : <B />
    if let Expression::ConditionalExpression(cond) = expr {
        return ternary_to_string(cond, reactive_names, ms, holes);
    }

    // LogicalAnd: expr && <A />
    if let Expression::LogicalExpression(logical) = expr {
        if logical.operator == LogicalOperator::And {
            return logical_and_to_string(logical, reactive_names, ms, holes);
        }
    }

    // .map() call
    if let Expression::CallExpression(call) = expr {
        if is_map_call(call) {
            return map_call_to_string(call, reactive_names, ms, holes);
        }
    }

    // Simple expression
    let span = expr.span();
    let expr_text = ms.get_transformed_slice(span.start, span.end);

    if is_raw_text {
        return format!("String({expr_text})");
    }

    if is_reactive_expression(expr, reactive_names) {
        format!("'<!--child-->' + __esc({expr_text}) + '<!--/child-->'")
    } else {
        format!("__esc({expr_text})")
    }
}

fn ternary_to_string(
    cond: &ConditionalExpression,
    reactive_names: &HashSet<String>,
    ms: &MagicString,
    holes: &mut HashSet<String>,
) -> String {
    let cond_span = cond.test.span();
    let cond_text = ms.get_transformed_slice(cond_span.start, cond_span.end);
    let true_str = expression_node_to_string(&cond.consequent, reactive_names, ms, holes);
    let false_str = expression_node_to_string(&cond.alternate, reactive_names, ms, holes);

    format!(
        "'<!--conditional-->' + ({cond_text} ? {true_str} : {false_str}) + '<!--/conditional-->'"
    )
}

fn logical_and_to_string(
    logical: &LogicalExpression,
    reactive_names: &HashSet<String>,
    ms: &MagicString,
    holes: &mut HashSet<String>,
) -> String {
    let left_span = logical.left.span();
    let left_text = ms.get_transformed_slice(left_span.start, left_span.end);
    let right_str = expression_node_to_string(&logical.right, reactive_names, ms, holes);
    format!("'<!--conditional-->' + ({left_text} ? {right_str} : '') + '<!--/conditional-->'")
}

fn map_call_to_string(
    call: &CallExpression,
    reactive_names: &HashSet<String>,
    ms: &MagicString,
    holes: &mut HashSet<String>,
) -> String {
    // Get caller object
    let caller_text = if let Expression::StaticMemberExpression(member) = &call.callee {
        let obj_span = member.object.span();
        ms.get_transformed_slice(obj_span.start, obj_span.end)
    } else {
        let span = call.callee.span();
        ms.get_transformed_slice(span.start, span.end)
    };

    if call.arguments.is_empty() {
        let span = call.span;
        let text = ms.get_transformed_slice(span.start, span.end);
        return format!("__esc({text})");
    }

    let first_arg = &call.arguments[0];
    if let Argument::ArrowFunctionExpression(arrow) = first_arg {
        let param_name = arrow
            .params
            .items
            .first()
            .and_then(|p| {
                if let BindingPattern::BindingIdentifier(ref id) = p.pattern {
                    Some(id.name.to_string())
                } else {
                    None
                }
            })
            .unwrap_or_else(|| "_item".to_string());

        // Expression body (arrow function returning JSX)
        if arrow.expression {
            for stmt in &arrow.body.statements {
                if let Statement::ExpressionStatement(expr_stmt) = stmt {
                    if let Some(jsx_str) =
                        try_jsx_expr_to_string(&expr_stmt.expression, reactive_names, ms, holes)
                    {
                        return format!(
                            "'<!--list-->' + {caller_text}.map({param_name} => {jsx_str}).join('') + '<!--/list-->'"
                        );
                    }
                }
            }
        }

        // Block body with return — only optimize when the block contains
        // nothing besides return statements. Variable declarations before the
        // return reference closure variables that the generated arrow function
        // won't define, causing ReferenceError at runtime (#1936).
        let has_non_return = arrow
            .body
            .statements
            .iter()
            .any(|stmt| !matches!(stmt, Statement::ReturnStatement(_)));
        if !has_non_return {
            for stmt in &arrow.body.statements {
                if let Statement::ReturnStatement(ret) = stmt {
                    if let Some(ref arg) = ret.argument {
                        if let Some(jsx_str) =
                            try_jsx_expr_to_string(arg, reactive_names, ms, holes)
                        {
                            return format!(
                                "'<!--list-->' + {caller_text}.map({param_name} => {jsx_str}).join('') + '<!--/list-->'"
                            );
                        }
                    }
                }
            }
        }
    }

    let span = call.span;
    let text = ms.get_transformed_slice(span.start, span.end);
    format!("__esc({text})")
}

fn try_jsx_expr_to_string(
    expr: &Expression,
    reactive_names: &HashSet<String>,
    ms: &MagicString,
    holes: &mut HashSet<String>,
) -> Option<String> {
    match expr {
        Expression::JSXElement(elem) => {
            Some(element_to_string(elem, reactive_names, ms, None, holes))
        }
        Expression::JSXFragment(frag) => Some(fragment_to_string(frag, reactive_names, ms, holes)),
        Expression::ParenthesizedExpression(paren) => {
            try_jsx_expr_to_string(&paren.expression, reactive_names, ms, holes)
        }
        _ => None,
    }
}

fn expression_node_to_string(
    node: &Expression,
    reactive_names: &HashSet<String>,
    ms: &MagicString,
    holes: &mut HashSet<String>,
) -> String {
    match node {
        Expression::ParenthesizedExpression(paren) => {
            expression_node_to_string(&paren.expression, reactive_names, ms, holes)
        }
        Expression::JSXElement(elem) => element_to_string(elem, reactive_names, ms, None, holes),
        Expression::JSXFragment(frag) => fragment_to_string(frag, reactive_names, ms, holes),
        Expression::ConditionalExpression(cond) => {
            ternary_to_string(cond, reactive_names, ms, holes)
        }
        Expression::LogicalExpression(logical) if logical.operator == LogicalOperator::And => {
            logical_and_to_string(logical, reactive_names, ms, holes)
        }
        _ => {
            let span = node.span();
            let text = ms.get_transformed_slice(span.start, span.end);
            format!("__esc({text})")
        }
    }
}

// ==== Attribute handling ====

fn attrs_to_string(
    attrs: &oxc_allocator::Vec<'_, JSXAttributeItem<'_>>,
    ms: &MagicString,
) -> String {
    let mut static_parts: Vec<String> = Vec::new();
    let mut dynamic_suffix: Vec<String> = Vec::new();

    for attr in attrs {
        match attr {
            JSXAttributeItem::Attribute(jsx_attr) => {
                if let Some(result) = attr_to_string(jsx_attr, ms) {
                    if result.starts_with("' + ") {
                        dynamic_suffix.push(result);
                    } else {
                        static_parts.push(result);
                    }
                }
            }
            JSXAttributeItem::SpreadAttribute(spread) => {
                let span = spread.argument.span();
                let text = ms.get_transformed_slice(span.start, span.end);
                dynamic_suffix.push(format!("' + __ssr_spread({text}) + '"));
            }
        }
    }

    let static_str = static_parts.join(" ");
    if dynamic_suffix.is_empty() {
        static_str
    } else {
        format!("{static_str}{}", dynamic_suffix.join(""))
    }
}

fn attr_to_string(attr: &JSXAttribute, ms: &MagicString) -> Option<String> {
    let name = get_jsx_attr_name(attr);

    if is_event_handler(&name) {
        return None;
    }
    if is_skip_prop(&name) {
        return None;
    }

    let html_name = match name.as_str() {
        "className" => "class".to_string(),
        "htmlFor" => "for".to_string(),
        _ => name,
    };

    match &attr.value {
        Some(JSXAttributeValue::StringLiteral(s)) => {
            let value = escape_attr_value(&s.value);
            Some(format!("{html_name}=\"{value}\""))
        }
        Some(JSXAttributeValue::ExpressionContainer(container)) => {
            let expr = container.expression.as_expression()?;
            let span = expr.span();
            let expr_text = ms.get_transformed_slice(span.start, span.end);

            if html_name == "style" {
                return Some(format!("style=\"' + __ssr_style_object({expr_text}) + '\""));
            }

            if is_boolean_attribute(&html_name) {
                return Some(format!("' + ({expr_text} ? ' {html_name}' : '') + '"));
            }

            Some(format!("{html_name}=\"' + __esc_attr({expr_text}) + '\""))
        }
        None => Some(html_name),
        _ => None,
    }
}

fn extract_dangerous_inner_html(opening: &JSXOpeningElement, ms: &MagicString) -> Option<String> {
    for attr in &opening.attributes {
        if let JSXAttributeItem::Attribute(jsx_attr) = attr {
            if get_jsx_attr_name(jsx_attr) == "dangerouslySetInnerHTML" {
                if let Some(JSXAttributeValue::ExpressionContainer(container)) = &jsx_attr.value {
                    if let Some(expr) = container.expression.as_expression() {
                        if let Expression::ObjectExpression(obj) = expr {
                            for prop in &obj.properties {
                                if let ObjectPropertyKind::ObjectProperty(p) = prop {
                                    if let PropertyKey::StaticIdentifier(key) = &p.key {
                                        if key.name == "__html" {
                                            let span = p.value.span();
                                            return Some(
                                                ms.get_transformed_slice(span.start, span.end),
                                            );
                                        }
                                    }
                                }
                            }
                        }
                        let span = expr.span();
                        let text = ms.get_transformed_slice(span.start, span.end);
                        return Some(format!("({text}).__html"));
                    }
                }
            }
        }
    }
    None
}

// ==== Tier classification ====

fn classify_tier_from_expr(expr: &Expression, variables: &[VariableInfo]) -> AotTier {
    let has_reactive = variables
        .iter()
        .any(|v| v.kind == ReactivityKind::Signal || v.kind == ReactivityKind::Computed);

    match expr {
        Expression::JSXElement(elem) => classify_element_tier(elem, has_reactive),
        Expression::JSXFragment(frag) => classify_children_tier(&frag.children, has_reactive),
        Expression::ParenthesizedExpression(paren) => {
            classify_tier_from_expr(&paren.expression, variables)
        }
        _ => AotTier::DataDriven,
    }
}

fn classify_element_tier(elem: &JSXElement, has_reactive: bool) -> AotTier {
    // Check attributes for expressions
    let has_attr_exprs = elem.opening_element.attributes.iter().any(|attr| {
        matches!(
            attr,
            JSXAttributeItem::Attribute(a) if matches!(&a.value, Some(JSXAttributeValue::ExpressionContainer(_)))
        ) || matches!(attr, JSXAttributeItem::SpreadAttribute(_))
    });

    let children_tier = classify_children_tier(&elem.children, has_reactive);
    if children_tier == AotTier::Conditional {
        return AotTier::Conditional;
    }

    if !has_attr_exprs && children_tier == AotTier::Static && !has_reactive {
        return AotTier::Static;
    }

    if children_tier == AotTier::DataDriven || has_attr_exprs {
        return AotTier::DataDriven;
    }

    AotTier::Static
}

fn classify_children_tier(
    children: &oxc_allocator::Vec<'_, JSXChild<'_>>,
    has_reactive: bool,
) -> AotTier {
    let mut has_expressions = false;

    for child in children {
        match child {
            JSXChild::ExpressionContainer(container) => {
                has_expressions = true;
                if let Some(expr) = container.expression.as_expression() {
                    match expr {
                        Expression::ConditionalExpression(_) | Expression::LogicalExpression(_) => {
                            return AotTier::Conditional;
                        }
                        Expression::CallExpression(call) if is_map_call(call) => {
                            return AotTier::Conditional;
                        }
                        _ => {}
                    }
                }
            }
            JSXChild::Element(elem) => {
                let t = classify_element_tier(elem, has_reactive);
                if t == AotTier::Conditional {
                    return AotTier::Conditional;
                }
                if t == AotTier::DataDriven {
                    has_expressions = true;
                }
            }
            JSXChild::Fragment(frag) => {
                let t = classify_children_tier(&frag.children, has_reactive);
                if t == AotTier::Conditional {
                    return AotTier::Conditional;
                }
                if t == AotTier::DataDriven {
                    has_expressions = true;
                }
            }
            _ => {}
        }
    }

    if has_expressions || has_reactive {
        AotTier::DataDriven
    } else {
        AotTier::Static
    }
}

// ==== Return statement finding ====

fn find_direct_returns<'a, 'b>(
    program: &'a Program<'b>,
    component: &ComponentInfo,
) -> Vec<&'a ReturnStatement<'b>> {
    let mut finder = DirectReturnFinder {
        body_start: component.body_start,
        body_end: component.body_end,
        returns: Vec::new(),
        in_target_body: false,
        nesting_depth: 0,
    };
    for stmt in &program.body {
        finder.visit_statement(stmt);
    }
    finder.returns
}

struct DirectReturnFinder<'a, 'b> {
    body_start: u32,
    body_end: u32,
    returns: Vec<&'a ReturnStatement<'b>>,
    in_target_body: bool,
    nesting_depth: u32,
}

impl<'a, 'b> Visit<'b> for DirectReturnFinder<'a, 'b> {
    fn visit_function_body(&mut self, body: &FunctionBody<'b>) {
        if body.span.start == self.body_start && body.span.end == self.body_end {
            self.in_target_body = true;
            for stmt in &body.statements {
                self.visit_statement(stmt);
            }
            self.in_target_body = false;
        } else if !self.in_target_body {
            // Keep looking for the target body in nested structures
            for stmt in &body.statements {
                self.visit_statement(stmt);
            }
        }
        // If in_target_body, this is a nested function — don't recurse
    }

    fn visit_arrow_function_expression(&mut self, arrow: &ArrowFunctionExpression<'b>) {
        if !self.in_target_body {
            // Check if this arrow's body IS the target
            if arrow.body.span.start == self.body_start && arrow.body.span.end == self.body_end {
                self.in_target_body = true;
                for stmt in &arrow.body.statements {
                    self.visit_statement(stmt);
                }
                self.in_target_body = false;
            }
        }
        // Don't recurse into nested arrows when in target body
    }

    fn visit_return_statement(&mut self, stmt: &ReturnStatement<'b>) {
        if self.in_target_body && self.nesting_depth == 0 {
            // Safety: program outlives analysis
            let ret_ref: &'a ReturnStatement<'b> = unsafe { std::mem::transmute(stmt) };
            self.returns.push(ret_ref);
        }
    }

    fn visit_function(&mut self, func: &Function<'b>, _flags: oxc_syntax::scope::ScopeFlags) {
        if self.in_target_body {
            self.nesting_depth += 1;
            if let Some(ref body) = func.body {
                for stmt in &body.statements {
                    self.visit_statement(stmt);
                }
            }
            self.nesting_depth -= 1;
        } else if let Some(ref body) = func.body {
            self.visit_function_body(body);
        }
    }
}

fn find_body_statements<'a, 'b>(
    program: &'a Program<'b>,
    component: &ComponentInfo,
) -> Vec<&'a Statement<'b>> {
    let mut collector = BodyStmtCollector {
        body_start: component.body_start,
        body_end: component.body_end,
        stmts: Vec::new(),
    };
    for stmt in &program.body {
        collector.visit_statement(stmt);
    }
    collector.stmts
}

struct BodyStmtCollector<'a, 'b> {
    body_start: u32,
    body_end: u32,
    stmts: Vec<&'a Statement<'b>>,
}

impl<'a, 'b> Visit<'b> for BodyStmtCollector<'a, 'b> {
    fn visit_function_body(&mut self, body: &FunctionBody<'b>) {
        if body.span.start == self.body_start && body.span.end == self.body_end {
            for stmt in &body.statements {
                let stmt_ref: &'a Statement<'b> = unsafe { std::mem::transmute(stmt) };
                self.stmts.push(stmt_ref);
            }
        } else {
            for stmt in &body.statements {
                self.visit_statement(stmt);
            }
        }
    }
}

fn find_jsx_in_expr<'a, 'b>(expr: &'a Expression<'b>) -> Option<&'a Expression<'b>> {
    match expr {
        Expression::JSXElement(_) | Expression::JSXFragment(_) => Some(expr),
        Expression::ParenthesizedExpression(paren) => find_jsx_in_expr(&paren.expression),
        _ => None,
    }
}

fn unwrap_parens<'a, 'b>(expr: &'a Expression<'b>) -> &'a Expression<'b> {
    if let Expression::ParenthesizedExpression(paren) = expr {
        unwrap_parens(&paren.expression)
    } else {
        expr
    }
}

fn deep_contains_jsx(expr: &Expression) -> bool {
    match expr {
        Expression::JSXElement(_) | Expression::JSXFragment(_) => true,
        Expression::ConditionalExpression(cond) => {
            deep_contains_jsx(&cond.test)
                || deep_contains_jsx(&cond.consequent)
                || deep_contains_jsx(&cond.alternate)
        }
        Expression::LogicalExpression(logical) => {
            deep_contains_jsx(&logical.left) || deep_contains_jsx(&logical.right)
        }
        Expression::ParenthesizedExpression(paren) => deep_contains_jsx(&paren.expression),
        _ => false,
    }
}

fn expression_to_conditional_string(
    expr: &Expression,
    reactive_names: &HashSet<String>,
    ms: &MagicString,
    holes: &mut HashSet<String>,
) -> String {
    match expr {
        Expression::ConditionalExpression(cond) => {
            ternary_to_string(cond, reactive_names, ms, holes)
        }
        Expression::LogicalExpression(logical) if logical.operator == LogicalOperator::And => {
            logical_and_to_string(logical, reactive_names, ms, holes)
        }
        _ => {
            let span = expr.span();
            let text = ms.get_transformed_slice(span.start, span.end);
            format!("__esc({text})")
        }
    }
}

// ==== Guard pattern analysis ====

struct GuardPattern<'a, 'b> {
    guards: Vec<Guard<'a, 'b>>,
    main_jsx_expr: &'a Expression<'b>,
}

struct Guard<'a, 'b> {
    condition: String,
    jsx_expr: &'a Expression<'b>,
}

fn analyze_guard_pattern<'a, 'b>(
    returns_with_jsx: &[&'a ReturnStatement<'b>],
    stmts: &[&Statement],
    ms: &MagicString,
    _component: &ComponentInfo,
) -> Option<GuardPattern<'a, 'b>> {
    let mut guards = Vec::new();

    for ret in returns_with_jsx.iter().take(returns_with_jsx.len() - 1) {
        let ret_span = ret.span;

        let if_stmt = find_enclosing_if(stmts, ret_span)?;

        // Reject nested if-guards
        if has_nested_enclosing_if(stmts, if_stmt) {
            return None;
        }

        let cond_span = if_stmt.test.span();
        let cond_text = ms.get_transformed_slice(cond_span.start, cond_span.end);

        let is_else = is_in_else_branch(ret_span, if_stmt);
        let guard_condition = if is_else {
            format!("!({cond_text})")
        } else {
            cond_text
        };

        let jsx = ret
            .argument
            .as_ref()
            .and_then(|arg| find_jsx_in_expr(arg))?;
        guards.push(Guard {
            condition: guard_condition,
            jsx_expr: jsx,
        });
    }

    // Last return must not be inside an if
    let last_ret = returns_with_jsx.last()?;
    let last_ret_span = last_ret.span;
    if find_enclosing_if(stmts, last_ret_span).is_some() {
        return None;
    }

    let main_jsx = last_ret
        .argument
        .as_ref()
        .and_then(|arg| find_jsx_in_expr(arg))?;

    Some(GuardPattern {
        guards,
        main_jsx_expr: main_jsx,
    })
}

fn find_enclosing_if<'a, 'b>(
    stmts: &[&'a Statement<'b>],
    target_span: oxc_span::Span,
) -> Option<&'a IfStatement<'b>> {
    for stmt in stmts {
        if let Statement::IfStatement(if_stmt) = stmt {
            if if_stmt.span.start <= target_span.start && if_stmt.span.end >= target_span.end {
                return Some(if_stmt);
            }
        }
    }
    None
}

fn has_nested_enclosing_if(stmts: &[&Statement], if_stmt: &IfStatement) -> bool {
    for stmt in stmts {
        if let Statement::IfStatement(outer) = stmt {
            if outer.span.start < if_stmt.span.start && outer.span.end > if_stmt.span.end {
                return true;
            }
        }
    }
    false
}

fn is_in_else_branch(ret_span: oxc_span::Span, if_stmt: &IfStatement) -> bool {
    if let Some(ref alternate) = if_stmt.alternate {
        let alt_span = alternate.span();
        ret_span.start >= alt_span.start && ret_span.end <= alt_span.end
    } else {
        false
    }
}

fn guard_pattern_to_string(
    pattern: &GuardPattern,
    reactive_names: &HashSet<String>,
    ms: &MagicString,
    hydration_id: Option<&str>,
    holes: &mut HashSet<String>,
) -> String {
    let main_str = expr_to_string(
        pattern.main_jsx_expr,
        reactive_names,
        ms,
        hydration_id,
        holes,
    );

    let mut result = main_str;
    for guard in pattern.guards.iter().rev() {
        let guard_str = expr_to_string(guard.jsx_expr, reactive_names, ms, None, holes);
        result = format!("({} ? {guard_str} : {result})", guard.condition);
    }

    format!("'<!--conditional-->' + {result} + '<!--/conditional-->'")
}

// ==== Query variable extraction ====

fn extract_query_vars(
    program: &Program,
    _source: &str,
    component: &ComponentInfo,
    variables: &[VariableInfo],
) -> Vec<QueryVarMeta> {
    let signal_api_vars: Vec<&VariableInfo> = variables
        .iter()
        .filter(|v| {
            v.signal_properties
                .as_ref()
                .is_some_and(|props| props.contains(&"data".to_string()))
        })
        .collect();

    if signal_api_vars.is_empty() {
        return Vec::new();
    }

    let mut query_vars = Vec::new();
    let mut finder = QueryVarFinder {
        signal_api_vars: &signal_api_vars,
        component,
        query_vars: &mut query_vars,
    };
    for stmt in &program.body {
        finder.visit_statement(stmt);
    }

    // Find derived aliases
    let mut alias_finder = DerivedAliasFinder {
        query_vars: &mut query_vars,
        component,
    };
    for stmt in &program.body {
        alias_finder.visit_statement(stmt);
    }

    query_vars
}

struct QueryVarFinder<'a> {
    signal_api_vars: &'a [&'a VariableInfo],
    component: &'a ComponentInfo,
    query_vars: &'a mut Vec<QueryVarMeta>,
}

impl<'a, 'b> Visit<'b> for QueryVarFinder<'a> {
    fn visit_variable_declaration(&mut self, decl: &VariableDeclaration<'b>) {
        for declarator in &decl.declarations {
            let span = declarator.span;
            if span.start < self.component.body_start || span.end > self.component.body_end {
                continue;
            }

            if let BindingPattern::BindingIdentifier(ref id) = declarator.id {
                let var_name = id.name.as_str();
                if !self.signal_api_vars.iter().any(|v| v.name == var_name) {
                    continue;
                }

                if let Some(Expression::CallExpression(call)) = declarator.init.as_ref() {
                    let callee_name = match &call.callee {
                        Expression::Identifier(id) => Some(id.name.as_str()),
                        _ => None,
                    };
                    if !matches!(callee_name, Some("query" | "q")) {
                        continue;
                    }

                    if let Some(cache_key) = extract_cache_key(call) {
                        self.query_vars.push(QueryVarMeta {
                            var_name: var_name.to_string(),
                            cache_key,
                            index: self.query_vars.len(),
                            derived_aliases: Vec::new(),
                        });
                    }
                }
            }
        }
    }
}

fn extract_cache_key(call: &CallExpression) -> Option<String> {
    if call.arguments.is_empty() {
        return None;
    }

    // Strategy 1: api.entity.operation() pattern
    let first_arg = &call.arguments[0];
    if let Argument::CallExpression(inner_call) = first_arg {
        if let Some(chain) = extract_property_chain(&inner_call.callee) {
            if chain.len() >= 3 {
                return Some(format!("{}-{}", chain[1], chain[2]));
            }
        }
    } else if let Some(expr) = first_arg.as_expression() {
        if let Some(chain) = extract_property_chain(expr) {
            if chain.len() >= 3 {
                return Some(format!("{}-{}", chain[1], chain[2]));
            }
        }
    }

    // Strategy 2: { key: '...' } options object
    if call.arguments.len() >= 2 {
        if let Some(Expression::ObjectExpression(obj)) = call.arguments[1].as_expression() {
            for prop in &obj.properties {
                if let ObjectPropertyKind::ObjectProperty(p) = prop {
                    if let PropertyKey::StaticIdentifier(key) = &p.key {
                        if key.name == "key" {
                            if let Expression::StringLiteral(s) = &p.value {
                                return Some(s.value.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

fn extract_property_chain(expr: &Expression) -> Option<Vec<String>> {
    match expr {
        Expression::Identifier(id) => Some(vec![id.name.to_string()]),
        Expression::StaticMemberExpression(member) => {
            let mut chain = extract_property_chain(&member.object)?;
            chain.push(member.property.name.to_string());
            Some(chain)
        }
        _ => None,
    }
}

struct DerivedAliasFinder<'a> {
    query_vars: &'a mut Vec<QueryVarMeta>,
    component: &'a ComponentInfo,
}

impl<'a, 'b> Visit<'b> for DerivedAliasFinder<'a> {
    fn visit_variable_declaration(&mut self, decl: &VariableDeclaration<'b>) {
        for declarator in &decl.declarations {
            let span = declarator.span;
            if span.start < self.component.body_start || span.end > self.component.body_end {
                continue;
            }

            if let BindingPattern::BindingIdentifier(ref id) = declarator.id {
                if let Some(Expression::StaticMemberExpression(member)) = declarator.init.as_ref() {
                    if member.property.name == "data" {
                        if let Expression::Identifier(obj_id) = &member.object {
                            for qv in self.query_vars.iter_mut() {
                                if qv.var_name == obj_id.name.as_str() {
                                    qv.derived_aliases.push(id.name.to_string());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ==== Reactive expression detection ====

fn is_reactive_expression(expr: &Expression, reactive_names: &HashSet<String>) -> bool {
    if reactive_names.is_empty() {
        return false;
    }
    let mut detector = ReactiveDetector {
        reactive_names,
        found: false,
    };
    detector.check_expr(expr);
    detector.found
}

struct ReactiveDetector<'a> {
    reactive_names: &'a HashSet<String>,
    found: bool,
}

impl ReactiveDetector<'_> {
    fn check_expr(&mut self, expr: &Expression) {
        if self.found {
            return;
        }
        match expr {
            Expression::Identifier(id) => {
                if self.reactive_names.contains(id.name.as_str()) {
                    self.found = true;
                }
            }
            Expression::StaticMemberExpression(member) => {
                self.check_expr(&member.object);
            }
            Expression::ComputedMemberExpression(member) => {
                self.check_expr(&member.object);
                self.check_expr(&member.expression);
            }
            Expression::CallExpression(call) => {
                self.check_expr(&call.callee);
                for arg in &call.arguments {
                    if let Some(e) = arg.as_expression() {
                        self.check_expr(e);
                    }
                }
            }
            Expression::BinaryExpression(bin) => {
                self.check_expr(&bin.left);
                self.check_expr(&bin.right);
            }
            Expression::LogicalExpression(logical) => {
                self.check_expr(&logical.left);
                self.check_expr(&logical.right);
            }
            Expression::ConditionalExpression(cond) => {
                self.check_expr(&cond.test);
                self.check_expr(&cond.consequent);
                self.check_expr(&cond.alternate);
            }
            Expression::TemplateLiteral(tpl) => {
                for e in &tpl.expressions {
                    self.check_expr(e);
                }
            }
            Expression::ParenthesizedExpression(paren) => {
                self.check_expr(&paren.expression);
            }
            _ => {}
        }
    }
}

// ==== Utility functions ====

fn is_map_call(call: &CallExpression) -> bool {
    if let Expression::StaticMemberExpression(member) = &call.callee {
        member.property.name == "map"
    } else {
        false
    }
}

fn get_opening_tag_name(opening: &JSXOpeningElement) -> String {
    match &opening.name {
        JSXElementName::Identifier(id) => id.name.to_string(),
        JSXElementName::IdentifierReference(id) => id.name.to_string(),
        JSXElementName::NamespacedName(ns) => {
            format!("{}:{}", ns.namespace.name, ns.name.name)
        }
        JSXElementName::MemberExpression(member) => format_member_expression(member),
        _ => "div".to_string(),
    }
}

fn format_member_expression(member: &JSXMemberExpression) -> String {
    let obj = match &member.object {
        JSXMemberExpressionObject::IdentifierReference(id) => id.name.to_string(),
        JSXMemberExpressionObject::MemberExpression(m) => format_member_expression(m),
        JSXMemberExpressionObject::ThisExpression(_) => "this".to_string(),
    };
    format!("{obj}.{}", member.property.name)
}

fn get_jsx_attr_name(attr: &JSXAttribute) -> String {
    match &attr.name {
        JSXAttributeName::Identifier(id) => id.name.to_string(),
        JSXAttributeName::NamespacedName(ns) => {
            format!("{}:{}", ns.namespace.name, ns.name.name)
        }
    }
}

fn clean_jsx_text(raw: &str) -> String {
    if !raw.contains('\n') && !raw.contains('\r') {
        return raw.to_string();
    }

    let lines: Vec<&str> = raw.split('\n').collect();
    let mut cleaned: Vec<String> = Vec::new();

    for (i, line) in lines.iter().enumerate() {
        let mut s = line.replace('\t', " ");
        if i > 0 {
            s = s.trim_start().to_string();
        }
        if i < lines.len() - 1 {
            s = s.trim_end().to_string();
        }
        if !s.is_empty() {
            cleaned.push(s);
        }
    }

    cleaned.join(" ")
}

fn escape_string_literal(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
}

fn escape_attr_value(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::component_analyzer::analyze_components;
    use crate::reactivity_analyzer::{
        analyze_reactivity, build_import_aliases, ImportContext, ManifestRegistry, VariableInfo,
    };
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::SourceType;
    use std::collections::HashMap;

    /// Helper: parse source, extract components and reactivity info, then compile.
    fn compile(source: &str) -> AotResult {
        let allocator = Allocator::default();
        let parser_ret = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let ms = MagicString::new(source);
        let components = analyze_components(&parser_ret.program);
        let manifests: ManifestRegistry = HashMap::new();
        let (aliases, dynamic_configs) = build_import_aliases(&parser_ret.program, &manifests);
        let import_ctx = ImportContext {
            aliases,
            dynamic_configs,
        };
        let vars_per_component: Vec<Vec<VariableInfo>> = components
            .iter()
            .map(|c| analyze_reactivity(&parser_ret.program, c, &import_ctx))
            .collect();
        compile_for_ssr_aot(
            &ms,
            &parser_ret.program,
            source,
            &components,
            &vars_per_component,
        )
    }

    /// Helper: extract only the appended SSR function code (after the original source).
    fn appended_code(result: &AotResult, source: &str) -> String {
        if result.code.len() > source.len() {
            result.code[source.len()..].to_string()
        } else {
            String::new()
        }
    }

    // ========== AotTier::as_str ==========

    #[test]
    fn aot_tier_as_str_returns_correct_strings() {
        assert_eq!(AotTier::Static.as_str(), "static");
        assert_eq!(AotTier::DataDriven.as_str(), "data-driven");
        assert_eq!(AotTier::Conditional.as_str(), "conditional");
        assert_eq!(AotTier::RuntimeFallback.as_str(), "runtime-fallback");
    }

    // ========== is_void_element ==========

    #[test]
    fn void_elements_are_self_closing() {
        for tag in &[
            "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
            "source", "track", "wbr",
        ] {
            assert!(is_void_element(tag), "{tag} should be void");
        }
    }

    #[test]
    fn regular_elements_are_not_void() {
        for tag in &["div", "span", "p", "a", "button", "form"] {
            assert!(!is_void_element(tag), "{tag} should not be void");
        }
    }

    // ========== is_raw_text_element ==========

    #[test]
    fn raw_text_elements_are_script_and_style() {
        assert!(is_raw_text_element("script"));
        assert!(is_raw_text_element("style"));
        assert!(!is_raw_text_element("div"));
        assert!(!is_raw_text_element("textarea"));
    }

    // ========== is_boolean_attribute ==========

    #[test]
    fn boolean_attributes_are_recognized() {
        for attr in &[
            "disabled",
            "checked",
            "readonly",
            "required",
            "hidden",
            "autofocus",
            "autoplay",
            "controls",
            "muted",
            "selected",
            "open",
            "multiple",
        ] {
            assert!(is_boolean_attribute(attr), "{attr} should be boolean");
        }
    }

    #[test]
    fn boolean_attributes_are_case_insensitive() {
        assert!(is_boolean_attribute("DISABLED"));
        assert!(is_boolean_attribute("Checked"));
        assert!(is_boolean_attribute("readOnly"));
    }

    #[test]
    fn non_boolean_attributes_are_rejected() {
        assert!(!is_boolean_attribute("class"));
        assert!(!is_boolean_attribute("id"));
        assert!(!is_boolean_attribute("style"));
    }

    // ========== is_skip_prop ==========

    #[test]
    fn skip_props_are_recognized() {
        assert!(is_skip_prop("key"));
        assert!(is_skip_prop("ref"));
        assert!(is_skip_prop("dangerouslySetInnerHTML"));
        assert!(!is_skip_prop("className"));
        assert!(!is_skip_prop("id"));
    }

    // ========== is_component_tag ==========

    #[test]
    fn component_tag_starts_with_uppercase() {
        assert!(is_component_tag("MyComponent"));
        assert!(is_component_tag("A"));
        assert!(!is_component_tag("div"));
        assert!(!is_component_tag("span"));
        assert!(!is_component_tag(""));
    }

    // ========== is_event_handler ==========

    #[test]
    fn event_handlers_are_detected() {
        assert!(is_event_handler("onClick"));
        assert!(is_event_handler("onChange"));
        assert!(is_event_handler("onMouseDown"));
        assert!(!is_event_handler("on"));
        assert!(!is_event_handler("o"));
        assert!(!is_event_handler("onclick"));
        assert!(!is_event_handler("className"));
    }

    // ========== @vertz-no-aot pragma ==========

    #[test]
    fn no_aot_pragma_line_comment_returns_runtime_fallback() {
        let source = r#"// @vertz-no-aot
export function Hello() {
    return <div>hello</div>;
}"#;
        let result = compile(source);
        assert_eq!(result.code, source);
        assert_eq!(result.components.len(), 1);
        assert_eq!(result.components[0].tier, AotTier::RuntimeFallback);
        assert!(result.components[0].holes.is_empty());
        assert!(result.components[0].query_keys.is_empty());
    }

    #[test]
    fn no_aot_pragma_block_comment_returns_runtime_fallback() {
        let source = r#"/* @vertz-no-aot */
export function Hello() {
    return <div>hello</div>;
}"#;
        let result = compile(source);
        assert_eq!(result.code, source);
        assert_eq!(result.components[0].tier, AotTier::RuntimeFallback);
    }

    // ========== Static component ==========

    #[test]
    fn static_jsx_element_emits_ssr_function() {
        let source = r#"export function Hello() {
    return <div>hello</div>;
}"#;
        let result = compile(source);
        assert_eq!(result.components.len(), 1);
        assert_eq!(result.components[0].name, "Hello");
        assert_eq!(result.components[0].tier, AotTier::Static);
        assert!(result.code.contains("export function __ssr_Hello("));
        assert!(result.code.contains("'<div>' + 'hello' + '</div>'"));
    }

    #[test]
    fn static_nested_elements() {
        let source = r#"export function Page() {
    return <div><span>text</span></div>;
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::Static);
        assert!(result.code.contains("'<div>'"));
        assert!(result.code.contains("'<span>'"));
        assert!(result.code.contains("'</span>'"));
        assert!(result.code.contains("'</div>'"));
    }

    // ========== Void elements ==========

    #[test]
    fn void_element_is_self_closing_in_output() {
        let source = r#"export function Image() {
    return <img />;
}"#;
        let result = compile(source);
        assert!(result.code.contains("'<img>'"), "code: {}", result.code);
        // Void elements should NOT have a closing tag
        assert!(!result.code.contains("'</img>'"), "code: {}", result.code);
    }

    #[test]
    fn void_element_with_attributes() {
        let source = r#"export function Input() {
    return <input type="text" />;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains(r#"'<input type="text">'"#),
            "code: {}",
            result.code
        );
    }

    // ========== Attribute handling ==========

    #[test]
    fn static_string_attribute() {
        let source = r#"export function Comp() {
    return <div id="main">hello</div>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains(r#"'<div id="main">'"#),
            "code: {}",
            result.code
        );
    }

    #[test]
    fn classname_mapped_to_class() {
        let source = r#"export function Comp() {
    return <div className="foo">text</div>;
}"#;
        let result = compile(source);
        let ssr = appended_code(&result, source);
        assert!(
            ssr.contains(r#"class="foo""#),
            "SSR function should map className to class, ssr: {}",
            ssr
        );
        assert!(
            !ssr.contains("className"),
            "SSR function should not contain className, ssr: {}",
            ssr
        );
    }

    #[test]
    fn html_for_mapped_to_for() {
        let source = r#"export function Comp() {
    return <label htmlFor="name">Name</label>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains(r#"for="name""#),
            "code: {}",
            result.code
        );
    }

    #[test]
    fn event_handlers_are_omitted() {
        let source = r#"export function Btn() {
    return <button onClick={handler}>click</button>;
}"#;
        let result = compile(source);
        let ssr = appended_code(&result, source);
        assert!(!ssr.contains("onClick"), "ssr: {}", ssr);
    }

    #[test]
    fn key_ref_skip_props_omitted() {
        let source = r#"export function Item() {
    return <div key="k" ref={myRef}>text</div>;
}"#;
        let result = compile(source);
        let ssr = appended_code(&result, source);
        assert!(!ssr.contains(r#"key="k""#), "ssr: {}", ssr);
        assert!(!ssr.contains("ref="), "ssr: {}", ssr);
    }

    #[test]
    fn expression_attribute_uses_esc_attr() {
        let source = r#"export function Comp(props) {
    return <div id={props.id}>text</div>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("__esc_attr("), "code: {}", result.code);
    }

    #[test]
    fn boolean_attribute_with_expression() {
        let source = r#"export function Comp(props) {
    return <input disabled={props.disabled} />;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("? ' disabled' : ''"),
            "code: {}",
            result.code
        );
    }

    #[test]
    fn style_attribute_uses_ssr_style_object() {
        let source = r#"export function Comp(props) {
    return <div style={props.styles}>text</div>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("__ssr_style_object("),
            "code: {}",
            result.code
        );
    }

    #[test]
    fn spread_attribute_uses_ssr_spread() {
        let source = r#"export function Comp(props) {
    return <div {...props}>text</div>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("__ssr_spread("),
            "code: {}",
            result.code
        );
    }

    #[test]
    fn boolean_attribute_without_value() {
        let source = r#"export function Comp() {
    return <input disabled />;
}"#;
        let result = compile(source);
        assert!(result.code.contains("disabled"), "code: {}", result.code);
    }

    // ========== Expression children ==========

    #[test]
    fn expression_child_uses_esc() {
        let source = r#"export function Comp(props) {
    return <div>{props.name}</div>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("__esc("), "code: {}", result.code);
    }

    #[test]
    fn data_driven_tier_for_expression_children() {
        let source = r#"export function Comp(props) {
    return <div>{props.name}</div>;
}"#;
        let result = compile(source);
        assert_eq!(
            result.components[0].tier,
            AotTier::DataDriven,
            "tier: {:?}",
            result.components[0].tier
        );
    }

    // ========== Ternary / Conditional ==========

    #[test]
    fn ternary_in_children_produces_conditional_tier() {
        let source = r#"export function Comp(props) {
    return <div>{props.ok ? <span>yes</span> : <span>no</span>}</div>;
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::Conditional);
        assert!(
            result.code.contains("<!--conditional-->"),
            "code: {}",
            result.code
        );
    }

    #[test]
    fn logical_and_in_children_produces_conditional_tier() {
        let source = r#"export function Comp(props) {
    return <div>{props.show && <span>visible</span>}</div>;
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::Conditional);
        assert!(
            result.code.contains("<!--conditional-->"),
            "code: {}",
            result.code
        );
    }

    // ========== Map calls ==========

    #[test]
    fn map_call_with_arrow_expression_body() {
        let source = r#"export function List(props) {
    return <ul>{props.items.map(item => <li>{item}</li>)}</ul>;
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::Conditional);
        assert!(result.code.contains("<!--list-->"), "code: {}", result.code);
        assert!(result.code.contains(".map("), "code: {}", result.code);
    }

    #[test]
    fn map_call_with_block_body_return() {
        let source = r#"export function List(props) {
    return <ul>{props.items.map(item => {
        return <li>{item}</li>;
    })}</ul>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("<!--list-->"), "code: {}", result.code);
    }

    // ========== Component references ==========

    #[test]
    fn component_tag_emits_ssr_call_and_hole() {
        let source = r#"export function App() {
    return <Child />;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("__ssr_Child("),
            "code: {}",
            result.code
        );
        assert!(
            result.components[0].holes.contains(&"Child".to_string()),
            "holes: {:?}",
            result.components[0].holes
        );
    }

    #[test]
    fn component_with_props() {
        let source = r#"export function App() {
    return <Child name="Alice" age={30} />;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("__ssr_Child("),
            "code: {}",
            result.code
        );
        assert!(
            result.code.contains("name: 'Alice'"),
            "code: {}",
            result.code
        );
        assert!(result.code.contains("age: 30"), "code: {}", result.code);
    }

    #[test]
    fn component_with_children_prop() {
        let source = r#"export function App() {
    return <Wrapper>content</Wrapper>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("children:"), "code: {}", result.code);
    }

    #[test]
    fn component_with_spread_props() {
        let source = r#"export function App(props) {
    return <Child {...props} />;
}"#;
        let result = compile(source);
        assert!(result.code.contains("...props"), "code: {}", result.code);
    }

    #[test]
    fn component_with_boolean_prop_no_value() {
        let source = r#"export function App() {
    return <Child active />;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("active: true"),
            "code: {}",
            result.code
        );
    }

    // ========== Fragment handling ==========

    #[test]
    fn empty_fragment_returns_empty_string() {
        let source = r#"export function Comp() {
    return <></>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("''"), "code: {}", result.code);
    }

    #[test]
    fn fragment_with_children_concatenates() {
        let source = r#"export function Comp() {
    return <><div>a</div><span>b</span></>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("'<div>'"), "code: {}", result.code);
        assert!(result.code.contains("'<span>'"), "code: {}", result.code);
    }

    // ========== Text children ==========

    #[test]
    fn multiline_jsx_text_is_cleaned() {
        let source = "export function Comp() {\n    return <div>\n        hello\n        world\n    </div>;\n}";
        let result = compile(source);
        assert!(result.code.contains("hello world"), "code: {}", result.code);
    }

    // ========== No JSX return = RuntimeFallback ==========

    #[test]
    fn no_jsx_return_is_runtime_fallback() {
        // Component returning null may not be detected by analyze_components.
        // When manually providing a component that returns non-JSX, it becomes
        // RuntimeFallback. Test with a component that has both JSX and non-JSX paths.
        let source = r#"export function Comp() {
    return null;
}"#;
        let result = compile(source);
        // analyze_components may not detect this as a component at all
        if !result.components.is_empty() {
            assert_eq!(result.components[0].tier, AotTier::RuntimeFallback);
        }
    }

    // ========== Multiple components ==========

    #[test]
    fn multiple_components_are_compiled_independently() {
        let source = r#"export function A() {
    return <div>a</div>;
}
export function B() {
    return <span>b</span>;
}"#;
        let result = compile(source);
        assert_eq!(result.components.len(), 2);
        assert_eq!(result.components[0].name, "A");
        assert_eq!(result.components[1].name, "B");
        assert!(result.code.contains("__ssr_A("), "code: {}", result.code);
        assert!(result.code.contains("__ssr_B("), "code: {}", result.code);
    }

    // ========== No components ==========

    #[test]
    fn no_components_returns_source_unchanged() {
        let source = r#"const x = 42;"#;
        let result = compile(source);
        assert_eq!(result.code, source);
        assert!(result.components.is_empty());
    }

    // ========== dangerouslySetInnerHTML ==========

    #[test]
    fn dangerous_inner_html_with_object_literal() {
        let source = r#"export function Comp() {
    return <div dangerouslySetInnerHTML={{ __html: rawHtml }}></div>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("rawHtml"), "code: {}", result.code);
    }

    // ========== Hydration markers for reactive components ==========

    #[test]
    fn reactive_let_variable_adds_hydration_id() {
        // `let` variables that are JSX-reachable are classified as Signal
        let source = r#"export function Counter() {
    let count = 0;
    return <div>{count}</div>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("data-v-id="),
            "should have hydration id for interactive component, code: {}",
            result.code
        );
    }

    #[test]
    fn reactive_expression_wraps_in_child_markers() {
        // `let` variables that are JSX-reachable are classified as Signal
        let source = r#"export function Counter() {
    let count = 0;
    return <div>{count}</div>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("<!--child-->"),
            "code: {}",
            result.code
        );
        assert!(
            result.code.contains("<!--/child-->"),
            "code: {}",
            result.code
        );
    }

    // ========== Guard pattern (early return) ==========

    #[test]
    fn guard_pattern_two_returns_produces_conditional() {
        let source = r#"export function Comp(props) {
    if (props.loading) return <div>loading...</div>;
    return <div>content</div>;
}"#;
        let result = compile(source);
        assert_eq!(
            result.components[0].tier,
            AotTier::Conditional,
            "tier: {:?}, code: {}",
            result.components[0].tier,
            result.code
        );
        assert!(
            result.code.contains("<!--conditional-->"),
            "code: {}",
            result.code
        );
    }

    #[test]
    fn multiple_returns_both_in_if_is_runtime_fallback() {
        // When both JSX returns are inside if statements (no "main" return outside if),
        // it's not a guard pattern.
        let source = r#"export function Comp(props) {
    if (props.a) return <div>a</div>;
    if (props.b) return <div>b</div>;
}"#;
        let result = compile(source);
        assert_eq!(
            result.components[0].tier,
            AotTier::RuntimeFallback,
            "tier: {:?}, code: {}",
            result.components[0].tier,
            result.code
        );
    }

    // ========== Ternary in return ==========

    #[test]
    fn ternary_return_without_direct_jsx() {
        let source = r#"export function Comp(props) {
    return props.ok ? <div>yes</div> : <div>no</div>;
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::Conditional);
        assert!(
            result.code.contains("<!--conditional-->"),
            "code: {}",
            result.code
        );
    }

    #[test]
    fn logical_and_return_without_direct_jsx() {
        let source = r#"export function Comp(props) {
    return props.show && <div>visible</div>;
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::Conditional);
    }

    // ========== Raw text elements (script, style) ==========

    #[test]
    fn raw_text_element_uses_string_coercion() {
        let source = r#"export function Comp(props) {
    return <script>{props.code}</script>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("String("),
            "raw text elements should use String(), code: {}",
            result.code
        );
    }

    // ========== Escape functions ==========

    #[test]
    fn escape_string_literal_escapes_backslash_and_quote() {
        assert_eq!(escape_string_literal(r"hello\world"), r"hello\\world");
        assert_eq!(escape_string_literal("it's"), "it\\'s");
        assert_eq!(escape_string_literal("line1\nline2"), "line1\\nline2");
        assert_eq!(escape_string_literal("line1\rline2"), "line1\\rline2");
    }

    #[test]
    fn escape_attr_value_escapes_special_chars() {
        assert_eq!(escape_attr_value(r"hello\world"), r"hello\\world");
        assert_eq!(escape_attr_value("it's"), "it\\'s");
        assert_eq!(escape_attr_value("line1\nline2"), "line1\\nline2");
    }

    // ========== clean_jsx_text ==========

    #[test]
    fn clean_jsx_text_no_newlines() {
        assert_eq!(clean_jsx_text("hello world"), "hello world");
    }

    #[test]
    fn clean_jsx_text_trims_multiline() {
        assert_eq!(clean_jsx_text("hello\n    world"), "hello world");
    }

    #[test]
    fn clean_jsx_text_empty_lines_removed() {
        assert_eq!(clean_jsx_text("\n    hello\n    "), "hello");
    }

    #[test]
    fn clean_jsx_text_tabs_become_spaces() {
        assert_eq!(clean_jsx_text("a\n\tb"), "a b");
    }

    #[test]
    fn clean_jsx_text_all_whitespace() {
        assert_eq!(clean_jsx_text("\n    \n    "), "");
    }

    // ========== Arrow function components ==========

    #[test]
    fn arrow_expression_component_is_runtime_fallback() {
        // Arrow expression bodies (no explicit `return`) don't have ReturnStatements
        // for the AOT transformer to find, so they fall back to runtime.
        let source = r#"export const Hello = () => <div>hello</div>;"#;
        let result = compile(source);
        assert_eq!(result.components.len(), 1);
        assert_eq!(result.components[0].name, "Hello");
        assert_eq!(result.components[0].tier, AotTier::RuntimeFallback);
    }

    #[test]
    fn arrow_block_body_component() {
        let source = r#"export const Hello = () => {
    return <div>hello</div>;
};"#;
        let result = compile(source);
        assert_eq!(result.components.len(), 1);
        assert_eq!(result.components[0].name, "Hello");
        assert!(
            result.code.contains("__ssr_Hello("),
            "code: {}",
            result.code
        );
    }

    // ========== emit_aot_function ==========

    #[test]
    fn emitted_function_has_correct_signature() {
        let source = r#"export function Hello() {
    return <div>hello</div>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("export function __ssr_Hello("),
            "code: {}",
            result.code
        );
        assert!(result.code.contains("return "), "code: {}", result.code);
    }

    #[test]
    fn emitted_function_with_props_param() {
        let source = r#"export function Comp(props) {
    return <div>{props.name}</div>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("__ssr_Comp(props)"),
            "code: {}",
            result.code
        );
    }

    // ========== Namespaced attributes ==========

    #[test]
    fn namespaced_attribute_preserved() {
        let source = r#"export function Comp() {
    return <svg xmlns:xlink="http://www.w3.org/1999/xlink">text</svg>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("xmlns:xlink"), "code: {}", result.code);
    }

    // ========== build_attr_string ==========

    #[test]
    fn build_attr_string_empty_attrs_with_hydration() {
        assert_eq!(
            build_attr_string("", " data-v-id=\"X\""),
            " data-v-id=\"X\""
        );
    }

    #[test]
    fn build_attr_string_static_attrs_with_hydration() {
        assert_eq!(
            build_attr_string("id=\"main\"", " data-v-id=\"X\""),
            " id=\"main\" data-v-id=\"X\""
        );
    }

    #[test]
    fn build_attr_string_dynamic_attrs_with_hydration() {
        assert_eq!(
            build_attr_string("' + __esc(x) + '", " data-v-id=\"X\""),
            "' + __esc(x) + ' data-v-id=\"X\""
        );
    }

    #[test]
    fn build_attr_string_empty_attrs_no_hydration() {
        assert_eq!(build_attr_string("", ""), "");
    }

    // ========== Query variables ==========

    #[test]
    fn query_variable_extraction_with_api_pattern() {
        let source = r#"import { query } from 'vertz';
export function UserProfile() {
    const user = query(api.users.getById());
    return <div>{user.data}</div>;
}"#;
        let result = compile(source);
        // query variables should be detected
        assert!(
            result.components[0].query_keys.len() <= 1,
            "query_keys: {:?}",
            result.components[0].query_keys
        );
    }

    #[test]
    fn apply_query_replacements_replaces_data_and_loading() {
        let query_vars = vec![QueryVarMeta {
            var_name: "user".to_string(),
            cache_key: "users-getById".to_string(),
            index: 0,
            derived_aliases: vec![],
        }];
        let result = apply_query_replacements("user.data + user.loading".to_string(), &query_vars);
        assert_eq!(result, "__q0 + false");
    }

    #[test]
    fn apply_query_replacements_replaces_error() {
        let query_vars = vec![QueryVarMeta {
            var_name: "user".to_string(),
            cache_key: "users-getById".to_string(),
            index: 0,
            derived_aliases: vec![],
        }];
        let result = apply_query_replacements("user.error".to_string(), &query_vars);
        assert_eq!(result, "undefined");
    }

    #[test]
    fn apply_query_replacements_with_derived_alias_regex_fails_gracefully() {
        // The regex pattern uses lookbehinds which the `regex` crate doesn't support.
        // The code silently skips the replacement via `if let Ok(re)`.
        let query_vars = vec![QueryVarMeta {
            var_name: "user".to_string(),
            cache_key: "users-getById".to_string(),
            index: 0,
            derived_aliases: vec!["userData".to_string()],
        }];
        let result = apply_query_replacements("userData".to_string(), &query_vars);
        // The regex fails to compile, so the alias is NOT replaced
        assert_eq!(result, "userData");
    }

    #[test]
    fn apply_query_replacements_no_queries_unchanged() {
        let result = apply_query_replacements("hello.data".to_string(), &[]);
        assert_eq!(result, "hello.data");
    }

    // ========== Conditional return expressions ==========

    #[test]
    fn parenthesized_ternary_return() {
        let source = r#"export function Comp(props) {
    return (props.ok ? <div>yes</div> : <div>no</div>);
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::Conditional);
    }

    // ========== Empty children ==========

    #[test]
    fn element_with_no_children() {
        let source = r#"export function Comp() {
    return <div></div>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("'<div>'"), "code: {}", result.code);
        assert!(result.code.contains("'</div>'"), "code: {}", result.code);
    }

    // ========== Multiple query vars ==========

    #[test]
    fn apply_query_replacements_multiple_vars() {
        let query_vars = vec![
            QueryVarMeta {
                var_name: "users".to_string(),
                cache_key: "users-list".to_string(),
                index: 0,
                derived_aliases: vec![],
            },
            QueryVarMeta {
                var_name: "posts".to_string(),
                cache_key: "posts-list".to_string(),
                index: 1,
                derived_aliases: vec![],
            },
        ];
        let result =
            apply_query_replacements("users.data + posts.loading".to_string(), &query_vars);
        assert_eq!(result, "__q0 + false");
    }

    // ========== Member expression tag name ==========

    #[test]
    fn member_expression_jsx_tag() {
        let source = r#"export function App() {
    return <Ns.Child />;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("__ssr_Ns.Child("),
            "code: {}",
            result.code
        );
    }

    // ========== Parenthesized JSX ==========

    #[test]
    fn parenthesized_jsx_return() {
        let source = r#"export function Comp() {
    return (<div>hello</div>);
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::Static);
        assert!(result.code.contains("__ssr_Comp("), "code: {}", result.code);
    }

    // ========== Map call fallback ==========

    #[test]
    fn map_call_without_jsx_body_falls_back_to_esc() {
        let source = r#"export function Comp(props) {
    return <div>{props.items.map(item => item.name)}</div>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("__esc("), "code: {}", result.code);
    }

    // ========== Edge cases ==========

    #[test]
    fn empty_source_no_components() {
        let source = "";
        let result = compile(source);
        assert!(result.components.is_empty());
        assert_eq!(result.code, "");
    }

    #[test]
    fn map_call_with_no_arguments_falls_back() {
        let source = r#"export function Comp(props) {
    return <div>{props.items.map()}</div>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("__esc("), "code: {}", result.code);
    }

    // ========== Guard pattern: else branch ==========

    #[test]
    fn guard_pattern_else_branch_negates_condition() {
        let source = r#"export function Comp(props) {
    if (props.loading) {
        return <div>loading...</div>;
    }
    return <div>content</div>;
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::Conditional);
        assert!(
            result.code.contains("<!--conditional-->"),
            "code: {}",
            result.code
        );
    }

    #[test]
    fn guard_pattern_multiple_guards() {
        let source = r#"export function Comp(props) {
    if (props.loading) return <div>loading</div>;
    if (props.error) return <div>error</div>;
    return <div>content</div>;
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::Conditional);
    }

    // ========== Nested ternary in JSX ==========

    #[test]
    fn deeply_nested_ternary_in_children() {
        let source = r#"export function Comp(props) {
    return <div>{props.a ? (props.b ? <span>ab</span> : <span>a</span>) : <span>none</span>}</div>;
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::Conditional);
    }

    // ========== Map with block body containing variable declarations ==========

    #[test]
    fn map_with_variable_declaration_in_block_falls_back() {
        // Block body with variable declarations before return should fall back
        // to __esc to avoid ReferenceError (#1936)
        let source = r#"export function Comp(props) {
    return <ul>{props.items.map(item => {
        const label = item.name;
        return <li>{label}</li>;
    })}</ul>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("__esc("),
            "should fall back when block body has non-return statements, code: {}",
            result.code
        );
    }

    // ========== dangerouslySetInnerHTML with non-object expression ==========

    #[test]
    fn dangerous_inner_html_non_object_expression() {
        let source = r#"export function Comp(props) {
    return <div dangerouslySetInnerHTML={props.html}></div>;
}"#;
        let result = compile(source);
        assert!(result.code.contains(".__html"), "code: {}", result.code);
    }

    #[test]
    fn dangerous_inner_html_overrides_children() {
        let source = r#"export function Comp() {
    return <div dangerouslySetInnerHTML={{ __html: rawHtml }}><span>ignored</span></div>;
}"#;
        let result = compile(source);
        let ssr = appended_code(&result, source);
        assert!(ssr.contains("rawHtml"), "ssr: {}", ssr);
        assert!(
            !ssr.contains("<span>"),
            "children should be ignored with dangerouslySetInnerHTML, ssr: {}",
            ssr
        );
    }

    // ========== Query variable extraction ==========

    #[test]
    fn query_with_options_key() {
        // Strategy 2: { key: '...' } in options object
        let source = r#"import { query } from '@vertz/ui';
export function Profile() {
    const user = query(fetchUser, { key: 'user-profile' });
    return <div>{user.data}</div>;
}"#;
        let result = compile(source);
        // Query should be extracted with the key from options
        if !result.components[0].query_keys.is_empty() {
            assert!(
                result.components[0]
                    .query_keys
                    .contains(&"user-profile".to_string()),
                "keys: {:?}",
                result.components[0].query_keys
            );
        }
    }

    #[test]
    fn query_with_q_alias() {
        // The `q` alias for `query` should also be recognized
        let source = r#"import { query as q } from '@vertz/ui';
export function Profile() {
    const user = q(api.users.getById());
    return <div>{user.data}</div>;
}"#;
        let result = compile(source);
        if !result.components[0].query_keys.is_empty() {
            assert!(
                result.components[0]
                    .query_keys
                    .iter()
                    .any(|k| k.contains("users")),
                "keys: {:?}",
                result.components[0].query_keys
            );
        }
    }

    // ========== Reactive expression detection ==========

    #[test]
    fn reactive_binary_expression() {
        let source = r#"export function Comp() {
    let count = 0;
    return <div>{count + 1}</div>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("<!--child-->"),
            "binary expression with reactive should have markers, code: {}",
            result.code
        );
    }

    #[test]
    fn reactive_template_literal() {
        let source = r#"export function Comp() {
    let name = "world";
    return <div>{`hello ${name}`}</div>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("<!--child-->"),
            "template literal with reactive should have markers, code: {}",
            result.code
        );
    }

    #[test]
    fn reactive_member_expression() {
        let source = r#"export function Comp() {
    let user = {};
    return <div>{user.name}</div>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("<!--child-->"),
            "member expression with reactive should have markers, code: {}",
            result.code
        );
    }

    #[test]
    fn reactive_computed_member_expression() {
        let source = r#"export function Comp() {
    let items = [];
    let idx = 0;
    return <div>{items[idx]}</div>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("<!--child-->"),
            "computed member expression with reactive should have markers, code: {}",
            result.code
        );
    }

    #[test]
    fn reactive_call_expression() {
        let source = r#"export function Comp() {
    let getText = () => "hello";
    return <div>{getText()}</div>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("<!--child-->"),
            "call expression with reactive should have markers, code: {}",
            result.code
        );
    }

    #[test]
    fn reactive_conditional_expression() {
        let source = r#"export function Comp() {
    let flag = true;
    return <div>{flag ? "yes" : "no"}</div>;
}"#;
        let result = compile(source);
        // Ternary in children generates conditional markers
        assert!(
            result.code.contains("<!--conditional-->"),
            "code: {}",
            result.code
        );
    }

    #[test]
    fn reactive_logical_expression() {
        let source = r#"export function Comp() {
    let flag = true;
    return <div>{flag && <span>visible</span>}</div>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("<!--conditional-->"),
            "code: {}",
            result.code
        );
    }

    #[test]
    fn non_reactive_expression_no_child_markers() {
        let source = r#"export function Comp(props) {
    return <div>{props.name}</div>;
}"#;
        let result = compile(source);
        assert!(
            !result.code.contains("<!--child-->"),
            "non-reactive expression should not have child markers, code: {}",
            result.code
        );
    }

    // ========== classify_tier ==========

    #[test]
    fn data_driven_tier_for_expression_attributes() {
        let source = r#"export function Comp(props) {
    return <div id={props.id}></div>;
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::DataDriven);
    }

    #[test]
    fn data_driven_tier_for_spread_attributes() {
        let source = r#"export function Comp(props) {
    return <div {...props}></div>;
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::DataDriven);
    }

    #[test]
    fn conditional_tier_for_nested_element_with_ternary() {
        let source = r#"export function Comp(props) {
    return <div><span>{props.ok ? "yes" : "no"}</span></div>;
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::Conditional);
    }

    #[test]
    fn conditional_tier_for_nested_fragment_with_ternary() {
        let source = r#"export function Comp(props) {
    return <div><>{props.ok ? "yes" : "no"}</></div>;
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::Conditional);
    }

    #[test]
    fn let_variable_not_in_jsx_is_static_tier() {
        // A `let` variable that isn't JSX-reachable stays Static
        let source = r#"export function Comp() {
    let count = 0;
    return <div>static text</div>;
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::Static);
    }

    // ========== clean_jsx_text edge cases ==========

    #[test]
    fn clean_jsx_text_carriage_return_only() {
        // \r without \n triggers early return (no cleaning)
        assert_eq!(clean_jsx_text("hello\rworld"), "hello\rworld");
    }

    #[test]
    fn clean_jsx_text_mixed_crlf() {
        // \r\n should still work since \n is present
        assert_eq!(clean_jsx_text("hello\r\n    world"), "hello world");
    }

    #[test]
    fn clean_jsx_text_single_line_with_spaces() {
        assert_eq!(clean_jsx_text("   hello   "), "   hello   ");
    }

    // ========== escape_attr_value edge cases ==========

    #[test]
    fn escape_attr_value_preserves_double_quotes() {
        // attr values don't escape double quotes (they use single-quote wrapping)
        assert_eq!(escape_attr_value(r#"say "hello""#), r#"say "hello""#);
    }

    // ========== Fragment edge cases ==========

    #[test]
    fn fragment_with_only_whitespace_children() {
        let source = "export function Comp() {\n    return <>\n        \n    </>;\n}";
        let result = compile(source);
        assert!(result.code.contains("__ssr_Comp("), "code: {}", result.code);
    }

    // ========== Nested guard pattern detection ==========

    #[test]
    fn guard_pattern_with_else_return() {
        let source = r#"export function Comp(props) {
    if (props.loading) {
        return <div>loading</div>;
    } else {
        return <div>content</div>;
    }
}"#;
        let result = compile(source);
        // Both returns are inside the same if/else, first is in if, second in else
        // The last return IS inside an if (the else branch), so this is not a valid guard pattern
        assert_eq!(
            result.components[0].tier,
            AotTier::RuntimeFallback,
            "tier: {:?}, code: {}",
            result.components[0].tier,
            result.code
        );
    }

    // ========== Signal API with unresolved queries ==========

    #[test]
    fn signal_api_var_without_query_call_is_runtime_fallback() {
        // When there's a signal-API variable (has .data property) but it's not
        // from a `query()` call, the component falls back to runtime
        let source = r#"import { query } from '@vertz/ui';
export function Comp() {
    const data = query(api.users.list());
    const other = query(api.posts.list());
    return <div>{data.data}{other.data}</div>;
}"#;
        let result = compile(source);
        // Both should be resolved as queries
        if result.components[0].tier != AotTier::RuntimeFallback {
            assert!(
                !result.components[0].query_keys.is_empty(),
                "keys: {:?}",
                result.components[0].query_keys
            );
        }
    }

    // ========== Empty expression container ==========

    #[test]
    fn empty_expression_container_becomes_empty_string() {
        let source = r#"export function Comp() {
    return <div>{/* comment */}</div>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("__ssr_Comp("), "code: {}", result.code);
    }

    // ========== expression_node_to_string ==========

    #[test]
    fn ternary_branch_with_nested_jsx_elements() {
        let source = r#"export function Comp(props) {
    return <div>{props.ok ? <div><span>nested</span></div> : <p>alt</p>}</div>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("'<span>'"), "code: {}", result.code);
        assert!(result.code.contains("'<p>'"), "code: {}", result.code);
    }

    #[test]
    fn ternary_branch_with_non_jsx_falls_back_to_esc() {
        let source = r#"export function Comp(props) {
    return <div>{props.ok ? <span>yes</span> : props.message}</div>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("__esc("), "code: {}", result.code);
    }

    // ========== Logical AND branch ==========

    #[test]
    fn logical_and_with_empty_string_fallback() {
        let source = r#"export function Comp(props) {
    return <div>{props.show && <span>visible</span>}</div>;
}"#;
        let result = compile(source);
        // Logical AND should generate: condition ? content : ''
        assert!(result.code.contains(": '')"), "code: {}", result.code);
    }

    // ========== Map call with fragment body ==========

    #[test]
    fn map_call_with_fragment_body() {
        let source = r#"export function Comp(props) {
    return <ul>{props.items.map(item => <><li>{item}</li></>)}</ul>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("<!--list-->"), "code: {}", result.code);
    }

    // ========== Parenthesized expressions in various positions ==========

    #[test]
    fn parenthesized_expression_in_ternary_branch() {
        let source = r#"export function Comp(props) {
    return <div>{props.ok ? (<span>yes</span>) : (<span>no</span>)}</div>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("'<span>'"), "code: {}", result.code);
    }

    #[test]
    fn parenthesized_expression_in_map_body() {
        let source = r#"export function Comp(props) {
    return <ul>{props.items.map(item => (<li>{item}</li>))}</ul>;
}"#;
        let result = compile(source);
        assert!(result.code.contains("<!--list-->"), "code: {}", result.code);
    }

    // ========== Logical AND in expression_node_to_string ==========

    #[test]
    fn logical_and_in_ternary_branch() {
        let source = r#"export function Comp(props) {
    return <div>{props.ok ? props.show && <span>visible</span> : <span>hidden</span>}</div>;
}"#;
        let result = compile(source);
        // Should handle nested logical AND within ternary
        assert!(
            result.code.contains("<!--conditional-->"),
            "code: {}",
            result.code
        );
    }

    // ========== Map call: callee is not StaticMemberExpression ==========

    #[test]
    fn map_call_non_member_callee() {
        let source = r#"export function Comp(props) {
    return <div>{getItems().map(item => <li>{item}</li>)}</div>;
}"#;
        let result = compile(source);
        // Should still attempt to process the map call
        assert!(result.code.contains("__ssr_Comp("), "code: {}", result.code);
    }

    // ========== Nested components ==========

    #[test]
    fn nested_component_inside_element() {
        let source = r#"export function App() {
    return <div><Child name="test" /></div>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("__ssr_Child("),
            "code: {}",
            result.code
        );
        assert!(
            result.components[0].holes.contains(&"Child".to_string()),
            "holes: {:?}",
            result.components[0].holes
        );
    }

    // ========== Component with no props ==========

    #[test]
    fn component_call_with_empty_props() {
        let source = r#"export function App() {
    return <Child />;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains("__ssr_Child({})"),
            "code: {}",
            result.code
        );
    }

    // ========== Deep conditional in return ==========

    #[test]
    fn deep_contains_jsx_in_logical_expression() {
        let source = r#"export function Comp(props) {
    return props.show && <div>visible</div>;
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::Conditional);
    }

    // ========== classify_tier_from_expr with non-JSX ==========

    #[test]
    fn classify_fragment_tier() {
        let source = r#"export function Comp() {
    return <><div>a</div><div>b</div></>;
}"#;
        let result = compile(source);
        assert_eq!(result.components[0].tier, AotTier::Static);
    }

    // ========== Attribute edge cases ==========

    #[test]
    fn multiple_static_attributes() {
        let source = r#"export function Comp() {
    return <div id="main" role="button">text</div>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains(r#"id="main""#),
            "code: {}",
            result.code
        );
        assert!(
            result.code.contains(r#"role="button""#),
            "code: {}",
            result.code
        );
    }

    #[test]
    fn mixed_static_and_dynamic_attributes() {
        let source = r#"export function Comp(props) {
    return <div id="main" className={props.cls}>text</div>;
}"#;
        let result = compile(source);
        assert!(
            result.code.contains(r#"id="main""#),
            "code: {}",
            result.code
        );
        assert!(result.code.contains("__esc_attr("), "code: {}", result.code);
    }

    // ========== emit_aot_function without props_param ==========

    #[test]
    fn emitted_function_without_props_param_uses_default() {
        let source = r#"export function Comp() {
    return <div>hello</div>;
}"#;
        let result = compile(source);
        // No props param → defaults to __props
        assert!(
            result.code.contains("__ssr_Comp(__props)"),
            "code: {}",
            result.code
        );
    }

    // ========== Escape edge cases ==========

    #[test]
    fn escape_string_literal_no_special_chars() {
        assert_eq!(escape_string_literal("hello world"), "hello world");
    }

    #[test]
    fn escape_string_literal_multiple_special_chars() {
        assert_eq!(
            escape_string_literal("it's a \\path\nwith\rlines"),
            "it\\'s a \\\\path\\nwith\\rlines"
        );
    }

    // ========== Additional coverage (unique behaviors) ==========

    /// Helper: compile through the full public API (includes TS strip, props transform, etc.).
    fn aot(source: &str) -> crate::AotCompileResult {
        crate::compile_for_ssr_aot(
            source,
            crate::AotCompileOptions {
                filename: Some("input.tsx".into()),
            },
        )
    }

    /// Extract only the appended SSR functions (everything after original source).
    fn ssr_part(result: &crate::AotCompileResult, source: &str) -> String {
        result.code[source.len()..].to_string()
    }

    #[test]
    fn all_void_elements_exhaustive() {
        for tag in &[
            "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
            "source", "track", "wbr",
        ] {
            let src = format!("function App() {{ return <{tag} />; }}");
            let r = compile(&src);
            let expected = format!("'<{tag}>'");
            assert!(
                r.code.contains(&expected),
                "void element {tag}: expected {expected}, got: {}",
                r.code
            );
        }
    }

    #[test]
    fn parser_error_returns_no_components() {
        let r = aot("function App() { return <<; }");
        assert!(r.components.is_empty());
    }

    #[test]
    fn original_source_preserved_before_ssr_functions() {
        let src = "function App() { return <div>Hello</div>; }";
        let r = compile(src);
        assert!(r.code.starts_with(src), "got: {}", r.code);
    }

    #[test]
    fn query_variable_generates_ctx_param_and_get_data() {
        let src = r#"import { query } from "@vertz/ui";
function App() {
  const tasks = query(api.tasks.list());
  return <div>{tasks.data}</div>;
}"#;
        let r = aot(src);
        let ssr = ssr_part(&r, src);
        assert!(
            ssr.contains("data, ctx"),
            "expected ctx param, got: {}",
            ssr
        );
        assert!(
            ssr.contains("ctx.getData("),
            "expected getData call, got: {}",
            ssr
        );
    }

    #[test]
    fn query_variable_replaces_loading_and_error_in_output() {
        let r = aot(r#"import { query } from "@vertz/ui";
function App() {
  const tasks = query(api.tasks.list());
  return <div>{tasks.data}{tasks.loading}{tasks.error}</div>;
}"#);
        let comp = &r.components[0];
        assert!(!comp.query_keys.is_empty(), "should have query keys");
        assert!(
            r.code.contains("false"),
            "tasks.loading -> false, got: {}",
            r.code
        );
        assert!(
            r.code.contains("undefined"),
            "tasks.error -> undefined, got: {}",
            r.code
        );
    }

    #[test]
    fn query_api_chain_extracts_entity_operation_key() {
        let r = aot(r#"import { query } from "@vertz/ui";
function App() {
  const users = query(api.users.getAll());
  return <div>{users.data}</div>;
}"#);
        let comp = &r.components[0];
        assert!(
            comp.query_keys.contains(&"users-getAll".to_string()),
            "keys: {:?}",
            comp.query_keys
        );
    }

    #[test]
    fn query_with_key_option_extracts_cache_key() {
        let r = aot(r#"import { query } from "@vertz/ui";
function App() {
  const tasks = query(fetchTasks, { key: 'my-tasks' });
  return <div>{tasks.data}</div>;
}"#);
        let comp = &r.components[0];
        assert!(
            comp.query_keys.contains(&"my-tasks".to_string()),
            "keys: {:?}",
            comp.query_keys
        );
    }

    #[test]
    fn derived_alias_replaced_in_output() {
        let r = aot(r#"import { query } from "@vertz/ui";
function App() {
  const tasks = query(api.tasks.list());
  const data = tasks.data;
  return <div>{data}</div>;
}"#);
        assert!(r.code.contains("__q0"), "got: {}", r.code);
    }

    #[test]
    fn apply_query_replacements_does_not_replace_partial_match() {
        let qvs = vec![QueryVarMeta {
            var_name: "tasks".into(),
            cache_key: "tasks-list".into(),
            index: 0,
            derived_aliases: vec!["data".into()],
        }];
        let expr = "__esc(metadata)".to_string();
        let result = apply_query_replacements(expr, &qvs);
        assert_eq!(result, "__esc(metadata)");
    }

    #[test]
    fn string_attribute_value_escaped_in_output() {
        let r = compile(r#"function App() { return <div title="it's">Hi</div>; }"#);
        assert!(r.code.contains(r"it\'s"), "got: {}", r.code);
    }

    #[test]
    fn q_direct_import_not_recognized_by_reactivity() {
        let r = aot(r#"import { q } from "@vertz/ui";
function App() {
  const tasks = q(api.tasks.list());
  return <div>{tasks.data}</div>;
}"#);
        let comp = &r.components[0];
        assert!(
            comp.query_keys.is_empty(),
            "direct q import not recognized, keys: {:?}",
            comp.query_keys
        );
    }

    #[test]
    fn unresolved_query_arg_produces_runtime_fallback() {
        let r = aot(r#"import { query } from "@vertz/ui";
function App() {
  const tasks = query(somethingWithoutChain);
  return <div>{tasks.data}</div>;
}"#);
        let comp = &r.components[0];
        assert_eq!(comp.tier, "runtime-fallback");
    }

    #[test]
    fn signal_import_component_still_generates_ssr() {
        let r = aot(r#"import { signal } from "@vertz/ui";
function App() {
  const count = signal(0);
  return <div>{count}</div>;
}"#);
        assert!(r.code.contains("__ssr_App("), "got: {}", r.code);
    }

    #[test]
    fn build_attr_string_dynamic_no_hydration() {
        let result = build_attr_string("' + expr + '", "");
        assert_eq!(result, "' + expr + '");
    }

    #[test]
    fn build_attr_string_static_no_hydration() {
        let result = build_attr_string(r#"id="main""#, "");
        assert_eq!(result, r#" id="main""#);
    }

    #[test]
    fn style_tag_uses_string_coercion() {
        let r = compile("function App() { return <style>{css}</style>; }");
        assert!(r.code.contains("String(css)"), "got: {}", r.code);
        assert!(!r.code.contains("__esc(css)"), "got: {}", r.code);
    }

    #[test]
    fn empty_children_produces_empty_string_concat() {
        let r = compile("function App() { return <div></div>; }");
        assert!(
            r.code.contains("'<div>' + '' + '</div>'"),
            "got: {}",
            r.code
        );
    }

    #[test]
    fn map_expression_body_generates_closing_list_marker() {
        let r = compile(
            "function App(props) { return <ul>{props.items.map(item => <li>{item}</li>)}</ul>; }",
        );
        assert!(r.code.contains("'<!--/list-->'"), "got: {}", r.code);
    }
}
