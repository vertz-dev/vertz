use crate::proxy::host::extract_subdomain;
use crate::proxy::routes::{self, RouteEntry};
use axum::body::Body;
use axum::extract::ws::{self, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{header, Request, StatusCode};
use axum::response::Response;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokio::net::TcpListener;
use tokio::sync::RwLock;
use tokio_tungstenite::tungstenite;

/// Header used to detect proxy loops.
const LOOP_DETECT_HEADER: &str = "x-vertz-proxy";

/// Maximum request body size the proxy will buffer (100 MB).
const MAX_BODY_SIZE: usize = 100 * 1024 * 1024;

/// Minimum interval between route reloads from disk (seconds).
const ROUTE_RELOAD_INTERVAL_SECS: u64 = 2;

/// Shared state for the proxy daemon.
#[derive(Debug, Clone)]
pub struct ProxyState {
    route_table: Arc<RwLock<HashMap<String, RouteEntry>>>,
    routes_dir: PathBuf,
    client: reqwest::Client,
    last_reload: Arc<RwLock<Instant>>,
}

impl ProxyState {
    pub fn new(routes_dir: PathBuf) -> Self {
        Self {
            route_table: Arc::new(RwLock::new(HashMap::new())),
            routes_dir,
            client: reqwest::Client::new(),
            last_reload: Arc::new(RwLock::new(Instant::now())),
        }
    }

    /// Reload routes from disk into the in-memory table.
    pub async fn reload_routes(&self) {
        let entries = routes::load_all_routes_in(&self.routes_dir);
        let mut table = self.route_table.write().await;
        table.clear();
        for entry in entries {
            table.insert(entry.subdomain.clone(), entry);
        }
        *self.last_reload.write().await = Instant::now();
    }

    /// Reload routes only if the cache is stale (older than ROUTE_RELOAD_INTERVAL_SECS).
    async fn reload_routes_if_stale(&self) {
        let elapsed = self.last_reload.read().await.elapsed().as_secs();
        if elapsed >= ROUTE_RELOAD_INTERVAL_SECS {
            self.reload_routes().await;
        }
    }

    /// Look up a route by subdomain. Reloads on cache miss.
    pub async fn lookup(&self, subdomain: &str) -> Option<RouteEntry> {
        // Try cached first
        {
            let table = self.route_table.read().await;
            if let Some(entry) = table.get(subdomain) {
                return Some(entry.clone());
            }
        }
        // Cache miss — force reload and retry
        self.reload_routes().await;
        let table = self.route_table.read().await;
        table.get(subdomain).cloned()
    }
}

/// Build the proxy router.
pub fn build_router(state: ProxyState) -> Router {
    Router::new().fallback(proxy_handler).with_state(state)
}

/// Main proxy handler: extract subdomain, look up route, forward request.
async fn proxy_handler(
    ws: Option<WebSocketUpgrade>,
    State(state): State<ProxyState>,
    req: Request<Body>,
) -> Response<Body> {
    // Loop detection: reject requests that already passed through this proxy
    if req.headers().contains_key(LOOP_DETECT_HEADER) {
        return Response::builder()
            .status(StatusCode::LOOP_DETECTED)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(Body::from("Proxy loop detected"))
            .unwrap();
    }

    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let subdomain = match extract_subdomain(host) {
        Some(s) => s,
        None => return dashboard_response(&state, host).await,
    };

    // Periodically refresh the route table from disk
    state.reload_routes_if_stale().await;

    let route = match state.lookup(&subdomain).await {
        Some(r) => r,
        None => {
            return Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .header(header::CONTENT_TYPE, "text/plain")
                .body(Body::from(format!(
                    "No dev server registered for subdomain: {subdomain}"
                )))
                .unwrap();
        }
    };

    // WebSocket upgrade: bridge client ↔ upstream
    if let Some(ws) = ws {
        let path_and_query = req
            .uri()
            .path_and_query()
            .map(|pq| pq.as_str())
            .unwrap_or("/");
        let target_url = format!("ws://127.0.0.1:{}{}", route.port, path_and_query);
        return ws.on_upgrade(move |socket| ws_proxy(socket, target_url));
    }

    forward_request(req, route.port, &state.client).await
}

/// Bridge a client WebSocket to an upstream WebSocket bidirectionally.
async fn ws_proxy(client_ws: WebSocket, target_url: String) {
    let (upstream_ws, _) = match tokio_tungstenite::connect_async(&target_url).await {
        Ok(conn) => conn,
        Err(e) => {
            eprintln!("WebSocket upstream connection failed: {e}");
            return;
        }
    };

    let (mut client_tx, mut client_rx) = client_ws.split();
    let (mut upstream_tx, mut upstream_rx) = upstream_ws.split();

    let client_to_upstream = async {
        while let Some(Ok(msg)) = client_rx.next().await {
            if let Some(tung_msg) = axum_msg_to_tungstenite(msg) {
                if upstream_tx.send(tung_msg).await.is_err() {
                    break;
                }
            }
        }
    };

    let upstream_to_client = async {
        while let Some(Ok(msg)) = upstream_rx.next().await {
            if let Some(axum_msg) = tungstenite_msg_to_axum(msg) {
                if client_tx.send(axum_msg).await.is_err() {
                    break;
                }
            }
        }
    };

    // When one direction ends, send Close to the other side so it shuts down
    // cleanly instead of leaving a half-open connection.
    tokio::select! {
        _ = client_to_upstream => {
            let _ = upstream_tx.send(tungstenite::Message::Close(None)).await;
            let _ = client_tx.send(ws::Message::Close(None)).await;
        },
        _ = upstream_to_client => {
            let _ = client_tx.send(ws::Message::Close(None)).await;
            let _ = upstream_tx.send(tungstenite::Message::Close(None)).await;
        },
    }
}

/// Convert an axum WebSocket message to a tungstenite message.
fn axum_msg_to_tungstenite(msg: ws::Message) -> Option<tungstenite::Message> {
    match msg {
        ws::Message::Text(t) => Some(tungstenite::Message::Text(t)),
        ws::Message::Binary(b) => Some(tungstenite::Message::Binary(b)),
        ws::Message::Ping(b) => Some(tungstenite::Message::Ping(b)),
        ws::Message::Pong(b) => Some(tungstenite::Message::Pong(b)),
        ws::Message::Close(frame) => Some(tungstenite::Message::Close(frame.map(|f| {
            tungstenite::protocol::CloseFrame {
                code: tungstenite::protocol::frame::coding::CloseCode::from(f.code),
                reason: f.reason,
            }
        }))),
    }
}

/// Convert a tungstenite WebSocket message to an axum message.
fn tungstenite_msg_to_axum(msg: tungstenite::Message) -> Option<ws::Message> {
    match msg {
        tungstenite::Message::Text(s) => Some(ws::Message::Text(s)),
        tungstenite::Message::Binary(b) => Some(ws::Message::Binary(b)),
        tungstenite::Message::Ping(b) => Some(ws::Message::Ping(b)),
        tungstenite::Message::Pong(b) => Some(ws::Message::Pong(b)),
        tungstenite::Message::Close(frame) => {
            Some(ws::Message::Close(frame.map(|f| ws::CloseFrame {
                code: f.code.into(),
                reason: f.reason,
            })))
        }
        tungstenite::Message::Frame(_) => None,
    }
}

/// Forward an HTTP request to the target port on localhost.
async fn forward_request(
    req: Request<Body>,
    target_port: u16,
    client: &reqwest::Client,
) -> Response<Body> {
    let (parts, body) = req.into_parts();
    let uri = parts.uri.clone();
    let path_and_query = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("/");
    let target_url = format!("http://127.0.0.1:{target_port}{path_and_query}");

    let method = match parts.method {
        axum::http::Method::GET => reqwest::Method::GET,
        axum::http::Method::POST => reqwest::Method::POST,
        axum::http::Method::PUT => reqwest::Method::PUT,
        axum::http::Method::DELETE => reqwest::Method::DELETE,
        axum::http::Method::PATCH => reqwest::Method::PATCH,
        axum::http::Method::HEAD => reqwest::Method::HEAD,
        axum::http::Method::OPTIONS => reqwest::Method::OPTIONS,
        _ => reqwest::Method::GET,
    };

    // Collect body bytes (bounded to prevent OOM)
    let body_bytes = match axum::body::to_bytes(body, MAX_BODY_SIZE).await {
        Ok(b) => b,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(Body::from(format!("Failed to read request body: {e}")))
                .unwrap();
        }
    };

    // Build forwarded request
    let mut forwarded = client
        .request(method, &target_url)
        .body(body_bytes.to_vec());

    // Forward relevant headers (skip Host — the target gets its own)
    for (name, value) in &parts.headers {
        if name == header::HOST {
            continue;
        }
        if let Ok(v) = value.to_str() {
            forwarded = forwarded.header(name.as_str(), v);
        }
    }

    // Inject loop-detection header so re-entry is caught
    forwarded = forwarded.header(LOOP_DETECT_HEADER, "1");

    match forwarded.send().await {
        Ok(resp) => convert_response(resp).await,
        Err(e) => Response::builder()
            .status(StatusCode::BAD_GATEWAY)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(Body::from(format!("Proxy error: {e}")))
            .unwrap(),
    }
}

