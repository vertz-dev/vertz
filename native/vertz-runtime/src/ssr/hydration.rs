//! Hydration data serialization for SSR.
//!
//! After SSR, the query cache (pre-fetched data) is serialized into the HTML
//! as a `<script>` tag so the client can hydrate without re-fetching data.
//!
//! The data is embedded as:
//! ```html
//! <script>window.__VERTZ_SSR_DATA__ = {"queryCache": {...}}</script>
//! ```

/// Hydration data to be serialized into the HTML.
#[derive(Debug, Clone, Default)]
pub struct HydrationData {
    /// Serialized query cache entries (key -> JSON string).
    pub query_cache: std::collections::HashMap<String, serde_json::Value>,
    /// Timestamp when the SSR render occurred (for cache freshness).
    pub render_timestamp: u64,
    /// The URL that was rendered (for hydration mismatch detection).
    pub rendered_url: String,
}

/// Serialize hydration data as a `<script>` tag for embedding in SSR HTML.
///
/// The client expects `__VERTZ_SSR_DATA__` to be an **array** of
/// `{ key, data }` entries (see `hydrateQueryFromSSR` in @vertz/ui).
/// The output is safe to embed in HTML (JSON content is escaped).
pub fn serialize_hydration_data(data: &HydrationData) -> String {
    // Convert HashMap to the array format the client expects
    let entries: Vec<serde_json::Value> = data
        .query_cache
        .iter()
        .map(|(key, value)| {
            serde_json::json!({
                "key": key,
                "data": value,
            })
        })
        .collect();

    let json_str = serde_json::to_string(&entries).unwrap_or_else(|_| "[]".to_string());

    // Escape </script> to prevent XSS via payload
    let escaped = json_str
        .replace("</script>", "<\\/script>")
        .replace("</Script>", "<\\/Script>");

    format!(
        "  <script>window.__VERTZ_SSR_DATA__ = {};</script>\n",
        escaped
    )
}

/// Serialize empty hydration data (no queries, just metadata).
pub fn serialize_empty_hydration_data(url: &str) -> String {
    let data = HydrationData {
        query_cache: std::collections::HashMap::new(),
        render_timestamp: current_timestamp(),
        rendered_url: url.to_string(),
    };
    serialize_hydration_data(&data)
}

/// Collect hydration data from the V8 runtime after SSR rendering.
///
/// Reads from `globalThis.__vertz_ssr_queries` which is populated by
/// the SSR query tracking system during rendering.
pub fn collect_hydration_data(
    runtime: &mut crate::runtime::js_runtime::VertzJsRuntime,
    url: &str,
) -> Result<HydrationData, deno_core::error::AnyError> {
    let result = runtime.execute_script(
        "[vertz:collect-hydration]",
        r#"
        (function() {
            const queries = globalThis.__vertz_ssr_queries || {};
            return queries;
        })()
        "#,
    )?;

    let query_cache = if let serde_json::Value::Object(map) = result {
        map.into_iter().collect()
    } else {
        std::collections::HashMap::new()
    };

    Ok(HydrationData {
        query_cache,
        render_timestamp: current_timestamp(),
        rendered_url: url.to_string(),
    })
}

