//! Platform detection for filtering platform-specific optional dependencies.
//!
//! npm packages use `os` and `cpu` fields in their package.json to declare
//! platform constraints. This module maps Rust's compile-time target to
//! npm-compatible platform names and implements the matching logic.

/// Returns the npm-compatible OS name for the current platform.
pub fn current_os() -> &'static str {
    if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "windows") {
        "win32"
    } else if cfg!(target_os = "freebsd") {
        "freebsd"
    } else if cfg!(target_os = "openbsd") {
        "openbsd"
    } else {
        "unknown"
    }
}

/// Returns the npm-compatible CPU architecture for the current platform.
pub fn current_cpu() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "arm64"
    } else if cfg!(target_arch = "x86_64") {
        "x64"
    } else if cfg!(target_arch = "x86") {
        "ia32"
    } else if cfg!(target_arch = "arm") {
        "arm"
    } else {
        "unknown"
    }
}

/// Check if the current platform matches a package's `os` and `cpu` constraints.
///
/// - `None` means no constraint (matches all platforms).
/// - Values starting with `!` are negations (e.g., `!win32` means "not Windows").
/// - For `os`: at least one non-negated value must match OR all values are negations
///   and none match the current OS.
/// - Same logic for `cpu`.
pub fn matches_platform(os: &Option<Vec<String>>, cpu: &Option<Vec<String>>) -> bool {
    matches_field(os, current_os()) && matches_field(cpu, current_cpu())
}

fn matches_field(constraint: &Option<Vec<String>>, current: &str) -> bool {
    let values = match constraint {
        None => return true,
        Some(v) if v.is_empty() => return true,
        Some(v) => v,
    };

    let has_positive = values.iter().any(|v| !v.starts_with('!'));

    if has_positive {
        // At least one positive value must match, and no negation must exclude
        let positive_match = values
            .iter()
            .filter(|v| !v.starts_with('!'))
            .any(|v| v == current);
        let negation_excludes = values
            .iter()
            .filter(|v| v.starts_with('!'))
            .any(|v| &v[1..] == current);
        positive_match && !negation_excludes
    } else {
        // All negations — current must not match any
        !values.iter().any(|v| &v[1..] == current)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_current_os_is_known() {
        let os = current_os();
        assert!(
            ["darwin", "linux", "win32", "freebsd", "openbsd"].contains(&os),
            "unexpected OS: {}",
            os
        );
    }

    #[test]
    fn test_current_cpu_is_known() {
        let cpu = current_cpu();
        assert!(
            ["arm64", "x64", "ia32", "arm"].contains(&cpu),
            "unexpected CPU: {}",
            cpu
        );
    }

    #[test]
    fn test_matches_platform_no_constraints() {
        assert!(matches_platform(&None, &None));
    }

    #[test]
    fn test_matches_platform_empty_constraints() {
        assert!(matches_platform(&Some(vec![]), &Some(vec![])));
    }

    #[test]
    fn test_matches_field_positive_match() {
        let os = Some(vec!["darwin".to_string(), "linux".to_string()]);
        assert!(matches_field(&os, "darwin"));
        assert!(matches_field(&os, "linux"));
        assert!(!matches_field(&os, "win32"));
    }

    #[test]
    fn test_matches_field_negation_only() {
        let os = Some(vec!["!win32".to_string()]);
        assert!(matches_field(&os, "darwin"));
        assert!(matches_field(&os, "linux"));
        assert!(!matches_field(&os, "win32"));
    }

    #[test]
    fn test_matches_field_mixed_positive_and_negation() {
        // "darwin, but not if excluded" — unusual but valid
        let os = Some(vec!["darwin".to_string(), "!darwin".to_string()]);
        // Positive match exists but negation excludes it
        assert!(!matches_field(&os, "darwin"));
    }

    #[test]
    fn test_matches_field_multiple_negations() {
        let os = Some(vec!["!win32".to_string(), "!linux".to_string()]);
        assert!(matches_field(&os, "darwin"));
        assert!(!matches_field(&os, "win32"));
        assert!(!matches_field(&os, "linux"));
    }

    #[test]
    fn test_matches_platform_current() {
        // Current platform should always match its own constraints
        let os = Some(vec![current_os().to_string()]);
        let cpu = Some(vec![current_cpu().to_string()]);
        assert!(matches_platform(&os, &cpu));
    }

    #[test]
    fn test_matches_platform_wrong_os() {
        let os = Some(vec!["aix".to_string()]);
        assert!(!matches_platform(&os, &None));
    }

    #[test]
    fn test_matches_platform_wrong_cpu() {
        let cpu = Some(vec!["s390x".to_string()]);
        assert!(!matches_platform(&None, &cpu));
    }

    #[test]
    fn test_matches_platform_os_match_cpu_mismatch() {
        let os = Some(vec![current_os().to_string()]);
        let cpu = Some(vec!["s390x".to_string()]);
        assert!(!matches_platform(&os, &cpu));
    }
}
