use crate::magic_string::MagicString;
use crate::mutation_analyzer::{MutationInfo, MutationKind};

/// Transform detected mutations using peek/notify pattern.
pub fn transform_mutations(ms: &mut MagicString, mutations: &[MutationInfo]) {
    if mutations.is_empty() {
        return;
    }

    // Process mutations in reverse order (end-to-start) to preserve positions
    let mut sorted: Vec<&MutationInfo> = mutations.iter().collect();
    sorted.sort_by(|a, b| b.start.cmp(&a.start));

    for mutation in sorted {
        let original_text = ms.slice(mutation.start, mutation.end);
        let var_name = &mutation.variable_name;

        let peek_text = match mutation.kind {
            MutationKind::MethodCall => {
                replace_with_boundary(original_text, var_name, ".", &format!("{var_name}.peek()."))
            }
            MutationKind::PropertyAssignment => {
                replace_with_boundary(original_text, var_name, ".", &format!("{var_name}.peek()."))
            }
            MutationKind::IndexAssignment => {
                replace_with_boundary(original_text, var_name, "[", &format!("{var_name}.peek()["))
            }
            MutationKind::Delete => {
                replace_with_boundary(original_text, var_name, ".", &format!("{var_name}.peek()."))
            }
            MutationKind::ObjectAssign => original_text.replace(
                &format!("Object.assign({var_name}"),
                &format!("Object.assign({var_name}.peek()"),
            ),
        };

        let replacement = format!("({peek_text}, {var_name}.notify())");
        ms.overwrite(mutation.start, mutation.end, &replacement);
    }
}

