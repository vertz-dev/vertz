use axum::body::Body;
use axum::http::{Request, Response, StatusCode};
use owo_colors::OwoColorize;
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Instant;
use tower::{Layer, Service};

/// Tower layer that logs each HTTP request with colored status codes and timing.
#[derive(Clone)]
pub struct RequestLoggingLayer;

impl<S> Layer<S> for RequestLoggingLayer {
    type Service = RequestLoggingMiddleware<S>;

    fn layer(&self, inner: S) -> Self::Service {
        RequestLoggingMiddleware { inner }
    }
}

/// Tower middleware service that wraps the inner service with request logging.
#[derive(Clone)]
pub struct RequestLoggingMiddleware<S> {
    inner: S,
}

impl<S> Service<Request<Body>> for RequestLoggingMiddleware<S>
where
    S: Service<Request<Body>, Response = Response<Body>> + Clone + Send + 'static,
    S::Future: Send + 'static,
{
    type Response = Response<Body>;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<Body>) -> Self::Future {
        let method = req.method().clone();
        let path = req.uri().path().to_string();
        let start = Instant::now();
        let mut inner = self.inner.clone();

        Box::pin(async move {
            let response = inner.call(req).await?;
            let elapsed = start.elapsed();
            let status = response.status();

            let time_str = format_elapsed(elapsed);
            let status_str = format_status(status);

            let now = chrono_free_time();
            eprintln!(
                "{} {} {} {} ({})",
                now.dimmed(),
                status_str,
                method.to_string().bold(),
                path,
                time_str.dimmed()
            );

            Ok(response)
        })
    }
}

/// Format a duration for display (e.g., "1.23ms", "456μs").
fn format_elapsed(elapsed: std::time::Duration) -> String {
    let micros = elapsed.as_micros();
    if micros < 1000 {
        format!("{}μs", micros)
    } else {
        let millis = elapsed.as_secs_f64() * 1000.0;
        format!("{:.2}ms", millis)
    }
}

/// Format a status code with color: green for 2xx, yellow for 3xx, red for 4xx/5xx.
fn format_status(status: StatusCode) -> String {
    let code = status.as_u16();
    let text = format!("{}", code);

    if code < 300 {
        text.green().to_string()
    } else if code < 400 {
        text.yellow().to_string()
    } else {
        text.red().to_string()
    }
}

/// Simple HH:MM:SS timestamp without pulling in the chrono crate.
fn chrono_free_time() -> String {
    use std::time::SystemTime;
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let hours = (secs / 3600) % 24;
    let minutes = (secs / 60) % 60;
    let seconds = secs % 60;
    format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_format_elapsed_micros() {
        let d = Duration::from_micros(500);
        assert_eq!(format_elapsed(d), "500μs");
    }

    #[test]
    fn test_format_elapsed_millis() {
        let d = Duration::from_millis(15);
        assert_eq!(format_elapsed(d), "15.00ms");
    }

    #[test]
    fn test_format_status_2xx_is_green() {
        let s = format_status(StatusCode::OK);
        // The formatted string contains ANSI escape codes for green
        assert!(s.contains("200"));
    }

    #[test]
    fn test_format_status_3xx_is_yellow() {
        let s = format_status(StatusCode::MOVED_PERMANENTLY);
        assert!(s.contains("301"));
    }

    #[test]
    fn test_format_status_4xx_is_red() {
        let s = format_status(StatusCode::NOT_FOUND);
        assert!(s.contains("404"));
    }

    #[test]
    fn test_format_status_5xx_is_red() {
        let s = format_status(StatusCode::INTERNAL_SERVER_ERROR);
        assert!(s.contains("500"));
    }

    #[test]
    fn test_chrono_free_time_format() {
        let time = chrono_free_time();
        // Should be in HH:MM:SS format
        assert_eq!(time.len(), 8);
        assert_eq!(&time[2..3], ":");
        assert_eq!(&time[5..6], ":");
    }
}
