use axum::body::Body;
use axum::http::{header, Request, Response, StatusCode};
use std::collections::HashMap;

/// A single proxy rule: requests matching `prefix` are forwarded to `target`.
pub struct ProxyRule {
    /// Path prefix to match (e.g., "/api").
    pub prefix: String,
    /// Target base URL (e.g., "http://localhost:8080").
    pub target: url::Url,
    /// Path rewrite rules: `(regex, replacement)` applied in order.
    pub rewrites: Vec<(regex::Regex, String)>,
    /// Whether to set the Host header to the target's host.
    pub change_origin: bool,
    /// Custom headers to inject on the proxied request.
    pub headers: HashMap<String, String>,
}

/// Proxy configuration: a set of rules plus a shared HTTP client.
///
/// Debug is manually implemented because `reqwest::Client` does not derive it.
pub struct ProxyConfig {
    /// Rules sorted by prefix length descending (longest match first).
    pub rules: Vec<ProxyRule>,
    /// Shared HTTP client for connection pooling.
    pub client: reqwest::Client,
}

impl std::fmt::Debug for ProxyConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ProxyConfig")
            .field("rules_count", &self.rules.len())
            .finish()
    }
}

/// JSON shape for a single proxy target in `.vertzrc`.
///
/// ```json
/// {
///   "target": "http://localhost:8080",
///   "rewrite": { "^/api": "" },
///   "changeOrigin": true,
///   "headers": { "X-Accel-Buffering": "no" }
/// }
/// ```
#[derive(serde::Deserialize)]
struct ProxyTargetJson {
    target: String,
    #[serde(default)]
    rewrite: HashMap<String, String>,
    #[serde(rename = "changeOrigin", default)]
    change_origin: bool,
    #[serde(default)]
    headers: HashMap<String, String>,
}

impl ProxyConfig {
    /// Parse proxy configuration from a `.vertzrc` `proxy` JSON value.
    ///
    /// The value should be an object mapping path prefixes to proxy targets:
    /// ```json
    /// {
    ///   "/api": { "target": "http://localhost:8080", "rewrite": { "^/api": "" } }
    /// }
    /// ```
    pub fn from_json(value: &serde_json::Value) -> Result<Self, String> {
        let obj = value
            .as_object()
            .ok_or_else(|| "proxy config must be an object".to_string())?;

        let mut rules = Vec::new();

        for (prefix, target_value) in obj {
            let target_json: ProxyTargetJson = serde_json::from_value(target_value.clone())
                .map_err(|e| format!("invalid proxy config for \"{}\": {}", prefix, e))?;

            let target = url::Url::parse(&target_json.target)
                .map_err(|e| format!("invalid target URL for \"{}\": {}", prefix, e))?;

            let mut rewrites = Vec::new();
            for (pattern, replacement) in &target_json.rewrite {
                let re = regex::Regex::new(pattern).map_err(|e| {
                    format!(
                        "invalid rewrite regex \"{}\" for \"{}\": {}",
                        pattern, prefix, e
                    )
                })?;
                rewrites.push((re, replacement.clone()));
            }

            rules.push(ProxyRule {
                prefix: prefix.clone(),
                target,
                rewrites,
                change_origin: target_json.change_origin,
                headers: target_json.headers,
            });
        }

        // Sort by prefix length descending so longest match wins.
        rules.sort_by(|a, b| b.prefix.len().cmp(&a.prefix.len()));

        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(5))
            .no_proxy()
            .build()
            .map_err(|e| format!("failed to create HTTP client: {}", e))?;

        Ok(Self { rules, client })
    }
}

/// Find the first proxy rule whose prefix matches the given path.
pub fn find_matching_rule<'a>(config: &'a ProxyConfig, path: &str) -> Option<&'a ProxyRule> {
    config
        .rules
        .iter()
        .find(|rule| path.starts_with(&rule.prefix))
}

/// Rewrite a path using the proxy rule's rewrite patterns.
fn rewrite_path(rule: &ProxyRule, path: &str) -> String {
    let mut result = path.to_string();
    for (re, replacement) in &rule.rewrites {
        result = re.replace_all(&result, replacement.as_str()).to_string();
    }
    result
}