/// Convert a reqwest::Response into an axum Response.
async fn convert_response(resp: reqwest::Response) -> Response<Body> {
    let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut builder = Response::builder().status(status);

    for (name, value) in resp.headers() {
        builder = builder.header(name.as_str(), value.as_bytes());
    }

    match resp.bytes().await {
        Ok(bytes) => builder.body(Body::from(bytes)).unwrap(),
        Err(e) => Response::builder()
            .status(StatusCode::BAD_GATEWAY)
            .body(Body::from(format!("Failed to read response body: {e}")))
            .unwrap(),
    }
}

fn dashboard_link_href(subdomain: &str, host: &str) -> String {
    let port = host
        .rsplit_once(':')
        .map(|(_, port)| port)
        .filter(|port| !port.is_empty() && port.chars().all(|c| c.is_ascii_digit()));
    match port {
        Some(port) => format!("//{subdomain}.localhost:{port}"),
        None => format!("//{subdomain}.localhost"),
    }
}

/// Escape HTML special characters to prevent XSS.
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}

/// Dashboard page listing all registered dev servers.
async fn dashboard_response(state: &ProxyState, host: &str) -> Response<Body> {
    state.reload_routes().await;
    let table = state.route_table.read().await;

    if table.is_empty() {
        let html = r#"<!DOCTYPE html>
<html><head><title>Vertz Proxy</title></head>
<body>
<h1>&#9650; Vertz Proxy</h1>
<p>No dev servers registered.</p>
<p>Start a dev server with <code>vtz dev</code> to see it here.</p>
</body></html>"#;
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .body(Body::from(html))
            .unwrap();
    }

    let mut rows = String::new();
    for entry in table.values() {
        let sub = html_escape(&entry.subdomain);
        let branch = html_escape(&entry.branch);
        let href = html_escape(&dashboard_link_href(&entry.subdomain, host));
        rows.push_str(&format!(
            "<tr><td><a href=\"{href}\">{sub}</a></td>\
             <td>{port}</td><td>{branch}</td><td>{pid}</td></tr>",
            port = entry.port,
            pid = entry.pid,
        ));
    }

    let html = format!(
        r#"<!DOCTYPE html>
<html><head><title>Vertz Proxy</title></head>
<body>
<h1>&#9650; Vertz Proxy</h1>
<table>
<tr><th>Subdomain</th><th>Port</th><th>Branch</th><th>PID</th></tr>
{rows}
</table>
</body></html>"#
    );

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .body(Body::from(html))
        .unwrap()
}

