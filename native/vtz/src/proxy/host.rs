/// Extract the subdomain from a Host header value for route lookup.
///
/// Given a host like `feat-auth.my-app.localhost:4000`, extracts
/// `feat-auth.my-app` (everything before `.localhost`).
///
/// Returns `None` if:
/// - The host is just `localhost` (root domain, for dashboard)
/// - The host doesn't end with `.localhost`
pub fn extract_subdomain(host: &str) -> Option<String> {
    let hostname = strip_port(host);
    let suffix = ".localhost";
    if hostname == "localhost" {
        return None;
    }
    if let Some(prefix) = hostname.strip_suffix(suffix) {
        if !prefix.is_empty() {
            return Some(prefix.to_string());
        }
    }
    None
}

/// Strip the port from a Host header value.
/// `localhost:4000` → `localhost`, `feat-auth.my-app.localhost` → unchanged.
fn strip_port(host: &str) -> &str {
    host.split(':').next().unwrap_or(host)
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- strip_port tests ---

    #[test]
    fn strip_port_removes_port() {
        assert_eq!(strip_port("localhost:4000"), "localhost");
    }

    #[test]
    fn strip_port_no_port() {
        assert_eq!(strip_port("localhost"), "localhost");
    }

    #[test]
    fn strip_port_subdomain_with_port() {
        assert_eq!(
            strip_port("feat-auth.my-app.localhost:4000"),
            "feat-auth.my-app.localhost"
        );
    }

    // --- extract_subdomain tests ---

    #[test]
    fn extract_subdomain_simple() {
        assert_eq!(
            extract_subdomain("feat-auth.my-app.localhost"),
            Some("feat-auth.my-app".to_string())
        );
    }

    #[test]
    fn extract_subdomain_with_port() {
        assert_eq!(
            extract_subdomain("feat-auth.my-app.localhost:4000"),
            Some("feat-auth.my-app".to_string())
        );
    }

    #[test]
    fn extract_subdomain_single_level() {
        assert_eq!(
            extract_subdomain("my-app.localhost"),
            Some("my-app".to_string())
        );
    }

    #[test]
    fn extract_subdomain_root_returns_none() {
        assert_eq!(extract_subdomain("localhost"), None);
        assert_eq!(extract_subdomain("localhost:4000"), None);
    }

    #[test]
    fn extract_subdomain_non_localhost_returns_none() {
        assert_eq!(extract_subdomain("example.com"), None);
        assert_eq!(extract_subdomain("feat-auth.example.com"), None);
    }

    #[test]
    fn extract_subdomain_preserves_dots() {
        // Multi-level subdomain: branch.project
        assert_eq!(
            extract_subdomain("fix-bug-123.my-app.localhost"),
            Some("fix-bug-123.my-app".to_string())
        );
    }
}
