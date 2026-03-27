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