/// Start the proxy daemon, returning the actual bound port.
pub async fn start_proxy(
    port: u16,
    routes_dir: PathBuf,
) -> std::io::Result<(u16, tokio::task::JoinHandle<()>)> {
    let state = ProxyState::new(routes_dir);
    state.reload_routes().await;
    let router = build_router(state);

    let addr = format!("127.0.0.1:{port}");
    let listener = TcpListener::bind(&addr).await?;
    let actual_port = listener.local_addr()?.port();

    let handle = tokio::spawn(async move {
        axum::serve(listener, router).await.ok();
    });

    Ok((actual_port, handle))
}

/// Start the proxy daemon with TLS (HTTPS), returning the actual bound port.
pub async fn start_proxy_tls(
    port: u16,
    routes_dir: PathBuf,
    cert_path: PathBuf,
    key_path: PathBuf,
) -> std::io::Result<(u16, tokio::task::JoinHandle<()>)> {
    // Ensure rustls has a crypto provider installed
    rustls::crypto::ring::default_provider()
        .install_default()
        .ok();

    let state = ProxyState::new(routes_dir);
    state.reload_routes().await;
    let router = build_router(state);

    let std_listener = std::net::TcpListener::bind(format!("127.0.0.1:{port}"))?;
    let actual_port = std_listener.local_addr()?.port();
    std_listener.set_nonblocking(true)?;

    let config = axum_server::tls_rustls::RustlsConfig::from_pem_file(&cert_path, &key_path)
        .await
        .map_err(std::io::Error::other)?;

    let server =
        axum_server::from_tcp_rustls(std_listener, config).map_err(std::io::Error::other)?;

    let handle = tokio::spawn(async move {
        server.serve(router.into_make_service()).await.ok();
    });

    Ok((actual_port, handle))
}

