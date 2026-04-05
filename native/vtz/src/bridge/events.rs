use axum::extract::{Query, State};
use axum::response::sse::{Event, KeepAlive, Sse};
use futures_util::stream::Stream;
use serde::Deserialize;
use std::collections::HashSet;
use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;

use crate::server::mcp_events::{self, iso_timestamp, McpEvent, SubscribedData, KNOWN_EVENTS};
use crate::server::module_server::DevServerState;

#[derive(Deserialize)]
pub struct EventsParams {
    /// Comma-separated event names to subscribe to.
    /// When absent, all events are relayed.
    #[serde(default)]
    subscribe: Option<String>,
}

pub async fn events_handler(
    State(state): State<Arc<DevServerState>>,
    Query(params): Query<EventsParams>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut broadcast_rx = state.mcp_event_hub.subscribe();

    // Parse subscription filter
    let filter: Option<HashSet<String>> = params.subscribe.as_ref().and_then(|s| {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.split(',').map(|s| s.trim().to_string()).collect())
        }
    });

    // Validate filter and build ack event
    let subscribe_ack = filter.as_ref().map(|set| {
        let requested: Vec<String> = set.iter().cloned().collect();
        let (active, unknown) = mcp_events::validate_subscription(&requested);
        McpEvent::Subscribed {
            timestamp: iso_timestamp(),
            data: SubscribedData {
                active_filter: active,
                unknown_events: unknown,
            },
        }
    });

    // Build the validated filter set (only known events)
    let valid_filter: Option<HashSet<String>> = filter.map(|set| {
        set.into_iter()
            .filter(|name| KNOWN_EVENTS.contains(&name.as_str()))
            .collect()
    });

    // Build server_status handshake
    let server_status = mcp_events::build_server_status(&state).await;

    let stream = async_stream::stream! {
        let mut next_id: u64 = 0;

        // 1. Always send server_status first
        yield Ok(Event::default()
            .id(next_id.to_string())
            .data(server_status.to_json()));
        next_id += 1;

        // 2. Send subscription ack if filter was provided
        if let Some(ack) = subscribe_ack {
            yield Ok(Event::default()
                .id(next_id.to_string())
                .data(ack.to_json()));
            next_id += 1;
        }

        // 3. Stream broadcast events, applying filter
        loop {
            match broadcast_rx.recv().await {
                Ok(event) => {
                    let event_name = event.event_name();
                    let should_send = match &valid_filter {
                        None => true,
                        Some(set) => set.contains(event_name),
                    };

                    if should_send {
                        yield Ok(Event::default()
                            .id(next_id.to_string())
                            .data(event.to_json()));
                        next_id += 1;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    eprintln!("[Bridge] SSE client lagged, dropped {} events", n);
                    continue;
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bridge::build_bridge_router;
    use crate::bridge::tests::make_test_state;
    use axum::body::Body;
    use axum::http::Request;
    use futures_util::StreamExt;
    use http_body_util::BodyStream;
    use tower::ServiceExt;

    /// Read SSE data from an infinite stream body, collecting data lines
    /// until we have at least `min_events` events or timeout.
    async fn read_sse_events(body: Body, min_events: usize) -> Vec<String> {
        let mut stream = BodyStream::new(body);
        let mut collected = String::new();
        let deadline = tokio::time::Instant::now() + Duration::from_secs(2);

        loop {
            let result = tokio::time::timeout_at(deadline, stream.next()).await;
            match result {
                Ok(Some(Ok(frame))) => {
                    if let Ok(bytes) = frame.into_data() {
                        collected.push_str(&String::from_utf8_lossy(&bytes));
                        let event_count =
                            collected.lines().filter(|l| l.starts_with("data:")).count();
                        if event_count >= min_events {
                            break;
                        }
                    }
                }
                _ => break,
            }
        }

        collected
            .lines()
            .filter(|l| l.starts_with("data:"))
            .map(|l| l.strip_prefix("data:").unwrap().trim().to_string())
            .collect()
    }

    #[tokio::test]
    async fn test_events_returns_sse_content_type() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .uri("/events")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), 200);
        let content_type = resp
            .headers()
            .get("content-type")
            .unwrap()
            .to_str()
            .unwrap();
        assert!(
            content_type.contains("text/event-stream"),
            "expected text/event-stream, got: {}",
            content_type
        );
    }

    #[tokio::test]
    async fn test_events_first_event_is_server_status() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .uri("/events")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let events = read_sse_events(resp.into_body(), 1).await;
        assert!(!events.is_empty(), "expected at least 1 event");
        let json: serde_json::Value = serde_json::from_str(&events[0]).unwrap();
        assert_eq!(json["event"], "server_status");
    }

    #[tokio::test]
    async fn test_events_with_subscribe_sends_ack() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .uri("/events?subscribe=error_update")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let events = read_sse_events(resp.into_body(), 2).await;
        assert!(
            events.len() >= 2,
            "expected at least 2 events, got {}",
            events.len()
        );

        let json: serde_json::Value = serde_json::from_str(&events[1]).unwrap();
        assert_eq!(json["event"], "subscribed");
        assert!(json["data"]["active_filter"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v == "error_update"));
    }

    #[tokio::test]
    async fn test_events_subscribe_unknown_events_reported() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .uri("/events?subscribe=bogus")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let events = read_sse_events(resp.into_body(), 2).await;
        assert!(events.len() >= 2);

        let json: serde_json::Value = serde_json::from_str(&events[1]).unwrap();
        assert_eq!(json["event"], "subscribed");
        assert!(json["data"]["unknown_events"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v == "bogus"));
    }

    #[tokio::test]
    async fn test_events_broadcasts_are_relayed() {
        let (state, _tmp) = make_test_state();
        let hub = state.mcp_event_hub.clone();
        let router = build_bridge_router(state);

        // Use into_service for non-consuming call
        use tower::Service;
        let mut svc = router.into_service();

        let req = Request::builder()
            .uri("/events")
            .body(Body::empty())
            .unwrap();

        let resp = svc.call(req).await.unwrap();
        assert_eq!(resp.status(), 200);

        // Give the stream a moment to start
        tokio::time::sleep(Duration::from_millis(10)).await;

        // Broadcast a file_change event
        hub.broadcast(McpEvent::FileChange {
            timestamp: iso_timestamp(),
            data: mcp_events::FileChangeData {
                path: "src/test.tsx".to_string(),
                kind: "modify".to_string(),
            },
        });

        // Read events: server_status + file_change
        let events = read_sse_events(resp.into_body(), 2).await;

        let has_file_change = events.iter().any(|e| {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(e) {
                json["event"] == "file_change"
            } else {
                false
            }
        });
        assert!(
            has_file_change,
            "expected file_change event in SSE stream, got: {:?}",
            events
        );
    }

    #[tokio::test]
    async fn test_events_filter_drops_non_matching() {
        let (state, _tmp) = make_test_state();
        let hub = state.mcp_event_hub.clone();
        let router = build_bridge_router(state);

        use tower::Service;
        let mut svc = router.into_service();

        // Subscribe only to error_update
        let req = Request::builder()
            .uri("/events?subscribe=error_update")
            .body(Body::empty())
            .unwrap();

        let resp = svc.call(req).await.unwrap();
        assert_eq!(resp.status(), 200);

        tokio::time::sleep(Duration::from_millis(10)).await;

        // Broadcast a file_change event (should be filtered out)
        hub.broadcast(McpEvent::FileChange {
            timestamp: iso_timestamp(),
            data: mcp_events::FileChangeData {
                path: "src/filtered.tsx".to_string(),
                kind: "modify".to_string(),
            },
        });

        // Wait briefly, then read — should only have server_status + subscribed
        tokio::time::sleep(Duration::from_millis(50)).await;
        let events = read_sse_events(resp.into_body(), 2).await;

        let has_file_change = events.iter().any(|e| {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(e) {
                json["event"] == "file_change"
            } else {
                false
            }
        });
        assert!(
            !has_file_change,
            "file_change should have been filtered out, got: {:?}",
            events
        );
    }

    #[tokio::test]
    async fn test_events_empty_subscribe_acts_as_no_filter() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .uri("/events?subscribe=")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        // Should get server_status but NO subscribed ack (empty = no filter)
        let events = read_sse_events(resp.into_body(), 1).await;
        assert!(!events.is_empty());

        let first: serde_json::Value = serde_json::from_str(&events[0]).unwrap();
        assert_eq!(first["event"], "server_status");

        // If there's a second event, it should NOT be a subscribed ack
        let has_subscribed = events.iter().any(|e| {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(e) {
                json["event"] == "subscribed"
            } else {
                false
            }
        });
        assert!(
            !has_subscribed,
            "empty subscribe should not produce subscribed ack, got: {:?}",
            events
        );
    }
}
