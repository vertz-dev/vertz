// ---------------------------------------------------------------------------
// Image optimization proxy for /__vertz_image/ route.
// Resizes, converts (WebP/PNG/JPEG), and caches local images from public/.
// ---------------------------------------------------------------------------

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, Request, StatusCode};
use image::imageops::FilterType;
use image::{DynamicImage, ImageFormat};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use thiserror::Error;

use crate::server::image_cache::{CacheKey, ImageCache};
use crate::server::module_server::DevServerState;

/// Maximum allowed dimension (width or height) in pixels.
pub const MAX_DIMENSION: u32 = 8192;

/// Maximum allowed source file size in bytes (50 MB).
pub const MAX_SOURCE_FILE_SIZE: u64 = 50 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Output format
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    WebP,
    Png,
    Jpeg,
}

impl OutputFormat {
    pub fn content_type(&self) -> &'static str {
        match self {
            Self::WebP => "image/webp",
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
        }
    }

    pub fn extension(&self) -> &'static str {
        match self {
            Self::WebP => "webp",
            Self::Png => "png",
            Self::Jpeg => "jpg",
        }
    }

    /// Parse from query parameter value (e.g., "webp", "png", "jpeg").
    pub fn parse(s: &str) -> Result<Self, ImageProxyError> {
        match s.to_lowercase().as_str() {
            "webp" => Ok(Self::WebP),
            "png" => Ok(Self::Png),
            "jpeg" | "jpg" => Ok(Self::Jpeg),
            other => Err(ImageProxyError::UnsupportedFormat(other.to_string())),
        }
    }

    /// Detect format from file extension (e.g., ".png" → Png).
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().trim_start_matches('.') {
            "webp" => Some(Self::WebP),
            "png" => Some(Self::Png),
            "jpeg" | "jpg" => Some(Self::Jpeg),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Resize fit mode
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ResizeFit {
    #[default]
    Cover,
    Contain,
    Fill,
}

impl ResizeFit {
    /// Parse from query parameter value (e.g., "cover", "contain", "fill").
    pub fn parse(s: &str) -> Result<Self, ImageProxyError> {
        match s.to_lowercase().as_str() {
            "cover" => Ok(Self::Cover),
            "contain" => Ok(Self::Contain),
            "fill" => Ok(Self::Fill),
            other => Err(ImageProxyError::UnsupportedFit(other.to_string())),
        }
    }
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum ImageProxyError {
    #[error("{0}")]
    InvalidParam(String),

    #[error("Image not found: {0}")]
    NotFound(String),

    #[error("Path traversal not allowed")]
    PathTraversal,

    #[error("Unsupported format: {0}. Valid formats: webp, png, jpeg")]
    UnsupportedFormat(String),

    #[error("Unsupported fit value: {0}. Valid values: cover, contain, fill")]
    UnsupportedFit(String),

    #[error("Failed to decode image: {0}")]
    Decode(String),

    #[error("Failed to encode image: {0}")]
    Encode(String),

    #[error("Source file too large ({0} bytes, max {MAX_SOURCE_FILE_SIZE})")]
    FileTooLarge(u64),

    #[error("At least one of w, h, or format must be specified")]
    NothingToDo,
}

impl ImageProxyError {
    pub fn status_code(&self) -> StatusCode {
        match self {
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Decode(_) | Self::Encode(_) => StatusCode::INTERNAL_SERVER_ERROR,
            Self::FileTooLarge(_) => StatusCode::PAYLOAD_TOO_LARGE,
            _ => StatusCode::BAD_REQUEST,
        }
    }
}

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

/// Fully parsed and validated image proxy request.
#[derive(Debug)]
pub struct ImageRequest {
    pub source_path: PathBuf,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub format: Option<OutputFormat>,
    pub quality: u8,
    pub fit: ResizeFit,
}

impl ImageRequest {
    /// Parse from URL path (after stripping `/__vertz_image/` prefix) and query string.
    pub fn parse(path_after_prefix: &str, query: Option<&str>) -> Result<Self, ImageProxyError> {
        // Percent-decode the source path
        let source_path = PathBuf::from(percent_decode(path_after_prefix));

        // Parse query parameters
        let params = parse_query(query.unwrap_or(""));

        let width = parse_dimension(&params, "w", "Width")?;
        let height = parse_dimension(&params, "h", "Height")?;

        let format = match params.get("format") {
            Some(f) => Some(OutputFormat::parse(f)?),
            None => None,
        };

        let quality = match params.get("q") {
            Some(q_str) => {
                let q: u8 = q_str.parse().map_err(|_| {
                    ImageProxyError::InvalidParam("Quality must be between 1 and 100".to_string())
                })?;
                if q == 0 || q > 100 {
                    return Err(ImageProxyError::InvalidParam(
                        "Quality must be between 1 and 100".to_string(),
                    ));
                }
                q
            }
            None => 80,
        };

        let fit = match params.get("fit") {
            Some(f) => ResizeFit::parse(f)?,
            None => ResizeFit::default(),
        };

        // At least one of w, h, or format must be present
        if width.is_none() && height.is_none() && format.is_none() {
            return Err(ImageProxyError::NothingToDo);
        }

        Ok(ImageRequest {
            source_path,
            width,
            height,
            format,
            quality,
            fit,
        })
    }
}

/// Parse a dimension parameter (w or h), validating range 1..=MAX_DIMENSION.
fn parse_dimension(
    params: &QueryParams,
    key: &str,
    name: &str,
) -> Result<Option<u32>, ImageProxyError> {
    match params.get(key) {
        Some(val) => {
            let v: u32 = val.parse().map_err(|_| {
                ImageProxyError::InvalidParam(format!(
                    "{} must be between 1 and {}",
                    name, MAX_DIMENSION
                ))
            })?;
            if v == 0 || v > MAX_DIMENSION {
                return Err(ImageProxyError::InvalidParam(format!(
                    "{} must be between 1 and {}",
                    name, MAX_DIMENSION
                )));
            }
            Ok(Some(v))
        }
        None => Ok(None),
    }
}

// ---------------------------------------------------------------------------
// Query string parsing (simple, no external crate needed)
// ---------------------------------------------------------------------------

type QueryParams = std::collections::HashMap<String, String>;

fn parse_query(query: &str) -> QueryParams {
    let mut params = QueryParams::new();
    for pair in query.split('&') {
        if let Some((key, value)) = pair.split_once('=') {
            if !key.is_empty() {
                params.insert(key.to_string(), value.to_string());
            }
        }
    }
    params
}

/// Simple percent-decoding for URL path segments.
/// Accumulates decoded bytes and performs a final UTF-8 conversion,
/// correctly handling multi-byte sequences like `%C3%A9` → `é`.
fn percent_decode(input: &str) -> String {
    let mut bytes_out = Vec::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                bytes_out.push(byte);
                i += 3;
                continue;
            }
        }
        bytes_out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(bytes_out)
        .unwrap_or_else(|_| String::from_utf8_lossy(input.as_bytes()).into_owned())
}

