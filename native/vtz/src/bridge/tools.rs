use axum::response::IntoResponse;
use axum::Json;

use crate::server::mcp;

pub async fn tools_handler() -> impl IntoResponse {
    Json(mcp::tool_definitions())
}

#[cfg(test)]
mod tests {
    use crate::bridge::build_bridge_router;
    use crate::bridge::tests::make_test_state;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    async fn body_json(resp: axum::response::Response<Body>) -> serde_json::Value {
        let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024)
            .await
            .unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn test_tools_returns_tool_list() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .uri("/tools")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), 200);
        let json = body_json(resp).await;
        let tools = json["tools"].as_array().unwrap();
        assert!(!tools.is_empty());

        // Check that vertz_get_errors is in the list
        let has_get_errors = tools.iter().any(|t| t["name"] == "vertz_get_errors");
        assert!(has_get_errors);
    }

    #[tokio::test]
    async fn test_tools_each_has_schema() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .uri("/tools")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let json = body_json(resp).await;
        let tools = json["tools"].as_array().unwrap();

        for tool in tools {
            assert!(tool["name"].is_string(), "tool missing name: {:?}", tool);
            assert!(
                tool["description"].is_string(),
                "tool missing description: {:?}",
                tool
            );
            assert!(
                tool["inputSchema"].is_object(),
                "tool missing inputSchema: {:?}",
                tool
            );
        }
    }
}