/// Write the proxy PID file.
pub fn write_pid_file(proxy_dir: &Path, pid: u32) -> std::io::Result<()> {
    std::fs::create_dir_all(proxy_dir)?;
    std::fs::write(proxy_dir.join("proxy.pid"), pid.to_string())
}

/// Read the proxy PID file.
pub fn read_pid_file(proxy_dir: &Path) -> Option<u32> {
    std::fs::read_to_string(proxy_dir.join("proxy.pid"))
        .ok()
        .and_then(|s| s.trim().parse().ok())
}

/// Remove the proxy PID file.
pub fn remove_pid_file(proxy_dir: &Path) -> std::io::Result<()> {
    let path = proxy_dir.join("proxy.pid");
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}

/// Write the proxy port file so other tools (e.g. dev server banner) can discover it.
pub fn write_port_file(proxy_dir: &Path, port: u16) -> std::io::Result<()> {
    std::fs::create_dir_all(proxy_dir)?;
    std::fs::write(proxy_dir.join("proxy.port"), port.to_string())
}

/// Read the proxy port file.
pub fn read_port_file(proxy_dir: &Path) -> Option<u16> {
    std::fs::read_to_string(proxy_dir.join("proxy.port"))
        .ok()
        .and_then(|s| s.trim().parse().ok())
}