/// Build the target URL by combining the rule's target with the rewritten path.
fn build_target_url(rule: &ProxyRule, path: &str, query: Option<&str>) -> String {
    let rewritten = rewrite_path(rule, path);

    // Combine target origin with rewritten path
    let mut url = format!(
        "{}://{}",
        rule.target.scheme(),
        rule.target.host_str().unwrap_or("localhost"),
    );

    if let Some(port) = rule.target.port() {
        url.push_str(&format!(":{}", port));
    }

    // Append the target's own path prefix (stripping trailing slash to avoid //)
    let base_path = rule.target.path().trim_end_matches('/');
    url.push_str(base_path);

    // Append the rewritten request path
    if !rewritten.starts_with('/') {
        url.push('/');
    }
    url.push_str(&rewritten);

    // Preserve query string
    if let Some(q) = query {
        url.push('?');
        url.push_str(q);
    }

    url
}

/// Forward an HTTP request to the proxy target and stream the response back.
///
/// Returns `Some(response)` if a proxy rule matched; `None` otherwise
/// (caller should continue normal handling).
pub async fn try_proxy_request(config: &ProxyConfig, req: Request<Body>) -> Option<Response<Body>> {
    let path = req.uri().path().to_string();
    let query = req.uri().query().map(|q| q.to_string());

    let rule = find_matching_rule(config, &path)?;

    let target_url = build_target_url(rule, &path, query.as_deref());

    let method = convert_method(req.method());

    // Build the proxied request
    let mut proxy_req = config.client.request(method, &target_url);

    // Forward original headers (except Host — we may override it)
    for (name, value) in req.headers() {
        if name == header::HOST {
            continue;
        }
        if let Ok(v) = value.to_str() {
            proxy_req = proxy_req.header(name.as_str(), v);
        }
    }

    // Set Host header to target's host when changeOrigin is true
    if rule.change_origin {
        if let Some(host) = rule.target.host_str() {
            let host_value = if let Some(port) = rule.target.port() {
                format!("{}:{}", host, port)
            } else {
                host.to_string()
            };
            proxy_req = proxy_req.header("host", &host_value);
        }
    }

    // Inject custom headers
    for (name, value) in &rule.headers {
        proxy_req = proxy_req.header(name.as_str(), value.as_str());
    }

    // Forward request body
    let body_bytes = match axum::body::to_bytes(req.into_body(), 100 * 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("[proxy] Failed to read request body: {}", e);
            return Some(error_response(
                StatusCode::BAD_REQUEST,
                &format!("Failed to read request body: {}", e),
            ));
        }
    };

    if !body_bytes.is_empty() {
        proxy_req = proxy_req.body(body_bytes);
    }

    // Send the request
    match proxy_req.send().await {
        Ok(resp) => Some(convert_response_streaming(resp).await),
        Err(e) => {
            eprintln!("[proxy] {} → {} failed: {}", path, target_url, e);
            Some(error_response(
                StatusCode::BAD_GATEWAY,
                &format!("Proxy error: {}", e),
            ))
        }
    }
}

/// Convert an axum HTTP method to a reqwest method.
fn convert_method(method: &axum::http::Method) -> reqwest::Method {
    match *method {
        axum::http::Method::GET => reqwest::Method::GET,
        axum::http::Method::POST => reqwest::Method::POST,
        axum::http::Method::PUT => reqwest::Method::PUT,
        axum::http::Method::DELETE => reqwest::Method::DELETE,
        axum::http::Method::PATCH => reqwest::Method::PATCH,
        axum::http::Method::HEAD => reqwest::Method::HEAD,
        axum::http::Method::OPTIONS => reqwest::Method::OPTIONS,
        _ => reqwest::Method::GET,
    }
}

/// Convert a reqwest response to an axum response, streaming the body.
async fn convert_response_streaming(resp: reqwest::Response) -> Response<Body> {
    use futures_util::StreamExt;

    let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);

    let mut builder = Response::builder().status(status);

    // Forward response headers
    for (name, value) in resp.headers() {
        builder = builder.header(name.as_str(), value.as_bytes());
    }

    // Stream the body (important for SSE)
    let stream = resp
        .bytes_stream()
        .map(|result| result.map_err(std::io::Error::other));

    builder.body(Body::from_stream(stream)).unwrap_or_else(|_| {
        error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to build proxy response",
        )
    })
}