// ---------------------------------------------------------------------------
// Image processing
// ---------------------------------------------------------------------------

/// Process an image: decode → resize → encode.
///
/// Runs synchronously — caller wraps in `spawn_blocking`.
pub fn process_image(
    source_bytes: &[u8],
    width: Option<u32>,
    height: Option<u32>,
    format: OutputFormat,
    quality: u8,
    fit: ResizeFit,
) -> Result<Vec<u8>, ImageProxyError> {
    let img = image::load_from_memory(source_bytes)
        .map_err(|e| ImageProxyError::Decode(e.to_string()))?;

    let resized = resize_image(img, width, height, fit);

    encode_image(&resized, format, quality)
}

fn resize_image(
    img: DynamicImage,
    width: Option<u32>,
    height: Option<u32>,
    fit: ResizeFit,
) -> DynamicImage {
    match (width, height) {
        (Some(w), Some(h)) => match fit {
            ResizeFit::Cover => img.resize_to_fill(w, h, FilterType::Lanczos3),
            ResizeFit::Contain => img.resize(w, h, FilterType::Lanczos3),
            ResizeFit::Fill => img.resize_exact(w, h, FilterType::Lanczos3),
        },
        (Some(w), None) => img.resize(w, u32::MAX, FilterType::Lanczos3),
        (None, Some(h)) => img.resize(u32::MAX, h, FilterType::Lanczos3),
        (None, None) => img,
    }
}