/// Remove the proxy port file.
pub fn remove_port_file(proxy_dir: &Path) -> std::io::Result<()> {
    let path = proxy_dir.join("proxy.port");
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::Method;

    fn test_routes_dir() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let routes = dir.path().join("routes");
        std::fs::create_dir_all(&routes).unwrap();
        dir
    }

    fn test_route_entry(subdomain: &str, port: u16) -> RouteEntry {
        RouteEntry {
            subdomain: subdomain.to_string(),
            port,
            branch: "feat/test".to_string(),
            project: "test-app".to_string(),
            pid: std::process::id(),
            root_dir: PathBuf::from("/tmp/test"),
        }
    }

    #[tokio::test]
    async fn proxy_state_reload_routes_populates_table() {
        let dir = test_routes_dir();
        let routes = dir.path().join("routes");
        let entry = test_route_entry("feat-test.test-app", 3000);
        routes::register_in(&routes, &entry).unwrap();

        let state = ProxyState::new(routes);
        state.reload_routes().await;

        let result = state.lookup("feat-test.test-app").await;
        assert!(result.is_some());
        assert_eq!(result.unwrap().port, 3000);
    }

    #[tokio::test]
    async fn proxy_state_lookup_returns_none_for_unknown() {
        let dir = test_routes_dir();
        let routes = dir.path().join("routes");
        let state = ProxyState::new(routes);
        state.reload_routes().await;

        assert!(state.lookup("nonexistent").await.is_none());
    }

    #[tokio::test]
    async fn proxy_detects_loop_and_returns_508() {
        let dir = test_routes_dir();
        let routes = dir.path().join("routes");
        let entry = test_route_entry("loop-app", 3000);
        routes::register_in(&routes, &entry).unwrap();

        let state = ProxyState::new(routes);

        // Simulate a request that already went through the proxy (has loop header)
        let req = Request::builder()
            .method(Method::GET)
            .uri("/")
            .header(header::HOST, "loop-app.localhost:4000")
            .header(LOOP_DETECT_HEADER, "1")
            .body(Body::empty())
            .unwrap();

        let resp = proxy_handler(None, State(state), req).await;
        assert_eq!(resp.status(), StatusCode::LOOP_DETECTED);
    }

    #[tokio::test]
    async fn proxy_injects_loop_header_on_forwarded_requests() {
        use std::sync::atomic::{AtomicBool, Ordering};

        // Backend that checks for the loop header
        let header_found = Arc::new(AtomicBool::new(false));
        let header_found_clone = header_found.clone();
        let backend = axum::Router::new().route(
            "/check",
            axum::routing::get(move |req: Request<Body>| {
                let found = req.headers().contains_key(LOOP_DETECT_HEADER);
                header_found_clone.store(found, Ordering::SeqCst);
                async { "ok" }
            }),
        );
        let backend_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let backend_port = backend_listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            axum::serve(backend_listener, backend).await.ok();
        });

        let dir = test_routes_dir();
        let routes = dir.path().join("routes");
        let entry = test_route_entry("header-app", backend_port);
        routes::register_in(&routes, &entry).unwrap();

        let (proxy_port, _handle) = start_proxy(0, routes).await.unwrap();

        let client = reqwest::Client::new();
        client
            .get(format!("http://127.0.0.1:{proxy_port}/check"))
            .header("Host", "header-app.localhost")
            .send()
            .await
            .unwrap();

        assert!(
            header_found.load(Ordering::SeqCst),
            "Loop detection header should be injected on forwarded requests"
        );
    }

    #[tokio::test]
    async fn dashboard_shows_no_servers_when_empty() {
        let dir = test_routes_dir();
        let routes = dir.path().join("routes");
        let state = ProxyState::new(routes);

        let resp = dashboard_response(&state, "localhost").await;
        assert_eq!(resp.status(), StatusCode::OK);
        let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let html = String::from_utf8(body.to_vec()).unwrap();
        assert!(html.contains("No dev servers registered"));
    }

    #[tokio::test]
    async fn dashboard_lists_registered_servers() {
        let dir = test_routes_dir();
        let routes = dir.path().join("routes");
        let entry = test_route_entry("feat-test.test-app", 3000);
        routes::register_in(&routes, &entry).unwrap();

        let state = ProxyState::new(routes);
        let resp = dashboard_response(&state, "localhost:4000").await;
        let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let html = String::from_utf8(body.to_vec()).unwrap();
        assert!(html.contains("feat-test.test-app"));
        assert!(html.contains("3000"));
        assert!(html.contains("href=\"//feat-test.test-app.localhost:4000\""));
    }

    #[tokio::test]
    async fn proxy_handler_returns_bad_gateway_for_unknown_subdomain() {
        let dir = test_routes_dir();
        let routes = dir.path().join("routes");
        let state = ProxyState::new(routes);

        let req = Request::builder()
            .method(Method::GET)
            .uri("/")
            .header(header::HOST, "unknown.localhost:4000")
            .body(Body::empty())
            .unwrap();

        let resp = proxy_handler(None, State(state), req).await;
        assert_eq!(resp.status(), StatusCode::BAD_GATEWAY);
    }

    #[tokio::test]
    async fn proxy_handler_returns_dashboard_for_root() {
        let dir = test_routes_dir();
        let routes = dir.path().join("routes");
        let state = ProxyState::new(routes);

        let req = Request::builder()
            .method(Method::GET)
            .uri("/")
            .header(header::HOST, "localhost:4000")
            .body(Body::empty())
            .unwrap();

        let resp = proxy_handler(None, State(state), req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let html = String::from_utf8(body.to_vec()).unwrap();
        assert!(html.contains("Vertz Proxy"));
    }

    // --- PID file tests ---

    #[test]
    fn write_and_read_pid_file() {
        let dir = tempfile::tempdir().unwrap();
        write_pid_file(dir.path(), 12345).unwrap();
        assert_eq!(read_pid_file(dir.path()), Some(12345));
    }

    #[test]
    fn read_pid_file_returns_none_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_pid_file(dir.path()), None);
    }

    #[test]
    fn remove_pid_file_works() {
        let dir = tempfile::tempdir().unwrap();
        write_pid_file(dir.path(), 12345).unwrap();
        remove_pid_file(dir.path()).unwrap();
        assert_eq!(read_pid_file(dir.path()), None);
    }

    #[test]
    fn remove_pid_file_nonexistent_is_ok() {
        let dir = tempfile::tempdir().unwrap();
        assert!(remove_pid_file(dir.path()).is_ok());
    }

    #[test]
    fn write_and_read_port_file() {
        let dir = tempfile::tempdir().unwrap();
        write_port_file(dir.path(), 4000).unwrap();
        assert_eq!(read_port_file(dir.path()), Some(4000));
    }

    #[test]
    fn read_port_file_returns_none_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_port_file(dir.path()), None);
    }

    // --- Integration tests: proxy forwards to real backends ---

    #[tokio::test]
    async fn proxy_forwards_request_over_tls() {
        use crate::proxy::tls;

        // Generate CA + server certs
        let tls_dir = tempfile::tempdir().unwrap();
        tls::generate_ca(tls_dir.path()).unwrap();
        tls::generate_server_cert(tls_dir.path()).unwrap();

        // Backend HTTP server
        let backend =
            axum::Router::new().route("/hello", axum::routing::get(|| async { "Hello over TLS!" }));
        let backend_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let backend_port = backend_listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            axum::serve(backend_listener, backend).await.ok();
        });

        // Register route
        let dir = test_routes_dir();
        let routes_dir = dir.path().join("routes");
        let entry = test_route_entry("tls-app", backend_port);
        routes::register_in(&routes_dir, &entry).unwrap();

        // Start TLS proxy
        let cert_path = tls_dir.path().join("server-cert.pem");
        let key_path = tls_dir.path().join("server-key.pem");
        let (proxy_port, _handle) = start_proxy_tls(0, routes_dir, cert_path, key_path)
            .await
            .unwrap();

        // Build HTTPS client that trusts our CA
        let ca_pem = std::fs::read(tls_dir.path().join("ca-cert.pem")).unwrap();
        let ca_cert = reqwest::Certificate::from_pem(&ca_pem).unwrap();
        let client = reqwest::Client::builder()
            .add_root_certificate(ca_cert)
            .build()
            .unwrap();

        let resp = client
            .get(format!("https://localhost:{proxy_port}/hello"))
            .header("Host", "tls-app.localhost")
            .send()
            .await
            .unwrap();

        assert_eq!(resp.status(), 200);
        assert_eq!(resp.text().await.unwrap(), "Hello over TLS!");
    }

    #[tokio::test]
    async fn proxy_forwards_request_to_backend() {
        // Start a tiny backend server
        let backend = axum::Router::new().route(
            "/hello",
            axum::routing::get(|| async { "Hello from backend!" }),
        );
        let backend_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let backend_port = backend_listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            axum::serve(backend_listener, backend).await.ok();
        });

        // Register the backend as a route
        let dir = test_routes_dir();
        let routes = dir.path().join("routes");
        let entry = test_route_entry("test-app", backend_port);
        routes::register_in(&routes, &entry).unwrap();

        // Start the proxy
        let (proxy_port, _handle) = start_proxy(0, routes).await.unwrap();

        // Send request through proxy
        let client = reqwest::Client::new();
        let resp = client
            .get(format!("http://127.0.0.1:{proxy_port}/hello"))
            .header("Host", "test-app.localhost")
            .send()
            .await
            .unwrap();

        assert_eq!(resp.status(), 200);
        assert_eq!(resp.text().await.unwrap(), "Hello from backend!");
    }

    // --- html_escape tests ---

    #[test]
    fn html_escape_handles_special_chars() {
        assert_eq!(html_escape("<script>"), "&lt;script&gt;");
        assert_eq!(html_escape("a&b"), "a&amp;b");
        assert_eq!(html_escape("\"hello\""), "&quot;hello&quot;");
        assert_eq!(html_escape("it's"), "it&#x27;s");
    }

    #[test]
    fn html_escape_passes_through_safe_strings() {
        assert_eq!(html_escape("feat-auth.my-app"), "feat-auth.my-app");
        assert_eq!(html_escape("fix/bug-123"), "fix/bug-123");
    }

    #[tokio::test]
    async fn proxy_forwards_websocket_to_backend() {
        use axum::extract::ws::{WebSocket, WebSocketUpgrade};
        use futures_util::{SinkExt, StreamExt};

        // Backend WebSocket echo server
        let backend = Router::new().route(
            "/ws-echo",
            axum::routing::get(|ws: WebSocketUpgrade| async {
                ws.on_upgrade(|mut socket: WebSocket| async move {
                    while let Some(Ok(msg)) = socket.recv().await {
                        if matches!(msg, axum::extract::ws::Message::Text(_)) {
                            let _ = socket.send(msg).await;
                        }
                    }
                })
            }),
        );
        let backend_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let backend_port = backend_listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            axum::serve(backend_listener, backend).await.ok();
        });

        // Register route
        let dir = test_routes_dir();
        let routes_dir = dir.path().join("routes");
        let entry = test_route_entry("ws-app", backend_port);
        routes::register_in(&routes_dir, &entry).unwrap();

        // Start proxy
        let (proxy_port, _handle) = start_proxy(0, routes_dir).await.unwrap();

        // Connect WebSocket through proxy with custom Host header
        let key = tokio_tungstenite::tungstenite::handshake::client::generate_key();
        let request = tokio_tungstenite::tungstenite::http::Request::builder()
            .uri(format!("ws://127.0.0.1:{proxy_port}/ws-echo"))
            .header("Host", "ws-app.localhost")
            .header("Connection", "Upgrade")
            .header("Upgrade", "websocket")
            .header("Sec-WebSocket-Version", "13")
            .header("Sec-WebSocket-Key", key)
            .body(())
            .unwrap();

        let (mut ws_stream, _) = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            tokio_tungstenite::connect_async(request),
        )
        .await
        .expect("WebSocket connection timed out")
        .expect("WebSocket handshake through proxy failed");

        // Send a message
        ws_stream
            .send(tokio_tungstenite::tungstenite::Message::Text(
                "hello proxy".into(),
            ))
            .await
            .unwrap();

        // Verify echo
        let response = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            StreamExt::next(&mut ws_stream),
        )
        .await
        .expect("Timed out waiting for echo")
        .unwrap()
        .unwrap();

        assert_eq!(response.into_text().unwrap(), "hello proxy");

        ws_stream.close(None).await.ok();
    }

    // --- WebSocket message conversion tests ---

    #[test]
    fn axum_text_converts_to_tungstenite() {
        let msg = ws::Message::Text("hello".into());
        let result = axum_msg_to_tungstenite(msg).unwrap();
        assert_eq!(result, tungstenite::Message::Text("hello".into()));
    }

    #[test]
    fn axum_binary_converts_to_tungstenite() {
        let msg = ws::Message::Binary(vec![1, 2, 3]);
        let result = axum_msg_to_tungstenite(msg).unwrap();
        assert_eq!(result, tungstenite::Message::Binary(vec![1, 2, 3]));
    }

    #[test]
    fn tungstenite_text_converts_to_axum() {
        let msg = tungstenite::Message::Text("world".into());
        let result = tungstenite_msg_to_axum(msg).unwrap();
        assert!(matches!(result, ws::Message::Text(_)));
    }

    #[test]
    fn tungstenite_binary_converts_to_axum() {
        let msg = tungstenite::Message::Binary(vec![4, 5, 6]);
        let result = tungstenite_msg_to_axum(msg).unwrap();
        assert!(matches!(result, ws::Message::Binary(_)));
    }

    #[test]
    fn tungstenite_frame_returns_none() {
        let msg = tungstenite::Message::Frame(tungstenite::protocol::frame::Frame::ping(vec![]));
        assert!(tungstenite_msg_to_axum(msg).is_none());
    }

    #[tokio::test]
    async fn dashboard_html_escapes_branch_names() {
        let dir = test_routes_dir();
        let routes = dir.path().join("routes");
        let mut entry = test_route_entry("test-app", 3000);
        entry.branch = "<script>alert(1)</script>".to_string();
        routes::register_in(&routes, &entry).unwrap();

        let state = ProxyState::new(routes);
        let resp = dashboard_response(&state, "localhost").await;
        let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let html = String::from_utf8(body.to_vec()).unwrap();
        // The raw <script> tag should NOT appear in the HTML
        assert!(!html.contains("<script>"));
        assert!(html.contains("&lt;script&gt;"));
    }

    #[test]
    fn dashboard_link_href_preserves_proxy_port() {
        assert_eq!(
            dashboard_link_href("feat-auth.my-app", "localhost:8443"),
            "//feat-auth.my-app.localhost:8443"
        );
    }

    #[test]
    fn dashboard_link_href_omits_port_when_not_present() {
        assert_eq!(
            dashboard_link_href("feat-auth.my-app", "localhost"),
            "//feat-auth.my-app.localhost"
        );
    }

    #[test]
    fn dashboard_link_href_ignores_non_numeric_port() {
        assert_eq!(
            dashboard_link_href("feat-auth.my-app", "localhost:notaport"),
            "//feat-auth.my-app.localhost"
        );
    }

    #[test]
    fn dashboard_link_href_handles_empty_host() {
        assert_eq!(
            dashboard_link_href("feat-auth.my-app", ""),
            "//feat-auth.my-app.localhost"
        );
    }
}
