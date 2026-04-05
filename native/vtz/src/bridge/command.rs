use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::server::mcp;
use crate::server::module_server::DevServerState;

#[derive(Deserialize)]
pub struct CommandRequest {
    tool: String,
    #[serde(default = "default_args")]
    args: serde_json::Value,
}

fn default_args() -> serde_json::Value {
    serde_json::Value::Object(serde_json::Map::new())
}

#[derive(Serialize)]
pub struct CommandResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

pub async fn command_handler(
    State(state): State<Arc<DevServerState>>,
    Json(req): Json<CommandRequest>,
) -> impl IntoResponse {
    match mcp::execute_tool(&state, &req.tool, &req.args).await {
        Ok(result) => (
            StatusCode::OK,
            Json(CommandResponse {
                ok: true,
                result: Some(result),
                error: None,
            }),
        ),
        Err(msg) => (
            StatusCode::OK,
            Json(CommandResponse {
                ok: false,
                result: None,
                error: Some(msg),
            }),
        ),
    }
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
    async fn test_command_valid_tool() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/command")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"tool": "vertz_get_errors", "args": {}}"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), 200);
        let json = body_json(resp).await;
        assert_eq!(json["ok"], true);
        assert!(json["result"].is_object());
    }

    #[tokio::test]
    async fn test_command_unknown_tool() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/command")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"tool": "bogus", "args": {}}"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), 200);
        let json = body_json(resp).await;
        assert_eq!(json["ok"], false);
        assert!(json["error"].as_str().unwrap().contains("bogus"));
    }

    #[tokio::test]
    async fn test_command_missing_tool_field() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/command")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"args": {}}"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        // axum's Json extractor returns 422 for missing fields
        assert!(
            resp.status() == 400 || resp.status() == 422,
            "expected 400 or 422, got {}",
            resp.status()
        );
    }

    #[tokio::test]
    async fn test_command_malformed_json() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/command")
                    .header("content-type", "application/json")
                    .body(Body::from("not json"))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert!(
            resp.status() == 400 || resp.status() == 422,
            "expected 400 or 422, got {}",
            resp.status()
        );
    }

    #[tokio::test]
    async fn test_command_omitted_args_defaults_to_object() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/command")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"tool": "vertz_get_errors"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), 200);
        let json = body_json(resp).await;
        assert_eq!(json["ok"], true);
    }
}