fn encode_image(
    img: &DynamicImage,
    format: OutputFormat,
    quality: u8,
) -> Result<Vec<u8>, ImageProxyError> {
    let mut buf = Cursor::new(Vec::new());

    match format {
        OutputFormat::Png => {
            img.write_to(&mut buf, ImageFormat::Png)
                .map_err(|e| ImageProxyError::Encode(e.to_string()))?;
        }
        OutputFormat::WebP => {
            // The `image` crate's built-in WebP encoder is lossless-only (no quality control).
            // The `quality` param is accepted but not applied for WebP.
            // Lossy WebP encoding would require the `webp` crate (libwebp bindings).
            img.write_to(&mut buf, ImageFormat::WebP)
                .map_err(|e| ImageProxyError::Encode(e.to_string()))?;
        }
        OutputFormat::Jpeg => {
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
            img.write_with_encoder(encoder)
                .map_err(|e| ImageProxyError::Encode(e.to_string()))?;
        }
    }

    Ok(buf.into_inner())
}

// ---------------------------------------------------------------------------
// Path traversal validation
// ---------------------------------------------------------------------------

/// Validate that the resolved path is within `public_dir` (prevent path traversal).
pub fn validate_path(public_dir: &Path, source_path: &Path) -> Result<PathBuf, ImageProxyError> {
    let resolved = public_dir
        .join(source_path)
        .canonicalize()
        .map_err(|_| ImageProxyError::NotFound(source_path.display().to_string()))?;
    let canonical_public = public_dir
        .canonicalize()
        .map_err(|_| ImageProxyError::NotFound("public directory".into()))?;
    if !resolved.starts_with(&canonical_public) {
        return Err(ImageProxyError::PathTraversal);
    }
    Ok(resolved)
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

/// Build a JSON error response.
fn json_error(error: &ImageProxyError) -> axum::response::Response<Body> {
    let status = error.status_code();
    let body = serde_json::json!({
        "error": error.to_string(),
        "status": status.as_u16(),
    });
    axum::response::Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
        .body(Body::from(body.to_string()))
        .unwrap()
}

/// Main axum handler for `/__vertz_image/*` requests.
///
/// Called from `dev_server_handler` — receives the already-extracted State and Request.
pub async fn handle_image_request(
    State(state): State<Arc<DevServerState>>,
    req: Request<Body>,
) -> axum::response::Response<Body> {
    let path = req.uri().path().to_string();
    let query = req.uri().query().map(|q| q.to_string());

    let path_after_prefix = path
        .strip_prefix("/__vertz_image/")
        .unwrap_or(path.trim_start_matches('/'));

    // 1. Parse request
    let img_req = match ImageRequest::parse(path_after_prefix, query.as_deref()) {
        Ok(r) => r,
        Err(e) => return json_error(&e),
    };

    // 2. Validate path (traversal check)
    let public_dir = state.root_dir.join("public");
    let resolved_path = match validate_path(&public_dir, &img_req.source_path) {
        Ok(p) => p,
        Err(e) => return json_error(&e),
    };

    // 3. Read source file metadata and bytes
    let metadata = match std::fs::metadata(&resolved_path) {
        Ok(m) => m,
        Err(_) => {
            return json_error(&ImageProxyError::NotFound(
                img_req.source_path.display().to_string(),
            ))
        }
    };
    let file_size = metadata.len();
    if file_size > MAX_SOURCE_FILE_SIZE {
        return json_error(&ImageProxyError::FileTooLarge(file_size));
    }
    let source_mtime = metadata
        .modified()
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
    let source_bytes = match std::fs::read(&resolved_path) {
        Ok(b) => b,
        Err(_) => {
            return json_error(&ImageProxyError::NotFound(
                img_req.source_path.display().to_string(),
            ))
        }
    };

    // 4. Determine output format
    let output_format = img_req.format.unwrap_or_else(|| {
        let ext = resolved_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        OutputFormat::from_extension(ext).unwrap_or(OutputFormat::Png)
    });

    // 5. Compute cache key
    let images_dir = state.root_dir.join(".vertz").join("images");
    let cache = ImageCache::new(images_dir);

    let fit_str = match img_req.fit {
        ResizeFit::Cover => "cover",
        ResizeFit::Contain => "contain",
        ResizeFit::Fill => "fill",
    };

    let cache_key = CacheKey::compute(
        &img_req.source_path,
        source_mtime,
        img_req.width,
        img_req.height,
        output_format.extension(),
        img_req.quality,
        fit_str,
    );

    // 6. Check disk cache
    if let Some(cached_bytes) = cache.get(&cache_key) {
        return axum::response::Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, output_format.content_type())
            .header(header::CACHE_CONTROL, "no-cache")
            .header("X-Vertz-Image-Cache", "hit")
            .body(Body::from(cached_bytes))
            .unwrap();
    }

    // 7. Process image (CPU-bound — spawn_blocking)
    let width = img_req.width;
    let height = img_req.height;
    let quality = img_req.quality;
    let fit = img_req.fit;

    let processed_bytes = match tokio::task::spawn_blocking(move || {
        process_image(&source_bytes, width, height, output_format, quality, fit)
    })
    .await
    {
        Ok(Ok(bytes)) => bytes,
        Ok(Err(e)) => return json_error(&e),
        Err(e) => return json_error(&ImageProxyError::Encode(e.to_string())),
    };

    // 8. Write to disk cache (best-effort)
    let _ = cache.put(&cache_key, &processed_bytes);

    // 9. Return response
    axum::response::Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, output_format.content_type())
        .header(header::CACHE_CONTROL, "no-cache")
        .header("X-Vertz-Image-Cache", "miss")
        .body(Body::from(processed_bytes))
        .unwrap()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- OutputFormat tests ---

    #[test]
    fn output_format_parse_webp() {
        assert_eq!(OutputFormat::parse("webp").unwrap(), OutputFormat::WebP);
    }

    #[test]
    fn output_format_parse_png() {
        assert_eq!(OutputFormat::parse("png").unwrap(), OutputFormat::Png);
    }

    #[test]
    fn output_format_parse_jpeg() {
        assert_eq!(OutputFormat::parse("jpeg").unwrap(), OutputFormat::Jpeg);
    }

    #[test]
    fn output_format_parse_jpg() {
        assert_eq!(OutputFormat::parse("jpg").unwrap(), OutputFormat::Jpeg);
    }

    #[test]
    fn output_format_parse_case_insensitive() {
        assert_eq!(OutputFormat::parse("WebP").unwrap(), OutputFormat::WebP);
        assert_eq!(OutputFormat::parse("PNG").unwrap(), OutputFormat::Png);
    }

    #[test]
    fn output_format_parse_unsupported() {
        let err = OutputFormat::parse("bmp").unwrap_err();
        assert!(matches!(err, ImageProxyError::UnsupportedFormat(_)));
        assert_eq!(
            err.to_string(),
            "Unsupported format: bmp. Valid formats: webp, png, jpeg"
        );
    }

    #[test]
    fn output_format_content_type() {
        assert_eq!(OutputFormat::WebP.content_type(), "image/webp");
        assert_eq!(OutputFormat::Png.content_type(), "image/png");
        assert_eq!(OutputFormat::Jpeg.content_type(), "image/jpeg");
    }

    #[test]
    fn output_format_extension() {
        assert_eq!(OutputFormat::WebP.extension(), "webp");
        assert_eq!(OutputFormat::Png.extension(), "png");
        assert_eq!(OutputFormat::Jpeg.extension(), "jpg");
    }

    #[test]
    fn output_format_from_extension_known() {
        assert_eq!(
            OutputFormat::from_extension(".png"),
            Some(OutputFormat::Png)
        );
        assert_eq!(
            OutputFormat::from_extension(".jpg"),
            Some(OutputFormat::Jpeg)
        );
        assert_eq!(
            OutputFormat::from_extension(".jpeg"),
            Some(OutputFormat::Jpeg)
        );
        assert_eq!(
            OutputFormat::from_extension(".webp"),
            Some(OutputFormat::WebP)
        );
        assert_eq!(OutputFormat::from_extension("png"), Some(OutputFormat::Png));
    }

    #[test]
    fn output_format_from_extension_unknown() {
        assert_eq!(OutputFormat::from_extension(".svg"), None);
        assert_eq!(OutputFormat::from_extension(".gif"), None);
        assert_eq!(OutputFormat::from_extension(".bmp"), None);
    }

    // --- ResizeFit tests ---

    #[test]
    fn resize_fit_parse_cover() {
        assert_eq!(ResizeFit::parse("cover").unwrap(), ResizeFit::Cover);
    }

    #[test]
    fn resize_fit_parse_contain() {
        assert_eq!(ResizeFit::parse("contain").unwrap(), ResizeFit::Contain);
    }

    #[test]
    fn resize_fit_parse_fill() {
        assert_eq!(ResizeFit::parse("fill").unwrap(), ResizeFit::Fill);
    }

    #[test]
    fn resize_fit_parse_case_insensitive() {
        assert_eq!(ResizeFit::parse("Cover").unwrap(), ResizeFit::Cover);
        assert_eq!(ResizeFit::parse("FILL").unwrap(), ResizeFit::Fill);
    }

    #[test]
    fn resize_fit_parse_unsupported() {
        let err = ResizeFit::parse("crop").unwrap_err();
        assert!(matches!(err, ImageProxyError::UnsupportedFit(_)));
        assert_eq!(
            err.to_string(),
            "Unsupported fit value: crop. Valid values: cover, contain, fill"
        );
    }

    #[test]
    fn resize_fit_default_is_cover() {
        assert_eq!(ResizeFit::default(), ResizeFit::Cover);
    }

    // --- ImageProxyError tests ---

    #[test]
    fn error_status_code_bad_request() {
        assert_eq!(
            ImageProxyError::InvalidParam("test".into()).status_code(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            ImageProxyError::UnsupportedFormat("bmp".into()).status_code(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            ImageProxyError::UnsupportedFit("crop".into()).status_code(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            ImageProxyError::PathTraversal.status_code(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            ImageProxyError::NothingToDo.status_code(),
            StatusCode::BAD_REQUEST
        );
    }

    #[test]
    fn error_status_code_not_found() {
        assert_eq!(
            ImageProxyError::NotFound("hero.png".into()).status_code(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn error_status_code_internal() {
        assert_eq!(
            ImageProxyError::Decode("bad bytes".into()).status_code(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
        assert_eq!(
            ImageProxyError::Encode("failed".into()).status_code(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
    }

    #[test]
    fn error_status_code_payload_too_large() {
        assert_eq!(
            ImageProxyError::FileTooLarge(100_000_000).status_code(),
            StatusCode::PAYLOAD_TOO_LARGE
        );
    }

    // --- ImageRequest::parse tests ---

    #[test]
    fn parse_full_params() {
        let req = ImageRequest::parse("hero.png", Some("w=800&h=600&format=webp&q=75&fit=contain"))
            .unwrap();
        assert_eq!(req.source_path, PathBuf::from("hero.png"));
        assert_eq!(req.width, Some(800));
        assert_eq!(req.height, Some(600));
        assert_eq!(req.format, Some(OutputFormat::WebP));
        assert_eq!(req.quality, 75);
        assert_eq!(req.fit, ResizeFit::Contain);
    }

    #[test]
    fn parse_height_only() {
        let req = ImageRequest::parse("hero.png", Some("h=300")).unwrap();
        assert_eq!(req.width, None);
        assert_eq!(req.height, Some(300));
        assert_eq!(req.format, None);
        assert_eq!(req.quality, 80);
        assert_eq!(req.fit, ResizeFit::Cover);
    }

    #[test]
    fn parse_width_only() {
        let req = ImageRequest::parse("hero.png", Some("w=400")).unwrap();
        assert_eq!(req.width, Some(400));
        assert_eq!(req.height, None);
        assert_eq!(req.format, None);
        assert_eq!(req.quality, 80);
        assert_eq!(req.fit, ResizeFit::Cover);
    }

    #[test]
    fn parse_format_only() {
        let req = ImageRequest::parse("hero.png", Some("format=webp")).unwrap();
        assert_eq!(req.width, None);
        assert_eq!(req.height, None);
        assert_eq!(req.format, Some(OutputFormat::WebP));
    }

    #[test]
    fn parse_nested_path() {
        let req = ImageRequest::parse("photos/team.jpg", Some("w=400&q=60&fit=contain")).unwrap();
        assert_eq!(req.source_path, PathBuf::from("photos/team.jpg"));
        assert_eq!(req.width, Some(400));
        assert_eq!(req.quality, 60);
        assert_eq!(req.fit, ResizeFit::Contain);
    }

    #[test]
    fn parse_percent_encoded_path() {
        let req = ImageRequest::parse("path%20with%20spaces.png", Some("w=400")).unwrap();
        assert_eq!(req.source_path, PathBuf::from("path with spaces.png"));
    }

    #[test]
    fn parse_no_query_returns_nothing_to_do() {
        let err = ImageRequest::parse("hero.png", None).unwrap_err();
        assert!(matches!(err, ImageProxyError::NothingToDo));
    }

    #[test]
    fn parse_empty_query_returns_nothing_to_do() {
        let err = ImageRequest::parse("hero.png", Some("")).unwrap_err();
        assert!(matches!(err, ImageProxyError::NothingToDo));
    }

    #[test]
    fn parse_width_zero() {
        let err = ImageRequest::parse("hero.png", Some("w=0")).unwrap_err();
        assert!(matches!(err, ImageProxyError::InvalidParam(_)));
        assert!(err.to_string().contains("Width must be between 1 and 8192"));
    }

    #[test]
    fn parse_width_exceeds_max() {
        let err = ImageRequest::parse("hero.png", Some("w=10000")).unwrap_err();
        assert!(matches!(err, ImageProxyError::InvalidParam(_)));
        assert!(err.to_string().contains("Width must be between 1 and 8192"));
    }

    #[test]
    fn parse_height_zero() {
        let err = ImageRequest::parse("hero.png", Some("h=0")).unwrap_err();
        assert!(matches!(err, ImageProxyError::InvalidParam(_)));
        assert!(err
            .to_string()
            .contains("Height must be between 1 and 8192"));
    }

    #[test]
    fn parse_quality_zero() {
        let err = ImageRequest::parse("hero.png", Some("w=800&q=0")).unwrap_err();
        assert!(matches!(err, ImageProxyError::InvalidParam(_)));
        assert!(err
            .to_string()
            .contains("Quality must be between 1 and 100"));
    }

    #[test]
    fn parse_quality_over_100() {
        let err = ImageRequest::parse("hero.png", Some("w=800&q=150")).unwrap_err();
        assert!(matches!(err, ImageProxyError::InvalidParam(_)));
        assert!(err
            .to_string()
            .contains("Quality must be between 1 and 100"));
    }

    #[test]
    fn parse_unsupported_format() {
        let err = ImageRequest::parse("hero.png", Some("w=800&format=bmp")).unwrap_err();
        assert!(matches!(err, ImageProxyError::UnsupportedFormat(_)));
    }

    #[test]
    fn parse_unsupported_fit() {
        let err = ImageRequest::parse("hero.png", Some("w=800&fit=crop")).unwrap_err();
        assert!(matches!(err, ImageProxyError::UnsupportedFit(_)));
    }

    #[test]
    fn parse_width_at_max_dimension() {
        let req = ImageRequest::parse("hero.png", Some("w=8192")).unwrap();
        assert_eq!(req.width, Some(8192));
    }

    #[test]
    fn parse_width_non_numeric() {
        let err = ImageRequest::parse("hero.png", Some("w=abc")).unwrap_err();
        assert!(matches!(err, ImageProxyError::InvalidParam(_)));
    }

    // --- percent_decode tests ---

    #[test]
    fn percent_decode_basic() {
        assert_eq!(percent_decode("hello%20world"), "hello world");
    }

    #[test]
    fn percent_decode_no_encoding() {
        assert_eq!(percent_decode("hello.png"), "hello.png");
    }

    #[test]
    fn percent_decode_multiple() {
        assert_eq!(
            percent_decode("path%20with%20spaces%2Fslash"),
            "path with spaces/slash"
        );
    }

    #[test]
    fn percent_decode_multibyte_utf8() {
        // %C3%A9 is the UTF-8 encoding of 'é' (U+00E9)
        assert_eq!(percent_decode("caf%C3%A9.png"), "café.png");
    }

    // --- parse_query tests ---

    #[test]
    fn parse_query_basic() {
        let params = parse_query("w=800&h=600");
        assert_eq!(params.get("w").unwrap(), "800");
        assert_eq!(params.get("h").unwrap(), "600");
    }

    #[test]
    fn parse_query_empty() {
        let params = parse_query("");
        assert!(params.is_empty());
    }

    #[test]
    fn parse_query_single() {
        let params = parse_query("w=400");
        assert_eq!(params.get("w").unwrap(), "400");
        assert_eq!(params.len(), 1);
    }

    // --- Helper: create a test PNG image ---

    fn create_test_png(width: u32, height: u32) -> Vec<u8> {
        let img = DynamicImage::new_rgba8(width, height);
        let mut buf = Cursor::new(Vec::new());
        img.write_to(&mut buf, ImageFormat::Png).unwrap();
        buf.into_inner()
    }

    // --- process_image tests ---

    #[test]
    fn process_image_resize_width_only() {
        let png = create_test_png(200, 100);
        let result = process_image(
            &png,
            Some(100),
            None,
            OutputFormat::Png,
            80,
            ResizeFit::Cover,
        )
        .unwrap();
        let decoded = image::load_from_memory(&result).unwrap();
        assert_eq!(decoded.width(), 100);
        assert_eq!(decoded.height(), 50); // aspect ratio preserved
    }

    #[test]
    fn process_image_resize_height_only() {
        let png = create_test_png(200, 100);
        let result = process_image(
            &png,
            None,
            Some(50),
            OutputFormat::Png,
            80,
            ResizeFit::Cover,
        )
        .unwrap();
        let decoded = image::load_from_memory(&result).unwrap();
        assert_eq!(decoded.height(), 50);
        assert_eq!(decoded.width(), 100); // aspect ratio preserved
    }

    #[test]
    fn process_image_resize_both_cover() {
        let png = create_test_png(200, 100);
        let result = process_image(
            &png,
            Some(80),
            Some(80),
            OutputFormat::Png,
            80,
            ResizeFit::Cover,
        )
        .unwrap();
        let decoded = image::load_from_memory(&result).unwrap();
        assert_eq!(decoded.width(), 80);
        assert_eq!(decoded.height(), 80);
    }

    #[test]
    fn process_image_resize_both_contain() {
        let png = create_test_png(200, 100);
        let result = process_image(
            &png,
            Some(80),
            Some(80),
            OutputFormat::Png,
            80,
            ResizeFit::Contain,
        )
        .unwrap();
        let decoded = image::load_from_memory(&result).unwrap();
        // Contain: fits within 80x80, so width=80, height=40
        assert_eq!(decoded.width(), 80);
        assert!(decoded.height() <= 80);
    }

    #[test]
    fn process_image_resize_both_fill() {
        let png = create_test_png(200, 100);
        let result = process_image(
            &png,
            Some(80),
            Some(60),
            OutputFormat::Png,
            80,
            ResizeFit::Fill,
        )
        .unwrap();
        let decoded = image::load_from_memory(&result).unwrap();
        assert_eq!(decoded.width(), 80);
        assert_eq!(decoded.height(), 60);
    }

    #[test]
    fn process_image_format_only_no_resize() {
        let png = create_test_png(100, 100);
        let result =
            process_image(&png, None, None, OutputFormat::WebP, 80, ResizeFit::Cover).unwrap();
        let decoded = image::load_from_memory(&result).unwrap();
        assert_eq!(decoded.width(), 100);
        assert_eq!(decoded.height(), 100);
    }

    #[test]
    fn process_image_to_webp() {
        let png = create_test_png(100, 100);
        let result = process_image(
            &png,
            Some(50),
            None,
            OutputFormat::WebP,
            80,
            ResizeFit::Cover,
        )
        .unwrap();
        // Verify it's valid WebP by decoding
        let decoded = image::load_from_memory(&result).unwrap();
        assert_eq!(decoded.width(), 50);
    }

    #[test]
    fn process_image_to_jpeg() {
        let png = create_test_png(100, 100);
        let result = process_image(
            &png,
            Some(50),
            None,
            OutputFormat::Jpeg,
            60,
            ResizeFit::Cover,
        )
        .unwrap();
        let decoded = image::load_from_memory(&result).unwrap();
        assert_eq!(decoded.width(), 50);
    }

    #[test]
    fn process_image_invalid_bytes() {
        let result = process_image(
            b"not an image",
            Some(100),
            None,
            OutputFormat::Png,
            80,
            ResizeFit::Cover,
        );
        assert!(matches!(result, Err(ImageProxyError::Decode(_))));
    }

    // --- validate_path tests ---

    #[test]
    fn validate_path_valid_file() {
        let dir = tempfile::tempdir().unwrap();
        let public_dir = dir.path().join("public");
        std::fs::create_dir_all(&public_dir).unwrap();
        std::fs::write(public_dir.join("hero.png"), b"fake").unwrap();

        let result = validate_path(&public_dir, Path::new("hero.png"));
        assert!(result.is_ok());
    }

    #[test]
    fn validate_path_traversal_parent() {
        let dir = tempfile::tempdir().unwrap();
        let public_dir = dir.path().join("public");
        std::fs::create_dir_all(&public_dir).unwrap();
        // Create a file outside public
        std::fs::write(dir.path().join("secret.txt"), b"secret").unwrap();

        let result = validate_path(&public_dir, Path::new("../secret.txt"));
        assert!(matches!(result, Err(ImageProxyError::PathTraversal)));
    }

    #[test]
    fn validate_path_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let public_dir = dir.path().join("public");
        std::fs::create_dir_all(&public_dir).unwrap();

        let result = validate_path(&public_dir, Path::new("nonexistent.png"));
        assert!(matches!(result, Err(ImageProxyError::NotFound(_))));
    }

    #[test]
    fn validate_path_nested_file() {
        let dir = tempfile::tempdir().unwrap();
        let public_dir = dir.path().join("public");
        let photos_dir = public_dir.join("photos");
        std::fs::create_dir_all(&photos_dir).unwrap();
        std::fs::write(photos_dir.join("team.jpg"), b"fake").unwrap();

        let result = validate_path(&public_dir, Path::new("photos/team.jpg"));
        assert!(result.is_ok());
    }
}
