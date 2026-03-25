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