/// Build a JSON error response.
fn error_response(status: StatusCode, message: &str) -> Response<Body> {
    let body = serde_json::json!({ "error": message }).to_string();
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body))
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Config parsing tests ──

    #[test]
    fn test_parse_minimal_proxy_config() {
        let json = serde_json::json!({
            "/api": { "target": "http://localhost:8080" }
        });
        let config = ProxyConfig::from_json(&json).unwrap();
        assert_eq!(config.rules.len(), 1);
        assert_eq!(config.rules[0].prefix, "/api");
        assert_eq!(config.rules[0].target.as_str(), "http://localhost:8080/");
        assert!(!config.rules[0].change_origin);
        assert!(config.rules[0].rewrites.is_empty());
        assert!(config.rules[0].headers.is_empty());
    }

    #[test]
    fn test_parse_full_proxy_config() {
        let json = serde_json::json!({
            "/api": {
                "target": "http://localhost:8080",
                "rewrite": { "^/api": "" },
                "changeOrigin": true,
                "headers": { "X-Accel-Buffering": "no" }
            }
        });
        let config = ProxyConfig::from_json(&json).unwrap();
        let rule = &config.rules[0];
        assert_eq!(rule.prefix, "/api");
        assert!(rule.change_origin);
        assert_eq!(rule.rewrites.len(), 1);
        assert_eq!(
            rule.headers.get("X-Accel-Buffering"),
            Some(&"no".to_string())
        );
    }

    #[test]
    fn test_parse_multiple_prefixes_sorted_by_length() {
        let json = serde_json::json!({
            "/api": { "target": "http://localhost:8080" },
            "/api/v2": { "target": "http://localhost:9090" },
            "/ws": { "target": "http://localhost:3000" }
        });
        let config = ProxyConfig::from_json(&json).unwrap();
        assert_eq!(config.rules.len(), 3);
        // Longest prefix first
        assert_eq!(config.rules[0].prefix, "/api/v2");
        assert_eq!(config.rules[1].prefix, "/api");
        assert_eq!(config.rules[2].prefix, "/ws");
    }

    #[test]
    fn test_parse_empty_proxy_config() {
        let json = serde_json::json!({});
        let config = ProxyConfig::from_json(&json).unwrap();
        assert!(config.rules.is_empty());
    }

    #[test]
    fn test_parse_invalid_target_url() {
        let json = serde_json::json!({
            "/api": { "target": "not a url" }
        });
        let err = ProxyConfig::from_json(&json).unwrap_err();
        assert!(err.contains("invalid target URL"));
    }

    #[test]
    fn test_parse_invalid_rewrite_regex() {
        let json = serde_json::json!({
            "/api": {
                "target": "http://localhost:8080",
                "rewrite": { "[invalid": "" }
            }
        });
        let err = ProxyConfig::from_json(&json).unwrap_err();
        assert!(err.contains("invalid rewrite regex"));
    }

    #[test]
    fn test_parse_non_object_returns_error() {
        let json = serde_json::json!("string");
        let err = ProxyConfig::from_json(&json).unwrap_err();
        assert!(err.contains("must be an object"));
    }

    #[test]
    fn test_parse_missing_target_returns_error() {
        let json = serde_json::json!({
            "/api": { "changeOrigin": true }
        });
        assert!(ProxyConfig::from_json(&json).is_err());
    }

    // ── Path matching tests ──

    #[test]
    fn test_find_matching_rule_matches_prefix() {
        let json = serde_json::json!({
            "/api": { "target": "http://localhost:8080" }
        });
        let config = ProxyConfig::from_json(&json).unwrap();
        assert!(find_matching_rule(&config, "/api/users").is_some());
        assert!(find_matching_rule(&config, "/api").is_some());
    }

    #[test]
    fn test_find_matching_rule_no_match() {
        let json = serde_json::json!({
            "/api": { "target": "http://localhost:8080" }
        });
        let config = ProxyConfig::from_json(&json).unwrap();
        assert!(find_matching_rule(&config, "/health").is_none());
        assert!(find_matching_rule(&config, "/src/main.tsx").is_none());
    }

    #[test]
    fn test_find_matching_rule_longest_prefix_wins() {
        let json = serde_json::json!({
            "/api": { "target": "http://localhost:8080" },
            "/api/v2": { "target": "http://localhost:9090" }
        });
        let config = ProxyConfig::from_json(&json).unwrap();
        let rule = find_matching_rule(&config, "/api/v2/users").unwrap();
        assert_eq!(rule.target.as_str(), "http://localhost:9090/");
    }

    // ── Path rewriting tests ──

    #[test]
    fn test_rewrite_strips_prefix() {
        let json = serde_json::json!({
            "/api": {
                "target": "http://localhost:8080",
                "rewrite": { "^/api": "" }
            }
        });
        let config = ProxyConfig::from_json(&json).unwrap();
        let result = rewrite_path(&config.rules[0], "/api/users");
        assert_eq!(result, "/users");
    }

    #[test]
    fn test_rewrite_replaces_prefix() {
        let json = serde_json::json!({
            "/old-api": {
                "target": "http://localhost:8080",
                "rewrite": { "^/old-api": "/new-api" }
            }
        });
        let config = ProxyConfig::from_json(&json).unwrap();
        let result = rewrite_path(&config.rules[0], "/old-api/users");
        assert_eq!(result, "/new-api/users");
    }

    #[test]
    fn test_rewrite_no_rules_passes_through() {
        let json = serde_json::json!({
            "/api": { "target": "http://localhost:8080" }
        });
        let config = ProxyConfig::from_json(&json).unwrap();
        let result = rewrite_path(&config.rules[0], "/api/users");
        assert_eq!(result, "/api/users");
    }

    // ── Target URL building tests ──

    #[test]
    fn test_build_target_url_simple() {
        let json = serde_json::json!({
            "/api": {
                "target": "http://localhost:8080",
                "rewrite": { "^/api": "" }
            }
        });
        let config = ProxyConfig::from_json(&json).unwrap();
        let url = build_target_url(&config.rules[0], "/api/users", None);
        assert_eq!(url, "http://localhost:8080/users");
    }

    #[test]
    fn test_build_target_url_with_query() {
        let json = serde_json::json!({
            "/api": {
                "target": "http://localhost:8080",
                "rewrite": { "^/api": "" }
            }
        });
        let config = ProxyConfig::from_json(&json).unwrap();
        let url = build_target_url(&config.rules[0], "/api/users", Some("page=1&limit=10"));
        assert_eq!(url, "http://localhost:8080/users?page=1&limit=10");
    }

    #[test]
    fn test_build_target_url_no_rewrite() {
        let json = serde_json::json!({
            "/api": { "target": "http://localhost:8080" }
        });
        let config = ProxyConfig::from_json(&json).unwrap();
        let url = build_target_url(&config.rules[0], "/api/users", None);
        assert_eq!(url, "http://localhost:8080/api/users");
    }

    #[test]
    fn test_build_target_url_with_target_path() {
        let json = serde_json::json!({
            "/api": {
                "target": "http://localhost:8080/v1",
                "rewrite": { "^/api": "" }
            }
        });
        let config = ProxyConfig::from_json(&json).unwrap();
        let url = build_target_url(&config.rules[0], "/api/users", None);
        assert_eq!(url, "http://localhost:8080/v1/users");
    }

    // ── Method conversion tests ──

    #[test]
    fn test_convert_method() {
        assert_eq!(
            convert_method(&axum::http::Method::GET),
            reqwest::Method::GET
        );
        assert_eq!(
            convert_method(&axum::http::Method::POST),
            reqwest::Method::POST
        );
        assert_eq!(
            convert_method(&axum::http::Method::PUT),
            reqwest::Method::PUT
        );
        assert_eq!(
            convert_method(&axum::http::Method::DELETE),
            reqwest::Method::DELETE
        );
        assert_eq!(
            convert_method(&axum::http::Method::PATCH),
            reqwest::Method::PATCH
        );
        assert_eq!(
            convert_method(&axum::http::Method::HEAD),
            reqwest::Method::HEAD
        );
        assert_eq!(
            convert_method(&axum::http::Method::OPTIONS),
            reqwest::Method::OPTIONS
        );
    }
}
