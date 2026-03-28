use crate::banner::print_banner;
use crate::config::ServerConfig;
use crate::server::logging::RequestLoggingLayer;
use axum::Router;
use std::io;
use std::time::Instant;
use tokio::net::TcpListener;
use tower_http::services::ServeDir;

const MAX_PORT_ATTEMPTS: u16 = 10;

/// Bind result containing the listener and the actual port used.
pub struct BindResult {
    pub listener: TcpListener,
    pub port: u16,
}

/// Attempt to bind to the configured port, auto-incrementing on conflict.
///
/// Tries up to `MAX_PORT_ATTEMPTS` ports starting from `config.port`.
/// Returns the listener and the actual port bound to.
pub async fn try_bind(config: &ServerConfig) -> io::Result<BindResult> {
    let mut last_error = None;

    for offset in 0..MAX_PORT_ATTEMPTS {
        let port = config.port + offset;
        let addr = format!("{}:{}", config.host, port);

        match TcpListener::bind(&addr).await {
            Ok(listener) => {
                if offset > 0 {
                    eprintln!("Port {} in use, using {}", config.port + offset - 1, port);
                }
                return Ok(BindResult { listener, port });
            }
            Err(e) if e.kind() == io::ErrorKind::AddrInUse => {
                last_error = Some(e);
                continue;
            }
            Err(e) => return Err(e),
        }
    }

    Err(last_error.unwrap_or_else(|| {
        io::Error::new(
            io::ErrorKind::AddrInUse,
            format!(
                "Could not bind to any port in range {}–{}",
                config.port,
                config.port + MAX_PORT_ATTEMPTS - 1
            ),
        )
    }))
}

/// Build the axum router with static file serving and logging middleware.
pub fn build_router(config: &ServerConfig) -> Router {
    let serve_dir = ServeDir::new(&config.public_dir);

    Router::new()
        .fallback_service(serve_dir)
        .layer(RequestLoggingLayer)
}

/// Start the HTTP server with the given configuration.
///
/// This function binds to the configured port (with auto-increment on conflict),
/// prints the startup banner, and serves until a shutdown signal is received.
pub async fn start_server(config: ServerConfig) -> io::Result<()> {
    let start = Instant::now();

    let bind = try_bind(&config).await?;
    let actual_port = bind.port;

    let mut actual_config = config.clone();
    actual_config.port = actual_port;

    print_banner(&actual_config, start.elapsed());

    let router = build_router(&config);

    axum::serve(bind.listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(io::Error::other)
}

/// Wait for a shutdown signal (SIGINT or SIGTERM).
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install SIGINT handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }

    eprintln!("\nShutting down...");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[tokio::test]
    async fn test_try_bind_succeeds_on_free_port() {
        let config = ServerConfig::new(0, "127.0.0.1".to_string(), PathBuf::from("public"));
        let result = try_bind(&config).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_try_bind_auto_increments_on_busy_port() {
        // Bind a port to make it busy
        let blocker = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let blocked_port = blocker.local_addr().unwrap().port();

        let config = ServerConfig::new(
            blocked_port,
            "127.0.0.1".to_string(),
            PathBuf::from("public"),
        );
        let result = try_bind(&config).await.unwrap();

        // Should have incremented to the next port
        assert!(result.port > blocked_port);
        assert!(result.port <= blocked_port + MAX_PORT_ATTEMPTS);

        // Clean up
        drop(blocker);
    }

    #[test]
    fn test_build_router_returns_router() {
        let config = ServerConfig::new(3000, "localhost".to_string(), PathBuf::from("public"));
        let _router = build_router(&config);
        // If this compiles and runs, the router was created successfully
    }
}