/// Get the current timestamp in milliseconds.
fn current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_serialize_empty_hydration_data() {
        let data = HydrationData {
            query_cache: HashMap::new(),
            render_timestamp: 1000,
            rendered_url: "/".to_string(),
        };
        let result = serialize_hydration_data(&data);
        assert!(result.contains("window.__VERTZ_SSR_DATA__"));
        // Empty cache produces an empty array
        assert!(result.contains("__VERTZ_SSR_DATA__ = []"));
    }

    #[test]
    fn test_serialize_with_query_cache() {
        let mut cache = HashMap::new();
        cache.insert(
            "tasks".to_string(),
            serde_json::json!({"items": [{"id": "1", "title": "Test"}]}),
        );
        let data = HydrationData {
            query_cache: cache,
            render_timestamp: 2000,
            rendered_url: "/tasks".to_string(),
        };
        let result = serialize_hydration_data(&data);
        // Array format: [{ "key": "tasks", "data": {...} }]
        assert!(result.contains("\"key\":\"tasks\""));
        assert!(result.contains("\"data\""));
        assert!(result.contains("\"Test\""));
    }

    #[test]
    fn test_serialize_escapes_script_tags() {
        let mut cache = HashMap::new();
        cache.insert(
            "xss".to_string(),
            serde_json::json!("</script><script>alert('xss')"),
        );
        let data = HydrationData {
            query_cache: cache,
            render_timestamp: 0,
            rendered_url: "/".to_string(),
        };
        let result = serialize_hydration_data(&data);
        assert!(
            !result.contains("</script><script>"),
            "Should escape </script> in payload"
        );
        assert!(result.contains("<\\/script>"));
    }

    #[test]
    fn test_serialize_large_payload() {
        let mut cache = HashMap::new();
        // Create a large payload
        let items: Vec<serde_json::Value> = (0..1000)
            .map(|i| {
                serde_json::json!({
                    "id": i,
                    "title": format!("Task {}", i),
                    "description": "A".repeat(100),
                })
            })
            .collect();
        cache.insert("tasks".to_string(), serde_json::json!({"items": items}));

        let data = HydrationData {
            query_cache: cache,
            render_timestamp: 0,
            rendered_url: "/tasks".to_string(),
        };
        let result = serialize_hydration_data(&data);
        // Should not truncate
        assert!(
            result.contains("\"Task 999\""),
            "Large payload should not be truncated"
        );
    }

    #[test]
    fn test_serialize_empty_helper() {
        let result = serialize_empty_hydration_data("/about");
        assert!(result.contains("window.__VERTZ_SSR_DATA__"));
        assert!(result.contains("__VERTZ_SSR_DATA__ = []"));
    }

    #[test]
    fn test_serialize_produces_valid_js() {
        let mut cache = HashMap::new();
        cache.insert("key".to_string(), serde_json::json!({"nested": true}));
        let data = HydrationData {
            query_cache: cache,
            render_timestamp: 12345,
            rendered_url: "/test".to_string(),
        };
        let result = serialize_hydration_data(&data);
        // Should be wrapped in a script tag
        assert!(result.starts_with("  <script>"));
        assert!(result.trim_end().ends_with("</script>"));
        // Should be valid assignment with array format
        assert!(result.contains("window.__VERTZ_SSR_DATA__ = ["));
    }

    #[test]
    fn test_collect_hydration_data_from_runtime() {
        let mut rt = crate::runtime::js_runtime::VertzJsRuntime::new(
            crate::runtime::js_runtime::VertzRuntimeOptions {
                capture_output: true,
                ..Default::default()
            },
        )
        .unwrap();

        crate::ssr::dom_shim::load_dom_shim(&mut rt).unwrap();

        // Simulate query data being set during SSR
        rt.execute_script_void(
            "<test>",
            r#"
            globalThis.__vertz_ssr_queries = {
                "tasks": { "items": [{ "id": "1", "title": "Test Task" }] }
            };
            "#,
        )
        .unwrap();

        let data = collect_hydration_data(&mut rt, "/tasks").unwrap();
        assert_eq!(data.rendered_url, "/tasks");
        assert!(data.query_cache.contains_key("tasks"));
        let tasks = &data.query_cache["tasks"];
        assert_eq!(tasks["items"][0]["title"], "Test Task");
    }

    #[test]
    fn test_collect_hydration_data_empty() {
        let mut rt = crate::runtime::js_runtime::VertzJsRuntime::new(
            crate::runtime::js_runtime::VertzRuntimeOptions {
                capture_output: true,
                ..Default::default()
            },
        )
        .unwrap();

        crate::ssr::dom_shim::load_dom_shim(&mut rt).unwrap();

        let data = collect_hydration_data(&mut rt, "/").unwrap();
        assert!(data.query_cache.is_empty());
    }
}
