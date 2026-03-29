/// Session/auth resolution for SSR.
///
/// Extracts session data from request cookies and passes it into the
/// SSR rendering context so that authenticated content can be rendered
/// server-side.
use std::collections::HashMap;

/// Parsed session data from cookies.
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct SsrSession {
    /// The raw session token (if found).
    pub token: Option<String>,
    /// Whether the user is authenticated.
    pub authenticated: bool,
    /// User ID extracted from session (if available).
    pub user_id: Option<String>,
    /// Additional session data.
    pub data: HashMap<String, serde_json::Value>,
}

/// Cookie name used for Vertz sessions.
const SESSION_COOKIE_NAME: &str = "vertz_session";

/// Extract session information from a cookie header string.
///
/// Parses the `Cookie` header value and looks for the Vertz session cookie.
/// Returns session data if found.
pub fn extract_session_from_cookies(cookie_header: Option<&str>) -> SsrSession {
    let cookie_header = match cookie_header {
        Some(h) if !h.is_empty() => h,
        _ => return SsrSession::default(),
    };

    let cookies = parse_cookies(cookie_header);

    let token = cookies.get(SESSION_COOKIE_NAME).cloned();

    SsrSession {
        authenticated: token.is_some(),
        token,
        user_id: None,
        data: HashMap::new(),
    }
}

/// Parse a cookie header string into a map of name -> value.
fn parse_cookies(header: &str) -> HashMap<String, String> {
    let mut result = HashMap::new();

    for part in header.split(';') {
        let trimmed = part.trim();
        if let Some((name, value)) = trimmed.split_once('=') {
            result.insert(name.trim().to_string(), value.trim().to_string());
        }
    }

    result
}

/// Install session data into the V8 runtime for SSR access.
///
/// Makes session information available via `globalThis.__vertz_ssr_session`
/// so that `useAuth()` and related hooks can read it during SSR.
pub fn install_session(
    runtime: &mut crate::runtime::js_runtime::VertzJsRuntime,
    session: &SsrSession,
) -> Result<(), deno_core::error::AnyError> {
    let session_json = serde_json::json!({
        "authenticated": session.authenticated,
        "userId": session.user_id,
        "token": session.token,
        "data": session.data,
    });

    let code = format!(
        "globalThis.__vertz_ssr_session = {};",
        serde_json::to_string(&session_json).unwrap_or_else(|_| "null".to_string())
    );

    runtime.execute_script_void("[vertz:install-session]", &code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_session_no_cookies() {
        let session = extract_session_from_cookies(None);
        assert!(!session.authenticated);
        assert!(session.token.is_none());
    }

    #[test]
    fn test_extract_session_empty_cookies() {
        let session = extract_session_from_cookies(Some(""));
        assert!(!session.authenticated);
    }

    #[test]
    fn test_extract_session_with_session_cookie() {
        let session = extract_session_from_cookies(Some("vertz_session=abc123; other=xyz"));
        assert!(session.authenticated);
        assert_eq!(session.token, Some("abc123".to_string()));
    }

    #[test]
    fn test_extract_session_without_session_cookie() {
        let session = extract_session_from_cookies(Some("theme=dark; lang=en"));
        assert!(!session.authenticated);
        assert!(session.token.is_none());
    }

    #[test]
    fn test_parse_cookies_basic() {
        let cookies = parse_cookies("a=1; b=2; c=3");
        assert_eq!(cookies.get("a"), Some(&"1".to_string()));
        assert_eq!(cookies.get("b"), Some(&"2".to_string()));
        assert_eq!(cookies.get("c"), Some(&"3".to_string()));
    }

    #[test]
    fn test_parse_cookies_with_spaces() {
        let cookies = parse_cookies("  name = value ;  other = data  ");
        assert_eq!(cookies.get("name"), Some(&"value".to_string()));
        assert_eq!(cookies.get("other"), Some(&"data".to_string()));
    }

    #[test]
    fn test_install_session_in_runtime() {
        let mut rt = crate::runtime::js_runtime::VertzJsRuntime::new(
            crate::runtime::js_runtime::VertzRuntimeOptions {
                capture_output: true,
                ..Default::default()
            },
        )
        .unwrap();

        let session = SsrSession {
            token: Some("tok_123".to_string()),
            authenticated: true,
            user_id: Some("user_456".to_string()),
            data: HashMap::new(),
        };

        install_session(&mut rt, &session).unwrap();

        let result = rt
            .execute_script("<test>", "globalThis.__vertz_ssr_session.authenticated")
            .unwrap();
        assert_eq!(result, serde_json::json!(true));

        let user_id = rt
            .execute_script("<test>", "globalThis.__vertz_ssr_session.userId")
            .unwrap();
        assert_eq!(user_id, serde_json::json!("user_456"));
    }

    #[test]
    fn test_install_session_unauthenticated() {
        let mut rt = crate::runtime::js_runtime::VertzJsRuntime::new(
            crate::runtime::js_runtime::VertzRuntimeOptions {
                capture_output: true,
                ..Default::default()
            },
        )
        .unwrap();

        let session = SsrSession::default();
        install_session(&mut rt, &session).unwrap();

        let result = rt
            .execute_script("<test>", "globalThis.__vertz_ssr_session.authenticated")
            .unwrap();
        assert_eq!(result, serde_json::json!(false));
    }
}