/// Replace occurrences of `varName` + suffix with replacement, respecting word boundaries.
fn replace_with_boundary(text: &str, var_name: &str, suffix: &str, replacement: &str) -> String {
    let search = format!("{var_name}{suffix}");
    let mut result = String::with_capacity(text.len() + 20);
    let mut remaining = text;

    while let Some(pos) = remaining.find(&search) {
        // Check word boundary: character before must NOT be [a-zA-Z0-9_$]
        if pos > 0 {
            let prev_char = remaining[..pos].chars().next_back().unwrap();
            if prev_char.is_alphanumeric() || prev_char == '_' || prev_char == '$' {
                // Not a word boundary — skip this match
                result.push_str(&remaining[..pos + search.len()]);
                remaining = &remaining[pos + search.len()..];
                continue;
            }
        }

        result.push_str(&remaining[..pos]);
        result.push_str(replacement);
        remaining = &remaining[pos + search.len()..];
    }

    result.push_str(remaining);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::magic_string::MagicString;
    use crate::mutation_analyzer::MutationInfo;

    fn transform(source: &str, mutations: &[MutationInfo]) -> String {
        let mut ms = MagicString::new(source);
        transform_mutations(&mut ms, mutations);
        ms.to_string()
    }

    // ── Empty mutations ────────────────────────────────────────────

    #[test]
    fn no_changes_when_no_mutations() {
        let result = transform("items.push(1);", &[]);
        assert_eq!(result, "items.push(1);");
    }

    // ── MethodCall kind ────────────────────────────────────────────

    #[test]
    fn method_call_wraps_with_peek_and_notify() {
        let source = "items.push(1)";
        let result = transform(
            source,
            &[MutationInfo {
                variable_name: "items".to_string(),
                kind: MutationKind::MethodCall,
                start: 0,
                end: source.len() as u32,
            }],
        );
        assert!(
            result.contains("items.peek().push(1)"),
            "result: {}",
            result
        );
        assert!(result.contains("items.notify()"), "result: {}", result);
    }

    // ── PropertyAssignment kind ────────────────────────────────────

    #[test]
    fn property_assignment_wraps_with_peek_and_notify() {
        let source = "obj.name = 'x'";
        let result = transform(
            source,
            &[MutationInfo {
                variable_name: "obj".to_string(),
                kind: MutationKind::PropertyAssignment,
                start: 0,
                end: source.len() as u32,
            }],
        );
        assert!(result.contains("obj.peek().name"), "result: {}", result);
        assert!(result.contains("obj.notify()"), "result: {}", result);
    }

    // ── IndexAssignment kind ───────────────────────────────────────

    #[test]
    fn index_assignment_wraps_with_peek_and_notify() {
        let source = "items[0] = 'x'";
        let result = transform(
            source,
            &[MutationInfo {
                variable_name: "items".to_string(),
                kind: MutationKind::IndexAssignment,
                start: 0,
                end: source.len() as u32,
            }],
        );
        assert!(result.contains("items.peek()[0]"), "result: {}", result);
        assert!(result.contains("items.notify()"), "result: {}", result);
    }

    // ── Delete kind ────────────────────────────────────────────────

    #[test]
    fn delete_wraps_with_peek_and_notify() {
        let source = "delete obj.key";
        let result = transform(
            source,
            &[MutationInfo {
                variable_name: "obj".to_string(),
                kind: MutationKind::Delete,
                start: 0,
                end: source.len() as u32,
            }],
        );
        assert!(result.contains("obj.peek().key"), "result: {}", result);
        assert!(result.contains("obj.notify()"), "result: {}", result);
    }

    // ── ObjectAssign kind ──────────────────────────────────────────

    #[test]
    fn object_assign_wraps_with_peek_and_notify() {
        let source = "Object.assign(obj, { a: 1 })";
        let result = transform(
            source,
            &[MutationInfo {
                variable_name: "obj".to_string(),
                kind: MutationKind::ObjectAssign,
                start: 0,
                end: source.len() as u32,
            }],
        );
        assert!(
            result.contains("Object.assign(obj.peek()"),
            "result: {}",
            result
        );
        assert!(result.contains("obj.notify()"), "result: {}", result);
    }

    // ── Multiple mutations processed in reverse order ──────────────

    #[test]
    fn multiple_mutations_processed_correctly() {
        let source = "a.push(1); b.pop()";
        let result = transform(
            source,
            &[
                MutationInfo {
                    variable_name: "a".to_string(),
                    kind: MutationKind::MethodCall,
                    start: 0,
                    end: 9,
                },
                MutationInfo {
                    variable_name: "b".to_string(),
                    kind: MutationKind::MethodCall,
                    start: 11,
                    end: 18,
                },
            ],
        );
        assert!(result.contains("a.peek().push(1)"), "result: {}", result);
        assert!(result.contains("b.peek().pop()"), "result: {}", result);
    }

    // ── replace_with_boundary respects word boundaries ─────────────

    #[test]
    fn replace_with_boundary_skips_non_boundary() {
        // "xitems.push" should not match "items" because 'x' precedes it
        let result = replace_with_boundary("xitems.push(1)", "items", ".", "items.peek().");
        assert_eq!(result, "xitems.push(1)");
    }

    #[test]
    fn replace_with_boundary_matches_at_start() {
        let result = replace_with_boundary("items.push(1)", "items", ".", "items.peek().");
        assert_eq!(result, "items.peek().push(1)");
    }

    #[test]
    fn replace_with_boundary_skips_underscore_prefix() {
        let result = replace_with_boundary("_items.push(1)", "items", ".", "items.peek().");
        assert_eq!(result, "_items.push(1)");
    }

    #[test]
    fn replace_with_boundary_skips_dollar_prefix() {
        let result = replace_with_boundary("$items.push(1)", "items", ".", "items.peek().");
        assert_eq!(result, "$items.push(1)");
    }

    #[test]
    fn replace_with_boundary_skips_digit_prefix() {
        let result = replace_with_boundary("1items.push(1)", "items", ".", "items.peek().");
        assert_eq!(result, "1items.push(1)");
    }

    #[test]
    fn replace_with_boundary_matches_after_space() {
        let result = replace_with_boundary(" items.push(1)", "items", ".", "items.peek().");
        assert_eq!(result, " items.peek().push(1)");
    }

    #[test]
    fn replace_with_boundary_matches_after_paren() {
        let result = replace_with_boundary("(items.push(1))", "items", ".", "items.peek().");
        assert_eq!(result, "(items.peek().push(1))");
    }

    // ── End-to-end through compile ─────────────────────────────────

    #[test]
    fn compile_transforms_array_push_mutation() {
        let result = crate::compile(
            r#"function App() {
    let items = [];
    items.push('new');
    return <div>{items.length}</div>;
}"#,
            crate::CompileOptions {
                filename: Some("test.tsx".to_string()),
                ..Default::default()
            },
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
        assert!(result.code.contains(".notify()"), "code: {}", result.code);
    }

    #[test]
    fn compile_transforms_property_assignment_mutation() {
        let result = crate::compile(
            r#"function App() {
    let obj = { name: '' };
    obj.name = 'test';
    return <div>{obj.name}</div>;
}"#,
            crate::CompileOptions {
                filename: Some("test.tsx".to_string()),
                ..Default::default()
            },
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
        assert!(result.code.contains(".notify()"), "code: {}", result.code);
    }

    #[test]
    fn compile_transforms_delete_mutation() {
        let result = crate::compile(
            r#"function App() {
    let obj = { key: 'val' };
    delete obj.key;
    return <div>{obj.key}</div>;
}"#,
            crate::CompileOptions {
                filename: Some("test.tsx".to_string()),
                ..Default::default()
            },
        );
        assert!(result.code.contains(".peek()"), "code: {}", result.code);
        assert!(result.code.contains(".notify()"), "code: {}", result.code);
    }
}
