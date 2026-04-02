/// Sanitize a string into a valid DNS label.
///
/// Rules:
/// - Replace `/` with `-`
/// - Replace non-alphanumeric (except `-`) with `-`
/// - Collapse consecutive `-`
/// - Lowercase everything
/// - Strip leading/trailing `-`
/// - Truncate to 63 chars (DNS label limit)
pub fn sanitize_label(input: &str) -> String {
    const MAX_LABEL_LEN: usize = 63;

    let sanitized: String = input
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();

    // Collapse consecutive dashes
    let mut result = String::with_capacity(sanitized.len());
    let mut prev_dash = false;
    for c in sanitized.chars() {
        if c == '-' {
            if !prev_dash {
                result.push('-');
            }
            prev_dash = true;
        } else {
            result.push(c);
            prev_dash = false;
        }
    }

    // Strip leading/trailing dashes
    let trimmed = result.trim_matches('-');

    // Truncate to DNS label limit, then strip any trailing dash from the cut
    if trimmed.len() <= MAX_LABEL_LEN {
        trimmed.to_string()
    } else {
        trimmed[..MAX_LABEL_LEN].trim_end_matches('-').to_string()
    }
}

/// Build a subdomain from a git branch name and project name.
///
/// - Default branches (main, master) produce just the project name.
/// - Other branches produce `<sanitized-branch>.<sanitized-project>`.
/// - `--name` override produces just the override name.
pub fn to_subdomain(branch: &str, project: &str) -> String {
    let sanitized_project = sanitize_label(project);

    if is_default_branch(branch) {
        sanitized_project
    } else {
        let sanitized_branch = sanitize_label(branch);
        format!("{}.{}", sanitized_branch, sanitized_project)
    }
}

/// Check if a branch is the default branch (main or master).
fn is_default_branch(branch: &str) -> bool {
    matches!(branch, "main" | "master")
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- sanitize_label tests ---

    #[test]
    fn sanitize_replaces_slash_with_dash() {
        assert_eq!(sanitize_label("feat/auth"), "feat-auth");
    }

    #[test]
    fn sanitize_lowercases() {
        assert_eq!(sanitize_label("Feat-Auth"), "feat-auth");
    }

    #[test]
    fn sanitize_replaces_non_alphanumeric_with_dash() {
        assert_eq!(sanitize_label("feat_auth!!!"), "feat-auth");
    }

    #[test]
    fn sanitize_collapses_consecutive_dashes() {
        assert_eq!(sanitize_label("feat--auth"), "feat-auth");
        assert_eq!(sanitize_label("a///b"), "a-b");
    }

    #[test]
    fn sanitize_strips_leading_trailing_dashes() {
        assert_eq!(sanitize_label("-feat-auth-"), "feat-auth");
        assert_eq!(sanitize_label("---hello---"), "hello");
    }

    #[test]
    fn sanitize_truncates_to_63_chars() {
        let long_input = "a".repeat(100);
        let result = sanitize_label(&long_input);
        assert_eq!(result.len(), 63);
    }

    #[test]
    fn sanitize_truncation_does_not_leave_trailing_dash() {
        // 62 a's + dash + more chars → truncates at 63, dash is at position 62
        let input = format!("{}-bbb", "a".repeat(62));
        let result = sanitize_label(&input);
        assert!(!result.ends_with('-'));
        assert_eq!(result.len(), 62);
    }

    #[test]
    fn sanitize_empty_input() {
        assert_eq!(sanitize_label(""), "");
    }

    #[test]
    fn sanitize_only_special_chars() {
        assert_eq!(sanitize_label("!!!"), "");
    }

    #[test]
    fn sanitize_preserves_digits() {
        assert_eq!(sanitize_label("fix/bug-123"), "fix-bug-123");
    }

    #[test]
    fn sanitize_complex_branch_name() {
        assert_eq!(sanitize_label("feat/Auth_System!!!"), "feat-auth-system");
    }

    // --- is_default_branch tests ---

    #[test]
    fn main_is_default_branch() {
        assert!(is_default_branch("main"));
    }

    #[test]
    fn master_is_default_branch() {
        assert!(is_default_branch("master"));
    }

    #[test]
    fn feature_branch_is_not_default() {
        assert!(!is_default_branch("feat/auth"));
    }

    // --- to_subdomain tests ---

    #[test]
    fn default_branch_uses_project_name_only() {
        assert_eq!(to_subdomain("main", "my-app"), "my-app");
        assert_eq!(to_subdomain("master", "my-app"), "my-app");
    }

    #[test]
    fn feature_branch_prefixes_project() {
        assert_eq!(to_subdomain("feat/auth", "my-app"), "feat-auth.my-app");
    }

    #[test]
    fn branch_and_project_are_sanitized() {
        assert_eq!(
            to_subdomain("feat/Auth_System", "My App!!!"),
            "feat-auth-system.my-app"
        );
    }

    #[test]
    fn fix_branch_with_number() {
        assert_eq!(to_subdomain("fix/bug-123", "my-app"), "fix-bug-123.my-app");
    }
}
