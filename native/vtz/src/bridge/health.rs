use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;
use std::sync::Arc;

use crate::server::mcp_events::KNOWN_EVENTS;
use crate::server::module_server::DevServerState;

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    dev_server_port: u16,
    uptime_secs: u64,
    available_event_types: &'static [&'static str],
}

pub async fn health_handler(State(state): State<Arc<DevServerState>>) -> impl IntoResponse {
    let uptime = state.start_time.elapsed().as_secs();

    (
        StatusCode::OK,
        Json(HealthResponse {
            status: "ok",
            dev_server_port: state.port,
            uptime_secs: uptime,
            available_event_types: KNOWN_EVENTS,
        }),
    )
}
